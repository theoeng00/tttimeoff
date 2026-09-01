'use strict';

const assert = require('assert');
const installCompatibility = require('../../lib/model/pg_sequelize3_compat');

describe('Sequelize 3 compatibility with modern pg', () => {
  it('uses a Query object only for callback-free queries', () => {
    const calls = [];
    function Client() {}
    function Query(config, values) {
      this.config = config;
      this.values = values;
      this.submit = function() {};
    }
    Client.prototype.query = function() {
      calls.push(Array.from(arguments));
      return arguments[0];
    };

    const pg = {Client, Query};
    installCompatibility(pg);
    const client = new Client();
    const emitterQuery = client.query('SELECT $1', [1]);
    const callback = function() {};
    client.query('SELECT 1', callback);

    assert(emitterQuery instanceof Query);
    assert.deepStrictEqual(emitterQuery.values, [1]);
    assert.strictEqual(calls[1][1], callback);
  });
});
