'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const company = await queryInterface.describeTable('Companies');
    if (!company.attendance_verification_mode) await queryInterface.addColumn('Companies', 'attendance_verification_mode', {type: Sequelize.STRING, allowNull: false, defaultValue: 'gps'});
    if (!company.attendance_network_cidr) await queryInterface.addColumn('Companies', 'attendance_network_cidr', {type: Sequelize.STRING, allowNull: false, defaultValue: '192.168.1.0/24'});
    const attendance = await queryInterface.describeTable('attendance');
    if (!attendance.verification_mode) await queryInterface.addColumn('attendance', 'verification_mode', {type: Sequelize.STRING, allowNull: false, defaultValue: 'gps'});
    const nullableColumns = {
      clock_in_latitude: Sequelize.DECIMAL(10, 7),
      clock_in_longitude: Sequelize.DECIMAL(10, 7),
      clock_in_accuracy: Sequelize.FLOAT,
      clock_in_distance_m: Sequelize.INTEGER,
    };
    for (const column of Object.keys(nullableColumns)) {
      await queryInterface.changeColumn('attendance', column, {type: nullableColumns[column], allowNull: true});
    }
  },

  down: async function(queryInterface) {
    await queryInterface.removeColumn('attendance', 'verification_mode');
    await queryInterface.removeColumn('Companies', 'attendance_network_cidr');
    await queryInterface.removeColumn('Companies', 'attendance_verification_mode');
  },
};
