'use strict';

module.exports = function(sequelize, DataTypes) {
  const AttendanceClockOutCorrectionRequest = sequelize.define('AttendanceClockOutCorrectionRequest', {
    work_date: {type: DataTypes.DATEONLY, allowNull: false},
    original_clock_out_at: {type: DataTypes.DATE, allowNull: true},
    requested_clock_out_at: {type: DataTypes.DATE, allowNull: false},
    reason: {type: DataTypes.STRING(1000), allowNull: false},
    status: {type: DataTypes.STRING, allowNull: false, defaultValue: 'pending'},
    decided_at: {type: DataTypes.DATE, allowNull: true},
  }, {
    underscored: true,
    tableName: 'attendance_clock_out_correction_request',
    indexes: [
      {fields: ['company_id', 'work_date']},
      {fields: ['approver_user_id', 'status']},
      {fields: ['user_id', 'status']},
    ],
    classMethods: {
      associate: function(models) {
        AttendanceClockOutCorrectionRequest.belongsTo(models.Attendance, {as: 'attendance', foreignKey: 'attendance_id'});
        AttendanceClockOutCorrectionRequest.belongsTo(models.Company, {as: 'company', foreignKey: 'company_id'});
        AttendanceClockOutCorrectionRequest.belongsTo(models.User, {as: 'user', foreignKey: 'user_id'});
        AttendanceClockOutCorrectionRequest.belongsTo(models.User, {as: 'approver', foreignKey: 'approver_user_id'});
      },
    },
  });

  return AttendanceClockOutCorrectionRequest;
};
