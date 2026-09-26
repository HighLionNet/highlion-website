(function () {
  "use strict";

  var list = document.getElementById("news-list");
  if (!list) return;
  var stamp = document.getElementById("newsStamp");
  var tickerTrack = document.getElementById("newsTickerTrack");
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var lastItems = [];

  function sourceInfo(row) {
    var host = String(row.source || "").toLowerCase().replace(/^www\./, "");
    if (!host && row.url) {
      try { host = new URL(row.url).hostname.toLowerCase().replace(/^www\./, ""); } catch (error) { host = "source"; }
    }
    if (host === "bleepingcomputer.com") return { className: "source-bc", host: host, thumb: "/assets/thumbs/bleeping.png" };
    if (host === "thehackernews.com" || host.indexOf("feedburner.com") !== -1 || host.indexOf("thehackersnews") !== -1) {
      return { className: "source-th", host: host, thumb: "/assets/thumbs/hackernews.png" };
    }
    if (host === "krebsonsecurity.com") return { className: "source-kr", host: host, thumb: "/assets/thumbs/krebs.png" };
    if (host === "cisa.gov") return { className: "source-ci", host: host, thumb: "/assets/thumbs/cisa.png" };
    return { className: "", host: host || "source", thumb: "/assets/thumbs/highlion.png" };
  }

  function publishFeed(state, count) {
    var detail = { state: state, count: count || 0 };
    window.__hlIntelFeed = detail;
    window.dispatchEvent(new CustomEvent("hl:intel", { detail: detail }));
  }

  function thumbFor(row, source) {
    var thumb = String(row.thumb || "");
    var fallback = source.thumb || "/assets/thumbs/highlion.png";
    var image = document.createElement("img");
    image.className = "news-thumb";
    image.alt = "";
    image.width = 56;
    image.height = 56;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", function () {
      image.src = fallback;
    }, { once: true });
    image.src = /^\/api\/thumb\.php\?id=[a-f0-9]{40}$/.test(thumb) ? thumb : fallback;
    return image;
  }

  function rebuildTicker(items) {
    if (!tickerTrack) return;
    tickerTrack.replaceChildren();
    if (!items.length) return;
    var rows = motionQuery.matches ? items.slice(0, 3) : items;
    var tickerText = rows.map(function (row) {
      var source = sourceInfo(row);
      return source.chip + " · " + (row.title || "Untitled");
    }).join("    ·    ");
    var strip = document.createElement("span");
    strip.className = "news-ticker-strip";
    strip.textContent = tickerText;
    tickerTrack.appendChild(strip);
    if (!motionQuery.matches) {
      var duplicate = strip.cloneNode(true);
      tickerTrack.appendChild(duplicate);
      window.requestAnimationFrame(function () {
        var duration = Math.max(16, strip.scrollWidth / 28);
        tickerTrack.style.setProperty("--ticker-duration", duration.toFixed(2) + "s");
      });
    }
  }

  function offline() {
    lastItems = [];
    list.replaceChildren();
    var item = document.createElement("li");
    item.className = "news-item news-offline";
    item.textContent = "Feed offline.";
    list.appendChild(item);
    if (stamp) stamp.textContent = "offline";
    rebuildTicker([]);
    publishFeed("off", 0);
  }

  function render(payload) {
    var items = payload && Array.isArray(payload.items) ? payload.items.slice(0, 10) : [];
    list.replaceChildren();
    if (!items.length) {
      offline();
      return;
    }
    lastItems = items;
    var state = payload.stale ? "stale" : "live";
    if (stamp) stamp.textContent = String(items.length) + " items · 15m headlines";
    items.forEach(function (row) {
      var item = document.createElement("li");
      var copy = document.createElement("div");
      var meta = document.createElement("span");
      var title = document.createElement("a");
      var source = sourceInfo(row);
      item.className = "news-item";
      copy.className = "news-copy";
      meta.className = "news-meta" + (source.className ? " " + source.className : "");
      title.className = "news-title";
      meta.textContent = (row.date || "—") + "    " + source.host.toUpperCase();
      title.textContent = row.title || "Untitled";
      title.href = row.url;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      copy.append(meta, title);
      item.append(thumbFor(row, source), copy);
      list.appendChild(item);
    });
    rebuildTicker(items);
    publishFeed(state, items.length);
  }

  function request(url) {
    return fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Feed unavailable");
        return response.json();
      });
  }

  function load() {
    request("/api/intel.php")
      .catch(function () { return request("/api/intel"); })
      .catch(function () { return request("/api/intel/"); })
      .then(render)
      .catch(offline);
  }

  motionQuery.addEventListener("change", function () { rebuildTicker(lastItems); });
  load();
  window.setInterval(load, 15 * 60 * 1000);
})();
