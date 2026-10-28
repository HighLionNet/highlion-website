// LIVING CHROME TEST.
// false = pages stay still after boot. CSS below stays in the file.
// To make permanent: set this true and delete the branch that checks it,
// so html.is-living is always applied when motion is allowed.
// Owner sentences that must stay one-line changes:
//   "Make living chrome permanent" -> remove `HL_LIVING_CHROME &&` below.
//   "Revert living chrome" -> set this switch to false.
var HL_LIVING_CHROME = true;

(function () {
  "use strict";
  var root = document.documentElement;
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var seen;
  // Decide and mark the tab synchronously; unavailable storage fails visible.
  try {
    seen = sessionStorage.getItem("hl-boot-seen") === "1";
    sessionStorage.setItem("hl-boot-seen", "1");
  } catch (error) { return; }

  function chrome() {
    root.classList.toggle("is-living", HL_LIVING_CHROME && !motion.matches);
    root.classList.toggle("is-motion-paused", document.hidden);
  }
  chrome();
  document.addEventListener("visibilitychange", chrome);
  motion.addEventListener("change", function () {
    chrome();
    if (motion.matches) finish();
  });
  if (seen || motion.matches) return;

  var early = !document.body;
  var started = performance.now();
  var finished = false, frame = 0, safety = 0, designedEnd = 0, readyTimer = 0, preparing;
  var headlines = [], frames = [], content = [], observer;
  var overlay = document.createElement("div");
  overlay.className = "hl-boot-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<div class="hl-boot-grid"></div><div class="hl-boot-status"><span>HL // LINK</span><span class="hl-boot-counter">0x0000</span><span>CLICK / ESC TO SKIP</span></div>';
  var counter = overlay.querySelector(".hl-boot-counter");
  var titleSelector = "h1, .headline, .kicker, .section-heading h2, .profile-panel h1, header.nav .brand-title";
  var frameSelector = "header.nav, .xdr-console, .monitor, .hlterm-panel, .onion-panel, .site-footer, .rule-band";
  var contentSelector = "main p, main img, main table, main dl, main form, main .hlterm-body, main .socials, main .source-bay";

  function align(element, name) {
    // CSS animations otherwise start at the next style flush, which can lag
    // deferred scripts. Includes and the first page use one authored clock.
    element.getAnimations().forEach(function (animation) {
      if (animation.animationName === name) animation.startTime = started;
    });
  }

  function restore(item) {
    if (item.done) return;
    item.done = true;
    // These are the actual original nodes, including inline accents and links.
    item.element.replaceChildren.apply(item.element, item.original);
    item.element.classList.remove("hl-boot-typing");
  }
  function finish() {
    if (finished || !overlay) return;
    finished = true;
    clearTimeout(safety); clearTimeout(designedEnd); clearTimeout(readyTimer);
    cancelAnimationFrame(frame);
    if (observer) observer.disconnect();
    if (preparing) preparing.disconnect();
    headlines.forEach(restore);
    frames.forEach(function (node) {
      if (node.parentElement) node.parentElement.classList.remove("hl-boot-frame-host");
      node.remove();
    });
    content.forEach(function (item) {
      item.element.classList.remove("hl-boot-content");
      item.element.style.animationDelay = item.delay;
    });
    overlay.removeEventListener("pointerdown", finish);
    document.removeEventListener("keydown", escape);
    root.classList.remove("is-booting", "is-boot-home", "is-boot-preparing");
    overlay.remove();
  }
  function escape(event) { if (event.key === "Escape") finish(); }
  function collect() {
    if (finished) return;
    var age = performance.now() - started;
    // Fetched includes join the same clock. Late includes are already complete.
    if (early) document.querySelectorAll("main, header.nav, .site-footer").forEach(function (element) { align(element, "hl-boot-page"); });
    if (!early) document.querySelectorAll(contentSelector).forEach(function (element) {
      if (age >= 2100 || element.closest("dialog") || element.classList.contains("hl-boot-content") ||
          (element.parentElement && element.parentElement.closest(contentSelector))) return;
      content.push({ element: element, delay: element.style.animationDelay });
      element.style.animationDelay = "0ms";
      element.classList.add("hl-boot-content");
      align(element, "hl-boot-content");
    });
    document.querySelectorAll(frameSelector).forEach(function (element) {
      if (element.querySelector(":scope > .hl-boot-frame") || age >= 750) return;
      var border = document.createElement("span");
      border.className = "hl-boot-frame";
      border.setAttribute("aria-hidden", "true");
      if (getComputedStyle(element).position === "static") element.classList.add("hl-boot-frame-host");
      element.appendChild(border); frames.push(border);
      align(border, "hl-boot-frame");
    });
    if (age >= 1400) return;
    document.querySelectorAll(titleSelector).forEach(function (element, index) {
      if (element.closest("dialog, .sr-only, [hidden]") || element.getClientRects().length === 0 ||
          headlines.some(function (item) { return item.element === element || item.element.contains(element); })) return;
      var text = element.textContent;
      if (!text.trim()) return;
      var original = Array.from(element.childNodes);
      var sizer = document.createElement("span"), run = document.createElement("span");
      sizer.className = "hl-boot-type-sizer";
      run.className = "hl-boot-type-run";
      run.setAttribute("aria-hidden", "true");
      original.forEach(function (node) { sizer.appendChild(node); });
      element.append(sizer, run); element.classList.add("hl-boot-typing");
      var begin = Math.max(age, 430 + index % 7 * 45);
      headlines.push({ element: element, original: original, run: run, glyphs: Array.from(text), begin: begin, end: 1540, done: false });
    });
  }
  function tick(now) {
    if (finished) return;
    var age = now - started;
    counter.textContent = "0x" + Math.min(65535, Math.floor(age / 2100 * 65535)).toString(16).toUpperCase().padStart(4, "0");
    headlines.forEach(function (item) {
      if (item.done) return;
      if (age >= item.end) restore(item);
      else item.run.textContent = item.glyphs.slice(0, Math.floor(item.glyphs.length * Math.max(0, (age - item.begin) / (item.end - item.begin)))).join("");
    });
    // Home finishes its coordinated scan at 2000ms; other boots keep 2360ms.
    if (age >= (early ? 2000 : 2360)) finish();
    else frame = requestAnimationFrame(tick);
  }
  function start() {
    if (finished || frame) return;
    clearTimeout(readyTimer);
    if (preparing) preparing.disconnect();
    if (early) started = performance.now();
    document.body.appendChild(overlay);
    root.classList.remove("is-boot-preparing");
    if (early) document.querySelectorAll("main, header.nav, .site-footer").forEach(function (element) { align(element, "hl-boot-page"); });
    align(overlay, "hl-boot-overlay");
    collect();
    observer = new MutationObserver(function (records) {
      if (records.some(function (record) {
        return Array.from(record.addedNodes).some(function (node) {
          return node.nodeType === 1 && !node.closest(".hl-boot-typing, .hl-boot-overlay") && !node.classList.contains("hl-boot-frame");
        });
      })) collect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    designedEnd = setTimeout(finish, Math.max(0, (early ? 2010 : 2370) - (performance.now() - started)));
    frame = requestAnimationFrame(tick);
  }
  function prepare() {
    if (finished) return;
    var fontsReady = !document.fonts;
    function ready() {
      if (fontsReady && document.querySelector("header.nav") && document.querySelector(".site-footer")) start();
    }
    // Coordinate fetched chrome and fonts before a single reveal; never hold
    // the page indefinitely for a failed include or a slow font connection.
    preparing = new MutationObserver(ready);
    preparing.observe(document.body, { childList: true });
    readyTimer = setTimeout(start, 250);
    if (document.fonts) document.fonts.ready.then(function () { fontsReady = true; ready(); });
    ready();
  }
  try {
    // Home runs in the head: set the guard before the body can first paint.
    safety = setTimeout(finish, Math.max(0, 2400 - (performance.now() - started)));
    overlay.addEventListener("pointerdown", finish);
    document.addEventListener("keydown", escape);
    root.classList.add("is-booting");
    if (early) {
      root.classList.add("is-boot-home", "is-boot-preparing");
      document.addEventListener("DOMContentLoaded", prepare, { once: true });
    } else start();
  } catch (error) { finish(); }
})();
