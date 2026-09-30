// ============================================================
// Booking marketing consent → Mailchimp.
//
// Separate file in the same Apps Script project as SyncBookings.gs, which
// calls syncConsentedBookingsToMailchimp() at the end of every sync.
// Adds each customer who ticked the marketing-consent box on the booking
// form to the Mailchimp audience, tagged "online booking".
//
// Needs Script Properties (Project Settings → Script Properties) — the
// same two values the membership-form Mailchimp sync already uses:
//   MC_API_KEY  e.g. xxxxxxxx-us21
//   MC_LIST_ID  the audience ID
// Without them this just logs and does nothing.
//
// Each booking is sent once: MC_BOOKING_LAST_ID remembers the highest
// booking ID already handled, and a failed send stops there so it is
// retried next run. Existing contacts keep their subscription status
// (status_if_new) — someone who unsubscribed is never re-subscribed.
// ============================================================

const MC_BOOKING_TAG = "online booking";

function syncConsentedBookingsToMailchimp() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("MC_API_KEY");
  const listId = props.getProperty("MC_LIST_ID");

  if (!apiKey || !listId) {
    Logger.log("Mailchimp booking sync skipped: MC_API_KEY / MC_LIST_ID not set in Script Properties.");
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) return;

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return;

  const headers = values[0];
  const col = function (name) { return headers.indexOf(name); };
  const idCol = col("booking_id");
  const nameCol = col("customer_name");
  const emailCol = col("customer_email");
  const phoneCol = col("customer_phone");
  const storeCol = col("location_name");
  const consentCol = col("marketing_consent");

  if (idCol === -1 || emailCol === -1 || consentCol === -1) {
    Logger.log("Mailchimp booking sync skipped: Booking Master is missing booking_id / customer_email / marketing_consent.");
    return;
  }

  let lastId = Number(props.getProperty("MC_BOOKING_LAST_ID") || 0);

  const pending = values.slice(1)
    .map(function (row) { return { id: Number(row[idCol]), row: row }; })
    .filter(function (item) { return item.id > lastId; })
    .sort(function (a, b) { return a.id - b.id; });

  const dc = apiKey.split("-")[1];
  const base = "https://" + dc + ".api.mailchimp.com/3.0/lists/" + listId + "/members/";
  const auth = "Basic " + Utilities.base64Encode("koko:" + apiKey);
  let sent = 0;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i].row;
    const email = String(row[emailCol] || "").trim().toLowerCase();
    const consented = String(row[consentCol] || "").trim().toLowerCase() === "yes";

    if (consented && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const nameParts = String(nameCol === -1 ? "" : row[nameCol] || "").trim().split(/\s+/);
      const hash = md5Hex(email);

      const mergeFields = {
        FNAME: nameParts[0] || "",
        LNAME: nameParts.slice(1).join(" "),
        PHONE: phoneCol === -1 ? "" : String(row[phoneCol] || ""),
        STORE: storeCol === -1 ? "" : String(row[storeCol] || "")
      };
      const putMember = function (fields) {
        return UrlFetchApp.fetch(base + hash, {
          method: "put",
          contentType: "application/json",
          headers: { Authorization: auth },
          muteHttpExceptions: true,
          payload: JSON.stringify({ email_address: email, status_if_new: "subscribed", merge_fields: fields })
        });
      };

      let upsert = putMember(mergeFields);

      // 400 = Mailchimp rejected the data (usually a phone format it won't
      // take). Retry without the phone; if it's still rejected, skip this
      // one booking rather than blocking everyone after it forever.
      if (upsert.getResponseCode() === 400) {
        delete mergeFields.PHONE;
        upsert = putMember(mergeFields);
      }

      if (upsert.getResponseCode() === 400) {
        Logger.log("Mailchimp rejected booking " + pending[i].id + " (" + email + "), skipped: " + upsert.getContentText());
        lastId = pending[i].id;
        props.setProperty("MC_BOOKING_LAST_ID", String(lastId));
        continue;
      }

      if (upsert.getResponseCode() !== 200) {
        Logger.log("Mailchimp upsert failed for booking " + pending[i].id + ": " + upsert.getResponseCode() + " " + upsert.getContentText() + " — will retry next run.");
        break;
      }

      UrlFetchApp.fetch(base + hash + "/tags", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: auth },
        muteHttpExceptions: true,
        payload: JSON.stringify({ tags: [{ name: MC_BOOKING_TAG, status: "active" }] })
      });

      sent++;
    }

    lastId = pending[i].id;
    props.setProperty("MC_BOOKING_LAST_ID", String(lastId));
  }

  Logger.log("Mailchimp booking sync: " + sent + " contact(s) added/updated, last booking ID " + lastId + ".");
}

function md5Hex(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); })
    .join("");
}
