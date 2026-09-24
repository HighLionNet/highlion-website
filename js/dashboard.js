(function () {
  "use strict";

  var sessions = document.getElementById("dSessions");
  if (!sessions) return;

  var started = Date.now();
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var nodes = {
    clock: document.getElementById("dClock"),
    uptime: document.getElementById("dUptime"),
    timezone: document.getElementById("dTimezone"),
    localTime: document.getElementById("dLocalTime"),
    utcTime: document.getElementById("dUtcTime"),
    userAgent: document.getElementById("dUserAgent"),
    hostOS: document.getElementById("dHostOS"),
    cpuCores: document.getElementById("dCpuCores"),
    viewport: document.getElementById("dViewport"),
    pixelRatio: document.getElementById("dPixelRatio"),
    language: document.getElementById("dLanguage"),
    network: document.getElementById("dNetwork"),
    online: document.getElementById("dOnline"),
    page: document.getElementById("dPage"),
    site: document.getElementById("dSite"),
    motion: document.getElementById("dMotion"),
    latency: document.getElementById("dLatency"),
    probe: document.getElementById("dProbe"),
    protocol: document.getElementById("dProtocol"),
    trafficCount: document.getElementById("tCount"),
    trafficBars: document.getElementById("tBars"),
    trafficNote: document.getElementById("tNote"),
    topPath: document.getElementById("dTopPath")
  };

  function set(node, value) {
    if (node) node.textContent = value;
  }

  function formatElapsed() {
    var seconds = Math.floor((Date.now() - started) / 1000);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    return String(hours).padStart(2, "0") + ":" +
      String(minutes).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");
  }

  function updateClock() {
    var now = new Date();
    var local = now.toLocaleTimeString([], { hour12: false });
    var utc = now.toISOString().slice(11, 19) + "Z";
    set(nodes.uptime, formatElapsed());
    set(nodes.localTime, local);
    set(nodes.utcTime, utc);
    set(nodes.clock, local);
  }

  function browserLabel(ua) {
    var match = ua.match(/Edg\/([\d.]+)/);
    var name = "Edge";
    if (!match) { match = ua.match(/Firefox\/([\d.]+)/); name = "Firefox"; }
    if (!match) { match = ua.match(/Chrome\/([\d.]+)/); name = "Chrome"; }
    if (!match && !/Chrome\//.test(ua)) { match = ua.match(/Version\/([\d.]+).*Safari\//); name = "Safari"; }
    return match ? name + " " + match[1].split(".")[0] : "Browser";
  }

  function hostOS(ua) {
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Windows/.test(ua)) return "Windows";
    if (/Mac OS/.test(ua)) return "macOS";
    if (/Linux/.test(ua)) return "Linux";
    return "Unknown";
  }

  function updateViewport() {
    set(nodes.viewport, window.innerWidth + "×" + window.innerHeight);
    set(nodes.pixelRatio, String(Math.round((window.devicePixelRatio || 1) * 100) / 100));
  }

  function updateOnline() {
    set(nodes.online, navigator.onLine ? "online" : "offline");
  }

  function updateMotion() {
    set(nodes.motion, motionQuery.matches ? "reduced" : "full");
  }

  function updateNetwork() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    set(nodes.network, connection ? (connection.type || connection.effectiveType || "—") : "—");
  }

  function renderTraffic(payload) {
    var ok = Boolean(payload && payload.ok === true);
    var total = ok && Number.isFinite(Number(payload.count)) ? Number(payload.count) : 0;
    var exact = ok && Array.isArray(payload.exact) ? payload.exact.filter(function (row) {
      return row && /^\d{3}$/.test(String(row.code)) && Number(row.n) > 0;
    }).slice(0, 5) : [];
    set(nodes.trafficCount, ok ? String(total) : "—");
    set(nodes.trafficNote, ok ? "" : "no log access");
    set(nodes.topPath, ok && payload.top && payload.top[0] && payload.top[0].path ? payload.top[0].path : "—");
    if (!nodes.trafficBars) return;
    nodes.trafficBars.replaceChildren();
    if (!exact.length) {
      var empty = document.createElement("div");
      empty.className = "traffic-empty";
      empty.textContent = "no codes";
      nodes.trafficBars.appendChild(empty);
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
      label.textContent = code;
      track.className = "traffic-track";
      fill.className = "traffic-fill";
      fill.style.width = (exactTotal > 0 ? Math.min(100, value / exactTotal * 100) : 0) + "%";
      number.textContent = String(value);
      track.appendChild(fill);
      row.append(label, track, number);
      nodes.trafficBars.appendChild(row);
    });
  }

  function requestJson(url) {
    return fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("request unavailable");
      return response.json();
    });
  }

  function loadTraffic() {
    requestJson("/api/traffic.php")
      .catch(function () { return requestJson("/api/traffic"); })
      .then(renderTraffic)
      .catch(function () { renderTraffic({ ok: false, count: 0, codes: {} }); });
  }

  function loadLatency() {
    var sessionMeta = window.HighLionSessionMeta;
    if (!sessionMeta || !sessionMeta.latency) {
      set(nodes.latency, "—");
      set(nodes.probe, "—");
      return;
    }
    sessionMeta.latency.then(function (result) {
      set(nodes.latency, result && Number.isFinite(result.ms) ? result.ms + " ms" : "—");
      set(nodes.probe, result && result.url ? result.url : "—");
    }).catch(function () {
      set(nodes.latency, "—");
      set(nodes.probe, "—");
    });
  }

  try {
    var count = Number.parseInt(localStorage.getItem("highlion_sessions") || "0", 10) + 1;
    localStorage.setItem("highlion_sessions", String(count));
    sessions.textContent = String(count).padStart(3, "0");
  } catch (error) {
    sessions.textContent = "001";
  }

  var ua = navigator.userAgent;
  set(nodes.userAgent, browserLabel(ua));
  if (nodes.userAgent) nodes.userAgent.title = ua;
  set(nodes.hostOS, hostOS(ua));
  set(nodes.cpuCores, navigator.hardwareConcurrency ? navigator.hardwareConcurrency + " cores" : "—");
  set(nodes.language, navigator.language || "—");
  set(nodes.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone || "—");
  set(nodes.page, window.location.pathname || "/");
  set(nodes.site, "HLv8");
  set(nodes.protocol, window.location.protocol.replace(":", "") || "—");

  updateViewport();
  updateOnline();
  updateMotion();
  updateNetwork();
  updateClock();
  renderTraffic({ ok: false, count: 0, codes: {} });
  loadTraffic();
  loadLatency();

  window.addEventListener("resize", updateViewport, { passive: true });
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  motionQuery.addEventListener("change", updateMotion);
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection && typeof connection.addEventListener === "function") connection.addEventListener("change", updateNetwork);
  window.setInterval(updateClock, 1000);
  window.setInterval(loadTraffic, 15 * 60 * 1000);
})();
