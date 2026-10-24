(function () {
  "use strict";

  var panel = document.getElementById("hlsrc-panel");
  if (!panel) return;

  var ALLOWED = {
    "index.html": "/index.html",
    "about.html": "/about.html",
    "projects.html": "/projects.html",
    "writeups.html": "/writeups.html",
    "css/style.css": "/css/style.css?v=hl8t",
    "components/header.html": "/components/header.html?v=hl8t",
    "components/footer.html": "/components/footer.html?v=hl8t"
  };
  var select = document.getElementById("srcSelect");
  var output = document.getElementById("srcOut");
  var download = document.getElementById("srcDownload");
  var currentName = "";
  var currentText = "";
  function show(name) {
    currentName = name;

    var url = ALLOWED[name];
    if (!url) return;
    output.textContent = "Loading " + name + "…";
    fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Source unavailable");
        return response.text();
      })
      .then(function (text) {
        currentText = text;
        output.textContent = text;
      })
      .catch(function () {
        currentText = "Source unavailable.";
        output.textContent = currentText;
      });
  }

  select.addEventListener("change", function () { show(select.value); });
  download.addEventListener("click", function () {
    if (!currentName) return;
    var blob = new Blob([currentText], { type: "text/plain;charset=utf-8" });
    var anchor = document.createElement("a");
    var blobUrl = URL.createObjectURL(blob);
    anchor.href = blobUrl;
    anchor.download = currentName.split("/").pop();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
  });

  show(select.value);
})();
