'use strict';

const moment = require('moment');

function userError(message) {
  const error = new Error(message);
  error.user_message = message;
  throw error;
}

function parseTime(value) {
  const match = /^(\d{1,2})[.:]([0-5]\d)$/.exec(String(value || '').trim());
  if (!match || Number(match[1]) > 23) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    value: `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`,
  };
}

function parseDate(value) {
  const raw = String(value || '').trim();
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const normalised = slashDate
    ? `${slashDate[3]}-${slashDate[2].padStart(2, '0')}-${slashDate[1].padStart(2, '0')}`
    : raw;
  return moment.utc(normalised, 'YYYY-MM-DD', true);
}

function cancellationStatus(status) {
  if (status === 'pending') return 'cancelled';
  if (status === 'approved') return 'cancellation_pending';
  return null;
}

function decisionStatus(status, action) {
  if (status === 'pending') return action === 'approve' ? 'approved' : 'rejected';
  if (status === 'cancellation_pending') return action === 'approve' ? 'cancelled' : 'approved';
  return null;
}

function calculateOvertimeMinutes(timeStart, timeEnd, workStartValue, workEndValue) {
  const workStart = parseTime(workStartValue || '08:30');
  const workEnd = parseTime(workEndValue || '17:30');
  if (!timeStart || !timeEnd || !workStart || !workEnd) throw new Error('Invalid overtime or company working hours');

  const start = timeStart.hour * 60 + timeStart.minute;
  let end = timeEnd.hour * 60 + timeEnd.minute;
  if (end <= start) end += 1440;
  const workStartMinutes = workStart.hour * 60 + workStart.minute;
  const workEndMinutes = workEnd.hour * 60 + workEnd.minute;
  const overlap = [0, 1440].reduce(function(total, dayOffset) {
    return total + Math.max(0, Math.min(end, workEndMinutes + dayOffset) - Math.max(start, workStartMinutes + dayOffset));
  }, 0);
  return end - start - overlap;
}

function calculateOvertimeBreakdown(args) {
  const timeStart = args.timeStart;
  const timeEnd = args.timeEnd;
  const workStart = parseTime(args.workStartValue || '08:30');
  const workEnd = parseTime(args.workEndValue || '17:30');
  const dateStart = parseDate(args.dateStart);
  if (!timeStart || !timeEnd || !workStart || !workEnd || !dateStart.isValid()) {
    throw new Error('Invalid overtime date, time, or company working hours');
  }

  const start = timeStart.hour * 60 + timeStart.minute;
  let end = timeEnd.hour * 60 + timeEnd.minute;
  if (end <= start) end += 1440;
  const workStartMinutes = workStart.hour * 60 + workStart.minute;
  const workEndMinutes = workEnd.hour * 60 + workEnd.minute;
  const holidayDates = new Set(args.holidayDates || []);
  const result = {rate_1_minutes: 0, rate_1_5_minutes: 0, rate_3_minutes: 0};

  // ponytail: ไล่ทีละนาทีสูงสุด 24 ชม. เพื่อให้โค้ดแบ่งเรตข้ามเที่ยงคืนตรงไปตรงมา
  // หากอนาคตรองรับคำขอหลายวันในรายการเดียว ค่อยเปลี่ยนเป็นการตัดช่วงเวลาแบบ interval
  for (let minute = start; minute < end; minute += 1) {
    const dayOffset = Math.floor(minute / 1440);
    const minuteOfDay = minute % 1440;
    const date = dateStart.clone().add(dayOffset, 'day');
    const isHoliday = date.isoWeekday() >= 6 || holidayDates.has(date.format('YYYY-MM-DD'));
    const isNormalHours = minuteOfDay >= workStartMinutes && minuteOfDay < workEndMinutes;
    if (isHoliday) result[isNormalHours ? 'rate_1_minutes' : 'rate_3_minutes'] += 1;
    else if (!isNormalHours) result.rate_1_5_minutes += 1;
  }

  return result;
}

function validateRequest(input, today, workingHours) {
  const dateStart = parseDate(input.date_start);
  const dateEnd = parseDate(input.date_end);
  const currentDate = moment.utc(today, 'YYYY-MM-DD', true);
  const hasTimeStart = Boolean(String(input.overtime_start_time || '').trim());
  const hasTimeEnd = Boolean(String(input.overtime_end_time || '').trim());
  const timeStart = hasTimeStart ? parseTime(input.overtime_start_time) : null;
  const timeEnd = hasTimeEnd ? parseTime(input.overtime_end_time) : null;
  const overnightNights = Number(input.overnight_nights);
  const reason = String(input.reason || '').trim();

  if (!dateStart.isValid() || !dateEnd.isValid()) userError('กรุณาระบุวันที่เป็น วัน/เดือน/ค.ศ. เช่น 28/08/2026');
  if (!currentDate.isValid()) throw new Error('Invalid current date');
  if (dateStart.isAfter(dateEnd)) userError('วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด');
  if (dateEnd.isAfter(currentDate)) userError('คำขอ OT ย้อนหลังต้องไม่เกินวันที่ปัจจุบัน');
  if (dateEnd.diff(dateStart, 'days') > 31) userError('หนึ่งคำขอระบุช่วงเวลาได้ไม่เกิน 31 วัน');
  if (hasTimeStart !== hasTimeEnd) userError('หากมี OT เป็นเวลา กรุณาระบุเวลาเริ่มและสิ้นสุดให้ครบ');
  if ((hasTimeStart && !timeStart) || (hasTimeEnd && !timeEnd)) userError('กรุณาระบุเวลา OT ให้ถูกต้อง เช่น 6.30 หรือ 06:30');
  const startMinutes = timeStart ? timeStart.hour * 60 + timeStart.minute : 0;
  const endMinutes = timeEnd ? timeEnd.hour * 60 + timeEnd.minute : 0;
  // ponytail: ช่วงวันที่อาจใช้กับค่าเหมาค้างคืน แต่ OT แบบระบุเวลาผูกกับ date_start
  // และข้ามได้ไม่เกินเช้าวันถัดไป หากต้องลง OT หลายวันให้แยกคำขอต่อวัน
  const breakdown = timeStart ? calculateOvertimeBreakdown({
    dateStart: dateStart.format('YYYY-MM-DD'),
    timeStart,
    timeEnd,
    workStartValue: workingHours && workingHours.start_time,
    workEndValue: workingHours && workingHours.end_time,
    holidayDates: workingHours && workingHours.holiday_dates,
  }) : {rate_1_minutes: 0, rate_1_5_minutes: 0, rate_3_minutes: 0};
  const overtimeMinutes = breakdown.rate_1_minutes + breakdown.rate_1_5_minutes + breakdown.rate_3_minutes;
  if (timeStart && timeStart.value === timeEnd.value) userError('เวลาเริ่มและสิ้นสุด OT ต้องไม่เท่ากัน');
  if (timeStart && endMinutes < startMinutes && dateStart.isSame(dateEnd)) userError('OT ที่ข้ามเที่ยงคืนต้องระบุวันสิ้นสุดเป็นวันถัดไป');
  if (!Number.isInteger(overnightNights) || overnightNights < 0 || overnightNights > dateEnd.diff(dateStart, 'days')) userError('จำนวนคืนต้องไม่เกินจำนวนคืนในช่วงวันที่เดินทาง');
  if (!overtimeMinutes && !overnightNights) userError('กรุณาระบุเวลา OT หรือจำนวนคืนแบบเหมาอย่างน้อยหนึ่งรายการ');
  if (!reason || reason.length > 1000) userError('กรุณาระบุเหตุผลไม่เกิน 1,000 ตัวอักษร');

  return {
    date_start: dateStart.format('YYYY-MM-DD'),
    date_end: dateEnd.format('YYYY-MM-DD'),
    overtime_start_time: timeStart ? timeStart.value : null,
    overtime_end_time: timeEnd ? timeEnd.value : null,
    overtime_minutes: overtimeMinutes,
    rate_1_minutes: breakdown.rate_1_minutes,
    rate_1_5_minutes: breakdown.rate_1_5_minutes,
    rate_3_minutes: breakdown.rate_3_minutes,
    overnight_nights: overnightNights,
    reason,
  };
}

module.exports = {calculateOvertimeBreakdown, calculateOvertimeMinutes, cancellationStatus, decisionStatus, parseDate, parseTime, validateRequest};
