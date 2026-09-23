(function () {
  "use strict";

  var canvas;
  var context;
  var points = [];
  var frame = 0;
  var running = false;
  var lastFrame = 0;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var pointer = { x: 0, y: 0, active: false };
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function resize() {
    if (!canvas || !context) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    var count = Math.min(72, Math.max(22, Math.floor((width * height) / 26000)));
    points = Array.from({ length: count }, function () {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        size: Math.random() * 0.8 + 0.45,
        alpha: Math.random() * 0.22 + 0.12
      };
    });
  }

  function draw(timestamp) {
    if (!running || !context) return;
    frame = window.requestAnimationFrame(draw);
    if (timestamp - lastFrame < 32) return;
    lastFrame = timestamp;
    context.clearRect(0, 0, width, height);

    points.forEach(function (point, index) {
      point.x += point.vx;
      point.y += point.vy;

      if (pointer.active) {
        point.x += (pointer.x - width / 2) * (index % 5 + 1) * 0.000012;
        point.y += (pointer.y - height / 2) * (index % 5 + 1) * 0.000012;
      }

      if (point.x < -5) point.x = width + 5;
      if (point.x > width + 5) point.x = -5;
      if (point.y < -5) point.y = height + 5;
      if (point.y > height + 5) point.y = -5;

      context.fillStyle = "rgba(74, 232, 225, " + point.alpha + ")";
      context.beginPath();
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fill();

      if (index % 4 === 0) {
        var neighbor = points[(index + 7) % points.length];
        var dx = neighbor.x - point.x;
        var dy = neighbor.y - point.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 110) {
          context.strokeStyle = "rgba(49, 197, 203, " + (0.055 * (1 - distance / 110)) + ")";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(neighbor.x, neighbor.y);
          context.stroke();
        }
      }
    });
  }

  function off() {
    running = false;
    window.cancelAnimationFrame(frame);
    if (context) context.clearRect(0, 0, width, height);
  }

  function on() {
    if (!canvas || (reducedMotion && reducedMotion.matches) || running) return;
    running = true;
    frame = window.requestAnimationFrame(draw);
  }

  function init() {
    canvas = document.getElementById("fx");
    if (!canvas || (reducedMotion && reducedMotion.matches)) return;
    context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    resize();
    on();

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) off(); else on();
    });
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener("change", function (event) {
        if (event.matches) off(); else on();
      });
    }
  }

  window.__HLParticles = { off: off, on: on };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
