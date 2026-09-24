(function () {
  "use strict";

  var list = document.getElementById("news-list");
  if (!list) return;
  var stamp = document.getElementById("newsStamp");

  function offline() {
    list.replaceChildren();
    var item = document.createElement("li");
    item.className = "news-item news-offline";
    item.textContent = "Feed offline.";
    list.appendChild(item);
    if (stamp) stamp.textContent = "";
  }

  function render(payload) {
    var items = payload && Array.isArray(payload.items) ? payload.items : [];
    list.replaceChildren();
    if (stamp) {
      var generated = payload && payload.generated ? new Date(payload.generated) : null;
      stamp.textContent = generated && !Number.isNaN(generated.getTime())
        ? generated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    }
    if (!items.length) {
      offline();
      return;
    }
    items.forEach(function (row) {
      var item = document.createElement("li");
      var meta = document.createElement("span");
      var title = document.createElement("a");
      item.className = "news-item";
      meta.className = "news-meta";
      title.className = "news-title";
      meta.textContent = (row.date || "—") + "  " + (row.source || "SOURCE").toUpperCase();
      title.textContent = row.title || "Untitled";
      title.href = row.url;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      item.append(meta, title);
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
    request("/api/intel")
      .catch(function () { return request("/api/intel.php"); })
      .then(render)
      .catch(offline);
  }

  load();
  window.setInterval(load, 15 * 60 * 1000);
})();
