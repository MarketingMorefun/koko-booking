// Decides which follow-up emails are due and renders them. Pure: no network, no DB.
// Inputs ($var): Bookings, Recent, Credits, Locations, Packages, Rooms, Forced; ($input): force_kind.
const T = __TEMPLATES__;
const PLACE = {1:'ChIJdXLt_eOvEmsRICLwb4ZFjQU',3:'ChIJYy2SrRy7EmsRwEghAeunXmM',4:'ChIJI4lZdgS5EmsR-R2aNkZnJvg',5:'ChIJN7CqvUunEmsRJSovXBhf6mI',6:'ChIJmX_Ve22vEmsRFVWV-_XLEFo',11:'ChIJtXFmVuanEmsR_8hd9LAp-jA'};
const CUTOFF = Date.parse('__CUTOFF__');   // thank-you only for events on/after go-live day
const PAID = ['deposit_paid','paid','confirmed'];
const DAY = 86400000, LIMIT = 10, SITE = 'https://booking.morefun.com.au';
const now = Date.now();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lc = s => String(s || '').trim().toLowerCase();
const plain = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const parts = (ts, opts) => {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-AU', {timeZone: 'Australia/Sydney', ...opts}).formatToParts(new Date(ts))) o[p.type] = p.value;
  return o;
};
const syd = ts => { const o = parts(ts, {year:'numeric', month:'numeric', day:'numeric', hour:'numeric', hourCycle:'h23'}); return {y:+o.year, m:+o.month, d:+o.day, h:+o.hour}; };
// Sydney wall-clock time -> epoch ms (handles DST by measuring the offset at that instant).
const sydTs = (y, m, d, h) => { const guess = Date.UTC(y, m - 1, d, h); const p = syd(guess); return guess - (Date.UTC(p.y, p.m - 1, p.d, p.h) - guess); };
const longDate = (ts, year) => { const o = parts(ts, {weekday:'long', day:'numeric', month:'long', year:'numeric'}); return `${o.weekday} ${o.day} ${o.month}` + (year ? ` ${o.year}` : ''); };
const fill = (html, map) => Object.keys(map).reduce((h, k) => h.split('{{' + k + '}}').join(map[k]), html);

const locs = Object.fromEntries(($var.Locations || []).map(l => [l.id, l]));
const pkgs = Object.fromEntries(($var.Packages || []).map(p => [p.id, p]));
const roomOk = id => ($var.Rooms || []).some(r => Number(r.Location_id) === Number(id) && r.is_active);
const venueName = l => { const n = String((l && l.Name) || '').replace(/\s*-\s*\d+$/, ''); return /^koko/i.test(n) ? n : 'KOKO Amusement ' + n; };
const creditFor = email => ($var.Credits || []).some(c => lc(c.customer_email) === lc(email) && c.status === 'available');
const bookedAgain = b => ($var.Recent || []).some(o => o.id !== b.id && lc(o.customer_email) === lc(b.customer_email) && o.created_at > b.created_at && PAID.includes(o.status));

function render(b, kind) {
  const l = locs[b.location_id] || {};
  const venue = esc(venueName(l));
  // Party bookers get their first name; group contacts are often a school or company, so use the whole name.
  const nameRaw = plain(b.booking_type === 'birthday_party' ? String(b.customer_name || '').trim().split(/\s+/)[0] : b.customer_name) || 'there';
  const first = esc(nameRaw), firstRaw = nameRaw;
  const childRaw = plain(b.birthday_child_name), child = esc(childRaw);
  const party = b.booking_type === 'birthday_party';
  const code = String(b.referral_code || '');
  const credit = creditFor(b.customer_email);
  const strong = v => `<strong style='color:#2F241C;'>${v}</strong>`;
  const referral = lead => code ? fill(T.referral_block, {REFERRAL_LEAD: lead, REFERRAL_CODE: esc(code), REFERRAL_CARD_URL: `${SITE}/booking/referral-card?code=${encodeURIComponent(code)}`}) : '';
  const creditBlock = (label, text) => credit ? fill(T.credit_block, {CREDIT_LABEL: label, CREDIT_TEXT: text}) : '';
  const email = esc(b.customer_email);
  if (kind === 'thank_you') {
    const html = fill(T.thank_you_html, {
      CREDIT_BLOCK: creditBlock('A little thank-you', `Your next KOKO party or group visit is $30 off. It's saved to ${strong(email)} and comes off automatically when you book with this email — no code needed.`),
      REFERRAL_BLOCK: referral(party ? 'Did one of the parents ask where you booked?' : "Know another team, class or group who'd love it here?"),
      NEXT_YEAR_BLOCK: party ? fill(T.next_year_block, {NEXT_BIRTHDAY: child ? `${child}'s next birthday` : 'The next birthday'}) : '',
      BUBBLE: party ? 'Thanks for partying with us! 🎉' : `Thanks for visiting, ${first}! 👋`,
      HEADING: party ? (child ? `Thank you for celebrating ${child}'s birthday with us!` : 'Thank you for celebrating with us!') : 'Thanks for bringing your group to KOKO!',
      INTRO: party
        ? `Hi ${first}, we hope ${child || 'the birthday star'} and all the little guests had a blast at ${strong(venue)} on ${longDate(b.start_ts)}. Thank you for choosing KOKO to make the day special.`
        : `Hi ${first}, thank you for visiting ${strong(venue)} on ${longDate(b.start_ts)}. We hope everyone had a great time!`,
      REVIEW_URL: PLACE[b.location_id] ? `https://search.google.com/local/writereview?placeid=${PLACE[b.location_id]}` : 'https://www.kokoamusement.com.au/',
      REVIEW_WHO: party ? 'other families' : 'others',
      BOOK_URL: `${SITE}/booking/${party ? 'birthday-party' : 'group'}`,
      BOOK_LABEL: party ? 'Book your next visit' : 'Plan your next group visit',
      WHY: `You're receiving this because you booked a ${party ? 'party' : 'group visit'} at KOKO Amusement.`,
    });
    const subject = party ? (childRaw ? `Thank you for celebrating ${childRaw}'s birthday at KOKO! 🎉` : 'Thank you for celebrating at KOKO! 🎉') : `Thanks for visiting KOKO Amusement, ${firstRaw}!`;
    return {subject, html};
  }
  const canBookThere = l.is_active && roomOk(b.location_id);
  const guests = Number(b.guests) || 0;
  const pkg = pkgs[b.package_id] || {};
  const html = fill(T.anniversary_html, {
    CREDIT_BLOCK: creditBlock('Still waiting for you', `You still have $30 off saved to ${strong(email)}. It comes off automatically when you book with this email.`),
    REFERRAL_BLOCK: referral(child ? `Party season for ${child}'s friends too?` : 'Party season for your friends too?'),
    HEADING: child ? `${child}'s birthday is coming up again!` : "It's almost birthday time again!",
    INTRO: `Hi ${first}, it's been almost a year since we celebrated ${child ? child + "'s birthday" : 'your party'} together. Want to do it again? Weekend party slots fill up fast, so booking early gets you the time that suits you best.`,
    LOCATION: venue, PARTY_DATE: longDate(b.start_ts, true), PACKAGE: esc(pkg.Name || 'Birthday party'), GUESTS: String(guests),
    BOOK_URL: canBookThere ? `${SITE}/booking/birthday-party?location_slug=${encodeURIComponent(l.slug)}&amp;guests=${guests}` : `${SITE}/booking/birthday-party`,
    BOOK_LABEL: child ? `Book ${child}'s party` : 'Book your party',
    BOOK_SUB: canBookThere ? `We'll start you at ${venue} with ${guests} guests — you can change anything.` : 'Pick any KOKO venue and time that suits you.',
  });
  const subject = childRaw ? `${childRaw}'s birthday is coming up — celebrate at KOKO again? 🎂` : 'Birthday coming up? Celebrate at KOKO again 🎂';
  return {subject, html};
}

const due = [];
const push = (b, kind, skip) => due.push({id: b.id, kind, to: String(b.customer_email || '').trim(), skip_reason: skip || '', ...(skip ? {subject: '', html: ''} : render(b, kind))});
if ($var.Forced) {
  push($var.Forced, $input.force_kind === 'anniversary' ? 'anniversary' : 'thank_you');
} else {
  for (const b of ($var.Bookings || [])) {
    if (due.length >= LIMIT) break;
    if (!PAID.includes(b.status) || !String(b.customer_email || '').includes('@') || !b.start_ts) continue;
    const p = syd(b.start_ts);
    if (!b.thankyou_sent_at && b.start_ts >= CUTOFF) {
      const at = sydTs(p.y, p.m, p.d + 1, 9);
      if (now >= at && now < at + 14 * DAY) { push(b, 'thank_you'); continue; }
    }
    if (b.booking_type === 'birthday_party' && !b.anniversary_sent_at) {
      const party = sydTs(p.y + 1, p.m, p.d, 9);
      if (now >= party - 42 * DAY && now < party) push(b, 'anniversary', bookedAgain(b) ? 'Booked again since' : '');
    }
  }
}
return {due, checked: ($var.Bookings || []).length};
