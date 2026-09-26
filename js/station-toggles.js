(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function read(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === "on" || value === "off" ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) {}
  }

  var fx = read("hl-fx", reduced.matches ? "off" : "on");
  var scan = read("hl-scan", "on");

  function paint(button, label, value) {
    if (!button) return;
    button.textContent = label + " · " + value;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", value === "on" ? "true" : "false");
    button.dataset.state = value;
  }

  function applyFx() {
    if (window.HighLionParticles) {
      if (fx === "on") window.HighLionParticles.start();
      else window.HighLionParticles.stop();
    }
    paint(document.getElementById("navFx"), "FX", fx);
  }

  function applyScan() {
    document.documentElement.classList.toggle("is-scan-off", scan === "off");
    paint(document.getElementById("navScan"), "SCAN", scan);
  }

  function bind() {
    var fxButton = document.getElementById("navFx");
    var scanButton = document.getElementById("navScan");
    if (!fxButton || !scanButton || fxButton.dataset.bound === "true") return false;
    fxButton.dataset.bound = "true";
    scanButton.dataset.bound = "true";
    fxButton.addEventListener("click", function () {
      fx = fx === "on" ? "off" : "on";
      write("hl-fx", fx);
      applyFx();
    });
    scanButton.addEventListener("click", function () {
      scan = scan === "on" ? "off" : "on";
      write("hl-scan", scan);
      applyScan();
    });
    applyFx();
    applyScan();
    return true;
  }

  applyFx();
  applyScan();
  if (!bind()) {
    var observer = new MutationObserver(function () {
      if (!bind()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
