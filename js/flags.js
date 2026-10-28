(function () {
  "use strict";
  var ids = ["modular", "route", "xor", "timeline"];
  var state = { claimed: [] };
  var pending = null;

  function save(payload) {
    var retained = state.claimed.slice();
    try {
      var old = JSON.parse(localStorage.getItem("hl-trophies-v1") || "null");
      if (old && Array.isArray(old.claimed)) retained = retained.concat(old.claimed);
    } catch (error) {}
    state = { claimed: Array.from(new Set(retained.concat(payload.claimed || []).filter(function (id) { return ids.indexOf(id) !== -1; }))) };
    try { localStorage.setItem("hl-trophies-v1", JSON.stringify({ v: 1, claimed: state.claimed })); } catch (error) {}
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
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(response.status === 429 ? "Too many attempts. Try again later." : response.status === 400 ? "flag not recognized" : "Claims are unavailable. Try again.");
    }
    save(payload);
    if (flag !== undefined) window.dispatchEvent(new CustomEvent("hl:flag-found", { detail: { id: payload.id, reward: payload.reward || "" } }));
    return payload;
  }

  function claim(value) {
    var flag = String(value || "").trim();
    if (!/^HL8\{[a-z0-9_-]{8,140}\}$/.test(flag)) return Promise.reject(new Error("flag not recognized"));
    if (pending) return Promise.reject(new Error("A claim is already being checked."));
    pending = request(flag).finally(function () { pending = null; });
    return pending;
  }
  window.HighLionFlags = { claim: claim, refresh: function () { return request(); }, state: function () { return { claimed: state.claimed.slice() }; } };

  var stopConfetti = null;
  function burstConfetti() {
    if (stopConfetti) stopConfetti();
    var canvas = document.createElement("canvas");
    canvas.id = "flag-fx";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;pointer-events:none;z-index:9999";
    // A modal dialog sits above every ordinary page z-index. Join its top layer.
    if (typeof canvas.showPopover === "function") {
      canvas.setAttribute("popover", "manual");
      document.body.appendChild(canvas);
      canvas.showPopover();
    } else dialog.appendChild(canvas);
    var frameId = 0;
    var cleanupTimer = 0;
    function onDialogClose() { if (canvas.parentNode === dialog) document.body.appendChild(canvas); }
    dialog.addEventListener("close", onDialogClose);
    stopConfetti = function () {
      cancelAnimationFrame(frameId);
      clearTimeout(cleanupTimer);
      dialog.removeEventListener("close", onDialogClose);
      canvas.remove();
      stopConfetti = null;
    };
    var ctx = canvas.getContext("2d");
    if (!ctx) { stopConfetti(); return; }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var particles = [];
    var colors = ["#66f7ff", "#6cffe6", "#e7c56b", "#ff64cb"];
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
        vr: (Math.random() - 0.5) * 0.3,
        streak: i % 3 === 0
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
        if (p.streak) {
          ctx.fillRect(-p.size * 1.5, -0.7, p.size * 3, 1.4);
        } else {
          ctx.beginPath();
          ctx.moveTo(-p.size / 2, -p.size / 3);
          ctx.lineTo(p.size / 2, 0);
          ctx.lineTo(-p.size / 4, p.size / 2);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
      if (alive) frameId = requestAnimationFrame(frame);
      else stopConfetti();
    }
    cleanupTimer = setTimeout(stopConfetti, 2000);
    frame();
  }

  var dialog = document.createElement("dialog");
  dialog.className = "flag-dialog";
  dialog.setAttribute("aria-labelledby", "flagTitle");
  dialog.innerHTML = '<form class="flag-form"><div class="flag-heading"><h2 id="flagTitle">Submit a flag</h2></div><p class="flag-progress" aria-live="polite"></p><label for="flagValue">Flag</label><input id="flagValue" name="flag" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="HL8{…}" required><p class="flag-status" role="status" aria-live="polite"></p><div class="flag-actions"><button type="submit" class="btn">Claim</button><button type="button" class="btn" data-close>Close</button></div></form>';
  document.body.appendChild(dialog);
  var form = dialog.querySelector("form");
  var input = dialog.querySelector("input");
  var status = dialog.querySelector("[role=status]");
  var submit = dialog.querySelector('[type="submit"]');
  var progress = dialog.querySelector(".flag-progress");
  var closeTimer = 0;
  var submission = 0;
  function renderClaims() {
    progress.textContent = state.claimed.length + " / " + ids.length + " claimed" + (state.claimed.length ? " · " + state.claimed.join(", ") : "");
  }
  window.addEventListener("hl:claims", renderClaims);
  renderClaims();
  dialog.querySelector("[data-close]").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", function () {
    clearTimeout(closeTimer);
    submission += 1;
    input.value = "";
    submit.disabled = false;
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    var currentSubmission = ++submission;
    status.textContent = "Checking…";
    try {
      var payload = await claim(input.value);
      if (currentSubmission !== submission || !dialog.open) return;
      status.textContent = payload.duplicate ? "Already claimed." : "Claimed!";
      burstConfetti();
      closeTimer = setTimeout(function () { dialog.close(); }, 900);
    } catch (error) {
      if (currentSubmission !== submission) return;
      status.textContent = error.message || "Claims are unavailable. Try again.";
      submit.disabled = false;
    }
  });
  document.addEventListener("click", function (event) {
    if (!event.target.closest("#navFlags, [data-flags-open]")) return;
    status.textContent = "";
    renderClaims();
    dialog.showModal();
    input.focus();
    request().catch(function () {});
  });
  window.HighLionFlags.ready = request().catch(function () {});
})();
