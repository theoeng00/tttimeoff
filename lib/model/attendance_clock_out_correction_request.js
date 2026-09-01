'use strict';

const moment = require('moment-timezone');

function userError(message) {
  const error = new Error(message);
  error.user_message = message;
  throw error;
}

function validateRequest(input, attendance, timezone, now) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input.requested_clock_out_time || '').trim())
    ? String(input.requested_clock_out_time).trim()
    : null;
  const reason = String(input.reason || '').trim();
  const workDate = String(attendance.work_date || '');
  const requested = time && moment.tz(`${workDate} ${time}`, 'YYYY-MM-DD HH:mm', true, timezone);
  const clockIn = moment(attendance.clock_in_at).tz(timezone);
  const current = moment(now || undefined).tz(timezone);

  if (!requested || !requested.isValid()) userError('กรุณาระบุเวลาออกงานที่ต้องการแก้ไข');
  if (!clockIn.isValid()) throw new Error('Invalid original clock-in time');
  if (!requested.isAfter(clockIn)) userError('เวลาออกงานต้องอยู่หลังเวลา Clock-in');
  if (requested.isAfter(current)) userError('เวลาออกงานต้องไม่อยู่ในอนาคต');
  if (!reason || reason.length > 1000) userError('กรุณาระบุเหตุผลไม่เกิน 1,000 ตัวอักษร');

  return {requested_clock_out_at: requested.toDate(), reason};
}

module.exports = {validateRequest};
