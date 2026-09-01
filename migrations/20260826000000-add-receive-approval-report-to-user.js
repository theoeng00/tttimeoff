'use strict';

var models = require('../lib/model/db');

module.exports = {
  up: function(queryInterface) {
    return queryInterface.describeTable('Users').then(function(attributes) {
      if (attributes.hasOwnProperty('receive_approval_report')) return;

      return queryInterface.addColumn(
        'Users',
        'receive_approval_report',
        models.User.attributes.receive_approval_report
      );
    });
  },

  down: function(queryInterface) {
    return queryInterface.removeColumn('Users', 'receive_approval_report');
  }
};
