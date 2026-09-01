'use strict';

$(document).ready(function() {
  function minutes(value) {
    var match = /^(\d{1,2})[.:]([0-5]\d)$/.exec(String(value || '').trim());
    if (!match || Number(match[1]) > 23) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function updateCalculatedMinutes() {
    var start = minutes($('#ot-time-start').val());
    var end = minutes($('#ot-time-end').val());
    var output = $('#calculated-ot-minutes');
    function show(result) {
      output.find('[data-rate="1"]').text(result.rate1);
      output.find('[data-rate="1.5"]').text(result.rate15);
      output.find('[data-rate="3"]').text(result.rate3);
    }
    if (start === null || end === null || start === end) return show({rate1: 0, rate15: 0, rate3: 0});
    if (end <= start) end += 1440;
    var workStart = minutes(output.data('work-start'));
    var workEnd = minutes(output.data('work-end'));
    var dateParts = String($('#ot-date-start').val() || '').split('/');
    if (dateParts.length !== 3) return show({rate1: 0, rate15: 0, rate3: 0});
    var firstDate = new Date(Date.UTC(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0])));
    var holidays = String(output.data('holiday-dates') || '').split(',');
    var result = {rate1: 0, rate15: 0, rate3: 0};
    for (var minute = start; minute < end; minute += 1) {
      var date = new Date(firstDate.getTime() + Math.floor(minute / 1440) * 86400000);
      var isoDate = date.toISOString().slice(0, 10);
      var isHoliday = date.getUTCDay() === 0 || date.getUTCDay() === 6 || holidays.indexOf(isoDate) !== -1;
      var minuteOfDay = minute % 1440;
      var isNormalHours = minuteOfDay >= workStart && minuteOfDay < workEnd;
      if (isHoliday) result[isNormalHours ? 'rate1' : 'rate3'] += 1;
      else if (!isNormalHours) result.rate15 += 1;
    }
    show(result);
  }

  $('#ot-date-start, #ot-time-start, #ot-time-end').on('change input', updateCalculatedMinutes);
});
