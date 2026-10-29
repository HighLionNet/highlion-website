(function () {
  var list = document.querySelector(".contact-links-panel .socials");
  if (!list) return;
  var email = list.querySelector('a[href^="mailto:"]');
  fetch("/assets/contact-links.json", { credentials: "same-origin" })
    .then(function (response) {
      if (!response.ok) throw new Error("none");
      return response.json();
    })
    .then(function (links) {
      if (!Array.isArray(links)) return;
      links.forEach(function (link) {
        if (!link || typeof link.href !== "string" || typeof link.label !== "string") return;
        var linkedin = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_-]+$/.test(link.href);
        var tryhackme = /^https:\/\/www\.tryhackme\.com\/p\/[A-Za-z0-9_-]+$/.test(link.href);
        if (!linkedin && !tryhackme) return;
        var anchor = document.createElement("a");
        anchor.className = "social-link";
        anchor.href = link.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        var img = document.createElement("img");
        img.src = linkedin ? "/assets/marks/linkedin.svg?v=hl97" : "/assets/marks/tryhackme.svg?v=hl97";
        img.alt = "";
        anchor.appendChild(img);
        anchor.appendChild(document.createTextNode(link.label));
        list.insertBefore(anchor, email);
      });
    })
    .catch(function () {});
})();
