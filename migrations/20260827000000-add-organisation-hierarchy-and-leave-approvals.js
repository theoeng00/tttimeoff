'use strict';

const models = require('../lib/model/db');

module.exports = {
  up: async function(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map(table => typeof table === 'string' ? table : table.tableName);

    if (!tableNames.includes(models.UserDepartment.tableName)) {
      await queryInterface.createTable(
        models.UserDepartment.tableName,
        models.UserDepartment.attributes
      );
    }

    if (!tableNames.includes(models.LeaveApproval.tableName)) {
      await queryInterface.createTable(
        models.LeaveApproval.tableName,
        models.LeaveApproval.attributes
      );
    }

    const leaveAttributes = await queryInterface.describeTable('Leaves');
    if (!leaveAttributes.hasOwnProperty('request_department_id')) {
      await queryInterface.addColumn('Leaves', 'request_department_id', {
        type: models.Sequelize.INTEGER,
        allowNull: true,
      });
    }

    const existingMemberships = await models.UserDepartment.count();
    if (existingMemberships) return;

    const users = await models.User.findAll({attributes: ['id', 'DepartmentId'], raw: true});
    const departments = await models.Department.findAll({attributes: ['id', 'bossId'], raw: true});
    const bosses = departments.reduce((result, department) => {
      result[department.id] = department.bossId;
      return result;
    }, {});
    const now = new Date();
    const rows = users.filter(user => user.DepartmentId).map(user => ({
      user_id: user.id,
      department_id: user.DepartmentId,
      manager_user_id: String(bosses[user.DepartmentId]) === String(user.id) ? null : bosses[user.DepartmentId],
      is_primary: true,
      created_at: now,
      updated_at: now,
    }));

    if (rows.length) await queryInterface.bulkInsert(models.UserDepartment.tableName, rows);
  },

  down: async function(queryInterface) {
    const leaveAttributes = await queryInterface.describeTable('Leaves');
    if (leaveAttributes.hasOwnProperty('request_department_id')) {
      await queryInterface.removeColumn('Leaves', 'request_department_id');
    }
    await queryInterface.dropTable(models.LeaveApproval.tableName);
    await queryInterface.dropTable(models.UserDepartment.tableName);
  },
};
