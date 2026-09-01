'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const companyColumns = [
      ['attendance_enabled', {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false}],
      ['attendance_location_name', {type: Sequelize.STRING, allowNull: true}],
      ['attendance_latitude', {type: Sequelize.DECIMAL(10, 7), allowNull: true}],
      ['attendance_longitude', {type: Sequelize.DECIMAL(10, 7), allowNull: true}],
      ['attendance_radius_m', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 150}],
      ['attendance_start_time', {type: Sequelize.STRING, allowNull: false, defaultValue: '08:30'}],
      ['attendance_end_time', {type: Sequelize.STRING, allowNull: false, defaultValue: '17:30'}],
      ['attendance_grace_minutes', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 10}],
      ['attendance_ot_after_minutes', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 30}],
    ];
    const existing = await queryInterface.describeTable('Companies');
    for (const column of companyColumns) {
      if (!existing[column[0]]) await queryInterface.addColumn('Companies', column[0], column[1]);
    }
    const tables = await queryInterface.showAllTables();
    const names = tables.map(table => typeof table === 'string' ? table : table.tableName);
    if (!names.includes('attendance')) {
      await queryInterface.createTable('attendance', {
        id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
        company_id: {type: Sequelize.INTEGER, allowNull: false},
        user_id: {type: Sequelize.INTEGER, allowNull: false},
        work_date: {type: Sequelize.DATEONLY, allowNull: false},
        clock_in_at: {type: Sequelize.DATE, allowNull: false},
        clock_out_at: {type: Sequelize.DATE, allowNull: true},
        clock_in_latitude: {type: Sequelize.DECIMAL(10, 7), allowNull: false},
        clock_in_longitude: {type: Sequelize.DECIMAL(10, 7), allowNull: false},
        clock_in_accuracy: {type: Sequelize.FLOAT, allowNull: false},
        clock_in_distance_m: {type: Sequelize.INTEGER, allowNull: false},
        clock_out_latitude: {type: Sequelize.DECIMAL(10, 7), allowNull: true},
        clock_out_longitude: {type: Sequelize.DECIMAL(10, 7), allowNull: true},
        clock_out_accuracy: {type: Sequelize.FLOAT, allowNull: true},
        clock_out_distance_m: {type: Sequelize.INTEGER, allowNull: true},
        status: {type: Sequelize.STRING, allowNull: false},
        minutes_late: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
        overtime_minutes: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
        created_at: {type: Sequelize.DATE, allowNull: false},
        updated_at: {type: Sequelize.DATE, allowNull: false},
      });
      await queryInterface.addIndex('attendance', ['user_id', 'work_date'], {unique: true, name: 'attendance_user_work_date_unique'});
      await queryInterface.addIndex('attendance', ['company_id', 'work_date'], {name: 'attendance_company_work_date'});
    }
  },

  down: async function(queryInterface) {
    await queryInterface.dropTable('attendance');
    for (const name of ['attendance_enabled', 'attendance_location_name', 'attendance_latitude', 'attendance_longitude', 'attendance_radius_m', 'attendance_start_time', 'attendance_end_time', 'attendance_grace_minutes', 'attendance_ot_after_minutes']) {
      await queryInterface.removeColumn('Companies', name);
    }
  },
};
