'use strict';

const assert = require('assert');

const configPath = require.resolve('../../config/db');
const jsonPath = require.resolve('../../config/db.json');
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseSslCa = process.env.DATABASE_SSL_CA;

const loadConfig = (databaseUrl, databaseSslCa) => {
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
  else delete process.env.DATABASE_URL;
  if (databaseSslCa) process.env.DATABASE_SSL_CA = databaseSslCa;
  else delete process.env.DATABASE_SSL_CA;

  delete require.cache[configPath];
  delete require.cache[jsonPath];
  return require('../../config/db');
};

describe('Database configuration', () => {
  after(() => {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (originalDatabaseSslCa) process.env.DATABASE_SSL_CA = originalDatabaseSslCa;
    else delete process.env.DATABASE_SSL_CA;
    delete require.cache[configPath];
    delete require.cache[jsonPath];
  });

  it('keeps SQLite for local development without DATABASE_URL', () => {
    const config = loadConfig();
    assert.strictEqual(config.development.dialect, 'sqlite');
  });

  it('uses PostgreSQL without TLS for an internal DATABASE_URL', () => {
    const config = loadConfig('postgresql://user:password@example.com:5432/postgres');
    assert.strictEqual(config.development.dialect, 'postgres');
    assert.strictEqual(config.production.dialect, 'postgres');
    assert.strictEqual(config.production.use_env_variable, 'DATABASE_URL');
    assert.strictEqual(config.production.dialectOptions.ssl, undefined);
  });

  it('uses TLS for an external DATABASE_URL that requires it', () => {
    const config = loadConfig('postgresql://user:password@example.com:5432/postgres?sslmode=require');
    assert.strictEqual(config.production.dialectOptions.ssl.require, true);
    assert.strictEqual(config.production.dialectOptions.ssl.rejectUnauthorized, false);
  });

  it('uses a supplied Supabase CA certificate', () => {
    const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
    const config = loadConfig('postgresql://user:password@example.com:5432/postgres', certificate);
    assert.strictEqual(config.production.dialectOptions.ssl.ca, certificate);
    assert.strictEqual(config.production.dialectOptions.ssl.rejectUnauthorized, true);
  });
});
