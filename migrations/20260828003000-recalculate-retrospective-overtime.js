'use strict';

const overtime = require('../lib/model/overtime_request');

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const rows = await queryInterface.sequelize.query(
      'SELECT o.id, o.overtime_start_time, o.overtime_end_time, c.attendance_start_time, c.attendance_end_time FROM overtime_request o JOIN Companies c ON c.id = o.company_id WHERE o.overtime_start_time IS NOT NULL AND o.overtime_end_time IS NOT NULL',
      {type: Sequelize.QueryTypes.SELECT}
    );
    for (const row of rows) {
      const overtimeMinutes = overtime.calculateOvertimeMinutes(
        overtime.parseTime(row.overtime_start_time),
        overtime.parseTime(row.overtime_end_time),
        row.attendance_start_time,
        row.attendance_end_time
      );
      await queryInterface.bulkUpdate('overtime_request', {overtime_minutes: overtimeMinutes}, {id: row.id});
    }
  },

  down: function() {
    // The previous incorrect totals cannot be restored safely.
    return Promise.resolve();
  },
};
