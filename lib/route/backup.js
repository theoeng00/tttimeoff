'use strict';

const childProcess = require('child_process');
const express = require('express');
const path = require('path');
const ensureUserCanBackup = require('../middleware/ensure_user_can_backup');

const router = express.Router();
let backupInProgress = false;

router.all(/.*/, ensureUserCanBackup);

router.get('/', (_req, res) => {
  res.render('settings_backup', {title: 'Backup'});
});

router.post('/', async (req, res) => {
  if (backupInProgress) {
    req.session.flash_error(req.__('A backup is already running'));
    return res.redirect_with_session('/backup/');
  }

  // ponytail: lock นี้กันงานซ้ำได้ภายใน process เดียว หากเปลี่ยนเป็นหลาย worker ให้ย้าย lock ไปฐานข้อมูลหรือ Redis
  backupInProgress = true;

  try {
    await runGoogleDriveBackup();
    req.session.flash_message(req.__('Backup completed successfully'));
  } catch (error) {
    console.error(`Manual Google Drive backup failed: ${error.message}`);
    req.session.flash_error(req.__('Backup failed. Please check the server log.'));
  } finally {
    backupInProgress = false;
  }

  return res.redirect_with_session('/backup/');
});

function runGoogleDriveBackup() {
  const projectRoot = path.resolve(__dirname, '../..');

  return new Promise((resolve, reject) => {
    childProcess.execFile(
      process.execPath,
      ['--use-system-ca', path.join(projectRoot, 'bin', 'backup_to_google_drive.js')],
      {cwd: projectRoot, timeout: 300000, windowsHide: true},
      (error, stdout, stderr) => {
        if (error) return reject(new Error((stderr || stdout || error.message).trim()));
        resolve(stdout.trim());
      }
    );
  });
}

module.exports = router;
