'use strict';

const sqlite3 = require('sqlite3');

const closeDatabase = database => new Promise((resolve, reject) => {
  database.close(error => error ? reject(error) : resolve());
});

const openDatabase = (filename, mode=sqlite3.OPEN_READONLY) => new Promise((resolve, reject) => {
  const database = new sqlite3.Database(filename, mode, error => {
    if (error) return reject(error);
    resolve(database);
  });
});

const verifyDatabase = async filename => {
  const database = await openDatabase(filename);

  try {
    const row = await new Promise((resolve, reject) => {
      database.get('PRAGMA integrity_check', (error, result) => error ? reject(error) : resolve(result));
    });

    if (!row || Object.values(row)[0] !== 'ok') throw new Error('SQLite integrity check failed');
  } finally {
    await closeDatabase(database);
  }
};

module.exports = {closeDatabase, openDatabase, verifyDatabase};
