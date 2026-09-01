'use strict';

const fs = require('fs');
const path = require('path');
const stream = require('stream');
const util = require('util');
const zlib = require('zlib');
const {closeDatabase, openDatabase, verifyDatabase} = require('./sqlite_database');

const pipeline = util.promisify(stream.pipeline);
const MAX_COMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_DATABASE_BYTES = 200 * 1024 * 1024;
const REQUIRED_TABLES = ['Companies', 'Leaves', 'SequelizeMeta', 'Users'];

const databasePathForEnvironment = ({projectRoot, environment=process.env.NODE_ENV || 'development'}) => {
  const config = require('../../config/db.js')[environment];

  if (!config || config.dialect !== 'sqlite' || !config.storage) {
    throw new Error(`Database restore supports SQLite only; NODE_ENV is ${environment}`);
  }

  return path.resolve(projectRoot, config.storage);
};

const inspectDatabase = async filename => {
  await verifyDatabase(filename);
  const database = await openDatabase(filename);

  try {
    const tables = await new Promise((resolve, reject) => database.all(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
      (error, rows) => error ? reject(error) : resolve(rows.map(row => row.name))
    ));

    const missing = REQUIRED_TABLES.filter(table => !tables.includes(table));
    if (missing.length) throw new Error(`Backup is missing required tables: ${missing.join(', ')}`);

    const counts = {};
    for (const table of ['Companies', 'Users', 'Leaves']) {
      counts[table] = await new Promise((resolve, reject) => database.get(
        `SELECT COUNT(*) AS count FROM ${table}`,
        (error, row) => error ? reject(error) : resolve(row.count)
      ));
    }

    return {companies: counts.Companies, users: counts.Users, leaves: counts.Leaves};
  } finally {
    await closeDatabase(database);
  }
};

const extractBackup = async ({source, destination}) => {
  const sourceStat = await fs.promises.stat(source);
  if (sourceStat.size === 0) throw new Error('Backup file is empty');
  if (sourceStat.size > MAX_COMPRESSED_BYTES) throw new Error('Compressed backup exceeds 30 MB');

  let extractedBytes = 0;
  const sizeLimit = new stream.Transform({
    transform(chunk, _encoding, callback) {
      extractedBytes += chunk.length;
      if (extractedBytes > MAX_DATABASE_BYTES) return callback(new Error('Extracted database exceeds 200 MB'));
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      fs.createReadStream(source),
      zlib.createGunzip(),
      sizeLimit,
      fs.createWriteStream(destination, {flags: 'wx'})
    );
    return await inspectDatabase(destination);
  } catch (error) {
    await fs.promises.unlink(destination).catch(() => {});
    throw error;
  }
};

const applyPendingRestore = async ({projectRoot, environment=process.env.NODE_ENV || 'development'}) => {
  const pendingPath = path.join(projectRoot, 'db.restore.pending.sqlite');
  if (!fs.existsSync(pendingPath)) return null;

  const databasePath = databasePathForEnvironment({projectRoot, environment});
  const replacementPath = `${databasePath}.restore-new`;
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rollbackPath = path.join(path.dirname(databasePath), `db.before-restore-${timestamp}.sqlite`);

  await inspectDatabase(pendingPath);
  await fs.promises.copyFile(pendingPath, replacementPath);
  await inspectDatabase(replacementPath);
  await fs.promises.copyFile(databasePath, rollbackPath, fs.constants.COPYFILE_EXCL);

  try {
    await fs.promises.rename(replacementPath, databasePath);
    await inspectDatabase(databasePath);
    await fs.promises.unlink(pendingPath);
    return {databasePath, rollbackPath};
  } catch (error) {
    await fs.promises.copyFile(rollbackPath, databasePath);
    await fs.promises.unlink(replacementPath).catch(() => {});
    throw error;
  }
};

module.exports = {
  MAX_COMPRESSED_BYTES,
  applyPendingRestore,
  databasePathForEnvironment,
  extractBackup,
  inspectDatabase,
};
