'use strict';

const config = require('../config');
const {sendDueEscalationReminders} = require('./leave_escalation_reminder');

function startLeaveEscalationScheduler(dbModel) {
  if (config.get('approval_escalation_reminders_enabled') === false) return;

  const configuredMinutes = Number(config.get('approval_escalation_check_minutes'));
  const intervalMs = (Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 15) * 60 * 1000;
  let running = false;

  const check = async () => {
    if (running) return;
    running = true;
    try {
      await sendDueEscalationReminders({dbModel});
    } catch (error) {
      console.error(`Leave escalation reminder check failed: ${error.stack}`);
    } finally {
      running = false;
    }
  };

  // ponytail: แต่ละ worker เรียกตัวตรวจเอง โดยใช้ atomic claim ในฐานข้อมูลกันเมลซ้ำ
  // ถ้าขยายเป็นหลายเครื่อง ให้ย้ายงานนี้ไป queue/cron กลางที่เรียก npm run leave-escalation-reminders
  const initialTimer = setTimeout(check, 5000);
  const interval = setInterval(check, intervalMs);
  initialTimer.unref();
  interval.unref();
}

module.exports = startLeaveEscalationScheduler;
