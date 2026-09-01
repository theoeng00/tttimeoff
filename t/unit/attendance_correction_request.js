'use strict';

const expect = require('chai').expect;
const correction = require('../../lib/model/attendance_correction_request');

const attendance = {
  work_date: '2026-09-01',
  clock_in_at: new Date('2026-09-01T03:00:00.000Z'),
};

describe('Attendance clock-in correction request', () => {
  it('accepts an earlier time on the attendance work date', () => {
    const result = correction.validateRequest({requested_clock_in_time: '08:30', reason: 'Forgot to clock in'}, attendance, 'Asia/Bangkok');
    expect(result.requested_clock_in_at.toISOString()).to.equal('2026-09-01T01:30:00.000Z');
  });

  it('rejects a requested time at or after the actual clock-in', () => {
    expect(() => correction.validateRequest({requested_clock_in_time: '10:00', reason: 'Forgot'}, attendance, 'Asia/Bangkok')).to.throw(/ก่อน/);
  });

  it('requires a valid time and reason', () => {
    expect(() => correction.validateRequest({requested_clock_in_time: '25:00', reason: 'Forgot'}, attendance, 'Asia/Bangkok')).to.throw(/เวลา/);
    expect(() => correction.validateRequest({requested_clock_in_time: '08:30', reason: ''}, attendance, 'Asia/Bangkok')).to.throw(/เหตุผล/);
  });
});
