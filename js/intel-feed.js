(function () {
  "use strict";

  var list = document.getElementById("news-list");
  if (!list) return;
  var stamp = document.getElementById("newsStamp");

  function sourceInfo(row) {
    var host = String(row.source || "").toLowerCase().replace(/^www\./, "");
    if (!host && row.url) {
      try { host = new URL(row.url).hostname.toLowerCase().replace(/^www\./, ""); } catch (error) { host = "source"; }
    }
    if (host === "bleepingcomputer.com") return { chip: "BC", className: "source-bc", host: host };
    if (host === "thehackernews.com" || host.indexOf("feedburner.com") !== -1 || host.indexOf("thehackersnews") !== -1) {
      return { chip: "TH", className: "source-th", host: host };
    }
    if (host === "krebsonsecurity.com") return { chip: "KR", className: "source-kr", host: host };
    if (host === "cisa.gov") return { chip: "CI", className: "source-ci", host: host };
    var letters = host.replace(/[^a-z]/g, "").slice(0, 2).toUpperCase();
    return { chip: letters || "--", className: "", host: host || "source" };
  }

  function offline() {
    list.replaceChildren();
    var item = document.createElement("li");
    item.className = "news-item news-offline";
    item.textContent = "Feed offline.";
    list.appendChild(item);
    if (stamp) stamp.textContent = "offline";
  }

  function render(payload) {
    var items = payload && Array.isArray(payload.items) ? payload.items.slice(0, 8) : [];
    list.replaceChildren();
    if (!items.length) {
      offline();
      return;
    }
    if (stamp) stamp.textContent = String(items.length).padStart(2, "0") + " items · 24h cache";
    items.forEach(function (row) {
      var item = document.createElement("li");
      var mark = document.createElement("span");
      var copy = document.createElement("div");
      var meta = document.createElement("span");
      var title = document.createElement("a");
      var source = sourceInfo(row);
      item.className = "news-item";
      mark.className = "news-mark" + (source.className ? " " + source.className : "");
      mark.textContent = source.chip;
      copy.className = "news-copy";
      meta.className = "news-meta";
      title.className = "news-title";
      meta.textContent = (row.date || "—") + "    " + source.host.toUpperCase();
      title.textContent = row.title || "Untitled";
      title.href = row.url;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      copy.append(meta, title);
      item.append(mark, copy);
      list.appendChild(item);
    });
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

  load();
  window.setInterval(load, 60 * 60 * 1000);
})();
