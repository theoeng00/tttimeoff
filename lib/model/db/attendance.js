'use strict';

module.exports = function(sequelize, DataTypes) {
  const Attendance = sequelize.define('Attendance', {
    work_date: {type: DataTypes.DATEONLY, allowNull: false},
    clock_in_at: {type: DataTypes.DATE, allowNull: false},
    clock_out_at: {type: DataTypes.DATE, allowNull: true},
    verification_mode: {type: DataTypes.STRING, allowNull: false, defaultValue: 'gps'},
    clock_in_latitude: {type: DataTypes.DECIMAL(10, 7), allowNull: true},
    clock_in_longitude: {type: DataTypes.DECIMAL(10, 7), allowNull: true},
    clock_in_accuracy: {type: DataTypes.FLOAT, allowNull: true},
    clock_in_distance_m: {type: DataTypes.INTEGER, allowNull: true},
    clock_out_latitude: {type: DataTypes.DECIMAL(10, 7), allowNull: true},
    clock_out_longitude: {type: DataTypes.DECIMAL(10, 7), allowNull: true},
    clock_out_accuracy: {type: DataTypes.FLOAT, allowNull: true},
    clock_out_distance_m: {type: DataTypes.INTEGER, allowNull: true},
    status: {type: DataTypes.STRING, allowNull: false},
    minutes_late: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    overtime_minutes: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
  }, {
    underscored: true,
    freezeTableName: true,
    tableName: 'attendance',
    indexes: [
      {unique: true, fields: ['user_id', 'work_date']},
      {fields: ['company_id', 'work_date']},
    ],
    classMethods: {
      associate: function(models) {
        Attendance.belongsTo(models.Company, {as: 'company', foreignKey: 'company_id'});
        Attendance.belongsTo(models.User, {as: 'user', foreignKey: 'user_id'});
      },
    },
  });
  return Attendance;
};
