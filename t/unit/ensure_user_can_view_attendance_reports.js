'use strict';

const expect = require('chai').expect;
const permission = require('../../lib/middleware/ensure_user_can_view_attendance_reports');

describe('Attendance report permission', function() {
  it('allows administrators and explicitly assigned employees', function() {
    expect(permission.canViewAttendanceReports({admin: true})).to.equal(true);
    expect(permission.canViewAttendanceReports({admin: false, can_view_attendance_reports: true})).to.equal(true);
  });

  it('rejects other and anonymous users', function() {
    expect(permission.canViewAttendanceReports({admin: false, can_view_attendance_reports: false})).to.equal(false);
    expect(permission.canViewAttendanceReports(null)).to.equal(false);
  });
});
