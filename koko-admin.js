/*
 * koko-admin.js — staff page for birthday-party / group bookings, so day-to-day
 * changes don't need the Xano back office.
 *
 *  - find a booking (name, email, phone, #ID, child's name, referral code),
 *    filter by venue / status / type / date
 *  - change date, time, venue, room, guests, package, contact + party details,
 *    notes, add-ons (tap-to-add buttons, totals update themselves), money
 *    fields (with "Recalculate price" from the live Quote)
 *  - cancel, resend the confirmation email, copy an unpaid booking's payment link
 *  - every save is written to the booking's admin_log (who + what changed)
 *
 * Backend: AdminBookings / AdminUpdateBooking (locked by the ADMIN_KEY Xano
 * workspace variable), plus the existing Quote and ResendConfirmationEmail.
 * Paid bookings that change reach the store calendar and the store's
 * [BOOKING CHANGED]/[BOOKING CANCELLED] email via SyncBookings.gs (hourly).
 *
 * Use: a Webflow page (set to noindex) with one embed:
 *   <div id="kokoAdminRoot"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/MarketingMorefun/koko-booking@<commit>/koko-admin.js"></script>
 * or open koko-admin.html straight from disk.
 */
(function () {
  "use strict";

  var API = "https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ";
  var EP = window.KOKO_ADMIN_ENDPOINTS || { list: "AdminBookings", update: "AdminUpdateBooking" };
  var TZ = "Australia/Sydney";
  var RESUME_URL = "https://booking.morefun.com.au/booking/resume";

  var STATUS = {
    hold:            { label: "Unpaid · on hold",     tone: "unpaid" },
    pending_payment: { label: "Unpaid · at checkout", tone: "unpaid" },
    deposit_paid:    { label: "Deposit paid",         tone: "paid" },
    paid:            { label: "Paid in full",         tone: "paid" },
    confirmed:       { label: "Confirmed (invoice)",  tone: "invoice" },
    cancelled:       { label: "Cancelled",            tone: "cancelled" },
    expired:         { label: "Expired",              tone: "expired" },
    refunded:        { label: "Refunded",             tone: "expired" }
  };
  var STATUS_ORDER = ["deposit_paid", "paid", "confirmed", "hold", "pending_payment", "cancelled", "expired", "refunded"];
  var ACTIVE = { deposit_paid: 1, paid: 1, confirmed: 1 };
  var UNPAID = { hold: 1, pending_payment: 1 };

  var S = {
    key: "", staff: "", data: null, loadedAt: null, open: null,
    f: { q: "", loc: "", status: "active", type: "", when: "upcoming" }
  };

  // ---------- small helpers ----------
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function store(k, v, persist) {
    try {
      if (v == null) { localStorage.removeItem(k); sessionStorage.removeItem(k); return; }
      (persist ? localStorage : sessionStorage).setItem(k, v);
    } catch (_) {}
  }
  function recall(k) {
    try { return localStorage.getItem(k) || sessionStorage.getItem(k) || ""; } catch (_) { return ""; }
  }
  function money(c) {
    var n = Number(c || 0) / 100;
    return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function toCents(v) {
    var s = String(v == null ? "" : v).replace(/[$,\s]/g, "");
    if (s === "") return null;
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : NaN;
  }
  function centsToInput(c) { return c == null || c === "" ? "" : (Number(c) / 100).toFixed(2); }
  function phone(p) {
    var s = String(p == null ? "" : p);
    if (!s || s === "0") return "";
    return s.length === 9 && s[0] === "4" ? "0" + s : s;
  }
  function addons(b) { return Array.isArray(b.addons_json) ? b.addons_json : []; }

  // Sydney wall-clock <-> epoch ms, with no date library.
  function parts(ts) {
    var p = {};
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
  }
  function ymd(ts) { var p = parts(ts); return p.y + "-" + pad(p.m) + "-" + pad(p.d); }
  function hm(ts) { var p = parts(ts); return pad(p.h) + ":" + pad(p.mi); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function sydToEpoch(dateStr, timeStr) {
    var a = dateStr.split("-").map(Number), t = timeStr.split(":").map(Number);
    var want = Date.UTC(a[0], a[1] - 1, a[2], t[0], t[1]), guess = want;
    for (var i = 0; i < 3; i++) {
      var p = parts(guess);
      guess += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    }
    return guess;
  }
  function fmtDay(dateStr) {
    if (!dateStr) return "No date";
    var a = dateStr.split("-").map(Number);
    return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).toLocaleDateString("en-AU", {
      timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }
  function fmtShort(ts) {
    return ts ? new Date(ts).toLocaleString("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
  }
  function bDate(b) { return b.date || (b.start_ts ? ymd(b.start_ts) : ""); }
  function timeRange(b) {
    if (!b.start_ts) return "—";
    return hm(b.start_ts) + (b.end_ts ? "–" + hm(b.end_ts) : "");
  }

  function byId(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (Number(list[i].id) === Number(id)) return list[i];
    return null;
  }
  function locName(id) { var l = byId(S.data.locations, id); return l ? l.Name : (id ? "Venue #" + id : "—"); }
  function roomName(id) { var r = byId(S.data.rooms, id); return r ? r.name : ""; }
  function where(b) {
    var l = locName(b.location_id), r = roomName(b.party_room_id);
    return r && r !== l ? l + " · " + r : l;
  }
  function pkgName(id) { var p = byId(S.data.packages, id); return p ? p.Name : (id ? "Package #" + id : "—"); }
  function typeLabel(t) { return t === "birthday_party" ? "Birthday" : t === "group_booking" || t === "group" ? "Group" : (t || "—"); }

  async function post(path, body) {
    var r = await fetch(API + "/" + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    var text = await r.text(), data;
    try { data = JSON.parse(text); } catch (_) { data = { message: text }; }
    if (!r.ok) throw new Error(data.message || data.error_message || ("Request failed (" + r.status + ")"));
    return data;
  }

  // ---------- styles ----------
  var CSS = "\
.kka{--bg:#FFFDF9;--card:#fff;--line:#E8DDCC;--soft:#faf6ee;--ink:#2F241C;--ink2:#221D16;--mute:#7b6a58;--yellow:#F5D949;--accent:#B86816;--red:#B8434E;\
font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}\
.kka *{box-sizing:border-box}\
.kka button,.kka input,.kka select,.kka textarea{font:inherit;color:inherit}\
.kka-wrap{max-width:1180px;margin:0 auto;padding:20px 16px 80px}\
.kka-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}\
.kka-logo{font-weight:900;font-size:22px;letter-spacing:-.01em}\
.kka-logo span{background:var(--yellow);border:2px solid var(--ink2);border-radius:8px;padding:2px 8px;margin-right:8px}\
.kka-top .kka-sp{flex:1}\
.kka-meta{color:var(--mute);font-size:12px}\
.kka a.kka-btn{text-decoration:none;color:var(--ink)}\
.kka-btn{display:inline-flex;align-items:center;gap:6px;border:2px solid var(--ink2);background:#fff;border-radius:12px;padding:8px 14px;font-weight:800;cursor:pointer;white-space:nowrap}\
.kka-btn:hover{background:var(--soft)}\
.kka-btn:disabled{opacity:.45;cursor:not-allowed}\
.kka-btn.pri{background:var(--yellow);box-shadow:3px 3px 0 var(--ink2)}\
.kka-btn.pri:hover{background:#f8e36d}\
.kka-btn.pri:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink2)}\
.kka-btn.danger{border-color:var(--red);color:var(--red)}\
.kka-btn.ghost{border-color:transparent;background:transparent}\
.kka-btn.sm{padding:5px 10px;font-size:12px;border-radius:10px}\
.kka-filters{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;display:grid;gap:12px;margin-bottom:18px}\
.kka-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}\
.kka-search{flex:1 1 260px;min-width:0;border:2px solid var(--line);border-radius:12px;padding:10px 12px;background:#fff}\
.kka-search:focus,.kka-field input:focus,.kka-field select:focus,.kka-field textarea:focus{outline:none;border-color:var(--ink2)}\
.kka-sel{border:2px solid var(--line);border-radius:12px;padding:9px 10px;background:#fff;max-width:100%}\
.kka-chips{display:flex;gap:6px;flex-wrap:wrap}\
.kka-chip{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-weight:700;font-size:13px;cursor:pointer}\
.kka-chip[aria-pressed=true]{background:var(--ink2);border-color:var(--ink2);color:#fff}\
.kka-chip .n{opacity:.6;font-weight:600;margin-left:4px}\
.kka-day{margin:22px 0 8px;font-weight:900;font-size:15px;display:flex;align-items:center;gap:10px}\
.kka-day small{color:var(--mute);font-weight:600}\
.kka-day.today{color:var(--accent)}\
.kka-list{display:grid;gap:8px}\
.kka-item{display:grid;grid-template-columns:92px 1fr auto;gap:14px;align-items:center;text-align:left;width:100%;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;cursor:pointer}\
.kka-item:hover{border-color:var(--ink2)}\
.kka-time{font-weight:900;font-size:15px}\
.kka-time small{display:block;color:var(--mute);font-weight:600;font-size:12px}\
.kka-who{min-width:0}\
.kka-who b{font-size:15px}\
.kka-who .sub{color:var(--mute);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.kka-right{text-align:right;display:grid;gap:4px;justify-items:end}\
.kka-pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800;white-space:nowrap}\
.kka-pill.paid{background:#E3F1DF;color:#2E6B2A}\
.kka-pill.invoice{background:#E0ECF8;color:#2A5A8C}\
.kka-pill.unpaid{background:#FFF4C2;color:#7A5B00}\
.kka-pill.cancelled{background:#FBE3E5;color:var(--red)}\
.kka-pill.expired{background:#EEEAE4;color:#7b7268}\
.kka-tag{display:inline-block;border:1px solid var(--line);border-radius:6px;padding:0 6px;font-size:11px;font-weight:700;color:var(--mute);margin-left:6px;vertical-align:middle}\
.kka-bal{font-size:12px;color:var(--mute)}\
.kka-empty{text-align:center;color:var(--mute);padding:60px 10px;border:1.5px dashed var(--line);border-radius:18px}\
.kka-login{max-width:400px;margin:12vh auto 0;background:#fff;border:1px solid var(--line);border-radius:24px;padding:30px 26px;display:grid;gap:14px}\
.kka-login h1{margin:0;font-size:24px}\
.kka-login p{margin:0;color:var(--mute)}\
.kka-err{color:var(--red);font-weight:700}\
.kka-field{display:grid;gap:5px;min-width:0}\
.kka-field>span{font-size:12px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}\
.kka-field input,.kka-field select,.kka-field textarea{border:2px solid var(--line);border-radius:10px;padding:9px 10px;background:#fff;width:100%;min-width:0}\
.kka-field textarea{min-height:76px;resize:vertical}\
.kka-field.changed input,.kka-field.changed select,.kka-field.changed textarea{border-color:var(--accent);background:#FFF9EC}\
.kka-check{display:flex;gap:8px;align-items:center;font-weight:600}\
.kka-shade{position:fixed;inset:0;background:rgba(34,29,22,.35);z-index:9998}\
.kka-drawer{position:fixed;top:0;right:0;bottom:0;width:min(640px,100%);background:var(--bg);z-index:9999;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,.15)}\
.kka-dhead{padding:16px 18px;border-bottom:1px solid var(--line);background:#fff;display:flex;gap:12px;align-items:flex-start}\
.kka-dhead h2{margin:0;font-size:19px}\
.kka-dhead .sub{color:var(--mute);font-size:12px;margin-top:3px}\
.kka-dbody{flex:1;overflow:auto;padding:16px 18px 24px;display:grid;gap:14px;align-content:start}\
.kka-dfoot{padding:12px 18px;border-top:1px solid var(--line);background:#fff;display:flex;gap:10px;align-items:center;flex-wrap:wrap}\
.kka-dfoot .kka-sp{flex:1}\
.kka-sec{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:grid;gap:12px}\
.kka-sec h3{margin:0;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}\
.kka-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}\
.kka-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\
.kka-full{grid-column:1/-1}\
.kka-actions{display:flex;gap:8px;flex-wrap:wrap}\
.kka-warn{background:#FFF4C2;border:1px solid #E9D27A;border-radius:12px;padding:10px 12px;font-weight:700;color:#6B5000}\
.kka-note{color:var(--mute);font-size:12px}\
.kka-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:13px}\
.kka-kv dt{color:var(--mute)}\
.kka-kv dd{margin:0;font-weight:700;word-break:break-word}\
.kka-log{white-space:pre-wrap;font-size:12px;background:var(--soft);border-radius:10px;padding:10px;max-height:180px;overflow:auto}\
.kka-addons{display:grid;gap:8px;font-size:13px}\
.kka-ad{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px 10px;border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:#fff}\
.kka-ad-ctl{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px}\
.kka-ad.new{border-color:var(--accent);background:#FFF9EC}\
.kka-ad-name{min-width:0;font-weight:800}\
.kka-ad-name small{display:block;font-weight:600;color:var(--mute)}\
.kka-ad select{border:2px solid var(--line);border-radius:10px;padding:6px 8px;background:#fff;max-width:100%;height:36px}\
.kka-step{display:inline-flex;align-items:center;border:2px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}\
.kka-step button{border:0;background:var(--soft);width:32px;height:32px;font-size:18px;font-weight:800;cursor:pointer;color:var(--ink)}\
.kka-step button:hover{background:var(--yellow)}\
.kka-step input{width:46px;border:0;text-align:center;font-weight:800;font-size:14px;padding:0;-moz-appearance:textfield}\
.kka-step input::-webkit-inner-spin-button{-webkit-appearance:none}\
.kka-ad-total{min-width:70px;text-align:right;font-weight:800}\
.kka-ad-del{border:0;background:transparent;color:var(--red);font-size:16px;cursor:pointer;padding:4px 6px;border-radius:8px}\
.kka-ad-del:hover{background:#fbeaea}\
.kka-adpick{display:flex;flex-wrap:wrap;gap:8px}\
.kka-adbtn{display:inline-flex;align-items:center;gap:6px;border:2px dashed var(--ink2);background:#fff;border-radius:12px;padding:7px 12px;font-weight:800;font-size:13px;cursor:pointer;color:var(--ink)}\
.kka-adbtn:hover{background:var(--yellow);border-style:solid}\
.kka-adbtn span{font-weight:600;color:var(--mute)}\
.kka-adsum{display:flex;justify-content:space-between;font-weight:800;border-top:1px dashed var(--line);padding-top:8px}\
.kka-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--ink2);color:#fff;padding:12px 18px;border-radius:12px;font-weight:700;z-index:10000;max-width:calc(100% - 32px);box-shadow:0 8px 24px rgba(0,0,0,.2)}\
.kka-toast.bad{background:var(--red)}\
@media (max-width:640px){\
.kka-item{grid-template-columns:70px 1fr}\
.kka-right{grid-column:1/-1;justify-items:start;text-align:left;display:flex;gap:8px;align-items:center}\
.kka-grid,.kka-grid3{grid-template-columns:minmax(0,1fr)}\
.kka-dfoot .kka-sp{display:none}\
}";

  // ---------- mount ----------
  var root = document.getElementById("kokoAdminRoot");
  if (!root) { root = document.createElement("div"); root.id = "kokoAdminRoot"; document.body.appendChild(root); }
  root.className = "kka";
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  if (!document.querySelector('meta[name="robots"]')) {
    var m = document.createElement("meta"); m.name = "robots"; m.content = "noindex,nofollow"; document.head.appendChild(m);
  }

  function toast(msg, bad) {
    var t = document.createElement("div");
    t.className = "kka-toast" + (bad ? " bad" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 6000 : 3200);
  }

  // ---------- login ----------
  function renderLogin(err) {
    root.innerHTML =
      '<div class="kka-wrap"><form class="kka-login" id="kkaLogin">' +
      '<div class="kka-logo"><span>KOKO</span>Bookings</div>' +
      "<p>Staff only. Enter the admin key to view and change bookings.</p>" +
      '<label class="kka-field"><span>Your name (for the change log)</span><input id="kkaStaff" autocomplete="name" required value="' + esc(recall("kokoAdminStaff")) + '"></label>' +
      '<label class="kka-field"><span>Admin key</span><input id="kkaKey" type="password" autocomplete="current-password" required></label>' +
      '<label class="kka-check"><input type="checkbox" id="kkaRemember" checked> Remember on this device</label>' +
      (err ? '<div class="kka-err">' + esc(err) + "</div>" : "") +
      '<button class="kka-btn pri" type="submit">Open bookings</button>' +
      "</form></div>";
    root.querySelector("#kkaLogin").addEventListener("submit", function (e) {
      e.preventDefault();
      var remember = root.querySelector("#kkaRemember").checked;
      S.key = root.querySelector("#kkaKey").value.trim();
      S.staff = root.querySelector("#kkaStaff").value.trim();
      store("kokoAdminKey", S.key, remember);
      store("kokoAdminStaff", S.staff, true);
      load();
    });
  }

  async function load(keepOpen) {
    if (!S.data) root.innerHTML = '<div class="kka-wrap"><div class="kka-empty">Loading bookings…</div></div>';
    try {
      var d = await post(EP.list, { key: S.key });
      if (d.error_message) {
        store("kokoAdminKey", null);
        return renderLogin(d.error_message === "Unauthorized" ? "That key didn't work." : d.error_message);
      }
      S.data = d;
      S.loadedAt = Date.now();
      renderApp();
      if (keepOpen && S.open) openBooking(S.open.id);
    } catch (e) {
      if (S.data) toast("Couldn't refresh: " + e.message, true);
      else renderLogin("Couldn't reach Xano: " + e.message);
    }
  }

  // ---------- list ----------
  function matches(b, f, today) {
    if (f.loc && String(b.location_id) !== f.loc) return false;
    if (f.type === "birthday" && b.booking_type !== "birthday_party") return false;
    if (f.type === "group" && b.booking_type === "birthday_party") return false;
    if (f.status === "active" && !ACTIVE[b.status]) return false;
    if (f.status === "unpaid" && !UNPAID[b.status]) return false;
    if (f.status === "closed" && (ACTIVE[b.status] || UNPAID[b.status])) return false;
    var d = bDate(b);
    if (f.when === "upcoming" && d < today) return false;
    if (f.when === "today" && d !== today) return false;
    if (f.when === "week") { if (d < today || d > addDays(today, 7)) return false; }
    if (f.when === "past" && d >= today) return false;
    if (f.q) {
      var q = f.q.toLowerCase().replace(/^#/, "");
      var hay = [b.id, b.customer_name, b.customer_email, phone(b.customer_phone), b.customer_phone, b.birthday_child_name, b.referral_code].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }
  function addDays(dateStr, n) {
    var a = dateStr.split("-").map(Number);
    var d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function renderApp() {
    var locs = (S.data.locations || []).filter(function (l) {
      return l.is_active || S.data.bookings.some(function (b) { return Number(b.location_id) === Number(l.id); });
    });
    root.innerHTML =
      '<div class="kka-wrap">' +
      '<div class="kka-top"><div class="kka-logo"><span>KOKO</span>Bookings</div><div class="kka-sp"></div>' +
      '<span class="kka-meta" id="kkaMeta"></span>' +
      '<button class="kka-btn sm" id="kkaRefresh" type="button">↻ Refresh</button>' +
      '<button class="kka-btn sm ghost" id="kkaOut" type="button">Sign out</button></div>' +
      '<div class="kka-filters">' +
      '<div class="kka-row"><input class="kka-search" id="kkaQ" type="search" placeholder="Search name, email, phone, #ID, child, referral code" value="' + esc(S.f.q) + '">' +
      '<select class="kka-sel" id="kkaLoc"><option value="">All venues</option>' +
      locs.map(function (l) { return '<option value="' + l.id + '"' + (S.f.loc === String(l.id) ? " selected" : "") + ">" + esc(l.Name) + "</option>"; }).join("") +
      "</select>" +
      '<select class="kka-sel" id="kkaType"><option value="">Birthday + group</option><option value="birthday"' + (S.f.type === "birthday" ? " selected" : "") + '>Birthday only</option><option value="group"' + (S.f.type === "group" ? " selected" : "") + ">Group only</option></select></div>" +
      '<div class="kka-row"><div class="kka-chips" id="kkaWhen"></div></div>' +
      '<div class="kka-row"><div class="kka-chips" id="kkaStatus"></div></div>' +
      "</div>" +
      '<div id="kkaList"></div></div>';

    root.querySelector("#kkaRefresh").onclick = function () { load(true); };
    root.querySelector("#kkaOut").onclick = function () { store("kokoAdminKey", null); S.key = ""; S.data = null; renderLogin(); };
    var qT;
    root.querySelector("#kkaQ").addEventListener("input", function (e) {
      clearTimeout(qT); var v = e.target.value;
      qT = setTimeout(function () { S.f.q = v.trim(); renderList(); }, 150);
    });
    root.querySelector("#kkaLoc").onchange = function (e) { S.f.loc = e.target.value; renderList(); };
    root.querySelector("#kkaType").onchange = function (e) { S.f.type = e.target.value; renderList(); };
    renderList();
  }

  function chips(el, key, opts, counts) {
    el.innerHTML = opts.map(function (o) {
      return '<button type="button" class="kka-chip" data-v="' + o[0] + '" aria-pressed="' + (S.f[key] === o[0]) + '">' +
        esc(o[1]) + (counts ? '<span class="n">' + (counts[o[0]] || 0) + "</span>" : "") + "</button>";
    }).join("");
    el.onclick = function (e) {
      var b = e.target.closest("button[data-v]"); if (!b) return;
      S.f[key] = b.getAttribute("data-v"); renderList();
    };
  }

  function renderList() {
    var today = ymd(Date.now());
    var all = S.data.bookings || [];
    // status counts reflect every other filter, so the numbers mean something
    var counts = { active: 0, unpaid: 0, closed: 0, all: 0 };
    all.forEach(function (b) {
      var f = Object.assign({}, S.f, { status: "all" });
      if (!matches(b, f, today)) return;
      counts.all++;
      if (ACTIVE[b.status]) counts.active++; else if (UNPAID[b.status]) counts.unpaid++; else counts.closed++;
    });
    chips(root.querySelector("#kkaWhen"), "when", [["upcoming", "Upcoming"], ["today", "Today"], ["week", "Next 7 days"], ["past", "Past"], ["all", "All dates"]]);
    chips(root.querySelector("#kkaStatus"), "status", [["active", "Booked"], ["unpaid", "Unpaid"], ["closed", "Cancelled / expired"], ["all", "Any status"]], counts);

    var rows = all.filter(function (b) { return matches(b, S.f, today); });
    var asc = S.f.when === "upcoming" || S.f.when === "today" || S.f.when === "week";
    rows.sort(function (a, b) {
      var da = bDate(a), db = bDate(b);
      if (da !== db) return asc ? (da < db ? -1 : 1) : (da < db ? 1 : -1);
      return asc ? (a.start_ts || 0) - (b.start_ts || 0) : (b.start_ts || 0) - (a.start_ts || 0);
    });

    root.querySelector("#kkaMeta").textContent = rows.length + " shown · updated " + new Date(S.loadedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    var list = root.querySelector("#kkaList");
    if (!rows.length) { list.innerHTML = '<div class="kka-empty">No bookings match these filters.</div>'; return; }

    var html = "", last = null, shown = 0, LIMIT = 300;
    rows.slice(0, LIMIT).forEach(function (b) {
      var d = bDate(b);
      if (d !== last) {
        if (last !== null) html += "</div>";
        var n = rows.filter(function (r) { return bDate(r) === d; }).length;
        html += '<div class="kka-day' + (d === today ? " today" : "") + '">' + esc(fmtDay(d)) + (d === today ? " · Today" : "") + " <small>" + n + " booking" + (n === 1 ? "" : "s") + '</small></div><div class="kka-list">';
        last = d;
      }
      var s = STATUS[b.status] || { label: b.status, tone: "expired" };
      var bal = Number(b.balance_due_cents || 0);
      html += '<button type="button" class="kka-item" data-id="' + b.id + '">' +
        '<div class="kka-time">' + esc(b.start_ts ? hm(b.start_ts) : "—") + "<small>#" + b.id + "</small></div>" +
        '<div class="kka-who"><b>' + esc(b.customer_name || "(no name)") + "</b>" +
        (b.birthday_child_name ? ' <span class="kka-note">for ' + esc(b.birthday_child_name) + "</span>" : "") +
        '<span class="kka-tag">' + esc(typeLabel(b.booking_type)) + "</span>" +
        '<div class="sub">' + esc(where(b)) + " · " + esc(b.guests || 0) + " guests · " + esc(pkgName(b.package_id)) + "</div></div>" +
        '<div class="kka-right"><span class="kka-pill ' + s.tone + '">' + esc(s.label) + "</span>" +
        (ACTIVE[b.status] && bal > 0 ? '<span class="kka-bal">' + money(bal) + " due on the day</span>" : "") + "</div></button>";
      shown++;
    });
    html += "</div>";
    if (rows.length > LIMIT) html += '<p class="kka-note" style="text-align:center;margin-top:16px">Showing the first ' + LIMIT + " of " + rows.length + " — narrow the filters or search.</p>";
    list.innerHTML = html;
    list.onclick = function (e) {
      var it = e.target.closest(".kka-item"); if (it) openBooking(it.getAttribute("data-id"));
    };
  }

  // ---------- detail / edit ----------
  function openBooking(id) {
    var b = byId(S.data.bookings, id);
    if (!b) return;
    closeDrawer();
    S.open = b;
    var isParty = b.booking_type === "birthday_party";
    var s = STATUS[b.status] || { label: b.status, tone: "expired" };
    var locOpts = (S.data.locations || []).filter(function (l) { return l.is_active || Number(l.id) === Number(b.location_id); })
      .map(function (l) { return '<option value="' + l.id + '">' + esc(l.Name) + "</option>"; }).join("");
    var pkgOpts = (S.data.packages || []).filter(function (p) {
      return Number(p.id) === Number(b.package_id) || (p.is_active && (isParty ? p.Category === "birthday_party" : p.Category !== "birthday_party"));
    }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.Name) + "</option>"; }).join("");
    var statusOpts = STATUS_ORDER.map(function (k) { return '<option value="' + k + '">' + esc(STATUS[k].label) + "</option>"; }).join("");

    var shade = document.createElement("div"); shade.className = "kka-shade";
    var dr = document.createElement("aside"); dr.className = "kka kka-drawer"; dr.setAttribute("role", "dialog"); dr.setAttribute("aria-label", "Booking #" + b.id);
    dr.innerHTML =
      '<div class="kka-dhead"><div style="flex:1;min-width:0"><h2>#' + b.id + " · " + esc(b.customer_name || "(no name)") + "</h2>" +
      '<div class="sub"><span class="kka-pill ' + s.tone + '">' + esc(s.label) + "</span> &nbsp;" + esc(typeLabel(b.booking_type)) + " · booked " + esc(fmtShort(b.created_at)) + "</div></div>" +
      '<button class="kka-btn sm ghost" data-act="close" type="button" aria-label="Close">✕</button></div>' +
      '<div class="kka-dbody">' +
      '<div class="kka-actions">' +
      '<button class="kka-btn sm" data-act="resend" type="button"' + (ACTIVE[b.status] ? "" : " disabled title=\"Only for paid / confirmed bookings\"") + ">✉ Resend confirmation email</button>" +
      (UNPAID[b.status] ? '<button class="kka-btn sm" data-act="paylink" type="button">🔗 Copy payment link</button>' : "") +
      '<a class="kka-btn sm" href="mailto:' + esc(b.customer_email) + '">Email customer</a>' +
      (phone(b.customer_phone) ? '<a class="kka-btn sm" href="tel:' + esc(phone(b.customer_phone)) + '">Call</a>' : "") +
      (b.status !== "cancelled" ? '<button class="kka-btn sm danger" data-act="cancel" type="button">Cancel booking</button>' : "") +
      "</div>" +

      '<section class="kka-sec"><h3>Party</h3><div class="kka-grid">' +
      fld("location_id", "Venue", '<select>' + locOpts + "</select>") +
      (isParty ? fld("party_room_id", "Room", "<select></select>") : "") +
      fld("date", "Date", '<input type="date">') +
      '<div class="kka-grid" style="gap:10px">' + fld("start", "Start", '<input type="time" step="300">') + fld("end", "End", '<input type="time" step="300">') + "</div>" +
      fld("guests", "Guests", '<input type="number" min="1" step="1">') +
      fld("package_id", "Package", "<select>" + pkgOpts + "</select>") +
      '<div class="kka-full" data-slot="conflict"></div>' +
      "</div></section>" +

      '<section class="kka-sec"><h3>Customer</h3><div class="kka-grid">' +
      fld("customer_name", "Name", "<input>") +
      fld("customer_phone", "Phone", '<input type="tel">') +
      '<div class="kka-full">' + fld("customer_email", "Email", '<input type="email">') + "</div>" +
      (isParty ? fld("birthday_child_name", "Birthday child", "<input>") +
        '<div class="kka-grid" style="gap:10px">' + fld("birthday_child_gender", "Gender", "<input>") + fld("average_age", "Avg. age", "<input>") + "</div>" : "") +
      '<div class="kka-full">' + fld("booking_notes", "Notes", "<textarea></textarea>") + "</div>" +
      "</div></section>" +

      '<section class="kka-sec"><h3>Add-ons</h3><div data-slot="addons"></div></section>' +

      '<section class="kka-sec"><h3>Money</h3><div class="kka-grid3">' +
      fld("package_total_cents", "Package $", '<input inputmode="decimal">') +
      fld("addons_total_cents", "Add-ons $", '<input inputmode="decimal">') +
      fld("grand_total_cents", "Total $", '<input inputmode="decimal">') +
      '<label class="kka-field"><span>Discount</span><input disabled value="' + esc(centsToInput(b.discount_cents || 0)) + '"></label>' +
      fld("deposit_paid_cents", "Paid so far $", '<input inputmode="decimal">') +
      fld("balance_due_cents", "Balance due $", '<input inputmode="decimal">') +
      "</div>" +
      '<div class="kka-actions">' + (isParty ? '<button class="kka-btn sm" data-act="quote" type="button">Recalculate price</button>' : "") +
      '<button class="kka-btn sm" data-act="balance" type="button">Balance = total − discount − paid</button></div>' +
      '<div class="kka-note">Changing money here doesn\'t charge or refund the card — do refunds in Stripe.</div></section>' +

      '<section class="kka-sec"><h3>Status</h3><div class="kka-grid">' + fld("status", "Status", "<select>" + statusOpts + "</select>") + "</div></section>" +

      '<section class="kka-sec"><h3>Details</h3><dl class="kka-kv">' +
      kv("Paid at", fmtShort(b.paid_at)) +
      kv("Confirmation email", b.confirmation_email_sent_at ? fmtShort(b.confirmation_email_sent_at) : "—") +
      kv("Reminders", UNPAID[b.status] || b.reminder_1_sent || b.reminder_2_sent ?
        (b.reminder_skip_reason ? "Skipped — " + b.reminder_skip_reason : [b.reminder_1_sent ? "1st sent" : "1st not sent", b.reminder_2_sent ? "2nd sent" : "2nd not sent"].join(" · ")) : "—") +
      kv("Referral code", b.referral_code || "—") +
      (b.discount_reason ? kv("Discount", money(b.discount_cents) + " · " + b.discount_reason) : "") +
      kv("Came from", [b.utm_source || b.landing_referrer, b.utm_campaign, b.entry_page].filter(Boolean).join(" · ") || "—") +
      kv("Marketing emails", b.marketing_consent ? "Yes" : "No") +
      "</dl>" +
      (b.admin_log ? '<div><div class="kka-note" style="margin-bottom:4px">Change history</div><div class="kka-log">' + esc(b.admin_log) + "</div></div>" : "") +
      "</section>" +
      "</div>" +
      '<div class="kka-dfoot">' +
      '<label class="kka-check" data-slot="emailopt"><input type="checkbox" data-f="email_after"> Email the customer the updated confirmation</label>' +
      '<div class="kka-sp"></div>' +
      '<button class="kka-btn" data-act="close" type="button">Close</button>' +
      '<button class="kka-btn pri" data-act="save" type="button" disabled>Save changes</button></div>';

    document.body.appendChild(shade);
    document.body.appendChild(dr);
    S.drawer = dr; S.shade = shade;
    document.documentElement.style.overflow = "hidden";

    // initial values
    var orig = snapshot(b);
    S.orig = orig;
    setVal("location_id", orig.location_id);
    if (isParty) fillRooms(orig.location_id, orig.party_room_id);
    ["date", "start", "end", "guests", "package_id", "customer_name", "customer_phone", "customer_email",
      "birthday_child_name", "birthday_child_gender", "average_age", "booking_notes", "status"].forEach(function (k) { setVal(k, orig[k]); });
    ["package_total_cents", "addons_total_cents", "grand_total_cents", "deposit_paid_cents", "balance_due_cents"].forEach(function (k) { setVal(k, centsToInput(orig[k])); });
    S.ad = addons(b).map(function (a) { return Object.assign({}, a); });
    S.adOrig = adKey(S.ad);
    orig.addons = adSummary(S.ad);
    renderAddons();

    shade.onclick = tryClose;
    dr.addEventListener("click", function (e) {
      var a = e.target.closest("[data-act]"); if (!a || a.disabled) return;
      var act = a.getAttribute("data-act");
      if (act === "close") tryClose();
      else if (act === "save") save();
      else if (act === "resend") resend(b);
      else if (act === "paylink") copyPayLink(b);
      else if (act === "cancel") cancelBooking(b);
      else if (act === "quote") recalc(b);
      else if (act === "balance") recalcBalance(b);
      else if (act === "ad-add") addAddon(Number(a.getAttribute("data-id")));
      else if (act === "ad-inc" || act === "ad-dec") stepAddon(Number(a.getAttribute("data-i")), act === "ad-inc" ? 1 : -1);
      else if (act === "ad-del") { S.ad.splice(Number(a.getAttribute("data-i")), 1); addonsChanged(); }
    });
    var lastStart = orig.start;
    dr.addEventListener("input", onEdit);
    dr.addEventListener("change", function (e) {
      var f = fieldOf(e.target);
      if (f === "location_id" && isParty) fillRooms(getVal("location_id"), null);
      if (f === "location_id") renderAddons();
      if (f === "guests" && S.ad.some(function (x) { return x.unit_type === "per_person"; })) addonsChanged();
      var ai = e.target.getAttribute("data-ad-qty"), ao = e.target.getAttribute("data-ad-opt");
      if (ai != null) { S.ad[+ai].qty = Math.max(1, Math.round(Number(e.target.value) || 1)); addonsChanged(); }
      if (ao != null) {
        var line = S.ad[+ao], o = e.target.options[e.target.selectedIndex];
        line.option = o.value; line.option_label = o.textContent; addonsChanged();
      }
      if (f === "start" && lastStart && getVal("end") && getVal("start")) {
        // keep the party length when the start time moves
        var delta = toMin(getVal("start")) - toMin(lastStart);
        setVal("end", fromMin(toMin(getVal("end")) + delta));
      }
      if (f === "start") lastStart = getVal("start");
      onEdit();
    });
    document.addEventListener("keydown", escClose);
    onEdit();
  }

  function fld(name, label, control) {
    return '<label class="kka-field" data-field="' + name + '"><span>' + esc(label) + "</span>" + control.replace(/^<(\w+)/, '<$1 data-f="' + name + '"') + "</label>";
  }
  function kv(k, v) { return "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>"; }
  function el(name) { return S.drawer && S.drawer.querySelector('[data-f="' + name + '"]'); }
  function getVal(name) { var e = el(name); return e ? (e.type === "checkbox" ? e.checked : e.value) : undefined; }
  function setVal(name, v) { var e = el(name); if (e) e.value = v == null ? "" : v; }
  function fieldOf(t) { return t && t.getAttribute && t.getAttribute("data-f"); }
  function toMin(t) { var a = String(t).split(":").map(Number); return a[0] * 60 + a[1]; }
  function fromMin(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }

  function fillRooms(locId, selected) {
    var sel = el("party_room_id"); if (!sel) return;
    var rooms = (S.data.rooms || []).filter(function (r) {
      return Number(r.Location_id) === Number(locId) && (r.is_active || Number(r.id) === Number(selected));
    });
    sel.innerHTML = rooms.length ? rooms.map(function (r) {
      return '<option value="' + r.id + '">' + esc(r.name) + " (" + r.capacity_min + "–" + r.capacity_max + ")</option>";
    }).join("") : '<option value="0">No party room at this venue</option>';
    if (selected != null && rooms.some(function (r) { return Number(r.id) === Number(selected); })) sel.value = String(selected);
  }

  function snapshot(b) {
    return {
      location_id: String(b.location_id || ""), party_room_id: String(b.party_room_id || "0"),
      date: bDate(b), start: b.start_ts ? hm(b.start_ts) : "", end: b.end_ts ? hm(b.end_ts) : "",
      guests: String(b.guests || ""), package_id: String(b.package_id || ""),
      customer_name: b.customer_name || "", customer_phone: phone(b.customer_phone), customer_email: b.customer_email || "",
      birthday_child_name: b.birthday_child_name || "", birthday_child_gender: b.birthday_child_gender || "",
      average_age: b.average_age || "", booking_notes: b.booking_notes || "", status: b.status || "",
      package_total_cents: b.package_total_cents || 0, addons_total_cents: b.addons_total_cents || 0,
      grand_total_cents: b.grand_total_cents || 0, deposit_paid_cents: b.deposit_paid_cents || 0, balance_due_cents: b.balance_due_cents || 0
    };
  }

  var LABELS = {
    location_id: "Venue", party_room_id: "Room", date: "Date", start: "Start", end: "End", guests: "Guests", package_id: "Package",
    customer_name: "Name", customer_phone: "Phone", customer_email: "Email", birthday_child_name: "Child", birthday_child_gender: "Gender",
    average_age: "Avg age", booking_notes: "Notes", status: "Status", package_total_cents: "Package price", addons_total_cents: "Add-ons price",
    grand_total_cents: "Total", deposit_paid_cents: "Paid", balance_due_cents: "Balance", addons: "Add-ons"
  };
  var MONEY = { package_total_cents: 1, addons_total_cents: 1, grand_total_cents: 1, deposit_paid_cents: 1, balance_due_cents: 1 };

  function changes() {
    var o = S.orig, out = {};
    Object.keys(LABELS).forEach(function (k) {
      var e = el(k); if (!e) return;
      var v = e.value;
      if (MONEY[k]) {
        var c = toCents(v);
        if (c === null) c = 0;
        if (c !== Number(o[k] || 0)) out[k] = c;
      } else if (String(v).trim() !== String(o[k]).trim()) out[k] = String(v).trim();
    });
    if (S.ad && adKey(S.ad) !== S.adOrig) out.addons = adSummary(S.ad);
    return out;
  }

  function display(k, v) {
    if (MONEY[k]) return money(v);
    if (k === "location_id") return locName(v);
    if (k === "party_room_id") return roomName(v) || "—";
    if (k === "package_id") return pkgName(v);
    if (k === "status") return (STATUS[v] || {}).label || v;
    if (k === "addons") return v || "none";
    if (k === "booking_notes") return v ? "“" + (v.length > 40 ? v.slice(0, 40) + "…" : v) + "”" : "(empty)";
    return v === "" ? "(empty)" : v;
  }

  function onEdit() {
    if (!S.drawer) return;
    var ch = changes();
    Object.keys(LABELS).forEach(function (k) {
      var w = S.drawer.querySelector('[data-field="' + k + '"]');
      if (w) w.classList.toggle("changed", k in ch);
    });
    var bad = Object.keys(ch).some(function (k) { return MONEY[k] && isNaN(ch[k]); });
    var btn = S.drawer.querySelector('[data-act="save"]');
    var n = Object.keys(ch).length;
    btn.disabled = !n || bad;
    btn.textContent = n ? "Save " + n + " change" + (n === 1 ? "" : "s") : "Save changes";

    // offer to email the customer when something they'd care about changed
    var b = S.open, ask = ACTIVE[(ch.status || b.status)] && ["location_id", "party_room_id", "date", "start", "end", "guests", "package_id", "grand_total_cents", "balance_due_cents", "addons"].some(function (k) { return k in ch; });
    var opt = S.drawer.querySelector('[data-slot="emailopt"]');
    opt.style.display = ask ? "" : "none";
    if (!ask) el("email_after").checked = false;
    else if (!opt.dataset.touched) el("email_after").checked = true;
    el("email_after").onchange = function () { opt.dataset.touched = "1"; };

    renderConflict();
  }

  function renderConflict() {
    var slot = S.drawer.querySelector('[data-slot="conflict"]');
    var b = S.open;
    if (b.booking_type !== "birthday_party") { slot.innerHTML = ""; return; }
    var room = Number(getVal("party_room_id") || 0), d = getVal("date"), s = getVal("start"), e = getVal("end");
    var msgs = [];
    if (d && s && e && room) {
      var st = sydToEpoch(d, s), en = sydToEpoch(d, e);
      if (en <= st) msgs.push("End time is before the start time.");
      var now = Date.now();
      S.data.bookings.forEach(function (o) {
        if (Number(o.id) === Number(b.id) || Number(o.party_room_id) !== room || !o.start_ts || !o.end_ts) return;
        var live = ACTIVE[o.status] || o.status === "pending_payment" || (o.status === "hold" && Number(o.hold_expires_at_ts) > now);
        if (live && o.start_ts < en && o.end_ts > st) {
          msgs.push("Clashes with #" + o.id + " " + (o.customer_name || "") + " (" + timeRange(o) + ", " + ((STATUS[o.status] || {}).label || o.status) + ").");
        }
      });
    }
    var g = Number(getVal("guests") || 0), r = byId(S.data.rooms, room);
    if (r && g && (g > r.capacity_max)) msgs.push(roomName(room) + " fits up to " + r.capacity_max + " guests.");
    slot.innerHTML = msgs.length ? '<div class="kka-warn">⚠ ' + msgs.map(esc).join("<br>⚠ ") + "</div>" : "";
  }

  function tryClose() {
    if (S.drawer && Object.keys(changes()).length && !confirm("Discard your unsaved changes?")) return;
    closeDrawer();
  }
  function closeDrawer() {
    if (S.drawer) { S.drawer.remove(); S.shade.remove(); }
    S.drawer = S.shade = null; S.open = null;
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") tryClose(); }

  async function save() {
    var b = S.open, ch = changes();
    if (!Object.keys(ch).length) return;
    var body = { key: S.key, booking_id: b.id };
    var log = [], clear = [];
    Object.keys(ch).forEach(function (k) {
      log.push(LABELS[k] + " " + display(k, S.orig[k]) + " → " + display(k, ch[k]));
    });
    // date + times are saved together as the booking's date / start_ts / end_ts
    if ("date" in ch || "start" in ch || "end" in ch) {
      var d = getVal("date"), s = getVal("start"), e = getVal("end");
      if (!d || !s || !e) return toast("Date, start and end are all needed.", true);
      var st = sydToEpoch(d, s), en = sydToEpoch(d, e);
      if (en <= st) return toast("End time must be after the start time.", true);
      body.date = d; body.start_ts = st; body.end_ts = en;
    }
    ["location_id", "party_room_id", "package_id", "guests"].forEach(function (k) { if (k in ch) body[k] = Number(ch[k]); });
    ["customer_name", "customer_phone", "customer_email", "status"].forEach(function (k) {
      if (k in ch) {
        if (!ch[k]) { toast(LABELS[k] + " can't be empty.", true); body = null; }
        else if (body) body[k] = ch[k];
      }
    });
    if (!body) return;
    ["birthday_child_name", "birthday_child_gender", "average_age", "booking_notes"].forEach(function (k) {
      if (k in ch) { if (ch[k] === "") clear.push(k); else body[k] = ch[k]; }
    });
    Object.keys(MONEY).forEach(function (k) { if (k in ch) body[k] = ch[k]; });
    if ("addons" in ch) body.addons_json = JSON.stringify(S.ad.map(function (x) { x.line_total_cents = adLineTotal(x); return x; }));
    if (clear.length) body.clear = clear.join(",");
    body.log_line = (S.staff ? "[" + S.staff + "] " : "") + log.join("; ");

    if (ch.status === "cancelled" && !confirm("Cancel booking #" + b.id + "? This doesn't refund the deposit — do that in Stripe.")) return;
    var emailAfter = getVal("email_after") && S.drawer.querySelector('[data-slot="emailopt"]').style.display !== "none";

    var btn = S.drawer.querySelector('[data-act="save"]');
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      var r = await post(EP.update, body);
      if (r.error_message) throw new Error(r.error_message);
      replaceBooking(r.booking);
      var msg = "Saved #" + b.id + ".";
      if (emailAfter) {
        try {
          var m = await post("ResendConfirmationEmail", { payload: { booking_id: b.id } });
          if (m.error_message) throw new Error(m.error_message);
          msg += " Updated confirmation emailed to " + r.booking.customer_email + ".";
        } catch (e2) { toast("Saved, but the email didn't send: " + e2.message, true); }
      }
      toast(msg);
      renderList();
      openBooking(b.id);
    } catch (e) {
      toast("Couldn't save: " + e.message, true);
      onEdit();
    }
  }

  function replaceBooking(nb) {
    if (!nb) return;
    var list = S.data.bookings;
    for (var i = 0; i < list.length; i++) if (Number(list[i].id) === Number(nb.id)) { list[i] = nb; return; }
    list.push(nb);
  }

  async function resend(b) {
    if (!confirm("Send the confirmation email for #" + b.id + " to " + b.customer_email + " again?")) return;
    try {
      var r = await post("ResendConfirmationEmail", { payload: { booking_id: b.id } });
      if (r.error_message) throw new Error(r.message || r.error_message);
      toast("Confirmation email sent to " + b.customer_email + ".");
    } catch (e) { toast("Didn't send: " + e.message, true); }
  }

  function copyPayLink(b) {
    var url = RESUME_URL + "?booking_id=" + b.id + "&type=" + (b.booking_type === "birthday_party" ? "party" : "group");
    var done = function () { toast("Payment link copied — paste it to the customer."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    else prompt("Copy this link:", url);
  }

  async function cancelBooking(b) {
    if (!confirm("Cancel booking #" + b.id + " for " + (b.customer_name || "this customer") + "?\n\nThis doesn't refund the deposit — do that in Stripe.")) return;
    try {
      var r = await post(EP.update, { key: S.key, booking_id: b.id, status: "cancelled", log_line: (S.staff ? "[" + S.staff + "] " : "") + "Cancelled" });
      if (r.error_message) throw new Error(r.error_message);
      replaceBooking(r.booking);
      toast("Booking #" + b.id + " cancelled.");
      renderList();
      openBooking(b.id);
    } catch (e) { toast("Couldn't cancel: " + e.message, true); }
  }

  async function recalc(b) {
    var loc = byId(S.data.locations, getVal("location_id"));
    var body = { payload: {
      location_slug: loc ? loc.slug : "", package_id: Number(getVal("package_id")), guests: Number(getVal("guests")),
      addons: S.ad.map(function (a) { return { addon_id: Number(a.addon_id), qty: Number(a.qty || 0) }; })
    } };
    try {
      var q = await post("Quote", body);
      if (q.error_message) throw new Error(q.error_message);
      setVal("package_total_cents", centsToInput(q.package_total_cents));
      // add-ons back to today's venue price (the quote uses the same list)
      var cat = adCatalog();
      S.ad.forEach(function (x) {
        var c = cat.filter(function (d) { return d.id === Number(x.addon_id); })[0];
        if (c) x.unit_price_cents = c.price;
      });
      addonsChanged();
      toast("Price updated from today's price list — check it, then Save.");
    } catch (e) { toast("Couldn't get a price: " + e.message, true); }
  }

  // ---------- add-ons ----------
  var UNIT = { per_person: "per guest", per_hour: "per hour", per_table: "per table", per_card: "per card", per_room: "per room", per_item: "each" };

  function adRules(a) {
    var r = a && a.rules_json;
    if (!r) return {};
    if (typeof r === "string") { try { return JSON.parse(r); } catch (_) { return {}; } }
    if (Array.isArray(r.options)) return r;
    if (typeof r.rules_json === "string" && r.rules_json.trim()) { try { return JSON.parse(r.rules_json); } catch (_) {} }
    return r;
  }
  function adOptions(def) {
    return (adRules(def).options || []).filter(function (o) { return o && o.is_active !== false; });
  }
  // What this venue sells, at this venue's price.
  function adCatalog() {
    var loc = Number(getVal("location_id") || (S.open && S.open.location_id));
    var isParty = S.open && S.open.booking_type === "birthday_party";
    var defs = S.data.addons || [];
    return (S.data.location_addons || []).filter(function (la) {
      return Number(la.location_id) === loc && la.is_active;
    }).map(function (la) {
      var d = byId(defs, la.addon_id);
      if (!d || !d.is_active) return null;
      if (d.booking_type === "birthday_party" && !isParty) return null;
      if (d.booking_type === "group" && isParty) return null;
      var price = Number(la.default_price_cents || 0) || Math.round(Number(la.price || 0) * 100);
      return { id: Number(d.id), name: d.name, slug: d.slug || "", unit: d.unit_type || "per_item", price: price, options: adOptions(d) };
    }).filter(Boolean);
  }
  function adLineTotal(x) {
    var unit = Number(x.unit_price_cents || 0);
    return x.unit_type === "per_person" ? unit * (Number(getVal("guests")) || Number(S.open.guests) || 0) : unit * Math.max(1, Number(x.qty) || 1);
  }
  function adKey(list) {
    return JSON.stringify(list.map(function (x) { return [Number(x.addon_id), Number(x.qty) || 0, x.option || "", Number(x.unit_price_cents) || 0]; }));
  }
  function adSummary(list) {
    return list.map(function (x) {
      return (x.addon_name || "Add-on #" + x.addon_id) + (x.option_label ? " (" + x.option_label + ")" : "") + (x.unit_type === "per_person" ? "" : " ×" + (x.qty || 1));
    }).join(", ");
  }

  function renderAddons() {
    var slot = S.drawer && S.drawer.querySelector('[data-slot="addons"]');
    if (!slot) return;
    var cat = adCatalog(), was = JSON.parse(S.adOrig || "[]");
    var rows = S.ad.map(function (x, i) {
      var def = byId(S.data.addons || [], x.addon_id), opts = adOptions(def);
      var isNew = !was.some(function (w) { return w[0] === Number(x.addon_id) && w[1] === (Number(x.qty) || 0) && w[2] === (x.option || ""); });
      var optSel = opts.length ? '<select data-ad-opt="' + i + '" aria-label="Option">' +
        (x.option && !opts.some(function (o) { return o.value === x.option; }) ? '<option value="' + esc(x.option) + '">' + esc(x.option_label || x.option) + "</option>" : "") +
        opts.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === x.option ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("") + "</select>" : "";
      var qty = x.unit_type === "per_person"
        ? '<span class="kka-note">× ' + esc(getVal("guests") || S.open.guests || 0) + " guests</span>"
        : '<span class="kka-step"><button type="button" data-act="ad-dec" data-i="' + i + '" aria-label="One less">−</button>' +
          '<input type="number" min="1" step="1" inputmode="numeric" data-ad-qty="' + i + '" value="' + esc(x.qty || 1) + '" aria-label="Quantity">' +
          '<button type="button" data-act="ad-inc" data-i="' + i + '" aria-label="One more">+</button></span>';
      var mj = /mahjong/i.test((def && def.slug) || x.addon_name || "")
        ? '<div class="kka-note" style="grid-column:1/-1">Changing this here doesn\'t book or move the CityHeroes mahjong room — do that in the mahjong system.</div>' : "";
      return '<div class="kka-ad' + (isNew ? " new" : "") + '"><div class="kka-ad-name">' + esc(x.addon_name || "Add-on #" + x.addon_id) +
        "<small>" + money(x.unit_price_cents) + " " + esc(UNIT[x.unit_type] || "") + (!opts.length && x.option_label ? " · " + esc(x.option_label) : "") + (x.allergy_note ? " · " + esc(x.allergy_note) : "") + "</small></div>" +
        '<span class="kka-ad-total">' + money(adLineTotal(x)) + "</span>" +
        '<button type="button" class="kka-ad-del" data-act="ad-del" data-i="' + i + '" aria-label="Remove ' + esc(x.addon_name || "") + '">✕</button>' +
        '<div class="kka-ad-ctl">' + optSel + qty + "</div>" + mj + "</div>";
    }).join("");
    var total = S.ad.reduce(function (t, x) { return t + adLineTotal(x); }, 0);
    slot.innerHTML =
      (S.ad.length ? '<div class="kka-addons">' + rows + '<div class="kka-adsum"><span>Add-ons total</span><span>' + money(total) + "</span></div></div>"
        : '<div class="kka-note">No add-ons yet.</div>') +
      '<div style="margin-top:12px"><div class="kka-note" style="margin-bottom:6px">Tap to add</div><div class="kka-adpick">' +
      (cat.length ? cat.map(function (c) {
        return '<button type="button" class="kka-adbtn" data-act="ad-add" data-id="' + c.id + '">+ ' + esc(c.name) + " <span>" + money(c.price) + (c.unit === "per_item" ? "" : " " + esc(UNIT[c.unit] || "")) + "</span></button>";
      }).join("") : '<span class="kka-note">This venue has no add-ons set up.</span>') +
      "</div></div>";
  }

  function addAddon(id) {
    var c = adCatalog().filter(function (d) { return d.id === id; })[0];
    if (!c) return;
    // same add-on without a choice to make → just one more
    var same = !c.options.length && S.ad.filter(function (x) { return Number(x.addon_id) === id; })[0];
    if (same && c.unit !== "per_person") same.qty = (Number(same.qty) || 1) + 1;
    else if (!same) {
      var o = c.options[0];
      S.ad.push({ addon_id: id, addon_name: c.name, qty: 1, unit_type: c.unit, unit_price_cents: c.price, line_total_cents: 0,
        option: o ? o.value : null, option_label: o ? o.label : null, allergy_note: null });
    }
    addonsChanged();
  }
  function stepAddon(i, d) {
    var x = S.ad[i]; if (!x) return;
    x.qty = Math.max(1, (Number(x.qty) || 1) + d);
    addonsChanged();
  }
  // Add-on list changed → redraw it and roll the new add-on price into the totals.
  function addonsChanged() {
    renderAddons();
    var adTotal = S.ad.reduce(function (t, x) { return t + adLineTotal(x); }, 0);
    setVal("addons_total_cents", centsToInput(adTotal));
    setVal("grand_total_cents", centsToInput((toCents(getVal("package_total_cents")) || 0) + adTotal));
    recalcBalance(S.open, true);
  }

  function recalcBalance(b, quiet) {
    var total = toCents(getVal("grand_total_cents")) || 0, paid = toCents(getVal("deposit_paid_cents")) || 0;
    setVal("balance_due_cents", centsToInput(Math.max(0, total - Number(b.discount_cents || 0) - paid)));
    onEdit();
  }

  // ---------- boot ----------
  S.key = recall("kokoAdminKey");
  S.staff = recall("kokoAdminStaff");
  if (S.key) load(); else renderLogin();
})();
