(function () {
  "use strict";

  var panel = document.getElementById("hlsrc-panel");
  if (!panel) return;

  var ALLOWED = {
    "index.html": "/index.html?v=hl8v",
    "about.html": "/about.html?v=hl8v",
    "projects.html": "/projects.html?v=hl8v",
    "writeups.html": "/writeups.html?v=hl8v",
    "css/style.css": "/css/style.css?v=hl8v",
    "components/header.html": "/components/header.html?v=hl8v",
    "components/footer.html": "/components/footer.html?v=hl8v"
  };
  var select = document.getElementById("srcSelect");
  var output = document.getElementById("srcOut");
  var download = document.getElementById("srcDownload");
  var currentName = "";
  var currentText = "";
  var requestSerial = 0;
  function show(name) {
    var serial = ++requestSerial;
    currentName = name;
    currentText = "";
    download.disabled = true;

    var url = ALLOWED[name];
    if (!url) return;
    output.textContent = "Loading " + name + "…";
    fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Source unavailable");
        return response.text();
      })
      .then(function (text) {
        if (serial !== requestSerial) return;
        download.disabled = false;
        currentText = text;
        output.textContent = text;
      })
      .catch(function () {
        if (serial !== requestSerial) return;
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
