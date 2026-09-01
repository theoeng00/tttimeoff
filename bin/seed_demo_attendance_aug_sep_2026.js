'use strict';

const moment = require('moment-timezone');
const db = require('../lib/model/db');

const START = '2026-07-21';
const END = '2026-09-20';
const ATTENDANCE_PERIODS = [
  {start: '2026-07-21', end: '2026-08-20'},
  {start: '2026-08-21', end: '2026-09-20'},
];
const LEAVE_STATUS_APPROVED = db.Leave.status_approved();

function daysBetween(start, end) {
  const days = [];
  for (const day = moment.utc(start); !day.isAfter(end, 'day'); day.add(1, 'day')) days.push(day.format('YYYY-MM-DD'));
  return days;
}

function timestamp(date, time, timezone) {
  return moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timezone).toDate();
}

function addRange(target, userId, start, end) {
  daysBetween(start, end).forEach(day => target.add(`${userId}:${day}`));
}

async function seed() {
  const users = await db.User.findAll({
    where: {companyId: 1, admin: false},
    attributes: ['id', 'email', 'name', 'lastname', 'DepartmentId'],
  });
  const byEmail = users.reduce((result, user) => Object.assign(result, {[user.email]: user}), {});
  const requiredEmails = ['s01@theo.co.th', 'ss01@theo.co.th', 's02@theo.co.th', 's03@theo.co.th', 'ss02@theo.co.th', 'dev01@theo.co.th'];
  if (requiredEmails.some(email => !byEmail[email])) throw new Error('Demo employees are missing; no data was created');

  const company = await db.Company.findOne({where: {id: 1}});
  const timezone = company.timezone || 'Asia/Bangkok';
  const leaveType = await db.LeaveType.findOne({where: {companyId: company.id}, order: [['id', 'ASC']]});
  const approver = await db.User.findOne({where: {companyId: company.id, admin: true}});
  if (!leaveType || !approver) throw new Error('Leave type or administrator is missing; no data was created');

  const demoLeaves = [
    {user: byEmail['ss02@theo.co.th'], start: '2026-07-27', end: '2026-07-28', startPart: 1, endPart: 1, reason: 'ข้อมูลจำลอง: ลาพักผ่อนเดือนกรกฎาคม'},
    {user: byEmail['s02@theo.co.th'], start: '2026-08-05', end: '2026-08-05', startPart: 3, endPart: 3, reason: 'ข้อมูลจำลอง: ลาครึ่งวันเดือนกรกฎาคม'},
    {user: byEmail['dev01@theo.co.th'], start: '2026-08-12', end: '2026-08-12', startPart: 4, endPart: 4, reason: 'ข้อมูลจำลอง: ลา 2 ชั่วโมงเดือนกรกฎาคม'},
    {user: byEmail['ss01@theo.co.th'], start: '2026-09-02', end: '2026-09-03', startPart: 1, endPart: 1, reason: 'ข้อมูลจำลอง: ลาพักผ่อน'},
    {user: byEmail['s03@theo.co.th'], start: '2026-08-31', end: '2026-08-31', startPart: 2, endPart: 2, reason: 'ข้อมูลจำลอง: ลาครึ่งวัน'},
    {user: byEmail['dev01@theo.co.th'], start: '2026-09-10', end: '2026-09-10', startPart: 4, endPart: 4, reason: 'ข้อมูลจำลอง: ลา 2 ชั่วโมง'},
  ];

  for (const leave of demoLeaves) {
    await db.Leave.findOrCreate({
      where: {userId: leave.user.id, employee_comment: leave.reason, date_start: leave.start, date_end: leave.end},
      defaults: {
        userId: leave.user.id,
        leaveTypeId: leaveType.id,
        status: LEAVE_STATUS_APPROVED,
        approverId: approver.id,
        employee_comment: leave.reason,
        date_start: leave.start,
        date_end: leave.end,
        day_part_start: leave.startPart,
        day_part_end: leave.endPart,
      },
    });
  }

  const excluded = new Set();
  const approvedLeaves = await db.Leave.findAll({
    where: {
      status: {$in: [db.Leave.status_approved(), db.Leave.status_pended_revoke()]},
      date_start: {$lte: new Date(`${END}T23:59:59.999Z`)},
      date_end: {$gte: new Date(`${START}T00:00:00.000Z`)},
    },
  });
  approvedLeaves.forEach(leave => addRange(excluded, leave.userId, moment.utc(leave.date_start).format('YYYY-MM-DD'), moment.utc(leave.date_end).format('YYYY-MM-DD')));

  const absences = new Set([
    `${byEmail['s03@theo.co.th'].id}:2026-07-24`,
    `${byEmail['ss01@theo.co.th'].id}:2026-08-17`,
    `${byEmail['dev01@theo.co.th'].id}:2026-08-24`,
    `${byEmail['ss01@theo.co.th'].id}:2026-08-26`,
  ]);
  const late = {
    [`${byEmail['s02@theo.co.th'].id}:2026-07-23`]: {time: '08:55', minutes: 25},
    [`${byEmail['dev01@theo.co.th'].id}:2026-08-07`]: {time: '09:15', minutes: 45},
    [`${byEmail['ss01@theo.co.th'].id}:2026-08-24`]: {time: '09:05', minutes: 35},
    [`${byEmail['s02@theo.co.th'].id}:2026-09-04`]: {time: '08:50', minutes: 20},
  };
  const overtimeAttendance = {
    [`${byEmail['dev01@theo.co.th'].id}:2026-07-29`]: {clockIn: '08:30', clockOut: '20:30', minutes: 180},
    [`${byEmail['ss02@theo.co.th'].id}:2026-09-07`]: {clockIn: '06:00', clockOut: '21:00', minutes: 360},
  };

  for (const user of users) {
    for (const period of ATTENDANCE_PERIODS) for (const date of daysBetween(period.start, period.end)) {
      const day = moment.utc(date);
      const key = `${user.id}:${date}`;
      if (day.isoWeekday() > 5 || excluded.has(key) || absences.has(key)) continue;
      const lateEntry = late[key];
      const overtimeEntry = overtimeAttendance[key];
      await db.Attendance.findOrCreate({
        where: {company_id: company.id, user_id: user.id, work_date: date},
        defaults: {
          company_id: company.id,
          user_id: user.id,
          work_date: date,
          clock_in_at: timestamp(date, overtimeEntry ? overtimeEntry.clockIn : (lateEntry ? lateEntry.time : '08:30'), timezone),
          clock_out_at: timestamp(date, overtimeEntry ? overtimeEntry.clockOut : '17:30', timezone),
          verification_mode: 'demo',
          status: lateEntry ? 'late' : 'on_time',
          minutes_late: lateEntry ? lateEntry.minutes : 0,
          overtime_minutes: overtimeEntry ? overtimeEntry.minutes : 0,
        },
      });
    }
  }

  const demoOvertime = [
    {
      user: byEmail['dev01@theo.co.th'], start: '2026-07-29', end: '2026-07-29', startTime: '17:30', endTime: '20:30', minutes: 180, nights: 0,
      reason: 'ข้อมูลจำลอง: OT ปิดงานประจำเดือน',
    },
    {
      user: byEmail['s03@theo.co.th'], start: '2026-08-18', end: '2026-08-19', startTime: null, endTime: null, minutes: 0, nights: 1,
      reason: 'ข้อมูลจำลอง: เดินทางต่างจังหวัด ค้างคืนเดือนกรกฎาคม',
    },
    {
      user: byEmail['ss02@theo.co.th'], start: '2026-09-07', end: '2026-09-07', startTime: '06:00', endTime: '21:00', minutes: 360, nights: 0,
      reason: 'ข้อมูลจำลอง: ปฏิบัติงานนอกเวลาปกติ',
    },
    {
      user: byEmail['s02@theo.co.th'], start: '2026-09-14', end: '2026-09-15', startTime: null, endTime: null, minutes: 0, nights: 1,
      reason: 'ข้อมูลจำลอง: เดินทางต่างจังหวัด ค้างคืน',
    },
  ];
  for (const overtime of demoOvertime) {
    await db.OvertimeRequest.findOrCreate({
      where: {user_id: overtime.user.id, reason: overtime.reason},
      defaults: {
        company_id: company.id,
        user_id: overtime.user.id,
        approver_user_id: approver.id,
        date_start: overtime.start,
        date_end: overtime.end,
        overtime_start_time: overtime.startTime,
        overtime_end_time: overtime.endTime,
        overtime_minutes: overtime.minutes,
        overnight_nights: overtime.nights,
        reason: overtime.reason,
        status: 'approved',
        decided_at: new Date(),
      },
    });
  }

  console.log(`Demo data ready for ${START} to ${END}: ${users.length} employees, ${demoLeaves.length} leave examples, 4 absences, and ${demoOvertime.length} OT examples.`);
}

seed().then(() => db.sequelize.close()).catch(error => {
  console.error(error.stack || error);
  db.sequelize.close();
  process.exit(1);
});
