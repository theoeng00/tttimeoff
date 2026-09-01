#!/usr/bin/env node

'use strict';

const path = require('path');
const {openDatabase, closeDatabase, verifyDatabase} = require('../lib/util/sqlite_database');
const db = require('../lib/model/db');

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'db.development.sqlite'));
const modelNames = [
  'Company', 'LeaveType', 'Department', 'User', 'BankHoliday', 'Schedule',
  'UserAllowanceAdjustment', 'UserFeed', 'Leave', 'LeaveApproval', 'Attendance',
  'OvertimeRequest', 'UserDepartment', 'DepartmentSupervisor', 'Audit', 'Comment', 'EmailAudit',
];

const all = (sqlite, sql) => new Promise((resolve, reject) => {
  sqlite.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
});

const quoteSqliteIdentifier = value => `"${value.replace(/"/g, '""')}"`;

const rowsForModel = async (sqlite, model) => {
  const columns = await all(sqlite, `PRAGMA table_info(${quoteSqliteIdentifier(model.tableName)})`);
  const expectedFields = Object.values(model.rawAttributes).map(attribute => attribute.field);
  const actualFields = columns.map(column => column.name);
  const extra = actualFields.filter(field => !expectedFields.includes(field));
  const missing = expectedFields.filter(field => !actualFields.includes(field));
  if (extra.length || missing.length) {
    throw new Error(`${model.tableName} schema mismatch; extra: ${extra.join(', ') || '-'}; missing: ${missing.join(', ') || '-'}`);
  }

  const rows = await all(sqlite, `SELECT * FROM ${quoteSqliteIdentifier(model.tableName)}`);
  return rows.map(row => Object.entries(model.rawAttributes).reduce((result, [name, attribute]) => {
    let value = row[attribute.field];
    if (value !== null && attribute.type.key === 'BOOLEAN') value = value === 1 || value === '1' || value === true;
    if (value !== null && attribute.type.key === 'DATE') {
      value = new Date(value);
      if (Number.isNaN(value.getTime())) throw new Error(`${model.tableName}.${attribute.field} contains an invalid date`);
    }
    result[name] = value;
    return result;
  }, {}));
};

const existingTableNames = tables => tables.map(table => typeof table === 'string' ? table : table.tableName || table.name);

const migrate = async () => {
  if (db.sequelize.getDialect() !== 'postgres') throw new Error('Set DATABASE_URL to Supabase PostgreSQL before migrating');

  await verifyDatabase(sourcePath);
  const sqlite = await openDatabase(sourcePath);

  try {
    await db.sequelize.authenticate();
    const queryInterface = db.sequelize.getQueryInterface();
    const existing = existingTableNames(await queryInterface.showAllTables());

    for (const name of modelNames) {
      const model = db[name];
      if (existing.includes(model.tableName) && await model.count()) {
        throw new Error(`Supabase table ${model.tableName} is not empty; migration stopped without changing data`);
      }
    }

    if (existing.includes('SequelizeMeta')) {
      const [rows] = await db.sequelize.query('SELECT COUNT(*) AS count FROM "SequelizeMeta"');
      if (Number(rows[0].count)) throw new Error('Supabase table SequelizeMeta is not empty; migration stopped without changing data');
    }

    const sourceRows = {};
    for (const name of modelNames) sourceRows[name] = await rowsForModel(sqlite, db[name]);
    const departmentBosses = sourceRows.Department.map(row => ({id: row.id, bossId: row.bossId}));
    sourceRows.Department.forEach(row => { row.bossId = null; });
    const metadata = await all(sqlite, 'SELECT name FROM "SequelizeMeta" ORDER BY name');

    await db.sequelize.sync();
    await db.sequelize.transaction(async transaction => {
      for (const name of modelNames) {
        const model = db[name];
        const rows = sourceRows[name];
        if (rows.length) await model.bulkCreate(rows, {transaction, validate: true, hooks: false});
      }

      for (const department of departmentBosses.filter(item => item.bossId !== null)) {
        await db.Department.update({bossId: department.bossId}, {where: {id: department.id}, transaction, hooks: false});
      }

      await db.sequelize.query(
        'CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY)',
        {transaction}
      );
      if (metadata.length) await queryInterface.bulkInsert('SequelizeMeta', metadata, {transaction});

      for (const name of modelNames) {
        const model = db[name];
        if (!sourceRows[name].length || !model.autoIncrementAttribute) continue;
        const table = queryInterface.QueryGenerator.quoteTable(model.tableName);
        const field = queryInterface.QueryGenerator.quoteIdentifier(model.rawAttributes[model.autoIncrementAttribute].field);
        const relation = db.sequelize.escape(table);
        const column = db.sequelize.escape(model.rawAttributes[model.autoIncrementAttribute].field);
        await db.sequelize.query(
          `SELECT setval(pg_get_serial_sequence(${relation}, ${column}), MAX(${field})) FROM ${table}`,
          {transaction}
        );
      }
    });

    for (const name of modelNames) {
      const expected = sourceRows[name].length;
      const actual = await db[name].count();
      if (actual !== expected) throw new Error(`${db[name].tableName} count mismatch: SQLite=${expected}, Supabase=${actual}`);
      console.log(`${db[name].tableName}: ${actual}`);
    }
    console.log('SQLite to Supabase migration completed and verified');
  } finally {
    await closeDatabase(sqlite);
  }
};

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error(`Migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .then(() => db.sequelize.close());
}

module.exports = {rowsForModel};
