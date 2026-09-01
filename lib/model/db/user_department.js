"use strict";

module.exports = function(sequelize, DataTypes) {
  const UserDepartment = sequelize.define("UserDepartment", {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    manager_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'user_department',
    underscored: true,
    indexes: [{
      unique: true,
      fields: ['user_id', 'department_id'],
    }, {
      fields: ['manager_user_id'],
    }],
    classMethods: {
      associate: function(models) {
        UserDepartment.belongsTo(models.User, {as: 'user', foreignKey: 'user_id'});
        UserDepartment.belongsTo(models.User, {as: 'manager', foreignKey: 'manager_user_id'});
        UserDepartment.belongsTo(models.Department, {as: 'department', foreignKey: 'department_id'});
      },
    },
  });

  return UserDepartment;
};
