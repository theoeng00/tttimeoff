'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const zlib = require('zlib');
const sqlite3 = require('sqlite3');
const {createBackupPayload, createPostgresBackupPayload, verifyDatabase} = require('../../bin/backup_to_google_drive');

const gunzip = util.promisify(zlib.gunzip);

describe('Google Drive SQLite backup', () => {
  it('creates a compressed, intact snapshot with a matching checksum', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timeoff-backup-test-'));
    const source = path.join(directory, 'source.sqlite');
    const restored = path.join(directory, 'restored.sqlite');
    const database = new sqlite3.Database(source);

    try {
      await new Promise((resolve, reject) => database.run(
        'CREATE TABLE example (value TEXT NOT NULL)',
        error => error ? reject(error) : resolve()
      ));
      await new Promise((resolve, reject) => database.run(
        'INSERT INTO example (value) VALUES (?)',
        ['saved'],
        error => error ? reject(error) : resolve()
      ));
      await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));

      const payload = await createBackupPayload({
        databasePath: source,
        now: new Date('2026-08-27T03:04:05.000Z'),
      });
      const compressed = Buffer.from(payload.data, 'base64');

      assert.strictEqual(payload.filename, 'timeoff-2026-08-27_030405.sqlite.gz');
      assert.strictEqual(payload.sha256, crypto.createHash('sha256').update(compressed).digest('hex'));

      await fs.promises.writeFile(restored, await gunzip(compressed));
      await verifyDatabase(restored);
    } finally {
      await fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
    }
  });
});

describe('Google Drive PostgreSQL backup', () => {
  it('creates a compressed SQL dump with a matching checksum', async () => {
    const sql = '-- PostgreSQL database dump\nCREATE TABLE public.example (value text);\nCOPY public.example (value) FROM stdin;\nsaved\n\\.\n';
    const payload = await createPostgresBackupPayload({
      databaseUrl: 'postgresql://user:password@example.com/postgres',
      certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      now: new Date('2026-08-31T10:20:30.000Z'),
      dump: ({destination}) => fs.promises.writeFile(destination, sql),
    });
    const compressed = Buffer.from(payload.data, 'base64');

    assert.strictEqual(payload.filename, 'timeoff-2026-08-31_102030.sql.gz');
    assert.strictEqual(payload.sha256, crypto.createHash('sha256').update(compressed).digest('hex'));
    assert.strictEqual((await gunzip(compressed)).toString('utf8'), sql);
  });
});
