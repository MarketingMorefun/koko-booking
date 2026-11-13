"""Build Xano-ready George email templates from the same components as the previews.

Usage (repo root):  python3 build_templates.py OUT_DIR
Writes OUT_DIR/templates.json  ({name: html-with-placeholders}) and
OUT_DIR/templates-preview.html (placeholders filled with sample values, local images).
Image URLs use the token __IMG__ (replaced at deploy with the jsDelivr base).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'build_previews.py')).read()
ns = {}
exec(src.split('# ================= follow-up emails')[0], ns)   # components only
ns['A'] = '__IMG__'
g = ns  # shorthand
INK, MUTED = g['INK'], g['MUTED']

def doc(inner):
    css = ("@media only screen and (max-width: 520px) {"
           " .kk-txt { text-align: center !important; }"
           " .kk-outer { padding: 16px 8px !important; }"
           " .kk-card { padding: 20px 14px 26px !important; }"
           " .kk-box { padding: 18px 14px !important; } }")
    return ("<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<style>{css}</style></head><body style='margin:0;padding:0;background:#FFFDF9;'>"
            + inner.replace("margin:12px auto 0;", "margin:0 auto;") + "</body></html>")

def referral(lead, code, url):
    return g['side']('dash', 'george-selfie.png', 'George taking a selfie',
        "<div style='display:inline-block;padding:4px 12px;border-radius:999px;background:#F5D949;border:1px solid #221D16;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#221D16;margin-bottom:10px;'>Refer a Friend</div>"
        + g['p']((lead + ' ' if lead else '') + "Share your code — when a friend books their first KOKO party or group event with it, they get $30 off, and you get another $30 off.", INK, 12)
        + f"<div style='display:inline-block;padding:8px 16px;border:2px dashed #221D16;border-radius:12px;background:#ffffff;font-size:18px;font-weight:900;letter-spacing:0.05em;color:#221D16;margin-bottom:10px;white-space:nowrap;'>{code}</div>"
        f"<div><a href='{url}' style='display:inline-block;padding:9px 18px;border:2px solid #221D16;border-radius:14px;background:#F5D949;box-shadow:3px 3px 0 #221D16;font-weight:800;font-size:13px;color:#221D16;text-decoration:none;'>View &amp; print your code</a></div>")

def review(url, who):
    return g['side']('sand', 'george-tablet.png', 'George holding a tablet',
        "<div style='font-size:18px;letter-spacing:2px;color:#F2A93B;margin-bottom:4px;'>★★★★★</div>"
        f"<h2 style='margin:0 0 6px;font-size:18px;color:{INK};'>Had a great time?</h2>"
        + g['p'](f"A quick Google review takes less than a minute and helps {who} find us. George reads every one!", MUTED, 14)
        + f"<a href='{url}' style='display:inline-block;background:#FFF7EB;color:#B86816;text-decoration:none;font-size:14px;font-weight:900;padding:12px 18px;border-radius:12px;border:2px solid #F2B36F;white-space:nowrap;'>Leave a Google review</a>")

CONTACT = g['CONTACT']
UNSUB = "<a href='mailto:marketing@kokoamusement.com.au?subject=Unsubscribe' style='color:#9A8B7C;'>Unsubscribe</a>"
CHANGES = "If you need to reschedule or make changes to your booking, please contact <a href='mailto:marketing@kokoamusement.com.au' style='color:#B86816;font-weight:800;text-decoration:none;'>marketing@kokoamusement.com.au</a> with your booking ID. Booking changes must be requested at least 24 hours before the event and are subject to availability."
T = {}

# ---------------- confirmation (send_booking_confirmation) ----------------
pay_rows = (g['rows']([('Package Total', '{{PACKAGE_TOTAL}}'), ('Add-ons Total', '{{ADDONS_TOTAL}}'),
                       ('Grand Total', '{{GRAND_TOTAL}}', 'border-top:1px solid #E8DDCC;padding-top:12px;')])
            .replace('</table>', '{{DISCOUNT_ROW}}')
            + g['rows']([('Deposit Paid', '{{DEPOSIT_PAID}}', 'color:#2F8F5B;border-top:1px solid #E8DDCC;padding-top:12px;'),
                         ('Remaining Balance', '{{REMAINING_BALANCE}}', 'color:#B86816;')]).split('>', 1)[1])
T['confirmation_email_html'] = doc(g['wrap'](
    g['header']('george-gift-pop.png', 170, 'George popping out of a gift box', "Woohoo! You're booked in! 🎉")
    + g['intro'](g['badge']('Deposit Paid', '#2F8F5B', '#EAF8EF'), '{{HEADING}}',
                 'Hi {{CUSTOMER_NAME}}, your $50 deposit has been received. Your booking is confirmed. The remaining balance is payable on the day of your event.')
    + g['titled']('sand', 'Booking Details', g['rows']([('Booking ID', '#{{BOOKING_ID}}'), ('Location', '{{LOCATION}}'), ('Date', '{{BOOKING_DATE}}'),
        ('Booking Time', '{{BOOKING_TIME}}'), ('Guests', '{{GUESTS}}'), ('Package', '{{PACKAGE}}'), ('Status', 'Deposit Paid', 'color:#2F8F5B;')]))
    + '{{ADDONS_BLOCK}}'
    + g['titled']('sand', 'Payment Summary', pay_rows)
    + g['note']('Booking Changes:', CHANGES)
    + g['note']('Please note:', 'The $50 deposit is non-refundable. The remaining balance is payable on the day of your event.')
    + '{{MIN_GUEST_NOTE}}' + '{{INVITE_BLOCK}}'
    + referral('', '{{REFERRAL_CODE}}', '{{REFERRAL_CARD_URL}}')
    + g['titled']('white', 'Customer Details', g['rows']([('Name', '{{CUSTOMER_NAME}}'), ('Email', '{{CUSTOMER_EMAIL}}'), ('Phone', '{{CUSTOMER_PHONE}}')])),
    'If you have any questions, please contact us with your booking ID.<br><br>See you soon!',
    'This is an automated booking confirmation email from KOKO Amusement.'))
box_open = f"<div class='kk-box' style='{g['BOX']['sand']}border-radius:18px;padding:22px;margin:24px 0;'>"
T['addons_block_open'] = (box_open + f"<h2 style='margin:0 0 6px;font-size:18px;color:{INK};'>Add-ons</h2>"
                          "<table role='presentation' style='width:100%;border-collapse:collapse;font-size:15px;'>")
T['invite_block'] = g['invitation']()
T['min_guest_note'] = g['note']('Minimum charge:', 'Group bookings are charged for a minimum of 10 guests. If fewer than 10 guests attend on the day, your booking will still be charged at the 10-guest rate.')

# ---------------- reminders (RunReminders) ----------------
hold_rows = g['rows']([('Booking ID', '#{{BOOKING_ID}}'), ('Location', '{{LOCATION}}'), ('Date &amp; Time', '{{BOOKING_DATE}} &middot; {{BOOKING_TIME}}'),
                       ('Guests', '{{GUESTS}}'), ('Package', '{{PACKAGE}}'), ('Total', '{{GRAND_TOTAL}}', 'border-top:1px solid #E8DDCC;padding-top:12px;font-weight:900;')])
T['reminder_1_html'] = doc(g['wrap'](
    g['header']('george-wave.png', 170, 'George waving', "Psst! You're almost there 👋")
    + g['intro'](g['badge']('Not Confirmed Yet'), 'Hi {{CUSTOMER_NAME}}, your KOKO time slot isn&rsquo;t locked in yet',
                 "You started a booking but haven't paid the $50 deposit yet, so this time slot is still open to other customers. Pay your deposit soon so no one else books it before you. Your booking details are saved until <strong style='color:#2F241C;'>{{HOLD_UNTIL}}</strong>.")
    + g['titled']('sand', 'Booking Details', hold_rows)
    + g['button']('{{RESUME_URL}}', 'Complete My Booking'),
    'See you soon,', CONTACT))
T['reminder_2_html'] = doc(g['wrap'](
    g['header']('george-oh-no.png', 150, 'George with his hands on his head', 'Oh no — only 4 hours left! ⏰', bg='#FBE3E3')
    + g['intro'](g['badge']('Last Chance', '#B8434E', '#FBEADA'), '{{CUSTOMER_NAME}}, your KOKO booking expires in 4 hours',
                 "This is a final reminder &mdash; your time slot still isn&rsquo;t locked in, and other customers can book it at any time. Your saved booking expires at <strong style='color:#2F241C;'>{{HOLD_UNTIL}}</strong>; after that you&rsquo;ll need to start a new booking.")
    + g['titled']('sand', 'Booking Details', hold_rows)
    + g['button']('{{RESUME_URL}}', 'Complete My Booking Now'),
    'Hope to see you soon,', CONTACT))

# ---------------- follow-ups (send_followup_emails) ----------------
# Block placeholders are filled (or blanked) by the sender: {{CREDIT_BLOCK}} {{REFERRAL_BLOCK}} {{NEXT_YEAR_BLOCK}}
T['credit_block'] = g['side']('green', 'george-gift-cheer.png', 'George cheering on a gift box',
    "<div style='font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#2F8F5B;margin-bottom:6px;'>{{CREDIT_LABEL}}</div>"
    f"<div style='font-size:32px;font-weight:900;color:{INK};line-height:1;margin-bottom:8px;'>$30 off</div>"
    + g['p']('{{CREDIT_TEXT}}', '#4F6B57'))
T['referral_block'] = referral('{{REFERRAL_LEAD}}', '{{REFERRAL_CODE}}', '{{REFERRAL_CARD_URL}}')
T['next_year_block'] = g['side']('peach', 'george-cake.png', 'George holding a birthday cake',
    g['p'](f"<strong style='color:{INK};'>See you next year?</strong> {{{{NEXT_BIRTHDAY}}}} will be here before you know it. We'll send you a little reminder about 6 weeks before, so you can grab your favourite weekend slot early."))
T['thank_you_html'] = doc(g['wrap'](
    g['header']('george-waving-heart.png', 200, 'George waving from a heart', '{{BUBBLE}}')
    + g['intro'](g['badge']('Thank You'), '{{HEADING}}', '{{INTRO}}')
    + '{{CREDIT_BLOCK}}' + '{{REFERRAL_BLOCK}}'
    + review('{{REVIEW_URL}}', '{{REVIEW_WHO}}')
    + '{{NEXT_YEAR_BLOCK}}'
    + g['button']('{{BOOK_URL}}', '{{BOOK_LABEL}}'),
    'Thanks again,', CONTACT + "<br>{{WHY}} " + UNSUB))
T['anniversary_html'] = doc(g['wrap'](
    g['header']('george-happy-birthday.png', 260, 'George celebrating with balloons, presents and a birthday cake', 'Party time again? 🎈')
    + g['intro'](g['badge']('Birthday Reminder'), '{{HEADING}}', '{{INTRO}}')
    + g['titled']('sand', "Last year's party", g['rows']([('Location', '{{LOCATION}}'), ('Date', '{{PARTY_DATE}}'), ('Package', '{{PACKAGE}}'), ('Guests', '{{GUESTS}}')]))
    + '{{CREDIT_BLOCK}}'
    + g['button']('{{BOOK_URL}}', '{{BOOK_LABEL}}', '{{BOOK_SUB}}')
    + '{{REFERRAL_BLOCK}}',
    'Hope to see you soon,', CONTACT + "<br>You're receiving this because you booked a birthday party at KOKO Amusement last year. " + UNSUB))

for k, v in T.items():
    assert '"' not in v, f'{k} contains a double quote (breaks XanoScript strings)'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
json.dump(T, open(os.path.join(out, 'templates.json'), 'w'), ensure_ascii=False, indent=1)
print('templates:', {k: len(v) for k, v in T.items()})
