(function () {
  "use strict";

  function activate(row) {
    if (row.dataset.rowLink === "first") {
      var firstLink = row.querySelector("a[href]");
      if (firstLink) firstLink.click();
      return;
    }
    if (row.dataset.href) window.location.assign(row.dataset.href);
  }

  document.addEventListener("click", function (event) {
    var row = event.target.closest("tr[data-href]");
    if (!row || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.target.closest("a, button, input, select, textarea, [role='button']")) return;
    activate(row);
  });

  document.addEventListener("keydown", function (event) {
    var row = event.target.closest("tr[data-href]");
    if (!row || event.target !== row || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    activate(row);
  });
})();
