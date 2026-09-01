'use strict';

const express = require('express');
const moment = require('moment-timezone');
const attendanceLogic = require('../model/attendance');
const attendanceCorrectionLogic = require('../model/attendance_correction_request');
const overtimeRequestLogic = require('../model/overtime_request');
const {resolveInitialApprover} = require('../model/leave_approval');
const ensureAdmin = require('../middleware/ensure_user_is_admin');
const ensureCanViewReports = require('../middleware/ensure_user_can_view_attendance_reports');
const {canViewAttendanceReports} = ensureCanViewReports;
const router = express.Router();

router.all(/.*/, function(req, res, next) {
  if (!req.user) return res.redirect_with_session(303, '/');
  next();
});

function locationConfigured(company) {
  return company.attendance_latitude !== null && company.attendance_longitude !== null;
}

function friendlyError(error) {
  return error.user_message || 'ลงเวลาไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ';
}

async function pageState(req) {
  const company = await req.user.getCompany();
  const now = attendanceLogic.companyMoment(company);
  const workDate = now.format('YYYY-MM-DD');
  const attendance = await req.app.get('db_model').Attendance.findOne({
    where: {user_id: req.user.id, work_date: workDate},
  });
  const schedule = await req.user.promise_schedule_I_obey();
  const isWorkingDay = schedule.is_it_working_day({day: now});
  const end = attendanceLogic.timeOnDate(workDate, company.attendance_end_time, company.timezone);
  const verificationReady = locationConfigured(company);
  return {
    company,
    attendance,
    isSystemAdmin: req.user.admin,
    canViewAttendanceReports: canViewAttendanceReports(req.user),
    isWorkingDay,
    canClockIn: !req.user.admin && company.attendance_enabled && verificationReady && isWorkingDay && !attendance,
    canClockOut: !req.user.admin && company.attendance_enabled && attendance && !attendance.clock_out_at && !now.isBefore(end),
    waitingForClockOut: !req.user.admin && attendance && !attendance.clock_out_at && now.isBefore(end),
    clockOutAvailableAt: end.valueOf(),
    clockInTime: attendance && moment(attendance.clock_in_at).tz(company.timezone).format('HH:mm:ss'),
    clockOutTime: attendance && attendance.clock_out_at && moment(attendance.clock_out_at).tz(company.timezone).format('HH:mm:ss'),
    title: req.__('Attendance'),
  };
}

router.get('/', async function(req, res, next) {
  try {
    res.locals.custom_java_script.push('/js/attendance.js');
    res.render('attendance', await pageState(req));
  } catch (error) { next(error); }
});

router.post('/clock-in/', async function(req, res) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    if (req.user.admin) throw Object.assign(new Error('System administrator is not an employee'), {user_message: 'บัญชีผู้ดูแลระบบไม่อยู่ในระบบลงเวลาพนักงาน'});
    if (!company.attendance_enabled) throw Object.assign(new Error('Attendance is disabled'), {user_message: 'ระบบลงเวลายังไม่เปิดใช้งาน'});
    const now = attendanceLogic.companyMoment(company);
    const schedule = await req.user.promise_schedule_I_obey();
    if (!schedule.is_it_working_day({day: now})) throw Object.assign(new Error('Not a working day'), {user_message: 'วันนี้ไม่ใช่วันทำงานตามตาราง'});
    const workDate = now.format('YYYY-MM-DD');
    const existing = await db.Attendance.findOne({where: {user_id: req.user.id, work_date: workDate}});
    if (existing) throw Object.assign(new Error('Already clocked in'), {user_message: 'ลงเวลาเข้างานวันนี้แล้ว'});
    const proof = attendanceLogic.verifyAttendanceRequest(company, req.body);
    const result = attendanceLogic.clockInResult(company, now);
    await db.Attendance.create({
      company_id: company.id,
      user_id: req.user.id,
      work_date: workDate,
      clock_in_at: now.toDate(),
      verification_mode: proof.verification_mode,
      clock_in_latitude: proof.latitude === undefined ? null : proof.latitude,
      clock_in_longitude: proof.longitude === undefined ? null : proof.longitude,
      clock_in_accuracy: proof.accuracy === undefined ? null : proof.accuracy,
      clock_in_distance_m: proof.distance_metres === undefined ? null : proof.distance_metres,
      status: result.status,
      minutes_late: result.minutes_late,
    });
    req.session.flash_message(result.status === 'late' ? `ลงเวลาเข้างานแล้ว (สาย ${result.minutes_late} นาที)` : 'ลงเวลาเข้างานแล้ว');
  } catch (error) {
    console.error('Failed to clock in user %s: %s', req.user.id, error.message);
    req.session.flash_error(error.name === 'SequelizeUniqueConstraintError' ? 'ลงเวลาเข้างานวันนี้แล้ว' : friendlyError(error));
  }
  res.redirect_with_session('/attendance/');
});

router.post('/clock-out/', async function(req, res) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    if (req.user.admin) throw Object.assign(new Error('System administrator is not an employee'), {user_message: 'บัญชีผู้ดูแลระบบไม่อยู่ในระบบลงเวลาพนักงาน'});
    if (!company.attendance_enabled) throw Object.assign(new Error('Attendance is disabled'), {user_message: 'ระบบลงเวลายังไม่เปิดใช้งาน'});
    const now = attendanceLogic.companyMoment(company);
    const workDate = now.format('YYYY-MM-DD');
    const end = attendanceLogic.timeOnDate(workDate, company.attendance_end_time, company.timezone);
    if (now.isBefore(end)) throw Object.assign(new Error('Clock out is too early'), {user_message: `ลงเวลาออกได้ตั้งแต่ ${company.attendance_end_time} น.`});
    const record = await db.Attendance.findOne({where: {user_id: req.user.id, work_date: workDate}});
    if (!record) throw Object.assign(new Error('No clock in'), {user_message: 'ไม่พบเวลาเข้างานของวันนี้'});
    if (record.clock_out_at) throw Object.assign(new Error('Already clocked out'), {user_message: 'ลงเวลาออกงานวันนี้แล้ว'});
    const proof = attendanceLogic.verifyAttendanceRequest(company, req.body);
    const result = attendanceLogic.clockOutResult(company, now);
    const updated = await db.Attendance.update({
      clock_out_at: now.toDate(),
      clock_out_latitude: proof.latitude === undefined ? null : proof.latitude,
      clock_out_longitude: proof.longitude === undefined ? null : proof.longitude,
      clock_out_accuracy: proof.accuracy === undefined ? null : proof.accuracy,
      clock_out_distance_m: proof.distance_metres === undefined ? null : proof.distance_metres,
      overtime_minutes: result.overtime_minutes,
    }, {
      where: {id: record.id, clock_out_at: null},
    });
    if (!updated[0]) throw Object.assign(new Error('Already clocked out'), {user_message: 'ลงเวลาออกงานวันนี้แล้ว'});
    req.session.flash_message(result.overtime_minutes ? `ลงเวลาออกงานแล้ว (OT ${result.overtime_minutes} นาที)` : 'ลงเวลาออกงานแล้ว');
  } catch (error) {
    console.error('Failed to clock out user %s: %s', req.user.id, error.message);
    req.session.flash_error(friendlyError(error));
  }
  res.redirect_with_session('/attendance/');
});

router.get('/corrections/', async function(req, res, next) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    const now = attendanceLogic.companyMoment(company);
    const workDate = now.format('YYYY-MM-DD');
    const hasReportAccess = canViewAttendanceReports(req.user);
    const where = hasReportAccess
      ? {company_id: company.id}
      : {company_id: company.id, $or: [{user_id: req.user.id}, {approver_user_id: req.user.id}]};
    const requests = await db.AttendanceCorrectionRequest.findAll({
      where,
      include: [{model: db.User, as: 'user'}, {model: db.User, as: 'approver'}],
      order: [['created_at', 'DESC']],
    });
    const attendance = req.user.admin ? null : await db.Attendance.findOne({where: {user_id: req.user.id, work_date: workDate}});
    const pendingOwnRequest = requests.some(item => item.status === 'pending' && String(item.user_id) === String(req.user.id));

    requests.forEach(item => {
      item.statusLabel = req.__(item.status.charAt(0).toUpperCase() + item.status.slice(1));
      item.originalClockInTime = moment(item.original_clock_in_at).tz(company.timezone).format('HH:mm');
      item.requestedClockInTime = moment(item.requested_clock_in_at).tz(company.timezone).format('HH:mm');
      item.canDecide = item.status === 'pending' && String(item.approver_user_id) === String(req.user.id);
    });

    res.render('attendance_corrections', {
      requests,
      canSubmit: Boolean(attendance && !pendingOwnRequest),
      actualClockInTime: attendance && moment(attendance.clock_in_at).tz(company.timezone).format('HH:mm'),
      workDate,
      title: req.__('Clock-in correction requests'),
    });
  } catch (error) { next(error); }
});

router.post('/corrections/', async function(req, res) {
  const db = req.app.get('db_model');
  try {
    if (req.user.admin) throw Object.assign(new Error('System administrator is not an employee'), {user_message: 'บัญชีผู้ดูแลระบบไม่สามารถขอแก้เวลาเข้างานได้'});
    const company = await req.user.getCompany();
    const workDate = attendanceLogic.companyMoment(company).format('YYYY-MM-DD');
    const attendance = await db.Attendance.findOne({where: {user_id: req.user.id, work_date: workDate}});
    if (!attendance) throw Object.assign(new Error('No clock in'), {user_message: 'กรุณา Clock-in ก่อนส่งคำขอแก้ไขเวลา'});
    const duplicate = await db.AttendanceCorrectionRequest.findOne({where: {attendance_id: attendance.id, user_id: req.user.id, status: 'pending'}});
    if (duplicate) throw Object.assign(new Error('Pending correction exists'), {user_message: 'มีคำขอแก้เวลาเข้างานที่รออนุมัติอยู่แล้ว'});
    const values = attendanceCorrectionLogic.validateRequest(req.body, attendance, company.timezone);
    const approver = await resolveInitialApprover({employee: req.user, departmentId: req.user.DepartmentId, dbModel: db});
    if (!approver || String(approver.id) === String(req.user.id)) {
      throw Object.assign(new Error('No attendance correction approver configured'), {user_message: 'ยังไม่ได้กำหนดหัวหน้าผู้อนุมัติ'});
    }
    await db.AttendanceCorrectionRequest.create(Object.assign(values, {
      attendance_id: attendance.id,
      company_id: company.id,
      user_id: req.user.id,
      approver_user_id: approver.id,
      work_date: attendance.work_date,
      original_clock_in_at: attendance.clock_in_at,
      status: 'pending',
    }));
    req.session.flash_message('ส่งคำขอแก้เวลาเข้างานให้หัวหน้าอนุมัติแล้ว');
  } catch (error) {
    console.error('Failed to create attendance correction for user %s: %s', req.user.id, error.message);
    req.session.flash_error(error.user_message || 'ส่งคำขอแก้เวลาเข้างานไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/corrections/');
});

async function decideAttendanceCorrection(req, action) {
  const db = req.app.get('db_model');
  const company = await req.user.getCompany();
  if (!/^\d+$/.test(String(req.params.id))) throw Object.assign(new Error('Invalid correction request id'), {user_message: 'ไม่พบคำขอแก้เวลาเข้างาน'});

  return db.sequelize.transaction(async transaction => {
    const request = await db.AttendanceCorrectionRequest.findOne({
      where: {id: req.params.id, company_id: company.id, approver_user_id: req.user.id, status: 'pending'},
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) throw Object.assign(new Error('Correction request is unavailable'), {user_message: 'คำขอนี้ถูกดำเนินการแล้วหรือคุณไม่มีสิทธิ์อนุมัติ'});

    if (action === 'approve') {
      const attendance = await db.Attendance.findOne({
        where: {id: request.attendance_id, user_id: request.user_id},
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!attendance) throw Object.assign(new Error('Attendance record is missing'), {user_message: 'ไม่พบรายการ Clock-in ที่ต้องการแก้ไข'});
      const result = attendanceLogic.clockInResult(company, request.requested_clock_in_at);
      await attendance.updateAttributes({
        clock_in_at: request.requested_clock_in_at,
        status: result.status,
        minutes_late: result.minutes_late,
      }, {transaction});
    }

    const updated = await db.AttendanceCorrectionRequest.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: new Date(),
    }, {where: {id: request.id, status: 'pending'}, transaction});
    if (!updated[0]) throw Object.assign(new Error('Correction request was already decided'), {user_message: 'คำขอนี้ถูกดำเนินการแล้ว'});
  });
}

router.post('/corrections/:id/approve/', async function(req, res) {
  try {
    await decideAttendanceCorrection(req, 'approve');
    req.session.flash_message('อนุมัติการแก้เวลาเข้างานแล้ว');
  } catch (error) {
    console.error('Failed to approve attendance correction %s: %s', req.params.id, error.message);
    req.session.flash_error(error.user_message || 'อนุมัติคำขอไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/corrections/');
});

router.post('/corrections/:id/reject/', async function(req, res) {
  try {
    await decideAttendanceCorrection(req, 'reject');
    req.session.flash_message('ปฏิเสธการแก้เวลาเข้างานแล้ว');
  } catch (error) {
    console.error('Failed to reject attendance correction %s: %s', req.params.id, error.message);
    req.session.flash_error(error.user_message || 'ปฏิเสธคำขอไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/corrections/');
});

router.get('/overtime/', async function(req, res, next) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    const holidayDates = (await db.BankHoliday.findAll({where: {companyId: company.id}}))
      .map(item => moment.utc(item.date).format('YYYY-MM-DD'));
    const hasReportAccess = canViewAttendanceReports(req.user);
    const where = hasReportAccess
      ? {company_id: company.id}
      : {company_id: company.id, $or: [{user_id: req.user.id}, {approver_user_id: req.user.id}]};
    const requests = await db.OvertimeRequest.findAll({
      where,
      include: [
        {model: db.User, as: 'user'},
        {model: db.User, as: 'approver'},
      ],
      order: [['created_at', 'DESC']],
    });

    requests.forEach(item => {
      item.statusLabel = req.__(item.status.charAt(0).toUpperCase() + item.status.slice(1));
      item.canDecide = ['pending', 'cancellation_pending'].includes(item.status) && String(item.approver_user_id) === String(req.user.id);
      item.canCancel = ['pending', 'approved'].includes(item.status) && String(item.user_id) === String(req.user.id);
      item.isCancellationPending = item.status === 'cancellation_pending';
    });

    const ownApproved = requests.filter(item => ['approved', 'cancellation_pending'].includes(item.status) && (hasReportAccess || String(item.user_id) === String(req.user.id)));
    res.locals.custom_java_script.push('/js/overtime.js');
    const today = attendanceLogic.companyMoment(company);
    res.render('overtime_requests', {
      requests,
      approvedMinutes: ownApproved.reduce((total, item) => total + Number(item.overtime_minutes), 0),
      approvedRate1Minutes: ownApproved.reduce((total, item) => total + Number(item.rate_1_minutes || 0), 0),
      approvedRate15Minutes: ownApproved.reduce((total, item) => total + Number(item.rate_1_5_minutes || 0), 0),
      approvedRate3Minutes: ownApproved.reduce((total, item) => total + Number(item.rate_3_minutes || 0), 0),
      approvedNights: ownApproved.reduce((total, item) => total + Number(item.overnight_nights), 0),
      today: today.format('YYYY-MM-DD'),
      todayDisplay: today.format('DD/MM/YYYY'),
      workStartTime: company.attendance_start_time,
      workEndTime: company.attendance_end_time,
      holidayDates: holidayDates.join(','),
      isSystemAdmin: req.user.admin,
      title: req.__('Retrospective OT requests'),
    });
  } catch (error) { next(error); }
});

router.post('/overtime/', async function(req, res) {
  const db = req.app.get('db_model');
  try {
    if (req.user.admin) throw Object.assign(new Error('System administrator is not an employee'), {user_message: 'บัญชีผู้ดูแลระบบไม่สามารถยื่นคำขอ OT ได้'});
    const company = await req.user.getCompany();
    const dateStart = overtimeRequestLogic.parseDate(req.body.date_start);
    const dateEnd = overtimeRequestLogic.parseDate(req.body.date_end);
    let holidayDates = [];
    if (dateStart.isValid() && dateEnd.isValid() && !dateStart.isAfter(dateEnd) && dateEnd.diff(dateStart, 'days') <= 31) {
      holidayDates = (await db.BankHoliday.findAll({
        where: {companyId: company.id, date: {$gte: dateStart.toDate(), $lte: dateEnd.clone().endOf('day').toDate()}},
      })).map(item => moment.utc(item.date).format('YYYY-MM-DD'));
    }
    const values = overtimeRequestLogic.validateRequest(
      req.body,
      attendanceLogic.companyMoment(company).format('YYYY-MM-DD'),
      {start_time: company.attendance_start_time, end_time: company.attendance_end_time, holiday_dates: holidayDates}
    );
    const approver = await resolveInitialApprover({
      employee: req.user,
      departmentId: req.user.DepartmentId,
      dbModel: db,
    });
    if (!approver || String(approver.id) === String(req.user.id)) {
      throw Object.assign(new Error('No overtime approver configured'), {user_message: 'ยังไม่ได้กำหนดหัวหน้าผู้อนุมัติ OT'});
    }

    const duplicate = await db.OvertimeRequest.findOne({
      where: {
        company_id: company.id,
        user_id: req.user.id,
        date_start: values.date_start,
        date_end: values.date_end,
        overtime_start_time: values.overtime_start_time,
        overtime_end_time: values.overtime_end_time,
        overtime_minutes: values.overtime_minutes,
        rate_1_minutes: values.rate_1_minutes,
        rate_1_5_minutes: values.rate_1_5_minutes,
        rate_3_minutes: values.rate_3_minutes,
        overnight_nights: values.overnight_nights,
        status: {$in: ['pending', 'approved', 'cancellation_pending']},
      },
    });
    if (duplicate) throw Object.assign(new Error('Duplicate overtime request'), {user_message: 'มีคำขอ OT รายการเดียวกันอยู่แล้ว'});

    await db.OvertimeRequest.create(Object.assign(values, {
      company_id: company.id,
      user_id: req.user.id,
      approver_user_id: approver.id,
      status: 'pending',
    }));
    req.session.flash_message('ส่งคำขอ OT ให้หัวหน้าอนุมัติแล้ว');
  } catch (error) {
    console.error('Failed to create overtime request for user %s: %s', req.user.id, error.message);
    req.session.flash_error(error.user_message || 'สร้างคำขอ OT ไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/overtime/');
});

async function decideOvertimeRequest(req, action) {
  const db = req.app.get('db_model');
  const company = await req.user.getCompany();
  if (!/^\d+$/.test(String(req.params.id))) throw Object.assign(new Error('Invalid overtime request id'), {user_message: 'ไม่พบคำขอ OT'});
  const request = await db.OvertimeRequest.findOne({
    where: {
      id: req.params.id,
      company_id: company.id,
      approver_user_id: req.user.id,
      status: {$in: ['pending', 'cancellation_pending']},
    },
  });
  if (!request) throw Object.assign(new Error('Overtime request is unavailable'), {user_message: 'คำขอ OT นี้ถูกดำเนินการแล้วหรือคุณไม่มีสิทธิ์อนุมัติ'});
  const status = overtimeRequestLogic.decisionStatus(request.status, action);
  const updated = await db.OvertimeRequest.update({status, decided_at: new Date()}, {where: {id: request.id, status: request.status}});
  if (!updated[0]) throw Object.assign(new Error('Overtime request was already decided'), {user_message: 'คำขอ OT นี้ถูกดำเนินการแล้ว'});
}

router.post('/overtime/:id/approve/', async function(req, res) {
  try {
    await decideOvertimeRequest(req, 'approve');
    req.session.flash_message('อนุมัติรายการ OT แล้ว');
  } catch (error) {
    console.error('Failed to approve overtime request %s: %s', req.params.id, error.message);
    req.session.flash_error(error.user_message || 'อนุมัติคำขอ OT ไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/overtime/');
});

router.post('/overtime/:id/reject/', async function(req, res) {
  try {
    await decideOvertimeRequest(req, 'reject');
    req.session.flash_message('ปฏิเสธรายการ OT แล้ว');
  } catch (error) {
    console.error('Failed to reject overtime request %s: %s', req.params.id, error.message);
    req.session.flash_error(error.user_message || 'ปฏิเสธคำขอ OT ไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/overtime/');
});

router.post('/overtime/:id/cancel/', async function(req, res) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    if (!/^\d+$/.test(String(req.params.id))) throw Object.assign(new Error('Invalid overtime request id'), {user_message: 'ไม่พบคำขอ OT'});
    const request = await db.OvertimeRequest.findOne({
      where: {id: req.params.id, company_id: company.id, user_id: req.user.id, status: {$in: ['pending', 'approved']}},
    });
    if (!request) throw Object.assign(new Error('Overtime request cannot be cancelled'), {user_message: 'คำขอ OT นี้ไม่สามารถยกเลิกได้'});
    const status = overtimeRequestLogic.cancellationStatus(request.status);
    const updated = await db.OvertimeRequest.update({status, decided_at: null}, {where: {id: request.id, status: request.status}});
    if (!updated[0]) throw Object.assign(new Error('Overtime request changed'), {user_message: 'สถานะคำขอ OT เปลี่ยนแปลงแล้ว กรุณาลองใหม่'});
    req.session.flash_message(status === 'cancelled' ? 'ยกเลิกคำขอ OT แล้ว' : 'ส่งคำขอยกเลิก OT ให้หัวหน้าอนุมัติแล้ว');
  } catch (error) {
    console.error('Failed to cancel overtime request %s: %s', req.params.id, error.message);
    req.session.flash_error(error.user_message || 'ยกเลิกคำขอ OT ไม่สำเร็จ');
  }
  res.redirect_with_session('/attendance/overtime/');
});

router.get('/settings/', ensureAdmin, async function(req, res, next) {
  try {
    res.locals.custom_java_script.push('/js/attendance.js');
    res.render('attendance_settings', {company: await req.user.getCompany(), title: req.__('Attendance settings')});
  } catch (error) { next(error); }
});

router.post('/settings/', ensureAdmin, async function(req, res) {
  try {
    const company = await req.user.getCompany();
    const enabled = req.body.attendance_enabled === 'on';
    const latitude = req.body.attendance_latitude === '' ? null : Number(req.body.attendance_latitude);
    const longitude = req.body.attendance_longitude === '' ? null : Number(req.body.attendance_longitude);
    const radius = Number(req.body.attendance_radius_m);
    const grace = Number(req.body.attendance_grace_minutes);
    const otAfter = Number(req.body.attendance_ot_after_minutes);
    const start = attendanceLogic.parseTime(req.body.attendance_start_time);
    const end = attendanceLogic.parseTime(req.body.attendance_end_time);
    const startMinutes = start && start.hour * 60 + start.minute;
    const endMinutes = end && end.hour * 60 + end.minute;
    if (enabled && (latitude === null || longitude === null)) throw new Error('กรุณาระบุพิกัดสำนักงานก่อนเปิดระบบ');
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error('ละติจูดไม่ถูกต้อง');
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('ลองจิจูดไม่ถูกต้อง');
    if (!Number.isInteger(radius) || radius < 20 || radius > 5000) throw new Error('รัศมีต้องอยู่ระหว่าง 20–5,000 เมตร');
    if (!start || !end || startMinutes >= endMinutes) throw new Error('เวลาเริ่มงานต้องอยู่ก่อนเวลาเลิกงาน');
    if (!Number.isInteger(grace) || grace < 0 || grace > 180) throw new Error('เวลาผ่อนผันต้องอยู่ระหว่าง 0–180 นาที');
    if (!Number.isInteger(otAfter) || otAfter < 0 || otAfter > 360) throw new Error('เกณฑ์ OT ต้องอยู่ระหว่าง 0–360 นาที');
    await company.updateAttributes({
      attendance_enabled: enabled,
      attendance_verification_mode: 'gps',
      attendance_location_name: String(req.body.attendance_location_name || '').trim().slice(0, 100) || null,
      attendance_latitude: latitude,
      attendance_longitude: longitude,
      attendance_radius_m: radius,
      attendance_start_time: req.body.attendance_start_time,
      attendance_end_time: req.body.attendance_end_time,
      attendance_grace_minutes: grace,
      attendance_ot_after_minutes: otAfter,
    });
    req.session.flash_message('บันทึกการตั้งค่าลงเวลาแล้ว');
  } catch (error) {
    console.error('Failed to save attendance settings: %s', error.message);
    req.session.flash_error(error.message);
  }
  res.redirect_with_session('/attendance/settings/');
});

router.get('/report/', ensureCanViewReports, async function(req, res, next) {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : attendanceLogic.companyMoment(company).format('YYYY-MM-DD');
    const day = moment.tz(requestedDate, 'YYYY-MM-DD', true, company.timezone);
    if (!day.isValid()) throw new Error('Invalid report date');
    const users = await db.User.findAll({where: {companyId: company.id, admin: false}, order: [['lastname'], ['name']]});
    const records = await db.Attendance.findAll({where: {company_id: company.id, work_date: requestedDate}});
    const leaves = await db.Leave.findAll({
      where: {
        status: {$in: [db.Leave.status_approved(), db.Leave.status_pended_revoke()]},
        date_start: {$lte: day.clone().endOf('day').toDate()},
        date_end: {$gte: day.clone().startOf('day').toDate()},
      },
    });
    const holiday = await db.BankHoliday.findOne({where: {companyId: company.id, date: {$gte: day.clone().startOf('day').toDate(), $lte: day.clone().endOf('day').toDate()}}});
    const recordsByUser = records.reduce((map, record) => { map[record.user_id] = record; return map; }, {});
    const leaveUsers = leaves.reduce((map, leave) => { map[leave.userId] = true; return map; }, {});
    const now = attendanceLogic.companyMoment(company);
    const end = attendanceLogic.timeOnDate(requestedDate, company.attendance_end_time, company.timezone);
    const rows = await Promise.all(users.map(async user => {
      const record = recordsByUser[user.id];
      const schedule = await user.promise_schedule_I_obey();
      let status = 'pending';
      if (day.isBefore(moment.tz(user.start_date, 'YYYY-MM-DD', company.timezone), 'day')
        || (user.end_date && day.isAfter(moment.tz(user.end_date, 'YYYY-MM-DD', company.timezone), 'day'))) status = 'not_employed';
      else if (!schedule.is_it_working_day({day})) status = 'day_off';
      else if (holiday) status = 'holiday';
      else if (record) status = record.status;
      else if (leaveUsers[user.id]) status = 'leave';
      else if (now.isAfter(end)) status = 'absent';
      return {
        user,
        record,
        status,
        statusLabel: req.__(status),
        clockInTime: record && moment(record.clock_in_at).tz(company.timezone).format('HH:mm:ss'),
        clockOutTime: record && record.clock_out_at && moment(record.clock_out_at).tz(company.timezone).format('HH:mm:ss'),
        verificationLabel: record && req.__(record.verification_mode),
      };
    }));
    res.render('attendance_report', {company, rows, requestedDate, title: req.__('Attendance report')});
  } catch (error) { next(error); }
});

module.exports = router;
