(function () {
  "use strict";

  var panel = document.getElementById("hlterm-panel");
  if (!panel) return;

  var body = panel.querySelector(".hlterm-body");
  var output = panel.querySelector(".hlterm-out");
  var input = panel.querySelector(".hlterm-input");
  var matrix = panel.querySelector(".hlterm-matrix");
  if (!body || !output || !input || !matrix) return;

  var matrixContext = matrix.getContext("2d");
  var promptText = "www-stux@highlion:~$";
  var startedAt = Date.now();
  var history = [];
  var historyIndex = 0;
  var matrixOn = false;
  var matrixFrame = 0;
  var matrixLastFrame = 0;
  var matrixDrops = [];
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var files = {
    "README.txt": "HighLion is a self-hosted cybersecurity lab documenting networking, Linux, web infrastructure, and security operations.",
    "projects.md": "Home Lab — VLAN segmentation, Pi-hole DNS, DMZ separation, and routing.\nHighLion Web — self-hosted NGINX and Apache infrastructure.\nKali tools — local attack, defense, cleanup, and privacy mode scripts.\nNextcloud Server — SSD-backed file sync and headless administration.\nNetworking Projects — Cisco Packet Tracer labs.\nWindows AD — user automation, GPO, PSO, and ACL templates.",
    "writeups.md": "Exposed Pi-hole Admin Page — incident audit, fixed.\nCVE-2026-2441 — vulnerability research.",
    "ping.txt": "pong"
  };

  var commandHelp = {
    help: "List available commands.",
    clear: "Clear terminal output.",
    echo: "Print text: echo TEXT.",
    whoami: "Print the current user.",
    hostname: "Print the host name.",
    pwd: "Print the working directory.",
    uname: "Print system information; supports -a and -r.",
    neofetch: "Show a compact local system summary.",
    date: "Print the local date and time.",
    time: "Print the local time.",
    uptime: "Print this terminal session uptime.",
    ls: "List the fake filesystem; common flags are accepted.",
    cat: "Print a fake file: cat FILE.",
    head: "Print the first lines of a fake file: head [-n N] FILE.",
    wc: "Count lines, words, and bytes in a fake file.",
    ping: "Print a local four-packet reply sequence: ping [-c N] HOST.",
    curl: "Read a file from the local fake table; no network request is made.",
    open: "Open an allowlisted site page: home, about, projects, writeups, contact.",
    banner: "Print the HighLion banner.",
    cmatrix: "Toggle terminal-only binary rain: cmatrix on|off.",
    history: "Print command history.",
    id: "Print the fake local identity.",
    groups: "Print fake local groups.",
    ip: "Print a static local interface table: ip addr.",
    ss: "Print a static listening-socket table.",
    netstat: "Print the same static listening-socket table.",
    nmap: "Explain the shell network boundary.",
    which: "Print the fake command path.",
    type: "Describe how a command is resolved.",
    man: "Show a short manual entry: man COMMAND.",
    writeups: "List the two published writeups.",
    projects: "List the published project catalog."
  };

  var commands = Object.keys(commandHelp);

  function appendLine(text, className) {
    var line = document.createElement("div");
    line.className = className || "hlterm-line";
    line.textContent = String(text === undefined ? "" : text);
    output.appendChild(line);
    body.scrollTop = body.scrollHeight;
    return line;
  }

  function appendPrompt(command) {
    var line = document.createElement("div");
    line.className = "hlterm-command";
    var prompt = document.createElement("span");
    prompt.className = "hlterm-ps1";
    prompt.textContent = promptText;
    line.appendChild(prompt);
    if (command) line.appendChild(document.createTextNode(" " + command));
    output.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  function formatUptime() {
    var seconds = Math.floor((Date.now() - startedAt) / 1000);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainder = seconds % 60;
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function fileOrError(name, command) {
    if (Object.prototype.hasOwnProperty.call(files, name)) return files[name];
    appendLine(command + ": " + (name || "operand") + ": No such file or directory", "hlterm-error");
    return null;
  }

  function listWriteups() {
    appendLine("INCIDENT  Exposed Pi-hole Admin Page  [Fixed]");
    appendLine("RESEARCH  CVE-2026-2441              [Research]");
  }

  function listProjects() {
    appendLine("Home Lab | HighLion Web | Kali tools");
    appendLine("Nextcloud Server | Networking Projects | Windows AD");
  }

  function socketTable() {
    appendLine("Netid  State   Local Address:Port");
    appendLine("tcp    LISTEN  0.0.0.0:80");
    appendLine("tcp    LISTEN  0.0.0.0:443");
  }

  function runPing(args) {
    var count = 4;
    var host = "highlion.net";
    for (var i = 0; i < args.length; i += 1) {
      if (args[i] === "-c" && args[i + 1]) {
        count = Math.min(4, Math.max(1, parseInt(args[i + 1], 10) || 4));
        i += 1;
      } else if (args[i].indexOf("-") !== 0) {
        host = args[i];
      }
    }

    appendLine("PING " + host + " (203.0.113.8): 56 data bytes");
    var sent = 0;
    function tick() {
      sent += 1;
      appendLine("64 bytes from 203.0.113.8: icmp_seq=" + sent + " ttl=61 time=" + (11 + sent * 1.37).toFixed(2) + " ms");
      if (sent < count) {
        window.setTimeout(tick, 180);
      } else {
        appendLine("--- " + host + " ping statistics ---");
        appendLine(count + " packets transmitted, " + count + " received, 0% packet loss");
      }
    }
    window.setTimeout(tick, 120);
  }

  function runCurl(args) {
    var target = args.filter(function (item) { return item.indexOf("-") !== 0; }).pop() || "";
    if (!target) {
      appendLine("curl: try 'curl ping.txt'", "hlterm-error");
      return;
    }

    var filename = target;
    if (/^https?:\/\//i.test(target)) {
      try {
        var parsed = new URL(target);
        if (parsed.hostname !== "highlion.net" && parsed.hostname !== "www.highlion.net") {
          appendLine("curl: (6) Could not resolve host: " + parsed.hostname, "hlterm-error");
          return;
        }
        filename = parsed.pathname.split("/").filter(Boolean).pop() || "README.txt";
      } catch (error) {
        appendLine("curl: (3) URL rejected", "hlterm-error");
        return;
      }
    }

    if (Object.prototype.hasOwnProperty.call(files, filename)) appendLine(files[filename]);
    else appendLine("HTTP/1.1 404 Not Found", "hlterm-error");
  }

  function runOpen(target) {
    var routes = {
      home: "/index.html",
      about: "/about.html",
      projects: "/projects.html",
      writeups: "/writeups.html",
      contact: "/contact.html"
    };
    if (!Object.prototype.hasOwnProperty.call(routes, target)) {
      appendLine("open: allowed targets: home about projects writeups contact", "hlterm-error");
      return;
    }
    window.location.assign(routes[target]);
  }

  function resizeMatrix() {
    if (!matrixContext) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var bounds = body.getBoundingClientRect();
    matrix.width = Math.max(1, Math.floor(bounds.width * ratio));
    matrix.height = Math.max(1, Math.floor(bounds.height * ratio));
    matrix.style.width = bounds.width + "px";
    matrix.style.height = bounds.height + "px";
    matrixContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    matrixDrops = Array(Math.ceil(bounds.width / 16)).fill(0).map(function () {
      return -Math.floor(Math.random() * 24);
    });
  }

  function drawMatrix(timestamp) {
    if (!matrixOn || !matrixContext) return;
    matrixFrame = window.requestAnimationFrame(drawMatrix);
    if (timestamp - matrixLastFrame < 54) return;
    matrixLastFrame = timestamp;
    var bounds = body.getBoundingClientRect();
    matrixContext.fillStyle = "rgba(5, 11, 22, 0.18)";
    matrixContext.fillRect(0, 0, bounds.width, bounds.height);
    matrixContext.fillStyle = "rgba(64, 150, 255, 0.58)";
    matrixContext.font = "13px ui-monospace, monospace";
    matrixDrops.forEach(function (drop, index) {
      matrixContext.fillText(Math.random() > 0.5 ? "1" : "0", index * 16, drop * 16);
      matrixDrops[index] = drop * 16 > bounds.height + Math.random() * 240 ? 0 : drop + 1;
    });
  }

  function setMatrix(mode) {
    if (mode === "on") {
      if (reducedMotion) {
        appendLine("cmatrix: disabled by reduced-motion preference");
        return;
      }
      if (!matrixOn) {
        matrixOn = true;
        matrix.hidden = false;
        resizeMatrix();
        matrixFrame = window.requestAnimationFrame(drawMatrix);
      }
      appendLine("cmatrix: on");
      return;
    }
    if (mode === "off") {
      matrixOn = false;
      matrix.hidden = true;
      window.cancelAnimationFrame(matrixFrame);
      if (matrixContext) matrixContext.clearRect(0, 0, matrix.width, matrix.height);
      appendLine("cmatrix: off");
      return;
    }
    appendLine("usage: cmatrix on|off", "hlterm-error");
  }

  function execute(normalized) {
    var parts = normalized.split(" ");
    var command = parts.shift().toLowerCase();
    var args = parts;
    var file;

    switch (command) {
      case "help":
        appendLine(commands.join("  "));
        break;
      case "clear":
        output.replaceChildren();
        break;
      case "echo":
        appendLine(args.join(" "));
        break;
      case "whoami":
        appendLine("www-stux");
        break;
      case "hostname":
        appendLine("highlion.net");
        break;
      case "pwd":
        appendLine("/home/www-stux");
        break;
      case "uname":
        if (args.includes("-a")) appendLine("Linux highlion 6.6.0-hl1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux");
        else if (args.includes("-r")) appendLine("6.6.0-hl1");
        else appendLine("Linux");
        break;
      case "neofetch":
        appendLine("HIGHLION\nOS: Kali GNU/Linux Rolling\nHost: highlion.net\nKernel: 6.6.0-hl1\nShell: hlshell\nUptime: " + formatUptime() + "\nCPU: " + (navigator.hardwareConcurrency || "?") + " threads");
        break;
      case "date":
        appendLine(new Date().toString());
        break;
      case "time":
        appendLine(new Date().toLocaleTimeString());
        break;
      case "uptime":
        appendLine("up " + formatUptime() + ", 1 user, load average: 0.08, 0.12, 0.09");
        break;
      case "ls":
        appendLine(Object.keys(files).join("  "));
        break;
      case "cat":
        file = fileOrError(args.filter(function (arg) { return arg.indexOf("-") !== 0; }).pop(), "cat");
        if (file !== null) appendLine(file);
        break;
      case "head": {
        var count = 10;
        var name = args.filter(function (arg, index) {
          if (arg === "-n" && args[index + 1]) {
            count = Math.max(1, parseInt(args[index + 1], 10) || 10);
            return false;
          }
          if (index > 0 && args[index - 1] === "-n") return false;
          return arg.indexOf("-") !== 0;
        }).pop();
        file = fileOrError(name, "head");
        if (file !== null) appendLine(file.split("\n").slice(0, count).join("\n"));
        break;
      }
      case "wc": {
        var wcName = args.filter(function (arg) { return arg.indexOf("-") !== 0; }).pop();
        file = fileOrError(wcName, "wc");
        if (file !== null) {
          var lines = file.split("\n").length;
          var words = file.trim() ? file.trim().split(/\s+/).length : 0;
          var bytes = new TextEncoder().encode(file).length;
          if (args.includes("-l")) appendLine(lines + " " + wcName);
          else if (args.includes("-w")) appendLine(words + " " + wcName);
          else if (args.includes("-c")) appendLine(bytes + " " + wcName);
          else appendLine(lines + " " + words + " " + bytes + " " + wcName);
        }
        break;
      }
      case "ping":
        runPing(args);
        break;
      case "curl":
        runCurl(args);
        break;
      case "open":
        runOpen((args[0] || "").toLowerCase());
        break;
      case "banner":
        appendLine("HIGHLION // SECURITY LAB");
        break;
      case "cmatrix":
        setMatrix((args[0] || "").toLowerCase());
        break;
      case "history":
        history.forEach(function (entry, index) {
          appendLine(String(index + 1).padStart(4, " ") + "  " + entry);
        });
        break;
      case "id":
        appendLine("uid=1000(www-stux) gid=1000(www-stux) groups=1000(www-stux),27(sudo),114(netdev)");
        break;
      case "groups":
        appendLine("www-stux sudo netdev");
        break;
      case "ip":
        if (args[0] === "addr" || args[0] === "a") {
          appendLine("1: lo: <LOOPBACK,UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500\n    inet 192.168.50.24/24 scope global eth0\n    inet6 highlion.net scope global");
        } else appendLine("usage: ip addr", "hlterm-error");
        break;
      case "ss":
      case "netstat":
        socketTable();
        break;
      case "nmap":
        appendLine("nmap: disabled — this client-side shell is not networked.");
        break;
      case "which": {
        var whichCommand = (args[0] || "").toLowerCase();
        if (commands.includes(whichCommand)) appendLine("/usr/bin/" + whichCommand);
        else appendLine(whichCommand + " not found", "hlterm-error");
        break;
      }
      case "type": {
        var typeCommand = (args[0] || "").toLowerCase();
        if (commands.includes(typeCommand)) appendLine(typeCommand + " is a hlshell built-in");
        else appendLine("type: " + typeCommand + ": not found", "hlterm-error");
        break;
      }
      case "man": {
        var manCommand = (args[0] || "").toLowerCase();
        if (commandHelp[manCommand]) appendLine(manCommand.toUpperCase() + "(1)\n" + commandHelp[manCommand]);
        else appendLine("No manual entry for " + manCommand, "hlterm-error");
        break;
      }
      case "writeups":
        listWriteups();
        break;
      case "projects":
        listProjects();
        break;
      default:
        appendLine("zsh: command not found: " + command, "hlterm-error");
    }
  }

  function complete() {
    var value = input.value;
    var tokens = value.split(/\s+/);
    var current = tokens.pop() || "";
    var source = tokens.length === 0 ? commands : Object.keys(files);
    var matches = source.filter(function (item) {
      return item.toLowerCase().indexOf(current.toLowerCase()) === 0;
    });

    if (matches.length === 1) {
      tokens.push(matches[0]);
      input.value = tokens.join(" ") + (tokens.length === 1 ? " " : "");
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (matches.length > 1) {
      appendPrompt(value.trim().replace(/\s+/g, " "));
      appendLine(matches.join("  "));
    }
  }

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      var normalized = input.value.trim().replace(/\s+/g, " ");
      appendPrompt(normalized);
      input.value = "";
      if (!normalized) return;
      history.push(normalized);
      historyIndex = history.length;
      execute(normalized);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (historyIndex > 0) historyIndex -= 1;
      input.value = history[historyIndex] || "";
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex < history.length) historyIndex += 1;
      input.value = history[historyIndex] || "";
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === "Tab") {
      event.preventDefault();
      complete();
    }
  });

  body.addEventListener("click", function () { input.focus(); });
  window.addEventListener("resize", function () { if (matrixOn) resizeMatrix(); }, { passive: true });
  appendLine("HighLion hlshell — type help for commands.", "hlterm-muted");
})();
