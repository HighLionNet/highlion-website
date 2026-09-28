(function () {
  "use strict";

  var HL = window.HLShell;
  if (!HL || !HL.boot) return;

  var SLOT_URL = "/api/shell-slot.php";
  var AUTH_URL = "/api/shell-auth.php";
  var CSRF_URLS = ["/api/csrf.php", "/api/csrf", "/api/csrf/"];
  var heartbeatMs = 25000;
  var sharedMachine = null;
  var bootPromise = null;
  var acquirePromise = null;
  var csrfPromise = null;
  var slot = { id: "", ttl: 90, operator: false };
  var heartbeatTimer = 0;
  var acquireTimer = 0;
  var released = false;
  var instance = 0;

  function requestToken(url) {
    return fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("token unavailable");
        return response.json();
      })
      .then(function (payload) {
        if (!payload || payload.ok !== true || typeof payload.token !== "string") throw new Error("token unavailable");
        return payload.token;
      });
  }

  function csrfToken(refresh) {
    if (refresh) csrfPromise = null;
    if (!csrfPromise) {
      csrfPromise = requestToken(CSRF_URLS[0])
        .catch(function () { return requestToken(CSRF_URLS[1]); })
        .catch(function () { return requestToken(CSRF_URLS[2]); })
        .catch(function (error) { csrfPromise = null; throw error; });
    }
    return csrfPromise;
  }

  function postJson(url, payload, keepalive, retried) {
    return csrfToken(Boolean(retried)).then(function (token) {
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: Boolean(keepalive),
        headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
        body: JSON.stringify(payload)
      });
    }).then(function (response) {
      if ((response.status === 401 || response.status === 403) && !retried) {
        csrfPromise = null;
        return postJson(url, payload, keepalive, true);
      }
      return response.json().catch(function () { return { ok: false }; }).then(function (body) {
        if (!response.ok) {
          var error = new Error("request failed");
          error.payload = body;
          throw error;
        }
        return body;
      });
    });
  }

  function slotPost(payload) {
    return postJson(SLOT_URL, payload, payload.op === "release", false);
  }

  function syncLease() {
    if (sharedMachine) sharedMachine.attachLease(slot, sessionControl);
  }

  function clearSlot() {
    slot = { id: "", ttl: 90, operator: false };
    syncLease();
  }

  function scheduleAcquire() {
    if (acquireTimer || released) return;
    acquireTimer = window.setTimeout(function () {
      acquireTimer = 0;
      acquireSlot();
    }, 5000);
  }

  function acquireSlot() {
    if (slot.id) return Promise.resolve(slot);
    if (acquirePromise || released) return acquirePromise || Promise.resolve(slot);
    acquirePromise = slotPost({ op: "acquire" }).then(function (payload) {
      if (!payload || payload.mode !== "full" || typeof payload.id !== "string" || !payload.id) throw new Error("slot unavailable");
      slot = { id: payload.id, ttl: Number(payload.ttl) || 90, operator: Boolean(payload.operator) };
      syncLease();
      return slot;
    }).catch(function () {
      clearSlot();
      scheduleAcquire();
      return slot;
    }).finally(function () {
      acquirePromise = null;
    });
    return acquirePromise;
  }

  function sessionControl(action, id) {
    return slotPost({ op: action, id: id || "" });
  }

  function shellAuth(user, password) {
    return postJson(AUTH_URL, { user: user, password: password, slot: slot.id || "" }, false, false)
      .then(function (payload) { return Boolean(payload && payload.ok === true && payload.user === user); })
      .catch(function () { return false; });
  }

  function beat() {
    if (document.hidden) return;
    if (!slot.id) { acquireSlot(); return; }
    slotPost({ op: "beat", id: slot.id }).then(function (payload) {
      if (!payload || payload.mode !== "full") throw new Error("slot expired");
    }).catch(function () {
      clearSlot();
      scheduleAcquire();
    });
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = window.setInterval(beat, heartbeatMs);
  }

  function release() {
    if (released || !slot.id) return;
    released = true;
    slotPost({ op: "release", id: slot.id }).catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) beat();
  });
  window.addEventListener("pagehide", release, { once: true });

  function fullMachine() {
    if (sharedMachine) return Promise.resolve(sharedMachine);
    if (!bootPromise) {
      bootPromise = HL.boot().then(function (machine) {
        sharedMachine = machine;
        syncLease();
        return machine;
      });
    }
    return bootPromise;
  }

  function mountTerminal(panel) {
    if (!panel || panel.dataset.mounted === "true") return;
    panel.dataset.mounted = "true";
    var body = panel.querySelector(".hlterm-body");
    var stream = panel.querySelector(".hlterm-stream");
    var matrix = panel.querySelector(".hlterm-matrix");
    var title = panel.querySelector(".hlterm-title");
    if (!body || !stream || !matrix) return;
    body.tabIndex = 0;
    instance += 1;
    var inputId = (panel.id || "hlterm-" + instance) + "-cli";
    var machine = null;
    var shell = null;
    var live = null;
    var input = null;
    var historyIndex = 0;
    var running = false;
    var runSerial = 0;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var matrixFrame = 0;
    var matrixDrops = [];
    var matrixWanted = false;
    var matrixHeight = 1;

    function scrollBottom() {
      stream.scrollTop = stream.scrollHeight;
    }

    function appendLine(value, className) {
      var line = document.createElement("div");
      line.className = className || "hlterm-line";
      line.textContent = String(value === undefined ? "" : value).replace(/\n$/, "");
      stream.insertBefore(line, live);
      scrollBottom();
      return line;
    }

    function appendPrompt(parent) {
      var prompt = document.createElement("span");
      var user = document.createElement("span");
      var host = document.createElement("span");
      var suffix = document.createElement("span");
      prompt.className = "hlterm-ps1";
      user.className = "hlterm-ps1-user";
      host.className = "hlterm-ps1-host";
      suffix.className = "hlterm-ps1-dollar";
      user.textContent = machine.identity.user;
      host.textContent = machine.identity.host;
      suffix.textContent = machine.promptSymbol();
      prompt.append(user, document.createTextNode("@"), host, document.createTextNode(":" + machine.promptPath()), suffix);
      parent.appendChild(prompt);
    }

    function updateTitle() {
      if (title) title.textContent = machine.identity.user + "@" + machine.identity.host + ": " + machine.promptPath();
      panel.dataset.shellUser = machine.identity.user;
    }

    function freeze(command) {
      if (!live) return;
      var row = document.createElement("div");
      var value = document.createElement("span");
      row.className = "hlterm-command";
      value.textContent = command ? " " + command : "";
      appendPrompt(row);
      row.appendChild(value);
      live.replaceWith(row);
      live = null;
      input = null;
    }

    function addLive() {
      if (running || !machine) return;
      updateTitle();
      live = document.createElement("div");
      live.className = "hlterm-live";
      var label = document.createElement("label");
      input = document.createElement("input");
      label.htmlFor = inputId;
      appendPrompt(label);
      input.id = inputId;
      input.className = "hlterm-input";
      input.type = "text";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Terminal command");
      live.append(label, input);
      stream.appendChild(live);
      input.addEventListener("keydown", handleKey);
      input.focus({ preventScroll: true });
      scrollBottom();
    }

    function passwordPrompt(userName) {
      running = true;
      live = document.createElement("div");
      live.className = "hlterm-live hlterm-password-live";
      var label = document.createElement("label");
      input = document.createElement("input");
      label.htmlFor = inputId;
      label.textContent = "Password:";
      input.id = inputId;
      input.className = "hlterm-input hlterm-password";
      input.type = "password";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Password");
      live.append(label, input);
      stream.appendChild(live);
      input.addEventListener("keydown", function (event) {
        if (event.ctrlKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
          live.remove();
          live = null;
          input = null;
          running = false;
          appendLine("^C", "hlterm-muted");
          addLive();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        var password = input.value;
        var row = document.createElement("div");
        row.className = "hlterm-command";
        row.textContent = "Password:";
        live.replaceWith(row);
        live = null;
        input = null;
        shellAuth(userName, password).then(function (ok) {
          password = "";
          if (ok && machine.authenticateUser(userName)) updateTitle();
          else appendLine("su: Authentication failure", "hlterm-error");
          running = false;
          addLive();
        });
      });
      input.focus({ preventScroll: true });
      scrollBottom();
    }

    function resizeMatrix() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      matrixHeight = Math.max(1, Math.round(body.clientHeight));
      matrix.width = Math.max(1, Math.round(body.clientWidth * dpr));
      matrix.height = Math.max(1, Math.round(matrixHeight * dpr));
      matrix.style.width = body.clientWidth + "px";
      matrix.style.height = matrixHeight + "px";
      var context = matrix.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      matrixDrops = Array(Math.ceil(body.clientWidth / 12)).fill(0).map(function () { return Math.random() * matrixHeight / 12; });
    }

    function paintMatrix(staticFrame) {
      var context = matrix.getContext("2d");
      context.fillStyle = staticFrame ? "rgba(5,7,19,0.72)" : "rgba(5,7,19,0.16)";
      context.fillRect(0, 0, body.clientWidth, matrixHeight);
      context.font = "12px JetBrains Mono, monospace";
      matrixDrops.forEach(function (drop, column) {
        context.fillStyle = Math.random() > 0.86 ? "rgba(170,255,190,0.94)" : "rgba(94,224,160,0.76)";
        context.fillText(Math.random() > 0.5 ? "1" : "0", column * 12, drop * 12);
        if (!staticFrame) matrixDrops[column] = drop * 12 > matrixHeight && Math.random() > 0.96 ? 0 : drop + 0.78;
      });
    }

    function drawMatrix() {
      if (!matrixFrame || reduced) return;
      paintMatrix(false);
      matrixFrame = window.requestAnimationFrame(drawMatrix);
    }

    function setMatrix(on) {
      matrixWanted = on;
      if (matrixFrame) window.cancelAnimationFrame(matrixFrame);
      matrixFrame = 0;
      matrix.classList.toggle("is-on", on);
      if (!on) {
        matrix.getContext("2d").clearRect(0, 0, matrix.width, matrix.height);
        return;
      }
      resizeMatrix();
      if (reduced) paintMatrix(true);
      else {
        matrixFrame = window.requestAnimationFrame(drawMatrix);
      }
    }

    function applyEffect(effect) {
      if (!effect) return false;
      if (effect === "clear") stream.replaceChildren();
      else if (effect === "matrix-on") setMatrix(true);
      else if (effect === "matrix-off") setMatrix(false);
      else if (effect === "reset") { setMatrix(false); stream.replaceChildren(); }
      else if (effect.authenticate) { passwordPrompt(effect.authenticate); return true; }
      else if (effect.navigate) window.location.assign(effect.navigate);
      return false;
    }

    async function execute(raw) {
      var serial = ++runSerial;
      running = true;
      body.focus({ preventScroll: true });
      var result = await shell.run(raw, { depth: 0 });
      if (serial !== runSerial) return;
      running = false;
      var effectOwnsPrompt = applyEffect(result.effect);
      if (result.stdout) appendLine(result.stdout, "hlterm-line");
      if (result.stderr) appendLine(result.stderr, "hlterm-error");
      if (window.HighLionSfx && !(result.effect && result.effect.authenticate)) {
        if (result.status === 0) window.HighLionSfx.ok();
        else window.HighLionSfx.error();
      }
      if (!effectOwnsPrompt) addLive();
    }

    function complete() {
      var caret = input.selectionStart === null ? input.value.length : input.selectionStart;
      var completion = shell.complete(input.value, caret);
      if (completion.choices.length === 1) {
        var choice = completion.choices[0];
        var suffix = choice.endsWith("/") ? "" : " ";
        input.value = input.value.slice(0, completion.start) + choice + suffix + input.value.slice(caret);
        var next = completion.start + choice.length + suffix.length;
        input.setSelectionRange(next, next);
      } else if (completion.choices.length > 1) appendLine(completion.choices.join("  "), "hlterm-muted");
    }

    function handleKey(event) {
      var key = event.key.toLowerCase();
      if (window.HighLionSfx && (event.key.length === 1 || event.key === "Backspace")) window.HighLionSfx.key();
      if (event.ctrlKey && key === "c") {
        event.preventDefault();
        if (matrixWanted) setMatrix(false);
        freeze(input.value);
        appendLine("^C", "hlterm-muted");
        addLive();
      } else if (event.ctrlKey && key === "l") {
        event.preventDefault(); stream.replaceChildren(); live = null; input = null; addLive();
      } else if (event.ctrlKey && key === "a") {
        event.preventDefault(); input.setSelectionRange(0, 0);
      } else if (event.ctrlKey && key === "e") {
        event.preventDefault(); input.setSelectionRange(input.value.length, input.value.length);
      } else if (event.ctrlKey && key === "u") {
        event.preventDefault(); input.value = "";
      } else if (event.ctrlKey && key === "w") {
        event.preventDefault();
        var caret = input.selectionStart === null ? input.value.length : input.selectionStart;
        var prefix = input.value.slice(0, caret).replace(/\s+$/, "");
        var start = Math.max(0, prefix.search(/\S+$/));
        input.value = input.value.slice(0, start) + input.value.slice(caret);
        input.setSelectionRange(start, start);
      } else if (event.key === "Enter") {
        event.preventDefault();
        var raw = input.value;
        freeze(raw);
        if (!raw.trim()) { addLive(); return; }
        machine.addHistory(raw);
        historyIndex = machine.history.length;
        execute(raw);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (historyIndex > 0) historyIndex -= 1;
        input.value = machine.history[historyIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < machine.history.length) historyIndex += 1;
        input.value = machine.history[historyIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (event.key === "Tab") {
        event.preventDefault(); complete();
      }
    }

    function bootPaint() {
      stream.replaceChildren();
      live = null;
      input = null;
      appendLine("Kali GNU/Linux Rolling", "hlterm-muted");
      appendLine("highlion tty1", "hlterm-muted");
      appendLine("", "hlterm-muted");
      appendLine(machine.identity.user + "@highlion login: " + machine.identity.user, "hlterm-muted");
      var stamp = new Date(2026, 8, 27, 9, 7, 55);
      var weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][stamp.getDay()];
      var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][stamp.getMonth()];
      var clock = [stamp.getHours(), stamp.getMinutes(), stamp.getSeconds()].map(function (part) { return String(part).padStart(2, "0"); }).join(":");
      var login = weekday + " " + month + " " + String(stamp.getDate()).padStart(2, " ") + " " + clock + " " + stamp.getFullYear();
      appendLine("Last login: " + login + " on tty1 from 10.8.0.38", "hlterm-muted");
      addLive();
    }

    body.addEventListener("keydown", function (event) {
      if (!running || !event.ctrlKey || event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      if (matrixWanted) setMatrix(false);
      runSerial += 1;
      running = false;
      appendLine("^C", "hlterm-muted");
      addLive();
    });
    body.addEventListener("click", function () { if (input) input.focus(); else body.focus(); });
    new ResizeObserver(function () { if (matrixWanted) setMatrix(true); }).observe(body);

    stream.replaceChildren();
    appendLine("acquiring session…", "hlterm-muted");
    startHeartbeat();
    acquireSlot();
    fullMachine().then(function (ready) {
      machine = ready;
      machine.attachLease(slot, sessionControl);
      shell = machine.shell || new HL.Shell(machine);
      historyIndex = machine.history.length;
      bootPaint();
    }).catch(function () {
      stream.replaceChildren();
      appendLine("Kali userspace image unavailable.", "hlterm-error");
    });
  }

  window.mountTerminal = mountTerminal;
  document.querySelectorAll("[data-hlshell]").forEach(mountTerminal);
})();
