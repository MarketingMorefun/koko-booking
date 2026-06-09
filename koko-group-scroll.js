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
