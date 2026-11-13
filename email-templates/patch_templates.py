"""Swap the email template strings in Xano scripts.

python3 patch_templates.py TEMPLATES_JSON IMG_BASE IN_DIR OUT_DIR
Reads IN_DIR/{send_booking_confirmation,RunReminders}.txt, writes patched copies to OUT_DIR.
"""
import json, re, sys

tpl_path, img_base, in_dir, out_dir = sys.argv[1:5]
T = {k: v.replace('__IMG__', img_base) for k, v in json.load(open(tpl_path)).items()}

def swap(script, var, new, must_start):
    pat = re.compile(r'(var \$' + re.escape(var) + r' \{\n\s*value = ")(' + re.escape(must_start) + r'[^"\n]*)(")')
    hits = pat.findall(script)
    assert len(hits) == 1, f'{var}: expected 1 template string starting {must_start!r}, found {len(hits)}'
    return pat.sub(lambda m: m.group(1) + new + m.group(3), script)

s = open(f'{in_dir}/send_booking_confirmation.txt').read()
s = swap(s, 'email_html', T['confirmation_email_html'], "<div style='max-width:680px")
s = swap(s, 'addons_block', T['addons_block_open'], "<div style='background:#faf6ee")
s = swap(s, 'invite_block', T['invite_block'], "<div style='background:#FFFDF9")
s = swap(s, 'min_guest_note', T['min_guest_note'], "<div style='background:#FFF7EB")
for lit in [', your $50 deposit has been received. Your booking is confirmed. The remaining balance is payable on the day of your event.',
            '>Deposit Paid<', 'The $50 deposit is non-refundable. The remaining balance is payable on the day of your event.']:
    assert lit in T['confirmation_email_html'], f'paid-in-full replacement target missing: {lit}'
open(f'{out_dir}/send_booking_confirmation.txt', 'w').write(s)

r = open(f'{in_dir}/RunReminders.txt').read()
r = swap(r, 'email_html_1', T['reminder_1_html'], "<div style='max-width:640px")
r = swap(r, 'email_html_2', T['reminder_2_html'], "<div style='max-width:640px")
open(f'{out_dir}/RunReminders.txt', 'w').write(r)
print('patched OK')
