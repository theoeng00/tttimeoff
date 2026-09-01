'use strict';

module.exports = pg => {
  const originalQuery = pg.Client.prototype.query;
  if (originalQuery.sequelize3EmitterCompat) return;

  function compatibleQuery(config, values, callback) {
    if (typeof callback !== 'function' && typeof values !== 'function' && !(config && typeof config.submit === 'function')) {
      return originalQuery.call(this, new pg.Query(config, values));
    }
    return originalQuery.apply(this, arguments);
  }

  // ponytail: Sequelize 3 requires pg's pre-v7 EventEmitter result. Remove this process-wide shim after upgrading Sequelize.
  compatibleQuery.sequelize3EmitterCompat = true;
  pg.Client.prototype.query = compatibleQuery;
};
