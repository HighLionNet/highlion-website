(function () {
  "use strict";

  var panel = document.getElementById("hlsrc-panel");
  if (!panel) return;

  var ALLOWED = {
    "index.html": "/index.html",
    "about.html": "/about.html",
    "projects.html": "/projects.html",
    "writeups.html": "/writeups.html",
    "css/style.css": "/css/style.css",
    "components/header.html": "/components/header.html",
    "components/footer.html": "/components/footer.html"
  };
  var select = document.getElementById("srcSelect");
  var output = document.getElementById("srcOut");
  var download = document.getElementById("srcDownload");
  var currentName = "";
  var currentText = "";
  var sequence = ["red", "green", "amber"];
  var sequenceIndex = 0;

  function show(name) {
    currentName = name;
    if (name === ".brief") {
      currentText = "hex lives on the east node";
      output.textContent = currentText;
      return;
    }
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

  panel.querySelectorAll(".hlterm-lights span").forEach(function (light) {
    light.addEventListener("click", function () {
      if (light.classList.contains(sequence[sequenceIndex])) sequenceIndex += 1;
      else sequenceIndex = light.classList.contains(sequence[0]) ? 1 : 0;
      if (sequenceIndex !== sequence.length) return;
      sequenceIndex = 0;
      if (!select.querySelector('option[value=".brief"]')) {
        var option = document.createElement("option");
        option.value = ".brief";
        option.textContent = ".brief";
        select.appendChild(option);
      }
    });
  });

  show(select.value);
})();
