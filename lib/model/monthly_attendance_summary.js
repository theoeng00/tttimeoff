'use strict';

const moment = require('moment');

const leaveFraction = part => ({1: 1, 2: 0.5, 3: 0.5, 4: 0.25}[part] || 1);

const leaveFractionOnDate = (leave, date) => {
  const day = moment.utc(date).startOf('day');
  const start = moment.utc(leave.date_start).startOf('day');
  const end = moment.utc(leave.date_end).startOf('day');
  if (day.isBefore(start) || day.isAfter(end)) return 0;
  if (day.isSame(start, 'day')) return leaveFraction(leave.day_part_start);
  if (day.isSame(end, 'day')) return leaveFraction(leave.day_part_end);
  return 1;
};

const leaveDates = leaves => leaves.reduce((dates, leave) => {
  const start = moment.utc(leave.date_start).startOf('day');
  const end = moment.utc(leave.date_end).startOf('day');
  for (const day = start.clone(); !day.isAfter(end, 'day'); day.add(1, 'day')) dates[day.format('YYYY-MM-DD')] = true;
  return dates;
}, {});

module.exports = {leaveFractionOnDate, leaveDates};
