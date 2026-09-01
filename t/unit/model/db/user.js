'use strict';

const expect = require('chai').expect;
const model = require('../../../../lib/model/db');

describe('Approval report recipient', () => {
  it('is disabled for a new employee unless an administrator selects it', () => {
    expect(model.User.build({}).receive_approval_report).to.equal(false);
    expect(model.User.build({receive_approval_report: true}).receive_approval_report).to.equal(true);
  });
});
