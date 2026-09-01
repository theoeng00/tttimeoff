'use strict';

const crypto = require('crypto');
const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const {MAX_COMPRESSED_BYTES, extractBackup, inspectDatabase} = require('../util/database_restore');

const router = express.Router();
const projectRoot = path.resolve(__dirname, '../..');
const stagingDirectory = path.join(projectRoot, 'restore-staging');
const pendingPath = path.join(projectRoot, 'db.restore.pending.sqlite');

router.all(/.*/, require('../middleware/ensure_user_is_admin'));
router.all(/.*/, (req, res, next) => {
  if (req.app.get('db_model').sequelize.getDialect() === 'sqlite') return next();
  req.session.flash_error(req.__('In-app restore is available only for SQLite. Restore PostgreSQL backups with psql during maintenance.'));
  return res.redirect_with_session('/backup/');
});

router.get('/', (_req, res) => {
  res.render('settings_restore', {
    title: 'Restore database',
    restore_pending: fs.existsSync(pendingPath),
  });
});

router.post('/upload/', async (req, res) => {
  let uploadedPath;

  try {
    const {files} = await parseUpload(req);
    const uploaded = files.restore_backup;
    uploadedPath = uploaded && uploaded.path;

    if (!uploaded || !uploadedPath || uploaded.size === 0) throw new Error('No backup file was selected');
    if (!/\.sqlite\.gz$/i.test(uploaded.name || '')) throw new Error('Only .sqlite.gz backup files are accepted');

    await fs.promises.mkdir(stagingDirectory, {recursive: true});
    if (req.session.restore_candidate && req.session.restore_candidate.path) {
      await fs.promises.unlink(req.session.restore_candidate.path).catch(() => {});
    }

    const stagedPath = path.join(stagingDirectory, `${crypto.randomBytes(16).toString('hex')}.sqlite`);
    const summary = await extractBackup({source: uploadedPath, destination: stagedPath});

    req.session.restore_candidate = {
      path: stagedPath,
      original_name: path.basename(uploaded.name),
      created_at: Date.now(),
      summary,
    };

    return res.render('settings_restore_confirm', {
      title: 'Confirm database restore',
      filename: path.basename(uploaded.name),
      summary,
    });
  } catch (error) {
    console.error(`Restore upload validation failed: ${error.message}`);
    req.session.flash_error(req.__(error.message));
    return res.redirect_with_session('/restore/');
  } finally {
    if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
  }
});

router.post('/confirm/', async (req, res) => {
  const candidate = req.session.restore_candidate;

  try {
    if (req.body.confirm_restore !== 'yes') throw new Error('Restore confirmation is required');
    if (!candidate || !candidate.path) throw new Error('The restore candidate has expired');
    if (Date.now() - candidate.created_at > 30 * 60 * 1000) throw new Error('The restore candidate has expired');
    if (path.dirname(candidate.path) !== stagingDirectory) throw new Error('Invalid restore candidate path');
    if (fs.existsSync(pendingPath)) throw new Error('A database restore is already waiting for restart');

    await inspectDatabase(candidate.path);
    await fs.promises.copyFile(candidate.path, pendingPath, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(candidate.path);
    delete req.session.restore_candidate;

    req.session.flash_message(req.__('Restore is ready. Restart the server to apply it.'));
  } catch (error) {
    console.error(`Failed to queue database restore: ${error.message}`);
    req.session.flash_error(req.__(error.message));
  }

  return res.redirect_with_session('/restore/');
});

router.post('/cancel/', async (req, res) => {
  const candidate = req.session.restore_candidate;
  if (candidate && candidate.path && path.dirname(candidate.path) === stagingDirectory) {
    await fs.promises.unlink(candidate.path).catch(() => {});
  }
  delete req.session.restore_candidate;
  return res.redirect_with_session('/restore/');
});

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    form.maxFileSize = MAX_COMPRESSED_BYTES;
    form.parse(req, (error, fields, files) => error ? reject(error) : resolve({fields, files}));
  });
}

module.exports = router;
