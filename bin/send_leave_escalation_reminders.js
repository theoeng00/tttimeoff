'use strict';

const dbModel = require('../lib/model/db');
const {sendDueEscalationReminders} = require('../lib/model/leave_escalation_reminder');

sendDueEscalationReminders({dbModel})
  .then(sent => {
    console.log(`Sent ${sent} leave escalation reminder(s)`);
    return dbModel.sequelize.close();
  })
  .catch(error => {
    console.error(`Failed to send leave escalation reminders: ${error.stack}`);
    process.exitCode = 1;
    return dbModel.sequelize.close();
  });
