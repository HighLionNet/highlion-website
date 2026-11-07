(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function read(key, fallback) {
    try {
      var value = window.sessionStorage.getItem(key);
      return value === "on" || value === "off" ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (error) {}
  }

  var fx = read("hl-fx", reduced.matches ? "off" : "on");
  var scan = read("hl-scan", "on");
  var savedAppearance = null;

  function paint(button, label, value) {
    if (!button) return;
    var on = value === "on";
    button.setAttribute("aria-label", label + (on ? " on" : " off"));
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.dataset.state = value;
    button.classList.toggle("is-on", on);
    button.classList.toggle("is-off", !on);
    var name = button.querySelector(".nav-toggle-name");
    if (!name) {
      var existing = button.querySelector("span");
      if (existing && !existing.classList.contains("nav-toggle-state")) name = existing;
    }
    if (!name) {
      var loose = [];
      for (var index = 0; index < button.childNodes.length; index += 1) {
        var node = button.childNodes[index];
        if (node.nodeType === 3 && node.textContent.trim()) loose.push(node);
      }
      name = document.createElement("span");
      name.className = "nav-toggle-name";
      name.textContent = loose.length ? loose.map(function (node) { return node.textContent.trim(); }).join(" ") : label;
      if (loose.length) button.insertBefore(name, loose[0]);
      else button.appendChild(name);
      loose.forEach(function (node) { node.remove(); });
    }
    var state = button.querySelector(".nav-toggle-state");
    if (!state) {
      state = document.createElement("span");
      state.className = "nav-toggle-state";
      button.appendChild(state);
    }
    state.textContent = on ? "ON" : "OFF";
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
    if (fxButton && fxButton.dataset.bound !== "true") {
      fxButton.dataset.bound = "true";
      fxButton.addEventListener("click", function () {
        fx = fx === "on" ? "off" : "on";
        write("hl-fx", fx);
        applyFx();
      });
    }
    if (scanButton && scanButton.dataset.bound !== "true") {
      scanButton.dataset.bound = "true";
      scanButton.addEventListener("click", function () {
        scan = scan === "on" ? "off" : "on";
        write("hl-scan", scan);
        applyScan();
      });
    }
    applyFx();
    applyScan();
    return Boolean(fxButton && scanButton);
  }

  function centerTor(smooth) {
    var target = document.getElementById("tor-mirror");
    if (!target) return;
    var rect = target.getBoundingClientRect();
    var top = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (top < 0) top = 0;
    if (top > max) top = max;
    window.scrollTo({ top: top, behavior: smooth && !reduced.matches ? "smooth" : "auto" });
  }

  function onAbout() {
    var path = window.location.pathname.replace(/\/+$/, "") || "/";
    return path === "/about.html" || path === "/about";
  }

  function bindTor() {
    if (window.location.hash === "#tor-mirror") centerTor(false);
    var link = document.getElementById("navTor");
    if (!link) return false;
    if (link.dataset.bound === "true") return true;
    link.dataset.bound = "true";
    link.addEventListener("click", function (event) {
      if (!onAbout() || !document.getElementById("tor-mirror")) return;
      event.preventDefault();
      if (window.location.hash !== "#tor-mirror") history.pushState(null, "", "#tor-mirror");
      centerTor(true);
    });
    return true;
  }

  function bindCli() {
    var button = document.getElementById("navCli");
    if (!button) return false;
    button.hidden = false;
    if (button.dataset.bound === "true") return true;
    button.dataset.bound = "true";
    button.addEventListener("click", function () {
      var terminal = document.getElementById("hlterm") || document.getElementById("hlterm-panel");
      if (terminal) terminal.scrollIntoView({ block: "start", behavior: reduced.matches ? "auto" : "smooth" });
      else window.location.assign("/#hlterm-panel");
    });
    return true;
  }

  window.addEventListener("hl:appearance", function (event) {
    var change = event.detail || {};
    if (change.save && !savedAppearance) savedAppearance = { fx: fx, scan: scan };
    if (change.restore && savedAppearance) { fx = savedAppearance.fx; scan = savedAppearance.scan; savedAppearance = null; }
    if (["on", "off"].indexOf(change.fx) !== -1) fx = change.fx;
    if (["on", "off"].indexOf(change.scan) !== -1) scan = change.scan;
    applyFx(); applyScan();
  });
  window.addEventListener("hl:fx", function (event) {
    if (["on", "off"].indexOf(event.detail) === -1) return;
    fx = event.detail; write("hl-fx", fx); applyFx();
  });
  applyFx();
  applyScan();
  function bindAll() {
    var togglesReady = bind();
    var cliReady = bindCli();
    var torReady = bindTor();
    return togglesReady && cliReady && torReady;
  }
  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#tor-mirror") centerTor(!reduced.matches);
  });
  window.addEventListener("load", function () {
    if (window.location.hash === "#tor-mirror") centerTor(false);
  });
  if (!bindAll()) {
    var observer = new MutationObserver(function () {
      if (!bindAll()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
