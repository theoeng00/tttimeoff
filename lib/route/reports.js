
"use strict";

const
  express   = require('express'),
  router    = express.Router(),
  validator = require('validator'),
  Promise   = require('bluebird'),
  moment    = require('moment'),
  TeamView  = require('../model/team_view'),
  Exception = require('../error'),
  csv       = Promise.promisifyAll(require('csv')),
  _         = require('underscore');

const { fetchLeavesForLeavesReport, leavesReportCsv } = require('../model/Report');
const { sorter } = require('../util');
const cutoffPeriod = require('../util/cutoff_period');
const attendanceLogic = require('../model/attendance');
const monthlySummary = require('../model/monthly_attendance_summary');

router.all(/.*/, require('../middleware/ensure_user_can_view_attendance_reports'));

router.get('/', (_req, res) => {
  res.render('report/index');
});

router.get('/monthly-attendance/', async (req, res, next) => {
  const db = req.app.get('db_model');
  try {
    const company = await req.user.getCompany();
    const monthValue = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : attendanceLogic.companyMoment(company).format('YYYY-MM');
    const month = moment.tz(monthValue, 'YYYY-MM', true, company.timezone);
    if (!month.isValid()) throw new Error('Invalid report month');
    // Attendance cycles run from the 21st of the selected month through the 20th of the next month.
    const start = month.clone().date(cutoffPeriod.CUTOFF_DAY + 1).startOf('day');
    const end = start.clone().add(1, 'month').date(cutoffPeriod.CUTOFF_DAY).endOf('day');
    const leaveYear = cutoffPeriod.year(end);
    const users = await db.User.findAll({where: {companyId: company.id, admin: false}, order: [['lastname'], ['name']]});
    const [records, leaves, annualLeaves, holidays, overtime, leaveTypes] = await Promise.all([
      db.Attendance.findAll({where: {company_id: company.id, work_date: {$gte: start.format('YYYY-MM-DD'), $lte: end.format('YYYY-MM-DD')}}}),
      db.Leave.findAll({where: {status: {$in: [db.Leave.status_approved(), db.Leave.status_pended_revoke()]}, date_start: {$lte: end.toDate()}, date_end: {$gte: start.toDate()}}}),
      db.Leave.findAll({where: {status: {$in: [db.Leave.status_approved(), db.Leave.status_pended_revoke()]}, date_start: {$lte: leaveYear.end.toDate()}, date_end: {$gte: leaveYear.start.toDate()}}}),
      db.BankHoliday.findAll({where: {companyId: company.id, date: {$gte: leaveYear.start.toDate(), $lte: leaveYear.end.toDate()}}}),
      db.OvertimeRequest.findAll({where: {company_id: company.id, status: 'approved', date_start: {$gte: start.format('YYYY-MM-DD'), $lte: end.format('YYYY-MM-DD')}}}),
      db.LeaveType.findAll({where: {companyId: company.id}, order: [['sort_order'], ['name']]}),
    ]);
    const recordsByUser = records.reduce((map, record) => { (map[record.user_id] || (map[record.user_id] = [])).push(record); return map; }, {});
    const leavesByUser = leaves.reduce((map, leave) => { (map[leave.userId] || (map[leave.userId] = [])).push(leave); return map; }, {});
    const annualLeavesByUser = annualLeaves.reduce((map, leave) => { (map[leave.userId] || (map[leave.userId] = [])).push(leave); return map; }, {});
    const overtimeByUser = overtime.reduce((map, item) => { (map[item.user_id] || (map[item.user_id] = [])).push(item); return map; }, {});
    const holidayDates = holidays.reduce((map, holiday) => { map[moment.utc(holiday.date).format('YYYY-MM-DD')] = true; return map; }, {});
    const now = attendanceLogic.companyMoment(company);
    const rows = await Promise.all(users.map(async user => {
      const userRecords = recordsByUser[user.id] || [];
      const recordsByDate = userRecords.reduce((map, record) => { map[record.work_date] = record; return map; }, {});
      const userLeaves = leavesByUser[user.id] || [];
      const userAnnualLeaves = annualLeavesByUser[user.id] || [];
      const userLeaveDates = monthlySummary.leaveDates(userLeaves);
      const schedule = await user.promise_schedule_I_obey();
      let absentDays = 0;
      let leaveDays = 0;
      for (const day = start.clone(); !day.isAfter(end, 'day'); day.add(1, 'day')) {
        const date = day.format('YYYY-MM-DD');
        if (!schedule.is_it_working_day({day}) || holidayDates[date]) continue;
        leaveDays += Math.min(1, userLeaves.reduce((total, leave) => total + monthlySummary.leaveFractionOnDate(leave, day), 0));
        if (recordsByDate[date] || userLeaveDates[date]) continue;
        if (day.isBefore(moment.tz(user.start_date, 'YYYY-MM-DD', company.timezone), 'day')) continue;
        if (user.end_date && day.isAfter(moment.tz(user.end_date, 'YYYY-MM-DD', company.timezone), 'day')) continue;
        if (now.isAfter(attendanceLogic.timeOnDate(date, company.attendance_end_time, company.timezone))) absentDays += 1;
      }
      const userOvertime = overtimeByUser[user.id] || [];
      const leaveDaysForRange = (leaveItems, rangeStart, rangeEnd, leaveTypeId) => {
        let total = 0;
        for (const day = rangeStart.clone(); !day.isAfter(rangeEnd, 'day'); day.add(1, 'day')) {
          const date = day.format('YYYY-MM-DD');
          if (!schedule.is_it_working_day({day}) || holidayDates[date]) continue;
          total += Math.min(1, leaveItems
            .filter(leave => !leaveTypeId || leave.leaveTypeId === leaveTypeId)
            .reduce((sum, leave) => sum + monthlySummary.leaveFractionOnDate(leave, day), 0));
        }
        return total;
      };
      const leaveSummary = leaveTypes.map(leaveType => {
        const periodDays = leaveDaysForRange(userLeaves, start, end, leaveType.id);
        const yearDays = leaveDaysForRange(userAnnualLeaves, leaveYear.start, leaveYear.end, leaveType.id);
        return {
          name: leaveType.name,
          periodDays,
          yearDays,
          remainingDays: leaveType.limit > 0 ? Math.max(0, leaveType.limit - yearDays) : null,
          hasLimit: leaveType.limit > 0,
        };
      });
      return {
        user,
        attendanceDays: userRecords.length,
        lateMinutes: userRecords.reduce((total, record) => total + Number(record.minutes_late || 0), 0),
        absentDays,
        leaveDays,
        leaveSummary,
        overtimeMinutes: userOvertime.reduce((total, item) => total + Number(item.overtime_minutes || 0), 0),
        overtimeRate1Minutes: userOvertime.reduce((total, item) => total + Number(item.rate_1_minutes || 0), 0),
        overtimeRate15Minutes: userOvertime.reduce((total, item) => total + Number(item.rate_1_5_minutes || 0), 0),
        overtimeRate3Minutes: userOvertime.reduce((total, item) => total + Number(item.rate_3_minutes || 0), 0),
        overnightNights: userOvertime.reduce((total, item) => total + Number(item.overnight_nights || 0), 0),
      };
    }));
    const totals = rows.reduce((total, row) => {
      Object.keys(total).forEach(key => { total[key] += row[key]; });
      return total;
    }, {attendanceDays: 0, lateMinutes: 0, absentDays: 0, leaveDays: 0, overtimeMinutes: 0, overtimeRate1Minutes: 0, overtimeRate15Minutes: 0, overtimeRate3Minutes: 0, overnightNights: 0});
    if (req.query['as-csv']) {
      const content = [[
        'พนักงาน', 'วันลงเวลา', 'มาสาย (นาที)', 'ขาด (วัน)', 'ลา (วัน)', 'OT รวม (นาที)', 'OT 1x (นาที)', 'OT 1.5x (นาที)', 'OT 3x (นาที)', 'เหมา (คืน)',
        'ประเภทลา', 'ลาในรอบนี้ (วัน)', 'ใช้แล้วทั้งปี (วัน)', 'คงเหลือทั้งปี (วัน)',
      ]];
      rows.forEach(row => row.leaveSummary.forEach(leave => content.push([
        `${row.user.name} ${row.user.lastname}`, row.attendanceDays, row.lateMinutes,
        row.absentDays, row.leaveDays, row.overtimeMinutes, row.overtimeRate1Minutes, row.overtimeRate15Minutes, row.overtimeRate3Minutes, row.overnightNights, leave.name,
        leave.periodDays, leave.yearDays, leave.hasLimit ? leave.remainingDays : 'ไม่กำหนดโควตา',
      ])));
      res.attachment(`monthly_attendance_${monthValue}.csv`);
      return res.send(`\ufeff${await csv.stringifyAsync(content)}`);
    }
    res.render('report/monthly_attendance', {
      monthValue,
      periodLabel: `${start.format('DD/MM/YYYY')} – ${end.format('DD/MM/YYYY')}`,
      leaveYearLabel: `${leaveYear.start.format('DD/MM/YYYY')} – ${leaveYear.end.format('DD/MM/YYYY')}`,
      rows,
      totals,
    });
  } catch (error) { next(error); }
});

router.get('/allowancebytime/', (req, res) => {
  const defaultPeriod = cutoffPeriod.month(req.user.company.get_today());

  let start_date = validator.isDate(req.query['start_date'])
    ? moment.utc(req.query['start_date'])
    : defaultPeriod.start;

  let end_date = validator.isDate(req.query['end_date'])
    ? moment.utc(req.query['end_date'])
    : defaultPeriod.end;

  var team_view = new TeamView({
    user      : req.user,
    start_date : start_date,
    end_date   : end_date,
  });

  var current_deparment_id  = validator.isNumeric(req.query['department'])
    ? req.query['department']
    : null;

  Promise.join(
    team_view.promise_team_view_details({
      department_id : current_deparment_id,
    }),
    req.user.get_company_with_all_leave_types(),
    (team_view_details, company) => {
      return team_view
        .inject_statistics({
          team_view_details : team_view_details,
          leave_types       : company.leave_types,
        })
        .then(team_view_details => render_allowancebytime({
          req               : req,
          res               : res,
          team_view_details : team_view_details,
          company           : company,
          start_date        : start_date,
          end_date          : end_date,
        }))
    })
    .catch(error => {
      console.error(
        'An error occured when user '+req.user.id+
        ' tried to access /reports/allowancebytime page: '+error
      );

      let
        user_error_message = 'Failed to produce report. Please contact administrator.',

        // By default go back to root report page
        redirect_path = '../';

      if ( error.tom_error ) {
        user_error_message = Exception.extract_user_error_message(error);

        // If it is known error: stay on current page
        redirect_path = './';
      }

      req.session.flash_error(user_error_message);

      return res.redirect_with_session(redirect_path);
    });
});

function render_allowancebytime(args) {
  let
    req               = args.req,
    res               = args.res,
    team_view_details = args.team_view_details,
    company           = args.company,
    start_date        = args.start_date,
    end_date          = args.end_date;

    return Promise
      .try(() => req.query['as-csv']
        ? render_allowancebytime_as_csv(args)
        : res.render('report/allowancebytime', {
          users_and_leaves    : team_view_details.users_and_leaves,
          related_departments : team_view_details.related_departments,
          current_department  : team_view_details.current_department,
          company             : company,
          start_date_str      : start_date.format('YYYY-MM-DD'),
          end_date_str        : end_date.format('YYYY-MM-DD'),
          start_date_obj      : start_date,
          end_date_obj        : end_date,
          same_month          : (start_date.format('YYYYMM') === end_date.format('YYYYMM')),
        })
      );
}

function render_allowancebytime_as_csv(args) {
  let
    res               = args.res,
    team_view_details = args.team_view_details,
    company           = args.company,
    start_date        = args.start_date,
    end_date          = args.end_date;

  // Compose file name
  res.attachment(
    company.name_for_machine()
      + '_employee_allowances_between'
      + start_date.format('YYYY_MM_DD')
      + '_and_'
      + end_date.format('YYYY_MM_DD')
      + '.csv'
  );

  // Compose result CSV header
  let content = [
    ['email', 'last name', 'name']
    // Add dynamic list of Leave Types
    .concat(
      team_view_details.users_and_leaves.length > 0
        ? team_view_details.users_and_leaves[0].statistics.leave_type_break_down.pretty_version.map(it => it.name)
        : []
    )
    .concat(['days deducted from allowance'])
  ];

  // ... and body
  team_view_details.users_and_leaves.forEach(ul => {
    content.push(
      [
        ul.user.email,
        ul.user.lastname,
        ul.user.name,
      ]
      // Dynamic part of the column list
      .concat( ul.statistics.leave_type_break_down.pretty_version.map(it => it.stat))
      .concat([ul.statistics.deducted_days])
    );
  });

  return csv.stringifyAsync( content )
    .then(csv_data_string => res.send(csv_data_string));
}

const extractParametersForLeavesReport = ({req, actingUser}) => {
  const defaultPeriod = cutoffPeriod.month(actingUser.company.get_today());
  const startDate = validator.isDate(req.query['start_date'])
    ? moment.utc(req.query['start_date'])
    : defaultPeriod.start;

  const endDate = validator.isDate(req.query['end_date'])
    ? moment.utc(req.query['end_date'])
    : defaultPeriod.end;

  const departmentId = validator.isNumeric(req.query['department'])
    ? req.query['department']
    : null;

  const leaveTypeId = validator.isNumeric(req.query['leave_type'])
    ? req.query['leave_type']
    : null;

  return { startDate, endDate, departmentId, leaveTypeId };
};

const renderLeavesReportAsCsv = async ({res, company, startDate, endDate, leaves}) => {
  // Compose file name
  res.attachment(
    `${company.name_for_machine()}_leaves_report_between_${startDate.format('YYYY_MM_DD')}_and_${endDate.format('YYYY_MM_DD')}.csv`
  );

  const csvString = await leavesReportCsv(leaves);

  return res.send(csvString);
}

const defaultSortAttributeForLeaveReport = 'employeeFullName';
const sortersForLeavesReport = {
  employeeFullName: (a,b) => sorter(a.employeeLastName, b.employeeLastName),
  departmentName: (a,b) => sorter(a.departmentName, b.departmentName),
  type: (a,b) => sorter(a.type, b.type),
  startDate: (a,b) => moment.utc(a.startDate).toDate().valueOf() - moment.utc(b.startDate).toDate().valueOf(),
  endDate: (a,b) => moment.utc(a.endDate).toDate().valueOf() - moment.utc(b.endDate).toDate().valueOf(),
  status: (a,b) => sorter(a.status, b.status),
  createdAt: (a,b) => moment.utc(a.createdAt).toDate().valueOf() - moment.utc(b.createdAt).toDate().valueOf(),
  approver: (a,b) => sorter(a.approver, b.approver),
};

const getSorterForLeaves = (attribute = defaultSortAttributeForLeaveReport) => {
  return sortersForLeavesReport[attribute] || sortersForLeavesReport[defaultSortAttributeForLeaveReport];
};

router.get('/leaves/', async (req, res) => {
  const actingUser = req.user;
  const dbModel = req.app.get('db_model');
  const renderAsCsv = !! req.query['as-csv'];
  const sortBy = req.query['sort_by'] || defaultSortAttributeForLeaveReport;
  let leaves = [];

  const { startDate, endDate, departmentId, leaveTypeId } = extractParametersForLeavesReport({req, actingUser});

  try {
    ({ leaves } = await fetchLeavesForLeavesReport({actingUser, dbModel, startDate, endDate, departmentId, leaveTypeId}));

    leaves = leaves.sort(getSorterForLeaves(sortBy));
  } catch (error) {
    console.error(
      `An error occurred when user ${actingUser.id} tried to access /reports/leaves/ page: ${error} at ${error.stack}`
    );

    let userErrorMessage = 'Failed to produce Leaves report. Please contact administrator.';

    // By default go back to root report page
    let redirectPath = '../';

    if ( error.tom_error ) {
      userErrorMessage = Exception.extract_user_error_message(error);

      // If it is known error: stay on current page
      redirectPath = './';
    }

    req.session.flash_error(userErrorMessage);

    return res.redirect_with_session(redirectPath);
  }

  const company = await actingUser.getCompany({
    scope: ['with_leave_types', 'with_simple_departments'],
  });

  if (renderAsCsv) {
    await renderLeavesReportAsCsv({res, company, startDate, endDate, leaves});
  } else {
    res.render('report/leaves', {
      leaves,
      departmentId,
      leaveTypeId,
      sortBy,
      startDateObj: startDate,
      endDateObj: endDate,
      startDateStr: startDate.format('YYYY-MM-DD'),
      endDateStr: endDate.format('YYYY-MM-DD'),
      company: actingUser.company,
      leaveTypes: (
        company.leave_types
        ? company.leave_types
          .map(lt => lt.toJSON())
          .map(lt => ({...lt, id: `${lt.id}`}))
          .sort((a,b) => sorter(a.name, b.name))
        : []
      ),
      departments: (
        company.departments
        ? company.departments
          .map(d => d.toJSON())
          .map(d => ({...d, id: `${d.id}`}))
          .sort((a,b) => sorter(a.name, b.name))
        : []
      ),
    });
  }
});

module.exports = router;
