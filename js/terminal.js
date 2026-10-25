(function () {
  "use strict";

  var HL = window.HLShell;
  if (!HL || !HL.boot) return;

  var SLOT_URL = "/api/shell-slot.php";
  var AUTH_URL = "/api/shell-auth.php";
  var CSRF_URLS = ["/api/csrf.php", "/api/csrf", "/api/csrf/"];
  var heartbeatMs = 5000;
  var sharedMachine = null;
  var bootPromise = null;
  var acquirePromise = null;
  var csrfPromise = null;
  var slot = { id: "", ttl: 90, operator: false };
  var heartbeatTimer = 0;
  var acquireTimer = 0;
  var released = false;
  var instance = 0;
  var beatPending = false;
  var controlAck = 0;
  var controlResult = null;
  var commandPending = false;
  var completedControls = new Map();
  var authController = null;
  var clientId = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
  var appearanceSaved = null;

  function restoreAppearance() {
    if (!appearanceSaved) return;
    document.documentElement.removeAttribute("data-session-theme");
    document.documentElement.removeAttribute("data-session-density");
    document.documentElement.style.removeProperty("--session-accent");
    window.dispatchEvent(new CustomEvent("hl:appearance", { detail: { restore: true } }));
    appearanceSaved = null;
  }

  function liveAppearance(action, value) {
    if (!appearanceSaved) {
      appearanceSaved = true;
      window.dispatchEvent(new CustomEvent("hl:appearance", { detail: { save: true } }));
    }
    if (action === "fx" || action === "particles") window.dispatchEvent(new CustomEvent("hl:appearance", { detail: { fx: value } }));
    else if (action === "theme") document.documentElement.dataset.sessionTheme = value;
    else if (action === "appearance") {
      var parts = value.split(" ");
      if (value === "reset") restoreAppearance();
      else if (parts[0] === "accent" && /^#[a-f0-9]{6}$/i.test(parts[1])) document.documentElement.style.setProperty("--session-accent", parts[1]);
      else if (parts[0] === "density" && ["compact", "normal"].indexOf(parts[1]) !== -1) document.documentElement.dataset.sessionDensity = parts[1];
      else if (parts[0] === "scan") window.dispatchEvent(new CustomEvent("hl:appearance", { detail: { scan: parts[1] } }));
    }
  }

  function cancelAuth() {
    if (!authController) return;
    authController.abort();
    authController = null;
    if (slot.id) sessionControl("demote", slot.id).catch(function () {});
  }

  function notifyControl(action) {
    window.dispatchEvent(new CustomEvent("hl:control", { detail: action }));
  }

  async function applyControl(payload) {
    if (!sharedMachine) return;
    if (payload.mode === "terminated") {
      released = true;
      cancelAuth();
      restoreAppearance();
      sharedMachine.controlLocked = true;
      sharedMachine.shell.cancel();
      sharedMachine.dropToKali();
      notifyControl("terminated");
      return;
    }
    var changed = sharedMachine.controlLocked !== Boolean(payload.locked);
    sharedMachine.controlLocked = Boolean(payload.locked);
    if (changed) { cancelAuth(); sharedMachine.shell.cancel(); notifyControl(payload.locked ? "locked" : "unlocked"); }
    slot.operator = Boolean(payload.operator);
    syncLease();
    if ((sharedMachine.identity.user === "admin" && !slot.operator) || (sharedMachine.identity.user === "root" && payload.user !== "root")) sharedMachine.dropToKali();
    for (var command of payload.commands || []) {
      if (!Number.isInteger(command.seq) || command.seq <= controlAck || commandPending) continue;
      commandPending = true;
      cancelAuth();
      sharedMachine.shell.cancel();
      notifyControl("interrupt");
      await sharedMachine.shell.idle();
      var result = { status: 0, stdout: "", stderr: "" };
      try {
        if (command.action === "exec") {
          sharedMachine.remoteControl = true;
          result = await sharedMachine.shell.run(command.value, { depth: 0 });
        } else if (command.action === "reset") sharedMachine.resetLocal();
        else if (["fx", "particles", "theme", "appearance"].indexOf(command.action) !== -1) liveAppearance(command.action, command.value);
        else if (command.action === "banner") window.dispatchEvent(new CustomEvent("hl:banner", { detail: String(command.value).slice(0, 240) }));
        else if (command.action !== "clear") result = { status: 1, stderr: "Unsupported control" };
        controlResult = { status: result.status, output: String(result.stdout || "") + String(result.stderr || "") };
        controlResult.output = controlResult.output.slice(0, 1800);
      } catch (error) { controlResult = { status: 1, output: "Control failed" }; }
      finally {
        controlAck = command.seq;
        completedControls.set(slot.id, { ack: controlAck, result: controlResult });
        if (completedControls.size > 16) completedControls.delete(completedControls.keys().next().value);
        sharedMachine.remoteControl = false;
        commandPending = false;
        if (command.action === "reset") restoreAppearance();
        notifyControl(command.action === "clear" || command.action === "reset" ? "clear" : "complete");
      }
      break;
    }
  }

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

  function postJson(url, payload, keepalive, retried, signal) {
    var sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
    return csrfToken(Boolean(retried)).catch(function () {
      if (!sameOrigin) throw new Error("token unavailable");
      return "";
    }).then(function (token) {
      var headers = { "Content-Type": "application/json" };
      if (token) headers["X-CSRF-TOKEN"] = token;
      return fetch(url, {
        method: "POST",
        signal: signal || AbortSignal.timeout(10000),
        credentials: "same-origin",
        cache: "no-store",
        keepalive: Boolean(keepalive),
        headers: headers,
        body: JSON.stringify(payload)
      });
    }).then(function (response) {
      if (response.status === 403 && !retried) {
        csrfPromise = null;
        return postJson(url, payload, keepalive, true, signal);
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
    cancelAuth();
    restoreAppearance();
    controlAck = 0;
    controlResult = null;
    if (sharedMachine && sharedMachine.identity.user !== "kali") sharedMachine.dropToKali();
    slot = { id: "", ttl: 90, operator: false };
    if (sharedMachine) sharedMachine.controlLocked = false;
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
    acquirePromise = Promise.resolve(window.HighLionFlags && window.HighLionFlags.ready).then(function () {
      return slotPost({ op: "acquire", client: clientId });
    }).then(function (payload) {
      if (!payload || payload.mode !== "full" || typeof payload.id !== "string" || !payload.id) throw new Error("slot unavailable");
      slot = { id: payload.id, ttl: Number(payload.ttl) || 90, operator: Boolean(payload.operator) };
      var completed = completedControls.get(slot.id);
      controlAck = completed ? completed.ack : 0;
      controlResult = completed ? completed.result : null;
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

  function sessionControl(action, id, value) {
    return slotPost({ op: action, id: id || "", actor: slot.id, value: value || "" });
  }

  async function shellAuth(user, password) {
    cancelAuth();
    var controller = new AbortController();
    authController = controller;
    var activeId = "";
    var timer = window.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var active = slot.id ? slot : await acquireSlot();
      activeId = active.id;
      if (!activeId || released || controller.signal.aborted) return false;
      var lease = await slotPost({ op: "beat", id: activeId });
      if (!lease || lease.mode !== "full" || lease.locked || activeId !== slot.id || controller.signal.aborted) return false;
      var payload = await postJson(AUTH_URL, { user: user, password: String(password || ""), slot: activeId, generation: lease.generation }, false, false, controller.signal);
      if (controller.signal.aborted || activeId !== slot.id || released) return false;
      var ok = Boolean(payload && payload.ok === true && payload.user === user);
      if (ok) { slot.operator = user === "admin"; syncLease(); }
      return ok;
    } catch (error) { return false; }
    finally {
      password = "";
      window.clearTimeout(timer);
      if (controller.signal.aborted && activeId) sessionControl("demote", activeId).catch(function () {});
      if (authController === controller) authController = null;
    }
  }

  function beat() {
    if (released || beatPending || authController) return;
    if (!slot.id) { acquireSlot(); return; }
    beatPending = true;
    var activeId = slot.id;
    slotPost({ op: "beat", id: slot.id, ack: controlAck, result: controlResult }).then(function (payload) {
      if (activeId !== slot.id || released) return;
      if (!payload || ["full", "terminated"].indexOf(payload.mode) === -1) throw new Error("slot expired");
      return applyControl(payload);
    }).catch(function () {
      clearSlot();
      scheduleAcquire();
    }).finally(function () { beatPending = false; });
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = window.setInterval(beat, heartbeatMs);
  }

  function release() {
    if (released || !slot.id) return;
    cancelAuth();
    if (sharedMachine) sharedMachine.shell.cancel();
    released = true;
    restoreAppearance();
    slotPost({ op: "release", id: slot.id }).catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) beat();
  });
  window.addEventListener("pagehide", release);
  window.addEventListener("pageshow", function (event) { if (event.persisted) { released = false; clientId = crypto.randomUUID().replace(/-/g, ""); clearSlot(); acquireSlot().then(function () { notifyControl("complete"); }); } });

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
    var inputView = null;
    var interactive = null;
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

    function paintAnsi(element, value) {
      var color = ""; var bold = false; var start = 0; var match;
      var pattern = /\x1b\[([0-9;]*)m/g;
      var colors = { 30:"black",31:"red",32:"green",33:"yellow",34:"blue",35:"magenta",36:"cyan",37:"white",90:"muted",91:"red",92:"green",93:"yellow",94:"blue",95:"magenta",96:"cyan",97:"white" };
      function text(part) {
        var span = document.createElement("span");
        span.className = (color ? "hlterm-ansi-" + color : "") + (bold ? " hlterm-ansi-bold" : "");
        span.textContent = part.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|$))?|[\x00-\x08\x0b-\x1f\x7f]/g, "");
        element.appendChild(span);
      }
      while ((match = pattern.exec(value))) {
        text(value.slice(start, match.index));
        (match[1] || "0").split(";").forEach(function (code) {
          if (code === "0") { color = ""; bold = false; }
          else if (code === "1") bold = true;
          else if (code === "22") bold = false;
          else if (code === "39") color = "";
          else if (colors[code]) color = colors[code];
        });
        start = pattern.lastIndex;
      }
      text(value.slice(start));
    }

    async function pacedOutput(value, className, serial) {
      var lines = String(value).replace(/\n$/, "").split("\n");
      var batch = reduced ? lines.length : Math.max(1, Math.ceil(lines.length / 18));
      for (var at = 0; at < lines.length; at += batch) {
        if (serial !== runSerial) return;
        appendLine(lines.slice(at, at + batch).join("\n"), className);
        if (at + batch < lines.length) await new Promise(function (resolve) { window.setTimeout(resolve, 18); });
      }
    }

    function appendLine(value, className) {
      var line = document.createElement("div");
      line.className = className || "hlterm-line";
      paintAnsi(line, String(value === undefined ? "" : value).replace(/\n$/, ""));
      while (stream.childElementCount > 400) stream.firstElementChild.remove();
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
      inputView = null;
    }

    function renderCommandInput() {
      if (!input || !inputView) return;
      var value = input.value;
      var caret = input.selectionStart === null ? value.length : input.selectionStart;
      var cursor = document.createElement("span");
      cursor.className = "hlterm-block-caret";
      cursor.textContent = value.charAt(caret) || " ";
      inputView.replaceChildren(
        document.createTextNode(value.slice(0, caret)),
        cursor,
        document.createTextNode(value.slice(caret + (caret < value.length ? 1 : 0)))
      );
    }

    function addLive() {
      if (machine && (machine.controlLocked || machine.remoteControl)) return;
      if (live) live.remove();
      if (running || !machine) return;
      updateTitle();
      live = document.createElement("div");
      live.className = "hlterm-live";
      var label = document.createElement("label");
      inputView = document.createElement("span");
      input = document.createElement("input");
      label.htmlFor = inputId;
      appendPrompt(label);
      inputView.className = "hlterm-command-buffer";
      inputView.setAttribute("aria-hidden", "true");
      input.id = inputId;
      input.className = "hlterm-capture";
      input.type = "text";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Terminal command");
      input.maxLength = 4096;
      live.append(label, inputView, input);
      stream.appendChild(live);
      input.addEventListener("keydown", handleKey);
      input.addEventListener("input", renderCommandInput);
      input.addEventListener("keyup", renderCommandInput);
      input.addEventListener("click", renderCommandInput);
      input.addEventListener("compositionend", renderCommandInput);
      renderCommandInput();
      input.focus({ preventScroll: true });
      scrollBottom();
    }

    function passwordPrompt(userName) {
      var authSerial = ++runSerial;
      running = true;
      live = document.createElement("div");
      live.className = "hlterm-live hlterm-password-live";
      var label = document.createElement("span");
      var passwordCaret = document.createElement("span");
      input = document.createElement("input");
      label.textContent = "Password:";
      passwordCaret.className = "hlterm-block-caret";
      passwordCaret.textContent = " ";
      input.id = inputId;
      input.className = "hlterm-capture hlterm-password-capture";
      input.type = "text";
      input.type = "password";
      input.maxLength = 1024;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Password");
      live.append(label, passwordCaret, input);
      stream.appendChild(live);
      input.addEventListener("input", function () {
        if (input && input.value.length > 1024) input.value = input.value.slice(0, 1024);
      });
      input.addEventListener("keydown", function (event) {
        if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "c" || event.code === "KeyC") || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          runSerial += 1;
          cancelAuth();
          input.value = "";
          live.remove();
          live = null;
          input = null;
          inputView = null;
          running = false;
          appendLine("^C", "hlterm-muted");
          addLive();
          return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        var password = input.value;
        input.value = "";
        var row = document.createElement("div");
        row.className = "hlterm-command";
        row.textContent = "Password:";
        live.replaceWith(row);
        live = null;
        input = null;
        inputView = null;
        shellAuth(userName, password).then(function (ok) {
          password = "";
          if (authSerial !== runSerial) { if (ok) machine.dropToKali(); return; }
          if (ok && machine.authenticateUser(userName)) {
            updateTitle();
            if (userName === "admin") appendLine("Developer session active. Use sessionctl help for controls.", "hlterm-success");
          }
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

    function closeInteractive(surface) {
      if (surface && surface.parentNode) surface.remove();
      interactive = null;
      running = false;
      updateTitle();
      addLive();
    }

    function clippedBuffer(value) {
      var text = String(value || "");
      if (new TextEncoder().encode(text).length <= 65536) return text;
      var low = 0;
      var high = text.length;
      while (low < high) {
        var middle = Math.ceil((low + high) / 2);
        if (new TextEncoder().encode(text.slice(0, middle)).length <= 65536) low = middle;
        else high = middle - 1;
      }
      return text.slice(0, low);
    }

    function openEditor(config) {
      running = true;
      var surface = document.createElement("section");
      var head = document.createElement("div");
      var area = document.createElement("textarea");
      var statusBar = document.createElement("div");
      var isNano = config.command === "nano";
      var original = clippedBuffer(String(config.text || ""));
      var viCommand = null;
      var nanoWritePending = false;
      surface.className = "hlterm-interactive hlterm-editor";
      surface.setAttribute("aria-label", config.command + " editor for " + config.label);
      head.className = "hlterm-editor-head";
      head.textContent = (isNano ? "GNU nano 8.6" : "VIM 9.1") + " — " + config.label;
      area.className = "hlterm-editor-buffer";
      area.value = original;
      area.autocomplete = "off";
      area.autocapitalize = "off";
      area.spellcheck = false;
      area.wrap = "off";
      statusBar.className = "hlterm-editor-status";
      surface.append(head, area, statusBar);
      stream.appendChild(surface);
      interactive = area;

      function position() {
        var before = area.value.slice(0, area.selectionStart || 0).split("\n");
        return "line " + before.length + ", col " + (before[before.length - 1].length + 1);
      }

      function modified() { return area.value !== original; }

      function paintStatus(message) {
        statusBar.textContent = message || (config.label + (modified() ? " [modified]" : "") + " — " + position());
      }

      function save() {
        if (!config.path) {
          paintStatus("No file name");
          return false;
        }
        try {
          machine.writeFile(config.path, area.value, false);
          original = area.value;
          paintStatus("wrote " + config.label + " — " + position());
          return true;
        } catch (error) {
          paintStatus("write failed: " + error.message);
          return false;
        }
      }

      area.addEventListener("input", function () {
        var limited = clippedBuffer(area.value);
        if (limited !== area.value) {
          area.value = limited;
          area.setSelectionRange(limited.length, limited.length);
          paintStatus("64 KiB buffer limit");
          return;
        }
        paintStatus();
      });
      area.addEventListener("click", function () { paintStatus(); });
      area.addEventListener("keyup", function () { if (viCommand === null && !nanoWritePending) paintStatus(); });
      area.addEventListener("keydown", function (event) {
        event.stopPropagation();
        var key = event.key;
        var lower = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : key.toLowerCase();
        var control = event.ctrlKey || event.metaKey;
        if (control && lower === "s") {
          event.preventDefault();
          save();
          return;
        }
        if (isNano && control && lower === "o") {
          event.preventDefault();
          nanoWritePending = true;
          paintStatus("File Name to Write: " + config.label);
          return;
        }
        if (isNano && nanoWritePending && key === "Enter") {
          event.preventDefault();
          nanoWritePending = false;
          save();
          return;
        }
        if (isNano && control && lower === "x") {
          event.preventDefault();
          closeInteractive(surface);
          return;
        }
        if (!isNano && viCommand !== null) {
          event.preventDefault();
          if (key === "Escape") {
            viCommand = null;
            paintStatus();
          } else if (key === "Backspace") {
            viCommand = viCommand.slice(0, -1);
            paintStatus(":" + viCommand);
          } else if (key === "Enter") {
            var command = viCommand;
            viCommand = null;
            if (command === "q!") closeInteractive(surface);
            else if (command === "wq") { if (save()) closeInteractive(surface); }
            else if (command === "w") save();
            else paintStatus("Not an editor command: " + command);
          } else if (!event.ctrlKey && !event.metaKey && key.length === 1 && viCommand.length < 32) {
            viCommand += key;
            paintStatus(":" + viCommand);
          }
          return;
        }
        if (!isNano && key === ":") {
          event.preventDefault();
          viCommand = "";
          paintStatus(":");
        }
      });
      paintStatus();
      area.focus({ preventScroll: true });
      scrollBottom();
    }

    function openPager(config) {
      running = true;
      var surface = document.createElement("section");
      var content = document.createElement("pre");
      var statusBar = document.createElement("div");
      var lines = String(config.text || "").replace(/\n$/, "").split("\n");
      var lineHeight = parseFloat(window.getComputedStyle(stream).lineHeight) || 18;
      var pageSize = Math.max(4, Math.floor((body.clientHeight - 72) / lineHeight));
      var start = 0;
      surface.className = "hlterm-interactive hlterm-pager";
      surface.tabIndex = 0;
      surface.setAttribute("role", "region");
      surface.setAttribute("aria-label", config.command + " pager for " + config.label);
      content.className = "hlterm-pager-content";
      statusBar.className = "hlterm-pager-status";
      surface.append(content, statusBar);
      stream.appendChild(surface);
      interactive = surface;

      function paint() {
        var end = Math.min(lines.length, start + pageSize);
        content.replaceChildren();
        paintAnsi(content, lines.slice(start, end).join("\n"));
        var percent = lines.length ? Math.round(end / lines.length * 100) : 100;
        statusBar.textContent = config.label + "  " + (start + 1) + "-" + end + "/" + lines.length + "  " + percent + "%  — Space/PgDn next · b/PgUp back · q quit";
      }

      surface.addEventListener("keydown", function (event) {
        event.stopPropagation();
        var key = event.key.toLowerCase();
        if (["j", "k", "q", "b", " ", "arrowdown", "arrowup", "pagedown", "pageup", "home", "end", "escape"].indexOf(key) === -1 && event.key !== "Spacebar") return;
        event.preventDefault();
        if (key === "q" || key === "escape") { closeInteractive(surface); return; }
        if (key === "home") start = 0;
        else if (key === "end") start = Math.max(0, lines.length - pageSize);
        else
        if (key === "j" || key === "arrowdown") start = Math.min(Math.max(0, lines.length - 1), start + 1);
        else if (key === "k" || key === "arrowup") start = Math.max(0, start - 1);
        else if (key === "b" || key === "pageup") start = Math.max(0, start - pageSize);
        else start = Math.min(Math.max(0, lines.length - 1), start + pageSize);
        paint();
      });
      paint();
      surface.focus({ preventScroll: true });
      scrollBottom();
    }

    function applyEffect(effect) {
      if (!effect) return false;
      if (effect === "clear") stream.replaceChildren();
      else if (effect === "matrix-on") setMatrix(true);
      else if (effect === "matrix-off") setMatrix(false);
      else if (effect === "reset") { setMatrix(false); stream.replaceChildren(); }
      else if (effect.authenticate) { passwordPrompt(effect.authenticate); return true; }
      else if (effect.editor) { openEditor(effect.editor); return true; }
      else if (effect.pager) { openPager(effect.pager); return true; }
      else if (effect.navigate) window.location.assign(effect.navigate);
      return false;
    }

    function interrupt() {
      runSerial += 1;
      shell.cancel();
      cancelAuth();
      running = false;
      if (live) live.remove();
      live = null; input = null; inputView = null;
      appendLine("^C", "hlterm-muted");
      addLive();
    }

    async function execute(raw) {
      if (machine.controlLocked || machine.remoteControl) return;
      var serial = ++runSerial;
      running = true;
      body.focus({ preventScroll: true });
      var result;
      var stop = null;
      var stopTimer = window.setTimeout(function () {
        if (serial !== runSerial) return;
        stop = document.createElement("button");
        stop.type = "button"; stop.className = "hlterm-cancel";
        stop.textContent = "Cancel · Ctrl+C / Esc";
        stop.addEventListener("click", interrupt);
        stream.appendChild(stop);
        scrollBottom();
      }, 180);
      try { result = await shell.run(raw, { depth: 0, tty: true }); }
      catch (error) { result = { status: 1, stderr: "zsh: command failed\n" }; }
      finally { window.clearTimeout(stopTimer); if (stop) stop.remove(); }
      if (serial !== runSerial) return;
      if (result.stdout && !result.effect && result.stdout.split("\n").length > 60) {
        if (result.stderr) appendLine(result.stderr, "hlterm-error");
        openPager({ command: "less", label: raw.slice(0, 64), text: result.stdout });
        return;
      }
      if (result.stdout) await pacedOutput(result.stdout, "hlterm-line", serial);
      if (result.stderr) await pacedOutput(result.stderr, "hlterm-error", serial);
      if (serial !== runSerial) return;
      running = false;
      var effectOwnsPrompt = applyEffect(result.effect);
      if (!effectOwnsPrompt) addLive();
    }

    function complete() {
      var caret = input.selectionStart === null ? input.value.length : input.selectionStart;
      var completion = shell.complete(input.value, caret);
      if (completion.choices.length === 1) {
        var choice = completion.choices[0];
        if (/\s/.test(choice)) choice = HL.quoteWord(choice);
        var suffix = choice.endsWith("/") ? "" : " ";
        input.value = input.value.slice(0, completion.start) + choice + suffix + input.value.slice(caret);
        var next = completion.start + choice.length + suffix.length;
        input.setSelectionRange(next, next);
        renderCommandInput();
      } else if (completion.choices.length > 1) appendLine(completion.choices.join("  "), "hlterm-muted");
    }

    function handleKey(event) {
      if (!input || machine.controlLocked || machine.remoteControl) { event.preventDefault(); return; }
      var key = event.key.toLowerCase();
      if (event.ctrlKey && key === "c") {
        if (window.getSelection && !window.getSelection().isCollapsed) return;
        event.preventDefault();
        shell.cancel();
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
        renderCommandInput();
      } else if (event.ctrlKey && key === "d" && input.value === "") {
        event.preventDefault();
        if (machine.identity.user !== machine.visitorName) {
          freeze("");
          machine.dropToKali();
          appendLine("logout", "hlterm-muted");
          addLive();
        }
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
        renderCommandInput();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < machine.history.length) historyIndex += 1;
        input.value = machine.history[historyIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
        renderCommandInput();
      } else if (event.key === "Tab") {
        event.preventDefault(); complete();
      }
    }

    function bootPaint() {
      stream.replaceChildren();
      live = null;
      input = null;
      inputView = null;
      appendLine("Kali GNU/Linux Rolling", "hlterm-muted");
      appendLine("highlion tty1", "hlterm-muted");
      appendLine("", "hlterm-muted");
      appendLine(machine.identity.user + "@highlion login: " + machine.identity.user, "hlterm-muted");
      var stamp = new Date(machine.started);
      var weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][stamp.getDay()];
      var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][stamp.getMonth()];
      var clock = [stamp.getHours(), stamp.getMinutes(), stamp.getSeconds()].map(function (part) { return String(part).padStart(2, "0"); }).join(":");
      var login = weekday + " " + month + " " + String(stamp.getDate()).padStart(2, " ") + " " + clock + " " + stamp.getFullYear();
      appendLine("Last login: " + login + " on tty1 from 10.8.0.38", "hlterm-muted");
      addLive();
    }

    window.addEventListener("hl:banner", function (event) { if (machine) appendLine(event.detail, "hlterm-control"); });
    window.addEventListener("hl:identity", function () { if (machine) updateTitle(); });
    window.addEventListener("hl:control", function (event) {
      if (!machine) return;
      runSerial += 1;
      running = false;
      if (live) live.remove();
      live = null; input = null; inputView = null;
      if (interactive) { var surface = interactive.closest(".hlterm-interactive"); if (surface) surface.remove(); interactive = null; }
      if (event.detail === "clear") stream.replaceChildren();
      if (event.detail === "locked" || event.detail === "terminated") appendLine("Session " + event.detail + " by administrator.", "hlterm-muted");
      if (event.detail !== "interrupt") addLive();
    });

    body.addEventListener("keydown", function (event) {
      if (interactive || !running || !((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "c" || event.code === "KeyC")) && event.key !== "Escape") return;
      event.preventDefault();
      if (matrixWanted) setMatrix(false);
      interrupt();
    });
    body.addEventListener("click", function () { if (window.getSelection && !window.getSelection().isCollapsed) return; if (interactive) interactive.focus(); else if (input) input.focus(); else body.focus(); });
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
