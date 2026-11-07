(function () {
  "use strict";
  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[data-download]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var file = new URL(link.href, location.href);
    var preview = new URL(link.dataset.open || link.href, location.href);
    if (file.origin !== location.origin || preview.origin !== location.origin || !/\.(pdf|pptx)$/i.test(file.pathname)) return;
    event.preventDefault();
    window.open(preview.href, "_blank", "noopener,noreferrer");
    var save = document.createElement("a");
    save.href = file.href;
    save.download = file.pathname.split("/").pop();
    save.hidden = true;
    document.body.appendChild(save);
    save.click();
    save.remove();
  });
})();
