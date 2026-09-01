'use strict';

const assert = require('assert');
const {rowsForModel} = require('../../bin/migrate_sqlite_to_postgres');

describe('SQLite to PostgreSQL migration', () => {
  it('maps SQLite booleans and dates to model values', async () => {
    const sqlite = {
      all(sql, callback) {
        if (sql.startsWith('PRAGMA')) {
          return callback(null, [{name: 'id'}, {name: 'active'}, {name: 'created_at'}]);
        }
        callback(null, [{id: 7, active: 1, created_at: '2026-08-28 02:29:30.813 +00:00'}]);
      },
    };
    const model = {
      tableName: 'example',
      rawAttributes: {
        id: {field: 'id', type: {key: 'INTEGER'}},
        active: {field: 'active', type: {key: 'BOOLEAN'}},
        createdAt: {field: 'created_at', type: {key: 'DATE'}},
      },
    };

    const rows = await rowsForModel(sqlite, model);
    assert.strictEqual(rows[0].active, true);
    assert(rows[0].createdAt instanceof Date);
    assert.strictEqual(rows[0].createdAt.toISOString(), '2026-08-28T02:29:30.813Z');
  });
});
