'use strict';

module.exports = function(sequelize, DataTypes) {
  const AttendanceCorrectionRequest = sequelize.define('AttendanceCorrectionRequest', {
    work_date: {type: DataTypes.DATEONLY, allowNull: false},
    original_clock_in_at: {type: DataTypes.DATE, allowNull: false},
    requested_clock_in_at: {type: DataTypes.DATE, allowNull: false},
    reason: {type: DataTypes.STRING(1000), allowNull: false},
    status: {type: DataTypes.STRING, allowNull: false, defaultValue: 'pending'},
    decided_at: {type: DataTypes.DATE, allowNull: true},
  }, {
    underscored: true,
    tableName: 'attendance_correction_request',
    indexes: [
      {fields: ['company_id', 'work_date']},
      {fields: ['approver_user_id', 'status']},
      {fields: ['user_id', 'status']},
    ],
    classMethods: {
      associate: function(models) {
        AttendanceCorrectionRequest.belongsTo(models.Attendance, {as: 'attendance', foreignKey: 'attendance_id'});
        AttendanceCorrectionRequest.belongsTo(models.Company, {as: 'company', foreignKey: 'company_id'});
        AttendanceCorrectionRequest.belongsTo(models.User, {as: 'user', foreignKey: 'user_id'});
        AttendanceCorrectionRequest.belongsTo(models.User, {as: 'approver', foreignKey: 'approver_user_id'});
      },
    },
  });

  return AttendanceCorrectionRequest;
};
