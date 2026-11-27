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
  const ticketDate = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: sydney
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
      transport: 'Walk from Hurstville Station or use a bus stop near Westfield.'
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
    ['free_play_minutes', 'Arcade play', ' min', 'Red & yellow readers'],
    ['party_room_minutes', 'Party room', ' min'],
    ['claw_games', 'Claw & prize games', '', 'Per guest'],
    ['feature_games', 'Feature games', '', 'Per guest'],
    ['preloaded_tickets', 'KOKO tickets', '', 'Per guest'],
    ['celebrant_bonus_tickets', 'Bonus tickets', '', 'Birthday child']
  ];

  const bookingQuestions = [
    ['Do I need to email KOKO if my guest numbers change?',
      'No email needed. We’ll count how many guests are playing when you check in. If fewer than 10 play, your booking can still go ahead and you’ll be charged for 10. For 10 or more, you’ll pay for the number who play. Your venue’s capacity still applies.'],
    ['Can I change my booking date or package?',
      'To change your date or package, email marketing@kokoamusement.com.au with your booking ID at least 24 hours before your visit. Changes are subject to availability.'],
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
    body {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
    }
    #party-planning.kp-guide { display: flow-root; flex: 1 0 auto; }
    body > .main-section.navbar { background-color: #fffdf9; }
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
    #koko-booking-details :is(h1, h2, h3, p, dl, dd, ul) { margin: 0; }
    #koko-booking-details :is(h1, h2, h3) { font-weight: 700; color: inherit; }
    #koko-booking-details h2 { font-size: clamp(1.5rem, 4vw, 2rem); line-height: 1.15; }
    #koko-booking-details h3 { font-size: 1.13rem; line-height: 1.3; }
    #koko-booking-details a { color: inherit; text-underline-offset: .18em; }
    #koko-booking-details :focus-visible { outline: 2px solid #805016; outline-offset: 3px; }
    #koko-booking-details [hidden] { display: none !important; }
    #koko-booking-details [id], #party-planning > #invitation {
      scroll-margin-top: calc(var(--kbd-navbar-bottom, 9rem) + 1rem);
    }

    #koko-booking-details .kbd-intro {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: .6rem 1rem; margin-bottom: .8rem;
    }
    #koko-booking-details .kbd-badges, #koko-booking-details .kbd-actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .65rem;
    }
    #koko-booking-details .kbd-badge {
      display: inline-flex; align-items: center; gap: .3rem; padding: .22rem .58rem; border-radius: 999px;
      background: var(--kbd-warm); font-size: .8125rem; font-weight: 650; overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-confirmed { background: #e8f5eb; color: #255f44; }
    #koko-booking-details .kbd-confirmed::before {
      content: ''; width: .42rem; height: .42rem; border-radius: 50%; background: currentColor;
    }
    #koko-booking-details .kbd-cancelled { background: #f8e7e2; color: #842e28; }

    #koko-booking-details .kbd-ticket {
      overflow: hidden; border: 2px solid var(--kbd-ink); border-radius: clamp(1.2rem, 3vw, 1.75rem);
      background: #fffdf5; box-shadow: 4px 5px 0 var(--kbd-ink);
    }
    #koko-booking-details .kbd-ticket-header {
      display: grid; grid-template: 'badges art' auto 'copy art' auto / minmax(0, 1fr) auto;
      align-items: center; align-content: center; gap: .3rem .8rem;
      min-height: clamp(9rem, 18vw, 13.25rem); padding: 1rem clamp(1rem, 4vw, 2.65rem);
      background: linear-gradient(112deg, #fff183, #ffdf42);
    }
    #koko-booking-details .kbd-ticket-copy { grid-area: copy; min-width: 0; position: relative; z-index: 1; }
    #koko-booking-details .kbd-ticket-copy h1 {
      margin: .38rem 0 .3rem; font-size: clamp(2.05rem, 6vw, 4.15rem);
      line-height: .99; letter-spacing: -.052em; font-weight: 800;
    }
    #koko-booking-details .kbd-ticket-header .kbd-kind { background: var(--kbd-ink); color: #fff8d0; }
    #koko-booking-details .kbd-ticket-header .kbd-badges { grid-area: badges; gap: .3rem; }
    #koko-booking-details .kbd-ticket-caption {
      display: flex; flex-wrap: wrap; align-items: center; gap: .15rem .7rem;
      overflow-wrap: anywhere; font-weight: 600;
    }
    #koko-booking-details .kbd-ticket-reference { font-size: .875rem; color: #594016; }
    #koko-booking-details .kbd-ticket-art {
      grid-area: art; position: relative; display: grid; place-items: center; isolation: isolate;
      width: clamp(5rem, 20vw, 12.6rem); aspect-ratio: 1; transform: rotate(5deg);
    }
    #koko-booking-details .kbd-ticket-art::before {
      content: ''; position: absolute; inset: 12%; z-index: -1; border-radius: 50%;
      background: #fff6b0; box-shadow: 0 0 0 .4rem #fff9cf55;
    }
    #koko-booking-details .kbd-ticket-group .kbd-ticket-art::before { background: #e3f5ff; }
    #koko-booking-details .kbd-ticket-art::after {
      content: ''; position: absolute; top: 9%; right: 4%; width: clamp(.8rem, 2.5vw, 1.35rem); aspect-ratio: 1;
      background: #a94a19;
      clip-path: polygon(50% 0, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0 50%, 36% 36%);
    }
    #koko-booking-details .kbd-ticket-art img { display: block; width: 79%; height: auto; }
    #koko-booking-details .kbd-ticket-facts {
      position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      border-top: 2px dashed #dbc57c; padding: .7rem .85rem .85rem; gap: .55rem;
    }
    #koko-booking-details .kbd-ticket-facts::before, #koko-booking-details .kbd-ticket-facts::after {
      content: ''; position: absolute; top: -.48rem; width: .85rem; height: .85rem;
      border-radius: 50%; background: white; border: 1px solid #dbc57c;
    }
    #koko-booking-details .kbd-ticket-facts::before { left: -.6rem; }
    #koko-booking-details .kbd-ticket-facts::after { right: -.6rem; }
    #koko-booking-details .kbd-ticket-fact {
      min-width: 0; padding: .5rem .65rem; border: 1px solid #efe4c5; border-radius: .85rem; background: white;
      overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-ticket-fact dt {
      color: var(--kbd-muted); font-size: .8125rem; font-weight: 600;
    }
    #koko-booking-details .kbd-ticket-fact-value {
      font-size: clamp(1.12rem, 3vw, 1.85rem); letter-spacing: -.035em; line-height: 1.1; font-weight: 800;
    }
    #koko-booking-details .kbd-ticket-time .kbd-ticket-fact-value,
    #koko-booking-details .kbd-ticket-money .kbd-ticket-fact-value { font-size: clamp(1.4rem, 4vw, 2.2rem); }
    #koko-booking-details .kbd-ticket-fact-note { margin-top: .24rem; color: #59462f; font-size: .8125rem; line-height: 1.35; }
    #koko-booking-details .kbd-ticket-money {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
      grid-column: 1 / -1; column-gap: .55rem; background: #fff0be; border-color: #f1da93;
    }
    #koko-booking-details .kbd-ticket-money dt { grid-column: 1; grid-row: 1; }
    #koko-booking-details .kbd-ticket-money .kbd-ticket-fact-note { grid-column: 1; grid-row: 2; }
    #koko-booking-details .kbd-ticket-money .kbd-ticket-fact-value { grid-column: 2; grid-row: 1 / 3; text-align: right; }

    #koko-booking-details :is(.kbd-shortcuts, .kbd-shortcut-links, .kbd-calendar-links) {
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem;
    }
    #koko-booking-details .kbd-shortcuts { justify-content: space-between; gap: .75rem 1rem; margin: 1rem 0 1.15rem; }
    #koko-booking-details .kbd-action {
      min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
      padding: .4rem .72rem; border: 1px solid #b7a58e; border-radius: .7rem; background: white; color: inherit;
      font: inherit; font-size: .875rem; font-weight: 650; line-height: 1.3;
      text-align: center; text-decoration: none; cursor: pointer;
    }
    #koko-booking-details .kbd-action:hover { border-color: var(--kbd-ink); }
    #koko-booking-details .kbd-primary {
      background: var(--kbd-yellow); border: 2px solid var(--kbd-ink); box-shadow: 3px 3px var(--kbd-ink);
    }
    #koko-booking-details .kbd-calendar {
      display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .65rem; min-width: 0;
      padding: .35rem .45rem .35rem .7rem; border: 1px solid #e3cf93; border-radius: .8rem; background: #fff6d7;
    }
    #koko-booking-details .kbd-calendar-label { font-size: .8125rem; font-weight: 700; }

    #koko-booking-details .kbd-grid, #koko-booking-details .kbd-side { display: grid; gap: .8rem; align-content: start; }
    #koko-booking-details .kbd-card {
      min-width: 0; padding: clamp(.95rem, 2vw, 1.35rem); border: 1px solid var(--kbd-border);
      border-radius: 1rem; background: var(--kbd-cream); overflow-wrap: anywhere;
    }
    #koko-booking-details .kbd-card > :is(h2,h3) { margin-bottom: .45rem; }
    #koko-booking-details .kbd-card h2 { font-size: clamp(1.15rem, 2.5vw, 1.4rem); }
    #koko-booking-details .kbd-card .kbd-actions { margin-top: .65rem; }
    #koko-booking-details .kbd-package-head {
      display: flex; flex-wrap: wrap; gap: .45rem 1rem; justify-content: space-between; align-items: center;
    }
    #koko-booking-details .kbd-package-title { min-width: 0; }
    #koko-booking-details .kbd-package-title h2 { font-size: clamp(1.22rem, 3vw, 1.65rem); line-height: 1.17; }
    #koko-booking-details .kbd-features {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem;
      margin: .65rem 0 0; padding: 0; list-style: none;
    }
    #koko-booking-details .kbd-feature {
      min-width: 0; padding: .55rem .6rem; border-radius: .7rem; background: #f6f0e6;
      font-size: .8125rem; line-height: 1.3;
    }
    #koko-booking-details .kbd-feature:first-child { background: #fff0b3; }
    #koko-booking-details .kbd-feature strong { display: block; font-size: 1.2rem; line-height: 1.25; }
    #koko-booking-details .kbd-feature small { display: block; margin-top: .12rem; color: var(--kbd-muted); font-size: .75rem; }
    #koko-booking-details .kbd-payment { background: #fff9e8; }
    #koko-booking-details .kbd-payment-sub { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .65rem; }
    #koko-booking-details .kbd-fields { display: grid; gap: .45rem; }
    #koko-booking-details .kbd-fields dt { font-size: .8125rem; color: var(--kbd-muted); }
    #koko-booking-details .kbd-fields dd { font-weight: 600; }
    #koko-booking-details .kbd-ledger { font-size: .875rem; }
    #koko-booking-details .kbd-ledger div { display: flex; justify-content: space-between; gap: .75rem; padding: .26rem 0; }
    #koko-booking-details .kbd-ledger dd { font-weight: 650; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    #koko-booking-details .kbd-balance { border-top: 1px solid var(--kbd-border); font-weight: 750; }
    #koko-booking-details .kbd-muted { color: var(--kbd-muted); font-size: .875rem; }
    #koko-booking-details .kbd-visit-note { font-weight: 600; }
    #koko-booking-details .kbd-reveal { margin-top: .55rem; border-top: 1px solid var(--kbd-border); }
    #koko-booking-details .kbd-reveal summary {
      display: flex; justify-content: space-between; align-items: center; gap: .55rem;
      min-height: 44px; padding: .35rem 0; font-size: .875rem; font-weight: 650; cursor: pointer;
    }
    #koko-booking-details .kbd-reveal-body { display: grid; gap: .45rem; padding: .1rem 0 .65rem; }
    #koko-booking-details summary { list-style: none; }
    #koko-booking-details summary::-webkit-details-marker { display: none; }
    #koko-booking-details .kbd-toggle { flex: 0 0 .875rem; position: relative; width: .875rem; height: .875rem; color: #7b6a58; }
    #koko-booking-details .kbd-toggle::before, #koko-booking-details .kbd-toggle::after {
      content: ''; position: absolute; top: 50%; left: 50%; width: .875rem; height: 2px;
      background: currentColor; transform: translate(-50%, -50%);
    }
    #koko-booking-details .kbd-toggle::after { transform: translate(-50%, -50%) rotate(90deg); }
    #koko-booking-details details[open] > summary .kbd-toggle::after { display: none; }

    #koko-booking-details .kbd-questions {
      width: min(100%, 52rem); margin: clamp(1.7rem, 4vw, 2.5rem) auto 0; padding-right: 5px;
    }
    #koko-booking-details .kbd-questions-heading {
      display: flex; justify-content: space-between; align-items: center; gap: .6rem; margin-bottom: .55rem;
    }
    #koko-booking-details .kbd-qa-highlight {
      background: linear-gradient(transparent 76%, var(--kbd-yellow) 76%, var(--kbd-yellow) 96%, transparent 96%);
      box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    #koko-booking-details .kbd-qa-mascot {
      position: relative; display: grid; place-items: center; flex: 0 0 auto;
      width: clamp(4.3rem, 10vw, 5.75rem); aspect-ratio: 1;
      background: radial-gradient(circle, #fff083 0 52%, #fff7d2 53% 66%, transparent 67%);
    }
    #koko-booking-details .kbd-qa-mascot img {
      display: block; width: 67%; height: auto; max-height: 100%; object-fit: contain;
    }
    #koko-booking-details .kbd-search {
      position: relative; display: block; margin: .6rem 0 1.25rem;
    }
    #koko-booking-details .kbd-search input {
      display: block; width: 100%; min-height: 48px; padding: .6rem 1rem .6rem 2.75rem;
      border: 1.5px solid #a2917c; border-radius: .85rem; background: white; color: var(--kbd-ink); font: inherit;
    }
    #koko-booking-details .kbd-search::before, #koko-booking-details .kbd-search::after {
      content: ''; position: absolute; pointer-events: none; color: var(--kbd-muted);
    }
    #koko-booking-details .kbd-search::before {
      top: calc(50% - 8px); left: 1rem; width: 13px; height: 13px; border: 2px solid; border-radius: 50%;
    }
    #koko-booking-details .kbd-search::after {
      top: calc(50% + 5px); left: calc(1rem + 10px); width: 7px; height: 2px; background: currentColor; transform: rotate(45deg);
    }
    #koko-booking-details .kbd-search-status {
      position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
    }
    #koko-booking-details .kbd-faq { display: grid; gap: clamp(1rem, 2.4vw, 1.5rem); }
    #koko-booking-details .kbd-pager {
      display: flex; flex-wrap: wrap; justify-content: center; gap: .85rem; margin-top: 1.5rem;
    }
    #koko-booking-details .kbd-pager button {
      display: inline-flex; align-items: center; justify-content: center; gap: .6rem; min-height: 44px;
      padding: .5rem 1.25rem; border: 1.5px solid var(--kbd-ink); border-radius: .8rem; background: white;
      color: var(--kbd-ink); font: inherit; font-weight: 650; box-shadow: 2px 3px 0 var(--kbd-ink); cursor: pointer;
    }
    #koko-booking-details .kbd-pager button:hover { background: #fff6d7; }
    #koko-booking-details .kbd-prev::before, #koko-booking-details .kbd-next::after {
      content: ''; width: .45rem; height: .45rem; border: solid currentColor; border-width: 1.5px 1.5px 0 0;
      transform: rotate(45deg);
    }
    #koko-booking-details .kbd-prev::before { transform: rotate(-135deg); }
    #koko-booking-details .kbd-question {
      background: white; border: 2px solid var(--kbd-ink); border-radius: 1.25rem;
      box-shadow: 4px 4px 0 var(--kbd-ink);
    }
    #koko-booking-details .kbd-question summary {
      display: grid; grid-template-columns: minmax(0, 1fr) .875rem; align-items: center;
      gap: .75rem; min-height: 4rem; padding: .8rem clamp(.9rem, 2vw, 1.25rem);
      scroll-margin-top: calc(var(--kbd-navbar-bottom, 9rem) + 1rem);
      cursor: pointer; font-size: .9375rem; line-height: 1.4; font-weight: 650;
    }
    #koko-booking-details .kbd-question summary:focus-visible { border-radius: 1.1rem; outline-offset: -5px; }
    #koko-booking-details .kbd-question-answer {
      padding: 0 clamp(.9rem, 2vw, 1.25rem) .95rem; color: var(--kbd-muted); font-size: .9375rem;
    }
    #koko-booking-details .kbd-questions > .kbd-actions { margin-top: 1.25rem; }

    @media (max-width: 34.99rem) {
      #koko-booking-details .kbd-ticket-header { grid-template-areas: 'badges badges' 'copy art'; gap: .15rem .45rem; }
      #koko-booking-details .kbd-ticket-copy h1 { font-size: clamp(1.65rem, 7.7vw, 2.4rem); }
      #koko-booking-details .kbd-ticket-art { width: clamp(5.75rem, 22vw, 8rem); }
      #koko-booking-details .kbd-ticket-art img { width: 88%; }
      #koko-booking-details .kbd-calendar { display: grid; width: 100%; padding: .55rem; }
      #koko-booking-details .kbd-calendar-links {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch;
      }
      #koko-booking-details .kbd-calendar-links .kbd-action { padding-inline: .35rem; font-size: .8125rem; }
    }
    @media (min-width: 35rem) {
      #koko-booking-details .kbd-features { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (min-width: 50rem) {
      #koko-booking-details .kbd-ticket-facts {
        grid-template-columns: 1fr 1.25fr .95fr; padding: .9rem 1rem 1rem; gap: .8rem;
      }
      #koko-booking-details .kbd-ticket-fact { padding: .65rem .8rem; }
      #koko-booking-details .kbd-ticket-money { display: block; grid-column: auto; }
      #koko-booking-details .kbd-ticket-money .kbd-ticket-fact-value { text-align: start; }
      #koko-booking-details .kbd-grid { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
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

  function toggleSummary(label, className) {
    const summary = node('summary', className, label);
    const icon = node('span', 'kbd-toggle');
    icon.setAttribute('aria-hidden', 'true');
    summary.append(icon);
    return summary;
  }

  function disclosure(title, ...items) {
    const details = node('details', 'kbd-reveal');
    const body = node('div', 'kbd-reveal-body');
    body.append(...items);
    details.append(toggleSummary(title), body);
    return details;
  }

  function faqCard([question, answer]) {
    const item = node('details', 'kbd-question');
    item.append(toggleSummary(question), node('p', 'kbd-question-answer', answer));
    return item;
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

  function ticketFact(kind, title, value, note) {
    const fact = node('div', 'kbd-ticket-fact ' + kind);
    fact.append(node('dt', '', title), node('dd', 'kbd-ticket-fact-value', value));
    if (note) fact.append(node('dd', 'kbd-ticket-fact-note', note));
    return fact;
  }

  function showTicket(booking, start, venue, isBirthday) {
    const ticket = node('header', 'kbd-ticket' + (isBirthday ? '' : ' kbd-ticket-group'));
    const header = node('div', 'kbd-ticket-header');
    const copy = node('div', 'kbd-ticket-copy');
    const badges = node('div', 'kbd-badges');
    badges.append(node('span', 'kbd-badge kbd-kind', isBirthday ? 'Birthday party' : 'Group visit'),
      node('span', 'kbd-badge kbd-confirmed', 'Confirmed'));
    const title = node('h1', '', 'My booking');
    title.id = 'koko-booking-details-title';
    const caption = node('p', 'kbd-ticket-caption');
    if (booking.greeting_name) caption.append(node('span', '', 'Hi ' + booking.greeting_name + '!'));
    caption.append(node('span', 'kbd-ticket-reference', 'Booking #' + booking.reference));
    copy.append(title, caption);
    const art = node('span', 'kbd-ticket-art');
    art.append(isBirthday ? george('cake', 178, 200) : george('wave', 387, 400));
    header.append(badges, copy, art);

    const localDate = ticketDate.format(start).replace(',', '');
    const venueNote = venue?.floor && !booking.location.name.toLowerCase().includes(venue.floor.toLowerCase())
      ? venue.floor : booking.room || booking.location.address;
    const payment = booking.payment;
    const paymentFact = payment.method === 'full'
      ? ticketFact('kbd-ticket-money', 'Payment', 'Paid in full', 'Nothing due at the venue')
      : ticketFact('kbd-ticket-money', payment.method === 'invoice' ? 'Invoice balance' : 'Balance due',
        money(payment.balance_cents), payment.method === 'invoice' ? 'See invoice for terms'
          : payment.balance_cents > 0 ? 'Pay at the venue on the day' : 'Nothing due at the venue');
    const facts = node('dl', 'kbd-ticket-facts');
    facts.append(ticketFact('kbd-ticket-time', isBirthday ? 'Party starts' : 'Session starts', time.format(start), localDate + ' · Sydney time'),
      ticketFact('kbd-ticket-place', 'Venue', booking.location.name, venueNote), paymentFact);
    ticket.append(header, facts);
    return ticket;
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
    const apple = link('Apple Calendar', URL.createObjectURL(blob), 'kbd-action');
    apple.download = 'KOKO-booking.ics';
    return [google, apple];
  }

  function showPayment(payment) {
    const section = node('section', 'kbd-card kbd-payment');
    const [label, note] = paymentMethods[payment.method];
    section.append(node('h2', '', 'Payment'));
    const summary = node('p', 'kbd-payment-sub');
    summary.append(node('span', 'kbd-badge', label));
    if (payment.discount_cents > 0) {
      summary.append(node('span', 'kbd-muted', money(payment.discount_cents) + ' discount applied'));
    }
    section.append(summary);
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
    const details = disclosure('Payment breakdown', node('p', 'kbd-muted', note), rows('kbd-ledger', paymentRows));
    if (payment.method !== 'invoice' && payment.fee_cents > 0) {
      details.lastElementChild.append(node('p', 'kbd-muted', 'The booking fee is non-refundable.'));
    }
    section.append(details);
    return section;
  }

  function showShortcuts(booking, start, end, name, isBirthday) {
    const actions = node('nav', 'kbd-shortcuts');
    actions.setAttribute('aria-label', 'Booking shortcuts');
    const shortcuts = node('div', 'kbd-shortcut-links');
    const place = [name, booking.location.address].filter(Boolean).join(', ');
    const maps = new URLSearchParams({ api: '1', destination: place });
    shortcuts.append(link('Get directions', 'https://www.google.com/maps/dir/?' + maps,
      'kbd-action kbd-primary', true));
    if (isBirthday) shortcuts.append(link('Make invitation', '#invitation', 'kbd-action'));
    shortcuts.append(link('FAQs', '#kbd-visit-faqs', 'kbd-action'));

    const calendar = node('div', 'kbd-calendar');
    const label = node('p', 'kbd-calendar-label', 'Add to calendar');
    label.id = 'kbd-calendar-label';
    calendar.setAttribute('role', 'group');
    calendar.setAttribute('aria-labelledby', label.id);
    const calendars = node('div', 'kbd-calendar-links');
    calendars.append(...calendarLinks(booking, start, end, place, isBirthday));
    calendar.append(label, calendars);
    actions.append(shortcuts, calendar);
    return actions;
  }

  function showPackage(booking) {
    const section = node('section', 'kbd-card');
    const header = node('header', 'kbd-package-head');
    const title = node('div', 'kbd-package-title');
    title.append(node('p', 'kbd-muted', 'Your package'), node('h2', '', booking.package.name));
    const guests = count.format(booking.guests) + (booking.guests === 1 ? ' guest' : ' guests');
    header.append(title, node('span', 'kbd-badge', guests));
    section.append(header);
    const features = node('ul', 'kbd-features');
    for (const [key, label, unit, note] of packageFeatures) {
      if (!(booking.package[key] > 0)) continue;
      const feature = node('li', 'kbd-feature');
      feature.append(node('strong', '', count.format(booking.package[key]) + unit), node('span', '', label));
      if (note) feature.append(node('small', '', note));
      features.append(feature);
    }
    if (features.childElementCount) section.append(features);
    if (booking.addons.length) {
      const addons = booking.addons.map(addon => [
        count.format(addon.qty) + ' × ' + addon.name + (addon.option_label ? ' · ' + addon.option_label : ''),
        money(addon.line_total_cents)
      ]);
      section.append(disclosure('Add-ons · ' + money(booking.payment.addons_cents), rows('kbd-ledger', addons)));
    }
    return section;
  }

  function showTravel(booking, start, end, venue, name, isBirthday) {
    const section = node('section', 'kbd-card');
    const arrival = isBirthday ? 'Check in up to 10 minutes early.' : 'Check in together at the venue counter.';
    section.append(node('h2', '', 'Getting here'), node('p', 'kbd-visit-note', arrival));
    const details = [rows('kbd-fields', [
      [isBirthday ? 'Party room time (Sydney)' : 'Session time (Sydney)', displayTime(start, end)],
      ['Venue', name], ['Address', booking.location.address], ['Party room', isBirthday ? booking.room : null]
    ])];
    if (venue) {
      details.push(node('p', 'kbd-muted', venue.arrival), rows('kbd-fields', [
        ['Public transport', venue.transport], ['Parking', venue.parking]
      ]), link('Venue guide', '/locations/' + venue.slug, 'kbd-muted'));
    }
    section.append(disclosure(venue?.parking ? 'Address, times & parking' : 'Address & times', ...details));
    const contact = venueContact(booking.location, venue);
    if (contact) {
      const actions = node('div', 'kbd-actions');
      actions.append(contact);
      section.append(actions);
    }
    return section;
  }

  function showFAQs(booking, isBirthday) {
    const section = node('section', 'kbd-questions');
    section.id = 'kbd-visit-faqs';
    const header = node('header', 'kbd-questions-heading');
    const heading = node('h2', '', 'Frequently asked ');
    heading.append(node('span', 'kbd-qa-highlight', 'questions'));
    const mascot = node('span', 'kbd-qa-mascot');
    mascot.append(george('tablet', 171, 240));
    header.append(heading, mascot);
    section.append(header);
    const questions = [
      ['When is my payment due?', paymentMethods[booking.payment.method][1]],
      ...bookingQuestions, ...(isBirthday ? birthdayQuestions : groupQuestions), ...gameQuestions
    ];
    const searchWrap = node('div', 'kbd-search');
    const search = node('input');
    search.type = 'search';
    search.placeholder = 'Search questions';
    search.setAttribute('aria-label', 'Search booking questions');
    searchWrap.append(search);

    const results = node('div', 'kbd-faq');
    const status = node('p');
    status.setAttribute('role', 'status');
    const pager = node('nav', 'kbd-pager');
    pager.setAttribute('aria-label', 'FAQ pages');
    const previous = node('button', 'kbd-prev', 'Previous');
    const next = node('button', 'kbd-next', 'Next');
    previous.type = next.type = 'button';
    pager.append(previous, next);
    section.append(searchWrap, status, results, pager);

    const pageSize = 4;
    let page = 0;
    const normalize = text => text.toLowerCase().replace(/['’]/g, '');
    function renderPage() {
      const words = normalize(search.value).trim().split(/\s+/).filter(Boolean);
      const matches = questions.filter(pair => {
        const text = normalize(pair.join(' '));
        return words.every(word => text.includes(word));
      });
      const pages = Math.ceil(matches.length / pageSize);
      const start = page * pageSize;
      results.replaceChildren(...matches.slice(start, start + pageSize).map(faqCard));
      previous.hidden = page === 0;
      next.hidden = page + 1 >= pages;
      pager.hidden = pages <= 1;
      status.className = pages ? 'kbd-search-status' : 'kbd-muted';
      status.textContent = pages
        ? matches.length + ' matching ' + (matches.length === 1 ? 'question' : 'questions') + '. Page ' + (page + 1) + ' of ' + pages + '.'
        : 'No questions found. Try a different search.';
    }
    function turnPage(step) {
      page += step;
      renderPage();
      const first = results.querySelector('summary');
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'nearest' });
    }
    search.addEventListener('input', () => { page = 0; renderPage(); });
    previous.addEventListener('click', () => turnPage(-1));
    next.addEventListener('click', () => turnPage(1));
    renderPage();
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

  function watchNavbar(planning, panel) {
    const navbar = document.querySelector('body > .navbar');
    if (!navbar) return;
    // The promotional strip is absolutely positioned in a Webflow embed below the fixed navbar.
    const headerParts = [navbar, ...navbar.querySelectorAll(':scope > .w-embed')];
    function alignPanel() {
      const bottom = getComputedStyle(navbar).position === 'fixed'
        ? Math.ceil(Math.max(...headerParts.map(part => part.getBoundingClientRect().bottom)))
        : 0;
      const panelTop = panel.getBoundingClientRect().top + window.scrollY;
      const gap = parseFloat(getComputedStyle(panel).marginTop);
      planning.style.setProperty('--kbd-navbar-bottom', bottom + 'px');
      panel.style.paddingTop = Math.max(0, bottom + gap - panelTop) + 'px';
    }
    const observer = new ResizeObserver(alignPanel);
    for (const part of headerParts) observer.observe(part);
    alignPanel();
    return alignPanel;
  }

  function updatePlanning(planning, hero, panel, isBirthday, cancelled) {
    if (cancelled) {
      for (const section of planning.children) {
        if (section !== panel && section.matches('section')) hide(section);
      }
      return;
    }
    hide(hero);
    hide(document.getElementById('planning-venues'));
    if (isBirthday) return;

    hide(document.getElementById('party-checklist'));
    hide(document.getElementById('invitation'));
    for (const section of planning.children) {
      if (section.id || section === hero || !section.matches('section')) continue;
      const title = section.querySelector('h2')?.textContent.trim().toLowerCase();
      if (title === 'know your party timings' || title === 'need a hand with your party?') hide(section);
    }
  }

  function renderBooking(panel, planning, hero, booking, start, end) {
    const isBirthday = booking.type === 'birthday_party';
    const cancelled = booking.status === 'cancelled';
    const venue = venues[booking.location.id];
    const name = venueName(booking.location, venue);
    if (cancelled) {
      heading(panel, booking);
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
      const grid = node('div', 'kbd-grid');
      const side = node('div', 'kbd-side');
      side.append(showPayment(booking.payment), showTravel(booking, start, end, venue, name, isBirthday));
      grid.append(showPackage(booking), side);
      panel.replaceChildren(showTicket(booking, start, venue, isBirthday),
        showShortcuts(booking, start, end, name, isBirthday), grid, showFAQs(booking, isBirthday));
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
    const alignPanel = watchNavbar(planning, panel);
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
        alignPanel?.();
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
