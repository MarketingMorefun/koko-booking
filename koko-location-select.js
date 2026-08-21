/* Custom dropdown styling for native <select> fields.
   Paste inside a <script> tag in Webflow "Before </body>" OR an HTML Embed.
   - select WITH "multiple"  -> multi-select (checkbox list, comma-joined value)
   - select WITHOUT "multiple" -> single-select
   Styles every <select> on the page automatically. */

(function(){
  var CSS = [
    ".koko-loc-wrap{position:relative;width:100%;font-family:'Maven Pro',Arial,sans-serif;}",
    ".koko-loc-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 22px;background:#FFFDF9;border:1.5px solid #E8DDCC;border-radius:999px;cursor:pointer;text-align:left;color:#6F5D4B;font-family:inherit;font-size:16px;font-weight:400;transition:border-color .18s;}",
    ".koko-loc-trigger:hover,.koko-loc-wrap.is-open .koko-loc-trigger{border-color:#E8DDCC;outline:none;}",
    ".koko-loc-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".koko-loc-label.is-placeholder{color:#A8A199;font-weight:400;}",
    ".koko-loc-chevron{width:20px;height:20px;flex-shrink:0;color:#6F5D4B;transition:transform .2s;}",
    ".koko-loc-wrap.is-open .koko-loc-chevron{transform:rotate(180deg);}",
    ".koko-loc-list{display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:#FFFDF9;border:1.5px solid #E8DDCC;border-radius:22px;padding:8px;margin:0;list-style:none;z-index:999;max-height:260px;overflow-y:auto;}",
    ".koko-loc-wrap.is-open .koko-loc-list{display:block;}",
    ".koko-loc-option{display:flex;align-items:center;gap:11px;padding:11px 16px;border-radius:999px;cursor:pointer;color:#6F5D4B;font-size:15px;font-weight:400;transition:background .12s,color .12s;}",
    ".koko-loc-option:hover{background:#FFF0DC;color:#D97818;}",
    ".koko-loc-option.is-selected{background:#FFF0DC;color:#D97818;font-weight:500;}",
    ".koko-loc-single .koko-loc-option.is-selected{background:#F28C28;color:#fff;}",
    ".koko-loc-check{width:20px;height:20px;flex-shrink:0;border:1.5px solid #E8DDCC;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fff;transition:all .12s;}",
    ".koko-loc-option.is-selected .koko-loc-check{background:#F28C28;border-color:#F28C28;}",
    ".koko-loc-check svg{width:13px;height:13px;color:#fff;opacity:0;transition:opacity .12s;}",
    ".koko-loc-option.is-selected .koko-loc-check svg{opacity:1;}"
  ].join("");

  var CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV_SVG  = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function injectStyle(){
    if(document.getElementById("koko-loc-style")) return;
    var s = document.createElement("style");
    s.id = "koko-loc-style";
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  function enhance(native){
    if(!native || native.tagName !== "SELECT") return;
    if(native.dataset.kokoReplaced) return;
    native.dataset.kokoReplaced = "1";

    var multi = native.hasAttribute("multiple");

    var opts = [];
    for(var i=0;i<native.options.length;i++){
      if(native.options[i].value !== "") opts.push(native.options[i]);
    }
    var placeholder = (native.options[0] && native.options[0].value === "")
      ? (native.options[0].text || (multi ? "Select options" : "Select an option"))
      : (multi ? "Select options" : "Select an option");

    native.removeAttribute("required");
    native.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:0;height:0;margin:0;padding:0;border:0;";

    var hidden = null;
    if(multi){
      hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = native.getAttribute("name") || "field";
      native.removeAttribute("name");
      native.parentNode.insertBefore(hidden, native.nextSibling);
    }

    var wrap = document.createElement("div");
    wrap.className = "koko-loc-wrap" + (multi ? "" : " koko-loc-single");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "koko-loc-trigger";
    var label = document.createElement("span");
    label.className = "koko-loc-label is-placeholder";
    label.textContent = placeholder;
    var chev = document.createElement("span");
    chev.className = "koko-loc-chevron";
    chev.innerHTML = CHEV_SVG;
    trigger.appendChild(label);
    trigger.appendChild(chev);

    var list = document.createElement("ul");
    list.className = "koko-loc-list";

    function syncLabel(){
      var labels = [];
      opts.forEach(function(o){ if(o.selected) labels.push(o.text); });
      if(multi){
        var values = [];
        opts.forEach(function(o){ if(o.selected) values.push(o.value); });
        hidden.value = values.join(", ");
      }
      native.dispatchEvent(new Event("change", {bubbles:true}));
      if(labels.length === 1){
        label.textContent = labels[0];
        label.classList.remove("is-placeholder");
      } else if(labels.length > 1){
        label.textContent = labels.length + " selected";
        label.classList.remove("is-placeholder");
      } else {
        label.textContent = placeholder;
        label.classList.add("is-placeholder");
      }
    }

    opts.forEach(function(opt){
      var li = document.createElement("li");
      li.className = "koko-loc-option";
      if(multi){
        var box = document.createElement("span");
        box.className = "koko-loc-check";
        box.innerHTML = CHECK_SVG;
        li.appendChild(box);
      }
      var txt = document.createElement("span");
      txt.textContent = opt.text;
      li.appendChild(txt);
      if(opt.selected) li.classList.add("is-selected");

      li.addEventListener("click", function(e){
        e.stopPropagation();
        if(multi){
          opt.selected = !opt.selected;
          li.classList.toggle("is-selected", opt.selected);
        } else {
          native.value = opt.value;
          var all = list.getElementsByClassName("koko-loc-option");
          for(var j=0;j<all.length;j++) all[j].classList.remove("is-selected");
          li.classList.add("is-selected");
          wrap.classList.remove("is-open");
        }
        syncLabel();
      });
      list.appendChild(li);
    });

    wrap.appendChild(trigger);
    wrap.appendChild(list);

    trigger.addEventListener("click", function(e){
      e.stopPropagation();
      closeAll(wrap);
      wrap.classList.toggle("is-open");
    });
    wrap.addEventListener("click", function(e){ e.stopPropagation(); });

    native.parentNode.insertBefore(wrap, native.nextSibling);
    syncLabel();
  }

  function closeAll(except){
    var all = document.getElementsByClassName("koko-loc-wrap");
    for(var i=0;i<all.length;i++){ if(all[i] !== except) all[i].classList.remove("is-open"); }
  }
  document.addEventListener("click", function(){ closeAll(null); });

  function run(){
    injectStyle();
    var selects = document.querySelectorAll("select");
    var found = false;
    for(var i=0;i<selects.length;i++){
      if(!selects[i].dataset.kokoReplaced){ enhance(selects[i]); }
      found = true;
    }
    return found;
  }

  var tries = 0;
  function attempt(){
    if(run()) return;
    if(++tries < 20) setTimeout(attempt, 250);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", attempt);
  } else {
    attempt();
  }
})();
