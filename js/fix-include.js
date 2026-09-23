/* HighLion shared include loader. */
(function () {
  "use strict";
  if (window.__HL_INCLUDES_DONE) return;
  window.__HL_INCLUDES_DONE = true;

  function dedupeOnce() {
    var headers = document.querySelectorAll("header.nav");
    var footers = document.querySelectorAll("footer.site-footer");
    for (var i = 1; i < headers.length; i += 1) headers[i].remove();
    for (var j = 1; j < footers.length; j += 1) footers[j].remove();
  }

  function finish() {
    dedupeOnce();
    document.querySelectorAll("[data-current-year]").forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });

    var path = window.location.pathname;
    if (path === "/") path = "/index.html";
    document.querySelectorAll(".nav-links a").forEach(function (link) {
      if (link.getAttribute("href") === path) link.setAttribute("aria-current", "page");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var nodes = Array.from(document.querySelectorAll("[data-include]"));
    if (!nodes.length) {
      finish();
      return;
    }

    Promise.all(nodes.map(function (element) {
      var url = element.getAttribute("data-include");
      return fetch(url, { cache: "no-store", credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error(response.status + " " + response.statusText);
          return response.text();
        })
        .then(function (html) {
          element.insertAdjacentHTML("beforebegin", html);
          element.remove();
        })
        .catch(function (error) {
          console.error("include failed:", url, error);
        });
    }))
      .finally(function () {
        finish();
        window.setTimeout(dedupeOnce, 100);
      });
  });
})();
