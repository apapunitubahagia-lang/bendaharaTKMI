/**
 * AllocationGuard.gs - pertahanan lapis kedua (server) untuk alokasi pembayaran.
 * Klien sudah memeriksa; server MEMERIKSA ULANG memakai ObligationEngine (kode kewajiban yang sama) sebelum engine menulis:
 *   - kewajiban (siswa + komponen + periode) harus ADA (tarif/periode/klasifikasi berlaku)
 *   - total alokasi pada satu kewajiban dalam satu permintaan + alokasi aktif yang sudah ada TIDAK boleh melebihi netto
 *   - alokasi diarsipkan tidak dihitung (reversal)
 * Kelebihan bayar TIDAK dialokasikan ke kewajiban: sisa dana tetap di transaksi (status OVERPAYMENT_CREDIT / SEBAGIAN_TERALOKASI) sampai ada kewajiban baru.
 * Replay idempotent (clientRequestId sudah tercatat) dilewati, supaya retry tidak gagal.
 * Pemanggil: opEngineWrite_ (OperationalAPI.gs) untuk CREATE_ALLOCATION dan CREATE_INCOME (allocations[]).
 * Kill switch: ubah OP_ALLOC_GUARD_ENABLED_ menjadi false (jangan dilakukan tanpa alasan).
 * STATUS: diverifikasi di sandbox lokal. BELUM dijalankan di Apps Script sungguhan.
 */
var OP_ALLOC_GUARD_ENABLED_ = true;

function opAllocGuard_(action, p) {
  if (!OP_ALLOC_GUARD_ENABLED_) return null;
  var list;
  if (action === 'CREATE_ALLOCATION') list = [p];
  else if (action === 'CREATE_INCOME' && p && Array.isArray(p.allocations)) list = p.allocations;
  else return null;
  if (!list.length) return null;
  var cid = opStr_(p.clientRequestId);
  if (cid) { var idem = checkIdempotency_(cid); if (idem && idem.status === 'found') return null; }
  try {
    OBL_CTX_ = oblLoadContext_();
    var cache = {}, groups = {}, i, key;
    for (i = 0; i < list.length; i++) {
      var a = list[i] || {};
      var sid = opStr_(a.siswaId), kid = opStr_(a.komponenId), per = opStr_(a.periode);
      if (!sid || !kid) return errResult_('VALIDATION_ERROR', 'allocation[' + i + ']: siswaId dan komponenId wajib', 'allocations');
      if (!per) return errResult_('VALIDATION_ERROR', 'allocation[' + i + ']: periode kewajiban wajib diisi', 'periode');
      key = sid + '|' + kid + '|' + per;
      if (!cache[sid]) cache[sid] = kewajibanForSiswa(sid);
      var ob = cache[sid].filter(function (o) { return o.key === key; })[0];
      if (!ob) return errResult_('OBLIGATION_NOT_FOUND', 'Kewajiban tidak ditemukan untuk ' + key + ' (tarif, periode, atau klasifikasi tidak berlaku)', 'allocations');
      groups[key] = groups[key] || { ob: ob, total: 0 };
      groups[key].total += Number(a.nominal);
    }
    var keys = Object.keys(groups);
    for (i = 0; i < keys.length; i++) {
      var g = groups[keys[i]], sisa = sisaObligation(g.ob);
      if (g.total > sisa + 0.5) return errResult_('ALLOCATION_EXCEEDS_OBLIGATION', 'Total alokasi (' + g.total + ') melebihi sisa kewajiban ' + g.ob.komponenNama + ' ' + g.ob.periode + ' (' + sisa + ')', 'nominal');
    }
    return null;
  } catch (e) {
    return errResult_('COMPUTE_FAILED', 'Gagal memeriksa kewajiban untuk alokasi', null);
  } finally { OBL_CTX_ = null; }
}
