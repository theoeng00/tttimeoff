'use strict';

const expect = require('chai').expect;
const overtimeRequest = require('../../lib/model/overtime_request');

describe('Retrospective overtime request', function() {
  const valid = {
    date_start: '2026-08-26',
    date_end: '2026-08-27',
    overtime_start_time: '06:00',
    overtime_end_time: '08:30',
    overnight_nights: '1',
    reason: 'ต่างจังหวัด',
  };

  it('keeps overtime minutes and overnight allowance separate', function() {
    expect(overtimeRequest.validateRequest(valid, '2026-08-28')).to.eql({
      date_start: '2026-08-26',
      date_end: '2026-08-27',
      overtime_start_time: '06:00',
      overtime_end_time: '08:30',
      overtime_minutes: 150,
      rate_1_minutes: 0,
      rate_1_5_minutes: 150,
      rate_3_minutes: 0,
      overnight_nights: 1,
      reason: 'ต่างจังหวัด',
    });
  });

  it('accepts day/month/Gregorian-year dates from the form', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      date_start: '26/08/2026',
      date_end: '27/08/2026',
    }), '2026-08-28');
    expect(result.date_start).to.equal('2026-08-26');
    expect(result.date_end).to.equal('2026-08-27');
  });

  it('accepts single-digit day and month', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      date_start: '6/8/2026',
      date_end: '7/8/2026',
    }), '2026-08-28');
    expect(result.date_start).to.equal('2026-08-06');
    expect(result.date_end).to.equal('2026-08-07');
  });

  it('accepts dotted 24-hour time and normalises it', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      overtime_start_time: '6.30',
      overtime_end_time: '8.30',
    }), '2026-08-28');
    expect(result.overtime_start_time).to.equal('06:30');
    expect(result.overtime_end_time).to.equal('08:30');
    expect(result.overtime_minutes).to.equal(120);
  });

  it('excludes normal working hours from an OT interval', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      overtime_start_time: '6.00',
      overtime_end_time: '21.00',
    }), '2026-08-28', {start_time: '08:30', end_time: '17:30'});
    expect(result.overtime_minutes).to.equal(360);
  });

  it('counts an interval entirely outside normal working hours', function() {
    expect(overtimeRequest.calculateOvertimeMinutes(
      overtimeRequest.parseTime('22.00'), overtimeRequest.parseTime('1.00'), '08:30', '17:30'
    )).to.equal(180);
  });

  it('uses 1x during normal hours and 3x outside them on Saturday and Sunday', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      date_start: '2026-08-22',
      date_end: '2026-08-22',
      overtime_start_time: '08:00',
      overtime_end_time: '18:00',
      overnight_nights: '0',
    }), '2026-08-28', {start_time: '08:30', end_time: '17:30'});
    expect(result.rate_1_minutes).to.equal(540);
    expect(result.rate_1_5_minutes).to.equal(0);
    expect(result.rate_3_minutes).to.equal(60);
    expect(result.overtime_minutes).to.equal(600);
  });

  it('uses holiday rates on a configured company holiday', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      date_start: '2026-08-26',
      date_end: '2026-08-26',
      overtime_start_time: '08:00',
      overtime_end_time: '18:00',
      overnight_nights: '0',
    }), '2026-08-28', {
      start_time: '08:30', end_time: '17:30', holiday_dates: ['2026-08-26'],
    });
    expect(result.rate_1_minutes).to.equal(540);
    expect(result.rate_1_5_minutes).to.equal(0);
    expect(result.rate_3_minutes).to.equal(60);
  });

  it('splits an interval crossing from a normal Friday into Saturday', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      date_start: '2026-08-21',
      date_end: '2026-08-22',
      overtime_start_time: '22:00',
      overtime_end_time: '01:00',
      overnight_nights: '1',
    }), '2026-08-28', {start_time: '08:30', end_time: '17:30'});
    expect(result.rate_1_5_minutes).to.equal(120);
    expect(result.rate_3_minutes).to.equal(60);
  });

  it('allows an overnight allowance without timed OT', function() {
    const result = overtimeRequest.validateRequest(Object.assign({}, valid, {
      overtime_start_time: '',
      overtime_end_time: '',
    }), '2026-08-28');
    expect(result.overtime_minutes).to.equal(0);
    expect(result.overtime_start_time).to.equal(null);
    expect(result.overtime_end_time).to.equal(null);
    expect(result.overnight_nights).to.equal(1);
  });

  it('rejects only one OT time', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {overtime_end_time: ''}), '2026-08-28');
    }).to.throw(/ระบุเวลาเริ่มและสิ้นสุดให้ครบ/);
  });

  it('requires timed OT or an overnight allowance', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {
        overtime_start_time: '', overtime_end_time: '', overnight_nights: '0',
      }), '2026-08-28');
    }).to.throw(/อย่างน้อยหนึ่งรายการ/);
  });

  it('rejects future requests', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {date_end: '2026-08-29'}), '2026-08-28');
    }).to.throw(/วันที่ปัจจุบัน/);
  });

  it('rejects more nights than the requested trip contains', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {overnight_nights: '2'}), '2026-08-28');
    }).to.throw(/จำนวนคืน/);
  });

  it('supports an OT period crossing midnight', function() {
    expect(overtimeRequest.validateRequest(Object.assign({}, valid, {
      overtime_start_time: '22:00',
      overtime_end_time: '01:00',
    }), '2026-08-28').overtime_minutes).to.equal(180);
  });

  it('requires the next date for an OT period crossing midnight', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {
        date_end: '2026-08-26',
        overnight_nights: '0',
        overtime_start_time: '22:00',
        overtime_end_time: '01:00',
      }), '2026-08-28');
    }).to.throw(/วันถัดไป/);
  });

  it('rejects equal start and end times', function() {
    expect(function() {
      overtimeRequest.validateRequest(Object.assign({}, valid, {overtime_end_time: '06:00'}), '2026-08-28');
    }).to.throw(/ต้องไม่เท่ากัน/);
  });

  it('cancels pending requests immediately and requests cancellation after approval', function() {
    expect(overtimeRequest.cancellationStatus('pending')).to.equal('cancelled');
    expect(overtimeRequest.cancellationStatus('approved')).to.equal('cancellation_pending');
    expect(overtimeRequest.cancellationStatus('rejected')).to.equal(null);
  });

  it('handles approval decisions for requests and cancellations', function() {
    expect(overtimeRequest.decisionStatus('pending', 'approve')).to.equal('approved');
    expect(overtimeRequest.decisionStatus('pending', 'reject')).to.equal('rejected');
    expect(overtimeRequest.decisionStatus('cancellation_pending', 'approve')).to.equal('cancelled');
    expect(overtimeRequest.decisionStatus('cancellation_pending', 'reject')).to.equal('approved');
  });
});
