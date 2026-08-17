/**
 * Apps Script 속성에 다음 값을 설정합니다.
 * SOLAPI_API_KEY, SOLAPI_API_SECRET, SENDER_PHONE, ADMIN_PHONE, RELAY_SHARED_SECRET
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    if (!data.relayToken || data.relayToken !== properties.getProperty('RELAY_SHARED_SECRET')) {
      throw new Error('Unauthorized relay request');
    }

    const name = cleanText_(data.name, 40);
    const phone = normalizePhone_(data.phone);
    const type = cleanText_(data.type || '미선택', 40);
    const visitDate = validateVisitDate_(data.visitDate);
    const visitTime = validateVisitTime_(data.visitTime);
    if (!name || !phone) throw new Error('Invalid lead data');

    const timestamp = Utilities.formatDate(new Date(), 'GMT+9', 'yyyy-MM-dd HH:mm:ss');
    SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().appendRow([
      timestamp, name, phone, type, visitDate, visitTime
    ]);

    const scheduleLine = visitDate || visitTime
      ? '\n• 방문희망: ' + [visitDate, visitTime].filter(String).join(' ')
      : '';
    const project = '[e편한세상 부천 어반스퀘어]';
    sendSolapiSms_(properties.getProperty('ADMIN_PHONE'),
      project + '\n• 성함: ' + name + '\n• 연락처: ' + phone + '\n• 관심평형: ' + type + scheduleLine,
      properties);
    sendSolapiSms_(phone,
      project + '\n' + name + '님, VIP 방문예약이 정상 완료되었습니다.' + scheduleLine +
      '\n• 신청평형: ' + type + '\n\n전문 상담사가 확인 후 안내 연락을 드릴 예정입니다.\n문의: 1833-8384',
      properties);

    return json_({ result: 'success', eventId: cleanText_(data.eventId, 100) });
  } catch (error) {
    console.log('lead failed: ' + error.message);
    return json_({ result: 'error', message: '접수 처리에 실패했습니다.' });
  }
}

function sendSolapiSms_(to, text, properties) {
  const apiKey = properties.getProperty('SOLAPI_API_KEY');
  const apiSecret = properties.getProperty('SOLAPI_API_SECRET');
  const from = normalizePhone_(properties.getProperty('SENDER_PHONE'));
  const recipient = normalizePhone_(to);
  if (!apiKey || !apiSecret || !from || !recipient) throw new Error('SOLAPI settings missing');

  const date = new Date().toISOString();
  const salt = Utilities.getUuid().replace(/-/g, '');
  const bytes = Utilities.computeHmacSha256Signature(date + salt, apiSecret);
  const signature = bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
  const authorization = 'HMAC-SHA256 apiKey=' + apiKey + ', date=' + date + ', salt=' + salt + ', signature=' + signature;
  const response = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: authorization },
    payload: JSON.stringify({ messages: [{ to: recipient, from: from, text: text }] }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('SOLAPI request failed: HTTP ' + response.getResponseCode());
  }
}

function normalizePhone_(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return /^01[016789]\d{7,8}$/.test(phone) ? phone : '';
}

function cleanText_(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validateVisitDate_(value) {
  const date = String(value || '');
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid visit date');
  const parsed = new Date(date + 'T00:00:00+09:00');
  if (isNaN(parsed.getTime()) || Utilities.formatDate(parsed, 'GMT+9', 'yyyy-MM-dd') !== date) {
    throw new Error('Invalid visit date');
  }
  const today = Utilities.formatDate(new Date(), 'GMT+9', 'yyyy-MM-dd');
  if (date < today) throw new Error('Past visit date');
  return date;
}

function validateVisitTime_(value) {
  const time = String(value || '');
  return /^(10|11|12|13|14|15|16|17|18|19):00$/.test(time) ? time : '';
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
