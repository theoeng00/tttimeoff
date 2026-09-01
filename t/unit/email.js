
'use strict';

var expect = require('chai').expect,
_          = require('underscore'),
bluebird   = require('bluebird'),
Email      = require('../../lib/email');

describe('Check Email', function(){

  it('Knows how to render and parse template', function(done){

    var email = new Email();

    bluebird.resolve(email.promise_rendered_email_template({
      template_name : 'foobar',
      context : {
        user : {
          name : 'FOO',
          reload_with_session_details : function(){ bluebird.resolve(1); },
        },
      },
    }))
    .then(function(email){

      expect(email.subject).to.be.equal('Email subject goes here');
      expect(email.body).to.match(/Hello FOO\./);

      done();
    });

  });

  it('renders the approval report notification', async function(){
    const email = await (new Email()).promise_rendered_email_template({
      template_name : 'approval_report_to_admin',
      context : {
        requester: {full_name: 'Jane Employee'},
        approver: {full_name: 'Alex Admin'},
        start_date: '2026-07-21',
        end_date: '2026-08-20',
      },
    });

    expect(email.subject).to.equal('Approved leave report: 2026-07-21 - 2026-08-20');
    expect(email.body).to.contain('Jane Employee');
  });

  it('renders the leave escalation notification', async function(){
    const email = await (new Email()).promise_rendered_email_template({
      template_name: 'leave_escalation_available',
      context: {
        requester: {name: 'Jane'},
        approver: {name: 'Alex', lastname: 'Manager'},
        next_approver: {name: 'Sam', lastname: 'Boss'},
        requests_url: 'http://example.test/requests/',
      },
    });

    expect(email.subject).to.equal('Your leave request can now be escalated');
    expect(email.body).to.contain('Sam Boss');
    expect(email.body).to.contain('http://example.test/requests/');
  });

  it('renders a leave request without an assigned manager', async function(){
    const email = await (new Email()).promise_rendered_email_template({
      template_name: 'leave_request_to_requestor_unassigned',
      context: {
        requester: {full_name: () => 'Jane Employee'},
        leave: {
          date_start: new Date('2026-08-27'),
          date_end: new Date('2026-08-27'),
          get: () => null,
        },
        comments: [],
      },
    });

    expect(email.subject).to.equal('Leave request is awaiting assignment');
    expect(email.body).to.contain('no direct manager or department manager');
  });
});

