/*
 * koko-booking-presence.js — tells Xano "the customer is still on the booking
 * page", so the unpaid-booking reminder emails (RunReminders) wait until they
 * have actually left instead of firing at a fixed 15 min after the hold was
 * created.
 *
 * Load on /booking/birthday-party and /booking/group, after the flow script:
 *   <script src="https://cdn.jsdelivr.net/gh/MarketingMorefun/koko-booking@<commit>/koko-booking-presence.js" defer></script>
 *
 * How it works: once the flow script has created a booking (window.bookingState
 * .booking or window.groupBookingState.booking), it POSTs BookingHeartbeat
 * every 60 s while the tab is visible, and once more when the customer hides
 * or closes the tab (or is redirected to Stripe). Xano stores that as
 * last_active_at; RunReminders sends reminder 1 once it's 15+ min old.
 * It reads the booking fresh on every tick, so re-doing the booking (which
 * creates a new hold) automatically switches to the newest one.
 * Safe to omit: without it, reminders fall back to the old created_at timing.
 */
(function () {
  "use strict";
  if (window.__kokoPresence) return;
  window.__kokoPresence = true;

  var URL = "https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ/BookingHeartbeat";
  var EVERY_MS = 60000;

  function current() {
    var states = [window.bookingState, window.groupBookingState];
    for (var i = 0; i < states.length; i++) {
      var s = states[i];
      var b = s && s.booking;
      if (!b) continue;
      var id = b.booking_id || b.id || (b.booking && b.booking.id) || null;
      var email = b.customer_email || (s && s.customer_email) || "";
      if (id && email) return { id: String(id), email: String(email) };
    }
    return null;
  }

  // Form-encoded body: a CORS "simple" request, so sendBeacon can deliver it
  // while the page is unloading (a JSON body would need a preflight).
  function body(c) {
    return new URLSearchParams({ booking_id: c.id, email: c.email });
  }

  function ping() {
    var c = current();
    if (!c) return;
    try {
      fetch(URL, { method: "POST", body: body(c), keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function leaving() {
    var c = current();
    if (!c) return;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(URL, body(c))) return;
    } catch (_) {}
    ping();
  }

  setInterval(function () {
    if (document.visibilityState === "visible") ping();
  }, EVERY_MS);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") leaving();
    else ping();
  });
  window.addEventListener("pagehide", leaving);
})();
