'use strict';

const expect = require('chai').expect;
const correction = require('../../lib/model/attendance_clock_out_correction_request');

const attendance = {
  work_date: '2026-09-01',
  clock_in_at: new Date('2026-09-01T01:30:00.000Z'),
};

describe('Attendance Clock-out correction request', () => {
  it('accepts a time after Clock-in and before now', () => {
    const result = correction.validateRequest({requested_clock_out_time: '17:30', reason: 'Forgot to clock out'}, attendance, 'Asia/Bangkok', new Date('2026-09-01T12:00:00.000Z'));
    expect(result.requested_clock_out_at.toISOString()).to.equal('2026-09-01T10:30:00.000Z');
  });

  it('rejects a time before Clock-in', () => {
    expect(() => correction.validateRequest({requested_clock_out_time: '08:00', reason: 'Forgot'}, attendance, 'Asia/Bangkok', new Date('2026-09-01T12:00:00.000Z'))).to.throw(/หลัง/);
  });

  it('rejects a future time', () => {
    expect(() => correction.validateRequest({requested_clock_out_time: '20:00', reason: 'Forgot'}, attendance, 'Asia/Bangkok', new Date('2026-09-01T12:00:00.000Z'))).to.throw(/อนาคต/);
  });

  it('requires a reason', () => {
    expect(() => correction.validateRequest({requested_clock_out_time: '17:30', reason: ' '}, attendance, 'Asia/Bangkok', new Date('2026-09-01T12:00:00.000Z'))).to.throw(/เหตุผล/);
  });
});
