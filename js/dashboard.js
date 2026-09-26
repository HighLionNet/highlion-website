(function () {
  "use strict";

  var board = document.querySelector(".ops-board");
  if (!board) return;
  var started = Date.now();

  function set(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function elapsed() {
    var seconds = Math.floor((Date.now() - started) / 1000);
    return String(Math.floor(seconds / 3600)).padStart(2, "0") + ":" +
      String(Math.floor((seconds % 3600) / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  function browserLabel(ua) {
    var match;
    if (navigator.brave) {
      match = ua.match(/Chrome\/([\d.]+)/);
      return "Brave " + (match ? match[1].split(".")[0] : "");
    }
    match = ua.match(/Edg(?:A|iOS)?\/([\d.]+)/);
    if (match) return "Edge " + match[1].split(".")[0];
    match = ua.match(/OPR\/([\d.]+)/);
    if (match) return "Opera " + match[1].split(".")[0];
    match = ua.match(/Firefox\/([\d.]+)/);
    if (match) return "Firefox " + match[1].split(".")[0];
    match = ua.match(/Chrome\/([\d.]+)/);
    if (match) return "Chrome " + match[1].split(".")[0];
    match = ua.match(/Version\/([\d.]+).*Safari\//);
    return match ? "Safari " + match[1].split(".")[0] : "Browser";
  }

  function platformLabel(ua) {
    var os = "Unknown OS";
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0) os = "iPadOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";
    var engine = /Firefox\//.test(ua) ? "Gecko" : (/AppleWebKit\//.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua) ? "WebKit" : "Blink");
    return os + " / " + engine;
  }

  function updateViewport() {
    set("dDisplay", screen.width + "×" + screen.height + " @ " + (Math.round((window.devicePixelRatio || 1) * 100) / 100));
    set("dViewport", window.innerWidth + "×" + window.innerHeight);
  }

  function updateClock() {
    var local = new Date().toLocaleTimeString([], { hour12: false });
    set("dLocal", local);
    set("dClock", local);
    set("dUptime", elapsed());
  }

  var ua = navigator.userAgent || "";
  var uaNode = document.getElementById("dUserAgent");
  set("dUserAgent", browserLabel(ua).trim());
  if (uaNode) uaNode.title = ua;
  set("dPlatform", platformLabel(ua));
  set("dCpu", (navigator.hardwareConcurrency || "unknown") + " threads");
  set("dLang", navigator.language || "unknown");
  set("dTz", Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");
  set("dPage", window.location.pathname || "/");
  updateViewport();
  updateClock();
  window.addEventListener("resize", updateViewport, { passive: true });
  window.setInterval(updateClock, 1000);
})();
