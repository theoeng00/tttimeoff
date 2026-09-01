'use strict';

const moment = require('moment-timezone');

function userError(message) {
  const error = new Error(message);
  error.user_message = message;
  throw error;
}

function validateRequest(input, attendance, timezone) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input.requested_clock_in_time || '').trim())
    ? String(input.requested_clock_in_time).trim()
    : null;
  const reason = String(input.reason || '').trim();
  const workDate = String(attendance.work_date || '');
  const requested = time && moment.tz(`${workDate} ${time}`, 'YYYY-MM-DD HH:mm', true, timezone);
  const original = moment(attendance.clock_in_at).tz(timezone);

  if (!requested || !requested.isValid()) userError('กรุณาระบุเวลาเข้างานที่ต้องการแก้ไข');
  if (!original.isValid()) throw new Error('Invalid original clock-in time');
  if (!requested.isBefore(original)) userError('เวลาเข้างานที่ขอแก้ต้องอยู่ก่อนเวลาที่กด Clock-in จริง');
  if (!reason || reason.length > 1000) userError('กรุณาระบุเหตุผลไม่เกิน 1,000 ตัวอักษร');

  return {requested_clock_in_at: requested.toDate(), reason};
}

module.exports = {validateRequest};
