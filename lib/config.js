
'use strict';

var fs    = require('fs'),
    nconf = require('nconf');

var local_config_path = __dirname+'/../config/app.local.json',
    crypto_config_path = __dirname+'/../config/crypto.local.json';

nconf.argv();

if (fs.existsSync(local_config_path)) {
  nconf.file('local', { file: local_config_path });
}

if (fs.existsSync(crypto_config_path)) {
  nconf.file('crypto-local', { file: crypto_config_path });
}

nconf
  .file('localisation', { file: __dirname+'/../config/localisation.json' })
  .file({ file: __dirname+'/../config/app.json' });

module.exports = nconf;
