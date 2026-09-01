"use strict";

module.exports = function(sequelize, DataTypes) {
  const LeaveApproval = sequelize.define("LeaveApproval", {
    leave_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    approver_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
    notified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    decided_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'leave_approval',
    underscored: true,
    createdAt: 'assigned_at',
    updatedAt: false,
    indexes: [{
      fields: ['leave_id', 'status'],
    }, {
      fields: ['approver_user_id', 'status'],
    }],
    classMethods: {
      associate: function(models) {
        LeaveApproval.belongsTo(models.Leave, {as: 'leave', foreignKey: 'leave_id'});
        LeaveApproval.belongsTo(models.User, {as: 'approver', foreignKey: 'approver_user_id'});
      },
    },
  });

  return LeaveApproval;
};
