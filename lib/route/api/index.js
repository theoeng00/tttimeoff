
"use strict";

const
  express = require('express'),
  router = express.Router();


const NOTIFICATION_TYPE_PENDING_REQUESTS = 'pending_request';
const NOTIFICATION_TYPE_PENDING_OVERTIME = 'pending_overtime';

/**
 *  Factory method that created a notification of given type
 */
const newNotification = ({type, value}) => {

  if (type === NOTIFICATION_TYPE_PENDING_REQUESTS) {
    return {
      type,
      numberOfRequests: value,
      label: (value === 1 ? 'A leave request to process' : `${value} leave requests to process`),
      link: '/requests/',
    }
  }

  if (type === NOTIFICATION_TYPE_PENDING_OVERTIME) {
    return {
      type,
      numberOfRequests: value,
      label: (value === 1 ? 'An OT request to process' : `${value} OT requests to process`),
      link: '/attendance/overtime/',
    }
  }

  return null;
};

router.get('/notifications/', async (req, res) => {
  const actingUser = req.user;

  const data = [];

  try {
    const leaves = await actingUser.promise_leaves_to_be_processed();

    if (leaves.length > 0) {
      data.push(newNotification({type: NOTIFICATION_TYPE_PENDING_REQUESTS, value: leaves.length}));
    }

    const overtimeRequests = await req.app.get('db_model').OvertimeRequest.count({
      where: {company_id: actingUser.companyId, approver_user_id: actingUser.id, status: {$in: ['pending', 'cancellation_pending']}},
    });
    if (overtimeRequests > 0) {
      data.push(newNotification({type: NOTIFICATION_TYPE_PENDING_OVERTIME, value: overtimeRequests}));
    }

    res.json({data});
  } catch (error) {
    console.log(`Failed to fetch notifications for user [${actingUser.id}]: ${error} at ${error.stack}`);
    res.json({ error: 'Failed to fetch notifications.' });
  }
});

module.exports = router;
