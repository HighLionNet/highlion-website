(function () {
  "use strict";
  var ids = ["modular", "route", "xor", "timeline"];
  var state = { claimed: [] };
  var pending = null;

  function save(payload) {
    state = { claimed: Array.from(new Set((payload.claimed || []).filter(function (id) { return ids.indexOf(id) !== -1; }))) };
    try {
      var old = JSON.parse(localStorage.getItem("hl-trophies-v1") || "null");
      var retained = old && Array.isArray(old.claimed) ? old.claimed.filter(function (id) { return ids.indexOf(id) !== -1; }) : [];
      localStorage.setItem("hl-trophies-v1", JSON.stringify({ v: 1, claimed: Array.from(new Set(retained.concat(state.claimed))) }));
    } catch (error) {}
    window.dispatchEvent(new CustomEvent("hl:claims", { detail: state }));
    return payload;
  }

  async function request(flag) {
    var options = { credentials: "same-origin", cache: "no-store" };
    if (flag !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify({ flag: flag });
    }
    var response = await fetch("/api/ctf.php", options);
    var payload = await response.json();
    if (!response.ok || payload.ok !== true) {
      throw new Error(response.status === 429 ? "Too many attempts. Try again later." : response.status === 400 ? "flag not recognized" : "Claims are unavailable. Try again.");
    }
    return save(payload);
  }

  function claim(value) {
    var flag = String(value || "").trim();
    if (!/^HL8\{[a-z0-9_-]{8,140}\}$/.test(flag)) return Promise.reject(new Error("flag not recognized"));
    if (pending) return Promise.reject(new Error("A claim is already being checked."));
    pending = request(flag).finally(function () { pending = null; });
    return pending;
  }
  window.HighLionFlags = { claim: claim, refresh: function () { return request(); }, state: function () { return { claimed: state.claimed.slice() }; } };

  function burstConfetti() {
    var canvas = document.getElementById("fx") || document.createElement("canvas");
    if (!canvas.id) {
      canvas.id = "flag-fx";
      canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999";
      document.body.appendChild(canvas);
    }
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var particles = [];
    var colors = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"];
    for (var i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 12,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 3,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3
      });
    }
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      particles.forEach(function (p) {
        if (p.life <= 0) return;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.life -= 0.015;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (alive) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    frame();
  }

  var dialog = document.createElement("dialog");
  dialog.className = "flag-dialog";
  dialog.setAttribute("aria-labelledby", "flagTitle");
  dialog.innerHTML = '<form class="flag-form"><div class="flag-heading"><h2 id="flagTitle">Submit a flag</h2></div><label for="flagValue">Flag</label><input id="flagValue" name="flag" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="HL8{…}" required><p class="flag-status" role="status" aria-live="polite"></p><div class="flag-actions"><button type="submit" class="btn">Claim</button><button type="button" class="btn" data-close>Close</button></div></form>';
  document.body.appendChild(dialog);
  var form = dialog.querySelector("form");
  var input = dialog.querySelector("input");
  var status = dialog.querySelector("[role=status]");
  var submit = dialog.querySelector('[type="submit"]');
  dialog.querySelector("[data-close]").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", function () { input.value = ""; });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    status.textContent = "Checking…";
    try {
      await claim(input.value);
      status.textContent = "Claimed!";
      burstConfetti();
      setTimeout(function () { dialog.close(); }, 900);
    } catch (error) { status.textContent = error.message || "Claims are unavailable. Try again."; }
    finally { submit.disabled = false; }
  });
  document.addEventListener("click", function (event) {
    if (!event.target.closest("#navFlags, [data-flags-open]")) return;
    status.textContent = "";
    dialog.showModal();
    input.focus();
    request().catch(function () {});
  });
  window.HighLionFlags.ready = request().catch(function () {});
})();
