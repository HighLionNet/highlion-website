var HL_LIVING_CHROME = true;

(function () {
  "use strict";
  var root = document.documentElement;
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var timer = 0;

  function chrome() {
    root.classList.toggle("is-living", HL_LIVING_CHROME && !motion.matches);
    root.classList.toggle("is-motion-paused", document.hidden);
  }
  function stop() {
    clearTimeout(timer);
    root.classList.remove("is-entering");
  }
  function play() {
    if (motion.matches) return;
    stop();
    void root.offsetWidth;
    root.classList.add("is-entering");
    timer = setTimeout(stop, 2500);
  }

  chrome();
  document.addEventListener("visibilitychange", chrome);
  motion.addEventListener("change", function () {
    chrome();
    if (motion.matches) stop();
    else play();
  });
  play();
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) play();
  });
})();
