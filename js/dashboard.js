(function () {
  "use strict";

  var board = document.querySelector(".ops-board");
  if (!board) return;
  var started = Date.now();

  function set(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function removeRow(id) {
    var node = document.getElementById(id);
    if (node && node.parentElement) node.parentElement.remove();
  }

  function formatMs(value) {
    return (value >= 20 ? Math.round(value) : Math.round(value * 10) / 10) + " ms";
  }

  function paintLatency(detail) {
    if (!detail || !Number.isFinite(detail.ms)) {
      removeRow("dPing");
      removeRow("dLatency");
      return;
    }
    ["dPing", "dLatency"].forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      node.textContent = formatMs(detail.ms);
      node.title = "GET /assets/ping.txt";
    });
  }

  async function fetchTraffic() {
    var endpoints = ["/api/traffic.php", "/api/traffic", "/api/traffic/"];
    for (var index = 0; index < endpoints.length; index += 1) {
      try {
        var response = await fetch(endpoints[index], { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) continue;
        var payload = await response.json();
        if (payload && payload.ok === true && payload.codes) return payload;
      } catch (error) {}
    }
    return null;
  }

  async function updateTraffic() {
    var payload = await fetchTraffic();
    if (!payload) {
      removeRow("dHttp");
      removeRow("dCodes");
      return;
    }
    var codes = payload.codes;
    set("dHttp", "2xx " + Number(codes["2xx"] || 0) + " · 3xx " + Number(codes["3xx"] || 0) + " · 4xx " + Number(codes["4xx"] || 0) + " · 5xx " + Number(codes["5xx"] || 0));
    var exact = Array.isArray(payload.exact) ? payload.exact.map(function (row) {
      return String(row.code) + "×" + Number(row.n || 0);
    }).join("  ") : "";
    var exactNode = document.getElementById("dCodes");
    if (exactNode) {
      exactNode.textContent = exact;
      exactNode.title = String(payload.window || "") + " " + String(payload.generated || "");
    }
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
  var connection = navigator.connection;
  if (connection && Number.isFinite(connection.rtt)) set("dRtt", connection.rtt + " ms");
  else {
    var rttRow = document.getElementById("dRttRow");
    if (rttRow) rttRow.remove();
  }
  if (window.__hlLatency) paintLatency(window.__hlLatency);
  window.addEventListener("hl:latency", function (event) { paintLatency(event.detail); });
  if (window.HighLionSessionMeta && window.HighLionSessionMeta.latency) {
    window.HighLionSessionMeta.latency.then(paintLatency);
  }
  updateTraffic();
  updateViewport();
  updateClock();
  window.addEventListener("resize", updateViewport, { passive: true });
  window.setInterval(updateClock, 1000);
  window.setInterval(updateTraffic, 60000);
})();
