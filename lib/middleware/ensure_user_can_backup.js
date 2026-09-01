'use strict';

const canUseBackup = user => Boolean(
  user && (user.admin === true || user.receive_approval_report === true)
);

const ensureUserCanBackup = (req, res, next) => {
  if (!canUseBackup(req.user)) return res.redirect_with_session(303, '/');
  next();
};

module.exports = ensureUserCanBackup;
module.exports.canUseBackup = canUseBackup;
