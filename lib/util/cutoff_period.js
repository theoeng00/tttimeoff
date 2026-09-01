'use strict';

const moment = require('moment');

const CUTOFF_DAY = 20;

const month = value => {
  const date = moment.utc(value);
  const end = date.clone().date(CUTOFF_DAY);

  if (date.date() > CUTOFF_DAY) end.add(1, 'month');

  return {
    start: end.clone().subtract(1, 'month').date(CUTOFF_DAY + 1).startOf('day'),
    end: end.endOf('day'),
  };
};

// The cycle is named after the year in which it ends: 2026 is 2025-12-21..2026-12-20.
const year = value => {
  const date = moment.utc(value);
  const cycleYear = date.year() + (date.month() === 11 && date.date() > CUTOFF_DAY ? 1 : 0);

  return forYear(cycleYear);
};

const forYear = value => {
  const cycleYear = Number(moment.isMoment(value) ? value.year() : value);

  if (!Number.isInteger(cycleYear)) throw new TypeError('Cutoff period year must be an integer');

  return {
    year: cycleYear,
    start: moment.utc([cycleYear - 1, 11, CUTOFF_DAY + 1]).startOf('day'),
    end: moment.utc([cycleYear, 11, CUTOFF_DAY]).endOf('day'),
  };
};

module.exports = { CUTOFF_DAY, month, year, forYear };
