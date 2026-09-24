(function () {
  "use strict";

  var canvas = document.getElementById("rain");
  if (!canvas) return;
  var band = canvas.closest(".rain-band");
  var context = canvas.getContext("2d");
  if (!band || !context) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var width = 0;
  var height = 0;
  var dpr = 1;
  var columns = [];
  var frame = 0;
  var fontSize = 14;

  function resetColumns() {
    var count = Math.ceil(width / fontSize);
    columns = Array.from({ length: count }, function () {
      return { row: Math.random() * (height / fontSize), speed: 0.9 + Math.random() * 0.7 };
    });
  }

  function paintGlyph(column, row, alpha) {
    context.fillStyle = Math.random() > 0.78
      ? "rgba(102,247,255," + alpha.toFixed(2) + ")"
      : "rgba(61,139,255," + alpha.toFixed(2) + ")";
    context.fillText(Math.random() > 0.5 ? "1" : "0", column * fontSize, row * fontSize);
  }

  function drawStatic() {
    context.clearRect(0, 0, width, height);
    context.font = fontSize + "px JetBrains Mono, monospace";
    columns.forEach(function (drop, column) {
      paintGlyph(column, Math.floor(drop.row), 0.55 + Math.random() * 0.35);
    });
  }

  function draw() {
    if (motionQuery.matches) {
      frame = 0;
      drawStatic();
      return;
    }
    context.fillStyle = "rgba(7,9,20,0.12)";
    context.fillRect(0, 0, width, height);
    context.font = fontSize + "px JetBrains Mono, monospace";
    columns.forEach(function (drop, column) {
      paintGlyph(column, drop.row, 0.55 + Math.random() * 0.35);
      drop.row += drop.speed;
      if (drop.row * fontSize > height + fontSize && Math.random() > 0.9) drop.row = 0;
    });
    frame = window.requestAnimationFrame(draw);
  }

  function resize() {
    width = band.clientWidth;
    height = band.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetColumns();
    if (motionQuery.matches) drawStatic();
  }

  function start() {
    if (!frame && !motionQuery.matches) frame = window.requestAnimationFrame(draw);
  }

  var observer = new ResizeObserver(resize);
  observer.observe(band);
  motionQuery.addEventListener("change", function () {
    if (motionQuery.matches) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      drawStatic();
    } else {
      context.clearRect(0, 0, width, height);
      start();
    }
  });

  resize();
  if (motionQuery.matches) drawStatic();
  else start();
})();
