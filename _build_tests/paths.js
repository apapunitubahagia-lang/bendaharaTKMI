// Path relatif repositori (menggantikan path absolut lama C:/Users/HP/OneDrive/Desktop/Bendahara/...).
const path = require('path');
const ROOT = path.resolve(__dirname, '..').split(path.sep).join('/') + '/';
module.exports = {
  OUT: ROOT,
  G: ROOT + 'deps/GAS_Migration/',
  AB: ROOT + 'deps/AUTH_CENTRAL_BUILD/'
};
