const allowedTimes = new Set(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/meta-pixel.js') return pixelScript(env);
    if (request.method !== 'POST' || url.pathname !== '/lead') return json({ result: 'error', message: 'Not found' }, 404, cors);
    if (!origin || origin !== env.ALLOWED_ORIGIN) return json({ result: 'error', message: 'Origin not allowed' }, 403, cors);

    let lead;
    try { lead = await request.json(); } catch { return json({ result: 'error', message: 'Invalid request' }, 400, cors); }
    const validation = validateLead(lead);
    if (!validation.valid) {
      console.log(JSON.stringify({ event: 'lead_failed', reason: validation.reason }));
      return json({ result: 'error', message: '입력 정보를 확인해 주세요.' }, 400, cors);
    }

    const eventId = lead.eventId;
    try {
      const appsScript = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, phone: validation.phone, relayToken: env.APPS_SCRIPT_RELAY_TOKEN })
      });
      const appsResult = await appsScript.json().catch(() => null);
      if (!appsScript.ok || !appsResult || appsResult.result !== 'success') {
        console.log(JSON.stringify({ event: 'apps_script_failed', eventId, status: appsScript.status }));
        return json({ result: 'error', message: '접수 처리 중 오류가 발생했습니다.' }, 502, cors);
      }
      console.log(JSON.stringify({ event: 'lead_success', eventId }));
    } catch (error) {
      console.log(JSON.stringify({ event: 'apps_script_failed', eventId, reason: 'network_or_response' }));
      return json({ result: 'error', message: '접수 처리 중 오류가 발생했습니다.' }, 502, cors);
    }

    const capi = await sendCapiLead(lead, validation.phone, request, env);
    console.log(JSON.stringify({ event: capi.ok ? 'capi_success' : 'capi_skipped_or_failed', eventId, reason: capi.reason || undefined }));
    return json({ result: 'success', eventId }, 200, cors);
  }
};

function validateLead(lead) {
  if (!lead || typeof lead !== 'object') return { valid: false, reason: 'body' };
  const phone = String(lead.phone || '').replace(/\D/g, '');
  if (!String(lead.name || '').trim() || String(lead.name).trim().length > 40) return { valid: false, reason: 'name' };
  if (!/^01[016789]\d{7,8}$/.test(phone)) return { valid: false, reason: 'phone' };
  if (!/^[a-zA-Z0-9-]{16,120}$/.test(String(lead.eventId || ''))) return { valid: false, reason: 'event_id' };
  if (lead.visitDate && (!isValidDate(lead.visitDate) || lead.visitDate < koreaToday())) return { valid: false, reason: 'visit_date' };
  if (lead.visitTime && !allowedTimes.has(lead.visitTime)) return { valid: false, reason: 'visit_time' };
  return { valid: true, phone };
}

function koreaToday() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+09:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function sendCapiLead(lead, phone, request, env) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN) return { ok: false, reason: 'not_configured' };
  const userData = { ph: [await sha256(phone)] };
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  const clientIp = request.headers.get('CF-Connecting-IP');
  const clientUserAgent = request.headers.get('User-Agent');
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  const event = {
    event_name: 'Lead', event_time: Math.floor(Date.now() / 1000), event_id: lead.eventId,
    action_source: 'website', event_source_url: String(lead.pageUrl || '').slice(0, 2048),
    user_data: userData
  };
  const endpoint = `https://graph.facebook.com/v22.0/${encodeURIComponent(env.META_PIXEL_ID)}/events`;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [event], access_token: env.META_CAPI_ACCESS_TOKEN, ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}) }) });
    return response.ok ? { ok: true } : { ok: false, reason: `http_${response.status}` };
  } catch { return { ok: false, reason: 'network' }; }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(origin, allowedOrigin) {
  return { 'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Content-Type': 'application/json; charset=UTF-8' };
}
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers }); }
function pixelScript(env) {
  if (!env.META_PIXEL_ID) return new Response('// Meta Pixel is not configured.', { headers: { 'Content-Type': 'application/javascript; charset=UTF-8', 'Cache-Control': 'no-store' } });
  const pixelId = JSON.stringify(env.META_PIXEL_ID);
  const script = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${pixelId});fbq('track','PageView');window.SosaMeta={trackLead:function(eventId){fbq('track','Lead',{}, {eventID:eventId});}};`;
  return new Response(script, { headers: { 'Content-Type': 'application/javascript; charset=UTF-8', 'Cache-Control': 'no-store' } });
}
