"""Builds the George email previews into email-previews/ (run from the repo root).

All emails share these components so sizes and spacing stay identical.
Sample data is fictional (the repo is public).
"""
A = '../email-assets/'
INK, MUTED, BROWN = '#2F241C', '#7b6a58', '#B86816'

# ---------- building blocks ----------
def img(src, w, alt, extra=''):
    return (f"<img src='{A}{src}' width='{w}' alt='{alt}' "
            f"style='width:{w}px;max-width:100%;height:auto;display:block;border:0;{extra}'>")

def header(src, w, alt, bubble, bg='#FFF4CC'):
    return (f"<div class='kk-hero' style='background:{bg};border-radius:20px;padding:22px 16px 0;margin:0 0 26px;text-align:center;overflow:hidden;'>"
            f"<div style='display:inline-block;background:#ffffff;border:2px solid #221D16;border-radius:16px;padding:9px 18px;font-weight:900;font-size:16px;color:#221D16;box-shadow:3px 3px 0 #221D16;'>{bubble}</div>"
            "<div style='width:0;height:0;margin:0 auto 6px;border-left:10px solid transparent;border-right:10px solid transparent;border-top:12px solid #221D16;'></div>"
            + img(src, w, alt, 'margin:0 auto;') + "</div>")

def badge(text, fg=BROWN, bg='#FFF3DF'):
    return (f"<div style='margin-bottom:14px;'><div style='display:inline-block;padding:9px 16px;border-radius:999px;background:{bg};color:{fg};"
            f"font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;line-height:1;'>{text}</div></div>")

def intro(badge_html, h1, p):
    return (f"<div style='text-align:center;margin-bottom:8px;'>{badge_html}"
            f"<h1 style='margin:0 0 12px;font-size:30px;line-height:1.15;color:{INK};'>{h1}</h1>"
            f"<p style='margin:0;color:{MUTED};font-size:16px;line-height:1.6;'>{p}</p></div>")

BOX = {
    'green': 'background:#EAF8EF;border:1px solid #BFE5CC;',
    'dash':  'background:#FFFBF5;border:2px dashed #221D16;',
    'sand':  'background:#faf6ee;border:1px solid #E8DDCC;',
    'peach': 'background:#FFF7EB;border:1px solid #F4D7B5;',
    'white': 'background:#ffffff;border:1px solid #E8DDCC;',
}
def box(kind, inner):
    return f"<div class='kk-box' style='{BOX[kind]}border-radius:18px;padding:22px;margin:24px 0;'>{inner}</div>"

# image column is always 120px; each pose is sized to look about the same height
POSE_W = {'george-gift-cheer.png': 90, 'george-selfie.png': 120, 'george-tablet.png': 93, 'george-cake.png': 116}
def side(kind, src, alt, inner):
    w = POSE_W[src]
    return box(kind,
        "<div style='text-align:center;font-size:0;'>"
        f"<div style='display:inline-block;vertical-align:middle;width:120px;margin:0 8px 12px;'>{img(src, w, alt, 'margin:0 auto;')}</div>"
        f"<div class='kk-txt' style='display:inline-block;vertical-align:middle;width:100%;max-width:400px;text-align:left;font-size:14px;'>{inner}</div>"
        "</div>")

def p(text, color=MUTED, mb=0):
    return f"<p style='margin:0 0 {mb}px;color:{color};font-size:14px;line-height:1.6;'>{text}</p>"

def button(href, text, sub=''):
    s = (f"<div style='text-align:center;margin:30px 0 8px;'><a href='{href}' style='display:inline-block;background:#F5D949;border:2px solid #221D16;"
         f"box-shadow:4px 4px 0 #221D16;color:#221D16;text-decoration:none;font-size:16px;font-weight:900;padding:16px 36px;border-radius:16px;'>{text}</a>")
    if sub:
        s += f"<p style='margin:14px 0 0;color:#9A8B7C;font-size:12.5px;'>{sub}</p>"
    return s + "</div>"

def rows(pairs, money=False):
    out = ''
    for k, v, *style in pairs:
        st = style[0] if style else ''
        out += (f"<tr><td style='padding:8px 0;color:{MUTED};{st}'>{k}</td>"
                f"<td style='padding:8px 0;text-align:right;font-weight:800;color:{INK};{st}'>{v}</td></tr>")
    return f"<table role='presentation' style='width:100%;border-collapse:collapse;font-size:15px;'>{out}</table>"

def titled(kind, title, body, george=None):
    """Card with a heading; optional small George on the right of the heading."""
    if george:
        head = (f"<table role='presentation' style='width:100%;border-collapse:collapse;margin:0 0 6px;'><tr>"
                f"<td style='vertical-align:middle;'><h2 style='margin:0;font-size:18px;color:{INK};'>{title}</h2></td>"
                f"<td style='width:64px;vertical-align:middle;'>{img(george, 64, 'George holding a sign', 'margin:0 0 0 auto;')}</td></tr></table>")
    else:
        head = f"<h2 style='margin:0 0 12px;font-size:18px;color:{INK};'>{title}</h2>"
    return box(kind, head + body)

def wrap(body, sign, footer):
    return ("<div class='kk-outer' style='max-width:680px;margin:12px auto 0;padding:28px 20px;background:#FFFDF9;font-family:Arial,sans-serif;color:#2F241C;'>"
            "<div class='kk-card' style='background:#ffffff;border:1px solid #E8DDCC;border-radius:24px;padding:28px 24px 34px;'>"
            + body +
            f"<p style='font-size:15px;line-height:1.7;color:{INK};margin:28px 0 0;'>{sign}<br><strong>George &amp; the KOKO Amusement team</strong></p></div>"
            f"<p style='text-align:center;color:#9A8B7C;font-size:12px;line-height:1.6;margin:18px 0 0;'>{footer}</p></div>")

CONTACT = "Questions? Contact <a href='mailto:marketing@kokoamusement.com.au' style='color:#B86816;text-decoration:none;font-weight:700;'>marketing@kokoamusement.com.au</a>"
UNSUB = "<a href='mailto:marketing@kokoamusement.com.au?subject=Unsubscribe' style='color:#9A8B7C;'>Unsubscribe</a>"

# ---------- shared sections ----------
def credit(label, email, still=False):
    t = (f"You still have $30 off saved to <strong>{email}</strong>. It comes off automatically when you book with this email." if still else
         f"Your next KOKO party or group visit is $30 off. It's saved to <strong>{email}</strong> and comes off automatically when you book with this email — no code needed.")
    return side('green', 'george-gift-cheer.png', 'George cheering on a gift box',
        f"<div style='font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#2F8F5B;margin-bottom:6px;'>{label}</div>"
        f"<div style='font-size:32px;font-weight:900;color:{INK};line-height:1;margin-bottom:8px;'>$30 off</div>" + p(t, '#4F6B57'))

def referral(lead, code):
    return side('dash', 'george-selfie.png', 'George taking a selfie',
        "<div style='display:inline-block;padding:4px 12px;border-radius:999px;background:#F5D949;border:1px solid #221D16;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#221D16;margin-bottom:10px;'>Refer a Friend</div>"
        + p((lead + ' ' if lead else '') + "Share your code — when a friend books their first KOKO party or group event with it, they get $30 off, and you get another $30 off.", INK, 12)
        + f"<div style='display:inline-block;padding:8px 16px;border:2px dashed #221D16;border-radius:12px;background:#ffffff;font-size:18px;font-weight:900;letter-spacing:0.05em;color:#221D16;margin-bottom:10px;white-space:nowrap;'>{code}</div>"
        "<div><a href='#' style='display:inline-block;padding:9px 18px;border:2px solid #221D16;border-radius:14px;background:#F5D949;box-shadow:3px 3px 0 #221D16;font-weight:800;font-size:13px;color:#221D16;text-decoration:none;'>View &amp; print your code</a></div>")

def review(placeid, who='other families'):
    return side('sand', 'george-tablet.png', 'George holding a tablet',
        "<div style='font-size:18px;letter-spacing:2px;color:#F2A93B;margin-bottom:4px;'>★★★★★</div>"
        f"<h2 style='margin:0 0 6px;font-size:18px;color:{INK};'>Had a great time?</h2>"
        + p(f"A quick Google review takes less than a minute and helps {who} find us. George reads every one!", MUTED, 14)
        + f"<a href='https://search.google.com/local/writereview?placeid={placeid}' style='display:inline-block;background:#FFF7EB;color:#B86816;text-decoration:none;font-size:14px;font-weight:900;padding:12px 18px;border-radius:12px;border:2px solid #F2B36F;white-space:nowrap;'>Leave a Google review</a>")

def nextyear(child):
    return side('peach', 'george-cake.png', 'George holding a birthday cake',
        p(f"<strong style='color:{INK};'>See you next year?</strong> {child}'s next birthday will be here before you know it. We'll send you a little reminder about 6 weeks before, so you can grab your favourite weekend slot early."))

def note(title, text):
    return box('peach', p(f"<strong style='color:{INK};'>{title}</strong> {text}"))

def addons(items):
    rows_html = ''
    for name, detail, calc, total in items:
        sub = f"<div style='color:{MUTED};font-size:13px;font-weight:400;margin-top:2px;'>{detail}</div>" if detail else ''
        rows_html += (f"<tr><td style='padding:10px 0;border-top:1px solid #E8DDCC;color:{INK};vertical-align:top;'><strong style='font-weight:800;'>{name}</strong>{sub}"
                      f"<div style='color:{MUTED};font-size:13px;margin-top:2px;'>{calc}</div></td>"
                      f"<td style='padding:10px 0;border-top:1px solid #E8DDCC;text-align:right;font-weight:800;color:{INK};vertical-align:top;white-space:nowrap;'>{total}</td></tr>")
    return titled('sand', 'Add-ons', f"<table role='presentation' style='width:100%;border-collapse:collapse;font-size:15px;'>{rows_html}</table>")

def invitation():
    base = 'https://cdn.jsdelivr.net/gh/MarketingMorefun/koko-booking@ec8c576/'
    return box('white',
        "<div style='text-align:center;'>" + badge('Party Invitation') +
        f"<h2 style='margin:0 0 10px;font-size:20px;line-height:1.2;color:{INK};'>Invite your guests</h2>"
        + p('Download the KOKO birthday invitation, print it, then fill in the location, date and time for your party.', MUTED, 16)
        + f"<img src='{base}koko-birthday-invitation.png' alt='KOKO birthday invitation' width='240' style='width:240px;max-width:100%;height:auto;border-radius:14px;border:1px solid #E8DDCC;display:block;margin:0 auto 16px;'>"
        f"<a href='{base}koko-birthday-invitation.png' style='display:inline-block;background:#F5D949;border:2px solid #221D16;box-shadow:3px 3px 0 #221D16;color:#221D16;text-decoration:none;font-size:14px;font-weight:900;padding:12px 18px;border-radius:12px;margin:4px;'>Download PNG</a>"
        f"<a href='{base}koko-birthday-invitation.pdf' style='display:inline-block;background:#FFF7EB;color:#B86816;text-decoration:none;font-size:14px;font-weight:900;padding:12px 18px;border-radius:12px;border:2px solid #F2B36F;margin:4px;'>Printable PDF</a>"
        "<p style='margin:12px 0 0;color:#9A8B7C;font-size:12px;'>Tip: print at A4 for the best result.</p></div>")

def payment(package, addons_total, grand, paid, balance, discount=None):
    pairs = [('Package Total', package), ('Add-ons Total', addons_total),
             ('Grand Total', grand, f'border-top:1px solid #E8DDCC;padding-top:12px;')]
    if discount:
        pairs.append(('Discount', discount, 'color:#2F8F5B;'))
    pairs += [('Deposit Paid', paid, 'color:#2F8F5B;border-top:1px solid #E8DDCC;padding-top:12px;'),
              ('Remaining Balance', balance, 'color:#B86816;')]
    return titled('sand', 'Payment Summary', rows(pairs))

# ---------- page ----------
CSS = """  body { margin: 0; background: #EFE8DC; font-family: Arial, sans-serif; }
  .label { max-width: 680px; margin: 36px auto 0; padding: 0 20px; color: #2F241C; font-size: 13px; line-height: 1.6; }
  .label b { display: inline-block; background: #221D16; color: #F5D949; padding: 3px 10px; border-radius: 999px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
  .label .subj { font-size: 15px; font-weight: 800; }
  hr { border: 0; border-top: 2px dashed #CDBFA8; max-width: 680px; margin: 40px auto 0; }
  /* Goes into each email's <head> too. On phones: centre the stacked cards, trim the nested side padding. */
  @media only screen and (max-width: 520px) {
    .kk-txt { text-align: center !important; }
    .kk-outer { padding: 16px 8px !important; }
    .kk-card { padding: 20px 14px 26px !important; }
    .kk-box { padding: 18px 14px !important; }
  }
"""
def label(tag, when, subj):
    return f"<div class='label'><b>{tag}</b><br>{when}<br><span class='subj'>Subject: {subj}</span></div>"

def page(title, sections):
    body = "\n<hr>\n".join(label(*l) + e for l, e in sections)
    return ("<!doctype html>\n<html lang='en'>\n<head>\n<meta charset='utf-8'>\n<meta name='viewport' content='width=device-width, initial-scale=1'>\n"
            f"<title>{title}</title>\n<style>\n{CSS}</style>\n</head>\n<body>\n"
            "<!-- George art: email-assets/*.png, converted from kokoamusement.com.au/meet-george. Sample data is fictional. -->\n"
            + body + "\n<div style='height:48px'></div>\n</body>\n</html>\n")

# ================= follow-up emails =================
FOOT_PARTY = CONTACT + "<br>You're receiving this because you booked a party at KOKO Amusement. " + UNSUB
e1a = wrap(
    header('george-waving-heart.png', 200, 'George waving from a heart', 'Thanks for partying with us! 🎉')
    + intro(badge('Thank You'), "Thank you for celebrating Mia's birthday with us!",
            f"Hi Sarah, we hope Mia and all the little guests had a blast at <strong style='color:{INK};'>KOKO Amusement Burwood</strong> on Saturday 15 November. Thank you for choosing KOKO to make the day special.")
    + credit('A little thank-you', 'sarah@example.com')
    + referral('Did one of the parents ask where you booked?', 'KOKO-612-4821')
    + review('ChIJYy2SrRy7EmsRwEghAeunXmM')
    + nextyear('Mia')
    + button('https://booking.morefun.com.au/booking/birthday-party', 'Book your next visit'),
    'Thanks again,', FOOT_PARTY)
e1b = wrap(
    header('george-waving-heart.png', 200, 'George waving from a heart', 'Thanks for visiting, James! 👋')
    + intro(badge('Thank You'), 'Thanks for bringing your group to KOKO!',
            f"Hi James, thank you for visiting <strong style='color:{INK};'>KOKO Amusement Haymarket</strong> on Friday 14 November. We hope everyone had a great time!")
    + credit('A little thank-you', 'james@example.com')
    + referral("Know another team, class or group who'd love it here?", 'KOKO-610-3307')
    + review('ChIJmX_Ve22vEmsRFVWV-_XLEFo', 'others')
    + button('https://booking.morefun.com.au/booking/group', 'Plan your next group visit'),
    'Thanks again,', CONTACT + "<br>You're receiving this because you booked a group visit at KOKO Amusement. " + UNSUB)
e2 = wrap(
    header('george-happy-birthday.png', 260, 'George celebrating with balloons, presents and a birthday cake', 'Party time again? 🎈')
    + intro(badge('Birthday Reminder'), "Mia's birthday is coming up again!",
            "Hi Sarah, it's been almost a year since we celebrated Mia's birthday together. Want to do it again? Weekend party slots fill up fast, so booking early gets you the time that suits you best.")
    + titled('sand', "Last year's party", rows([('Location', 'KOKO Amusement Burwood'), ('Date', 'Saturday 15 November 2026'), ('Package', 'Fun Package'), ('Guests', '12')]))
    + credit('Still waiting for you', 'sarah@example.com', still=True)
    + button('https://booking.morefun.com.au/booking/birthday-party?location_slug=burwood&amp;guests=12', "Book Mia's party",
             "We'll start you at KOKO Burwood with 12 guests — you can change anything.")
    + referral("Party season for Mia's friends too?", 'KOKO-612-4821'),
    'Hope to see you soon,', CONTACT + "<br>You're receiving this because you booked a birthday party at KOKO Amusement last year. " + UNSUB)

open('email-previews/followup-emails.html', 'w').write(page('Follow-up email previews', [
    (('Email 1a · Thank you · Birthday party', 'Sent: the morning after the party (deposit_paid / paid / confirmed)', "Thank you for celebrating Mia's birthday at KOKO! 🎉"), e1a),
    (('Email 1b · Thank you · Group booking', 'Sent: the morning after the visit. Same as 1a, minus the "see you next year" box', 'Thanks for visiting KOKO Amusement, James!'), e1b),
    (('Email 2 · Book again next year · Birthday party', "Sent: ~6 weeks before the same date next year — skipped if they've already booked again", "Mia's birthday is coming up — celebrate at KOKO again? 🎂"), e2),
]))

# ================= existing booking emails, with George =================
CHANGES = "If you need to reschedule or make changes to your booking, please contact <a href='mailto:marketing@kokoamusement.com.au' style='color:#B86816;font-weight:800;text-decoration:none;'>marketing@kokoamusement.com.au</a> with your booking ID. Booking changes must be requested at least 24 hours before the event and are subject to availability."
FOOT_AUTO = "This is an automated booking confirmation email from KOKO Amusement."

def details(pairs):
    return titled('sand', 'Booking Details', rows(pairs))

def customer(name, email, phone):
    return titled('white', 'Customer Details', rows([('Name', name), ('Email', email), ('Phone', phone)]))

c_party = wrap(
    header('george-gift-pop.png', 170, 'George popping out of a gift box', 'Woohoo! Your party is booked! 🎉')
    + intro(badge('Deposit Paid', '#2F8F5B', '#EAF8EF'), "Mia's birthday party is ready!",
            'Hi Sarah, your $50 deposit has been received. Your booking is confirmed. The remaining balance is payable on the day of your event.')
    + details([('Booking ID', '#612'), ('Location', 'Burwood'), ('Date', '2026-11-15'), ('Booking Time', 'Sat, Nov 15, 2026 12:00 - 13:00'),
               ('Guests', '12'), ('Package', 'KOKO Party Fun'), ('Status', 'Deposit Paid', 'color:#2F8F5B;')])
    + addons([('$60 KOKO Card', '', '1 × $60.00', '$60.00'), ('Decoration-Fun', '', '1 × $20.00', '$20.00'),
              ('Gift Bag', 'Candy x 6, Chocolate x 6', '12 × $9.90', '$118.80')])
    + payment('$336.00', '$198.80', '$534.80', '$50.00', '$484.80')
    + note('Booking Changes:', CHANGES)
    + note('Please note:', 'The $50 deposit is non-refundable. The remaining balance is payable on the day of your event.')
    + invitation()
    + referral('', 'KOKO-612-4821')
    + customer('Sarah Example', 'sarah@example.com', '0412 345 678'),
    'If you have any questions, please contact us with your booking ID.<br><br>See you soon!', FOOT_AUTO)

c_group = wrap(
    header('george-gift-pop.png', 170, 'George popping out of a gift box', "Woohoo! You're booked in! 🎉")
    + intro(badge('Deposit Paid', '#2F8F5B', '#EAF8EF'), 'Your KOKO booking is confirmed!',
            'Hi James, your $50 deposit has been received. Your booking is confirmed. The remaining balance is payable on the day of your event.')
    + details([('Booking ID', '#615'), ('Location', 'Haymarket'), ('Date', '2026-11-14'), ('Booking Time', 'Fri, Nov 14, 2026 14:30 - 17:30'),
               ('Guests', '11'), ('Package', 'Haymarket Package C'), ('Status', 'Deposit Paid', 'color:#2F8F5B;')])
    + addons([('Mahjong - Twin Table', '1 twin room × 2h, approx 3:00pm–5:00pm', '2 × $24.00', '$48.00')])
    + payment('$385.00', '$48.00', '$433.00', '$50.00', '$383.00')
    + note('Booking Changes:', CHANGES)
    + note('Please note:', 'The $50 deposit is non-refundable. The remaining balance is payable on the day of your event.')
    + note('Minimum charge:', 'Group bookings are charged for a minimum of 10 guests. If fewer than 10 guests attend on the day, your booking will still be charged at the 10-guest rate.')
    + referral('', 'KOKO-615-3040')
    + customer('James Example', 'james@example.com', '0498 765 432'),
    'If you have any questions, please contact us with your booking ID.<br><br>See you soon!', FOOT_AUTO)

hold = [('Booking ID', '#618'), ('Location', 'KOKO Amusement Burwood'), ('Date &amp; Time', 'Sat 22 Nov 2026 · 12:00pm – 2:00pm'),
        ('Guests', '12'), ('Package', 'KOKO Party Fun'), ('Total', '$534.80', 'border-top:1px solid #E8DDCC;padding-top:12px;font-weight:900;')]
r1 = wrap(
    header('george-wave.png', 170, 'George waving', "Psst! You're almost there 👋")
    + intro(badge('Not Confirmed Yet'), "Hi Sarah, your KOKO time slot isn't locked in yet",
            "You started a booking but haven't paid the $50 deposit yet, so this time slot is still open to other customers. Pay your deposit soon so no one else books it before you. Your booking details are saved until <strong style='color:#2F241C;'>Fri 14 Nov, 3:15pm</strong>.")
    + details(hold)
    + button('#', 'Complete My Booking'),
    'See you soon,', CONTACT)
r2 = wrap(
    header('george-oh-no.png', 150, 'George with his hands on his head', 'Oh no — only 4 hours left! ⏰', bg='#FBE3E3')
    + intro(badge('Last Chance', '#B8434E', '#FBEADA'), 'Sarah, your KOKO booking expires in 4 hours',
            "This is a final reminder — your time slot still isn't locked in, and other customers can book it at any time. Your saved booking expires at <strong style='color:#2F241C;'>Fri 14 Nov, 3:15pm</strong>; after that you'll need to start a new booking.")
    + details(hold)
    + button('#', 'Complete My Booking Now'),
    'Hope to see you soon,', CONTACT)

open('email-previews/booking-emails-george.html', 'w').write(page('Booking email previews', [
    (('Confirmation · Birthday party', 'Sent: when Stripe payment succeeds (also the staff "Resend confirmation" button). Paid-in-full swaps the deposit wording, as today', "Mia's KOKO Birthday Party Confirmed #612 (unchanged)"), c_party),
    (('Confirmation · Group booking', 'Sent: when Stripe payment succeeds. No invitation block; minimum-charge note, as today', 'KOKO Booking Deposit Confirmation #615 (unchanged)'), c_group),
    (('Reminder 1 · Unpaid booking', 'Sent: 15 min after the customer leaves the booking page without paying', "Your KOKO booking isn't confirmed yet (#618) (unchanged)"), r1),
    (('Reminder 2 · Last chance', 'Sent: 20 h after the booking was started, still unpaid', 'Last chance — your KOKO booking expires in 4 hours (unchanged)'), r2),
]))
print('built')
