'use strict';

module.exports = {
  up: async function(queryInterface, Sequelize) {
    await queryInterface.changeColumn('overtime_request', 'overtime_start_time', {type: Sequelize.STRING, allowNull: true});
    await queryInterface.changeColumn('overtime_request', 'overtime_end_time', {type: Sequelize.STRING, allowNull: true});
  },

  down: async function(queryInterface, Sequelize) {
    await queryInterface.changeColumn('overtime_request', 'overtime_start_time', {type: Sequelize.STRING, allowNull: false});
    await queryInterface.changeColumn('overtime_request', 'overtime_end_time', {type: Sequelize.STRING, allowNull: false});
  },
};
