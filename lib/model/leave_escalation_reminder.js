'use strict';

const EmailTransport = require('../email');
const {ESCALATION_AFTER_MS, findNextApprover} = require('./leave_approval');

async function sendDueEscalationReminders({dbModel, now}) {
  const checkedAt = new Date(now || Date.now());
  const dueBefore = new Date(checkedAt.getTime() - ESCALATION_AFTER_MS);
  const approvals = await dbModel.LeaveApproval.findAll({
    where: {
      status: 'pending',
      notified_at: null,
      assigned_at: {$lte: dueBefore},
    },
    include: [{
      model: dbModel.Leave,
      as: 'leave',
      where: {status: dbModel.Leave.status_new()},
      include: [{model: dbModel.User, as: 'user'}, {model: dbModel.LeaveType, as: 'leave_type'}],
    }, {
      model: dbModel.User,
      as: 'approver',
    }],
  });

  let sent = 0;
  for (const approval of approvals) {
    const leave = approval.leave;
    const nextApprover = await findNextApprover({leave, currentApproval: approval, dbModel});
    if (!nextApprover) continue;

    const updateResult = await dbModel.LeaveApproval.update({notified_at: checkedAt}, {
      where: {id: approval.id, notified_at: null, status: 'pending'},
    });
    if (!updateResult[0]) continue;

    try {
      await (new EmailTransport()).promise_leave_escalation_available_email({
        leave,
        approver: approval.approver,
        nextApprover,
      });
      sent += 1;
    } catch (error) {
      await dbModel.LeaveApproval.update({notified_at: null}, {where: {id: approval.id}});
      throw error;
    }
  }

  return sent;
}

module.exports = {sendDueEscalationReminders};
