'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map(table => typeof table === 'string' ? table : table.tableName);
    if (names.includes('overtime_request')) return;

    await queryInterface.createTable('overtime_request', {
      id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
      company_id: {type: Sequelize.INTEGER, allowNull: false},
      user_id: {type: Sequelize.INTEGER, allowNull: false},
      approver_user_id: {type: Sequelize.INTEGER, allowNull: false},
      date_start: {type: Sequelize.DATEONLY, allowNull: false},
      date_end: {type: Sequelize.DATEONLY, allowNull: false},
      overtime_start_time: {type: Sequelize.STRING, allowNull: false},
      overtime_end_time: {type: Sequelize.STRING, allowNull: false},
      overtime_minutes: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
      overnight_nights: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
      reason: {type: Sequelize.STRING(1000), allowNull: false},
      status: {type: Sequelize.STRING, allowNull: false, defaultValue: 'pending'},
      decided_at: {type: Sequelize.DATE, allowNull: true},
      created_at: {type: Sequelize.DATE, allowNull: false},
      updated_at: {type: Sequelize.DATE, allowNull: false},
    });
    await queryInterface.addIndex('overtime_request', ['company_id', 'date_start'], {name: 'overtime_request_company_date'});
    await queryInterface.addIndex('overtime_request', ['approver_user_id', 'status'], {name: 'overtime_request_approver_status'});
    await queryInterface.addIndex('overtime_request', ['user_id', 'status'], {name: 'overtime_request_user_status'});
  },

  down: function(queryInterface) {
    return queryInterface.dropTable('overtime_request');
  },
};
