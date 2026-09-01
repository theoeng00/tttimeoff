'use strict';

const expect = require('chai').expect;
const moment = require('moment');
const {filterLeaves, leavesReportCsv} = require('../../lib/model/Report');

describe('Leaves report CSV', () => {
  it('escapes report values and includes the shared report columns', async () => {
    const csv = await leavesReportCsv([{
      employeeFullName: 'Doe, Jane',
      departmentName: 'People',
      type: 'Annual leave',
      deductedDays: 1,
      startDate: '2026-08-20',
      endDate: '2026-08-20',
      status: 'Approved',
      createdAt: '2026-08-01',
      approver: 'Admin User',
      comment: 'Family trip',
    }]);

    expect(csv).to.contain('Employee,Department,Leave Type');
    expect(csv).to.contain('"Doe, Jane"');
    expect(csv).to.contain('Approved');
  });

  it('includes leave that spans the whole cutoff period', () => {
    const leave = {
      get_start_leave_day: () => ({date: '2026-07-15'}),
      get_end_leave_day: () => ({date: '2026-08-25'}),
    };

    expect(filterLeaves({
      startDate: moment.utc('2026-07-21'),
      endDate: moment.utc('2026-08-20'),
    })(leave)).to.equal(true);
  });
});
