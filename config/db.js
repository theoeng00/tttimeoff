'use strict';

const config = require('./db.json');

if (process.env.DATABASE_URL) {
  require('../lib/model/pg_sequelize3_compat')(require('pg'));

  const ssl = {
    require: true,
    rejectUnauthorized: true,
  };

  if (process.env.DATABASE_SSL_CA) {
    const ca = process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n').trim();
    if (!ca.startsWith('-----BEGIN CERTIFICATE-----') || !ca.endsWith('-----END CERTIFICATE-----')) {
      throw new Error('DATABASE_SSL_CA must contain a PEM certificate');
    }
    ssl.ca = ca;
  }

  const postgres = {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    dialectOptions: {ssl},
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
