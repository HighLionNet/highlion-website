(function () {
  "use strict";

  var panel = document.getElementById("hlsrc-panel");
  if (!panel) return;

  var ALLOWED = {
    "index.html": "/index.html?v=hl95",
    "about.html": "/about.html?v=hl95",
    "projects.html": "/projects.html?v=hl95",
    "writeups.html": "/writeups.html?v=hl95",
    "contact.html": "/contact.html?v=hl95",
    "css/style.css": "/css/style.css?v=hl95",
    "components/header.html": "/components/header.html?v=hl95",
    "components/footer.html": "/components/footer.html?v=hl95"
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

    var url = Object.prototype.hasOwnProperty.call(ALLOWED, name) ? ALLOWED[name] : "";
    if (!url || url.charAt(0) !== "/" || url.indexOf("..") !== -1 || url.indexOf("//") !== -1) return;
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
    window.setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
  });

  show(select.value);
})();
