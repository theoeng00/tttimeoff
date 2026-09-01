'use strict';

$(function() {
  $('#verification-mode').on('change', function() {
    var useNetwork = this.value === 'office_network';
    $('#network-verification-settings').toggleClass('hidden', !useNetwork);
    $('#gps-verification-settings').toggleClass('hidden', useNetwork);
  });

  $('#use-current-location').on('click', function() {
    var button = $(this);
    var status = $('#settings-gps-status');
    if (!navigator.geolocation) return status.text('อุปกรณ์นี้ไม่รองรับ GPS');
    button.prop('disabled', true);
    status.text('กำลังอ่านตำแหน่ง…');
    navigator.geolocation.getCurrentPosition(function(position) {
      $('#latitude').val(position.coords.latitude.toFixed(7));
      $('#longitude').val(position.coords.longitude.toFixed(7));
      status.text('ใส่พิกัดปัจจุบันแล้ว (คลาดเคลื่อนประมาณ ' + Math.round(position.coords.accuracy) + ' เมตร)');
      button.prop('disabled', false);
    }, function() {
      status.text('อ่านตำแหน่งไม่สำเร็จ กรุณาอนุญาต GPS แล้วลองใหม่');
      button.prop('disabled', false);
    }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
  });

  var waiting = $('#clock-out-wait');
  if (waiting.length) {
    var delay = Number(waiting.data('available-at')) - Date.now();
    window.setTimeout(function() {
      waiting.addClass('hidden');
      $('#clock-out-form').removeClass('hidden');
    }, Math.max(0, Math.min(delay, 2147483647)));
  }

  $('.js-gps-attendance-form').on('submit', function(event) {
    event.preventDefault();
    var form = this;
    var button = $(form).find('button');
    var status = $('#gps-status');
    if (!navigator.geolocation) {
      status.text('อุปกรณ์นี้ไม่รองรับ GPS');
      return;
    }
    button.prop('disabled', true);
    status.text('กำลังตรวจสอบตำแหน่ง…');
    navigator.geolocation.getCurrentPosition(function(position) {
      form.elements.latitude.value = position.coords.latitude;
      form.elements.longitude.value = position.coords.longitude;
      form.elements.accuracy.value = position.coords.accuracy;
      form.submit();
    }, function(error) {
      button.prop('disabled', false);
      status.text(error.code === 1 ? 'กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่ง' : 'อ่านตำแหน่งไม่สำเร็จ กรุณาเปิด GPS แล้วลองใหม่');
    }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
  });
});
