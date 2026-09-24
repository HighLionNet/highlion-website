(function () {
  "use strict";

  var ATTRACT_RADIUS = 170;
  var ATTRACT_FORCE = 0.10;
  var DRAG = 0.96;
  var MAX_SPEED = 2.4;
  var ALPHA_MIN = 0.45;
  var ALPHA_MAX = 0.88;
  var SIZE_MIN = 1.3;
  var SIZE_MAX = 2.6;
  var LINK_DIST = 130;
  var LINK_ALPHA = 0.20;
  var COUNT_DIVISOR = 16000;

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

  function between(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function makePoint(atEdge) {
    var x = Math.random() * width;
    var y = Math.random() * height;
    if (atEdge) {
      var edge = Math.floor(Math.random() * 4);
      if (edge === 0) y = -4;
      if (edge === 1) x = width + 4;
      if (edge === 2) y = height + 4;
      if (edge === 3) x = -4;
    }
    return {
      x: x,
      y: y,
      vx: between(-0.42, 0.42),
      vy: between(-0.42, 0.42),
      driftX: between(-0.018, 0.018),
      driftY: between(-0.018, 0.018),
      size: between(SIZE_MIN, SIZE_MAX),
      alpha: between(ALPHA_MIN, ALPHA_MAX)
    };
  }

  function clear() {
    context.clearRect(0, 0, width, height);
  }

  function draw() {
    clear();
    for (var index = 0; index < points.length; index += 1) {
      var point = points[index];
      context.beginPath();
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fillStyle = "rgba(102,247,255," + point.alpha.toFixed(3) + ")";
      context.fill();
    }

    for (var left = 0; left < points.length; left += 1) {
      for (var right = left + 1; right < points.length; right += 1) {
        var dx = points[right].x - points[left].x;
        var dy = points[right].y - points[left].y;
        var distance = Math.hypot(dx, dy);
        if (distance < LINK_DIST) {
          context.beginPath();
          context.moveTo(points[left].x, points[left].y);
          context.lineTo(points[right].x, points[right].y);
          context.strokeStyle = "rgba(61,139,255," + (LINK_ALPHA * (1 - distance / LINK_DIST)).toFixed(3) + ")";
          context.stroke();
        }
      }
    }
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
    var count = clamp(Math.floor(width * height / COUNT_DIVISOR), 70, 160);
    points = Array.from({ length: count }, makePoint);
    if (motionQuery.matches) clear();
    else draw();
  }

  function animate(now) {
    if (motionQuery.matches) {
      frame = 0;
      clear();
      return;
    }
    frame = window.requestAnimationFrame(animate);
    if (document.hidden || now - lastFrame < 24) return;
    lastFrame = now;

    points.forEach(function (point, index) {
      if (pointer.active) {
        var dx = pointer.x - point.x;
        var dy = pointer.y - point.y;
        var distance = Math.hypot(dx, dy);
        if (distance < ATTRACT_RADIUS && distance > 0.01) {
          point.vx += (dx / distance) * ATTRACT_FORCE;
          point.vy += (dy / distance) * ATTRACT_FORCE;
        }
      }
      point.vx *= DRAG;
      point.vy *= DRAG;
      point.vx += point.driftX;
      point.vy += point.driftY;
      var speed = Math.hypot(point.vx, point.vy);
      if (speed > MAX_SPEED) {
        point.vx = point.vx / speed * MAX_SPEED;
        point.vy = point.vy / speed * MAX_SPEED;
      }
      point.x += point.vx;
      point.y += point.vy;
      point.alpha -= 0.0012;
      point.size -= 0.001;
      if (point.alpha < 0.08 || point.size < 0.4) {
        points[index] = makePoint(true);
        return;
      }
      if (point.x < -8) point.x = width + 8;
      if (point.x > width + 8) point.x = -8;
      if (point.y < -8) point.y = height + 8;
      if (point.y > height + 8) point.y = -8;
    });
    draw();
  }

  function start() {
    if (!frame && !motionQuery.matches) {
      lastFrame = 0;
      frame = window.requestAnimationFrame(animate);
    }
  }

  window.addEventListener("pointermove", function (event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerleave", function () { pointer.active = false; }, { passive: true });
  window.addEventListener("blur", function () { pointer.active = false; });
  window.addEventListener("resize", resize, { passive: true });
  motionQuery.addEventListener("change", function () {
    if (motionQuery.matches) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      clear();
    } else {
      draw();
      start();
    }
  });

  resize();
  start();
})();
