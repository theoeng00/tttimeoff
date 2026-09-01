
'use strict';

var fs    = require('fs'),
    nconf = require('nconf');

var local_config_path = __dirname+'/../config/app.local.json',
    crypto_config_path = __dirname+'/../config/crypto.local.json';

function booleanEnvironmentValue(name) {
  const value = process.env[name];
  if (!/^(?:1|0|true|false|yes|no)$/i.test(value)) throw new Error(`${name} must be true or false`);
  return /^(?:1|true|yes)$/i.test(value);
}

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

if (process.env.CRYPTO_SECRET) {
  nconf.set('crypto_secret', process.env.CRYPTO_SECRET);
}

const applicationDomain = process.env.APPLICATION_DOMAIN || process.env.RENDER_EXTERNAL_URL;
if (applicationDomain) {
  const parsedDomain = new URL(applicationDomain);
  if (!/^https?:$/.test(parsedDomain.protocol) || parsedDomain.username || parsedDomain.password) throw new Error('APPLICATION_DOMAIN must be an HTTP(S) URL without credentials');
  nconf.set('application_domain', applicationDomain.replace(/\/+$/, ''));
}
if (process.env.SEND_EMAILS) nconf.set('send_emails', booleanEnvironmentValue('SEND_EMAILS'));
if (process.env.APPLICATION_SENDER_EMAIL) nconf.set('application_sender_email', process.env.APPLICATION_SENDER_EMAIL);

if (process.env.SMTP_HOST) {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be between 1 and 65535');
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD)) throw new Error('SMTP_USER and SMTP_PASSWORD must be provided together');
  const emailTransporter = {
    host: process.env.SMTP_HOST,
    port: smtpPort,
  };
  if (process.env.SMTP_SECURE) emailTransporter.secure = booleanEnvironmentValue('SMTP_SECURE');
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    emailTransporter.auth = {user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD};
  }
  nconf.set('email_transporter', emailTransporter);
}

if (process.env.NODE_ENV === 'production' && !nconf.get('crypto_secret')) {
  throw new Error('CRYPTO_SECRET is required in production');
}

module.exports = nconf;
