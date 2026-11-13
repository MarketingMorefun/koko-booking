"""Assemble the Xano follow-up function + preview endpoint.

python3 build_followups.py TEMPLATES_JSON LAMBDA_JS IMG_BASE CUTOFF_ISO PREVIEW_SECRET_SHA256 OUT_DIR
"""
import json, sys, os
tpl, lam, img, cutoff, secret_hash, out = sys.argv[1:7]
T = {k: v.replace('__IMG__', img) for k, v in json.load(open(tpl)).items()}
keep = ['thank_you_html', 'anniversary_html', 'credit_block', 'referral_block', 'next_year_block']
code = open(lam).read().replace('__TEMPLATES__', json.dumps({k: T[k] for k in keep}, ensure_ascii=False)).replace('__CUTOFF__', cutoff)
assert '"""' not in code
code = '\n'.join('          ' + l if l.strip() else '' for l in code.splitlines())

fn = f'''// Thank-you email (9am Sydney the morning after the visit) and next-year birthday
// reminder (9am, 6 weeks before last year's party date). Runs from RunReminders every
// 5 minutes; RunFollowUps calls it with send = false to preview without sending.
// Skips anyone unsubscribed in Mailchimp. Marks a booking only once Resend accepts the
// email (or when it is skipped), so nothing is sent twice.
function send_followup_emails {{
  input {{
    bool send?
    int force_booking_id?
    text force_kind?
  }}

  stack {{
    var $now_ts {{
      value = "now"|to_timestamp
    }}

    var $since {{
      value = $now_ts|add_ms_to_timestamp:-34560000000
    }}

    db.query bookings {{
      where = ($db.bookings.status == "deposit_paid" || $db.bookings.status == "paid" || $db.bookings.status == "confirmed") && $db.bookings.start_ts > $since && ($db.bookings.thankyou_sent_at == null || $db.bookings.anniversary_sent_at == null)
      return = {{type: "list"}}
    }} as $Bookings

    db.query bookings {{
      where = ($db.bookings.status == "deposit_paid" || $db.bookings.status == "paid" || $db.bookings.status == "confirmed") && $db.bookings.created_at > $since
      return = {{type: "list"}}
      output = ["id", "customer_email", "status", "created_at"]
    }} as $Recent

    db.query customer_credits {{
      where = $db.customer_credits.status == "available"
      return = {{type: "list"}}
      output = ["customer_email", "status"]
    }} as $Credits

    db.query Locations {{
      return = {{type: "list"}}
      output = ["id", "Name", "slug", "is_active"]
    }} as $Locations

    db.query Packages {{
      return = {{type: "list"}}
      output = ["id", "Name"]
    }} as $Packages

    db.query party_rooms {{
      return = {{type: "list"}}
      output = ["Location_id", "is_active"]
    }} as $Rooms

    var $Forced {{
      value = null
    }}

    conditional {{
      if (($input.force_booking_id|first_notnull:0) > 0) {{
        db.get bookings {{
          field_name = "id"
          field_value = $input.force_booking_id
        }} as $Forced
      }}
    }}

    api.lambda {{
      code = """
{code}
        """
      timeout = 10
    }} as $Plan

    var $results {{
      value = []
    }}

    var $dc {{
      value = $env.MC_API_KEY|split:"-"|last
    }}

    var $mc_auth {{
      value = "Authorization: Basic "|concat:("koko:"|concat:$env.MC_API_KEY:""|base64_encode):""
    }}

    foreach ($Plan.due) {{
      each as $Mail {{
        try_catch {{
          try {{
            var $skip {{
              value = $Mail.skip_reason
            }}

            conditional {{
              if ($skip == "") {{
                api.request {{
                  url = "https://"|concat:$dc:""|concat:".api.mailchimp.com/3.0/lists/873666e056/members/":""|concat:($Mail.to|to_lower|md5):""|concat:"?fields=status":""
                  method = "GET"
                  headers = []|push:$mc_auth
                }} as $Member

                conditional {{
                  if ($Member.response.status == 200 && ($Member.response.result.status == "unsubscribed" || $Member.response.result.status == "cleaned")) {{
                    var $skip {{
                      value = "Unsubscribed in Mailchimp"
                    }}
                  }}
                }}
              }}
            }}

            var $outcome {{
              value = "preview"
            }}

            conditional {{
              if ($input.send == true) {{
                conditional {{
                  if ($skip != "") {{
                    var $outcome {{
                      value = "skipped"
                    }}
                  }}

                  else {{
                    api.request {{
                      url = "https://api.resend.com/emails"
                      method = "POST"
                      params = {{
                        from   : "KOKO Amusement <booking@mail.morefun.com.au>"
                        to     : $Mail.to
                        subject: $Mail.subject
                        html   : $Mail.html
                      }}

                      headers = []
                        |push:("Authorization: Bearer "|concat:$env.RESEND_API_KEY:"")
                        |push:"Content-Type: application/json"
                        |push:("Idempotency-Key: koko-followup/"|concat:$Mail.kind:""|concat:"/":""|concat:($Mail.id|to_text):"")
                    }} as $Sent

                    var $outcome {{
                      value = ($Sent.response.status >= 200 && $Sent.response.status < 300) ? "sent" : "failed"
                    }}
                  }}
                }}

                conditional {{
                  if ($outcome == "sent" || $outcome == "skipped") {{
                    conditional {{
                      if ($Mail.kind == "anniversary") {{
                        db.patch bookings {{
                          field_name = "id"
                          field_value = $Mail.id
                          data = {{anniversary_sent_at: $now_ts, followup_skip_reason: $skip}}
                        }} as $Marked
                      }}

                      else {{
                        db.patch bookings {{
                          field_name = "id"
                          field_value = $Mail.id
                          data = {{thankyou_sent_at: $now_ts, followup_skip_reason: $skip}}
                        }} as $Marked
                      }}
                    }}
                  }}
                }}
              }}
            }}

            var $results {{
              value = $results|push:{{id: $Mail.id, kind: $Mail.kind, to: $Mail.to, subject: $Mail.subject, outcome: $outcome, skip_reason: $skip}}
            }}
          }}

          catch {{
            var $results {{
              value = $results|push:{{id: $Mail.id, kind: $Mail.kind, outcome: "error"}}
            }}
          }}
        }}
      }}
    }}
  }}

  response = {{
    checked: $Plan.checked
    results: $results
    rendered: ($input.send == true) ? [] : $Plan.due
  }}
}}
'''

ep = f'''// Preview only: shows which follow-up emails are due (or renders one booking with
// booking_id + kind) without sending anything or marking any booking.
query RunFollowUps verb=POST {{
  api_group = "KOKO Booking"

  input {{
    text secret?
    int booking_id?
    text kind?
  }}

  stack {{
    api.lambda {{
      code = "return crypto.createHash('sha256').update(String($input.secret || '')).digest('hex');"
      timeout = 5
    }} as $SecretHash

    precondition (($env.REMINDER_SECRET != null && $env.REMINDER_SECRET != "" && $input.secret == $env.REMINDER_SECRET) || $SecretHash == "{secret_hash}") {{
      error_type = "accessdenied"
      error = "Unauthorized"
    }}

    function.run send_followup_emails {{
      input = {{
        send            : false
        force_booking_id: $input.booking_id
        force_kind      : $input.kind
      }}
    }} as $Result
  }}

  response = $Result
}}
'''
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'send_followup_emails.txt'), 'w').write(fn)
open(os.path.join(out, 'RunFollowUps.txt'), 'w').write(ep)
print('built', len(fn), len(ep))
