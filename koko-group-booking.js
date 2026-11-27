(function(){
const BASE_URL="https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ";
const DEPOSIT_CENTS=5000;
const SURCHARGE_CENTS=150;
const FULL_FEE_PER_MILLE=18; // 1.8% booking fee when paying in full
const PAYABLE_NOW_CENTS=DEPOSIT_CENTS+SURCHARGE_CENTS;
// Customers never see server wording (Xano, API, JSON...): it goes to the console.
const ERROR_TRY_AGAIN="Something went wrong. Please refresh the page and try again.";
function customerError(text){
  const s=String(text||"");
  if(!/xano|\bapi\b|json|whoa|rate limit|your plan|param:|error_code|error_fatal|failed to fetch|load failed|networkerror|unexpected (token|end)|undefined|is not a function|\(\d{3}\)|booking id not found|payment url|syntaxerror|typeerror/i.test(s))return s;
  console.error("Booking error:",s);
  return ERROR_TRY_AGAIN;
}
// Xano's free plan answers 429 above 10 requests per 20 seconds (for the whole
// site). A 429 is refused before the endpoint runs, so repeating it, even a
// create or confirm, can't do anything twice. Only 429 is retried.
const BUSY_WAITS_MS=[4000,8000,12000];
const BUSY_FINAL="We're very busy right now. Please refresh the page and try again in a moment.";
// A newer search replaces an older one that is still waiting to retry.
const REPLACEABLE=/\/(Availability|GroupAvailability|Quote|GroupQuote|addons|GroupAddons)(\?|$)/;
// Add-on lists, and a quote for exactly the same choices, are reused for a minute.
const CACHEABLE=/\/(addons|GroupAddons|Quote|GroupQuote)(\?|$)/;
const CACHE_MS=60000;
const REPLACED="Replaced by a newer request.";
const _busyWaiting={},_apiCache={};
let _busyCount=0;
function busyNotice(change){
  _busyCount=Math.max(0,_busyCount+change);
  let n=document.getElementById("kokoBusyNotice");
  if(!_busyCount){if(n)n.remove();return;}
  if(n)return;
  n=document.createElement("div");
  n.id="kokoBusyNotice";
  n.setAttribute("role","status");
  n.textContent="We're very busy right now. Trying again automatically, please stay on this page…";
  n.style.cssText="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 18px;border-radius:14px;background:#221D16;color:#fff;font-size:14px;line-height:1.4;font-weight:600;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.25);";
  document.body.appendChild(n);
}
async function apiFetch(url,options){
  const cacheable=CACHEABLE.test(url);
  const cacheKey=url+" "+String(options&&options.body||""),hit=_apiCache[cacheKey];
  if(cacheable&&hit&&Date.now()-hit.at<CACHE_MS)return new Response(hit.text,{status:200,headers:{"Content-Type":"application/json"}});
  const key=REPLACEABLE.test(url)?url.split("?")[0]:"";
  if(key&&_busyWaiting[key])_busyWaiting[key]();
  for(let i=0;;i++){
    const r=await fetch(url,options);
    if(r.status!==429){
      if(cacheable&&r.ok){const copy=await r.clone().text();if(copy.trim()&&copy.indexOf('"error_message":"')<0)_apiCache[cacheKey]={text:copy,at:Date.now()};}
      return r;
    }
    if(i>=BUSY_WAITS_MS.length)return new Response(JSON.stringify({message:BUSY_FINAL,error_message:BUSY_FINAL}),{status:429,headers:{"Content-Type":"application/json"}});
    busyNotice(1);
    let cancel=null;
    try{
      await new Promise(function(resolve,reject){
        const t=setTimeout(resolve,BUSY_WAITS_MS[i]*(1+Math.random()*0.35));
        if(!key)return;
        if(_busyWaiting[key])_busyWaiting[key]();
        cancel=function(){clearTimeout(t);reject(new Error(REPLACED));};
        _busyWaiting[key]=cancel;
      });
    }finally{
      if(cancel&&_busyWaiting[key]===cancel)delete _busyWaiting[key];
      busyNotice(-1);
    }
  }
}
const MIN_ADVANCE_MS=72*60*60*1000;
const DEFAULT_SESSION_MINUTES=30;

// Website cards, PDF and confirmation emails read the same Packages fields.
window.kokoPackageIncludes=function(p){
  if(!p)return [];
  if(Array.isArray(p.features_json)&&p.features_json.length)return p.features_json.slice();
  return [[p.free_play_minutes," mins Game Play"],[p.claw_games,"x Claw & Prize Games"],[p.feature_games,"x Feature Games"],[p.preloaded_tickets," KOKO Tickets"]].filter(function(x){return Number(x[0])>0;}).map(function(x){return x[0]+x[1];});
};
var canonicalPackagesPromise;
window.kokoLoadPackageCatalogue=function(){
  if(!canonicalPackagesPromise){
    canonicalPackagesPromise=apiFetch(BASE_URL+"/BookingPackageCatalogue").then(function(r){if(!r.ok)throw new Error("Package details are unavailable. Please try again.");return r.json();}).then(function(d){if(!Array.isArray(d.packages))throw new Error("Package details are unavailable.");window.kokoPackageCatalogue=d.packages;return d.packages;}).catch(function(e){canonicalPackagesPromise=null;throw e;});
  }
  return canonicalPackagesPromise;
};
function syncCanonicalPackageCards(){
  return window.kokoLoadPackageCatalogue().then(function(packages){
    packages.forEach(function(pkg){
      var card=groupPackageCard(pkg),list=card&&card.querySelector(".pcard-features");
      if(!list)return;
      var items=window.kokoPackageIncludes(pkg);
      if(!items.length)return;
      list.textContent="";
      items.forEach(function(text){var item=document.createElement("div");item.className="pcard-feature";item.textContent="✦ "+text;list.appendChild(item);});
    });
  }).catch(function(e){console.error(e.message);});
}


const LOCATION_NAMES={
  Townhall_614:"Town Hall - 614",
  Hurstville:"Hurstville",
  Hornsby:"Hornsby",
  KOKO_Cityheroes_Hornsby:"KOKO & Cityheroes Hornsby",
  Burwood:"Burwood",
  Haymarket:"Haymarket"
};

const ID_ALIASES={
  groupSlotsSection:["groupSlotsSection"],
  groupPackagesSection:["groupPackagesSection","packageSection"],
  groupAddonsSection:["groupAddonsSection","addonsSection"],
  groupContactSection:["groupContactSection","contactSection"],
  groupReviewSection:["groupReviewSection","reviewSection"],
  groupPackagesWrap:["groupPackagesWrap","packageCardsWrap","packagesList"],
  groupAddonsWrap:["groupAddonsWrap","addonsList"]
};

window.groupBookingState={
  location_slug:"",
  date:"",
  guests:0,
  start_ts:null,
  end_ts:null,
  selected_slot_label:"",
  package_id:null,
  selected_package_name:"",
  available_packages:[],
  available_addons:[],
  addons:[],
  quote:null,
  booking:null,
  customer_name:"",
  customer_phone:"",
  customer_email:"",
  booking_notes:"",
  referral_code:""
};

function ids(id){
  return ID_ALIASES[id] || [id];
}

function $(id){
  const list=ids(id);
  for(let i=0;i<list.length;i++){
    const node=document.getElementById(list[i]);
    if(node) return node;
  }
  return null;
}

function $all(id){
  return ids(id).map(function(x){
    return document.getElementById(x);
  }).filter(Boolean);
}

function val(id){
  const node=$(id);
  return node ? String(node.value || "").trim() : "";
}

function setVal(idList,value){
  for(let i=0;i<idList.length;i++){
    const node=
      $(idList[i]) ||
      document.getElementById(idList[i]) ||
      document.querySelector('[name="'+idList[i]+'"]');
    if(!node) continue;
    node.value=value;
    node.dispatchEvent(new Event("input",{bubbles:true}));
    node.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  }
  return false;
}

function clear(node){
  if(!node) return;
  while(node.firstChild) node.removeChild(node.firstChild);
}

function el(tag,text){
  const node=document.createElement(tag);
  if(text!==undefined && text!==null) node.textContent=String(text);
  return node;
}

function money(cents){
  return "$" + (Number(cents || 0) / 100).toFixed(2);
}

function locName(slug){
  return LOCATION_NAMES[slug] || slug || "this location";
}

function dateNorm(v){
  if(!v) return "";
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    const a=s.split("/");
    return a[2] + "-" + a[1] + "-" + a[0];
  }
  return s;
}

function normText(text){
  return String(text || "")
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function msg(text,isErr){
  const node=$("groupMessage");
  if(!node || text===REPLACED) return;
  node.textContent=(isErr?customerError(text):text) || "";
  node.style.color=isErr ? "#C24B34" : "#2F8F5B";
}

function show(id){
  $all(id).forEach(function(node){
    node.style.display="block";
    node.style.visibility="visible";
    node.style.opacity="1";
  });
}

function hide(id){
  $all(id).forEach(function(node){
    node.style.display="none";
  });
}

function reviewText(id,v){
  const node=$(id);
  if(node) node.textContent=(v===undefined || v===null || v==="") ? "-" : String(v);
}

function scrollToSection(idList,delay){
  setTimeout(function(){
    let target=null;
    for(let i=0;i<idList.length;i++){
      const node=$(idList[i]) || document.getElementById(idList[i]);
      if(node && getComputedStyle(node).display!=="none"){
        target=node;
        break;
      }
    }
    if(!target) return;
    const y=window.pageYOffset + target.getBoundingClientRect().top - 110;
    window.scrollTo({top:Math.max(y,0),behavior:"smooth"});
  },delay || 300);
}

function syncBasics(){
  window.groupBookingState.location_slug=val("groupLocation");
  window.groupBookingState.date=dateNorm(val("groupDate"));
  window.groupBookingState.guests=parseInt(val("groupGuests") || "0",10) || 0;
}

function setupGuestStepper(){
  const g=document.getElementById("groupGuests");
  if(!g||g.parentElement.classList.contains("koko-guest-stepper")) return;
  const wrapper=document.createElement("div");
  wrapper.className="koko-guest-stepper";
  g.parentElement.insertBefore(wrapper,g);
  wrapper.appendChild(g);
  const controls=document.createElement("div");
  controls.className="koko-guest-stepper-controls";
  const minusBtn=document.createElement("button");
  minusBtn.type="button";
  minusBtn.className="koko-guest-stepper-btn";
  minusBtn.textContent="−";
  const plusBtn=document.createElement("button");
  plusBtn.type="button";
  plusBtn.className="koko-guest-stepper-btn is-plus";
  plusBtn.textContent="+";
  const MIN=Number(g.min)||1;
  minusBtn.addEventListener("click",function(){
    const n=parseInt(g.value||String(MIN),10);
    g.value=String(Math.max(MIN,n-1));
    g.dispatchEvent(new Event("input",{bubbles:true}));
    g.dispatchEvent(new Event("change",{bubbles:true}));
  });
  plusBtn.addEventListener("click",function(){
    const n=parseInt(g.value||String(MIN),10);
    g.value=String(n+1);
    g.dispatchEvent(new Event("input",{bubbles:true}));
    g.dispatchEvent(new Event("change",{bubbles:true}));
  });
  controls.appendChild(minusBtn);
  controls.appendChild(plusBtn);
  wrapper.appendChild(controls);
}

function setupDate(){
  const input=$("groupDate");
  if(!input) return;
  const d=new Date(Date.now() + MIN_ADVANCE_MS);
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  if(input.type==="date"){
    input.min=yyyy + "-" + mm + "-" + dd;
  }
}

function isHaymarketLocation(){
  return normText(window.groupBookingState.location_slug).includes("haymarket");
}

function packageListByLocation(){
  if(isHaymarketLocation()){
    return [
      {id:6,package_id:6,name:"Haymarket Package A",package_name:"Haymarket Package A",slug:"haymarket-a",package_slug:"haymarket-a"},
      {id:7,package_id:7,name:"Haymarket Package B",package_name:"Haymarket Package B",slug:"haymarket-b",package_slug:"haymarket-b"},
      {id:8,package_id:8,name:"Haymarket Package C",package_name:"Haymarket Package C",slug:"haymarket-c",package_slug:"haymarket-c"},
      {id:9,package_id:9,name:"Haymarket Package D",package_name:"Haymarket Package D",slug:"haymarket-d",package_slug:"haymarket-d"}
    ];
  }
  return [
    {id:2,package_id:2,name:"KOKO Team Fun 60",package_name:"KOKO Team Fun 60",slug:"koko-team-fun-60",package_slug:"koko-team-fun-60"},
    {id:3,package_id:3,name:"KOKO Team Max 100",package_name:"KOKO Team Max 100",slug:"koko-team-max-100",package_slug:"koko-team-max-100"}
  ];
}

function resetAfterBasicsChange(){
  Object.assign(window.groupBookingState,{
    start_ts:null,
    end_ts:null,
    selected_slot_label:"",
    package_id:null,
    selected_package_name:"",
    available_packages:[],
    available_addons:[],
    addons:[],
    quote:null,
    booking:null
  });
  clear($("groupSlotsWrap"));
  clear($("groupAddonsWrap"));
  resetExistingPackageCards();
  hide("groupPackagesSection");
  hide("groupAddonsSection");
  hide("groupContactSection");
  hide("groupReviewSection");
}

async function loadGroupAvailability(){
  syncBasics();
  const payload={
    location_slug:window.groupBookingState.location_slug,
    date:window.groupBookingState.date,
    guests:window.groupBookingState.guests
  };
  if(!payload.location_slug) return msg("Please select a location.",true);
  if(!payload.date) return msg("Please select a date.",true);
  if(!payload.guests) return msg("Please enter guest count.",true);
  msg("Loading availability...");
  try{
    const r=await apiFetch(BASE_URL + "/GroupAvailability",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({payload:payload})
    });
    const text=await r.text();
    const data=text.trim() ? JSON.parse(text) : null;
    if(!r.ok || !data || data.error_message){
      return msg((data && data.error_message) || "Failed to load availability.",true);
    }
    const packages=packageListByLocation();
    window.groupBookingState.available_packages=packages;
    window.groupBookingState.quote=null;
    window.groupBookingState.booking=null;
    window._kokoGroupAvailData=data;
    renderGroupSlots(data.group_slots || []);
    renderGroupPackages(packages);
    show("groupSlotsSection");
    hide("groupPackagesSection");
    hide("groupAddonsSection");
    hide("groupContactSection");
    hide("groupReviewSection");
    msg("Availability loaded.");
    scrollToSection(["groupSlotsSection"],500);
  }catch(e){
    console.error("Group availability failed:",e);
    msg("Failed to load availability.",true);
  }
}

function slotOrder(slot){
  const min=Number(slot.start_min);
  if(Number.isFinite(min)) return min;
  return Number(slot.start_ts || 0);
}

function slotRangeKey(slot){
  const raw=Number(slot.start_min || 0);
  const mins=((raw % 1440) + 1440) % 1440;
  if(raw>=1320 || mins<360) return "late";
  if(mins<720) return "morning";
  if(mins<1020) return "afternoon";
  return "evening";
}

function slotCols(){
  if(innerWidth<=479) return "repeat(1,minmax(0,1fr))";
  if(innerWidth<=767) return "repeat(2,minmax(0,1fr))";
  if(innerWidth<=991) return "repeat(3,minmax(0,1fr))";
  return "repeat(4,minmax(0,1fr))";
}

function chip(text,accent){
  const node=el("span",text);
  node.className=accent ? "koko-chip is-orange" : "koko-chip";
  return node;
}

function rangeLabel(key){
  if(key==="morning") return "☀️ Morning";
  if(key==="afternoon") return "🌤️ Afternoon";
  if(key==="evening") return "🌙 Evening";
  if(key==="late") return "✨ Late Night";
  return "Available times";
}

function rangeSubLabel(key){
  if(key==="morning") return "Before 12:00";
  if(key==="afternoon") return "12:00 - 17:00";
  if(key==="evening") return "17:00 - 22:00";
  if(key==="late") return "After 22:00";
  return "";
}

function renderGroupSlots(slots){
  const wrap=$("groupSlotsWrap");
  if(!wrap) return;
  clear(wrap);
  if(!slots.length){
    wrap.innerHTML="<div>No slots available for this date.</div>";
    return;
  }
  wrap.style.display="flex";
  wrap.style.flexDirection="column";
  wrap.style.gap="14px";
  wrap.style.width="100%";
  const sorted=slots.slice().sort(function(a,b){
    return slotOrder(a) - slotOrder(b);
  });
  const groups={morning:[],afternoon:[],evening:[],late:[]};
  sorted.forEach(function(slot){
    const key=slotRangeKey(slot);
    if(!groups[key]) groups[key]=[];
    groups[key].push(slot);
  });
  const card=el("div","");
  card.className="koko-time-card";
  const title=el("div",locName(window.groupBookingState.location_slug) + " Group Session");
  title.className="koko-time-title";
  card.appendChild(title);
  const meta=el("div","");
  meta.className="koko-chip-row";
  meta.appendChild(chip((window.groupBookingState.guests || 10) + "+ guests",false));
  meta.appendChild(chip("Group Booking",true));
  card.appendChild(meta);
  const rangeWrap=el("div","");
  rangeWrap.className="koko-time-range-grid";
  const timeWrap=el("div","");
  timeWrap.className="koko-time-slot-grid";
  timeWrap.style.gridTemplateColumns=slotCols();
  function renderTimes(key){
    clear(timeWrap);
    const rangeSlots=groups[key] || [];
    if(!rangeSlots.length){
      timeWrap.style.display="grid";
      const empty=el("div","No times available in this period.");
      empty.style.gridColumn="1 / -1";
      empty.style.padding="14px 16px";
      empty.style.borderRadius="14px";
      empty.style.background="#FAF6EE";
      empty.style.color="#7B6A58";
      empty.style.fontFamily="'Maven Pro',Arial,sans-serif";
      empty.style.fontSize="14px";
      empty.style.fontWeight="700";
      timeWrap.appendChild(empty);
      return;
    }
    rangeSlots.forEach(function(slot){
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="group-slot-btn";
      btn.textContent=slot.start_label;
      btn.addEventListener("click",function(){
        const start=Number(slot.start_ts || 0);
        window.groupBookingState.start_ts=start;
        window.groupBookingState.end_ts=slot.end_ts || (start + DEFAULT_SESSION_MINUTES * 60 * 1000);
        window.groupBookingState.selected_slot_label=slot.start_label;
        window.groupBookingState.package_id=null;
        window.groupBookingState.selected_package_name="";
        window.groupBookingState.addons=[];
        window.groupBookingState.quote=null;
        window.groupBookingState.booking=null;
        wrap.querySelectorAll(".group-slot-btn").forEach(function(x){
          x.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        renderGroupPackages(window.groupBookingState.available_packages || []);
        hide("groupAddonsSection");
        hide("groupContactSection");
        hide("groupReviewSection");
        msg("Selected time: " + window.groupBookingState.selected_slot_label);
        scrollToSection(["groupPackagesSection","packageSection"],350);
      });
      timeWrap.appendChild(btn);
    });
    timeWrap.style.display="grid";
  }
  ["morning","afternoon","evening","late"].forEach(function(key){
    const count=(groups[key] || []).length;
    if(!count) return;
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="koko-time-range-btn";
    btn.innerHTML='<span>'+rangeLabel(key)+'</span><span class="koko-time-range-sub">'+rangeSubLabel(key)+" · "+count+" times</span>";
    btn.addEventListener("click",function(){
      rangeWrap.querySelectorAll(".koko-time-range-btn").forEach(function(x){
        x.classList.remove("is-active");
      });
      btn.classList.add("is-active");
      renderTimes(key);
    });
    rangeWrap.appendChild(btn);
  });
  card.appendChild(rangeWrap);
  card.appendChild(timeWrap);
  wrap.appendChild(card);
}

function packageSlug(pkg){
  return String(pkg.slug || pkg.package_slug || "").trim();
}

function getPackageId(pkg){
  return Number(pkg.package_id || pkg.id || 0);
}

function packageLabel(pkg){
  return pkg.name || pkg.Name || pkg.package_name || pkg.title || pkg.Title || packageSlug(pkg) || "Package";
}

function packageCardIds(pkg){
  const slug=normText(packageSlug(pkg));
  if(slug==="koko team fun 60") return ["packageCardTeamFun60"];
  if(slug==="koko team max 100") return ["packageCardTeamMax100"];
  if(slug==="haymarket a") return ["packageCardHaymarketA"];
  if(slug==="haymarket b") return ["packageCardHaymarketB"];
  if(slug==="haymarket c") return ["packageCardHaymarketC"];
  if(slug==="haymarket d") return ["packageCardHaymarketD"];
  return [];
}

function packageButtonLabel(pkg){
  const slug=normText(packageSlug(pkg));
  if(slug==="koko team fun 60") return "Select KOKO Team Fun 60";
  if(slug==="koko team max 100") return "Select KOKO Team Max 100";
  if(slug==="haymarket a") return "Select Haymarket Package A";
  if(slug==="haymarket b") return "Select Haymarket Package B";
  if(slug==="haymarket c") return "Select Haymarket Package C";
  if(slug==="haymarket d") return "Select Haymarket Package D";
  return "Select " + packageLabel(pkg);
}

function unique(nodes){
  const out=[];
  nodes.forEach(function(node){
    if(node && out.indexOf(node)===-1) out.push(node);
  });
  return out;
}

function groupPackageCandidates(){
  return unique([
    "packageCardTeamFun60",
    "packageCardTeamMax100",
    "packageCardHaymarketA",
    "packageCardHaymarketB",
    "packageCardHaymarketC",
    "packageCardHaymarketD"
  ].map(function(id){
    return document.getElementById(id);
  }).filter(Boolean));
}

function groupPackageCard(pkg){
  const idList=packageCardIds(pkg);
  for(let i=0;i<idList.length;i++){
    const node=document.getElementById(idList[i]);
    if(node) return node;
  }
  return null;
}

function groupPackageButton(card,pkg){
  if(!card) return null;
  let btn=card.querySelector(".group-package-btn");
  if(!btn){
    const buttons=[].slice.call(card.querySelectorAll("button,a,.w-button,input[type='button'],input[type='submit']"));
    btn=buttons.find(function(b){
      return normText(b.value || b.textContent || "").includes("select");
    }) || buttons[buttons.length-1] || null;
  }
  if(!btn){
    btn=document.createElement("button");
    btn.type="button";
    btn.className="w-button group-package-btn";
    card.appendChild(btn);
  }
  btn.classList.add("group-package-btn");
  btn.style.display="block";
  btn.style.visibility="visible";
  btn.style.opacity="1";
  btn.style.width="calc(100% - 32px)";
  btn.style.minHeight="50px";
  btn.style.margin="20px 16px 16px";
  btn.style.padding="0 18px";
  btn.style.borderRadius="14px";
  btn.style.background="#F5D949";
  btn.style.border="2px solid #221D16";
  btn.style.color="#221D16";
  btn.style.fontFamily="'Maven Pro',Arial,sans-serif";
  btn.style.fontSize="16px";
  btn.style.fontWeight="700";
  btn.style.letterSpacing="0";
  btn.style.lineHeight="1.2";
  btn.style.cursor="pointer";
  btn.style.textAlign="center";
  btn.style.boxSizing="border-box";
  return btn;
}

function setPackageButton(btn,label,selected){
  if(!btn) return;
  if(btn.tagName==="INPUT") btn.value=selected ? "Selected" : label;
  else btn.textContent=selected ? "Selected" : label;
  btn.style.display="block";
  btn.style.visibility="visible";
  btn.style.opacity="1";
  btn.style.background=selected ? "#EFC838" : "#F5D949";
  btn.style.borderColor="#221D16";
  btn.style.color="#221D16";
  btn.style.fontSize="16px";
  btn.style.fontWeight="700";
  btn.style.letterSpacing="0";
  btn.style.lineHeight="1.2";
}

function resetExistingPackageCards(){
  groupPackageCandidates().forEach(function(card){
    card.style.display="";
    card.style.visibility="visible";
    card.style.opacity="1";
    card.style.background="";
    card.style.borderColor="";
    const btn=card.querySelector(".group-package-btn,.w-button,button");
    if(btn){
      btn.style.display="block";
      btn.style.visibility="visible";
      btn.style.opacity="1";
    }
  });
}

function layoutPackageCards(cards){
  const visible=unique(cards.filter(Boolean));
  visible.forEach(function(card){
    card.style.display="";
    card.style.visibility="visible";
    card.style.opacity="1";
    card.style.width="100%";
    card.style.maxWidth="100%";
    card.style.minWidth="0";
    card.style.boxSizing="border-box";
  });
  const parents=unique(visible.map(function(card){
    return card.parentElement;
  }).filter(Boolean));
  parents.forEach(function(parent){
    const siblings=visible.filter(function(card){
      return card.parentElement===parent;
    });
    parent.style.display="grid";
    parent.style.gap=innerWidth<=767 ? "18px" : "24px";
    parent.style.alignItems="stretch";
    parent.style.width="100%";
    parent.style.maxWidth="100%";
    parent.style.overflow="visible";
    if(innerWidth<=991){
      parent.style.gridTemplateColumns="1fr";
    }else if(siblings.length===1){
      parent.style.gridTemplateColumns="1fr";
    }else if(siblings.length===2){
      parent.style.gridTemplateColumns="repeat(2,minmax(0,1fr))";
    }else if(siblings.length===3){
      parent.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";
    }else{
      parent.style.gridTemplateColumns="repeat(4,minmax(0,1fr))";
    }
  });
}

function renderExistingGroupPackages(packages){
  const candidates=groupPackageCandidates();
  const matched=packages.map(function(pkg){
    return {pkg:pkg,card:groupPackageCard(pkg)};
  }).filter(function(x){return x.card;});
  if(!matched.length) return false;
  candidates.forEach(function(card){
    card.style.display="none";
    card.style.visibility="hidden";
    card.style.opacity="0";
    card.style.background="";
    card.style.borderColor="";
  });
  matched.forEach(function(item){
    const pkg=item.pkg;
    const card=item.card;
    const btn=groupPackageButton(card,pkg);
    const label=packageButtonLabel(pkg);
    card.style.display="";
    card.style.visibility="visible";
    card.style.opacity="1";
    card.style.background="";
    card.style.borderColor="";
    card.setAttribute("data-group-package-id",String(getPackageId(pkg) || ""));
    card.setAttribute("data-group-package-slug",packageSlug(pkg));
    setPackageButton(btn,label,false);
    btn.onclick=async function(e){
      e.preventDefault();
      if(!window.groupBookingState.start_ts || !window.groupBookingState.end_ts){
        return msg("Please select a time slot first.",true);
      }
      window.groupBookingState.package_id=getPackageId(pkg);
      window.groupBookingState.selected_package_name=packageLabel(pkg);
      window.groupBookingState.addons=[];
      window.groupBookingState.quote=null;
      window.groupBookingState.booking=null;
      matched.forEach(function(other){
        const otherBtn=other.card.querySelector(".group-package-btn,.w-button,button");
        const otherLabel=packageButtonLabel(other.pkg);
        other.card.style.display="";
        other.card.style.visibility="visible";
        other.card.style.opacity="1";
        other.card.style.background="";
        other.card.style.borderColor="";
        setPackageButton(otherBtn,otherLabel,false);
      });
      card.style.display="";
      card.style.visibility="visible";
      card.style.opacity="1";
      card.style.background="#F7F0DB";
      card.style.borderColor="#F2B300";
      setPackageButton(btn,label,true);
      await loadGroupQuote();
      await loadGroupAddons();
      ensureGroupContactSection(true);
      scrollToSection(["groupAddonsSection","addonsSection","groupContactSection","contactSection"],500);
      return false;
    };
  });
  layoutPackageCards(matched.map(function(x){return x.card;}));
  show("groupPackagesSection");
  return true;
}

function renderGroupPackages(packages){
  syncCanonicalPackageCards();
  packages=packages && packages.length ? packages : packageListByLocation();
  const wrap=$("groupPackagesWrap") || $("groupPackagesSection");
  if(renderExistingGroupPackages(packages)) return;
  if(wrap){
    wrap.innerHTML="<div>No package cards found. Please check package card IDs.</div>";
  }
  show("groupPackagesSection");
}

function addonRules(addon){
  let r=addon && (addon.rules_json || addon.rules || addon.rule_json);
  if(!r) return null;
  if(typeof r==="object") return r;
  try{return JSON.parse(r);}catch(e){return null;}
}

function addonOptions(addon){
  const r=addonRules(addon) || {};
  const raw=addon.options || addon.option_list || r.options || r.Options || [];
  if(!Array.isArray(raw)) return [];
  return raw.map(function(o){
    if(typeof o==="string") return {label:o,value:o};
    return {label:o.label || o.name || o.value,value:o.value || o.label || o.name};
  }).filter(function(o){return o.label;});
}

function addonNote(addon){
  const r=addonRules(addon) || {};
  return addon.notes || addon.note || r.Note || r.note || r.description || "";
}

function addonPrice(addon){
  return Number(addon.effective_price_cents || addon.default_price_cents || addon.override_price_cents || 0);
}

function unitName(t){
  return t ? String(t).replace(/_/g," ") : "item";
}

function quoteAddons(){
  return window.groupBookingState.addons.map(function(i){
    const out={addon_id:i.addon_id,qty:i.qty};
    if(i.option) out.option=i.option;
    if(i.option_label) out.option_label=i.option_label;
    return out;
  });
}

async function loadGroupAddons(){
  const section=$("groupAddonsSection");
  let list=$("groupAddonsWrap");
  if(!list && section){
    list=el("div","");
    list.id="groupAddonsWrap";
    section.appendChild(list);
  }
  if(!list) return;
  clear(list);
  if(!window.groupBookingState.location_slug) return;
  try{
    const r=await apiFetch(BASE_URL + "/GroupAddons?location_slug=" + encodeURIComponent(window.groupBookingState.location_slug));
    const text=await r.text();
    const data=text.trim() ? JSON.parse(text) : null;
    if(!r.ok || !data || data.error_message){
      return msg((data && data.error_message) || "Failed to load add-ons.",true);
    }
    const addons=data.addons || [];
    window.groupBookingState.available_addons=addons;
    show("groupAddonsSection");
    ensureGroupContactSection(false);
    if(!addons.length){
      list.appendChild(el("p","No add-ons available for this location."));
      ensureGroupContactSection(true);
      return;
    }
    list.className="koko-addon-grid";
    addons.forEach(function(addon){
      renderGroupAddonCard(list,addon);
    });
    ensureGroupContactSection(true);
  }catch(e){
    console.error("Group add-ons failed:",e);
    msg("Failed to load add-ons.",true);
  }
}

async function checkGroupRoomExtension(roomExtEl){
  if(!roomExtEl) return;
  const{location_slug,date,guests,end_ts}=window.groupBookingState;
  if(!end_ts){roomExtEl.textContent="⚠️ Please select a time slot first.";roomExtEl.style.color="#B86816";return;}
  roomExtEl.textContent="Checking availability...";roomExtEl.style.color="#7B6A58";
  try{
    const r=await apiFetch(BASE_URL+"/Availability",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload:{location_slug,date,guests:Number(guests)||10}})});
    const data=await r.json();
    const roomSlots=data.room_slots||[];
    const extEnd=Number(end_ts)+3600000;
    const anyFree=roomSlots.some(function(r){
      return (r.slots||[]).some(function(s){return Number(s.start_ts)<extEnd&&Number(s.end_ts)>Number(end_ts);});
    });
    if(anyFree){roomExtEl.textContent="✅ The extra hour is available!";roomExtEl.style.color="#2E7D32";}
    else{roomExtEl.textContent="❌ The extra hour is unavailable — no party room at this location can accommodate your group size.";roomExtEl.style.color="#C62828";}
  }catch(e){
    roomExtEl.textContent="⚠️ Could not check availability.";roomExtEl.style.color="#B86816";
  }
}

// ---- Mahjong rooms (Cityheroes mahjong booking system) ----
// Mahjong add-ons ("mahjong-single" / "mahjong-twin") are real rooms in the
// separate Cityheroes mahjong system. The customer picks a start time, hours
// and number of rooms; we only offer as many rooms as that system has free
// for the window. qty = rooms x hours (priced per room per hour). The choice
// travels in the add-on's option ("mj|type=..|rooms=..|hours=..|start=<ms>|game=..")
// and the rooms are actually held there once the deposit is paid
// (reserve_mahjong_rooms in Xano).
const MAHJONG_API="https://x8ki-letl-twmt.n7.xano.io/api:Eq8OZnxt";
const MAHJONG_VENUES={Haymarket:"haymarket",Burwood:"burwood",KOKO_Cityheroes_Hornsby:"hornsby"};
// Tile sets, same codes and wording as the mahjong system. Rooms have a usual
// set but staff can swap tiles, so this doesn't change which rooms are free.
const MAHJONG_GAMES=[["flowers_144","With flowers (144 tiles)"],["no_flowers_136","No flowers (136 tiles)"],["sichuan_108","Sichuan (108 tiles)"]];
const _mahjongAvailability={};
function loadMahjongAvailability(venue,date){
  const key=venue+"|"+date;
  if(!_mahjongAvailability[key]){
    _mahjongAvailability[key]=fetch(MAHJONG_API+"/GetAvailability?venue="+encodeURIComponent(venue)+"&date="+encodeURIComponent(date))
      .then(function(r){return r.json();})
      .catch(function(){delete _mahjongAvailability[key];return null;});
  }
  return _mahjongAvailability[key];
}
function mahjongTime(ts){
  return new Date(ts).toLocaleTimeString("en-AU",{timeZone:"Australia/Sydney",hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
}
function mahjongFreeRooms(data,roomType,startTs,endTs){
  const rooms=(data.rooms||[]).filter(function(r){return r.room_type===roomType;});
  const free=rooms.filter(function(r){
    return !(data.busy||[]).some(function(b){return Number(b.room_id)===Number(r.id)&&Number(b.start_ts)<endTs&&Number(b.end_ts)>startTs;});
  });
  return {free:free.length,total:rooms.length};
}
function renderMahjongAddonCard(list,addon,addonId){
  const roomType=String(addon.slug).indexOf("twin")>-1?"twin":"single";
  const venue=MAHJONG_VENUES[window.groupBookingState.location_slug];
  const date=window.groupBookingState.date;
  const card=el("div","");
  card.className="koko-addon-card";
  const title=el("div",addon.name || "Mahjong");
  title.className="koko-addon-title";
  card.appendChild(title);
  const meta=el("div",money(addonPrice(addon))+" · per room per hour");
  meta.className="koko-addon-meta";
  card.appendChild(meta);
  const note=addonNote(addon);
  if(note){const n=el("div",note);n.className="koko-addon-note";card.appendChild(n);}
  const status=el("div","Checking which rooms are free...");
  status.style.cssText="font-size:13px;font-weight:700;line-height:1.5;color:#7B6A58;font-family:'Maven Pro',Arial,sans-serif;";
  list.appendChild(card);
  if(!venue||!date){status.textContent="Mahjong rooms can't be booked online for this venue.";card.appendChild(status);return;}

  const field=function(label,control){
    const wrap=el("label","");
    wrap.style.cssText="display:grid;gap:4px;font-family:'Maven Pro',Arial,sans-serif;font-size:12px;font-weight:800;color:#7B6A58;text-transform:uppercase;letter-spacing:.04em;";
    wrap.appendChild(el("span",label));
    control.className="koko-addon-select";
    wrap.appendChild(control);
    return wrap;
  };
  const gameSel=document.createElement("select");
  const g0=document.createElement("option");g0.value="";g0.textContent="Choose a style";gameSel.appendChild(g0);
  MAHJONG_GAMES.forEach(function(g){const o=document.createElement("option");o.value=g[0];o.textContent=g[1];gameSel.appendChild(o);});
  const gameField=field("Mahjong style",gameSel);
  gameField.style.marginBottom="10px";
  card.appendChild(gameField);
  const startSel=document.createElement("select");
  const hoursSel=document.createElement("select");
  const grid=el("div","");
  grid.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:10px;";
  grid.appendChild(field("Start time",startSel));
  grid.appendChild(field("Hours",hoursSel));
  card.appendChild(grid);
  card.appendChild(status);
  const row=el("div","");
  row.className="koko-addon-qty";
  const minus=document.createElement("button");minus.type="button";minus.textContent="-";
  const count=el("span","0");
  const plus=document.createElement("button");plus.type="button";plus.textContent="+";
  const roomsLabel=el("span","rooms");
  roomsLabel.style.cssText="font-family:'Maven Pro',Arial,sans-serif;font-size:13px;font-weight:700;color:#7B6A58;align-self:center;";
  row.appendChild(minus);row.appendChild(count);row.appendChild(plus);row.appendChild(roomsLabel);
  card.appendChild(row);

  let data=null,rooms=0,free=0;
  function windowTs(){
    const start=Number(startSel.value||0);
    return {start:start,end:start+Number(hoursSel.value||1)*3600000};
  }
  function sync(){
    count.textContent=String(rooms);
    const idx=window.groupBookingState.addons.findIndex(function(i){return i.addon_id===addonId;});
    if(rooms<=0){if(idx>-1) window.groupBookingState.addons.splice(idx,1);return;}
    const w=windowTs();
    const hours=Number(hoursSel.value||1);
    const game=MAHJONG_GAMES.find(function(g){return g[0]===gameSel.value;});
    const payload={
      addon_id:addonId,
      qty:rooms*hours,
      option:"mj|type="+roomType+"|rooms="+rooms+"|hours="+hours+"|start="+w.start+(game?"|game="+game[0]:""),
      option_label:rooms+" "+roomType+" room"+(rooms>1?"s":"")+" × "+hours+"h, "+mahjongTime(w.start)+"–"+mahjongTime(w.end)+(game?" · "+game[1]:"")
    };
    if(idx>-1) window.groupBookingState.addons[idx]=payload;
    else window.groupBookingState.addons.push(payload);
  }
  function refresh(){
    if(!data) return;
    const w=windowTs();
    const f=mahjongFreeRooms(data,roomType,w.start,w.end);
    free=f.free;
    if(rooms>free) rooms=free;
    if(!f.total) status.textContent="This venue has no "+roomType+" mahjong rooms.";
    else if(!free) status.textContent="No "+roomType+" rooms free "+mahjongTime(w.start)+"–"+mahjongTime(w.end)+" — try another start time.";
    else status.textContent=free+" of "+f.total+" "+roomType+" room"+(f.total>1?"s":"")+" free "+mahjongTime(w.start)+"–"+mahjongTime(w.end)+".";
    status.style.color=free?"#2E7D32":"#B86816";
    sync();
    debouncedGroupQuote();
  }
  function fillHours(){
    const start=Number(startSel.value||0);
    const maxH=Math.max(1,Math.min(6,Math.floor((Number(data.close_ts)-start)/3600000)));
    const keep=Number(hoursSel.value||2);
    hoursSel.innerHTML="";
    for(let h=1;h<=maxH;h++){const o=document.createElement("option");o.value=String(h);o.textContent=h+" hour"+(h>1?"s":"");hoursSel.appendChild(o);}
    hoursSel.value=String(Math.min(keep,maxH));
  }
  startSel.addEventListener("change",function(){fillHours();refresh();});
  hoursSel.addEventListener("change",refresh);
  gameSel.addEventListener("change",function(){sync();});
  minus.addEventListener("click",function(){if(rooms>0){rooms--;refresh();}});
  plus.addEventListener("click",function(){
    if(!gameSel.value){msg("Please choose a mahjong style first.",true);gameSel.focus();return;}
    if(rooms<free){rooms++;refresh();}
    else msg(free?"Only "+free+" "+roomType+" room"+(free>1?"s are":" is")+" free at that time.":"No "+roomType+" rooms are free at that time — try another start time.",true);
  });

  loadMahjongAvailability(venue,date).then(function(d){
    if(!d || d.error_message || d.is_closed || !d.open_ts){status.textContent="Mahjong rooms aren't available on this date.";return;}
    data=d;
    const step=1800000;
    const nowTs=Number(d.now_ts||Date.now());
    const groupStart=Number(window.groupBookingState.start_ts||0);
    let first=Number(d.open_ts);
    while(first<nowTs) first+=step;
    for(let t=first;t+3600000<=Number(d.close_ts);t+=step){
      const o=document.createElement("option");o.value=String(t);o.textContent=mahjongTime(t);startSel.appendChild(o);
    }
    if(!startSel.options.length){status.textContent="Mahjong rooms aren't available on this date.";return;}
    const pick=Array.from(startSel.options).find(function(o){return Number(o.value)>=groupStart;});
    startSel.value=(pick||startSel.options[0]).value;
    fillHours();
    refresh();
  });
}

function renderGroupAddonCard(list,addon){
  const addonId=addon.addon_id || addon.id;
  if(!addonId) return;
  if(String(addon.slug||"").indexOf("mahjong-")===0) return renderMahjongAddonCard(list,addon,addonId);
  let qty=0;
  let selected="";
  const opts=addonOptions(addon);
  const isBilliards=Number(addonId)===2;
  const isPartyRoom=Number(addonId)===7;
  const billiardsMin=isBilliards?Math.max(3,Math.ceil((window.groupBookingState.guests||10)/4)):0;
  const card=el("div","");
  card.className="koko-addon-card";
  const title=el("div",addon.name || "Add-on");
  title.className="koko-addon-title";
  card.appendChild(title);
  const meta=el("div",money(addonPrice(addon)) + " · " + unitName(addon.unit_type));
  meta.className="koko-addon-meta";
  card.appendChild(meta);
  const note=addonNote(addon);
  if(note){
    const node=el("div",note);
    node.className="koko-addon-note";
    card.appendChild(node);
  }
  let select=null;
  if(opts.length){
    select=document.createElement("select");
    select.className="koko-addon-select";
    select.innerHTML='<option value="">Select option</option>';
    opts.forEach(function(o){
      const opt=document.createElement("option");
      opt.value=o.value || o.label;
      opt.textContent=o.label || o.value;
      select.appendChild(opt);
    });
    select.addEventListener("change",async function(){
      selected=select.value;
      if(qty>0){sync();await loadGroupQuote();}
    });
    card.appendChild(select);
  }
  const row=el("div","");
  row.className="koko-addon-qty";
  const minus=document.createElement("button");
  minus.type="button";
  minus.textContent="-";
  const plus=document.createElement("button");
  plus.type="button";
  plus.textContent="+";
  const count=el("span","0");
  function sync(){
    count.textContent=String(qty);
    const idx=window.groupBookingState.addons.findIndex(function(i){return i.addon_id===addonId;});
    if(qty<=0){if(idx>-1) window.groupBookingState.addons.splice(idx,1);return;}
    const payload={addon_id:addonId,qty:qty};
    if(opts.length && selected){
      const found=opts.find(function(o){return String(o.value || o.label)===String(selected);});
      payload.option=selected;
      payload.option_label=found ? (found.label || selected) : selected;
    }
    if(idx>-1) window.groupBookingState.addons[idx]=payload;
    else window.groupBookingState.addons.push(payload);
  }
  minus.addEventListener("click",function(){
    const minQty=isBilliards&&qty>0?billiardsMin:0;
    if(qty>minQty) qty--;
    else if(isBilliards&&qty>0) qty=0;
    sync();
    debouncedGroupQuote();
  });
  plus.addEventListener("click",function(){
    if(opts.length && !selected){
      return msg("Please select an option for " + (addon.name || "this add-on") + ".",true);
    }
    if(isBilliards&&qty===0) qty=billiardsMin;
    else qty++;
    sync();
    debouncedGroupQuote();
  });
  if(isBilliards){
    const hint=el("div","Minimum "+billiardsMin+" tables required (max 4 guests per table)");
    hint.style.cssText="font-size:12px;color:#B86816;font-weight:700;font-family:'Maven Pro',Arial,sans-serif;";
    card.appendChild(hint);
  }
  if(isPartyRoom){
    const guests=window.groupBookingState.guests||0;
    const toggleBtn=document.createElement("button");
    toggleBtn.type="button";
    toggleBtn.className="koko-addon-qty";
    Object.assign(toggleBtn.style,{width:"auto",padding:"0 18px",minHeight:"40px",borderRadius:"12px",border:"2px solid #221D16",background:"#F5D949",color:"#221D16",fontFamily:"'Maven Pro',Arial,sans-serif",fontSize:"14px",fontWeight:"800",cursor:"pointer"});
    const roomExtEl=el("div","");
    Object.assign(roomExtEl.style,{fontSize:"13px",fontWeight:"700",lineHeight:"1.5",marginTop:"4px"});
    const setActive=function(on){
      qty=on?guests:0;
      sync();
      if(on){
        toggleBtn.textContent="✓ Added ("+guests+" guests)";
        toggleBtn.style.background="#E8F5E9";
        toggleBtn.style.borderColor="#2E7D32";
        toggleBtn.style.color="#2E7D32";
        checkGroupRoomExtension(roomExtEl);
      }else{
        toggleBtn.textContent="Add";
        toggleBtn.style.background="#F5D949";
        toggleBtn.style.borderColor="#221D16";
        toggleBtn.style.color="#221D16";
        roomExtEl.textContent="";
      }
      loadGroupQuote();
    };
    setActive(false);
    toggleBtn.addEventListener("click",function(){setActive(qty===0);});
    card.appendChild(toggleBtn);
    card.appendChild(roomExtEl);
  }else{
    row.appendChild(minus);
    row.appendChild(count);
    row.appendChild(plus);
    card.appendChild(row);
  }
  list.appendChild(card);
}

var _groupQuoteTimer=null;
function debouncedGroupQuote(){clearTimeout(_groupQuoteTimer);_groupQuoteTimer=setTimeout(loadGroupQuote,300);}
async function loadGroupQuote(){
  if(!window.groupBookingState.location_slug) return msg("Please select a location first.",true);
  if(!window.groupBookingState.guests) return msg("Please enter guest count first.",true);
  if(!window.groupBookingState.package_id) return msg("Please select a package first.",true);
  msg("Loading quote...");
  try{
    const payload={
      location_slug:window.groupBookingState.location_slug,
      package_id:window.groupBookingState.package_id,
      guests:window.groupBookingState.guests,
      addons:quoteAddons()
    };
    const r=await apiFetch(BASE_URL + "/GroupQuote",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({payload:payload})
    });
    const text=await r.text();
    const data=text.trim() ? JSON.parse(text) : null;
    if(!r.ok || !data || data.error_message){
      return msg((data && data.error_message) || "Failed to load quote.",true);
    }
    window.groupBookingState.quote=data;
    renderQuoteSummary(data);
    ensureGroupContactSection(true);
    msg("Quote loaded.");
    return data;
  }catch(e){
    console.error("Group quote failed:",e);
    msg("Failed to load quote.",true);
    return null;
  }
}

async function ensureGroupQuote(){
  if(window.groupBookingState.quote){return window.groupBookingState.quote;}
  const quote=await loadGroupQuote();
  if(!quote){throw new Error("Quote could not be loaded. Please select your package again.");}
  return quote;
}

function renderQuoteSummary(data){
  reviewText("groupReviewPackageTotal",money(data.package_total_cents));
  reviewText("groupReviewAddonsTotal",money(data.addons_total_cents));
  reviewText("groupReviewGrandTotal",money(data.grand_total_cents));
}

function ensureGroupContactSection(showNow){
  let section=$("groupContactSection");
  if(!section){
    section=el("div","");
    section.id="groupContactSection";
    const addons=$("groupAddonsSection");
    const parent=(addons && addons.parentElement) || (($("groupPackagesSection") || {}).parentElement) || document.body;
    if(addons && addons.nextSibling) parent.insertBefore(section,addons.nextSibling);
    else parent.appendChild(section);
  }
  if(!section.dataset.generatedContact && section.childElementCount===0){
    section.dataset.generatedContact="1";
    section.classList.add("koko-generated-contact");
    section.innerHTML="";
    const step=el("div","STEP 5");
    step.className="koko-generated-step";
    const title=el("h2","Your details");
    title.className="koko-generated-title";
    const sub=el("p","Tell us where to send your booking confirmation.");
    sub.className="koko-generated-sub";
    const grid=el("div","");
    grid.className="koko-generated-form-grid";
    [
      ["groupCustomerName","Full name","Your Full Name","text"],
      ["groupCustomerPhone","Phone","0400000000","tel"],
      ["groupCustomerEmail","Email","you@example.com","email"]
    ].forEach(function(a){
      const wrap=el("label","");
      wrap.className="koko-generated-field-wrap";
      const label=el("span",a[1]);
      label.className="koko-generated-label";
      const input=document.createElement("input");
      input.id=a[0];
      input.type=a[3];
      input.placeholder=a[2];
      input.className="koko-generated-field";
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
    const notesWrap=el("label","");
    notesWrap.className="koko-generated-field-wrap koko-generated-notes-wrap";
    const notesLabel=el("span","Notes");
    notesLabel.className="koko-generated-label";
    const notes=document.createElement("textarea");
    notes.id="groupBookingNotes";
    notes.placeholder="Notes or special requests";
    notes.className="koko-generated-field koko-generated-notes";
    notesWrap.appendChild(notesLabel);
    notesWrap.appendChild(notes);
    grid.appendChild(notesWrap);
    const error=el("div","");
    error.id="groupContactError";
    error.className="koko-generated-error";
    grid.appendChild(error);
    const btn=document.createElement("button");
    btn.id="groupReviewBtn";
    btn.type="button";
    btn.textContent="Review";
    btn.className="koko-generated-review-btn";
    grid.appendChild(btn);
    section.appendChild(step);
    section.appendChild(title);
    section.appendChild(sub);
    section.appendChild(grid);
  }
  ensureMarketingConsent("groupReviewBtn","groupMarketingConsent");
  ensurePromoField("groupReviewBtn");
  if(showNow) show("groupContactSection");
}

function contactError(text){
  const err=$("groupContactError");
  if(err) err.textContent=text;
  msg(text,true);
  return false;
}

// Opt-in marketing consent checkbox, injected just above the Review button
// on the "Your details" step (no Webflow markup needed). Unticked by
// default — consent has to be an active choice.
function ensureMarketingConsent(btnId,inputId){
  if(document.getElementById(inputId))return;
  const btn=document.getElementById(btnId);
  if(!btn||!btn.parentNode)return;
  const wrap=document.createElement("label");
  wrap.className="koko-marketing-consent";
  wrap.style.cssText="display:flex;align-items:flex-start;gap:10px;margin:4px 0 16px;font-family:'Maven Pro',Arial,sans-serif;font-size:14px;line-height:1.45;color:#7B6A58;cursor:pointer;text-align:left;";
  const box=document.createElement("input");
  box.type="checkbox";
  box.id=inputId;
  box.style.cssText="width:18px;height:18px;margin:1px 0 0;flex:0 0 auto;accent-color:#221D16;cursor:pointer;";
  const text=document.createElement("span");
  text.textContent="Yes, send me KOKO news, offers and party ideas by email. You can unsubscribe anytime.";
  wrap.appendChild(box);
  wrap.appendChild(text);
  btn.parentNode.insertBefore(wrap,btn);
}

// ---- Promo code (e.g. BLACKFRIDAY) ----
// Field injected above the Review button, no Webflow markup needed. ?promo=CODE
// in the link prefills it. CheckPromo only previews the discount; CreateGroupBooking
// works it out again and refuses a bad code, so nothing is charged on trust.
let _promoChecked=null;
// Black Friday: every visitor gets the code filled in, whatever link they came from.
// A code we filled in (campaign default or ?promo= link) that does not fit the
// booking is quietly removed instead of blocking it; a typed code still shows errors.
const PROMO_DEFAULT={code:"BLACKFRIDAY",until:1796043600000};// 1 Dec 2026 00:00 Sydney
let _promoAuto=false;
function dropAutoPromo(){
  const i=promoInput(),code=promoValue();
  if(i)i.value="";
  _promoAuto=false;_promoChecked=null;
  promoStatus(code+" doesn't apply to this booking, so we've removed it. You can continue as normal.");
  return true;
}
function promoInput(){return document.getElementById("groupPromoCode")}
function promoValue(){const i=promoInput();return i?i.value.trim().toUpperCase():""}
function promoStatus(text,kind){
  const s=document.getElementById("groupPromoCodeStatus");
  if(!s)return;
  s.textContent=text||"";
  s.style.color=kind==="error"?"#c24b34":kind==="ok"?"#2F8F5B":"#7B6A58";
}
function promoKey(){
  const s=window.groupBookingState;
  return [promoValue(),s.location_slug,s.package_id,Number(s.guests||0)].join("|");
}
function ensurePromoField(btnId){
  if(promoInput())return;
  const btn=document.getElementById(btnId);
  if(!btn||!btn.parentNode)return;
  const wrap=document.createElement("div");
  wrap.className="koko-promo-code";
  wrap.style.cssText="margin:4px 0 16px;font-family:'Maven Pro',Arial,sans-serif;text-align:left;grid-column:1/-1;";
  const label=document.createElement("label");
  label.htmlFor="groupPromoCode";
  label.textContent="Promo code (optional)";
  label.style.cssText="display:block;margin:0 0 6px;font-size:14px;font-weight:800;color:#2F241C;";
  const row=document.createElement("div");
  row.style.cssText="display:flex;gap:10px;align-items:stretch;";
  const input=document.createElement("input");
  input.type="text";
  input.id="groupPromoCode";
  input.autocomplete="off";
  input.maxLength=30;
  input.placeholder="Enter code";
  input.style.cssText="flex:1 1 auto;min-width:0;height:48px;padding:0 14px;border:1px solid #E8DDCC;border-radius:14px;background:#FFFBF5;color:#2F241C;font:inherit;font-size:16px;text-transform:uppercase;box-sizing:border-box;";
  const apply=document.createElement("button");
  apply.type="button";
  apply.id="groupPromoCodeApply";
  apply.textContent="Apply";
  apply.style.cssText="flex:0 0 auto;height:48px;padding:0 22px;border:0;border-radius:14px;background:#221D16;color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer;";
  const status=document.createElement("div");
  status.id="groupPromoCodeStatus";
  status.setAttribute("role","status");
  status.style.cssText="min-height:18px;margin-top:6px;font-size:13px;line-height:1.4;color:#7B6A58;";
  row.appendChild(input);
  row.appendChild(apply);
  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(status);
  btn.parentNode.insertBefore(wrap,document.querySelector(".koko-marketing-consent")&&document.querySelector(".koko-marketing-consent").parentNode===btn.parentNode?document.querySelector(".koko-marketing-consent"):btn);
  input.addEventListener("input",function(){_promoChecked=null;_promoAuto=false;promoStatus("");});
  input.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();e.stopPropagation();applyPromo();}});
  apply.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();applyPromo();});
  const fromLink=(new URLSearchParams(location.search).get("promo")||"").trim().toUpperCase();
  if(/^[A-Z0-9_-]{2,30}$/.test(fromLink)){
    input.value=fromLink;_promoAuto=true;
    promoStatus("Your discount will show on the review step. Can't be combined with other offers.");
  }else if(Date.now()<PROMO_DEFAULT.until){
    input.value=PROMO_DEFAULT.code;_promoAuto=true;
    promoStatus("We've added code "+PROMO_DEFAULT.code+". If your booking qualifies, the discount will show on the review step.");
  }
}
// true = no code, or the code is good for the current choices.
async function applyPromo(){
  const code=promoValue(),s=window.groupBookingState;
  if(!code){_promoChecked=null;promoStatus("");return true;}
  if(_promoChecked===promoKey())return true;
  if(!s.location_slug||!s.package_id||!s.guests){promoStatus("Choose a location, guests and package first.","error");return false;}
  promoStatus("Checking code...");
  try{
    const r=await apiFetch(`${BASE_URL}/CheckPromo`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code,booking_type:"group_booking",location_slug:s.location_slug,package_id:s.package_id,guests:Number(s.guests||0)})});
    const data=await r.json();
    if(code!==promoValue())return false;
    if(!r.ok||!data){promoStatus("We couldn't check this code. Please try again.","error");return false;}
    if(data.ok!==true){if(_promoAuto)return dropAutoPromo();promoStatus((data.message||"This promo code is not valid.")+" Remove the code to continue without it.","error");return false;}
    _promoChecked=promoKey();
    promoStatus("Code applied: "+money(data.discount_cents)+" off your package.","ok");
    return true;
  }catch(e){
    promoStatus("We couldn't check this code. Please try again.","error");
    return false;
  }
}
function discountLabel(reason){
  if(reason==="referral")return"Referral discount";
  if(!reason||reason==="repeat_customer")return"Welcome back discount";
  return"Promo code "+String(reason).replace(/[^A-Za-z0-9_-]/g,"");
}

function validateGroupContact(){
  const name=val("groupCustomerName");
  const phone=val("groupCustomerPhone").replace(/\s+/g,"");
  const email=val("groupCustomerEmail");
  const notes=val("groupBookingNotes");
  const referralCode=val("groupReferralCode").trim();
  const consentBox=document.getElementById("groupMarketingConsent");
  const err=$("groupContactError");
  if(err) err.textContent="";
  if(!name) return contactError("Please enter your full name.");
  if(!phone) return contactError("Please enter your phone number.");
  if(!/^04\d{8}$/.test(phone)) return contactError("Please enter phone as 0400000000.");
  if(!email) return contactError("Please enter your email address.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return contactError("Please enter a valid email address.");
  Object.assign(window.groupBookingState,{
    customer_name:name,
    customer_phone:phone,
    customer_email:email,
    booking_notes:notes,
    referral_code:referralCode,
    marketing_consent:!!(consentBox&&consentBox.checked)
  });
  return true;
}

var _groupBookingInProgress=false;
async function createGroupBooking(){
  if(_groupBookingInProgress) return;
  _groupBookingInProgress=true;
  const _bail=function(m){_groupBookingInProgress=false;return msg(m,true);};
  if(!window.groupBookingState.location_slug) return _bail("Please select a location first.");
  if(!window.groupBookingState.date) return _bail("Please select a date first.");
  if(!window.groupBookingState.guests) return _bail("Please enter guest count first.");
  if(!window.groupBookingState.start_ts || !window.groupBookingState.end_ts) return _bail("Please select a time slot first.");
  if(!window.groupBookingState.package_id) return _bail("Please select a package first.");
  if(!validateGroupContact()){_groupBookingInProgress=false;return;}
  if(!(await applyPromo())) return _bail("Please check your promo code, or remove it to continue.");
  const btn=$("groupReviewBtn");
  if(btn){btn.disabled=true;btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Creating booking...";}
  msg("Creating booking...");
  try{
    await ensureGroupQuote();
    const attribution=window.kokoGetAttribution?window.kokoGetAttribution():{};
    const payload={
      location_slug:window.groupBookingState.location_slug,
      date:window.groupBookingState.date,
      guests:window.groupBookingState.guests,
      package_id:window.groupBookingState.package_id,
      start_ts:window.groupBookingState.start_ts,
      end_ts:window.groupBookingState.addons.some(function(a){return Number(a.addon_id)===7&&Number(a.qty||0)>0;})?Number(window.groupBookingState.end_ts)+3600000:window.groupBookingState.end_ts,
      addons:quoteAddons(),
      customer_name:window.groupBookingState.customer_name,
      customer_phone:window.groupBookingState.customer_phone,
      customer_email:window.groupBookingState.customer_email,
      booking_notes:window.groupBookingState.booking_notes,
      referral_code:window.groupBookingState.referral_code,
      promo_code:promoValue(),
      marketing_consent:window.groupBookingState.marketing_consent===true,
      utm_source:attribution.utm_source,
      utm_medium:attribution.utm_medium,
      utm_campaign:attribution.utm_campaign,
      landing_referrer:attribution.landing_referrer,
      entry_page:attribution.entry_page
    };
    const r=await apiFetch(BASE_URL + "/CreateGroupBooking",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({payload:payload})
    });
    const text=await r.text();
    const data=text.trim() ? JSON.parse(text) : null;
    if(!r.ok || !data || data.error_message){
      return msg((data && data.error_message) || "Failed to create booking.",true);
    }
    window.groupBookingState.booking=data.booking || data;
    renderGroupReview();
    show("groupReviewSection");
    msg("Booking created. Please review and pay your deposit.");
    scrollToSection(["groupReviewSection","reviewSection"],500);
  }catch(e){
    console.error("Create group booking failed:",e);
    msg(e.message || "Failed to create booking.",true);
  }finally{
    _groupBookingInProgress=false;
    if(btn){btn.disabled=false;btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Review";}
  }
}

function bookingId(b){
  return b && (b.booking_id || b.id || b.record_id || null);
}

function renderGroupReview(){
  const q=window.groupBookingState.quote || {};
  const b=window.groupBookingState.booking || {};
  // The booking record (b) is authoritative — it's exactly what
  // CreateGroupBooking computed and saved, and what actually gets
  // charged. The quote (q) is only a pre-booking estimate and can go
  // stale if addons changed after it was fetched; fall back to it only
  // if the booking hasn't come back yet.
  const packageTotalCents=b.package_total_cents!=null?b.package_total_cents:q.package_total_cents;
  const addonsTotalCents=b.addons_total_cents!=null?b.addons_total_cents:q.addons_total_cents;
  const grandTotalCents=b.grand_total_cents!=null?b.grand_total_cents:q.grand_total_cents;
  reviewText("groupReviewLocation",LOCATION_NAMES[window.groupBookingState.location_slug]||window.groupBookingState.location_slug);
  reviewText("groupReviewDate",window.groupBookingState.date);
  reviewText("groupReviewGuests",window.groupBookingState.guests);
  reviewText("groupReviewTime",window.groupBookingState.selected_slot_label);
  reviewText("groupReviewPackage",window.groupBookingState.selected_package_name);
  reviewText("groupReviewPackageTotal",money(packageTotalCents));
  reviewText("groupReviewAddonsTotal",money(addonsTotalCents));
  reviewText("groupReviewGrandTotal",money(grandTotalCents));
  reviewText("groupReviewCustomerName",window.groupBookingState.customer_name);
  reviewText("groupReviewCustomerPhone",window.groupBookingState.customer_phone);
  reviewText("groupReviewCustomerEmail",window.groupBookingState.customer_email);
  reviewText("groupReviewBookingNotes",window.groupBookingState.booking_notes || "-");
  reviewText("groupReviewBookingId",bookingId(b) || "-");
  injectDiscountBanner(b);
  const cBtn=$("groupConfirmBtn");
  if(cBtn){injectPaymentOptions(cBtn);injectSurchargeBreakdown(cBtn);}
  updateGroupPaymentDisplay();
}

// ---- Pay $50 deposit (default) or pay the whole booking now ----
// Deposit adds a $1.50 booking fee; paying in full adds 1.8% of the amount
// (create_booking_checkout rounds the same way). ConfirmGroupBooking charges
// whichever option is sent as payment_option; StripeWebhook records a full
// payment with nothing left to pay on the day.
function groupNetTotalCents(){
  const b=window.groupBookingState.booking || {};
  const q=window.groupBookingState.quote || {};
  const grand=Number(b.grand_total_cents!=null?b.grand_total_cents:(q.grand_total_cents||0));
  return Math.max(grand-Number(b.discount_cents||0),0);
}
function groupPayFull(){
  return window.groupBookingState.payment_option==="full" && groupNetTotalCents()>DEPOSIT_CENTS;
}
function groupDueNowCents(){
  return groupPayFull()?groupNetTotalCents():DEPOSIT_CENTS;
}
function groupFeeCents(){
  return groupPayFull()?Math.round(groupDueNowCents()*FULL_FEE_PER_MILLE/1000):SURCHARGE_CENTS;
}
function groupPayableNowCents(){
  return groupDueNowCents()+groupFeeCents();
}
// The "Deposit due today" / "$50.00" pair is static Webflow text; find it
// once by its original wording and keep a handle so it can be rewritten.
function groupReviewLeaf(role,originalText){
  const sec=$("groupReviewSection");
  if(!sec) return null;
  let el=sec.querySelector('[data-koko-role="'+role+'"]');
  if(el) return el;
  el=Array.from(sec.querySelectorAll("*")).find(function(n){return !n.children.length && (n.textContent||"").trim()===originalText;});
  if(el) el.setAttribute("data-koko-role",role);
  return el || null;
}
function updateGroupPaymentDisplay(){
  const full=groupPayFull();
  const dueLabel=groupReviewLeaf("dueLabel","Deposit due today");
  const dueValue=groupReviewLeaf("dueValue","$50.00");
  if(dueLabel) dueLabel.textContent=full?"Full payment due today":"Deposit due today";
  if(dueValue) dueValue.textContent=money(groupDueNowCents());
  reviewText("groupReviewRemainingBalance",money(full?0:Math.max(groupNetTotalCents()-DEPOSIT_CENTS,0)));
  const box=document.getElementById("kokoGroupSurchargeBreakdown");
  if(box){
    const row=function(label,value,bold){return "<div style=\"display:flex;justify-content:space-between;align-items:center;"+(bold?"font-weight:900;margin-top:8px;padding-top:8px;border-top:1px solid #E8DDCC;":"font-weight:600;color:#7B6A58;margin-bottom:6px;")+"\"><span>"+label+"</span><span>"+value+"</span></div>";};
    box.innerHTML=row(full?"Full payment":"Deposit",money(groupDueNowCents()))+row(full?"Booking fee (1.8%)":"Booking fee",money(groupFeeCents()))+row("Total payable now",money(groupPayableNowCents()),true);
  }
  const btn=$("groupConfirmBtn");
  if(btn) btn.textContent="Pay "+money(groupPayableNowCents());
  const opts=document.getElementById("kokoGroupPayOptions");
  if(opts){
    opts.querySelectorAll("label").forEach(function(l){
      const on=l.querySelector("input").checked;
      l.style.borderColor=on?"#221D16":"#E8DDCC";
      l.style.background=on?"#FFF7D6":"#FFFBF5";
    });
  }
}
function injectPaymentOptions(btn){
  if(!btn||!btn.parentNode)return;
  const old=document.getElementById("kokoGroupPayOptions");
  if(old)old.remove();
  const net=groupNetTotalCents();
  if(net<=DEPOSIT_CENTS){window.groupBookingState.payment_option="deposit";return;}
  if(window.groupBookingState.payment_option!=="full") window.groupBookingState.payment_option="deposit";
  const wrap=document.createElement("div");
  wrap.id="kokoGroupPayOptions";
  wrap.style.cssText="display:grid;gap:10px;margin:0 0 14px;font-family:'Maven Pro',Arial,sans-serif;text-align:left;";
  [
    ["deposit","Pay "+money(DEPOSIT_CENTS)+" deposit now","Remaining "+money(Math.max(net-DEPOSIT_CENTS,0))+" payable on the day"],
    ["full","Pay in full now",money(net)+" + 1.8% booking fee today — nothing left to pay on the day"]
  ].forEach(function(o){
    const label=document.createElement("label");
    label.style.cssText="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:2px solid #E8DDCC;border-radius:14px;cursor:pointer;background:#FFFBF5;";
    const radio=document.createElement("input");
    radio.type="radio";
    radio.name="kokoGroupPayOption";
    radio.value=o[0];
    radio.checked=window.groupBookingState.payment_option===o[0];
    radio.style.cssText="margin:3px 0 0;accent-color:#221D16;flex:0 0 auto;";
    radio.addEventListener("change",function(){window.groupBookingState.payment_option=o[0];updateGroupPaymentDisplay();});
    const text=document.createElement("span");
    text.innerHTML="<span style=\"display:block;font-weight:800;color:#2F241C;font-size:15px;\">"+o[1]+"</span><span style=\"display:block;color:#7B6A58;font-size:13px;margin-top:2px;\">"+o[2]+"</span>";
    label.appendChild(radio);
    label.appendChild(text);
    wrap.appendChild(label);
  });
  btn.parentNode.insertBefore(wrap,btn);
}
function injectDiscountBanner(b){
  const old=document.getElementById("kokoGroupDiscountBanner");
  if(old) old.remove();
  const oldTotal=document.getElementById("kokoGroupDiscountedTotal");
  if(oldTotal) oldTotal.remove();
  const discountCents=Number(b.discount_cents || 0);
  if(discountCents<=0) return;
  const anchor=$("groupReviewGrandTotal");
  if(!anchor||!anchor.parentNode) return;
  const label=discountLabel(b.discount_reason);
  const box=document.createElement("div");
  box.id="kokoGroupDiscountBanner";
  box.style.cssText="margin-top:8px;padding:10px 14px;border-radius:12px;background:#EAF8EF;color:#2F8F5B;font-family:'Maven Pro',Arial,sans-serif;font-size:14px;font-weight:800;display:flex;justify-content:space-between;align-items:center;";
  box.innerHTML="<span>"+label+"</span><span>-"+money(discountCents)+"</span>";
  anchor.parentNode.insertBefore(box,anchor.nextSibling);

  const grandCents=Number(b.grand_total_cents!=null?b.grand_total_cents:(window.groupBookingState.quote||{}).grand_total_cents||0);
  const newTotalCents=Math.max(grandCents-discountCents,0);
  const totalRow=document.createElement("div");
  totalRow.id="kokoGroupDiscountedTotal";
  totalRow.style.cssText="margin-top:8px;padding-top:8px;border-top:1px solid #E8DDCC;font-family:'Maven Pro',Arial,sans-serif;font-size:15px;font-weight:900;color:#2F241C;display:flex;justify-content:space-between;align-items:center;";
  totalRow.innerHTML="<span>Total after discount</span><span>"+money(newTotalCents)+"</span>";
  box.parentNode.insertBefore(totalRow,box.nextSibling);
}
function injectSurchargeBreakdown(btn){
  if(!btn||!btn.parentNode)return;
  const old=document.getElementById("kokoGroupSurchargeBreakdown");
  if(old)old.remove();
  const box=document.createElement("div");
  box.id="kokoGroupSurchargeBreakdown";
  box.style.cssText="margin:0 0 14px;padding:14px 16px;border:1px solid #E8DDCC;border-radius:14px;background:#FFFBF5;font-family:'Maven Pro',Arial,sans-serif;font-size:14px;color:#2F241C;box-sizing:border-box;";
  const row=function(label,value,bold){return "<div style=\"display:flex;justify-content:space-between;align-items:center;"+(bold?"font-weight:900;margin-top:8px;padding-top:8px;border-top:1px solid #E8DDCC;":"font-weight:600;color:#7B6A58;margin-bottom:6px;")+"\"><span>"+label+"</span><span>"+value+"</span></div>";};
  box.innerHTML=row("Deposit",money(DEPOSIT_CENTS))+row("Booking fee",money(SURCHARGE_CENTS))+row("Total payable now",money(PAYABLE_NOW_CENTS),true);
  btn.parentNode.insertBefore(box,btn);
  updateGroupPaymentDisplay();
}

async function confirmGroupBooking(){
  const booking=window.groupBookingState.booking || {};
  const id=bookingId(booking);
  if(!id){return msg("Please create a booking first.",true);}
  const btn=$("groupConfirmBtn");
  if(btn){btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Redirecting to payment...";}
  msg(groupPayFull()?"Preparing full payment...":"Preparing deposit payment...");
  try{
    const payload={booking_id:id,booking:booking,payment_option:groupPayFull()?"full":"deposit"};
    const r=await apiFetch(BASE_URL + "/ConfirmGroupBooking",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({payload:payload})
    });
    const text=await r.text();
    const data=text.trim() ? JSON.parse(text) : null;
    if(!r.ok || !data || data.error_message){
      console.error("ConfirmGroupBooking failed:",data || text);
      msg((data && data.error_message) || (data && data.message) || "Failed to prepare payment.",true);
      return;
    }
    const paymentUrl=data.payment_url || data.checkout_url || data.url || data.stripe_url;
    if(paymentUrl){window.location.assign(paymentUrl);return;}
    console.error("ConfirmGroupBooking returned no payment URL:",data);
    msg("Payment URL not returned.",true);
  }catch(e){
    console.error("Confirm group booking failed:",e);
    msg(e.message || "Failed to prepare payment.",true);
  }finally{
    if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Pay "+money(groupPayableNowCents());}
  }
}

function applyParams(){
  const p=new URLSearchParams(location.search);
  const loc=p.get("location") || p.get("location_slug") || p.get("locationSlug") || p.get("quickLocation") || "";
  const d=dateNorm(p.get("date") || p.get("bookingDate") || p.get("quickDate") || "");
  const g=p.get("guests") || p.get("guest") || p.get("party_size") || p.get("guestCount") || p.get("quickGuests") || "";
  const auto=p.get("auto_check");
  let checked=false;
  function once(){
    if(checked) return;
    let hasLoc=!loc,hasDate=!d,hasGuests=!g;
    if(loc) hasLoc=setVal(["groupLocation","locationSlug","location_slug","location","quickLocation"],loc);
    if(d) hasDate=setVal(["groupDate","bookingDate","date","quickDate"],d);
    if(g) hasGuests=setVal(["groupGuests","guestCount","guests","guest","party_size","quickGuests"],g);
    syncBasics();
    if(loc && d && g && auto==="1" && hasLoc && hasDate && hasGuests){
      checked=true;
      setTimeout(loadGroupAvailability,500);
    }
  }
  [0,300,800,1500,2500,4000].forEach(function(t){setTimeout(once,t);});
}

function init(){
  setupDate();
  setupGuestStepper();
  ensureMarketingConsent("groupReviewBtn","groupMarketingConsent");
  ensurePromoField("groupReviewBtn");
  syncBasics();
  hide("groupSlotsSection");
  hide("groupPackagesSection");
  hide("groupAddonsSection");
  hide("groupContactSection");
  hide("groupReviewSection");
  applyParams();
}

document.addEventListener("change",function(e){
  if(e.target && ["groupLocation","groupDate","groupGuests"].includes(e.target.id)){
    syncBasics();
    resetAfterBasicsChange();
  }
});

document.addEventListener("click",function(e){
  if(e.target.closest("#groupAvailabilityBtn")){e.preventDefault();loadGroupAvailability();return false;}
  if(e.target.closest("#groupReviewBtn")){e.preventDefault();createGroupBooking();return false;}
  if(e.target.closest("#groupConfirmBtn")){e.preventDefault();confirmGroupBooking();return false;}
});

document.addEventListener("submit",function(e){
  const form=e.target;
  if(form && form.querySelector && (form.querySelector("#groupLocation") || form.querySelector("#groupAvailabilityBtn"))){
    e.preventDefault();e.stopPropagation();loadGroupAvailability();return false;
  }
},true);

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",init);
}else{
  init();
}
})();

(function(){
  function makeDateInputFullyClickable(inputId){
    const input=document.getElementById(inputId);
    if(!input || input.type!=="date") return;
    function openPicker(){
      input.focus();
      if(typeof input.showPicker==="function"){
        try{input.showPicker();}catch(e){}
      }
    }
    input.style.cursor="pointer";
    input.addEventListener("click",function(){openPicker();});
    const parent=input.parentElement;
    if(parent){
      parent.style.cursor="pointer";
      parent.addEventListener("click",function(e){
        if(e.target===input) return;
        openPicker();
      });
    }
  }
  function initDatePickerFix(){
    makeDateInputFullyClickable("groupDate");
    makeDateInputFullyClickable("quickDate");
  }
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initDatePickerFix);
  }else{
    initDatePickerFix();
  }
})();
(function () {
  function kokoFindVisibleSection(ids) {
    for (let i = 0; i < ids.length; i += 1) {
      const el = document.getElementById(ids[i]);
      if (!el) continue;

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.height > 0
      ) {
        return el;
      }
    }

    return null;
  }

  function kokoScrollTo(el) {
    if (!el) return;

    setTimeout(function () {
      const headerOffset = 110;
      const rect = el.getBoundingClientRect();
      const targetY = window.pageYOffset + rect.top - headerOffset;

      window.scrollTo({
        top: Math.max(targetY, 0),
        behavior: "smooth"
      });
    }, 120);
  }

  function kokoScrollToWhenReady(ids, delay) {
    setTimeout(function () {
      const el = kokoFindVisibleSection(ids);
      kokoScrollTo(el);
    }, delay || 650);
  }

  function kokoIsPackageSelectClick(target) {
    if (!target) return false;

    const text = String(
      target.textContent ||
      target.value ||
      ""
    ).trim().toLowerCase();

    if (
      text.indexOf("select") !== -1 ||
      text.indexOf("selected") !== -1
    ) {
      const packageArea =
        target.closest("#groupPackagesSection") ||
        target.closest("#packageSection") ||
        target.closest("#groupPackagesWrap") ||
        target.closest("#packageCardsWrap") ||
        target.closest("#packagesList");

      return !!packageArea;
    }

    return false;
  }

  document.addEventListener("click", function (e) {
    const target = e.target;

    if (target.closest("#groupAvailabilityBtn")) {
      kokoScrollToWhenReady(
        ["groupSlotsSection"],
        900
      );
      return;
    }

    if (target.closest(".group-slot-btn")) {
      kokoScrollToWhenReady(
        ["groupPackagesSection", "packageSection"],
        500
      );
      return;
    }

    if (kokoIsPackageSelectClick(target)) {
      kokoScrollToWhenReady(
        ["groupAddonsSection", "addonsSection", "groupContactSection", "contactSection"],
        900
      );
      return;
    }

    if (target.closest("#groupReviewBtn")) {
      kokoScrollToWhenReady(
        ["groupReviewSection", "reviewSection"],
        900
      );
      return;
    }
  }, true);

  document.addEventListener("change", function (e) {
    const target = e.target;

    if (
      target &&
      (
        target.id === "groupLocation" ||
        target.id === "groupDate" ||
        target.id === "groupGuests"
      )
    ) {
      const msg = document.getElementById("groupMessage");
      if (msg) msg.textContent = "";
    }
  }, true);
})();
