
'use strict';

const
  moment = require('moment'),
  Promise= require('bluebird');
const cutoffPeriod = require('../util/cutoff_period');

const calculateCarryOverAllowance = ({users}) => {

  const
    currentPeriod = cutoffPeriod.year(moment.utc()),
    yearFrom = currentPeriod.year - 1,
    yearTo = currentPeriod.year,
    previousPeriod = cutoffPeriod.forYear(yearFrom);

  let flow = Promise.resolve(users);

  flow = flow.then(users => Promise.map(
    users,
    user => {
      let carryOver;
      return Promise.resolve(user.getCompany().then(c => carryOver = c.carry_over))
        .then(() => user.reload_with_leave_details({year: previousPeriod.start}))
        .then(user => user.promise_allowance({
          year: previousPeriod.start,
          now: previousPeriod.end,
          forceNow: true,
        }))
        .then(allowance => {

          const carried_over_allowance = (carryOver === 0)
            ? 0
            : Math.min(allowance.number_of_days_available_in_allowance, carryOver);

          return user.promise_to_update_carried_over_allowance({
            carried_over_allowance,
            year: yearTo,
          });
        })
        .then(() => console.log(`Carried over unused allowance ${yearFrom} -> ${yearTo} for user ${user.id}`));
    },
    {concurrency : 1}
  ));

  return flow;
};

module.exports = { calculateCarryOverAllowance };
