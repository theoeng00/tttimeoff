'use strict';

const expect = require('chai').expect;
const {findNextApprover, isDue} = require('../../lib/model/leave_approval');

describe('Leave approval escalation', () => {
  it('becomes available after 24 hours', () => {
    const assignedAt = new Date('2026-08-26T09:00:00.000Z');
    expect(isDue({assigned_at: assignedAt}, new Date('2026-08-27T08:59:59.999Z'))).to.equal(false);
    expect(isDue({assigned_at: assignedAt}, new Date('2026-08-27T09:00:00.000Z'))).to.equal(true);
  });

  it('finds the current approver manager in the leave department', async () => {
    const dbModel = {
      UserDepartment: {
        findOne: async () => ({manager_user_id: 30}),
      },
      LeaveApproval: {
        findAll: async () => [{approver_user_id: 20}],
      },
      User: {
        findOne: async query => ({id: query.where.id, companyId: query.where.companyId}),
      },
    };
    const leave = {id: 1, userId: 10, request_department_id: 7, user: {DepartmentId: 7, companyId: 2}};

    const nextApprover = await findNextApprover({
      leave,
      currentApproval: {approver_user_id: 20},
      dbModel,
    });

    expect(nextApprover.id).to.equal(30);
  });

  it('stops a reporting-line cycle', async () => {
    const dbModel = {
      UserDepartment: {findOne: async () => ({manager_user_id: 20})},
      LeaveApproval: {findAll: async () => [{approver_user_id: 20}]},
    };
    const leave = {id: 1, userId: 10, request_department_id: 7, user: {DepartmentId: 7, companyId: 2}};

    const nextApprover = await findNextApprover({
      leave,
      currentApproval: {approver_user_id: 20},
      dbModel,
    });

    expect(nextApprover).to.equal(null);
  });
});
