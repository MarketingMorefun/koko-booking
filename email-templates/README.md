# Email templates (George design)

Every customer email shares one set of components (`build_previews.py`), so sizes and
spacing stay identical. George artwork lives in `../email-assets/` and is served from
jsDelivr at a fixed commit (currently `@57b1895`).

| File | What it does |
|---|---|
| `build_previews.py` | Components + local preview pages in `email-previews/` (fictional sample data; that folder is git-excluded). |
| `build_templates.py` | Same components → `templates.json`: the HTML Xano uses, with `{{PLACEHOLDERS}}` and `__IMG__` for the image base. |
| `patch_templates.py` | Swaps those templates into `send_booking_confirmation.txt` and `RunReminders.txt` (asserts every placeholder and paid-in-full replacement text is still there). |
| `followup_lambda.js` | Decides which thank-you / next-year emails are due and renders them (pure JS, runs inside Xano's `api.lambda`). |
| `build_followups.py` | Assembles `send_followup_emails.txt` and the preview-only `RunFollowUps.txt` from the lambda + templates. |
| `followups.test.cjs` | Local checks for the follow-up rules (timing, DST, skips, escaping). |

## Changing an email

Run from the repo root (`OUT` = any scratch folder):

```bash
python3 email-templates/build_previews.py
```

```bash
python3 email-templates/build_templates.py OUT
```

```bash
node email-templates/followups.test.cjs OUT/templates.json email-templates/followup_lambda.js email-previews/_followups-render.html
```

Then pull the live Xano scripts first (they may have changed), patch them with
`patch_templates.py` / `build_followups.py` using the jsDelivr image base, PUT them, and
pull them back into the repo. `node --test tests/booking-reliability.test.cjs` must still pass.
New George art: add the PNG to `email-assets/`, push, and use the new commit in the image base.

## Previewing follow-ups on live data

`POST /RunFollowUps` never sends or marks anything. Body: `{"secret": ...}` lists what is
due now; add `"booking_id"` and `"kind": "thank_you" | "anniversary"` to render one booking.
The secret is in `~/.koko_followup_preview_secret` on the dev machine (only its SHA-256 is in
the endpoint); `REMINDER_SECRET` also works.
