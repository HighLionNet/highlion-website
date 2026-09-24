(function () {
  "use strict";

  var list = document.getElementById("intel-list");
  if (!list) return;

  var rows = [
    ["2026-07-17  LAB", "Exposed Pi-hole admin via reverse-proxy — patched", "/writeups/pihole.html"],
    ["2026-01-13  LAB", "CVE-2026-2441 CSS use-after-free research", "/writeups/cve-2026-2441.html"],
    ["STATIC  OPS", "/contact.html remains IL-only; 403 page carries the mail form", ""],
    ["STATIC  WATCH", "Packet Tracer lab  MD5 3f5feff2880a5208a2de26f5d868c3ec", "/projects.html"],
    ["STATIC  OPS", "Stack: Debian • nginx • static HLv8 • hlshell", ""],
    ["STATIC  WATCH", "Resume locked until requested  admin@highlion.net", "/contact.html"]
  ];

  rows.forEach(function (row) {
    var item = document.createElement("li");
    var meta = document.createElement("span");
    var title = document.createElement(row[2] ? "a" : "span");
    item.className = "intel-item";
    meta.className = "intel-meta";
    title.className = "intel-title";
    meta.textContent = row[0];
    title.textContent = row[1];
    if (row[2]) title.setAttribute("href", row[2]);
    item.append(meta, title);
    list.appendChild(item);
  });
})();
