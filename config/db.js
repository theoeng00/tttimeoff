'use strict';

const config = require('./db.json');

if (process.env.DATABASE_URL) {
  require('../lib/model/pg_sequelize3_compat')(require('pg'));

  let ssl;
  if (process.env.DATABASE_SSL_CA) {
    const ca = process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n').trim();
    if (!ca.startsWith('-----BEGIN CERTIFICATE-----') || !ca.endsWith('-----END CERTIFICATE-----')) {
      throw new Error('DATABASE_SSL_CA must contain a PEM certificate');
    }
    ssl = {require: true, rejectUnauthorized: true, ca};
  } else {
    const sslMode = new URL(process.env.DATABASE_URL).searchParams.get('sslmode');
    if (sslMode && sslMode !== 'disable') ssl = {require: true, rejectUnauthorized: sslMode !== 'require'};
  }

  const postgres = {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    dialectOptions: ssl ? {ssl} : {},
    pool: {
      max: 5,
      min: 0,
      idle: 10000,
    },
  };

  config.development = postgres;
  config.production = postgres;
}

module.exports = config;
