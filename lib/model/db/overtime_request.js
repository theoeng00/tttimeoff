'use strict';

module.exports = function(sequelize, DataTypes) {
  const OvertimeRequest = sequelize.define('OvertimeRequest', {
    date_start: {type: DataTypes.DATEONLY, allowNull: false},
    date_end: {type: DataTypes.DATEONLY, allowNull: false},
    overtime_start_time: {type: DataTypes.STRING, allowNull: true},
    overtime_end_time: {type: DataTypes.STRING, allowNull: true},
    overtime_minutes: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    rate_1_minutes: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    rate_1_5_minutes: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    rate_3_minutes: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    overnight_nights: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    reason: {type: DataTypes.STRING(1000), allowNull: false},
    status: {type: DataTypes.STRING, allowNull: false, defaultValue: 'pending'},
    decided_at: {type: DataTypes.DATE, allowNull: true},
  }, {
    underscored: true,
    tableName: 'overtime_request',
    indexes: [
      {fields: ['company_id', 'date_start']},
      {fields: ['approver_user_id', 'status']},
      {fields: ['user_id', 'status']},
    ],
    classMethods: {
      associate: function(models) {
        OvertimeRequest.belongsTo(models.Company, {as: 'company', foreignKey: 'company_id'});
        OvertimeRequest.belongsTo(models.User, {as: 'user', foreignKey: 'user_id'});
        OvertimeRequest.belongsTo(models.User, {as: 'approver', foreignKey: 'approver_user_id'});
      },
    },
  });

  return OvertimeRequest;
};
