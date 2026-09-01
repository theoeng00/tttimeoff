'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('Users');
    if (columns.can_view_attendance_reports) return;
    await queryInterface.addColumn('Users', 'can_view_attendance_reports', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: function(queryInterface) {
    return queryInterface.removeColumn('Users', 'can_view_attendance_reports');
  },
};
