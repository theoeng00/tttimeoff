
"use strict";

const
  Joi       = require('joi'),
  Promise   = require('bluebird'),
  Exception = require('../../error'),
  Models    = require('../db');

const
  schemaPromiseToRemove = Joi.object().required().keys({
    company     : Joi.object().required(), //.type(Models.Company.constructor),
    byUser      : Joi.object().required(), //.type(Models.User.constructor),
    confirmName : Joi.string().required().trim(),
  });


class CompanyRemover {

  static promiseToRemove(args){

    args = Joi.attempt(
      args,
      schemaPromiseToRemove,
      "Param validation failed for promiseToRemove"
    );

    const
      company      = args.company,
      byUser       = args.byUser,
      confirmName  = args.confirmName;
    let userIds = [];

    // Ensure that confirm name is correct
    let normalizedNames = [company.name, confirmName]
      .map(s => s.trim())
      .map(s => s.replace(/\s+/g, ''))
      .map(s => s.toUpperCase());

    if (normalizedNames[0] !== normalizedNames[1]) {
      Exception.throw_user_error({
        system_error : `Confirmed name does not match one on company record: ${ normalizedNames.join(', ') }`,
        user_error   : `Provided name confirmation does not match company one`,
      });
    }

    return Models.User

      // Ensure user belongs to current combany and is admin
      .count({
        where : {
          id        : byUser.id,
          companyId : company.id,
          admin     : true,
        }
      })
      .then(count => {
        if ( count === 0) {
          Exception.throw_user_error({
            system_error : `An attempt to remove company [${company.id}] by unrelated user [${byUser.id }]`,
            user_error : `User does not have permissions to remove company`,
          });
        }
        return Promise.resolve(1);
      })

      // Remove company record and all related records
      // (we do not really remove all data, just the sensitive information)
      // .. delete email audit
      .then(() => Models.EmailAudit.destroy({ where : { company_id : company.id } }))
      // Remove all leaves for related users
      .then(() => company.getUsers({attributes: ['id']}))
      .then(users => {
        userIds = users.map(user => user.id);
        return Models.Leave.findAll({where: {userId: userIds}, attributes: ['id']});
      })
      .then(leaves => Promise.all([
        Models.LeaveApproval.destroy({where: {leave_id: leaves.map(leave => leave.id)}}),
        Models.AttendanceCorrectionRequest.destroy({where: {company_id: company.id}}),
        Models.Attendance.destroy({where: {company_id: company.id}}),
        Models.UserDepartment.destroy({
          where: {$or: [{user_id: userIds}, {manager_user_id: userIds}]},
        }),
      ]))
      // Remove all leaves for related users
      .then(() => Models.Leave.destroy({where: {userId: userIds}}))
      // Remove all users
      .then(() => Models.User.destroy({where : {companyId : company.id} }))
      // Remove company record
      .then(() => company.destroy());
  }
}

module.exports = CompanyRemover;
