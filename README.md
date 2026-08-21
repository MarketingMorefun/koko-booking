# koko-booking

Source-of-truth archive for KOKO Amusement's booking system. Nothing here runs on
its own — every file is either pasted into **Xano** (backend), a Google **Apps
Script** project, or a Webflow **page's custom code**, by hand. This repo exists so
changes are versioned and reviewable before they're pasted in.

## Architecture

```
Webflow pages (custom code / HTML embeds)
        │  fetch()
        ▼
Xano backend  https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ
        │  Stripe Checkout redirect            │  Resend (transactional email)
        ▼                                       ▼
     Stripe                                  customer inbox
        │  webhook
        ▼
   StripeWebhook (Xano)

Google Sheet "Booking Master"  ◄── Apps Script (SyncBookings.gs, hourly trigger)
        │
        ▼
   Google Calendar (per-venue) + [NEW BOOKING] staff email

GitHub Actions (.github/workflows/reminders.yml, hourly cron)
        └─► POST /RunReminders   (Xano has no Background Tasks on the free plan)
```

- **Backend:** Xano, `api_group = "KOKO Booking"`. Files below are either **queries**
  (HTTP endpoints, `verb=POST/GET`) or **functions** (`function expire_stale_holds`,
  only callable from another Xano query via `function.run`, no URL of its own).
- **Payment:** Stripe Checkout. `ConfirmBooking`/`ConfirmGroupBooking` create the
  session and return `payment_url`; `StripeWebhook` reacts to the result.
- **Email:** Resend (`api.resend.com`), sender `booking@mail.morefun.com.au`
  (DNS-verified domain — sending from anything else silently 403s).
- **CDN:** frontend `.js` is hosted via jsDelivr from this repo
  (`cdn.jsdelivr.net/gh/MarketingMorefun/koko-booking@<commit>/...`) — always
  reference a commit hash, not `@main`, or the CDN serves a stale cached copy.
- **Money:** always cents (`int ..._cents`). Deposit is `$50.00` (`5000`), card
  surcharge `$1.50` (`150`), referral/repeat-customer discount `$30.00` (`3000`).

⚠️ Every file with a Resend/API key placeholder (`re_YOUR_RESEND_API_KEY`) needs the
**real** key swapped in by hand after pasting into Xano — the real key is never
committed here (GitHub's push protection blocks it, and it'd be a public leak anyway).

---

## Xano — API endpoints (queries)

| File | Endpoint | Purpose |
|---|---|---|
| `CreateBooking.txt` | `POST /CreateBooking` | Creates a birthday-party `hold`: validates location/room/slot/package/addons, applies a repeat-customer or referral `$30` discount if one applies (reserving the credit to `pending`), returns the booking. |
| `CreateGroupBooking.txt` | `POST /CreateGroupBooking` | Same as above for group bookings (no `party_room_id`/room-capacity checks; per-person pricing). |
| `ConfirmBooking.txt` | `POST /ConfirmBooking` | Turns a `hold`/`pending_payment` birthday booking into a Stripe Checkout Session and returns `payment_url`. Re-checks the room/slot is still free if the 15-min hold has technically lapsed, instead of hard-rejecting. Always mints a fresh Stripe session (never reuses a stored `payment_url`, which could be stale/expired). |
| `ConfirmGroupBooking.txt` | `POST /ConfirmGroupBooking` | Same for group bookings (no slot re-check — group bookings don't hold an exclusive room the way birthday bookings do). |
| `StripeWebhook.txt` | `POST /StripeWebhook` | Stripe webhook target. On `checkout.session.completed`/`async_payment_succeeded`: marks the booking `deposit_paid`, mints its `referral_code`, finalises any reserved discount credit (marks it `used`, or awards the referrer a new credit), awards the paying customer a fresh `$30` credit for next time, and sends the deposit-confirmation email (invitation download block + referral card block included). On `checkout.session.expired`: marks the booking `expired` unless it's already paid. |
| `ResendConfirmationEmail.txt` | `POST /ResendConfirmationEmail` | Manually re-sends the exact same confirmation email as `StripeWebhook` (staff-triggered, e.g. customer says they never got it) — reads the booking's existing `referral_code` rather than minting a new one. |
| `RunReminders.txt` | `POST /RunReminders` (secret-protected) | Abandoned-cart recovery: emails bookings still `hold`/`pending_payment` at 1h (`reminder_1`) and 20h (`reminder_2`) old, linking to `/booking/resume`. Triggered hourly by GitHub Actions (Xano free plan has no Background Tasks). Only marks a reminder "sent" if Resend actually accepted it. |
| `GetReferralCard.txt` | `GET /GetReferralCard?code=` | Public, read-only lookup by `referral_code` only (no booking ID, no email/phone) — backs the printable referral card page. A stranger can't browse other customers' data without already having their code. |
| `BackfillReferralCodesAndCredits.txt` | `POST /BackfillReferralCodesAndCredits` (secret-protected) | One-time, batched backfill: mints a `referral_code` + `$30` credit for every historical `deposit_paid`/`paid` booking that predates the referral feature, then emails each customer once (deduped per email, batched to respect Resend rate limits). Safe to call repeatedly — already-processed bookings are skipped. |

## Xano — functions

| File | Purpose |
|---|---|
| `expire_stale_holds.txt` | Called via `function.run` from `CreateBooking`/`CreateGroupBooking`. Sweeps `hold`/`pending_payment` bookings older than 24h to `expired` (must stay 24h — the reminder emails at 1h/20h rely on the booking still reading `hold`/`pending_payment` that whole window). Releases any credit that booking had reserved back to `available` so it isn't stranded. |

## Google Apps Script

Bound to the "Booking Master" Google Sheet.

| File | Purpose |
|---|---|
| `SyncBookings.gs` | Hourly trigger: pulls every booking from `BookingSheetExport`, rewrites the "Booking Master" sheet, upserts a Google Calendar event per `deposit_paid` booking (per-venue calendar, deleted if the booking un-pays), sends the `[NEW BOOKING]` staff notification email the first time a booking's calendar event is created (tracked via its own `new_booking_email_sent` column, independent of calendar success so a failed send retries), and syncs `referral_code`/`discount_aud`/`discount_reason` into the sheet. Also exposes `backfillMissingNewBookingEmails()` — a manual, non-triggered function to catch up `[NEW BOOKING]` emails for bookings that were skipped when that column was first added. |
| `SyncMailchimp.gs` | Syncs a separate "Form responses" sheet into Mailchimp, splitting contacts into per-store sheets/audiences by a "store name" column. Unrelated to the booking flow above. |

## Webflow — booking flow widgets (main multi-step forms)

| File | Page | Purpose |
|---|---|---|
| `koko-booking.js` | `/booking/birthday-party` | Full birthday-party booking flow: location → check availability → package → addons → contact (incl. optional `referralCode` field) → review (shows a discount banner if one applies) → pay. Progressively enhances existing page markup by element ID (with fallbacks), so it survives most CMS edits. State in `window.bookingState`. |
| `koko-group-booking.js` | `/booking/group` | Same shape for group bookings (`groupReferralCode` field, guest-count stepper, add-on quantity/rules). State in `window.groupBookingState`. |
| `koko-group-scroll.js` | `/booking/group` | Purely cosmetic: smooth-scrolls to the next section as the group flow advances. Safe to omit. |
| `koko-booking-embed.min.txt` | — | ⚠️ Older, minified, birthday-only booking snippet (calls `CreateBooking` but not the current `referralCode` field or the group flow) — looks superseded by `koko-booking.js`. Kept here for reference; confirm before treating as live. |

### Pricing constants (defined independently in both flow scripts — keep in sync)

```js
DEPOSIT_CENTS      = 5000   // $50.00 refundable deposit
SURCHARGE_CENTS    = 150    // $1.50 card surcharge
PAYABLE_NOW_CENTS  = 5150   // $51.50 charged now (deposit + surcharge)
MIN_ADVANCE_MS     = 259_200_000   // must book ≥ 72h ahead
```

## Webflow — standalone pages

| File | Page | Purpose |
|---|---|---|
| `koko-booking-resume-page.html` | `/booking/resume?booking_id=&type=party\|group` | Abandoned-cart recovery landing page — calls `ConfirmBooking`/`ConfirmGroupBooking` to mint a fresh Stripe link and redirects, or shows a friendly error (e.g. slot taken). Linked from `RunReminders`' emails. |
| `koko-booking-success-page.html` | `/booking/booking-success` | Post-payment confirmation page. |
| `koko-booking-cancel-page.html` | `/booking/booking-cancelled` | Shown if the customer backs out of Stripe Checkout. |
| `koko-referral-card-page.html` | `/booking/referral-card?code=` | Printable/emailable referral code card — fetches `GetReferralCard`, renders a branded card, "Print this card" button. Prints from a dedicated root appended straight to `<body>` (the page's real `#referralCardRoot` is nested inside Webflow's own wrappers, so a naive `body>*{display:none}` print rule hides one of *its* ancestors too). |
| `koko-parties-quick-booking.html` | `/parties` | Quick-book widget (tab between Birthday/Group, pick location+date+guests, "Check availability" redirects into the full flow with `?auto_check=1`). Points directly at the birthday flow's current slug (`/booking/birthday-party`) — if that page's slug ever changes again, update `BOOKING_URLS.birthday` here rather than relying on Webflow's redirect, which drops query params. |
| `koko-homepage-quick-booking.html` | Home | Same quick-book widget, birthday-only, for the homepage hero. Same slug caveat as above (`TARGET_PAGE`). |

## Webflow — feature add-ons (paste *alongside* a flow script, don't replace it)

| File | Where | Purpose |
|---|---|---|
| `koko-invitation-download.html` | Birthday flow page | "Download the invitation" PNG/PDF buttons. |
| `koko-group-print-quote.html` | `/booking/group`, below `koko-group-booking.js` | "Save this quote as a PDF" button on the group review step. |
| `koko-location-select.js` | Any page with a `<select>` | Restyles native `<select>` elements as a custom dropdown (single or checkbox-multi if the select has `multiple`). |

---

## Element ID contract (both flow scripts)

Widgets look elements up by ID with fallbacks, so a CMS rename doesn't necessarily
break them. Single flow: `locationSlug`/`location`, `bookingDate`/`date`,
`guestCount`/`guests`, `quickCheckAvailabilityBtn`, `availabilitySection`,
`selectPackage{Joy,Fun,Max}`, `packageSection`, `addonsSection`, `contactSection`,
`customerName`/`Phone`/`Email`, `referralCode`, `reviewSection`, `review*` fields,
`createBookingBtn`, `confirmBookingBtn` (typo alias `confitmBookingBtn` intentionally
also accepted). Group flow uses the `group*` equivalents, plus `groupReferralCode`.
Buttons can also be targeted with `data-koko-*` attributes; a missing required section
shows a visible message instead of failing silently.

## Gotchas

- **Publish is separate from Save** in both Xano and Webflow — a change that "doesn't
  seem to work" is very often just unpublished.
- **`hold_expires_at_ts` (15 min) ≠ "give up on this customer" (24h).** The 15-minute
  field only controls how long a booking exclusively blocks its exact room/slot from
  other customers during the conflict check in `CreateBooking`/`CreateGroupBooking`.
  `expire_stale_holds` uses `created_at` + 24h instead — conflating the two silently
  broke the reminder-email system once already.
- **A `$30` credit is reserved (`pending`), not consumed, until the booking that
  claimed it actually reaches `deposit_paid`.** This closes a real double-spend found
  via live testing (two concurrent holds from the same customer email both claiming
  the same credit) and means `expire_stale_holds` must release an abandoned booking's
  reserved credit back to `available`, or it'd be stranded forever.
- **Xano's `where=` clause can't apply filters (e.g. `|trim`, `|lower`) to a database
  column** — only to literal/variable values. Do that transform in memory instead
  (`array.filter`/`array.find` after a plain `db.query`).
- **`array.slice` is not a real Xano function** — batch a `foreach` with a manually
  incremented counter variable + `if (counter < limit)` instead.
- Changing the **`$1.50` surcharge / `$50` deposit / `$30` discount** means editing the
  constant in every file that has its own copy — they're not shared.
