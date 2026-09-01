'use strict';

const expect = require('chai').expect;
const summary = require('../../lib/model/monthly_attendance_summary');

describe('Monthly attendance summary', function() {
  const leave = {
    date_start: '2026-09-10', date_end: '2026-09-12', day_part_start: 4, day_part_end: 3,
  };

  it('counts whole, half and two-hour leave portions correctly', function() {
    expect(summary.leaveFractionOnDate(leave, '2026-09-10')).to.equal(0.25);
    expect(summary.leaveFractionOnDate(leave, '2026-09-11')).to.equal(1);
    expect(summary.leaveFractionOnDate(leave, '2026-09-12')).to.equal(0.5);
    expect(summary.leaveFractionOnDate(leave, '2026-09-13')).to.equal(0);
  });
});
