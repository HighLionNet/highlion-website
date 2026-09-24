(function () {
  "use strict";

  var COMMANDS = [
    "help", "clear", "echo", "whoami", "hostname", "pwd", "uname", "date", "time", "uptime",
    "history", "banner", "neofetch", "ls", "cat", "head", "wc", "which", "type", "man",
    "open", "writeups", "projects", "cmatrix", "ping", "curl"
  ];
  var FILES = {
    "README.txt": "HighLion is a self-hosted cybersecurity lab for networking, Linux, web infrastructure, and security operations.",
    "projects.md": "HOME LAB — VLAN, Pi-hole, DMZ, self-hosted services, inter-VLAN routing\nNETWORKING — Cisco Packet Tracer labs\nHIGHLION WEB — nginx on Debian\nWINDOWS PRIVACY PLATFORM — local Windows 10/11 privacy and policy hub",
    "writeups.md": "Exposed Pi-hole Admin Page — incident audit, patched\nCVE-2026-2441 — vulnerability research",
    "ping.txt": "pong",
    "notes/hashes.txt": "pihole  SHA-256 25A17FC060946D52A71F53F98612964B9A16FD47EC12618435B6D0C838D89C82\ncve     SHA-256 345BD2C08A94EBEB55BD4D7D7B186921D39DD42A5941D15F170C088B29604057\npkt     MD5 3f5feff2880a5208a2de26f5d868c3ec",
    "notes/east.vlan": "HL{lab-door-on-the-east-vlan}",
    ".door": "HL{lab-door-on-the-east-vlan}"
  };
  var USAGE = {
    help: "help [command]", clear: "clear", echo: "echo [text]", whoami: "whoami", hostname: "hostname",
    pwd: "pwd", uname: "uname [-a]", date: "date", time: "time", uptime: "uptime", history: "history",
    banner: "banner", neofetch: "neofetch", ls: "ls [-a] [notes]", cat: "cat file", head: "head [-n N] file",
    wc: "wc [-l|-w|-c] file", which: "which command", type: "type command", man: "man command",
    open: "open home|about|projects|writeups|contact", writeups: "writeups", projects: "projects",
    cmatrix: "cmatrix on|off", ping: "ping [-c N]", curl: "curl file"
  };
  var DESCRIPTIONS = {
    help: "list commands", clear: "clear terminal output", echo: "print text", whoami: "print the session user",
    hostname: "print the host name", pwd: "print the current directory", uname: "print system information",
    date: "print the date", time: "print the local time", uptime: "print session uptime", history: "show command history",
    banner: "print the HighLion banner", neofetch: "show session details", ls: "list files", cat: "print a file",
    head: "print first lines", wc: "count file lines, words, or bytes", which: "locate a command",
    type: "identify a command", man: "show command help", open: "open a HighLion page", writeups: "list writeups",
    projects: "list projects", cmatrix: "toggle binary rain", ping: "ping [-c N]", curl: "read a local file"
  };
  var OPEN_TARGETS = ["home", "about", "projects", "writeups", "contact"];

  function mountTerminal(panelEl, options) {
    if (!panelEl || panelEl.dataset.mounted === "true") return;
    panelEl.dataset.mounted = "true";
    options = options || {};
    var body = panelEl.querySelector(".hlterm-body");
    var output = panelEl.querySelector(".hlterm-out");
    var input = panelEl.querySelector(".hlterm-input");
    var matrix = panelEl.querySelector(".hlterm-matrix");
    if (!body || !output || !input || !matrix) return;

    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var started = Date.now();
    var history = [];
    var historyIndex = 0;
    var matrixFrame = 0;
    var matrixDrops = [];
    var promptText = "www-stux@highlion:~$";

    function appendLine(text, className) {
      var line = document.createElement("div");
      line.className = className || "hlterm-line";
      line.textContent = String(text);
      output.appendChild(line);
      body.scrollTop = body.scrollHeight;
    }

    function appendPrompt(command) {
      var line = document.createElement("div");
      var prompt = document.createElement("span");
      var text = document.createElement("span");
      line.className = "hlterm-command";
      prompt.className = "hlterm-ps1";
      prompt.textContent = promptText;
      text.textContent = command ? " " + command : "";
      line.append(prompt, text);
      output.appendChild(line);
      body.scrollTop = body.scrollHeight;
    }

    function appendLines(lines, className) {
      lines.forEach(function (line) { appendLine(line, className); });
    }

    function showUsage(command) {
      appendLine("usage: " + USAGE[command], "hlterm-error");
    }

    function getFile(name, command) {
      if (Object.prototype.hasOwnProperty.call(FILES, name)) return FILES[name];
      appendLine(command + ": " + name + ": No such file or directory", "hlterm-error");
      return null;
    }

    function elapsed() {
      var seconds = Math.floor((Date.now() - started) / 1000);
      var hours = Math.floor(seconds / 3600);
      var minutes = Math.floor((seconds % 3600) / 60);
      return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    }

    function showHelp(command) {
      if (command) {
        if (COMMANDS.indexOf(command) === -1) {
          appendLine("No manual entry for " + command, "hlterm-error");
          return;
        }
        appendLine(USAGE[command]);
        appendLine(DESCRIPTIONS[command]);
        return;
      }
      COMMANDS.forEach(function (name) { appendLine(name); });
    }

    function listFiles(args) {
      if (!args.length) {
        appendLine("README.txt  notes  ping.txt  projects.md  writeups.md");
        return;
      }
      if (args.length === 1 && args[0] === "notes") {
        appendLine("hashes.txt  east.vlan");
        return;
      }
      if (args.length === 1 && args[0] === "-a") {
        appendLine(".  ..  .door  README.txt  notes  notes/east.vlan  ping.txt  projects.md  writeups.md");
        return;
      }
      if (args.length === 2 && args[0] === "-a" && args[1] === "notes") {
        appendLine(".  ..  hashes.txt  east.vlan");
        return;
      }
      showUsage("ls");
    }

    function headFile(args) {
      var count = 10;
      var name = "";
      if (args.length === 1) name = args[0];
      else if (args.length === 3 && args[0] === "-n" && /^\d+$/.test(args[1])) {
        count = Math.max(1, Number(args[1]));
        name = args[2];
      } else {
        showUsage("head");
        return;
      }
      var text = getFile(name, "head");
      if (text !== null) appendLines(text.split("\n").slice(0, count));
    }

    function wordCount(args) {
      var mode = "";
      var name = "";
      if (args.length === 1) name = args[0];
      else if (args.length === 2 && ["-l", "-w", "-c"].indexOf(args[0]) !== -1) {
        mode = args[0];
        name = args[1];
      } else {
        showUsage("wc");
        return;
      }
      var value = getFile(name, "wc");
      if (value === null) return;
      var lines = value ? value.split("\n").length : 0;
      var words = value.trim() ? value.trim().split(/\s+/).length : 0;
      var bytes = new TextEncoder().encode(value).length;
      var count = mode === "-l" ? lines : mode === "-w" ? words : mode === "-c" ? bytes : lines + " " + words + " " + bytes;
      appendLine(count + " " + name);
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
      if (!matrixFrame || reducedMotion.matches) return;
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

    function matrixOff(silent) {
      if (matrixFrame) window.cancelAnimationFrame(matrixFrame);
      matrixFrame = 0;
      matrix.classList.remove("is-on");
      matrix.getContext("2d").clearRect(0, 0, matrix.width, matrix.height);
      if (!silent) appendLine("cmatrix: off", "hlterm-muted");
    }

    function matrixOn(silent) {
      if (reducedMotion.matches) {
        matrixOff(true);
        return;
      }
      resizeMatrix();
      matrix.classList.add("is-on");
      if (!matrixFrame) matrixFrame = window.requestAnimationFrame(drawMatrix);
      if (!silent) appendLine("cmatrix: on", "hlterm-ok");
    }

    function runPing(args) {
      var count = 4;
      var host = "127.0.0.1";
      if (!args.length) {
        host = "127.0.0.1";
      } else if (args.length === 1) {
        host = args[0];
      } else if (args.length === 2 && args[0] === "-c" && /^\d+$/.test(args[1])) {
        count = Math.min(8, Math.max(1, Number(args[1])));
      } else {
        showUsage("ping");
        return;
      }
      if (host !== "127.0.0.1") {
        appendLine("ping: " + host + ": Name or service not known", "hlterm-error");
        return;
      }
      appendLine("PING 127.0.0.1 (127.0.0.1) 56(84) bytes of data.");
      for (var index = 1; index <= count; index += 1) {
        appendLine("64 bytes from 127.0.0.1: icmp_seq=" + index + " ttl=64 time=0.0" + index + " ms");
      }
      appendLine("--- 127.0.0.1 ping statistics ---");
      appendLine(count + " packets transmitted, " + count + " received, 0% packet loss");
    }

    function runCurl(args) {
      if (args.length !== 1) {
        showUsage("curl");
        return;
      }
      var target = args[0];
      var name = target;
      if (/^https?:\/\//i.test(target)) {
        try {
          var url = new URL(target);
          if (["highlion.net", "www.highlion.net"].indexOf(url.hostname) === -1) {
            appendLine("curl: (6) Could not resolve host: " + url.hostname, "hlterm-error");
            return;
          }
          name = decodeURIComponent(url.pathname.replace(/^\//, ""));
        } catch (error) {
          showUsage("curl");
          return;
        }
      }
      if (!Object.prototype.hasOwnProperty.call(FILES, name)) {
        appendLine("curl: (6) Could not resolve host: " + target, "hlterm-error");
        return;
      }
      appendLine(FILES[name]);
    }

    function execute(raw) {
      var tokens = raw.trim().split(/\s+/);
      var command = tokens.shift().toLowerCase();
      var args = tokens;
      switch (command) {
        case "help": if (args.length <= 1) showHelp((args[0] || "").toLowerCase()); else showUsage(command); break;
        case "clear": if (!args.length) output.replaceChildren(); else showUsage(command); break;
        case "echo": appendLine(args.join(" ")); break;
        case "whoami": if (!args.length) appendLine("www-stux"); else showUsage(command); break;
        case "hostname": if (!args.length) appendLine("highlion.net"); else showUsage(command); break;
        case "pwd": if (!args.length) appendLine("/home/www-stux"); else showUsage(command); break;
        case "uname": if (!args.length) appendLine("Linux"); else if (args.length === 1 && args[0] === "-a") appendLine("Linux highlion 6.6.0-hl1 x86_64 GNU/Linux"); else showUsage(command); break;
        case "date": if (!args.length) appendLine(new Date().toDateString()); else showUsage(command); break;
        case "time": if (!args.length) appendLine(new Date().toLocaleTimeString()); else showUsage(command); break;
        case "uptime": if (!args.length) appendLine(elapsed()); else showUsage(command); break;
        case "history": if (!args.length) history.forEach(function (entry, index) { appendLine(String(index + 1).padStart(4, " ") + "  " + entry); }); else showUsage(command); break;
        case "banner": if (!args.length) appendLines(["H I G H L I O N", "HLv9 / highlion.net"]); else showUsage(command); break;
        case "neofetch": if (!args.length) appendLines(["www-stux@highlion", "OS: Debian", "Shell: hlshell", "Uptime: " + elapsed(), "Viewport: " + window.innerWidth + "x" + window.innerHeight]); else showUsage(command); break;
        case "ls": listFiles(args); break;
        case "cat": if (args.length === 1) { var file = getFile(args[0], command); if (file !== null) appendLine(file); } else showUsage(command); break;
        case "head": headFile(args); break;
        case "wc": wordCount(args); break;
        case "which": if (args.length === 1) appendLine(COMMANDS.indexOf(args[0]) !== -1 ? "/usr/bin/" + args[0] : args[0] + " not found"); else showUsage(command); break;
        case "type": if (args.length === 1) appendLine(COMMANDS.indexOf(args[0]) !== -1 ? args[0] + " is a hlshell built-in" : "type: " + args[0] + ": not found"); else showUsage(command); break;
        case "man": if (args.length === 1) showHelp(args[0].toLowerCase()); else showUsage(command); break;
        case "open": if (args.length === 1 && OPEN_TARGETS.indexOf(args[0]) !== -1) window.location.assign(args[0] === "home" ? "/index.html" : "/" + args[0] + ".html"); else showUsage(command); break;
        case "writeups": if (!args.length) appendLines(["INCIDENT  Exposed Pi-hole Admin Page  [Patched]", "RESEARCH  CVE-2026-2441              [Research]"]); else showUsage(command); break;
        case "projects": if (!args.length) appendLines(["HOME LAB", "NETWORKING", "HIGHLION WEB", "WINDOWS PRIVACY PLATFORM"]); else showUsage(command); break;
        case "cmatrix": if (args.length === 1 && args[0] === "on") matrixOn(false); else if (args.length === 1 && args[0] === "off") matrixOff(false); else showUsage(command); break;
        case "ping": runPing(args); break;
        case "curl": runCurl(args); break;
        default: appendLine("zsh: command not found: " + command, "hlterm-error");
      }
    }

    function complete() {
      var value = input.value;
      var tokens = value.split(/\s+/);
      var current = tokens.pop() || "";
      var source = tokens.length ? Object.keys(FILES).concat(OPEN_TARGETS) : COMMANDS;
      var matches = source.filter(function (item) { return item.toLowerCase().indexOf(current.toLowerCase()) === 0; });
      if (matches.length === 1) {
        tokens.push(matches[0]);
        input.value = tokens.join(" ") + " ";
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var raw = input.value;
        appendPrompt(raw.trim());
        input.value = "";
        if (!raw.trim()) return;
        history.push(raw.trim());
        historyIndex = history.length;
        execute(raw);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (historyIndex > 0) historyIndex -= 1;
        input.value = history[historyIndex] || "";
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < history.length) historyIndex += 1;
        input.value = history[historyIndex] || "";
      } else if (event.key === "Tab") {
        event.preventDefault();
        complete();
      }
      input.setSelectionRange(input.value.length, input.value.length);
    });

    body.addEventListener("click", function () { input.focus(); });
    window.addEventListener("resize", function () { if (matrixFrame) resizeMatrix(); }, { passive: true });
    reducedMotion.addEventListener("change", function () {
      if (reducedMotion.matches) matrixOff(true);
      else if (options.matrixDefaultOn) matrixOn(true);
    });
    appendLine("HighLion hlshell / HLv9 / type help", "hlterm-muted");
    if (options.matrixDefaultOn) matrixOn(true);
  }

  window.mountTerminal = mountTerminal;
  document.querySelectorAll("[data-hlshell]").forEach(function (panel) {
    mountTerminal(panel, { matrixDefaultOn: panel.dataset.matrixDefault === "on" });
  });
})();
