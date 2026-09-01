'use strict';

const models = require('../lib/model/db');

module.exports = {
  up: async function(queryInterface) {
    const existingApprovals = await models.LeaveApproval.findAll({attributes: ['leave_id'], raw: true});
    const existingLeaveIds = existingApprovals.map(item => String(item.leave_id));
    const leaves = await models.Leave.findAll({raw: true});
    const rows = leaves.filter(leave =>
      leave.approverId && !existingLeaveIds.includes(String(leave.id))
    ).map(leave => {
      const pending = [models.Leave.status_new(), models.Leave.status_pended_revoke()].includes(leave.status);
      const status = pending
        ? 'pending'
        : leave.status === models.Leave.status_approved() ? 'approved'
        : leave.status === models.Leave.status_rejected() ? 'rejected'
        : 'canceled';

      return {
        leave_id: leave.id,
        approver_user_id: leave.approverId,
        level: 1,
        status,
        notified_at: null,
        decided_at: pending ? null : (leave.decided_at || leave.updatedAt || new Date()),
        assigned_at: leave.createdAt || new Date(),
      };
    });

    if (rows.length) await queryInterface.bulkInsert(models.LeaveApproval.tableName, rows);
  },

  down: function() {
    // Historical approval data cannot be distinguished safely from approvals created after this migration.
    return Promise.resolve();
  },
};
