(function () {
  "use strict";

  var HL = window.HLShell;
  if (!HL || !HL.boot) return;
  var sharedMachine = HL.boot();
  var instance = 0;

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
    var authPending = false;
    var runSerial = 0;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var matrixFrame = 0;
    var matrixDrops = [];
    var matrixWanted = false;

    function scrollBottom() {
      body.scrollTop = body.scrollHeight;
    }

    function appendLine(text, className) {
      if (text === "") return null;
      var line = document.createElement("div");
      line.className = className || "hlterm-line";
      line.textContent = String(text).replace(/\n$/, "");
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

    function freezeSecret() {
      if (!live) return;
      var row = document.createElement("div");
      row.className = "hlterm-command hlterm-muted";
      row.textContent = "Password: ";
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
      if (authPending) label.appendChild(document.createTextNode("Password: "));
      else appendPrompt(label);
      input.id = inputId;
      input.className = "hlterm-input";
      input.type = authPending ? "password" : "text";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", authPending ? "Root password" : "Terminal command");
      live.append(label, input);
      stream.appendChild(live);
      input.addEventListener("keydown", handleKey);
      input.focus({ preventScroll: true });
      scrollBottom();
    }

    function resizeMatrix() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      matrix.width = Math.max(1, Math.round(body.clientWidth * dpr));
      matrix.height = Math.max(1, Math.round(body.clientHeight * dpr));
      matrix.style.width = body.clientWidth + "px";
      matrix.style.height = body.clientHeight + "px";
      var context = matrix.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      matrixDrops = Array(Math.ceil(body.clientWidth / 14)).fill(0).map(function () { return Math.random() * body.clientHeight / 14; });
    }

    function drawMatrix() {
      if (!matrixFrame || reduced.matches) return;
      var context = matrix.getContext("2d");
      context.fillStyle = "rgba(5,7,19,0.16)";
      context.fillRect(0, 0, body.clientWidth, body.clientHeight);
      context.font = "14px JetBrains Mono, monospace";
      matrixDrops.forEach(function (drop, column) {
        context.fillStyle = Math.random() > 0.84 ? "rgba(102,247,255,0.88)" : "rgba(61,139,255,0.72)";
        context.fillText(Math.random() > 0.5 ? "1" : "0", column * 14, drop * 14);
        matrixDrops[column] = drop * 14 > body.clientHeight && Math.random() > 0.97 ? 0 : drop + 0.82;
      });
      matrixFrame = window.requestAnimationFrame(drawMatrix);
    }

    function setMatrix(on) {
      matrixWanted = on;
      if (matrixFrame) window.cancelAnimationFrame(matrixFrame);
      matrixFrame = 0;
      matrix.classList.toggle("is-on", on && !reduced.matches);
      if (on && !reduced.matches) {
        resizeMatrix();
        matrixFrame = window.requestAnimationFrame(drawMatrix);
      } else {
        matrix.getContext("2d").clearRect(0, 0, matrix.width, matrix.height);
      }
    }

    function applyEffect(effect) {
      if (!effect) return false;
      if (effect === "clear") stream.replaceChildren();
      else if (effect === "matrix-on") setMatrix(true);
      else if (effect === "matrix-off") setMatrix(false);
      else if (effect.navigate) window.location.assign(effect.navigate);
      else if (effect.type === "root-auth") {
        authPending = true;
        addLive();
        return true;
      }
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
      if (window.HighLionSfx) {
        if (result.status === 0) window.HighLionSfx.ok();
        else window.HighLionSfx.error();
      }
      if (!effectOwnsPrompt) addLive();
    }

    async function authenticate(password) {
      running = true;
      var valid = false;
      try { valid = await machine.authenticateRoot(password); } catch (error) { valid = false; }
      running = false;
      authPending = false;
      if (valid) {
        appendLine("Owner console unlocked. Browser VFS only; no server privilege granted.", "hlterm-muted");
        if (window.HighLionSfx) window.HighLionSfx.ok();
      } else {
        appendLine("su: Authentication failure", "hlterm-error");
        if (window.HighLionSfx) window.HighLionSfx.error();
      }
      addLive();
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
      } else if (completion.choices.length > 1) {
        appendLine(completion.choices.join("  "), "hlterm-muted");
      }
    }

    function handleKey(event) {
      var key = event.key.toLowerCase();
      if (window.HighLionSfx && (event.key.length === 1 || event.key === "Backspace")) window.HighLionSfx.key();
      if (event.ctrlKey && key === "c") {
        event.preventDefault();
        if (authPending) freezeSecret();
        else freeze(input.value);
        authPending = false;
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
        if (authPending) {
          freezeSecret();
          authenticate(raw);
          return;
        }
        freeze(raw);
        if (!raw.trim()) { addLive(); return; }
        machine.addHistory(raw);
        historyIndex = machine.history.length;
        execute(raw);
      } else if (!authPending && event.key === "ArrowUp") {
        event.preventDefault();
        if (historyIndex > 0) historyIndex -= 1;
        input.value = machine.history[historyIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (!authPending && event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < machine.history.length) historyIndex += 1;
        input.value = machine.history[historyIndex] || "";
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (!authPending && event.key === "Tab") {
        event.preventDefault(); complete();
      }
    }

    body.addEventListener("keydown", function (event) {
      if (!running || !event.ctrlKey || event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      runSerial += 1;
      running = false;
      appendLine("^C", "hlterm-muted");
      addLive();
    });
    body.addEventListener("click", function () { if (input) input.focus(); else body.focus(); });
    window.addEventListener("resize", function () { if (matrixFrame) resizeMatrix(); }, { passive: true });
    reduced.addEventListener("change", function () { if (matrixWanted) setMatrix(true); });

    sharedMachine.then(function (ready) {
      machine = ready;
      shell = machine.shell || new HL.Shell(machine);
      historyIndex = machine.history.length;
      updateTitle();
      appendLine("HighLion tty1", "hlterm-muted");
      appendLine(machine.identity.user + "@" + machine.identity.host + " login: " + machine.identity.user, "hlterm-muted");
      appendLine("Last login: local session", "hlterm-muted");
      try { appendLine(machine.readFile("/etc/motd"), "hlterm-muted"); } catch (error) {}
      addLive();
    }).catch(function (error) {
      appendLine("machine boot failed: " + error.message, "hlterm-error");
    });
  }

  window.mountTerminal = mountTerminal;
  document.querySelectorAll("[data-hlshell]").forEach(mountTerminal);
})();
