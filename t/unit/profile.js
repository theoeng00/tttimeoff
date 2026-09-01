'use strict';

const assert = require('assert');
const profile = require('../../lib/route/profile');

const user = {is_my_password: password => password === 'correct'};

describe('Profile validation', () => {
  it('only returns self-service attributes', () => {
    const result = profile.validateProfileInput({
      body: {name: ' Jane ', lastname: ' Doe ', email: 'attacker@example.com', admin: '1'},
      user,
      ldapEnabled: false,
    });

    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.attributes, {name: 'Jane', lastname: 'Doe'});
    assert.strictEqual(result.password, null);
  });

  it('requires the current password and matching confirmation', () => {
    const result = profile.validateProfileInput({
      body: {name: 'Jane', lastname: 'Doe', current_password: 'wrong', password: 'new', password_confirm: 'different'},
      user,
      ldapEnabled: false,
    });

    assert(result.errors.includes('Current password is incorrect'));
    assert(result.errors.includes('Confirmed password does not match new password'));
  });

  it('blocks local password changes for LDAP accounts', () => {
    const result = profile.validateProfileInput({
      body: {name: 'Jane', lastname: 'Doe', password: 'new'},
      user,
      ldapEnabled: true,
    });

    assert(result.errors.includes('Password is managed by LDAP and cannot be changed here'));
  });

  it('checks CSRF tokens without accepting missing or different values', () => {
    assert.strictEqual(profile.csrfMatches('token', 'token'), true);
    assert.strictEqual(profile.csrfMatches('token', 'other'), false);
    assert.strictEqual(profile.csrfMatches(undefined, undefined), false);
  });
});
