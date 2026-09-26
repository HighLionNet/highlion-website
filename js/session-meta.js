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
    try {
      latencyResult = await probeUrl("/assets/ping.txt");
    } catch (error) {
      latencyResult = { ms: null, url: "/assets/ping.txt" };
    }
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

  function paintSession() {
    var local = document.getElementById("navClock");
    var now = new Date();
    if (local) local.textContent = clockText(now);
  }

  function watchHeader() {
    paintSession();
    if (document.getElementById("navClock")) return;
    var observer = new MutationObserver(function () {
      if (!document.getElementById("navClock")) return;
      paintSession();
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

  watchHeader();
  window.setInterval(paintSession, 1000);
})();
