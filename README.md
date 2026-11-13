# koko-booking

Source-of-truth archive for KOKO Amusement's booking system. Nothing here runs on
its own — every file is either pasted into **Xano** (backend), a Google **Apps
Script** project, or a Webflow **page's custom code**, by hand. This repo exists so
changes are versioned and reviewable before they're pasted in.

📘 **How it all fits together** — the booking lifecycle, every customer and store email, and how we ship changes — is in [WORKFLOW.md](WORKFLOW.md) (Chinese).

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

Apps Script (Reminders.gs, time-driven trigger every 5 min)
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

🔑 **API keys live in Xano, never in this repo** (it's public — jsDelivr needs that).
Resend: workspace variable `RESEND_API_KEY` (Settings → Workspace Variables), read as
`$env.RESEND_API_KEY` by every email-sending query. Stripe: `stripe_location_keys` table
(per location). Pasting any `.txt` here into Xano is safe — there's no placeholder to
swap back. To rotate the Resend key, change the workspace variable.
The same goes for the endpoint secrets: `RunReminders` checks `$env.REMINDER_SECRET`
(must equal the GitHub Actions secret `REMINDER_SECRET`), `BookingSheetExport` checks
`$env.SHEET_EXPORT_KEY` (must equal the Apps Script Script Property `XANO_EXPORT_KEY`),
`AdminBookings`/`AdminUpdateBooking` check `$env.ADMIN_KEY` (the key staff type into the admin page), and `BackfillReferralCodesAndCredits` checks `$env.BACKFILL_SECRET` (left unset on
purpose — the backfill is done, so it refuses every call). Any secret that was ever
committed here is public forever via git history: rotate it, don't just delete it.

**Syncing with Xano.** The `.txt` files are the exact XanoScript that's live. Claude can
read and write them directly through Xano's Metadata API (token in `~/.xano_token` on
the dev machine, never committed): `GET/PUT …/api:meta/workspace/143366/apigroup/355611/api/<id>?include_xanoscript=true`
with `Content-Type: text/x-xanoscript`; a PUT goes live immediately. Before changing an
endpoint, pull the live version first and patch that — someone may have edited it in
the Xano UI since the repo was last synced. Xano reformats on save (and prefers
`|to_lower` over `|lower`), so diff with whitespace ignored.

---

## Xano — API endpoints (queries)

| File | Endpoint | Purpose |
|---|---|---|
| `CreateBooking.txt` | `POST /CreateBooking` | Creates a birthday-party `hold`: validates location/room/slot/package/addons, applies a repeat-customer or referral `$30` discount if one applies (reserving the credit to `pending`), returns the booking. |
| `CreateGroupBooking.txt` | `POST /CreateGroupBooking` | Same as above for group bookings (no `party_room_id`/room-capacity checks; per-person pricing). |
| `ConfirmBooking.txt` | `POST /ConfirmBooking` | Turns a `hold`/`pending_payment` birthday booking into a Stripe Checkout Session and returns `payment_url`. Re-checks the room/slot is still free if the 15-min hold has technically lapsed, instead of hard-rejecting. Always mints a fresh Stripe session (never reuses a stored `payment_url`, which could be stale/expired). |
| `ConfirmGroupBooking.txt` | `POST /ConfirmGroupBooking` | Same for group bookings (no slot re-check — group bookings don't hold an exclusive room the way birthday bookings do). | Accepts `payment_option`: `"deposit"` (default, $50) or `"full"` (whole booking after discount, still + $1.50 booking fee); sent to Stripe as `metadata[payment_type]`, which `StripeWebhook` uses to record a full payment (balance 0, "Paid in Full" email).
| `StripeWebhook.txt` | `POST /StripeWebhook` | Stripe webhook target. On `checkout.session.completed`/`async_payment_succeeded`: marks the booking `deposit_paid`, mints its `referral_code`, finalises any reserved discount credit (marks it `used`, or awards the referrer a new credit), awards the paying customer a fresh `$30` credit for next time, and sends the deposit-confirmation email (invitation download block + referral card block included). Only records `confirmation_email_sent_at` if Resend accepted the email — on a failure it stays blank (admin page shows "Confirmation email: —") so staff know to resend. On `checkout.session.expired`: marks the booking `expired` unless it's already paid. |
| `ResendConfirmationEmail.txt` | `POST /ResendConfirmationEmail` | Manually re-sends the exact same confirmation email as `StripeWebhook` (staff-triggered, e.g. customer says they never got it) — reads the booking's existing `referral_code` rather than minting a new one. If Resend rejects it, returns `error_message` (shown to staff as "Didn't send") and leaves `confirmation_email_sent_at` unchanged. |
| `RunReminders.txt` | `POST /RunReminders` (secret-protected) | Abandoned-cart recovery: emails bookings still `hold`/`pending_payment` at 15 min (`reminder_1`) and 20h (`reminder_2`) old, linking to `/booking/resume`. Waits until the customer has **left the booking page** for 15 min (`last_active_at`, set by `BookingHeartbeat`; null = fall back to `created_at`). **Skips a hold for good when the same email (case-insensitive) has made a newer booking since** — re-doing the booking (every Review click creates a fresh hold) or paying for another one — and records why in `reminder_skip_reason`. Triggered every 5 min by an Apps Script trigger (`Reminders.gs`) — Xano free plan has no Background Tasks, and GitHub's free cron was hours late. `.github/workflows/reminders.yml` is now manual-only (Run workflow button) as a backup. Only marks a reminder "sent" if Resend actually accepted it. |
| `BookingHeartbeat.txt` | `POST /BookingHeartbeat` | Called by `koko-booking-presence.js` while the booking page is open (every 60 s while visible) and once when the customer leaves it; sets the hold's `last_active_at`. Needs booking ID **and** matching email, only touches `hold`/`pending_payment`. Accepts a form-encoded body (for `navigator.sendBeacon`). |
| `AdminBookings.txt` | `POST /AdminBookings` (key-protected) | Backs the staff admin page: every booking + locations, rooms, packages, add-ons and each venue's add-on prices (`location_addons`). Key = workspace variable `ADMIN_KEY` (unset = refuses every call). |
| `AdminUpdateBooking.txt` | `POST /AdminUpdateBooking` (key-protected) | Staff admin page's save: patches only whitelisted fields that were sent (`clear` = comma list of text fields to blank, since an empty string arrives as null), validates `status`, replaces the add-on list when `addons_json` (a JSON string) is sent, and prepends a timestamped line to `admin_log`. |
| `CancelBooking.txt` | `POST /CancelBooking` | Public cancel by booking ID, ≥12h before start. (Pulled from live; not used by the admin page, which cancels via `AdminUpdateBooking`.) |
| `VerifyBookingConversion.txt` | `POST /VerifyBookingConversion` | Read-only check that a booking ID + Stripe session ID really paid a live deposit — for conversion tracking on the success page. Returns no customer details. |
| `BookingSheetExport.txt` | `GET /BookingSheetExport?key=` (secret-protected) | Returns every booking row for `SyncBookings.gs` to write into the Booking Master sheet. Contains all customer PII — the key is the `SHEET_EXPORT_KEY` workspace variable, never a literal. |
| `NewsletterSignup.txt` | `POST /NewsletterSignup?key=` (Webflow webhook) | Target of the Webflow `form_submission` webhook (filter: form name "Email Sub", the homepage newsletter form). Checks `key` against workspace variable `WEBFLOW_HOOK_KEY`, then adds the signup to Mailchimp tagged `website newsletter`. Always answers 200 so Webflow doesn't retry. |
| `GetReferralCard.txt` | `GET /GetReferralCard?code=` | Public, read-only lookup by `referral_code` only (no booking ID, no email/phone) — backs the printable referral card page. A stranger can't browse other customers' data without already having their code. |
| `BackfillReferralCodesAndCredits.txt` | `POST /BackfillReferralCodesAndCredits` (secret-protected) | One-time, batched backfill: mints a `referral_code` + `$30` credit for every historical `deposit_paid`/`paid` booking that predates the referral feature, then emails each customer once (deduped per email, batched to respect Resend rate limits). Safe to call repeatedly — already-processed bookings are skipped. |

## Xano — functions

| File | Purpose |
|---|---|
| `mailchimp_subscribe.txt` | Upserts one contact into the Mailchimp audience `873666e056` ("Koko Amusement") with an optional tag; key = workspace variable `MC_API_KEY`. Uses `status_if_new`, so anyone who unsubscribed stays unsubscribed. Sends `FNAME`/`LNAME`/`STORE`/`PHONE` (phone as `+614…`, same format as `SyncMailchimp.gs`) — **only the ones that have a value**, so a later newsletter signup never blanks the store/phone an earlier booking filled in. The booking endpoints call it inside `try_catch`, so a Mailchimp error never fails a saved booking. Called by `CreateBooking`/`CreateGroupBooking` when `marketing_consent` is ticked (tag `online booking`) and by `NewsletterSignup` (tag `website newsletter`). Returns `{ok, status, detail}`. |
| `reserve_mahjong_rooms.txt` | Holds the mahjong rooms a group booking added (add-on `option` `mj|type=single\|twin|rooms=N|hours=H|start=<ms>|game=flowers_144\|no_flowers_136\|sichuan_108`; the customer picks the mahjong style on the add-on card, and the mahjong side picks rooms already set up for those tiles first, flagging any other room `needs_tile_change`) in the separate **Cityheroes mahjong** Xano (`api:Eq8OZnxt`) via its `PartnerHoldCreate` endpoint, authenticated by the shared secret in KOKO table `partner_keys` (row `cityheroes_mahjong`) = Cityheroes `settings.koko_partner_secret`. Called by `StripeWebhook` once the deposit is paid; skips bookings whose `mahjong_hold_ids` is already set. Held rooms are appended to `booking_notes`; failures too, plus an `[ACTION NEEDED]` email to marketing. KOKO location → mahjong venue: 6 Haymarket → `haymarket`, 3 Burwood → `burwood`, 11 Cityheroes Hornsby → `hornsby`. |
| `expire_stale_holds.txt` | Called via `function.run` from `CreateBooking`/`CreateGroupBooking`. Sweeps `hold`/`pending_payment` bookings older than 24h to `expired` (must stay 24h — the reminder emails at 15 min/20h rely on the booking still reading `hold`/`pending_payment` that whole window). Releases any credit that booking had reserved back to `available` so it isn't stranded. |

## Google Apps Script

Bound to the "Booking Master" Google Sheet.

| File | Purpose |
|---|---|
| `SyncBookings.gs` | Hourly trigger: pulls every booking from `BookingSheetExport`, rewrites the "Booking Master" sheet, upserts a Google Calendar event per `deposit_paid` booking (per-venue calendar, deleted if the booking un-pays), sends the `[NEW BOOKING]` staff notification email the first time a booking's calendar event is created (tracked via its own `new_booking_email_sent` column, independent of calendar success so a failed send retries), and syncs `referral_code`/`discount_aud`/`discount_reason` into the sheet. Bookings with status `confirmed` (entered by hand, e.g. school groups paying by invoice — no Stripe, so no reminders or expiry) are treated like paid ones: calendar event titled `🧾[INVOICE]`, `[NEW BOOKING]` email, change/cancel emails. After the one-time `[NEW BOOKING]` email, a paid booking whose date, time, venue, room, guests, package or add-ons change sends `[BOOKING CHANGED]` (old → new; a venue move emails both stores), and a paid booking that becomes cancelled/expired/refunded sends `[BOOKING CANCELLED]` — last-notified state kept in the `notify_snapshot` column, recorded silently on first sight so deploying never sends a backlog. Also exposes `backfillMissingNewBookingEmails()` — a manual, non-triggered function to catch up `[NEW BOOKING]` emails for bookings that were skipped when that column was first added. |
| `Reminders.gs` | Separate file in the same Apps Script project. `runReminders()` POSTs to `RunReminders` with Script Property `REMINDER_SECRET`; `installReminderTrigger()` (run once by hand) sets it on a 5-minute time-driven trigger. |
| `BirthdaySync.gs` | **Separate Google Sheet** (the birthday-members one, not Booking Master). Daily 3am trigger (`installDailyTrigger()`) runs `syncMembersProduction()`: reads the Mailchimp audience, gives each member with a valid `BIRTHDAY` a gift `CODE` (rotated `ROTATE_LEAD_DAYS`, default 7, days before each birthday, with `CODE_YEAR`), and mirrors them into the `Members` sheet; run summary in `Sync_Log`. Writes back only the changed merge fields (plus a completed `ADDRESS` when it's partly/entirely blank, which Mailchimp otherwise rejects), and one member failing is logged and skipped instead of aborting the whole run. Config in Script Properties (`MC_API_KEY`, `LIST_ID`, …). |
| `SyncMailchimp.gs` | Syncs a separate "Form responses" sheet into Mailchimp, splitting contacts into per-store sheets/audiences by a "store name" column. Unrelated to the booking flow above. |

## Webflow — booking flow widgets (main multi-step forms)

| File | Page | Purpose |
|---|---|---|
| `koko-booking.js` | `/booking/birthday-party` | Full birthday-party booking flow: location → check availability → package → addons → contact (incl. optional `referralCode` field) → review (shows a discount banner if one applies) → pay. Progressively enhances existing page markup by element ID (with fallbacks), so it survives most CMS edits. State in `window.bookingState`. |
| `koko-group-booking.js` | `/booking/group` | Same shape for group bookings (`groupReferralCode` field, guest-count stepper, add-on quantity/rules). State in `window.groupBookingState`. |
| `koko-booking-presence.js` | `/booking/birthday-party`, `/booking/group` (after the flow script) | Pings `BookingHeartbeat` once a booking exists, so reminder emails wait until the customer has left the page. Reads the newest booking from `window.bookingState`/`window.groupBookingState` each tick. Safe to omit (reminders fall back to the fixed 15-min timing). |
| `koko-group-scroll.js` | `/booking/group` | Purely cosmetic: smooth-scrolls to the next section as the group flow advances. Safe to omit. |
| `koko-attribution.js` | Homepage, `/parties`, `/booking/birthday-party`, `/booking/group` | Captures marketing channel (`utm_source`/`utm_medium`/`utm_campaign`, or a classified `landing_referrer` like `google`/`instagram`/`direct` when there's no UTM) and `entry_page` (which of the four pages above the visitor actually landed on first). First-touch, sessionStorage-based — survives the quick-booking widgets' redirect into the full flow. Exposes `window.kokoGetAttribution()`, which both flow scripts read when building the `CreateBooking`/`CreateGroupBooking` payload. Paste before the flow scripts (or site-wide in global custom code — it still only captures once per tab session). |
| `koko-booking-embed.min.txt` | — | ⚠️ Older, minified, birthday-only booking snippet (calls `CreateBooking` but not the current `referralCode` field or the group flow) — looks superseded by `koko-booking.js`. Kept here for reference; confirm before treating as live. |

### Pricing constants (defined independently in both flow scripts — keep in sync)

```js
DEPOSIT_CENTS      = 5000   // $50.00 refundable deposit
SURCHARGE_CENTS    = 150    // $1.50 booking fee (shown as "Booking fee", not "card surcharge")
PAYABLE_NOW_CENTS  = 5150   // $51.50 charged now (deposit + surcharge)
MIN_ADVANCE_MS     = 259_200_000   // must book ≥ 72h ahead
```

## Staff admin page

| File | Where | Purpose |
|---|---|---|
| `koko-admin.js` | A noindex Webflow page (e.g. `/staff/bookings`) with one embed: `<div id="kokoAdminRoot"></div>` + this script from jsDelivr — or open `koko-admin.html` from disk | Lets staff manage bookings without the Xano back office: search (name/email/phone/#ID/child/referral code), filter by venue/status/type/date, open a booking to change date, time, venue, room, guests, package, contact/party details, notes, add-ons (tap-to-add buttons for what that venue sells, +/− quantity, option picker; add-on total, total and balance update themselves — mahjong add-ons don't touch the CityHeroes room), money (works itself out: total = package + add-ons, balance = total − discount − paid; for parties, changing package/guests/venue pulls the package price from the live `Quote`; any figure can still be typed over), status; cancel; **Resend confirmation email**; copy an unpaid booking's payment link. Warns about room clashes and capacity. Every save is logged to `admin_log` with the staff member's name. Asks for the `ADMIN_KEY` on screen (remembered per device if ticked) — never put it in the page. Money edits don't charge or refund anything (Stripe is separate). Paid bookings' changes reach the store calendar / `[BOOKING CHANGED]` email through `SyncBookings.gs` within the hour. |
| `koko-admin.html` | — | Standalone wrapper for `koko-admin.js`. |

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
| `koko-group-print-quote.js` | `/booking/group`, loaded after `koko-group-booking.js` | "Save this quote as a PDF" button on the group review step — loaded from jsDelivr like the flow scripts. Injects its own `<style>`. |
| `koko-group-print-quote.html` | — | The same button as an inline paste-in snippet (the original form). Superseded by the `.js` above; keep the two in sync or delete this one once the page uses the `.js`. |
| `koko-location-select.js` | Any page with a `<select>` | Restyles native `<select>` elements as a custom dropdown (single or checkbox-multi if the select has `multiple`). |

---

## Element ID contract (both flow scripts)

Widgets look elements up by ID with fallbacks, so a CMS rename doesn't necessarily
break them. Single flow: `locationSlug`/`location`, `bookingDate`/`date`,
`guestCount`/`guests`, `quickCheckAvailabilityBtn`, `availabilitySection`,
`selectPackage{Joy,Fun,Max}`, `packageSection`, `addonsSection`, `contactSection`,
`customerName`/`Phone`/`Email`, `referralCode`, `reviewSection`, `review*` fields,
`createBookingBtn`, `confirmBookingBtn` (typo alias `confitmBookingBtn` intentionally
also accepted). Group flow uses the `group*` equivalents, plus `groupReferralCode`. Add-ons whose slug starts with `mahjong-` (Haymarket: `mahjong-single` $15, `mahjong-twin` $24 per room per hour) render as a mahjong card: start time, hours and rooms, offering only as many rooms as the Cityheroes mahjong `GetAvailability` shows free for that window; qty = rooms × hours. The marketing-consent checkbox (`marketingConsent` / `groupMarketingConsent`) is injected by the scripts just above the Review button — no Webflow markup needed; it's sent as `marketing_consent`, stored on the booking, and (when ticked) pushes the customer to Mailchimp via `mailchimp_subscribe`.
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
- **`bookings.customer_phone` is a number column** — the leading `0` is gone (`412345678`), even though the forms send `0412345678`. Normalise phones for both shapes. And **`|regex_replace` returned null** in our Xano (it saves fine, then silently blanks the value) — strip characters with chained `|replace` instead.
- **`array.slice` is not a real Xano function** — batch a `foreach` with a manually
  incremented counter variable + `if (counter < limit)` instead.
- Changing the **`$1.50` surcharge / `$50` deposit / `$30` discount** means editing the
  constant in every file that has its own copy — they're not shared.
- **New booking fields (e.g. `utm_source`/`utm_medium`/`utm_campaign`/`landing_referrer`/
  `entry_page`) need the matching column added to the `bookings` table in Xano by hand**
  before the updated `CreateBooking`/`CreateGroupBooking` query text will save them —
  pasting new `db.add` fields into the function stack does not create the column.
  `BookingSheetExport` (the query `SyncBookings.gs` reads from — not mirrored in this
  repo) also needs checking: if it lists fields explicitly rather than returning the
  whole row, add new columns there too or they won't reach the sheet.
