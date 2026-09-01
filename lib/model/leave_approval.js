'use strict';

const ESCALATION_AFTER_MS = 24 * 60 * 60 * 1000;

async function resolveInitialApprover({employee, departmentId, dbModel}) {
  const membership = await dbModel.UserDepartment.findOne({
    where: {
      user_id: employee.id,
      department_id: departmentId || employee.DepartmentId,
    },
    include: [{model: dbModel.User, as: 'manager'}],
  });

  if (membership && membership.manager && String(membership.manager.id) !== String(employee.id)) {
    return membership.manager;
  }

  return employee.promise_boss();
}

function createApproval({leave, approverId, level, status, transaction, dbModel}) {
  return dbModel.LeaveApproval.create({
    leave_id: leave.id,
    approver_user_id: approverId,
    level: level || 1,
    status: status || 'pending',
    decided_at: status && status !== 'pending' ? new Date() : null,
  }, {transaction});
}

function getPendingApproval({leaveId, dbModel, transaction}) {
  const options = {
    where: {leave_id: leaveId, status: 'pending'},
    include: [{model: dbModel.User, as: 'approver'}],
    order: [['level', 'DESC']],
    transaction,
  };
  if (transaction) options.lock = transaction.LOCK.UPDATE;
  return dbModel.LeaveApproval.findOne(options);
}

async function findNextApprover({leave, currentApproval, dbModel, transaction}) {
  const departmentId = leave.request_department_id || leave.user.DepartmentId;
  const currentMembership = await dbModel.UserDepartment.findOne({
    where: {
      user_id: currentApproval.approver_user_id,
      department_id: departmentId,
    },
    transaction,
  });

  if (!currentMembership || !currentMembership.manager_user_id) return null;

  const previousApprovals = await dbModel.LeaveApproval.findAll({
    where: {leave_id: leave.id},
    attributes: ['approver_user_id'],
    transaction,
  });
  const previousApproverIds = previousApprovals.map(item => String(item.approver_user_id));
  const nextApproverId = currentMembership.manager_user_id;

  if (
    String(nextApproverId) === String(leave.userId) ||
    previousApproverIds.includes(String(nextApproverId))
  ) return null;

  return dbModel.User.findOne({
    where: {id: nextApproverId, companyId: leave.user.companyId},
    transaction,
  });
}

function isDue(approval, now) {
  return Boolean(approval && new Date(now || Date.now()).getTime() - new Date(approval.assigned_at).getTime() >= ESCALATION_AFTER_MS);
}

async function getEscalationState({leave, dbModel, now}) {
  if (!leave.is_new_leave()) return {canEscalate: false};

  const pendingApproval = await getPendingApproval({leaveId: leave.id, dbModel});
  if (!isDue(pendingApproval, now)) return {canEscalate: false};

  if (!leave.user) {
    leave.user = await leave.getUser();
  }
  const nextApprover = await findNextApprover({leave, currentApproval: pendingApproval, dbModel});

  return {
    canEscalate: Boolean(nextApprover),
    pendingApproval,
    nextApprover,
  };
}

async function escalate({leave, requestedBy, dbModel, now}) {
  if (String(leave.userId) !== String(requestedBy.id)) throw new Error('Only the leave requester can escalate this request');
  if (!leave.is_new_leave()) throw new Error('Only pending leave requests can be escalated');

  return dbModel.sequelize.transaction(async transaction => {
    const pendingApproval = await getPendingApproval({leaveId: leave.id, dbModel, transaction});
    if (!isDue(pendingApproval, now)) throw new Error('The approval wait period has not elapsed');

    leave.user = leave.user || requestedBy;
    const nextApprover = await findNextApprover({leave, currentApproval: pendingApproval, dbModel, transaction});
    if (!nextApprover) throw new Error('No higher approver is configured');

    const escalatedAt = new Date(now || Date.now());
    const updateResult = await dbModel.LeaveApproval.update({
      status: 'escalated',
      decided_at: escalatedAt,
    }, {
      where: {id: pendingApproval.id, status: 'pending'},
      transaction,
    });
    if (!updateResult[0]) throw new Error('This leave request was already processed');

    const approval = await createApproval({
      leave,
      approverId: nextApprover.id,
      level: pendingApproval.level + 1,
      transaction,
      dbModel,
    });

    leave.approverId = nextApprover.id;
    await leave.save({transaction});

    return {approval, nextApprover, previousApprover: pendingApproval.approver};
  });
}

async function markDecision({leave, approverId, status, dbModel}) {
  const approval = await getPendingApproval({leaveId: leave.id, dbModel});
  if (!approval) {
    return createApproval({leave, approverId, status, dbModel});
  }
  if (String(approval.approver_user_id) !== String(approverId)) return;

  approval.status = status;
  approval.decided_at = new Date();
  return approval.save();
}

module.exports = {
  ESCALATION_AFTER_MS,
  createApproval,
  escalate,
  findNextApprover,
  getEscalationState,
  getPendingApproval,
  isDue,
  markDecision,
  resolveInitialApprover,
};
