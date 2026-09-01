'use strict';

const moment = require('moment-timezone');
const net = require('net');

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return {hour: Number(match[1]), minute: Number(match[2])};
}

function companyMoment(company, now) {
  return moment(now || undefined).tz(company.timezone || 'UTC');
}

function timeOnDate(day, value, timezone) {
  const parsed = parseTime(value);
  if (!parsed) throw new Error('Invalid attendance time');
  return moment.tz(day, 'YYYY-MM-DD', timezone).hour(parsed.hour).minute(parsed.minute).second(0).millisecond(0);
}

function distanceMetres(first, second) {
  const radians = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validatePosition(position) {
  position = position || {};
  if ([position.latitude, position.longitude, position.accuracy]
    .some(value => value === '' || value === null || value === undefined)) {
    const error = new Error('Missing GPS position');
    error.user_message = 'ไม่พบข้อมูลตำแหน่ง กรุณาอนุญาต GPS แล้วลองใหม่';
    throw error;
  }
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  const accuracy = Number(position.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 200) {
    const error = new Error('Invalid or insufficiently accurate GPS position');
    error.user_message = 'ไม่สามารถยืนยันตำแหน่งได้ กรุณาเปิด GPS และลองใหม่ในจุดที่สัญญาณชัดเจน';
    throw error;
  }
  return {latitude, longitude, accuracy};
}

function verifyWorkLocation(company, position) {
  const coordinates = validatePosition(position);
  const workplace = {
    latitude: Number(company.attendance_latitude),
    longitude: Number(company.attendance_longitude),
  };
  const radius = Number(company.attendance_radius_m);
  if (!Number.isFinite(workplace.latitude) || workplace.latitude < -90 || workplace.latitude > 90
    || !Number.isFinite(workplace.longitude) || workplace.longitude < -180 || workplace.longitude > 180
    || !Number.isFinite(radius) || radius <= 0) {
    const error = new Error('Attendance location is not configured');
    error.user_message = 'ยังไม่ได้ตั้งค่าพิกัดสถานที่ทำงาน';
    throw error;
  }
  const distance = distanceMetres(coordinates, workplace);
  // ponytail: เผื่อค่าคลาดเคลื่อน GPS สูงสุด 50 ม. หากต้องรองรับหลายอาคารให้แยกเป็นตารางสถานที่ในอนาคต
  const accepted = distance <= radius + Math.min(coordinates.accuracy, 50);
  if (!accepted) {
    const error = new Error('Position is outside the configured work location');
    error.user_message = `อยู่นอกพื้นที่ทำงาน (ห่างประมาณ ${Math.round(distance)} เมตร)`;
    throw error;
  }
  return Object.assign(coordinates, {distance_metres: Math.round(distance)});
}

function ipv4ToInteger(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function isAddressInCidr(remoteAddress, cidr) {
  const address = String(remoteAddress || '').replace(/^::ffff:/, '');
  const parts = String(cidr || '').split('/');
  const ip = ipv4ToInteger(address);
  const network = ipv4ToInteger(parts[0]);
  const prefix = Number(parts[1]);
  if (ip === null || network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) >>> 0 === (network & mask) >>> 0;
}

function verifyOfficeNetwork(company, remoteAddress) {
  if (!isAddressInCidr(remoteAddress, company.attendance_network_cidr)) {
    const error = new Error(`Address ${remoteAddress || 'unknown'} is outside office network`);
    error.user_message = 'ลงเวลาได้เฉพาะเมื่อเชื่อมต่อ Wi‑Fi ออฟฟิศเท่านั้น';
    throw error;
  }
  return {verification_mode: 'office_network'};
}

function verifyAttendanceRequest(company, position, remoteAddress) {
  if (company.attendance_verification_mode === 'office_network') return verifyOfficeNetwork(company, remoteAddress);
  return Object.assign(verifyWorkLocation(company, position), {verification_mode: 'gps'});
}

function clockInResult(company, now) {
  const current = companyMoment(company, now);
  const start = timeOnDate(current.format('YYYY-MM-DD'), company.attendance_start_time, company.timezone);
  const minutes = Math.max(0, current.diff(start, 'minutes'));
  const isLate = minutes > Number(company.attendance_grace_minutes || 0);
  return {status: isLate ? 'late' : 'on_time', minutes_late: isLate ? minutes : 0};
}

function clockOutResult(company, now) {
  const current = companyMoment(company, now);
  const end = timeOnDate(current.format('YYYY-MM-DD'), company.attendance_end_time, company.timezone);
  const afterEnd = Math.max(0, current.diff(end, 'minutes'));
  return {overtime_minutes: afterEnd >= Number(company.attendance_ot_after_minutes || 0) ? afterEnd : 0};
}

module.exports = {parseTime, companyMoment, timeOnDate, distanceMetres, validatePosition, verifyWorkLocation, ipv4ToInteger, isAddressInCidr, verifyOfficeNetwork, verifyAttendanceRequest, clockInResult, clockOutResult};
