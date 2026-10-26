(function () {
      var consoleNode = document.querySelector("[data-project-console]");
      if (!consoleNode) return;
      consoleNode.addEventListener("click", function (event) {
        var button = event.target.closest("[data-project-filter]");
        if (!button) return;
        var filter = button.dataset.projectFilter;
        consoleNode.querySelectorAll("[data-project-filter]").forEach(function (item) {
          item.setAttribute("aria-pressed", item === button ? "true" : "false");
        });
        consoleNode.querySelectorAll("[data-project-class]").forEach(function (row) {
          row.hidden = filter !== "all" && row.dataset.projectClass !== filter;
        });
      });
    })();
