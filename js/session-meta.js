(function () {
  "use strict";

  if (window.HighLionSessionMeta) return;

  var latencyResult = null;
  var latencyPromise = null;

  function wait(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function probeOnce(url) {
    var started = performance.now();
    return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("probe unavailable");
      return performance.now() - started;
    });
  }

  async function probeUrl(url) {
    var samples = [];
    for (var index = 0; index < 3; index += 1) {
      samples.push(await probeOnce(url));
      if (index < 2) await wait(200);
    }
    samples.sort(function (left, right) { return left - right; });
    return { ms: Math.round(samples[1]), url: url };
  }

  async function runProbe() {
    var probes = ["/api/csrf.php", "/assets/ping.txt"];
    for (var index = 0; index < probes.length; index += 1) {
      try {
        latencyResult = await probeUrl(probes[index]);
        window.__hlLatency = latencyResult;
        window.dispatchEvent(new CustomEvent("hl:latency", { detail: latencyResult }));
        paintLatency();
        return latencyResult;
      } catch (error) {
        continue;
      }
    }
    latencyResult = { ms: null, url: "" };
    window.__hlLatency = latencyResult;
    window.dispatchEvent(new CustomEvent("hl:latency", { detail: latencyResult }));
    paintLatency();
    return latencyResult;
  }

  function clockText(now, utc) {
    if (utc) return "UTC " + now.toISOString().slice(11, 19) + "Z";
    return now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function paintLatency() {
    var node = document.getElementById("navLatency");
    if (!node) return;
    node.textContent = latencyResult && Number.isFinite(latencyResult.ms) ? latencyResult.ms + " ms" : "—";
  }

  function paintSession() {
    var local = document.getElementById("navClock");
    var utc = document.getElementById("navUtc");
    var online = document.getElementById("navOnline");
    var now = new Date();
    if (local) local.textContent = clockText(now, false);
    if (utc) utc.textContent = clockText(now, true);
    if (online) {
      online.classList.toggle("is-offline", !navigator.onLine);
      var label = online.querySelector("span");
      if (label) label.textContent = navigator.onLine ? "online" : "offline";
    }
    paintLatency();
  }

  function watchHeader() {
    paintSession();
    if (document.getElementById("navLatency")) return;
    var observer = new MutationObserver(function () {
      if (!document.getElementById("navLatency")) return;
      paintSession();
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  latencyPromise = runProbe();
  window.HighLionSessionMeta = {
    latency: latencyPromise,
    current: function () { return latencyResult; }
  };

  watchHeader();
  window.addEventListener("online", paintSession);
  window.addEventListener("offline", paintSession);
  window.setInterval(paintSession, 1000);
})();
