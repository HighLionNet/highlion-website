(function () {
  "use strict";

  var board = document.querySelector(".ops-board");
  if (!board) return;
  var started = Date.now();
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var contrastMore = window.matchMedia("(prefers-contrast: more)");
  var contrastLess = window.matchMedia("(prefers-contrast: less)");
  var uaData = navigator.userAgentData || null;
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var ids = [
    "dClock", "dUptime", "dTimezone", "dUtcOffset", "dLocalTime", "dUtcTime", "dUserAgent", "dUaBrands",
    "dPlatform", "dMobile", "dArch", "dCpuCores", "dDeviceMemory", "dViewport", "dScreen", "dColorDepth",
    "dPixelRatio", "dOrientation", "dLanguage", "dLanguages", "dPage", "dReferrer", "dProtocol", "dOnline",
    "dNetworkType", "dDownlink", "dRtt", "dSaveData", "dMotion", "dContrast", "dTouchPoints", "dCookies",
    "dPdfView", "dVisibility", "dLatency", "dProbe", "dSite", "tCount", "tBars", "tNote", "dTopPath"
  ];
  var nodes = {};
  ids.forEach(function (id) { nodes[id] = document.getElementById(id); });

  function set(id, value) {
    if (nodes[id]) nodes[id].textContent = value === undefined || value === null || value === "" ? "—" : String(value);
  }

  function yesNo(value) {
    return value === undefined || value === null ? "—" : (value ? "yes" : "no");
  }

  function formatElapsed() {
    var seconds = Math.floor((Date.now() - started) / 1000);
    return String(Math.floor(seconds / 3600)).padStart(2, "0") + ":" +
      String(Math.floor((seconds % 3600) / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  function utcOffset() {
    var minutes = -new Date().getTimezoneOffset();
    var sign = minutes >= 0 ? "+" : "-";
    var absolute = Math.abs(minutes);
    return "UTC" + sign + String(Math.floor(absolute / 60)).padStart(2, "0") + ":" + String(absolute % 60).padStart(2, "0");
  }

  function updateClock() {
    var now = new Date();
    var local = now.toLocaleTimeString([], { hour12: false });
    set("dUptime", formatElapsed());
    set("dLocalTime", local);
    set("dUtcTime", now.toISOString().slice(11, 19) + "Z");
    set("dClock", local);
  }

  function brandsText() {
    if (!uaData || !Array.isArray(uaData.brands)) return "—";
    return uaData.brands.map(function (row) { return row.brand + " " + row.version; }).join(", ") || "—";
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
    if (uaData && Array.isArray(uaData.brands)) {
      var preferred = uaData.brands.find(function (row) { return !/not.?a.?brand/i.test(row.brand); });
      if (preferred) return preferred.brand + " " + String(preferred.version).split(".")[0];
    }
    match = ua.match(/Chrome\/([\d.]+)/);
    if (match) return "Chrome " + match[1].split(".")[0];
    match = ua.match(/Version\/([\d.]+).*Safari\//);
    return match ? "Safari " + match[1].split(".")[0] : "Browser";
  }

  function parsedPlatform(ua) {
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0) return "iPadOS";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Windows NT/.test(ua)) return "Windows";
    if (/Mac OS X/.test(ua)) return "macOS";
    if (/CrOS/.test(ua)) return "ChromeOS";
    if (/Linux/.test(ua)) return "Linux";
    return "—";
  }

  function updateViewport() {
    set("dViewport", window.innerWidth + "×" + window.innerHeight);
    set("dScreen", screen.width + "×" + screen.height);
    set("dColorDepth", Number.isFinite(screen.colorDepth) ? screen.colorDepth + "-bit" : "—");
    set("dPixelRatio", Math.round((window.devicePixelRatio || 1) * 100) / 100);
    updateOrientation();
  }

  function updateOrientation() {
    var value = screen.orientation && screen.orientation.type;
    if (!value) value = window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
    set("dOrientation", value);
  }

  function updateOnline() {
    set("dOnline", navigator.onLine ? "online" : "offline");
  }

  function updatePreferences() {
    set("dMotion", motionQuery.matches ? "reduced" : "full");
    set("dContrast", contrastMore.matches ? "more" : (contrastLess.matches ? "less" : "no preference"));
  }

  function updateVisibility() {
    set("dVisibility", document.visibilityState || "—");
  }

  function updateNetwork() {
    set("dNetworkType", connection && connection.effectiveType ? connection.effectiveType : "—");
    set("dDownlink", connection && Number.isFinite(connection.downlink) ? connection.downlink + " Mb/s" : "—");
    set("dRtt", connection && Number.isFinite(connection.rtt) ? connection.rtt + " ms" : "—");
    set("dSaveData", connection && typeof connection.saveData === "boolean" ? yesNo(connection.saveData) : "—");
  }

  function referrerHost() {
    if (!document.referrer) return "direct";
    try { return new URL(document.referrer).host || "direct"; } catch (error) { return "direct"; }
  }

  function renderTraffic(payload) {
    var ok = Boolean(payload && payload.ok === true);
    var total = ok && Number.isFinite(Number(payload.count)) ? Number(payload.count) : 0;
    var exact = ok && Array.isArray(payload.exact) ? payload.exact.filter(function (row) {
      return row && /^\d{3}$/.test(String(row.code)) && Number(row.n) > 0;
    }).slice(0, 5) : [];
    set("tCount", ok ? total : "—");
    set("tNote", ok ? "" : "no log access");
    set("dTopPath", ok && payload.top && payload.top[0] && payload.top[0].path ? payload.top[0].path : "—");
    if (!nodes.tBars) return;
    nodes.tBars.replaceChildren();
    if (!exact.length) {
      var empty = document.createElement("div");
      empty.className = "traffic-empty";
      empty.textContent = "no codes";
      nodes.tBars.appendChild(empty);
      return;
    }
    var exactTotal = exact.reduce(function (sum, row) { return sum + Number(row.n); }, 0);
    exact.forEach(function (codeRow) {
      var code = String(codeRow.code);
      var value = Number(codeRow.n);
      var row = document.createElement("div");
      var label = document.createElement("span");
      var track = document.createElement("span");
      var fill = document.createElement("span");
      var number = document.createElement("span");
      row.className = "traffic-row";
      row.dataset.code = code;
      row.dataset.family = code.charAt(0);
      if (code === "499") row.title = "499 — client closed request";
      label.textContent = code;
      track.className = "traffic-track";
      fill.className = "traffic-fill";
      fill.style.width = (exactTotal > 0 ? Math.min(100, value / exactTotal * 100) : 0) + "%";
      number.textContent = String(value);
      track.appendChild(fill);
      row.append(label, track, number);
      nodes.tBars.appendChild(row);
    });
  }

  function requestTraffic(url) {
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("traffic unavailable");
        return response.json();
      });
  }

  function loadTraffic() {
    requestTraffic("/api/traffic.php")
      .catch(function () { return requestTraffic("/api/traffic"); })
      .then(renderTraffic)
      .catch(function () { renderTraffic({ ok: false, count: 0 }); });
  }

  function loadLatency() {
    var sessionMeta = window.HighLionSessionMeta;
    if (!sessionMeta || !sessionMeta.latency) return;
    sessionMeta.latency.then(function (result) {
      set("dLatency", result && Number.isFinite(result.ms) ? result.ms + " ms" : "—");
      set("dProbe", result && result.url ? result.url : "—");
    }).catch(function () { set("dLatency", "—"); set("dProbe", "—"); });
  }

  var ua = navigator.userAgent || "";
  set("dUserAgent", browserLabel(ua).trim());
  if (nodes.dUserAgent) nodes.dUserAgent.title = ua;
  set("dUaBrands", brandsText());
  set("dPlatform", (uaData && uaData.platform) || parsedPlatform(ua));
  set("dMobile", uaData && typeof uaData.mobile === "boolean" ? yesNo(uaData.mobile) : (/Mobile|Android|iPhone|iPad/.test(ua) ? "yes" : "no"));
  set("dArch", "—");
  if (uaData && typeof uaData.getHighEntropyValues === "function") {
    uaData.getHighEntropyValues(["architecture"]).then(function (values) { set("dArch", values.architecture || "—"); }).catch(function () {});
  }
  set("dCpuCores", navigator.hardwareConcurrency ? navigator.hardwareConcurrency : "—");
  set("dDeviceMemory", Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory + " GB" : "—");
  set("dLanguage", navigator.language || "—");
  set("dLanguages", Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages.join(", ") : "—");
  set("dTimezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "—");
  set("dUtcOffset", utcOffset());
  set("dPage", window.location.pathname || "/");
  set("dReferrer", referrerHost());
  set("dProtocol", window.location.protocol.replace(":", "") || "—");
  set("dTouchPoints", Number.isFinite(navigator.maxTouchPoints) ? navigator.maxTouchPoints : "—");
  set("dCookies", yesNo(navigator.cookieEnabled));
  set("dPdfView", typeof navigator.pdfViewerEnabled === "boolean" ? yesNo(navigator.pdfViewerEnabled) : "—");
  set("dSite", "HLv8");

  updateViewport();
  updateOnline();
  updatePreferences();
  updateVisibility();
  updateNetwork();
  updateClock();
  renderTraffic({ ok: false, count: 0 });
  loadTraffic();
  loadLatency();

  window.addEventListener("resize", updateViewport, { passive: true });
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  document.addEventListener("visibilitychange", updateVisibility);
  if (screen.orientation && typeof screen.orientation.addEventListener === "function") screen.orientation.addEventListener("change", updateOrientation);
  if (connection && typeof connection.addEventListener === "function") connection.addEventListener("change", updateNetwork);
  motionQuery.addEventListener("change", updatePreferences);
  contrastMore.addEventListener("change", updatePreferences);
  contrastLess.addEventListener("change", updatePreferences);
  window.setInterval(updateClock, 1000);
  window.setInterval(loadTraffic, 15 * 60 * 1000);
})();
