
'use strict';

var expect = require('chai').expect,
_          = require('underscore'),
bluebird   = require('bluebird'),
Email      = require('../../lib/email'),
config     = require('../../lib/config');

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

  it('renders an attendance correction request with its website link', async function(){
    const email = await (new Email()).promise_rendered_email_template({
      template_name: 'attendance_correction_request',
      context: {
        correction_type: 'Clock-out',
        requester_name: 'Jane Employee',
        approver_name: 'Alex Manager',
        work_date: '01/09/2026',
        original_time: '—',
        requested_time: '17:30',
        reason: 'Forgot to clock out',
        requests_url: 'https://tttimeoff.onrender.com/attendance/clock-out-corrections/',
      },
    });

    expect(email.subject).to.equal('New Clock-out correction request');
    expect(email.body).to.contain('https://tttimeoff.onrender.com/attendance/clock-out-corrections/');
  });

  it('renders an attendance correction decision with its website link', async function(){
    const email = await (new Email()).promise_rendered_email_template({
      template_name: 'attendance_correction_decision',
      context: {
        correction_type: 'Clock-in',
        requester_name: 'Jane Employee',
        approver_name: 'Alex Manager',
        work_date: '01/09/2026',
        requested_time: '08:30',
        decision: 'approved',
        requests_url: 'https://tttimeoff.onrender.com/attendance/corrections/',
      },
    });

    expect(email.subject).to.equal('Clock-in correction request approved');
    expect(email.body).to.contain('https://tttimeoff.onrender.com/attendance/corrections/');
  });

  it('sends and records an attendance correction email using the configured domain', async function(){
    let recordedEmail;
    const recipient = {
      email: 'manager@example.test',
      reload_with_session_details: () => bluebird.resolve(),
      record_email_addressed_to_me: email => {
        recordedEmail = email;
        return bluebird.resolve();
      },
    };
    const email = new Email();
    email.get_send_email = () => message => bluebird.resolve(message);

    await email.promise_attendance_correction_email({
      recipient,
      template_name: 'attendance_correction_request',
      path: '/attendance/corrections/',
      context: {
        correction_type: 'Clock-in',
        requester_name: 'Jane Employee',
        approver_name: 'Alex Manager',
        work_date: '01/09/2026',
        original_time: '09:00',
        requested_time: '08:30',
        reason: 'Forgot to clock in',
      },
    });

    expect(recordedEmail.body).to.contain(`${String(config.get('application_domain')).replace(/\/+$/, '')}/attendance/corrections/`);
  });
});

