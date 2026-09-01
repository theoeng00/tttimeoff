'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('overtime_request');
    const columns = [
      ['rate_1_minutes', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}],
      ['rate_1_5_minutes', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}],
      ['rate_3_minutes', {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}],
    ];
    for (const column of columns) {
      if (!existing[column[0]]) await queryInterface.addColumn('overtime_request', column[0], column[1]);
    }
    // รายการเดิมถูกคำนวณจากเวลานอกเวลางานปกติ จึงถือเป็นเรต 1.5 เท่า
    await queryInterface.sequelize.query('UPDATE overtime_request SET rate_1_5_minutes = overtime_minutes WHERE rate_1_minutes = 0 AND rate_1_5_minutes = 0 AND rate_3_minutes = 0');
  },

  down: async function(queryInterface) {
    for (const name of ['rate_3_minutes', 'rate_1_5_minutes', 'rate_1_minutes']) {
      await queryInterface.removeColumn('overtime_request', name);
    }
  },
};
