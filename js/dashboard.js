(function () {
  "use strict";

  var sessions = document.getElementById("dSessions");
  if (!sessions) return;
  var started = Date.now();
  var uptime = document.getElementById("dUptime");
  var timezone = document.getElementById("dTimezone");
  var userAgent = document.getElementById("dUserAgent");
  var hostOS = document.getElementById("dHostOS");
  var cpuCores = document.getElementById("dCpuCores");
  var viewport = document.getElementById("dViewport");
  var trafficCount = document.getElementById("tCount");
  var trafficBars = document.getElementById("tBars");
  var trafficNote = document.getElementById("tNote");

  try {
    var count = Number.parseInt(localStorage.getItem("highlion_visits") || "0", 10) + 1;
    localStorage.setItem("highlion_visits", String(count));
    sessions.textContent = String(count).padStart(3, "0");
  } catch (error) {
    sessions.textContent = "001";
  }

  var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  timezone.textContent = zone || "Local";
  var ua = navigator.userAgent;
  var match = ua.match(/Edg\/([\d.]+)/);
  var browserName = "Edge";
  if (!match) { match = ua.match(/Firefox\/([\d.]+)/); browserName = "Firefox"; }
  if (!match) { match = ua.match(/Chrome\/([\d.]+)/); browserName = "Chrome"; }
  if (!match && !/Chrome\//.test(ua)) { match = ua.match(/Version\/([\d.]+).*Safari\//); browserName = "Safari"; }
  userAgent.textContent = match ? browserName + " " + match[1].split(".")[0] : "Browser";
  userAgent.title = ua;
  hostOS.textContent = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown";
  cpuCores.textContent = navigator.hardwareConcurrency ? navigator.hardwareConcurrency + " cores" : "Unknown";

  function updateViewport() {
    viewport.textContent = window.innerWidth + "×" + window.innerHeight;
  }

  function updateUptime() {
    var seconds = Math.floor((Date.now() - started) / 1000);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainder = seconds % 60;
    uptime.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function renderTraffic(payload) {
    var ok = Boolean(payload && payload.ok === true);
    var total = ok && Number.isFinite(Number(payload.count)) ? Number(payload.count) : 0;
    var codes = ok && payload.codes ? payload.codes : {};
    trafficCount.textContent = String(total);
    trafficNote.textContent = ok ? "" : "no log access";
    trafficBars.replaceChildren();
    ["2xx", "3xx", "4xx", "5xx"].forEach(function (code) {
      var value = Number(codes[code]) || 0;
      var row = document.createElement("div");
      var label = document.createElement("span");
      var track = document.createElement("span");
      var fill = document.createElement("span");
      var number = document.createElement("span");
      row.className = "traffic-row";
      row.dataset.code = code;
      label.textContent = code;
      track.className = "traffic-track";
      fill.className = "traffic-fill";
      fill.style.width = (total > 0 ? Math.min(100, value / total * 100) : 0) + "%";
      number.textContent = String(value);
      track.appendChild(fill);
      row.append(label, track, number);
      trafficBars.appendChild(row);
    });
  }

  function requestTraffic(url) {
    return fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Traffic unavailable");
        return response.json();
      });
  }

  function loadTraffic() {
    requestTraffic("/api/traffic")
      .catch(function () { return requestTraffic("/api/traffic.php"); })
      .then(renderTraffic)
      .catch(function () { renderTraffic({ ok: false, count: 0, codes: {} }); });
  }

  updateViewport();
  updateUptime();
  renderTraffic({ ok: false, count: 0, codes: {} });
  loadTraffic();
  window.addEventListener("resize", updateViewport, { passive: true });
  window.setInterval(updateUptime, 1000);
  window.setInterval(loadTraffic, 15 * 60 * 1000);
})();
