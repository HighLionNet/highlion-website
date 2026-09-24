(function () {
  "use strict";

  var COMMANDS = [
    "help", "man", "banner", "neofetch", "whoami", "hostname", "pwd", "uname", "date", "uptime", "history", "id", "groups",
    "clear", "echo", "which", "type",
    "ls", "cat", "head", "wc", "find", "grep", "tree", "sha256sum",
    "ps", "df", "free", "ip", "ss", "lsb_release", "hostnamectl",
    "cmatrix", "cowsay", "fortune", "sl", "figlet",
    "ping", "curl", "open", "writeups", "projects"
  ];
  var FILES = {
    "README.txt": "HighLion is a self-hosted cybersecurity lab for networking, Linux, web infrastructure, and security operations.",
    "projects.md": "Home Lab\nNetworking\nHighLion Web\nWindows Privacy Platform",
    "writeups.md": "Exposed Pi-hole Admin Page\nCVE-2026-2441",
    "ping.txt": "pong",
    "notes/hashes.txt": "pihole  SHA-256 25A17FC060946D52A71F53F98612964B9A16FD47EC12618435B6D0C838D89C82\ncve     SHA-256 345BD2C08A94EBEB55BD4D7D7B186921D39DD42A5941D15F170C088B29604057\npkt     MD5 3f5feff2880a5208a2de26f5d868c3ec",
    "notes/ops.txt": "rail check: the briefing is off-catalog",
    "notes/motd.txt": "Read the rails. Follow the briefing. Keep probes local.",
    ".brief": "hex lives on the east node",
    ".hidden": "ls -a"
  };
  var HASHES = {
    "README.txt": "965d83c01eeb0d3ad079c1250a163e70947d45e87ee26a52e6d8250c5a43a650",
    "projects.md": "64703fde1bf4e2c612064a940d7f58fef5c311144635fdd25f9bdc2a8e2ddec5",
    "writeups.md": "21e1e5d0d437322241cbd895dc7d817c2bde5410a9ff0d45abc145eb74c9d16c",
    "ping.txt": "9795c5ff8937f23526ccb207a5684c1fc94a7854e19c021b39d944e51f5baef2",
    "notes/hashes.txt": "4b7ef81ff791235e21b3440e59fd3c7a8bf8eb0153f11a4c5d0086630b2eb762",
    "notes/ops.txt": "a363fb52cdb355ebae7396790a5c445e6cdc1401ff0511988ad3a5d683c0a40e",
    "notes/motd.txt": "5c13055ee3611b4a9a8d39f9ef970fea9eeca7735b07a2c7c467aaa63fbb0871",
    ".brief": "ff15e972689dc0d7451b0753e71c9a8be5654737b26b15adc54f645de8dfe012",
    ".hidden": "5c1fa7f4f5a9dc65179c7eb464b22c7d8f4c2582e2f5e3d375a62474e936bfc1"
  };
  var USAGE = {
    help: "help [cmd]", man: "man CMD", banner: "banner", neofetch: "neofetch", whoami: "whoami", hostname: "hostname",
    pwd: "pwd", uname: "uname [-a]", date: "date", uptime: "uptime", history: "history", id: "id", groups: "groups",
    clear: "clear", echo: "echo [text]", which: "which CMD", type: "type CMD",
    ls: "ls [-a] [-l] [path]", cat: "cat FILE", head: "head [-n N] FILE", wc: "wc [-l|-w|-c] FILE",
    find: "find [path]", grep: "grep [-n] PATTERN FILE", tree: "tree", sha256sum: "sha256sum FILE",
    ps: "ps", df: "df -h", free: "free -h", ip: "ip a", ss: "ss -tuln", lsb_release: "lsb_release -a", hostnamectl: "hostnamectl",
    cmatrix: "cmatrix [on|off]", cowsay: "cowsay [-f tux] [text]", fortune: "fortune", sl: "sl", figlet: "figlet HighLion|HLv8|help",
    ping: "ping [-c N] HOST", curl: "curl PATH|https://www.highlion.net/PATH",
    open: "open home|about|projects|writeups|contact", writeups: "writeups", projects: "projects"
  };
  var DESCRIPTIONS = {
    help: "show grouped help or help for one command", man: "show a command manual entry", banner: "print the HighLion banner",
    neofetch: "show the local lab profile", whoami: "print the session user", hostname: "print the host name", pwd: "print the working directory",
    uname: "print kernel information", date: "print the current date", uptime: "print session uptime and load", history: "show command history",
    id: "print user and group IDs", groups: "print group memberships", clear: "clear the terminal", echo: "print text",
    which: "show a command path", type: "identify a shell builtin", ls: "list fake filesystem entries", cat: "print a fake file",
    head: "print the first lines of a fake file", wc: "count lines, words, or bytes", find: "list matching fake paths",
    grep: "search a fake file", tree: "draw the fake filesystem", sha256sum: "hash a fake file",
    ps: "show the lab process snapshot", df: "show the lab filesystem snapshot", free: "show the lab memory snapshot", ip: "show the lab interface snapshot",
    ss: "show the lab socket snapshot", lsb_release: "show the lab Debian snapshot", hostnamectl: "show the lab host snapshot", cmatrix: "toggle local matrix rain",
    cowsay: "draw a cow or tux with a message", fortune: "print a lab fortune", sl: "animate a local ASCII locomotive",
    figlet: "print one supported block word", ping: "run a timed local simulation", curl: "read a fake local path",
    open: "open a HighLion page", writeups: "list published writeups", projects: "list project titles"
  };
  var OPEN_TARGETS = ["home", "about", "projects", "writeups", "contact"];
  var FORTUNES = [
    "Trust the log, then verify the clock.",
    "A quiet port still belongs in the inventory.",
    "Good segmentation makes boring incidents.",
    "Read the response headers before the source.",
    "The smallest reproducible case wins.",
    "Backups are a feature only after a restore test.",
    "Names are clues; hashes are evidence.",
    "Measure twice, expose once.",
    "Local toys stay local.",
    "Follow the rails, not the glow."
  ];
  var FIGLETS = {
    highlion: ["H H I GGG H H L   I OOO N N", "HHH I G G HHH L   I O O NNN", "H H I GGG H H LLL I OOO N N"],
    hlv8: ["H H L   V V 888", "HHH L   V V 8 8", "H H LLL  V  888"],
    help: ["H H EEE L   PPP", "HHH EE  L   P P", "H H EEE LLL PPP"]
  };
  var instanceCount = 0;

  function mountTerminal(panelEl) {
    if (!panelEl || panelEl.dataset.mounted === "true") return;
    panelEl.dataset.mounted = "true";
    var body = panelEl.querySelector(".hlterm-body");
    var stream = panelEl.querySelector(".hlterm-stream");
    var matrix = panelEl.querySelector(".hlterm-matrix");
    if (!body || !stream || !matrix) return;

    instanceCount += 1;
    var inputId = (panelEl.id || "hlterm-" + instanceCount) + "-cli";
    var promptText = "www-stux@highlion:~$";
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var started = Date.now();
    var history = [];
    var historyIndex = 0;
    var live = null;
    var input = null;
    var matrixFrame = 0;
    var matrixDrops = [];
    var matrixWanted = false;
    var pingBusy = false;
    var pingTimer = 0;

    function scrollBottom() {
      body.scrollTop = body.scrollHeight;
    }

    function appendLine(text, className) {
      var line = document.createElement("div");
      line.className = className || "hlterm-line";
      line.textContent = String(text);
      stream.insertBefore(line, live);
      scrollBottom();
      return line;
    }

    function appendLines(lines, className) {
      lines.forEach(function (line) { appendLine(line, className); });
    }

    function freezeLive(command) {
      if (!live) return;
      var row = document.createElement("div");
      var prompt = document.createElement("span");
      var value = document.createElement("span");
      row.className = "hlterm-command";
      prompt.className = "hlterm-ps1";
      prompt.textContent = promptText;
      value.textContent = command ? " " + command : "";
      row.append(prompt, value);
      live.replaceWith(row);
      live = null;
      input = null;
    }

    function addLive() {
      live = document.createElement("div");
      live.className = "hlterm-live";
      var label = document.createElement("label");
      input = document.createElement("input");
      label.htmlFor = inputId;
      label.textContent = promptText;
      input.id = inputId;
      input.className = "hlterm-input";
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Terminal command");
      live.append(label, input);
      stream.appendChild(live);
      input.addEventListener("keydown", handleKey);
      input.focus({ preventScroll: true });
      scrollBottom();
    }

    function showUsage(command) {
      appendLine("usage: " + USAGE[command], "hlterm-error");
    }

    function normalizedPath(raw) {
      return String(raw || "")
        .replace(/^https?:\/\/www\.highlion\.net\//i, "")
        .replace(/^\/home\/www-stux\//, "")
        .replace(/^\.\//, "")
        .replace(/^\//, "")
        .replace(/\/$/, "");
    }

    function getFile(raw, command) {
      var name = normalizedPath(raw);
      if (Object.prototype.hasOwnProperty.call(FILES, name)) return { name: name, text: FILES[name] };
      appendLine(command + ": " + raw + ": No such file or directory", "hlterm-error");
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
        appendLine("usage: " + USAGE[command], "hlterm-ok");
        appendLine(DESCRIPTIONS[command]);
        return;
      }
      appendLines([
        "info       help man banner neofetch whoami hostname pwd",
        "           uname date uptime history id groups",
        "files      ls cat head wc find grep tree sha256sum",
        "system     ps df free ip ss lsb_release hostnamectl",
        "toys       cmatrix cowsay fortune sl figlet",
        "net        ping curl",
        "site       open writeups projects"
      ]);
    }

    function visibleNames(path, all) {
      var prefix = path === "notes" ? "notes/" : "";
      var names = [];
      Object.keys(FILES).forEach(function (name) {
        if (prefix && name.indexOf(prefix) === 0 && name.slice(prefix.length).indexOf("/") === -1) names.push(name.slice(prefix.length));
        if (!prefix && name.indexOf("/") === -1 && (all || name.charAt(0) !== ".")) names.push(name);
      });
      if (!prefix) names.push("notes");
      return names.sort();
    }

    function listFiles(args) {
      var all = false;
      var long = false;
      var path = "";
      for (var index = 0; index < args.length; index += 1) {
        if (args[index] === "-a") all = true;
        else if (args[index] === "-l") long = true;
        else if (args[index].charAt(0) === "-" || path) { showUsage("ls"); return; }
        else path = normalizedPath(args[index]);
      }
      if (path && path !== "notes") { appendLine("ls: " + path + ": No such directory", "hlterm-error"); return; }
      var names = visibleNames(path, all);
      if (all) names.unshift(".", "..");
      if (!long) { appendLine(names.join("  ")); return; }
      names.forEach(function (name) {
        var full = path === "notes" && name !== "." && name !== ".." ? "notes/" + name : name;
        var size = FILES[full] ? new TextEncoder().encode(FILES[full]).length : 0;
        var mode = name === "notes" || name === "." || name === ".." ? "drwxr-xr-x" : "-rw-r--r--";
        appendLine(mode + " 1 www-stux www-stux " + String(size).padStart(4, " ") + " " + name);
      });
    }

    function headFile(args) {
      var count = 10;
      var name = "";
      if (args.length === 1) name = args[0];
      else if (args.length === 3 && args[0] === "-n" && /^\d+$/.test(args[1]) && Number(args[1]) > 0) {
        count = Number(args[1]);
        name = args[2];
      } else { showUsage("head"); return; }
      var file = getFile(name, "head");
      if (file) appendLines(file.text.split("\n").slice(0, count));
    }

    function wordCount(args) {
      var mode = "";
      var name = "";
      if (args.length === 1) name = args[0];
      else if (args.length === 2 && ["-l", "-w", "-c"].indexOf(args[0]) !== -1) { mode = args[0]; name = args[1]; }
      else { showUsage("wc"); return; }
      var file = getFile(name, "wc");
      if (!file) return;
      var lines = file.text === "" ? 0 : file.text.split("\n").length;
      var words = file.text.trim() ? file.text.trim().split(/\s+/).length : 0;
      var bytes = new TextEncoder().encode(file.text).length;
      var result = mode === "-l" ? lines : mode === "-w" ? words : mode === "-c" ? bytes : lines + " " + words + " " + bytes;
      appendLine(result + " " + file.name);
    }

    function findFiles(args) {
      if (args.length > 1 || (args[0] && args[0].charAt(0) === "-")) { showUsage("find"); return; }
      var path = normalizedPath(args[0] || "");
      var matches = Object.keys(FILES).filter(function (name) { return !path || path === "." || name === path || name.indexOf(path + "/") === 0; });
      if (!matches.length) { appendLine("find: " + (args[0] || path) + ": No such file or directory", "hlterm-error"); return; }
      matches.sort().forEach(function (name) { appendLine("./" + name); });
    }

    function grepFile(args) {
      var numbered = false;
      if (args[0] === "-n") { numbered = true; args = args.slice(1); }
      if (args.length !== 2 || args[0].charAt(0) === "-") { showUsage("grep"); return; }
      var file = getFile(args[1], "grep");
      if (!file) return;
      file.text.split("\n").forEach(function (line, index) {
        if (line.indexOf(args[0]) !== -1) appendLine((numbered ? index + 1 + ":" : "") + line);
      });
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
      matrixWanted = false;
      if (matrixFrame) window.cancelAnimationFrame(matrixFrame);
      matrixFrame = 0;
      matrix.classList.remove("is-on");
      matrix.getContext("2d").clearRect(0, 0, matrix.width, matrix.height);
      if (!silent) appendLine("cmatrix: off", "hlterm-muted");
    }

    function matrixOn() {
      if (reducedMotion.matches) {
        appendLine("cmatrix: reduced motion is enabled", "hlterm-error");
        return;
      }
      matrixWanted = true;
      resizeMatrix();
      matrix.classList.add("is-on");
      if (!matrixFrame) matrixFrame = window.requestAnimationFrame(drawMatrix);
      appendLine("cmatrix: on", "hlterm-ok");
    }

    function wrapWords(text, width) {
      var words = (text || "moo").split(/\s+/);
      var lines = [];
      var line = "";
      words.forEach(function (word) {
        if (line && (line + " " + word).length > width) { lines.push(line); line = word; }
        else line += (line ? " " : "") + word;
      });
      if (line) lines.push(line);
      return lines.length ? lines : ["moo"];
    }

    function runCowsay(args) {
      var tux = false;
      if (args[0] === "-f") {
        if (args[1] !== "tux") { showUsage("cowsay"); return; }
        tux = true;
        args = args.slice(2);
      }
      var lines = wrapWords(args.join(" "), 32);
      var width = Math.max.apply(null, lines.map(function (line) { return line.length; }));
      appendLine(" " + "_".repeat(width + 2));
      lines.forEach(function (line, index) {
        var left = lines.length === 1 ? "<" : index === 0 ? "/" : index === lines.length - 1 ? "\\" : "|";
        var right = lines.length === 1 ? ">" : index === 0 ? "\\" : index === lines.length - 1 ? "/" : "|";
        appendLine(left + " " + line.padEnd(width, " ") + " " + right);
      });
      appendLine(" " + "-".repeat(width + 2));
      if (tux) appendLines(["   \\", "    \\", "     .--.", "    |o_o |", "    |:_/ |", "   //   \\ \\", "  (|     | )", " /'\\_   _/`\\", " \\___)=(___/"]);
      else appendLines(["        \\   ^__^", "         \\  (oo)\\_______", "            (__)\\       )\\/\\", "                ||----w |", "                ||     ||"]);
    }

    function runSl() {
      var frames = [
        ["      ====        ________", "  _D _|  |_______/        \\__", " |(_)---  |   H\\________/ |", " /     |  |   H  |  |     |", "|      |  |   H  |__-----------------|"] ,
        ["       ====        ________", "   _D _|  |_______/        \\__", "  |(_)---  |   H\\________/ |", "  /     |  |   H  |  |     |", " |      |  |   H  |__-----------------|"] ,
        ["        ====        ________", "    _D _|  |_______/        \\__", "   |(_)---  |   H\\________/ |", "   /     |  |   H  |  |     |", "  |      |  |   H  |__-----------------|"] ,
        ["         ====        ________", "     _D _|  |_______/        \\__", "    |(_)---  |   H\\________/ |", "    /     |  |   H  |  |     |", "   |      |  |   H  |__-----------------|"]
      ];
      var line = appendLine(frames[0].join("\n"));
      if (reducedMotion.matches) return;
      frames.slice(1).forEach(function (frame, index) {
        window.setTimeout(function () { line.textContent = frame.join("\n"); scrollBottom(); }, (index + 1) * 180);
      });
    }

    function runPing(args) {
      if (pingBusy) { appendLine("ping: previous probe still running", "hlterm-error"); return; }
      var count = 4;
      var host = "";
      if (args.length === 1) host = args[0];
      else if (args.length === 3 && args[0] === "-c" && /^\d+$/.test(args[1])) { count = Number(args[1]); host = args[2]; }
      else { showUsage("ping"); return; }
      if (count < 1 || count > 8 || !/^[A-Za-z0-9._:-]+$/.test(host)) { showUsage("ping"); return; }
      pingBusy = true;
      appendLine("PING " + host + " (127.0.0.1) 56(84) bytes of data.");
      var sequence = [];
      for (var index = 1; index <= count; index += 1) {
        sequence.push("64 bytes from " + host + ": icmp_seq=" + index + " ttl=64 time=" + (12 + Math.random() * 36).toFixed(1) + " ms");
      }
      sequence.push("--- " + host + " ping statistics ---");
      sequence.push(count + " packets transmitted, " + count + " received, 0% packet loss");
      var cursor = 0;
      pingTimer = window.setInterval(function () {
        appendLine(sequence[cursor]);
        cursor += 1;
        if (cursor >= sequence.length) {
          window.clearInterval(pingTimer);
          pingTimer = 0;
          pingBusy = false;
        }
      }, 1000);
    }

    function runCurl(args) {
      if (args.length !== 1) { showUsage("curl"); return; }
      var target = args[0];
      if (/^https?:\/\//i.test(target) && !/^https:\/\/www\.highlion\.net\//i.test(target)) {
        appendLine("curl: (6) Could not resolve host", "hlterm-error");
        return;
      }
      var name = normalizedPath(target);
      if (!Object.prototype.hasOwnProperty.call(FILES, name)) { appendLine("curl: (6) Could not resolve host", "hlterm-error"); return; }
      appendLine(FILES[name]);
    }

    function execute(raw) {
      if (/[|><`]|\$\(/.test(raw)) {
        appendLine("hlshell: pipelines and redirection are disabled", "hlterm-error");
        return;
      }
      var tokens = raw.trim().split(/\s+/);
      var command = tokens.shift().toLowerCase();
      var args = tokens;
      switch (command) {
        case "help": if (args.length <= 1) showHelp((args[0] || "").toLowerCase()); else showUsage(command); break;
        case "man": if (args.length === 1) showHelp(args[0].toLowerCase()); else showUsage(command); break;
        case "clear": if (!args.length) stream.replaceChildren(); else showUsage(command); break;
        case "echo": appendLine(args.join(" ")); break;
        case "whoami": if (!args.length) appendLine("www-stux"); else showUsage(command); break;
        case "id": if (!args.length) appendLine("uid=1000(www-stux) gid=1000(www-stux) groups=1000(www-stux),27(sudo)"); else showUsage(command); break;
        case "groups": if (!args.length) appendLine("www-stux sudo"); else showUsage(command); break;
        case "hostname": if (!args.length) appendLine("highlion"); else showUsage(command); break;
        case "hostnamectl": if (!args.length) appendLines(["Static hostname: highlion", "Chassis: desktop", "Operating System: Debian GNU/Linux"]); else showUsage(command); break;
        case "lsb_release": if (args.length === 1 && args[0] === "-a") appendLines(["Distributor ID: Debian", "Description: Debian GNU/Linux 12 (bookworm)", "Release: 12", "Codename: bookworm"]); else showUsage(command); break;
        case "pwd": if (!args.length) appendLine("/home/www-stux"); else showUsage(command); break;
        case "uname": if (!args.length) appendLine("Linux"); else if (args.length === 1 && args[0] === "-a") appendLine("Linux highlion 6.6.0-hl1 x86_64 GNU/Linux"); else showUsage(command); break;
        case "date": if (!args.length) appendLine(new Date().toString()); else showUsage(command); break;
        case "uptime": if (!args.length) appendLine("up " + elapsed() + ", 1 user, load average: 0.01, 0.02, 0.00"); else showUsage(command); break;
        case "history": if (!args.length) history.forEach(function (entry, index) { appendLine(String(index + 1).padStart(4, " ") + "  " + entry); }); else showUsage(command); break;
        case "banner": if (!args.length) appendLines(["H  H I GGG H  H L    I OOO N  N", "H  H I G   H  H L    I O O NN N", "HHHH I G G HHHH L    I O O N NN", "H  H I G G H  H L    I O O N  N", "H  H I GGG H  H LLLL I OOO N  N", "HLv8 / highlion.net"]); else showUsage(command); break;
        case "neofetch": if (!args.length) appendLines(["      /\\          www-stux@highlion", "     /  \\         OS: Debian GNU/Linux", "    / /\\ \\        Kernel: 6.6.0-hl1", "   / ____ \\       Shell: hlshell", "  /_/    \\_\\      Version: HLv8", "     ||           Uptime: " + elapsed(), "     ||           Viewport: " + window.innerWidth + "×" + window.innerHeight]); else showUsage(command); break;
        case "ls": listFiles(args); break;
        case "cat": if (args.length === 1) { var catFile = getFile(args[0], command); if (catFile) appendLine(catFile.text); } else showUsage(command); break;
        case "head": headFile(args); break;
        case "wc": wordCount(args); break;
        case "find": findFiles(args); break;
        case "grep": grepFile(args); break;
        case "tree": if (!args.length) appendLines([".", "├── .brief", "├── .hidden", "├── README.txt", "├── notes", "│   ├── hashes.txt", "│   ├── motd.txt", "│   └── ops.txt", "├── ping.txt", "├── projects.md", "└── writeups.md"]); else showUsage(command); break;
        case "sha256sum": if (args.length === 1) { var hashFile = getFile(args[0], command); if (hashFile) appendLine(HASHES[hashFile.name] + "  " + hashFile.name); } else showUsage(command); break;
        case "which": if (args.length === 1) appendLine(COMMANDS.indexOf(args[0]) !== -1 ? "/usr/bin/" + args[0] : args[0] + " not found"); else showUsage(command); break;
        case "type": if (args.length === 1) appendLine(COMMANDS.indexOf(args[0]) !== -1 ? args[0] + " is a shell builtin" : args[0] + " not found"); else showUsage(command); break;
        case "ps": if (!args.length) appendLines(["  PID TTY          TIME CMD", "  412 ?        00:00:02 nginx", "  441 ?        00:00:01 php-fpm", "  509 ?        00:00:00 sshd", " 1337 pts/0    00:00:00 hlterm"]); else showUsage(command); break;
        case "df": if (args.length === 1 && args[0] === "-h") appendLines(["Filesystem      Size  Used Avail Use% Mounted on", "/dev/sda2        48G   13G   33G  29% /", "/dev/sda1       511M   68M  444M  14% /boot", "/dev/sdb1       120G   41G   73G  36% /var"]); else showUsage(command); break;
        case "free": if (args.length === 1 && args[0] === "-h") appendLines(["              total        used        free      shared  buff/cache   available", "Mem:           7.7Gi       1.8Gi       3.9Gi       112Mi       2.0Gi       5.5Gi", "Swap:          2.0Gi          0B       2.0Gi"]); else showUsage(command); break;
        case "ip": if (args.length === 1 && args[0] === "a") appendLines(["1: lo: <LOOPBACK,UP> mtu 65536", "    inet 127.0.0.1/8 scope host lo", "2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500", "    inet 10.8.0.2/24 scope global eth0"]); else showUsage(command); break;
        case "ss": if (args.length === 1 && args[0] === "-tuln") appendLines(["Netid State  Local Address:Port", "tcp   LISTEN 0.0.0.0:22", "tcp   LISTEN 0.0.0.0:80", "tcp   LISTEN 0.0.0.0:443", "udp   UNCONN 127.0.0.1:53"]); else showUsage(command); break;
        case "cmatrix": if (!args.length || (args.length === 1 && args[0] === "on")) matrixOn(); else if (args.length === 1 && args[0] === "off") matrixOff(false); else showUsage(command); break;
        case "cowsay": runCowsay(args); break;
        case "fortune": if (!args.length) appendLine(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]); else showUsage(command); break;
        case "sl": if (!args.length) runSl(); else showUsage(command); break;
        case "figlet": if (args.length === 1 && FIGLETS[args[0].toLowerCase()]) appendLines(FIGLETS[args[0].toLowerCase()]); else if (args.length === 1) appendLine("figlet: word not in font", "hlterm-error"); else showUsage(command); break;
        case "ping": runPing(args); break;
        case "curl": runCurl(args); break;
        case "open": if (args.length === 1 && OPEN_TARGETS.indexOf(args[0]) !== -1) window.location.assign(args[0] === "home" ? "/index.html" : "/" + args[0] + ".html"); else showUsage(command); break;
        case "writeups": if (!args.length) appendLines(["Exposed Pi-hole Admin Page", "CVE-2026-2441"]); else showUsage(command); break;
        case "projects": if (!args.length) appendLines(["Home Lab", "Networking", "HighLion Web", "Windows Privacy Platform"]); else showUsage(command); break;
        default: appendLine("hlshell: command not found: " + command, "hlterm-error");
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
      }
    }

    function cancelPing() {
      if (pingTimer) window.clearInterval(pingTimer);
      pingTimer = 0;
      pingBusy = false;
    }

    function handleKey(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var raw = input.value;
        freezeLive(raw.trim());
        if (raw.trim()) {
          history.push(raw.trim());
          historyIndex = history.length;
          execute(raw);
        }
        addLive();
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
      } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        stream.replaceChildren();
        live = null;
        input = null;
        addLive();
      } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        freezeLive(input.value);
        cancelPing();
        appendLine("^C", "hlterm-muted");
        addLive();
      }
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    }

    body.addEventListener("click", function () { if (input) input.focus(); });
    window.addEventListener("resize", function () { if (matrixFrame) resizeMatrix(); }, { passive: true });
    reducedMotion.addEventListener("change", function () {
      if (reducedMotion.matches && matrixWanted) {
        if (matrixFrame) window.cancelAnimationFrame(matrixFrame);
        matrixFrame = 0;
        matrix.classList.remove("is-on");
      } else if (!reducedMotion.matches && matrixWanted) {
        resizeMatrix();
        matrix.classList.add("is-on");
        matrixFrame = window.requestAnimationFrame(drawMatrix);
      }
    });

    appendLine("HighLion hlshell / HLv8 / type help", "hlterm-muted");
    appendLine("Debian GNU/Linux · lab shell · no outbound probes", "hlterm-muted");
    appendLine("cmatrix / cowsay / fortune / sl are local toys", "hlterm-muted");
    appendLine("", "hlterm-muted");
    addLive();
  }

  window.mountTerminal = mountTerminal;
  document.querySelectorAll("[data-hlshell]").forEach(function (panel) { mountTerminal(panel); });
})();
