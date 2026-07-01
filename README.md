# koko-booking

Embeddable **vanilla-JS booking widgets** for KOKO Amusement venues. Two independent
flows — single/party (birthday) booking and group booking — plus a scroll helper.

No framework, no build step. Each script is dropped onto a CMS page (Webflow) and
**progressively enhances existing markup by element ID**: it finds the page's
location select, date field, package cards, buttons, etc. (with many ID/label
fallbacks so it survives CMS edits), drives a multi-step flow, talks to a **Xano**
backend, and finally redirects to **Stripe** for the deposit.

- **Backend:** `https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ` (Xano)
- **Payment:** Stripe — the API returns a payment/checkout URL; the widget redirects to it.

---

## Files

| File | Purpose |
|---|---|
| `koko-booking.js` | Single / party (birthday) booking flow. State: `window.bookingState`. |
| `koko-booking.css` | Styles for the single-booking widget (package cards, slots, review). |
| `koko-group-booking.js` | Group booking flow (10+/20+ guests). State: `window.groupBookingState`. |
| `koko-group-booking.css` | Styles for the group widget (guest stepper, slots, addon cards). |
| `koko-group-scroll.js` | UX helper: smooth-scrolls to the next section as the user advances the group flow. |

The two `.js` flows are self-contained IIFEs and can be loaded independently. Both
define the same money constants locally (they do not share code).

---

## Pricing (both flows)

```js
DEPOSIT_CENTS      = 5000   // $50.00 refundable/booking deposit
SURCHARGE_CENTS    = 150    // $1.50 card surcharge
PAYABLE_NOW_CENTS  = 5150   // $51.50 charged now (deposit + surcharge)
```

At the review step the widget injects a breakdown box above the pay button
(**Deposit $50.00 + Card surcharge $1.50 = Total payable now $51.50**) and relabels
the button `Pay $51.50`. The remaining balance (package + addons − deposit) is shown
for reference and settled at the venue.

---

## Single / party booking — `koko-booking.js`

Flow (each step reveals the next section and scrolls to it):

```
location → Check availability → package (Joy/Fun/Max) → addons → contact → Review → Pay
```

Backend calls (all `POST {BASE_URL}/...` with `{ payload }`, except GETs):

| Endpoint | When |
|---|---|
| `/LocationNote` | describe the selected venue |
| `/Availability` | check rooms/slots for location+date+guests |
| `/addons` | list add-ons for the chosen room/slot |
| `/Quote` | price a package + add-ons |
| `/CreateBooking` | create the pending booking |
| `/ConfirmBooking` | get the Stripe payment URL, then redirect |

Key config:

```js
MIN_PARTY_SIZE = 10
MIN_ADVANCE_MS = 259_200_000        // must book ≥ 3 days ahead
PACKAGE_IDS = { joy: 10, fun: 5, max: 1 }   // KOKO Party Joy / Fun / Max
LOCATION_GUEST_LIMITS = { Hurstville:16, Hornsby:16, Haymarket:16, Burwood:16, Townhall_614:20 }  // else 25
```

Locations (`slug → display name`): `Townhall_614` → "Town Hall - 614", `Hurstville`,
`Hornsby`, `KOKO_Cityheroes_Hornsby` → "KOKO&Cityheroes - Hornsby", `Burwood`,
`Haymarket`. Package availability is per-location (e.g. `KOKO_Cityheroes_Hornsby`
offers only Joy); cards for unavailable packages are hidden and the grid re-lays out.

**Deep linking:** `applyParams()` reads URL query params and pre-fills the form,
retrying a few times as the CMS renders:
`?location=<slug>&date=<dd/mm/yyyy>&guests=<n>&auto_check=1` (also accepts
`location_slug`, `bookingDate`, `party_size`, etc.). `auto_check=1` auto-runs the
availability check once all three are set.

**Add-on note:** a party-room add-on (`addon_id === 7`) extends the booking end time
by one hour before `/CreateBooking`.

---

## Group booking — `koko-group-booking.js`

Flow:

```
basics (location/date/guests) → Group availability (time slots)
  → package → add-ons (quantity steppers) → contact → Review → Pay
```

Backend calls:

| Endpoint | When |
|---|---|
| `/GroupAvailability` | list group session time slots |
| `/GroupAddons?location_slug=…` | list group add-ons |
| `/GroupQuote` | price the group session |
| `/Availability` | check a room-extension add-on |
| `/CreateGroupBooking` | create the pending group booking |
| `/ConfirmGroupBooking` | returns `payment_url` → `window.location.assign(...)` |

Notable behaviour:

- **Guest stepper** (`setupGuestStepper`) — +/- buttons on the guest count.
- `MIN_ADVANCE_MS = 72h`, `DEFAULT_SESSION_MINUTES = 30` (used when a slot has no
  explicit `end_ts`).
- **Time-slot picker** groups slots into ranges; selecting one sets `start_ts`/`end_ts`.
- **Add-on cards** support quantities and rules — e.g. billiards enforces a minimum
  number of tables scaled to guest count (`ceil(guests / 4)`, min 3).
- `ID_ALIASES` maps the many possible CMS element IDs to logical names so the widget
  keeps working across page edits.

---

## Scroll helper — `koko-group-scroll.js`

A tiny IIFE, independent of the flow logic. It listens (capture phase) for clicks on
the group flow's buttons and smooth-scrolls to the next relevant section
(availability → slots → packages → add-ons/contact → review), offset 110px under the
sticky header. It also clears the group message when the user changes location/date/
guests. Purely cosmetic — safe to omit.

---

## Element ID contract

The widgets look up page elements by ID with fallbacks. The main IDs expected on the
page include (single flow): `locationSlug`/`location`, `bookingDate`/`date`,
`guestCount`/`guests`, `checkAvailabilityBtn`, `availabilitySection`,
`selectPackage{Joy,Fun,Max}` (or `[data-koko-package=…]`), `packageSection`,
`addonsSection`, `contactSection`, `customerName/Phone/Email`, `reviewSection`,
`review*` fields, `createBookingBtn`, `confirmBookingBtn`. Group flow uses the
`group*` equivalents (`groupLocation`, `groupDate`, `groupGuests`,
`groupAvailabilityBtn`, `groupSlotsSection`, `groupPackagesSection`,
`groupAddonsSection`, `groupContactSection`, `groupReviewSection`, `groupReviewBtn`).

Buttons can also be targeted with `data-koko-*` attributes; missing sections produce a
visible message instead of failing silently.

---

## Local development

These are static assets — there's no build. To edit: change the `.js`/`.css`, and
host them where the CMS page includes them (e.g. Webflow custom code / an asset host).
`BASE_URL` and the pricing constants are the top of each `.js` file.

## Gotchas

- **Money is in cents** everywhere; `money(cents)` formats to `$xx.xx`.
- **Dates** are normalised to `dd/mm/yyyy` (`dateNorm`); the API is Xano.
- The `confirmBookingBtn` typo alias `confitmBookingBtn` is intentionally supported —
  both IDs are accepted so a CMS typo doesn't break payment.
- Changing the **$1.50 surcharge / $50 deposit** means editing `SURCHARGE_CENTS` /
  `DEPOSIT_CENTS` in **both** `koko-booking.js` and `koko-group-booking.js`.
