(function(){
const BASE_URL="https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ";
const MIN_ADVANCE_MS=72*60*60*1000;
const DEFAULT_SESSION_MINUTES=30;

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
  booking_notes:""
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
  if(!node) return;
  node.textContent=text || "";
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
    const r=await fetch(BASE_URL + "/GroupAvailability",{
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
  btn.style.background="#F28C28";
  btn.style.border="1px solid #F28C28";
  btn.style.color="#fff";
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
  btn.style.background=selected ? "#D97818" : "#F28C28";
  btn.style.borderColor=selected ? "#D97818" : "#F28C28";
  btn.style.color="#fff";
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
    const r=await fetch(BASE_URL + "/GroupAddons?location_slug=" + encodeURIComponent(window.groupBookingState.location_slug));
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
    const r=await fetch(BASE_URL+"/Availability",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload:{location_slug,date,guests:Number(guests)||10}})});
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

function renderGroupAddonCard(list,addon){
  const addonId=addon.addon_id || addon.id;
  if(!addonId) return;
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
    Object.assign(toggleBtn.style,{width:"auto",padding:"0 18px",minHeight:"40px",borderRadius:"12px",border:"1px solid #F28C28",background:"#FFF7EB",color:"#B86816",fontFamily:"'Maven Pro',Arial,sans-serif",fontSize:"14px",fontWeight:"800",cursor:"pointer"});
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
        toggleBtn.style.background="#FFF7EB";
        toggleBtn.style.borderColor="#F28C28";
        toggleBtn.style.color="#B86816";
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
    const r=await fetch(BASE_URL + "/GroupQuote",{
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
  if(!section.dataset.generatedContact){
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
  if(showNow) show("groupContactSection");
}

function contactError(text){
  const err=$("groupContactError");
  if(err) err.textContent=text;
  msg(text,true);
  return false;
}

function validateGroupContact(){
  const name=val("groupCustomerName");
  const phone=val("groupCustomerPhone").replace(/\s+/g,"");
  const email=val("groupCustomerEmail");
  const notes=val("groupBookingNotes");
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
    booking_notes:notes
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
  const btn=$("groupReviewBtn");
  if(btn){btn.disabled=true;btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Creating booking...";}
  msg("Creating booking...");
  try{
    await ensureGroupQuote();
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
      booking_notes:window.groupBookingState.booking_notes
    };
    const r=await fetch(BASE_URL + "/CreateGroupBooking",{
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
  reviewText("groupReviewLocation",window.groupBookingState.location_slug);
  reviewText("groupReviewDate",window.groupBookingState.date);
  reviewText("groupReviewGuests",window.groupBookingState.guests);
  reviewText("groupReviewTime",window.groupBookingState.selected_slot_label);
  reviewText("groupReviewPackage",window.groupBookingState.selected_package_name);
  reviewText("groupReviewPackageTotal",money(q.package_total_cents));
  reviewText("groupReviewAddonsTotal",money(q.addons_total_cents));
  reviewText("groupReviewGrandTotal",money(q.grand_total_cents));
  reviewText("groupReviewCustomerName",window.groupBookingState.customer_name);
  reviewText("groupReviewCustomerPhone",window.groupBookingState.customer_phone);
  reviewText("groupReviewCustomerEmail",window.groupBookingState.customer_email);
  reviewText("groupReviewBookingNotes",window.groupBookingState.booking_notes || "-");
  reviewText("groupReviewBookingId",bookingId(b) || "-");
}

async function confirmGroupBooking(){
  const booking=window.groupBookingState.booking || {};
  const id=bookingId(booking);
  if(!id){return msg("Please create a booking first.",true);}
  const btn=$("groupConfirmBtn");
  if(btn){btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Redirecting to payment...";}
  msg("Preparing deposit payment...");
  try{
    const payload={booking_id:id,booking:booking};
    const r=await fetch(BASE_URL + "/ConfirmGroupBooking",{
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
    if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Pay deposit";}
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
