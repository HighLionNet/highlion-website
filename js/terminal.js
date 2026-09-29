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
    var sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
    return csrfToken(Boolean(retried)).catch(function () {
      if (!sameOrigin) throw new Error("token unavailable");
      return "";
    }).then(function (token) {
      var headers = { "Content-Type": "application/json" };
      if (token) headers["X-CSRF-TOKEN"] = token;
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: Boolean(keepalive),
        headers: headers,
        body: JSON.stringify(payload)
      });
    }).then(function (response) {
      if (response.status === 403 && !retried) {
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
    var secret = String(password || "");
    function beatActive(active) {
      if (!active || !active.id) throw new Error("slot unavailable");
      return slotPost({ op: "beat", id: active.id }).then(function (lease) {
        if (!lease || lease.ok !== true || lease.mode !== "full" || !slot.id) throw new Error("slot unavailable");
        return slot;
      });
    }
    return (slot.id ? Promise.resolve(slot) : acquireSlot())
      .then(beatActive)
      .catch(function () {
        clearSlot();
        return acquireSlot().then(beatActive);
      })
      .then(function () {
        return postJson(AUTH_URL, { user: user, password: secret, slot: slot.id }, false, false);
      })
      .then(function (payload) { return Boolean(payload && payload.ok === true && payload.user === user); })
      .catch(function () { return false; })
      .finally(function () { secret = ""; });
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
      input.setAttribute("inputmode", "none");
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
        if (event.ctrlKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
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
        content.textContent = lines.slice(start, end).join("\n");
        var percent = lines.length ? Math.round(end / lines.length * 100) : 100;
        statusBar.textContent = config.label + "  " + (start + 1) + "-" + end + "/" + lines.length + "  " + percent + "%";
      }

      surface.addEventListener("keydown", function (event) {
        event.stopPropagation();
        var key = event.key.toLowerCase();
        if (["j", "k", "q", "b", " "].indexOf(key) === -1 && event.key !== "Spacebar") return;
        event.preventDefault();
        if (key === "q") { closeInteractive(surface); return; }
        if (key === "j") start = Math.min(Math.max(0, lines.length - 1), start + 1);
        else if (key === "k") start = Math.max(0, start - 1);
        else if (key === "b") start = Math.max(0, start - pageSize);
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
      if (window.HighLionSfx && !(result.effect && (result.effect.authenticate || result.effect.sfxHandled))) {
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
        renderCommandInput();
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
      var stamp = new Date(2026, 8, 27, 9, 7, 55);
      var weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][stamp.getDay()];
      var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][stamp.getMonth()];
      var clock = [stamp.getHours(), stamp.getMinutes(), stamp.getSeconds()].map(function (part) { return String(part).padStart(2, "0"); }).join(":");
      var login = weekday + " " + month + " " + String(stamp.getDate()).padStart(2, " ") + " " + clock + " " + stamp.getFullYear();
      appendLine("Last login: " + login + " on tty1 from 10.8.0.38", "hlterm-muted");
      addLive();
    }

    body.addEventListener("keydown", function (event) {
      if (interactive || !running || !event.ctrlKey || event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      if (matrixWanted) setMatrix(false);
      runSerial += 1;
      running = false;
      appendLine("^C", "hlterm-muted");
      addLive();
    });
    body.addEventListener("click", function () { if (interactive) interactive.focus(); else if (input) input.focus(); else body.focus(); });
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
