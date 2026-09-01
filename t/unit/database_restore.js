'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const zlib = require('zlib');
const sqlite3 = require('sqlite3');
const {applyPendingRestore, extractBackup, inspectDatabase} = require('../../lib/util/database_restore');
const {closeDatabase, openDatabase} = require('../../lib/util/sqlite_database');

const gzip = util.promisify(zlib.gzip);

const createTimeOffDatabase = filename => new Promise((resolve, reject) => {
  const database = new sqlite3.Database(filename);
  database.exec(`
    CREATE TABLE Companies (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE Users (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE Leaves (id INTEGER PRIMARY KEY, userId INTEGER);
    CREATE TABLE SequelizeMeta (name TEXT);
    INSERT INTO Companies (name) VALUES ('Company');
    INSERT INTO Users (name) VALUES ('Employee');
    INSERT INTO Leaves (userId) VALUES (1);
  `, error => database.close(closeError => {
    if (error || closeError) return reject(error || closeError);
    resolve();
  }));
});

const countUsers = async filename => {
  const database = await openDatabase(filename);
  try {
    return await new Promise((resolve, reject) => database.get(
      'SELECT COUNT(*) AS count FROM Users',
      (error, row) => error ? reject(error) : resolve(row.count)
    ));
  } finally {
    await closeDatabase(database);
  }
};

describe('Database restore', () => {
  let directory;

  beforeEach(async () => {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timeoff-restore-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
  });

  it('extracts and validates a TimeOff backup', async () => {
    const databasePath = path.join(directory, 'backup.sqlite');
    const compressedPath = path.join(directory, 'backup.sqlite.gz');
    const extractedPath = path.join(directory, 'extracted.sqlite');
    await createTimeOffDatabase(databasePath);
    await fs.promises.writeFile(compressedPath, await gzip(await fs.promises.readFile(databasePath)));

    const summary = await extractBackup({source: compressedPath, destination: extractedPath});

    assert.deepStrictEqual(summary, {companies: 1, users: 1, leaves: 1});
  });

  it('rejects a valid SQLite file that is not a TimeOff database', async () => {
    const filename = path.join(directory, 'other.sqlite');
    const database = new sqlite3.Database(filename);
    await new Promise((resolve, reject) => database.run(
      'CREATE TABLE example (value TEXT)',
      error => database.close(closeError => error || closeError ? reject(error || closeError) : resolve())
    ));

    await assert.rejects(() => inspectDatabase(filename), /missing required tables/);
  });

  it('applies a pending restore and preserves the previous database', async () => {
    const currentPath = path.join(directory, 'db.development.sqlite');
    const pendingPath = path.join(directory, 'db.restore.pending.sqlite');
    await createTimeOffDatabase(currentPath);
    await createTimeOffDatabase(pendingPath);

    const pendingDatabase = await openDatabase(pendingPath, sqlite3.OPEN_READWRITE);
    await new Promise((resolve, reject) => pendingDatabase.run(
      "INSERT INTO Users (name) VALUES ('Restored Employee')",
      error => error ? reject(error) : resolve()
    ));
    await closeDatabase(pendingDatabase);

    const result = await applyPendingRestore({projectRoot: directory, environment: 'development'});

    assert.strictEqual(await countUsers(currentPath), 2);
    assert.strictEqual(await countUsers(result.rollbackPath), 1);
    assert.strictEqual(fs.existsSync(pendingPath), false);
  });
});
