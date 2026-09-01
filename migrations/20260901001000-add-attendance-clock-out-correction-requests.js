'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map(table => typeof table === 'string' ? table : table.tableName);
    if (names.includes('attendance_clock_out_correction_request')) return;

    await queryInterface.createTable('attendance_clock_out_correction_request', {
      id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
      attendance_id: {type: Sequelize.INTEGER, allowNull: false},
      company_id: {type: Sequelize.INTEGER, allowNull: false},
      user_id: {type: Sequelize.INTEGER, allowNull: false},
      approver_user_id: {type: Sequelize.INTEGER, allowNull: false},
      work_date: {type: Sequelize.DATEONLY, allowNull: false},
      original_clock_out_at: {type: Sequelize.DATE, allowNull: true},
      requested_clock_out_at: {type: Sequelize.DATE, allowNull: false},
      reason: {type: Sequelize.STRING(1000), allowNull: false},
      status: {type: Sequelize.STRING, allowNull: false, defaultValue: 'pending'},
      decided_at: {type: Sequelize.DATE, allowNull: true},
      created_at: {type: Sequelize.DATE, allowNull: false},
      updated_at: {type: Sequelize.DATE, allowNull: false},
    });
    await queryInterface.addIndex('attendance_clock_out_correction_request', ['company_id', 'work_date'], {name: 'attendance_clock_out_correction_company_date'});
    await queryInterface.addIndex('attendance_clock_out_correction_request', ['approver_user_id', 'status'], {name: 'attendance_clock_out_correction_approver_status'});
    await queryInterface.addIndex('attendance_clock_out_correction_request', ['user_id', 'status'], {name: 'attendance_clock_out_correction_user_status'});
  },

  down: function(queryInterface) {
    return queryInterface.dropTable('attendance_clock_out_correction_request');
  },
};
