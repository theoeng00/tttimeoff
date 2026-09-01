'use strict';

const assert = require('assert');
const ensureUserCanBackup = require('../../lib/middleware/ensure_user_can_backup');

describe('Backup permission', () => {
  it('allows administrators', () => {
    assert.strictEqual(ensureUserCanBackup.canUseBackup({admin: true}), true);
  });

  it('allows approval-report recipients', () => {
    assert.strictEqual(ensureUserCanBackup.canUseBackup({admin: false, receive_approval_report: true}), true);
  });

  it('rejects other and anonymous users', () => {
    assert.strictEqual(ensureUserCanBackup.canUseBackup({admin: false, receive_approval_report: false}), false);
    assert.strictEqual(ensureUserCanBackup.canUseBackup(null), false);
  });
});
