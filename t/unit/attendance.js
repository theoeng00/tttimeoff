'use strict';

const expect = require('chai').expect;
const attendance = require('../../lib/model/attendance');

const company = {
  timezone: 'Asia/Bangkok',
  attendance_latitude: 13.7563,
  attendance_longitude: 100.5018,
  attendance_radius_m: 150,
  attendance_start_time: '08:30',
  attendance_end_time: '17:30',
  attendance_grace_minutes: 10,
  attendance_ot_after_minutes: 30,
};

describe('Attendance', () => {
  it('accepts a GPS reading inside the workplace radius', () => {
    const result = attendance.verifyWorkLocation(company, {latitude: 13.7564, longitude: 100.5018, accuracy: 5});
    expect(result.distance_metres).to.be.below(20);
  });

  it('rejects a GPS reading outside the workplace radius', () => {
    expect(() => attendance.verifyWorkLocation(company, {latitude: 13.7663, longitude: 100.5018, accuracy: 5})).to.throw(/outside/);
  });

  it('uses the company timezone and grace period when calculating lateness', () => {
    const result = attendance.clockInResult(company, new Date('2026-08-27T01:45:00.000Z'));
    expect(result.status).to.equal('late');
    expect(result.minutes_late).to.equal(15);
  });

  it('records OT only after the configured threshold', () => {
    expect(attendance.clockOutResult(company, new Date('2026-08-27T10:50:00.000Z')).overtime_minutes).to.equal(0);
    expect(attendance.clockOutResult(company, new Date('2026-08-27T11:00:00.000Z')).overtime_minutes).to.equal(30);
  });

  it('rejects inaccurate GPS readings', () => {
    expect(() => attendance.validatePosition({latitude: 13, longitude: 100, accuracy: 300})).to.throw(/GPS/);
  });

  it('rejects missing GPS values instead of treating blanks as zero', () => {
    expect(() => attendance.validatePosition({latitude: '', longitude: '', accuracy: ''})).to.throw(/Missing GPS/);
    expect(() => attendance.validatePosition()).to.throw(/Missing GPS/);
  });

  it('rejects an invalid workplace configuration', () => {
    expect(() => attendance.verifyWorkLocation(Object.assign({}, company, {attendance_radius_m: 0}), {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 5,
    })).to.throw(/not configured/);
  });

  it('accepts only addresses inside the configured office network', () => {
    expect(attendance.isAddressInCidr('192.168.1.88', '192.168.1.0/24')).to.equal(true);
    expect(attendance.isAddressInCidr('::ffff:192.168.1.88', '192.168.1.0/24')).to.equal(true);
    expect(attendance.isAddressInCidr('192.168.2.10', '192.168.1.0/24')).to.equal(false);
    expect(attendance.isAddressInCidr('26.59.248.223', '192.168.1.0/24')).to.equal(false);
  });

  it('rejects malformed network configuration instead of allowing everybody', () => {
    expect(attendance.isAddressInCidr('192.168.1.88', 'bad-value')).to.equal(false);
  });
});
