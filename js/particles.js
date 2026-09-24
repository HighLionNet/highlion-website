(function () {
  "use strict";

  var canvas = document.getElementById("fx");
  if (!canvas) return;
  var context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var points = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var frame = 0;
  var lastFrame = 0;
  var pointer = { x: 0, y: 0, active: false };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function randomVelocity() {
    return Math.random() * 0.36 - 0.18;
  }

  function makePoint() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomVelocity(),
      vy: randomVelocity(),
      size: Math.random() * 1.2 + 0.5,
      alpha: Math.random() * 0.12 + 0.10
    };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = clamp(Math.floor(width * height / 28000), 36, 88);
    points = Array.from({ length: count }, makePoint);
    draw();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    points.forEach(function (point) {
      context.beginPath();
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fillStyle = "rgba(102,220,231," + point.alpha.toFixed(3) + ")";
      context.fill();
    });

    for (var i = 0; i < points.length; i += 3) {
      for (var j = i + 1; j < points.length; j += 1) {
        var dx = points[j].x - points[i].x;
        var dy = points[j].y - points[i].y;
        var distance = Math.hypot(dx, dy);
        if (distance < 120) {
          context.beginPath();
          context.moveTo(points[i].x, points[i].y);
          context.lineTo(points[j].x, points[j].y);
          context.strokeStyle = "rgba(102,220,231," + (0.05 * (1 - distance / 120)).toFixed(4) + ")";
          context.stroke();
        }
      }
    }
  }

  function animate(now) {
    frame = window.requestAnimationFrame(animate);
    if (document.hidden || motionQuery.matches || now - lastFrame < 32) return;
    lastFrame = now;

    points.forEach(function (point) {
      var dx = pointer.x - point.x;
      var dy = pointer.y - point.y;
      var distance = Math.hypot(dx, dy);
      if (pointer.active && distance < 180 && distance > 0.01) {
        point.vx += dx / distance * 0.022;
        point.vy += dy / distance * 0.022;
      } else if (pointer.active) {
        point.x += (pointer.x - width / 2) * 0.00004;
        point.y += (pointer.y - height / 2) * 0.00004;
      }

      var speed = Math.hypot(point.vx, point.vy);
      if (speed > 1.6) {
        point.vx = point.vx / speed * 1.6;
        point.vy = point.vy / speed * 1.6;
      }

      point.x += point.vx;
      point.y += point.vy;
      if (point.x < -6) point.x = width + 6;
      if (point.x > width + 6) point.x = -6;
      if (point.y < -6) point.y = height + 6;
      if (point.y > height + 6) point.y = -6;
    });
    draw();
  }

  function handlePointer(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("pointerleave", function () { pointer.active = false; }, { passive: true });
  window.addEventListener("blur", function () { pointer.active = false; });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !motionQuery.matches) lastFrame = 0;
  });
  motionQuery.addEventListener("change", function () {
    if (motionQuery.matches) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      draw();
    } else if (!frame) {
      lastFrame = 0;
      frame = window.requestAnimationFrame(animate);
    }
  });

  resize();
  if (!motionQuery.matches) frame = window.requestAnimationFrame(animate);
})();
