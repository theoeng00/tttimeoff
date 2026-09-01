'use strict';

const expect = require('chai').expect;
const cutoffPeriod = require('../../lib/util/cutoff_period');

describe('20th cutoff periods', () => {
  it('keeps the 20th in the period that is ending', () => {
    const period = cutoffPeriod.month('2026-08-20');

    expect(period.start.format('YYYY-MM-DD')).to.equal('2026-07-21');
    expect(period.end.format('YYYY-MM-DD')).to.equal('2026-08-20');
  });

  it('starts a new period on the 21st', () => {
    const period = cutoffPeriod.month('2026-08-21');

    expect(period.start.format('YYYY-MM-DD')).to.equal('2026-08-21');
    expect(period.end.format('YYYY-MM-DD')).to.equal('2026-09-20');
  });

  it('starts a new annual allowance cycle after 20 December', () => {
    expect(cutoffPeriod.year('2026-12-20').year).to.equal(2026);
    expect(cutoffPeriod.year('2026-12-21').year).to.equal(2027);
    expect(cutoffPeriod.forYear(2027).start.format('YYYY-MM-DD')).to.equal('2026-12-21');
    expect(cutoffPeriod.forYear(2027).end.format('YYYY-MM-DD')).to.equal('2027-12-20');
  });
});
