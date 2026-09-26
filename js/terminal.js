(function () {
  "use strict";

  var HL = window.HLShell;
  if (!HL || !HL.boot) return;

  var SLOT_URL = "/api/shell-slot.php";
  var AUTH_URL = "/api/shell-auth.php";
  var heartbeatMs = 25000;
  var sharedMachine = null;
  var acquirePromise = null;
  var slot = { mode: "fallback", id: "", ttl: 90, operator: false };
  var fallbackListeners = [];
  var heartbeatTimer = 0;
  var released = false;
  var instance = 0;

  function slotPost(payload, headers) {
    return fetch(SLOT_URL, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: payload.op === "release",
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error("request failed");
      return response.json();
    });
  }

  function acquireSlot() {
    if (!acquirePromise) {
      acquirePromise = slotPost({ op: "acquire" }).then(function (payload) {
        slot = {
          mode: payload && payload.mode === "full" ? "full" : "fallback",
          id: payload && typeof payload.id === "string" ? payload.id : "",
          ttl: Number(payload && payload.ttl) || 90,
          operator: Boolean(payload && payload.operator)
        };
        startHeartbeat();
        return slot;
      }).catch(function () {
        slot = { mode: "fallback", id: "", ttl: 90, operator: false };
        return slot;
      });
    }
    return acquirePromise;
  }

  function sessionControl(action, id) {
    return slotPost({ op: action, id: id || "" });
  }

  function shellAuth(user, password) {
    return fetch(AUTH_URL, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: user, password: password, slot: slot.id || "" })
    }).then(function (response) {
      return response.json().catch(function () { return { ok: false, user: "" }; }).then(function (payload) {
        return response.ok && payload && payload.ok === true && payload.user === user;
      });
    }).catch(function () { return false; });
  }

  function enterFallback() {
    if (slot.mode === "fallback") return;
    slot.mode = "fallback";
    slot.id = "";
    slot.operator = false;
    fallbackListeners.slice().forEach(function (listener) { listener(); });
  }

  function beat() {
    if (document.hidden || slot.mode !== "full" || !slot.id) return;
    slotPost({ op: "beat", id: slot.id }).then(function (payload) {
      if (!payload || payload.mode !== "full") enterFallback();
    }).catch(enterFallback);
  }

  function startHeartbeat() {
    if (heartbeatTimer || slot.mode !== "full") return;
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
    if (!sharedMachine) sharedMachine = HL.boot();
    return sharedMachine;
  }

  function fallbackMachine() {
    var history = [];
    var snapshot = {
      "/etc/issue": "Kali GNU/Linux Rolling \\n \\l\n",
      "/etc/hostname": "highlion\n",
      "/etc/passwd": "root:x:0:0:root:/root:/bin/zsh\nadmin:x:1001:1001:Lab Admin:/home/admin:/bin/zsh\nkali:x:1000:1000:Kali User:/home/kali:/bin/zsh\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n",
      "/home/kali/README.txt": "Kali GNU/Linux Rolling\n"
    };
    var machine = {
      identity: { user: "kali", host: "highlion", home: "/home/kali" },
      cwd: "/home/kali",
      history: history,
      promptPath: function () { return "~"; },
      promptSymbol: function () { return "$"; },
      addHistory: function (line) {
        history.push(line);
        if (history.length > 300) history.splice(0, history.length - 300);
      }
    };
    machine.shell = {
      run: function (raw) {
        var line = String(raw || "").trim();
        if (!line) return Promise.resolve({ stdout: "", stderr: "", status: 0 });
        if (/[|;&<>]/.test(line)) return Promise.resolve({ stdout: "", stderr: "zsh: command not found: " + line.split(/\s+/)[0] + "\n", status: 127 });
        var parts = line.split(/\s+/);
        var name = parts.shift();
        if (name === "pwd") return Promise.resolve({ stdout: machine.cwd + "\n", stderr: "", status: 0 });
        if (name === "whoami") return Promise.resolve({ stdout: "kali\n", stderr: "", status: 0 });
        if (name === "help") return Promise.resolve({ stdout: "pwd ls cat whoami help clear cmatrix\n", stderr: "", status: 0 });
        if (name === "ls") return Promise.resolve({ stdout: "Desktop  Documents  Downloads  README.txt\n", stderr: "", status: 0 });
        if (name === "cat") {
          var path = parts[0] || "";
          if (path && path.charAt(0) !== "/") path = machine.cwd + "/" + path;
          if (Object.prototype.hasOwnProperty.call(snapshot, path)) return Promise.resolve({ stdout: snapshot[path], stderr: "", status: 0 });
          return Promise.resolve({ stdout: "", stderr: "cat: no such file or directory\n", status: 1 });
        }
        if (name === "clear") return Promise.resolve({ stdout: "", stderr: "", status: 0, effect: "clear" });
        if (name === "cmatrix") {
          if (parts.length && parts[0] !== "-q") return Promise.resolve({ stdout: "", stderr: "cmatrix: usage: cmatrix [-q]\n", status: 1 });
          return Promise.resolve({ stdout: "", stderr: "", status: 0, effect: parts[0] === "-q" ? "matrix-off" : "matrix-on" });
        }
        return Promise.resolve({ stdout: "", stderr: "zsh: command not found: " + name + "\n", status: 127 });
      },
      complete: function () { return { choices: [], start: 0 }; }
    };
    return machine;
  }

  function mountTerminal(panel) {
    if (!panel || panel.dataset.mounted === "true") return;
    panel.dataset.mounted = "true";
    var body = panel.querySelector(".hlterm-body");
    var stream = panel.querySelector(".hlterm-stream");
    var matrix = panel.querySelector(".hlterm-matrix");
    var title = panel.querySelector(".hlterm-title");
    var kicker = panel.querySelector(".hlterm-kicker");
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
      body.scrollTop = body.scrollHeight;
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
      if (kicker) kicker.textContent = machine.identity.user;
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
      matrixHeight = Math.max(1, Math.round(body.clientHeight * 0.42));
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
      var client = "10.8.0." + String(20 + Math.floor(Math.random() * 30));
      appendLine("Last login: " + new Date().toString() + " on tty1 from " + client, "hlterm-muted");
      addLive();
    }

    function activateFallback() {
      runSerial += 1;
      running = false;
      setMatrix(false);
      machine = fallbackMachine();
      shell = machine.shell;
      historyIndex = machine.history.length;
      bootPaint();
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
    fallbackListeners.push(activateFallback);

    acquireSlot().then(function (lease) {
      if (lease.mode !== "full") {
        activateFallback();
        return;
      }
      return fullMachine().then(function (ready) {
        machine = ready;
        machine.attachLease(lease, sessionControl);
        shell = machine.shell || new HL.Shell(machine);
        historyIndex = machine.history.length;
        bootPaint();
      }).catch(activateFallback);
    });
  }

  window.mountTerminal = mountTerminal;
  document.querySelectorAll("[data-hlshell]").forEach(mountTerminal);
})();
