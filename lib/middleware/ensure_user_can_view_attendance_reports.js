'use strict';

const canViewAttendanceReports = user => Boolean(
  user && (user.admin === true || user.can_view_attendance_reports === true)
);

const ensureUserCanViewAttendanceReports = (req, res, next) => {
  if (!canViewAttendanceReports(req.user)) return res.redirect_with_session(303, '/');
  next();
};

module.exports = ensureUserCanViewAttendanceReports;
module.exports.canViewAttendanceReports = canViewAttendanceReports;
