"use strict";

const crypto = require('crypto');
const express = require('express');
const {getAuditCaptureForUser} = require('../model/audit');

const router = express.Router();

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateProfileInput({body, user, ldapEnabled}) {
  const name = clean(body.name);
  const lastname = clean(body.lastname);
  const currentPassword = clean(body.current_password);
  const password = clean(body.password);
  const passwordConfirm = clean(body.password_confirm);
  const errors = [];

  if (!name || name.length > 100) errors.push('First name is required and must not exceed 100 characters');
  if (!lastname || lastname.length > 100) errors.push('Last name is required and must not exceed 100 characters');

  const wantsPasswordChange = !!(currentPassword || password || passwordConfirm);
  if (ldapEnabled && wantsPasswordChange) {
    errors.push('Password is managed by LDAP and cannot be changed here');
  } else if (wantsPasswordChange) {
    if (!currentPassword || !user.is_my_password(currentPassword)) errors.push('Current password is incorrect');
    if (!password) errors.push('New password is required');
    if (password.length > 200) errors.push('New password must not exceed 200 characters');
    if (password !== passwordConfirm) errors.push('Confirmed password does not match new password');
  }

  return {errors, attributes: {name, lastname}, password: wantsPasswordChange && !ldapEnabled ? password : null};
}

function csrfMatches(sessionToken, submittedToken) {
  if (typeof sessionToken !== 'string' || typeof submittedToken !== 'string') return false;
  const expected = Buffer.from(sessionToken);
  const actual = Buffer.from(submittedToken);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

router.all(/.*/, function(req, res, next) {
  if (!req.user) return res.redirect_with_session(303, '/');
  next();
});

router.get('/', function(req, res) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.profile_csrf_token = csrfToken;
  res.render('profile', {
    title: req.__('My profile'),
    csrfToken,
    ldapEnabled: !!req.user.company.ldap_auth_enabled,
  });
});

router.post('/', async function(req, res) {
  try {
    if (!csrfMatches(req.session.profile_csrf_token, req.body.csrf_token)) {
      req.session.flash_error(req.__('The form expired. Please try again.'));
      return res.redirect_with_session(303, '.');
    }

    const model = req.app.get('db_model');
    const result = validateProfileInput({
      body: req.body,
      user: req.user,
      ldapEnabled: !!req.user.company.ldap_auth_enabled,
    });

    result.errors.forEach(error => req.session.flash_error(req.__(error)));
    if (result.errors.length) return res.redirect_with_session(303, '.');

    const captureAuditTrail = getAuditCaptureForUser({
      byUser: req.user,
      forUser: req.user.get({plain: true}),
      // Never persist password hashes in the audit log.
      newAttributes: Object.assign({}, result.attributes),
    });

    if (result.password) result.attributes.password = model.User.hashify_password(result.password);
    await req.user.updateAttributes(result.attributes);
    await captureAuditTrail();

    delete req.session.profile_csrf_token;
    req.session.flash_message(req.__('Profile updated'));
    return res.redirect_with_session(303, '.');
  } catch (error) {
    console.error(`Failed to update profile for user ${req.user.id}: ${error.stack || error}`);
    req.session.flash_error(req.__('Failed to update profile'));
    return res.redirect_with_session(303, '.');
  }
});

router.validateProfileInput = validateProfileInput;
router.csrfMatches = csrfMatches;

module.exports = router;
