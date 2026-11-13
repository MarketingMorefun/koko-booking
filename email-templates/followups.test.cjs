// node test_followups.cjs TEMPLATES_JSON LAMBDA_JS OUT_HTML
const fs = require('fs'), assert = require('assert/strict');
const [tplPath, lambdaPath, outHtml] = process.argv.slice(2);
const T = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
for (const k in T) T[k] = T[k].split('__IMG__').join('../email-assets/');
const code = fs.readFileSync(lambdaPath, 'utf8').replace('__TEMPLATES__', JSON.stringify(T)).replace('__CUTOFF__', '2026-11-13T00:00:00+11:00');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('$var', '$input', '$env', 'crypto', code);

const NOW = Date.parse('2026-11-16T10:00:00+11:00');       // Monday 10am Sydney
const realNow = Date.now; Date.now = () => NOW;
const ts = s => Date.parse(s);
const base = {status: 'deposit_paid', guests: 12, package_id: 2, created_at: ts('2026-10-01T10:00:00+10:00')};
const Locations = [{id: 3, Name: 'Burwood', slug: 'Burwood', is_active: true}, {id: 1, Name: 'Town Hall - 614', slug: 'Townhall_614', is_active: true}, {id: 6, Name: 'Haymarket', slug: 'Haymarket', is_active: true}];
const Rooms = [{Location_id: 1, is_active: true}, {Location_id: 3, is_active: false}];
const Packages = [{id: 2, Name: 'KOKO Party Fun'}];
const B = [
  {...base, id: 1, booking_type: 'birthday_party', location_id: 1, customer_name: 'Sarah Example', customer_email: 'sarah@example.com', birthday_child_name: 'Mia', referral_code: 'KOKO-1-ABC', start_ts: ts('2026-11-15T12:00:00+11:00')},           // party yesterday -> thank-you
  {...base, id: 2, booking_type: 'group_booking', location_id: 6, customer_name: 'James Example School', customer_email: 'james@example.com', referral_code: 'KOKO-2-DEF', start_ts: ts('2026-11-14T15:00:00+11:00')},                                     // group 2 days ago -> thank-you
  {...base, id: 3, booking_type: 'birthday_party', location_id: 1, customer_name: 'Ann Late', customer_email: 'ann@example.com', birthday_child_name: 'Leo', start_ts: ts('2026-11-16T12:00:00+11:00')},                                         // party today -> not yet
  {...base, id: 4, booking_type: 'birthday_party', location_id: 1, customer_name: 'Old Party', customer_email: 'old@example.com', birthday_child_name: 'Zoe', start_ts: ts('2026-11-01T12:00:00+11:00')},                                        // before cutoff -> no thank-you
  {...base, id: 5, booking_type: 'birthday_party', location_id: 1, customer_name: 'Kim Annual', customer_email: 'kim@example.com', birthday_child_name: 'Ava', referral_code: 'KOKO-5-GHI', thankyou_sent_at: 1, start_ts: ts('2025-12-20T12:00:00+11:00'), created_at: ts('2025-11-01T10:00:00+11:00')}, // anniversary in 34 days -> due
  {...base, id: 6, booking_type: 'birthday_party', location_id: 3, customer_name: 'Bo Burwood', customer_email: 'bo@example.com', birthday_child_name: 'Max', thankyou_sent_at: 1, start_ts: ts('2025-12-10T12:00:00+11:00'), created_at: ts('2025-11-01T10:00:00+11:00')},  // Burwood room off -> generic link
  {...base, id: 7, booking_type: 'birthday_party', location_id: 1, customer_name: 'Rex Again', customer_email: 'REX@example.com', thankyou_sent_at: 1, start_ts: ts('2025-12-12T12:00:00+11:00'), created_at: ts('2025-11-01T10:00:00+11:00')},                            // booked again -> skip
  {...base, id: 8, booking_type: 'birthday_party', location_id: 1, customer_name: 'Far Future', customer_email: 'far@example.com', thankyou_sent_at: 1, start_ts: ts('2026-03-01T12:00:00+11:00'), created_at: ts('2026-02-01T10:00:00+11:00')},                         // anniversary next year -> not yet
];
const Recent = [...B, {id: 99, customer_email: 'rex@example.com', status: 'deposit_paid', created_at: ts('2026-10-20T10:00:00+11:00')}];
const Credits = [{customer_email: 'sarah@example.com', status: 'available'}, {customer_email: 'kim@example.com', status: 'available'}, {customer_email: 'bo@example.com', status: 'used'}];

(async () => {
  const r = await run({Bookings: B, Recent, Credits, Locations, Packages, Rooms}, {}, {}, require('crypto'));
  const got = Object.fromEntries(r.due.map(d => [d.id, d]));
  assert.deepEqual(Object.keys(got).map(Number).sort((a, b) => a - b), [1, 2, 5, 6, 7], 'which bookings are due');
  assert.equal(got[1].kind, 'thank_you'); assert.match(got[1].subject, /Mia's birthday/); assert.match(got[1].html, /Sunday 15 November/); assert.match(got[1].html, /A little thank-you/); assert.match(got[1].html, /KOKO-1-ABC/); assert.match(got[1].html, /See you next year/); assert.match(got[1].html, /KOKO Amusement Town Hall</);
  assert.equal(got[2].kind, 'thank_you'); assert.match(got[2].subject, /James Example School!/); assert.doesNotMatch(got[2].html, /See you next year/); assert.doesNotMatch(got[2].html, /A little thank-you/); assert.match(got[2].html, /ChIJmX_Ve22vEmsRFVWV-_XLEFo/);
  assert.equal(got[5].kind, 'anniversary'); assert.match(got[5].html, /location_slug=Townhall_614&amp;guests=12/); assert.match(got[5].html, /Still waiting/); assert.match(got[5].html, /Saturday 20 December 2025/);
  assert.equal(got[6].kind, 'anniversary'); assert.doesNotMatch(got[6].html, /location_slug/); assert.match(got[6].html, /Pick any KOKO venue/); assert.doesNotMatch(got[6].html, /Still waiting/);
  assert.equal(got[7].skip_reason, 'Booked again since');
  for (const d of r.due) assert.doesNotMatch(d.html, /\{\{\w+\}\}/, `unfilled placeholder in ${d.id}`);
  // Escaping: a hostile name must not inject HTML.
  const evil = await run({Forced: {...B[0], customer_name: '<script>x</script>', birthday_child_name: "<img src=x onerror=1>"}}, {force_kind: 'thank_you'}, {}, require('crypto'));
  assert.doesNotMatch(evil.due[0].html, /<script>|<img src=x/);
  // DST: an October party (AEDT starts 4 Oct) still gets its email at 9am Sydney the next morning.
  Date.now = () => Date.parse('2026-11-30T08:59:00+11:00');
  const early = await run({Bookings: [{...B[0], id: 20, start_ts: ts('2026-11-29T18:00:00+11:00')}], Credits, Locations, Packages, Rooms}, {}, {}, require('crypto'));
  assert.equal(early.due.length, 0, 'not before 9am');
  Date.now = () => Date.parse('2026-11-30T09:00:00+11:00');
  const onTime = await run({Bookings: [{...B[0], id: 20, start_ts: ts('2026-11-29T18:00:00+11:00')}], Credits, Locations, Packages, Rooms}, {}, {}, require('crypto'));
  assert.equal(onTime.due.length, 1, 'at 9am');
  Date.now = realNow;
  const page = r.due.filter(d => d.html).map(d => `<div style="max-width:680px;margin:30px auto 0;font:13px Arial"><b>#${d.id} · ${d.kind}</b> → ${d.to}<br><b>Subject:</b> ${d.subject}</div>` + d.html.replace(/^.*<body[^>]*>/s, '').replace(/<\/body>.*$/s, '')).join('<hr>');
  fs.writeFileSync(outHtml, '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>' + (T.thank_you_html.match(/<style>(.*?)<\/style>/s) || ['', ''])[1] + '</style><body style="margin:0;background:#EFE8DC">' + page);
  console.log('all follow-up checks passed;', r.due.length, 'due of', r.checked);
})().catch(e => { console.error(e.message); process.exit(1); });
