/* Adds private booking details to the existing Webflow Party Planning page. */
(() => {
  'use strict';

  if (window.location.pathname.replace(/\/$/, '') !== '/booking/party-planning') return;
  if (!window.location.hash.startsWith('#t=')) return;

  const token = window.location.hash.slice(3);
  // Keep the token in memory for this visit and retries. Restore the public URL before rendering.
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);

  const isValidToken = /^[A-Za-z0-9_-]{24}$/.test(token);
  const endpoint = 'https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ/BookingDetails';
  const supportEmail = 'marketing@kokoamusement.com.au';
  const georgeArt = 'https://cdn.jsdelivr.net/gh/MarketingMorefun/koko-booking@57b1895e99a8ce3e00e18b90f88efa0455e29c03/email-assets/';
  const sydney = 'Australia/Sydney';
  const date = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: sydney
  });
  const shortDate = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: sydney
  });
  const time = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: sydney
  });
  const amount = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  const count = new Intl.NumberFormat('en-AU');
  const money = cents => amount.format(cents / 100);

  // Venue and travel copy is maintained here. The booking supplies the address and phone.
  const venues = {
    1: {
      slug: 'townhall-614',
      arrival: 'Meet at 614 George Street near Town Hall Station.',
      transport: 'Town Hall Station is a short walk away. Buses stop along George Street and around Town Hall.',
      parking: 'Look for paid parking near Town Hall or World Square.'
    },
    3: {
      slug: 'burwood',
      arrival: 'Head to Level 3 of Emerald Square on Belmore Street.',
      transport: 'Walk from Burwood Station towards Emerald Square. Buses stop around Burwood Road and the station.',
      parking: 'Check Emerald Square and nearby car parks for current parking conditions.'
    },
    4: {
      slug: 'hurstville',
      arrival: 'Find KOKO at Shop G03 in Westfield Hurstville.',
      transport: 'Walk from Hurstville Station or use a bus stop near Westfield.',
      parking: 'Parking is available at Westfield Hurstville.'
    },
    5: {
      slug: 'hornsby-westfield-event-cinemas',
      floor: 'Level 4',
      arrival: 'Head to the cinema level at Westfield Hornsby, next to Event Cinemas.',
      transport: 'Walk from Hornsby Station to Westfield, or use a bus stop near the station or centre.',
      parking: 'Park at Westfield Hornsby and follow signs to the cinema level.'
    },
    6: {
      slug: 'haymarket',
      arrival: 'Head to Levels 1 and 2 at 1 Dixon Street in Haymarket.',
      transport: 'Walk from Chinatown light rail, Central Station or Town Hall Station.',
      parking: 'There are paid parking options around Haymarket, Chinatown and Darling Square.'
    },
    11: {
      slug: 'hornsby-westfield-near-kangnam-bbq',
      floor: 'Level 2',
      arrival: 'Head to Shop 2042 on Level 2 of Westfield Hornsby, near Kangnam BBQ.',
      transport: 'Walk from Hornsby Station to Westfield, or use a bus stop near the station or centre.',
      parking: 'Park at Westfield Hornsby and follow signs for Level 2.'
    }
  };

  const paymentMethods = {
    deposit: ['Deposit paid', 'Any remaining balance is payable at the venue on the day.'],
    full: ['Paid in full', 'Your booking has been paid in full.'],
    invoice: ['Invoice', 'Pay according to the terms on your invoice.']
  };
  const paymentFields = ['package_cents', 'addons_cents', 'total_cents', 'discount_cents',
    'paid_cents', 'fee_cents', 'balance_cents'];
  const packageFeatures = [
    ['free_play_minutes', n => count.format(n) + ' minutes of play on red and yellow readers'],
    ['party_room_minutes', n => count.format(n) + ' minutes in the party room'],
    ['claw_games', n => count.format(n) + ' claw and prize games per guest'],
    ['feature_games', n => count.format(n) + ' feature games per guest'],
    ['preloaded_tickets', n => count.format(n) + ' KOKO tickets per guest'],
    ['celebrant_bonus_tickets', n => count.format(n) + ' bonus tickets for the birthday child']
  ];

  const bookingQuestions = [
    ['Can I change the date, package or number of guests?',
      'Email us with your booking number and what you’d like to change at least 24 hours before your visit. Changes depend on availability.'],
    ['What if more or fewer guests turn up?',
      'Call the venue as soon as you know. Extra guests depend on capacity and may cost extra. The minimum charge may still apply if fewer guests come.'],
    ['What if we’re running late or can’t make it?',
      'Call the venue with your expected arrival time or let the team know you can’t make it. Your booking may still finish at its scheduled time.'],
    ['Can I cancel or get my deposit back?',
      'Email us with your booking number as soon as your plans change. The standard deposit is non-refundable unless the law requires a refund or KOKO approves one.'],
    ['Can I get a receipt or tax invoice?',
      'Email us with your booking number. For a business or school invoice, include the billing name and any purchase order reference you need shown.'],
    ['I paid but can’t find my confirmation. What should I do?',
      'Check your junk folder and the email you booked with. If you still can’t find it, contact us with your booking number and proof of payment so we can check before you pay again.']
  ];
  const birthdayQuestions = [
    ['Can we arrive early and set up the party room?',
      'You can arrive up to 10 minutes early to check in. The room opens at your booked time unless the venue approves earlier access.'],
    ['Is the party room time the same as arcade time?',
      'They are separate. The time above is your reserved room slot. Ask the team at check-in about the order of room time and arcade play.'],
    ['Can we bring cake, food or decorations?',
      'Bring your own cake, food, non-alcoholic drinks and serving supplies. Simple decorations such as standing balloons and table decorations are welcome. Ask the venue about early drop-off or special supplies.'],
    ['Does the birthday child count, and do parents pay?',
      'The birthday child counts as a paid guest. Parents and guardians who only accompany children aren’t charged for the party package, but they count towards room capacity.'],
    ['Can I change the number of gift bags?',
      'Email us how many you’d like. The team can check availability and confirm the price.']
  ];
  const groupQuestions = [
    ['What should I share with my group?',
      'Share the venue, start time and a meeting point. If guests will arrive at different times or need to play in smaller groups, check with the venue first.'],
    ['Are a private room and food included?',
      'Check your confirmation for any reserved space or food arrangements. Ask the venue before bringing catering or requesting a room.'],
    ['Can we get a risk assessment for a school or OSHC visit?',
      'Email us the booking number, venue, date and planned activities. Include any coach drop-off, bag storage or accessibility arrangements you need checked.']
  ];
  const gameQuestions = [
    ['When does game time start, and can we pause it?',
      'A timed card starts counting down on its first tap at a machine. The timer keeps running, so wait to tap until you’re ready to play.'],
    ['Does timed play cover every game?',
      'Timed play applies to red and yellow readers. Claw, prize and feature games have separate limits. Check your package inclusions above.'],
    ['What are the included KOKO tickets for?',
      'Use the tickets already loaded on your game card at the prize counter.']
  ];

  const styles = `
    #koko-booking-details {
      --kbd-ink: #2e241b;
      --kbd-muted: #66594b;
      --kbd-border: #e8ddcc;
      --kbd-cream: #fffdf9;
      --kbd-warm: #fff3df;
      --kbd-yellow: #ffe600;
      box-sizing: border-box;
      width: min(100% - 2rem, 70rem);
      margin: clamp(1rem, 3vw, 2rem) auto;
      color: var(--kbd-ink);
      font-size: 1rem;
      line-height: 1.55;
    }
    #koko-booking-details *, #koko-booking-details *::before, #koko-booking-details *::after {
      box-sizing: border-box;
    }
    #koko-booking-details h2, #koko-booking-details h3, #koko-booking-details h4,
    #koko-booking-details p, #koko-booking-details dl, #koko-booking-details dd,
    #koko-booking-details ul { margin: 0; }
    #koko-booking-details :is(h2, h3, h4) { font-weight: 700; color: inherit; }
    #koko-booking-details h2 { font-size: clamp(1.65rem, 4vw, 2.25rem); line-height: 1.1; }
    #koko-booking-details h3 { font-size: 1.18rem; line-height: 1.28; }
    #koko-booking-details h4 { font-size: 1rem; }
    #koko-booking-details a { color: inherit; text-underline-offset: .18em; }
    #koko-booking-details :focus-visible { outline: 2px solid #805016; outline-offset: 3px; }
    #koko-booking-details .kbd-intro {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: .6rem 1rem; margin-bottom: .8rem;
    }
    #koko-booking-details .kbd-badges, #koko-booking-details .kbd-actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .65rem;
    }
    #koko-booking-details .kbd-badge {
      padding: .25rem .65rem; border-radius: 999px; background: var(--kbd-warm);
      font-size: .875rem; font-weight: 600; overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-confirmed { background: #e8f5eb; color: #255f44; }
    #koko-booking-details .kbd-cancelled { background: #f8e7e2; color: #842e28; }
    #koko-booking-details .kbd-greeting {
      display: flex; align-items: center; gap: .65rem; width: fit-content; max-width: 100%;
      margin-bottom: .9rem; padding: .25rem .9rem .25rem .45rem; border-radius: 1rem;
      background: #fff3df; font-weight: 600; overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-greeting img {
      display: block; flex: 0 0 auto; width: 3rem; height: auto;
    }
    #koko-booking-details .kbd-grid { display: grid; gap: .85rem; }
    #koko-booking-details .kbd-card {
      min-width: 0; padding: clamp(1rem, 2vw, 1.4rem); border: 1px solid var(--kbd-border);
      border-radius: 1rem; background: var(--kbd-cream); overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-card h3 { margin-bottom: .65rem; }
    #koko-booking-details .kbd-payment { background: var(--kbd-warm); }
    #koko-booking-details .kbd-fields { display: grid; gap: .5rem 1rem; }
    #koko-booking-details .kbd-fields div { padding-top: .45rem; border-top: 1px solid var(--kbd-border); }
    #koko-booking-details .kbd-fields dt { font-size: .875rem; color: var(--kbd-muted); }
    #koko-booking-details .kbd-fields dd { font-weight: 600; }
    #koko-booking-details .kbd-ledger { margin-top: .55rem; font-size: .875rem; }
    #koko-booking-details .kbd-ledger div { display: flex; justify-content: space-between; gap: .75rem; padding: .3rem 0; }
    #koko-booking-details .kbd-ledger dd { font-weight: 600; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    #koko-booking-details .kbd-balance { border-top: 1px solid var(--kbd-border); font-size: 1rem; font-weight: 700; }
    #koko-booking-details .kbd-status, #koko-booking-details .kbd-muted { color: var(--kbd-muted); font-size: .875rem; }
    #koko-booking-details .kbd-list { padding-left: 1.15rem; }
    #koko-booking-details .kbd-list li + li { margin-top: .25rem; }
    #koko-booking-details .kbd-subsection { margin-top: .7rem; }
    #koko-booking-details .kbd-subsection p + p { margin-top: .3rem; }
    #koko-booking-details .kbd-actions { margin-top: .8rem; }
    #koko-booking-details .kbd-action {
      min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: .4rem .7rem;
      border: 1px solid #b7a58e; border-radius: .7rem; background: white; color: inherit;
      font: inherit; font-size: .875rem; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer;
    }
    #koko-booking-details .kbd-action:hover { border-color: var(--kbd-ink); }
    #koko-booking-details .kbd-primary { background: var(--kbd-yellow); border: 2px solid var(--kbd-ink); box-shadow: 3px 3px var(--kbd-ink); }
    #koko-booking-details .kbd-questions { min-width: 0; margin: clamp(1.2rem, 4vw, 2.25rem) 4px 0 0; }
    #koko-booking-details .kbd-questions-heading {
      display: flex; justify-content: space-between; align-items: center; gap: .65rem;
      margin-bottom: 1rem;
    }
    #koko-booking-details .kbd-questions-heading h3 {
      font-size: clamp(1.45rem, 3vw, 2rem); line-height: 1.16;
    }
    #koko-booking-details .kbd-qa-highlight {
      background: linear-gradient(transparent 76%, var(--kbd-yellow) 76%, var(--kbd-yellow) 96%, transparent 96%);
      box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    #koko-booking-details .kbd-qa-mascot {
      position: relative; display: grid; place-items: center; flex: 0 0 auto;
      width: clamp(4.25rem, 12vw, 6.25rem); aspect-ratio: 1; margin-right: .5rem;
      background: radial-gradient(circle, #fff083 0 52%, #fff7d2 53% 66%, transparent 67%);
    }
    #koko-booking-details .kbd-qa-mascot img { display: block; height: 88%; width: auto; max-width: 100%; }
    #koko-booking-details .kbd-qa-mascot::before, #koko-booking-details .kbd-qa-mascot::after {
      content: ''; position: absolute; width: .85rem; aspect-ratio: 1; background: #b97a1d;
      clip-path: polygon(50% 0, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0 50%, 36% 36%);
    }
    #koko-booking-details .kbd-qa-mascot::before { top: 18%; right: 0; }
    #koko-booking-details .kbd-qa-mascot::after { bottom: 24%; left: 0; width: .58rem; }
    #koko-booking-details .kbd-faq { display: grid; gap: .95rem; }
    #koko-booking-details .kbd-faq + .kbd-faq { margin-top: clamp(1.5rem, 4vw, 2.25rem); }
    #koko-booking-details .kbd-faq h4 { font-size: clamp(1.08rem, 2.5vw, 1.3rem); line-height: 1.3; }
    #koko-booking-details .kbd-question {
      background: white; border: 2px solid var(--kbd-ink); border-radius: 1.25rem;
      box-shadow: 4px 4px 0 var(--kbd-ink);
    }
    #koko-booking-details .kbd-question summary {
      display: grid; grid-template-columns: minmax(0, 1fr) .875rem; align-items: center;
      gap: .75rem; min-height: 3.625rem; padding: .75rem clamp(.9rem, 2vw, 1.25rem);
      list-style: none; cursor: pointer; font-size: .9375rem; line-height: 1.4; font-weight: 600;
    }
    #koko-booking-details .kbd-question summary::-webkit-details-marker { display: none; }
    #koko-booking-details .kbd-question summary:focus-visible { border-radius: 1.1rem; outline-offset: -5px; }
    #koko-booking-details .kbd-qa-toggle { position: relative; width: .875rem; height: .875rem; color: #7b6a58; }
    #koko-booking-details .kbd-qa-toggle::before, #koko-booking-details .kbd-qa-toggle::after {
      content: ''; position: absolute; top: 50%; left: 50%; width: .875rem; height: 2px;
      background: currentColor; transform: translate(-50%, -50%);
    }
    #koko-booking-details .kbd-qa-toggle::after { transform: translate(-50%, -50%) rotate(90deg); }
    #koko-booking-details .kbd-question[open] .kbd-qa-toggle::after { display: none; }
    #koko-booking-details .kbd-question-answer {
      padding: 0 clamp(.9rem, 2vw, 1.25rem) 1rem; color: var(--kbd-muted); font-size: .9375rem;
    }
    #koko-booking-details .kbd-questions > .kbd-actions { margin-top: 1.35rem; }
    @media (min-width: 35rem) {
      #koko-booking-details .kbd-fields { grid-template-columns: 1fr 1fr; }
    }
    @media (min-width: 50rem) {
      #koko-booking-details .kbd-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
    }
  `;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function george(pose, width, height) {
    const image = node('img');
    image.alt = '';
    image.width = width;
    image.height = height;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (pose === 'tablet') image.loading = 'lazy';
    image.src = georgeArt + 'george-' + pose + '.png';
    return image;
  }

  function link(text, href, className, newTab = false) {
    const element = node('a', className, text);
    element.href = href;
    if (newTab) {
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    }
    return element;
  }

  function rows(className, values) {
    const list = node('dl', className);
    for (const [label, value, rowClass] of values) {
      if (value === null || value === undefined || value === '') continue;
      const row = node('div', rowClass);
      row.append(node('dt', '', label), node('dd', '', value));
      list.append(row);
    }
    return list;
  }

  function listOf(items) {
    const list = node('ul', 'kbd-list');
    for (const item of items) list.append(node('li', '', item));
    return list;
  }

  function faqGroup(title, questions) {
    const group = node('section', 'kbd-faq');
    const heading = node('h4');
    heading.append(node('span', 'kbd-qa-highlight', title));
    group.append(heading);
    for (const [question, answer] of questions) {
      const item = node('details', 'kbd-question');
      const summary = node('summary', '', question);
      const icon = node('span', 'kbd-qa-toggle');
      icon.setAttribute('aria-hidden', 'true');
      summary.append(icon);
      item.append(summary, node('p', 'kbd-question-answer', answer));
      group.append(item);
    }
    return group;
  }

  function heading(panel, booking) {
    const intro = node('header', 'kbd-intro');
    const title = node('h2', '', 'My booking');
    title.id = 'koko-booking-details-title';
    intro.append(title);
    if (booking) {
      const cancelled = booking.status === 'cancelled';
      const badges = node('div', 'kbd-badges');
      badges.append(node('span', 'kbd-badge ' + (cancelled ? 'kbd-cancelled' : 'kbd-confirmed'),
        cancelled ? 'Cancelled' : 'Confirmed'), node('span', 'kbd-badge', 'Booking #' + booking.reference));
      intro.append(badges);
    }
    panel.replaceChildren(intro);
  }

  function displayTime(start, end) {
    const day = date.format(start);
    const sameDay = day === date.format(end);
    return day + ', ' + time.format(start) + ' – ' + (sameDay ? '' : date.format(end) + ', ') + time.format(end);
  }

  function venueName(location, venue) {
    const name = location.name;
    return venue?.floor && !name.toLowerCase().includes(venue.floor.toLowerCase())
      ? name + ' · ' + venue.floor
      : name;
  }

  function emailLink(reference, text = 'Email the KOKO team') {
    const subject = reference ? '?subject=' + encodeURIComponent('Booking #' + reference.replace(/[\r\n]/g, '')) : '';
    return link(text, 'mailto:' + supportEmail + subject, 'kbd-action');
  }

  function venueContact(location, venue) {
    const number = (location.phone || '').replace(/[^\d+]/g, '');
    // The planning hand-off flags the Cinema Level number on legacy Level 2 data.
    const ambiguousLevelTwo = location.id === 11 && /^(?:0|\+?61)290598236$/.test(number);
    if (/^\+?\d{8,15}$/.test(number) && !ambiguousLevelTwo) {
      return link('Call ' + location.phone, 'tel:' + number, 'kbd-action');
    }
    if (venue) return link('Venue contact details', '/locations/' + venue.slug, 'kbd-action');
    return null;
  }

  function calendarLinks(booking, start, end, place, isBirthday) {
    const title = isBirthday ? 'KOKO birthday party · Party room' : 'KOKO group visit';
    const description = isBirthday
      ? 'This event is for your reserved party room. Check with the venue about arcade play time.'
      : 'Check in at the venue counter.';
    const utc = value => value.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const startUtc = utc(start);
    const endUtc = utc(end);
    const params = new URLSearchParams({
      action: 'TEMPLATE', text: title, dates: startUtc + '/' + endUtc,
      stz: sydney, etz: sydney, location: place, details: description
    });
    const google = link('Google Calendar', 'https://calendar.google.com/calendar/r/eventedit?' + params,
      'kbd-action', true);
    const escapeText = value => value.replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/[,;]/g, '\\$&');
    const encoder = new TextEncoder();
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KOKO Amusement//Booking Details//EN', 'BEGIN:VEVENT',
      'UID:koko-booking-' + escapeText(booking.reference) + '@kokoamusement.com.au',
      'DTSTAMP:' + utc(new Date()), 'DTSTART:' + startUtc, 'DTEND:' + endUtc,
      'SUMMARY:' + escapeText(title), 'LOCATION:' + escapeText(place), 'DESCRIPTION:' + escapeText(description),
      'END:VEVENT', 'END:VCALENDAR', ''
    ];
    const calendar = lines.map(line => {
      let folded = '';
      let bytes = 0;
      for (const char of line) {
        const size = encoder.encode(char).length;
        if (bytes + size > 75) {
          folded += '\r\n ';
          bytes = 1;
        }
        folded += char;
        bytes += size;
      }
      return folded;
    }).join('\r\n');
    const blob = new Blob([calendar], { type: 'text/calendar;charset=utf-8' });
    const apple = link('Apple Calendar (.ics)', URL.createObjectURL(blob), 'kbd-action');
    apple.download = 'KOKO-booking.ics';
    return [google, apple];
  }

  function showPayment(payment) {
    const section = node('section', 'kbd-card kbd-payment');
    const [label, note] = paymentMethods[payment.method];
    section.append(node('h3', '', 'Payment summary'), node('p', 'kbd-status', label),
      node('p', 'kbd-muted', note));
    const paymentRows = [
      ['Package', money(payment.package_cents)],
      ['Add-ons', money(payment.addons_cents)],
      ['Booking total before discount', money(payment.total_cents)],
      [payment.discount_label || 'Discount', money(payment.discount_cents === 0 ? 0 : -payment.discount_cents)],
      [payment.method === 'deposit' ? 'Deposit applied' : 'Paid towards booking', money(payment.paid_cents)],
      ['Balance', money(payment.balance_cents), 'kbd-balance']
    ];
    if (payment.method !== 'invoice') {
      paymentRows.push(['Booking fee', money(payment.fee_cents)],
        ['Total paid online', money(payment.paid_cents + payment.fee_cents)]);
    }
    section.append(rows('kbd-ledger', paymentRows));
    if (payment.method !== 'invoice' && payment.fee_cents > 0) {
      section.append(node('p', 'kbd-muted', 'The booking fee is non-refundable.'));
    }
    return section;
  }

  function showVisit(booking, start, end, venue, name, isBirthday) {
    const section = node('section', 'kbd-card');
    const place = [name, booking.location.address].filter(Boolean).join(', ');
    section.append(node('h3', '', 'Your visit'), rows('kbd-fields', [
      [isBirthday ? 'Party room time (Sydney)' : 'Session time (Sydney)', displayTime(start, end)],
      ['Venue', place], ['Party room', isBirthday ? booking.room : null],
      ['Guests', count.format(booking.guests)], ['Package', booking.package.name]
    ]));
    const features = packageFeatures
      .filter(([key]) => booking.package[key] > 0)
      .map(([key, format]) => format(booking.package[key]));
    if (features.length) {
      const included = node('div', 'kbd-subsection');
      included.append(node('h4', '', 'What’s included'), listOf(features));
      section.append(included);
    }
    if (booking.addons.length) {
      const addOns = node('div', 'kbd-subsection');
      addOns.append(node('h4', '', 'Add-ons'), rows('kbd-ledger', booking.addons.map(addOn => [
        count.format(addOn.qty) + ' × ' + addOn.name + (addOn.option_label ? ' · ' + addOn.option_label : ''),
        money(addOn.line_total_cents)
      ])));
      section.append(addOns);
    }
    const actions = node('div', 'kbd-actions');
    const maps = new URLSearchParams({ api: '1', destination: place });
    actions.append(link('Get directions', 'https://www.google.com/maps/dir/?' + maps,
      'kbd-action kbd-primary', true));
    const contact = venueContact(booking.location, venue);
    if (contact) actions.append(contact);
    section.append(actions);
    const calendar = node('div', 'kbd-actions');
    calendar.append(node('strong', 'kbd-muted', 'Add to calendar'), ...calendarLinks(booking, start, end, place, isBirthday));
    section.append(calendar);
    return section;
  }

  function showTravel(venue, isBirthday) {
    const section = node('section', 'kbd-card kbd-subsection');
    const arrival = isBirthday
      ? 'You can arrive up to 10 minutes early to check in. Have your booking number ready.'
      : 'Meet your group before your session starts and check in together with your booking number.';
    section.append(node('h3', '', 'Getting here'), node('p', '', arrival));
    if (venue) {
      const directions = node('div', 'kbd-subsection');
      directions.append(node('p', '', venue.arrival), node('p', 'kbd-muted', 'Public transport: ' + venue.transport),
        node('p', 'kbd-muted', 'Parking: ' + venue.parking));
      section.append(directions);
      const actions = node('div', 'kbd-actions');
      actions.append(link('Venue and travel information', '/locations/' + venue.slug, 'kbd-action'));
      section.append(actions);
    }
    return section;
  }

  function showFAQs(booking, isBirthday) {
    const section = node('section', 'kbd-questions');
    const header = node('header', 'kbd-questions-heading');
    const heading = node('h3', '', 'Frequently asked ');
    heading.append(node('span', 'kbd-qa-highlight', 'questions'));
    const mascot = node('span', 'kbd-qa-mascot');
    mascot.append(george('tablet', 171, 240));
    header.append(heading, mascot);
    section.append(header);
    const questions = [['When is my payment due?', paymentMethods[booking.payment.method][1]], ...bookingQuestions];
    section.append(faqGroup('Payments and booking changes', questions),
      faqGroup(isBirthday ? 'Birthday parties' : 'Group visits', isBirthday ? birthdayQuestions : groupQuestions),
      faqGroup('Games and cards', gameQuestions));
    const actions = node('div', 'kbd-actions');
    actions.append(emailLink(booking.reference), link('Booking terms', '/terms', 'kbd-action'));
    section.append(actions);
    return section;
  }

  function prefillInvitation(booking, name, start) {
    const invitation = document.getElementById('invitation');
    if (!invitation) return;
    invitation.setAttribute('data-clarity-mask', 'true');
    const values = {
      '.kbi-name': booking.child_name,
      '.kbi-location': name,
      '.kbi-date': shortDate.format(start) + ' · ' + time.format(start)
    };
    for (const [selector, value] of Object.entries(values)) {
      const field = invitation.querySelector('.kbi-field' + selector);
      // Leave anything the visitor already typed while the booking was loading.
      if (!field || !value || field.textContent.trim()) continue;
      field.textContent = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function hide(element) {
    if (element) element.style.setProperty('display', 'none', 'important');
  }

  function updatePlanning(planning, hero, panel, isBirthday, cancelled) {
    if (cancelled) {
      for (const section of planning.children) {
        if (section !== panel && section.matches('section')) hide(section);
      }
      return;
    }
    hide(document.getElementById('planning-venues'));
    if (isBirthday) return;

    hide(document.getElementById('party-checklist'));
    hide(document.getElementById('invitation'));
    for (const section of planning.children) {
      if (section.id || section === hero || !section.matches('section')) continue;
      const title = section.querySelector('h2')?.textContent.trim().toLowerCase();
      if (title === 'know your party timings' || title === 'need a hand with your party?') hide(section);
    }
    const title = hero.querySelector('h1');
    const tag = hero.querySelector('.cg-tag');
    const lead = hero.querySelector('.vg-lede');
    if (title) title.textContent = 'Your KOKO group visit';
    if (tag) tag.textContent = 'GROUP BOOKING';
    if (lead) lead.textContent = 'Check your session, payment and arrival details below.';
    hide(hero.querySelector('.kp-actions'));
  }

  function renderBooking(panel, planning, hero, booking, start, end) {
    const isBirthday = booking.type === 'birthday_party';
    const cancelled = booking.status === 'cancelled';
    const venue = venues[booking.location.id];
    const name = venueName(booking.location, venue);
    heading(panel, booking);
    if (cancelled) {
      const section = node('section', 'kbd-card');
      section.append(node('h3', '', 'This booking has been cancelled'), rows('kbd-fields', [
        ['Original time (Sydney)', displayTime(start, end)], ['Venue', name]
      ]));
      const actions = node('div', 'kbd-actions');
      actions.append(emailLink(booking.reference));
      const contact = venueContact(booking.location, venue);
      if (contact) actions.append(contact);
      section.append(actions);
      panel.append(section);
    } else {
      if (booking.greeting_name) {
        const greeting = node('div', 'kbd-greeting');
        greeting.append(george('wave', 387, 400), node('p', '', 'Hi ' + booking.greeting_name + '!'));
        panel.append(greeting);
      }
      const grid = node('div', 'kbd-grid');
      grid.append(showVisit(booking, start, end, venue, name, isBirthday), showPayment(booking.payment));
      panel.append(grid, showTravel(venue, isBirthday), showFAQs(booking, isBirthday));
      if (isBirthday) prefillInvitation(booking, name, start);
    }
    updatePlanning(planning, hero, panel, isBirthday, cancelled);
  }

  function statusMessage(panel, message) {
    heading(panel);
    const card = node('div', 'kbd-card');
    const status = node('p', '', message);
    status.setAttribute('role', 'status');
    card.append(status);
    panel.append(card);
    return card;
  }

  function showNotFound(panel) {
    const card = statusMessage(panel,
      'We couldn’t find this booking. Please check the link in your SMS or email, or contact us.');
    const actions = node('div', 'kbd-actions');
    actions.append(emailLink());
    card.append(actions);
  }

  async function fetchBooking() {
    const request = new AbortController();
    const timer = window.setTimeout(() => request.abort(), 12000);
    try {
      const response = await window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: request.signal
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Booking request failed');
      const result = await response.json();
      if (result.ok !== true || !result.booking) throw new Error('Unexpected booking response');
      return result.booking;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function start() {
    const planning = document.getElementById('party-planning');
    const hero = planning?.querySelector(':scope > .kp-hero');
    if (!hero) return;

    const panel = node('section');
    panel.id = 'koko-booking-details';
    panel.setAttribute('data-clarity-mask', 'true');
    panel.setAttribute('aria-labelledby', 'koko-booking-details-title');
    document.head.append(node('style', '', styles));
    hero.after(panel);
    if (!isValidToken) {
      showNotFound(panel);
      return;
    }

    async function load() {
      statusMessage(panel, 'Loading your booking…');
      panel.setAttribute('aria-busy', 'true');
      try {
        const booking = await fetchBooking();
        if (!booking) {
          showNotFound(panel);
          return;
        }
        const start = new Date(booking.start);
        const end = new Date(booking.end);
        const cancelled = booking.status === 'cancelled';
        if (!['confirmed', 'cancelled'].includes(booking.status)
          || !['birthday_party', 'group_booking'].includes(booking.type)
          || typeof booking.reference !== 'string' || typeof booking.location?.name !== 'string'
          || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start
          || (!cancelled && (!booking.package || !Array.isArray(booking.addons)
            || !Object.hasOwn(paymentMethods, booking.payment?.method)
            || !paymentFields.every(field => Number.isSafeInteger(booking.payment[field]))))) {
          throw new Error('Unexpected booking fields');
        }
        renderBooking(panel, planning, hero, booking, start, end);
      } catch {
        const card = statusMessage(panel, 'We couldn’t load your booking right now. Please try again.');
        const actions = node('div', 'kbd-actions');
        const retry = node('button', 'kbd-action kbd-primary', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', load, { once: true });
        actions.append(retry, emailLink());
        card.append(actions);
      } finally {
        panel.removeAttribute('aria-busy');
      }
    }

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
