/*
 * koko-attribution.js
 *
 * Captures where a booking came from — marketing channel (UTM params /
 * referrer) and which page of the site the customer entered the funnel on
 * (homepage widget, /parties widget, or straight onto a booking page) — and
 * stores it for the rest of the session so CreateBooking/CreateGroupBooking
 * can save it on the booking row.
 *
 * Paste this on every page in the booking funnel: the homepage, /parties,
 * /booking/birthday-party and /booking/group — ideally as early as possible
 * (before koko-booking.js / koko-group-booking.js) so it captures the true
 * landing page/referrer before any redirect between them. If pasted
 * site-wide instead (e.g. in the site's global custom code), it still only
 * writes once per browser tab session, so that's safe too.
 *
 * First-touch attribution: the first page a visitor lands on this session
 * wins and is kept through the whole flow (including the redirect from the
 * homepage/parties quick-booking widgets into the full booking pages),
 * UNLESS the current URL carries its own utm_* params, e.g. a fresh ad
 * click — those always take over, since that's a deliberate new visit.
 */
(function(){
  var STORAGE_KEY="koko_attribution";

  function labelEntryPage(pathname){
    if(pathname==="/"||pathname==="")return "homepage_widget";
    if(pathname.indexOf("/parties")===0)return "parties_widget";
    if(pathname.indexOf("/booking/birthday-party")===0)return "birthday_direct";
    if(pathname.indexOf("/booking/group")===0)return "group_direct";
    return pathname;
  }

  function classifyReferrer(ref){
    if(!ref)return "direct";
    var host="";
    try{host=new URL(ref).hostname.replace(/^www\./,"")}catch(e){return "direct"}
    if(!host)return "direct";
    if(host.indexOf("morefun.com.au")>-1||host.indexOf("webflow.io")>-1)return "internal";
    if(host.indexOf("google")>-1)return "google";
    if(host.indexOf("facebook")>-1||host.indexOf("fb.com")>-1)return "facebook";
    if(host.indexOf("instagram")>-1)return "instagram";
    if(host.indexOf("bing")>-1)return "bing";
    if(host.indexOf("xiaohongshu")>-1||host.indexOf("xhscdn")>-1)return "xiaohongshu";
    return host;
  }

  function captureNow(){
    var params;
    try{params=new URLSearchParams(window.location.search)}catch(e){params=null}
    var get=function(k){return (params&&params.get(k))||""};
    return {
      utm_source     : get("utm_source"),
      utm_medium     : get("utm_medium"),
      utm_campaign   : get("utm_campaign"),
      landing_referrer: classifyReferrer(document.referrer),
      entry_page     : labelEntryPage(window.location.pathname)
    };
  }

  function init(){
    var existing=null;
    try{existing=JSON.parse(sessionStorage.getItem(STORAGE_KEY))}catch(e){}
    var fresh=captureNow();
    var hasFreshUtm=!!(fresh.utm_source||fresh.utm_medium||fresh.utm_campaign);
    if(!existing||hasFreshUtm){
      try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(fresh))}catch(e){}
    }
  }

  init();

  window.kokoGetAttribution=function(){
    try{
      var raw=sessionStorage.getItem(STORAGE_KEY);
      if(raw)return JSON.parse(raw);
    }catch(e){}
    return captureNow();
  };
})();
