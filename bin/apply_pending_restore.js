'use strict';

const path = require('path');
const {applyPendingRestore} = require('../lib/util/database_restore');

applyPendingRestore({projectRoot: path.resolve(__dirname, '..')})
  .then(result => console.log(result
    ? `Database restore applied. Rollback: ${result.rollbackPath}`
    : 'No database restore is pending.'
  ))
  .catch(error => {
    console.error(`Database restore failed: ${error.stack}`);
    process.exitCode = 1;
  });
