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
        return latencyResult;
      } catch (error) {
        continue;
      }
    }
    latencyResult = { ms: null, url: "" };
    window.__hlLatency = latencyResult;
    window.dispatchEvent(new CustomEvent("hl:latency", { detail: latencyResult }));
    return latencyResult;
  }

  function clockText(now) {
    return now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23"
    });
  }

  function feedState(payload) {
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    if (!items.length || payload.ok !== true) return { state: "off", count: 0 };
    return { state: payload.stale ? "stale" : "live", count: items.length };
  }

  function paintFeed(status) {
    window.__hlIntelFeed = status;
    var node = document.getElementById("navFeed");
    if (!node) return;
    if (status.state === "live") {
      node.textContent = "FEED · " + String(status.count).padStart(2, "0") + " live";
    } else {
      node.textContent = "FEED · " + (status.state === "stale" ? "stale" : "off");
    }
    node.dataset.state = status.state;
  }

  function paintSession() {
    var local = document.getElementById("navClock");
    var now = new Date();
    if (local) local.textContent = clockText(now);
    paintFeed(window.__hlIntelFeed || { state: "off", count: 0 });
  }

  function loadFeedChip() {
    if (document.getElementById("news-list")) return;
    fetch("/api/intel.php", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Feed unavailable");
        return response.json();
      })
      .then(function (payload) { paintFeed(feedState(payload)); })
      .catch(function () { paintFeed({ state: "off", count: 0 }); });
  }

  function watchHeader() {
    paintSession();
    if (document.getElementById("navClock") && document.getElementById("navFeed")) {
      loadFeedChip();
      return;
    }
    var observer = new MutationObserver(function () {
      if (!document.getElementById("navClock") || !document.getElementById("navFeed")) return;
      paintSession();
      loadFeedChip();
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  latencyPromise = document.getElementById("dLatency")
    ? runProbe()
    : Promise.resolve({ ms: null, url: "" });
  window.HighLionSessionMeta = {
    latency: latencyPromise,
    current: function () { return latencyResult; }
  };

  window.addEventListener("hl:intel", function (event) {
    if (event.detail) paintFeed(event.detail);
  });
  watchHeader();
  window.setInterval(paintSession, 1000);
})();
