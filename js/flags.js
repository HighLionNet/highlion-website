(function () {
  "use strict";
  var ids = ["handoff", "route", "letterbox", "timeline"];
  var state = { claimed: [], unlocked: false };
  var pending = null;

  function save(payload) {
    state = { claimed: Array.from(new Set((payload.claimed || []).filter(function (id) { return ids.indexOf(id) !== -1; }))), unlocked: payload.unlocked === true };
    try {
      var old = JSON.parse(localStorage.getItem("hl-trophies-v1") || "null");
      var retained = old && Array.isArray(old.claimed) ? old.claimed.filter(function (id) { return typeof id === "string" && /^[a-z0-9_-]{1,64}$/i.test(id); }) : [];
      localStorage.setItem("hl-trophies-v1", JSON.stringify({ v: 1, claimed: Array.from(new Set(retained.concat(state.claimed))) }));
    } catch (error) {}
    document.querySelectorAll("[data-claim-count]").forEach(function (node) { node.textContent = state.claimed.length + " / 4 claimed"; });
    document.querySelectorAll("[data-secret-link]").forEach(function (node) { node.hidden = !state.unlocked; });
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
  window.HighLionFlags = { claim: claim, refresh: function () { return request(); }, state: function () { return state; } };

  var dialog = document.createElement("dialog");
  dialog.className = "flag-dialog";
  dialog.setAttribute("aria-labelledby", "flagTitle");
  dialog.innerHTML = '<form class="flag-form"><div class="flag-heading"><h2 id="flagTitle">Submit a flag</h2><button type="button" data-close aria-label="Close">×</button></div><label for="flagValue">Flag</label><input id="flagValue" name="flag" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="HL8{…}" required><p class="flag-status" role="status" aria-live="polite"></p><div class="flag-actions"><button type="submit" class="btn">Claim</button><a href="/ctf.html">Challenges</a><a href="/api/secret.php" data-secret-link hidden>Operator notes</a></div></form>';
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
      dialog.close();
      window.location.assign("/api/secret.php");
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
  window.HighLionFlags.ready = request().catch(function () {
    document.querySelectorAll("[data-claim-count]").forEach(function (node) {
      try {
        var saved = JSON.parse(localStorage.getItem("hl-trophies-v1") || "null");
        var count = saved && Array.isArray(saved.claimed) ? new Set(saved.claimed.filter(function (id) { return ids.indexOf(id) !== -1; })).size : 0;
        node.textContent = count + " / 4 saved locally";
      } catch (error) { node.textContent = "Claims unavailable"; }
    });
  });
})();
