#!/usr/bin/env node

'use strict';

const db = require('../lib/model/db');

db.sequelize.authenticate()
  .then(() => console.log(`Database connection OK (${db.sequelize.getDialect()})`))
  .catch(error => {
    console.error(`Database connection failed: ${error.message}`);
    process.exitCode = 1;
  })
  .then(() => db.sequelize.close());
