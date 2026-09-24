(function () {
  "use strict";

  var panel = document.getElementById("hlterm-panel");
  if (!panel) return;

  var body = panel.querySelector(".hlterm-body");
  var output = panel.querySelector(".hlterm-out");
  var input = panel.querySelector(".hlterm-input");
  var matrix = panel.querySelector(".hlterm-matrix");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var started = Date.now();
  var history = [];
  var historyIndex = 0;
  var busy = false;
  var matrixTimer = 0;
  var matrixDrops = [];
  var promptText = "www-stux@highlion:~$";

  var files = {
    "README.txt": "HighLion is a self-hosted cybersecurity lab documenting networking, Linux, web infrastructure, and security operations.",
    "projects.md": "Home Lab — VLAN segmentation, Pi-hole DNS, DMZ separation, routing\nHighLion Web — nginx and Apache on Debian\nKali tools — local mode scripts\nNextcloud — SSD-backed sync\nNetworking — Cisco Packet Tracer\nWindows AD — GPO, PSO, ACL templates",
    "writeups.md": "Exposed Pi-hole Admin Page — incident audit, patched\nCVE-2026-2441 — vulnerability research",
    "ping.txt": "pong",
    "notes/ops.txt": "IL geo-403 on /contact.html. Mail form on 403.",
    "notes/hashes.txt": "pihole  SHA-256 25A17FC060946D52A71F53F98612964B9A16FD47EC12618435B6D0C838D89C82\ncve     SHA-256 345BD2C08A94EBEB55BD4D7D7B186921D39DD42A5941D15F170C088B29604057\npkt     MD5 3f5feff2880a5208a2de26f5d868c3ec"
  };

  var groups = {
    info: ["help", "man", "banner", "neofetch", "history", "clear"],
    system: ["whoami", "id", "groups", "hostname", "hostnamectl", "uname", "pwd", "date", "cal", "uptime", "last", "w", "who"],
    machine: ["lscpu", "free", "df", "ps", "top", "env"],
    files: ["ls", "cat", "head", "tail", "wc", "stat", "file", "tree", "find", "sha256sum", "md5sum", "xxd", "base64"],
    "net-sim": ["ping", "traceroute", "dig", "nslookup", "curl", "wget", "ip", "ss", "netstat", "arp"],
    lab: ["writeups", "projects", "open"],
    services: ["systemctl", "journalctl", "nginx", "pihole", "nft", "fail2ban-client"],
    refuse: ["nmap", "tcpdump", "hydra", "sqlmap", "msfconsole", "hashcat", "john", "gobuster", "ffuf", "nikto", "sudo"]
  };

  var usage = {
    help: "help [COMMAND]", man: "man COMMAND", banner: "banner", neofetch: "neofetch", history: "history", clear: "clear", echo: "echo [TEXT...]",
    whoami: "whoami", id: "id", groups: "groups", hostname: "hostname [-f]", hostnamectl: "hostnamectl", uname: "uname [-s|-n|-r|-m|-a]", pwd: "pwd", date: "date [-u]", cal: "cal", uptime: "uptime", last: "last", w: "w", who: "who",
    lscpu: "lscpu", free: "free [-h]", df: "df [-h]", ps: "ps [aux]", top: "top", env: "env",
    ls: "ls [-a|-l|-la|-al]", cat: "cat FILE", head: "head [-n N] FILE", tail: "tail [-n N] FILE", wc: "wc [-l|-w|-c] FILE", stat: "stat FILE", file: "file FILE", tree: "tree", find: "find [PATH] -name PATTERN", sha256sum: "sha256sum FILE", md5sum: "md5sum FILE", xxd: "xxd FILE", base64: "base64 [-d] FILE|STRING",
    ping: "ping [-c N] [HOST]", traceroute: "traceroute [HOST]", dig: "dig [NAME] [TYPE]", nslookup: "nslookup [NAME]", curl: "curl [-I] FILE|URL", wget: "wget", ip: "ip addr|route|link", ss: "ss [-lntu]", netstat: "netstat [-tulpn]", arp: "arp",
    writeups: "writeups", projects: "projects", open: "open TARGET", systemctl: "systemctl status nginx", journalctl: "journalctl [-n N]", nginx: "nginx [-t|-v]", pihole: "pihole status", nft: "nft list ruleset", "fail2ban-client": "fail2ban-client status",
    which: "which CMD", type: "type CMD", cmatrix: "cmatrix on|off", exit: "exit", sudo: "sudo COMMAND"
  };

  var descriptions = {
    help: "show grouped hlshell commands", man: "show a command usage and purpose", banner: "print the HighLion banner", neofetch: "show this simulated lab session", history: "show command history", clear: "clear terminal output", echo: "print text",
    whoami: "print the session user", id: "print simulated user and group IDs", groups: "print simulated groups", hostname: "print the lab hostname", hostnamectl: "show simulated host metadata", uname: "show simulated kernel information", pwd: "print the working directory", date: "print local or UTC time", cal: "print the current month", uptime: "show session uptime", last: "show the latest login", w: "show the active session", who: "show the active user",
    lscpu: "show simulated CPU details", free: "show simulated memory usage", df: "show simulated disk usage", ps: "show a simulated process snapshot", top: "show a static process snapshot", env: "show safe simulated environment values",
    ls: "list fake files", cat: "print a fake file", head: "print the first file lines", tail: "print the last file lines", wc: "count fake file lines, words, or bytes", stat: "show fake file metadata", file: "identify a fake path", tree: "show the fake file tree", find: "find fake paths by name", sha256sum: "label a simulated SHA-256 result", md5sum: "label a simulated MD5 result", xxd: "hex dump the first 64 fake-file bytes", base64: "encode a fake file or decode text",
    ping: "run a timed loopback simulation", traceroute: "trace a timed simulated route", dig: "query locked simulated DNS records", nslookup: "show a locked simulated lookup", curl: "read an allowlisted fake file", wget: "redirect downloads to the safe curl simulation", ip: "show simulated interface state", ss: "show simulated listening sockets", netstat: "show simulated listening sockets", arp: "show the simulated neighbor table",
    writeups: "list HighLion writeups", projects: "list HighLion projects", open: "open an allowlisted HighLion page", systemctl: "show simulated nginx service state", journalctl: "show a bounded fake journal", nginx: "test or identify simulated nginx", pihole: "show simulated Pi-hole state", nft: "show a safe simulated firewall", "fail2ban-client": "show simulated fail2ban state", which: "locate a hlshell built-in", type: "identify a hlshell built-in", cmatrix: "toggle the decorative matrix", exit: "keep the browser shell open", sudo: "refuse privilege elevation"
  };

  var extraCommands = ["echo", "which", "type", "cmatrix", "exit", "aircrack-ng", "responder", "crackmapexec"];
  var commands = Array.from(new Set(Object.values(groups).flat().concat(extraCommands))).sort();
  var refused = ["nmap", "tcpdump", "hydra", "sqlmap", "msfconsole", "hashcat", "john", "gobuster", "ffuf", "nikto", "aircrack-ng", "responder", "crackmapexec"];
  var openTargets = ["home", "about", "projects", "writeups", "contact"];

  function appendLine(text, className) {
    var line = document.createElement("div");
    line.className = className || "hlterm-line";
    line.textContent = String(text);
    output.appendChild(line);
    body.scrollTop = body.scrollHeight;
    return line;
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

  function printUsage(command) {
    appendLine("USAGE " + usage[command], "hlterm-error");
  }

  function noArgs(command, args) {
    if (args.length) { printUsage(command); return false; }
    return true;
  }

  function uptimeValue() {
    var seconds = Math.floor((Date.now() - started) / 1000);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  }

  function paced(lines, delay) {
    if (reducedMotion.matches) { appendLines(lines); return; }
    lines.forEach(function (line, index) {
      window.setTimeout(function () { appendLine(line); }, index * delay);
    });
  }

  function fileText(name, command) {
    if (Object.prototype.hasOwnProperty.call(files, name)) return files[name];
    appendLine(command + ": " + name + ": No such file or directory", "hlterm-error");
    return null;
  }

  function printHelp(command) {
    if (command) {
      if (!usage[command] && commands.indexOf(command) === -1) {
        appendLine("No manual entry for " + command, "hlterm-error");
        return;
      }
      appendLine("USAGE " + (usage[command] || command));
      appendLine(descriptions[command] || "disabled attack tooling in this lab shell");
      return;
    }
    Object.keys(groups).forEach(function (group) {
      appendLine(group, "hlterm-muted");
      groups[group].forEach(function (name) {
        appendLine("  " + name.padEnd(16, " ") + "—  " + (descriptions[name] || "refuse unsafe tooling"));
      });
    });
  }

  function calendar() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var first = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var title = now.toLocaleString(undefined, { month: "long", year: "numeric" });
    appendLine(title.padStart(Math.floor((20 + title.length) / 2), " "));
    appendLine("Su Mo Tu We Th Fr Sa");
    var cells = Array(first).fill("  ");
    for (var day = 1; day <= days; day += 1) cells.push(String(day).padStart(2, " "));
    while (cells.length) appendLine(cells.splice(0, 7).join(" "));
  }

  function banner() {
    paced([
      "      Welcome to",
      "██╗  ██╗██╗ ██████╗ ██╗  ██╗██╗     ██╗ ██████╗ ███╗   ██╗",
      "██║  ██║██║██╔════╝ ██║  ██║██║     ██║██╔═══██╗████╗  ██║",
      "███████║██║██║  ███╗███████║██║     ██║██║   ██║██╔██╗ ██║",
      "██╔══██║██║██║   ██║██╔══██║██║     ██║██║   ██║██║╚██╗██║",
      "██║  ██║██║╚██████╔╝██║  ██║███████╗██║╚██████╔╝██║ ╚████║",
      "╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
      "                  www.highlion.net  //  HLv8"
    ], 22);
  }

  function neofetch() {
    var cpu = navigator.hardwareConcurrency || 4;
    var left = ["     *", "    /|\\", "  -- * --", "    \\|/", "     *", "    HL", "    HL", "    HL", "    HL"];
    var right = [
      "OS: Kali GNU/Linux Rolling", "Host: highlion.net", "Kernel: 6.6.0-hl1", "Shell: hlshell",
      "Uptime: " + uptimeValue(), "CPU: " + cpu + " threads", "User: www-stux", "Term: hlshell", "Res: " + window.innerWidth + "x" + window.innerHeight
    ];
    paced(right.map(function (line, index) { return left[index].padEnd(11, " ") + line; }), 18);
  }

  function listFiles(flag) {
    var names = "README.txt  notes  ping.txt  projects.md  writeups.md";
    if (!flag) { appendLine(names); return; }
    if (flag === "-a") { appendLine(".  ..  " + names); return; }
    if (["-l", "-la", "-al"].indexOf(flag) !== -1) {
      appendLines([
        "total 20",
        "-rw-r--r-- 1 www-stux www-stux 117 2026-09-23 18:00 README.txt",
        "drwxr-xr-x 2 www-stux www-stux  96 2026-09-23 18:00 notes",
        "-rw-r--r-- 1 www-stux www-stux   4 2026-09-23 18:00 ping.txt",
        "-rw-r--r-- 1 www-stux www-stux 246 2026-09-23 18:00 projects.md",
        "-rw-r--r-- 1 www-stux www-stux  94 2026-09-23 18:00 writeups.md"
      ]);
      return;
    }
    printUsage("ls");
  }

  function headTail(command, args) {
    var count = 10;
    var name;
    if (args.length === 1) name = args[0];
    else if (args.length === 3 && args[0] === "-n" && /^\d+$/.test(args[1]) && Number(args[1]) > 0) {
      count = Number(args[1]); name = args[2];
    } else { printUsage(command); return; }
    var text = fileText(name, command);
    if (text === null) return;
    var lines = text.split("\n");
    appendLines(command === "head" ? lines.slice(0, count) : lines.slice(-count));
  }

  function wordCount(args) {
    var mode = "";
    var name;
    if (args.length === 1) name = args[0];
    else if (args.length === 2 && ["-l", "-w", "-c"].indexOf(args[0]) !== -1) { mode = args[0]; name = args[1]; }
    else { printUsage("wc"); return; }
    var text = fileText(name, "wc");
    if (text === null) return;
    var lines = text ? text.split("\n").length : 0;
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    var bytes = new TextEncoder().encode(text).length;
    appendLine((mode === "-l" ? lines : mode === "-w" ? words : mode === "-c" ? bytes : lines + " " + words + " " + bytes) + " " + name);
  }

  function findFiles(args) {
    var path = ".";
    var pattern;
    if (args.length === 2 && args[0] === "-name") pattern = args[1];
    else if (args.length === 3 && args[1] === "-name") { path = args[0]; pattern = args[2]; }
    else { printUsage("find"); return; }
    var escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    var matcher = new RegExp("^" + escaped + "$");
    Object.keys(files).forEach(function (name) {
      if ((path === "." || name.indexOf(path.replace(/^\.\//, "").replace(/\/$/, "") + "/") === 0) && matcher.test(name.split("/").pop())) appendLine("./" + name);
    });
  }

  function hexDump(name) {
    var text = fileText(name, "xxd");
    if (text === null) return;
    var bytes = Array.from(new TextEncoder().encode(text).slice(0, 64));
    for (var offset = 0; offset < bytes.length; offset += 16) {
      var row = bytes.slice(offset, offset + 16);
      var hex = row.map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join(" ").padEnd(47, " ");
      var ascii = row.map(function (byte) { return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."; }).join("");
      appendLine(offset.toString(16).padStart(8, "0") + ": " + hex + "  " + ascii);
    }
  }

  function base64Command(args) {
    if (args[0] === "-d" && args.length >= 2) {
      try { appendLine(decodeURIComponent(Array.from(atob(args.slice(1).join(" "))).map(function (char) { return "%" + char.charCodeAt(0).toString(16).padStart(2, "0"); }).join(""))); }
      catch (error) { appendLine("base64: invalid input", "hlterm-error"); }
      return;
    }
    if (args.length !== 1) { printUsage("base64"); return; }
    var text = fileText(args[0], "base64");
    if (text === null) return;
    var encoded = Array.from(new TextEncoder().encode(text)).map(function (byte) { return String.fromCharCode(byte); }).join("");
    appendLine(btoa(encoded));
  }

  function processTable() {
    appendLines([
      "USER       PID %CPU %MEM COMMAND", "root         1  0.0  0.1 /sbin/init", "root       186  0.0  0.2 nginx: master",
      "www-data   190  0.0  0.2 nginx: worker", "www-stux  1044  0.1  0.3 hlshell", "www-stux  1045  0.0  0.1 hlshell: idle"
    ]);
  }

  function socketTable() {
    appendLines(["Netid  State   Local Address:Port", "tcp    LISTEN  0.0.0.0:80", "tcp    LISTEN  0.0.0.0:443", "tcp    LISTEN  127.0.0.1:22"]);
  }

  function ping(args) {
    var count = 4;
    var host = "highlion.net";
    if (args[0] === "-c") {
      if (args.length < 2 || args.length > 3 || !/^\d+$/.test(args[1])) { printUsage("ping"); return; }
      count = Math.max(1, Math.min(8, Number(args[1])));
      if (args[2]) host = args[2];
    } else if (args.length === 1) host = args[0];
    else if (args.length > 1) { printUsage("ping"); return; }
    busy = true;
    appendLine("PING " + host + " (127.0.0.1) 56(84) bytes of data.");
    var sent = 0;
    var timer = window.setInterval(function () {
      sent += 1;
      var time = (8 + sent * 1.7 + (sent % 3) * 0.31).toFixed(2);
      appendLine("64 bytes from 127.0.0.1: icmp_seq=" + sent + " ttl=64 time=" + time + " ms");
      if (sent === count) {
        window.clearInterval(timer);
        appendLine("--- " + host + " ping statistics ---");
        appendLine(count + " packets transmitted, " + count + " received, 0% packet loss, time " + (count - 1) + "000ms");
        busy = false;
      }
    }, 1000);
  }

  function traceroute(args) {
    if (args.length > 1) { printUsage("traceroute"); return; }
    var host = args[0] || "highlion.net";
    var hops = ["1  127.0.0.1  0.2 ms", "2  10.0.0.1   1.4 ms", "3  192.168.50.1  2.1 ms", "4  192.168.50.24  2.6 ms", "5  " + host + " (127.0.0.1)  3.1 ms", "6  " + host + " (127.0.0.1)  3.1 ms"];
    busy = true;
    appendLine("traceroute to " + host + " (127.0.0.1), 6 hops max");
    hops.forEach(function (hop, index) {
      window.setTimeout(function () {
        appendLine(hop);
        if (index === hops.length - 1) busy = false;
      }, (index + 1) * 450);
    });
  }

  function dns(args) {
    if (args.length > 2) { printUsage("dig"); return; }
    var name = args[0] || "highlion.net";
    var type = (args[1] || "A").toUpperCase();
    var records = { A: "127.0.0.1", AAAA: "::1", MX: "10 mail.highlion.net", TXT: "\"v=spf1 -all\"", NS: "ns.highlion.net" };
    if (!records[type]) { printUsage("dig"); return; }
    appendLines([";; QUESTION SECTION:", ";" + name + ".   IN  " + type, ";; ANSWER SECTION:", name + ".  300 IN " + type + " " + records[type], ";; Query time: 1 msec", ";; SERVER: 127.0.0.1#53"]);
  }

  function curlCommand(args) {
    var headers = false;
    var target;
    if (args.length === 1) target = args[0];
    else if (args.length === 2 && args[0] === "-I") { headers = true; target = args[1]; }
    else { printUsage("curl"); return; }
    var name = target;
    if (/^https?:\/\//i.test(target)) {
      try {
        var parsed = new URL(target);
        if (["highlion.net", "www.highlion.net"].indexOf(parsed.hostname) === -1) {
          appendLine("curl: (6) Could not resolve host: " + parsed.hostname, "hlterm-error"); return;
        }
        name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      } catch (error) { printUsage("curl"); return; }
    }
    if (!Object.prototype.hasOwnProperty.call(files, name)) name = name.split("/").pop();
    if (!Object.prototype.hasOwnProperty.call(files, name)) { appendLine("HTTP/1.1 404 Not Found", "hlterm-error"); return; }
    if (headers) appendLines(["HTTP/1.1 200 OK", "Server: nginx", "Content-Type: text/plain"]);
    else appendLine(files[name]);
  }

  function drawMatrix() {
    if (!matrixTimer) return;
    var context = matrix.getContext("2d");
    context.fillStyle = "rgba(5,7,19,0.14)";
    context.fillRect(0, 0, matrix.width, matrix.height);
    context.fillStyle = "rgba(102,247,255,0.5)";
    context.font = "12px monospace";
    matrixDrops.forEach(function (drop, column) {
      context.fillText(String.fromCharCode(0x30a0 + Math.random() * 96), column * 12, drop * 12);
      matrixDrops[column] = drop * 12 > matrix.height && Math.random() > 0.975 ? 0 : drop + 1;
    });
  }

  function resizeMatrix() {
    matrix.width = body.clientWidth;
    matrix.height = body.clientHeight;
    matrixDrops = Array(Math.ceil(matrix.width / 12)).fill(1);
  }

  function matrixCommand(value) {
    if (value === "on") {
      if (reducedMotion.matches) { appendLine("cmatrix: disabled when reduced motion is enabled", "hlterm-error"); return; }
      resizeMatrix(); matrix.hidden = false;
      if (!matrixTimer) matrixTimer = window.setInterval(drawMatrix, 50);
      appendLine("cmatrix: on", "hlterm-ok");
    } else if (value === "off") {
      window.clearInterval(matrixTimer); matrixTimer = 0; matrix.hidden = true;
      appendLine("cmatrix: off", "hlterm-muted");
    } else printUsage("cmatrix");
  }

  function execute(raw) {
    if (/[|`<>]/.test(raw) || raw.indexOf("$(") !== -1) {
      appendLine("hlshell: pipelines and redirection are disabled in the lab shell", "hlterm-error");
      return;
    }
    var tokens = raw.trim().split(/\s+/);
    var command = tokens[0].toLowerCase();
    var args = tokens.slice(1);
    if (busy && (command === "ping" || command === "traceroute")) {
      appendLine("hlshell: wait for the running probe to finish", "hlterm-error");
      return;
    }
    if (refused.indexOf(command) !== -1) {
      appendLine(command + ": disabled — hlshell is not networked and will not run attack tooling", "hlterm-error");
      return;
    }
    var noFlagCommands = ["echo", "cat", "stat", "file", "sha256sum", "md5sum", "xxd", "traceroute", "nslookup", "which", "type", "open"];
    if (noFlagCommands.indexOf(command) !== -1 && args[0] && args[0].charAt(0) === "-") {
      printUsage(command);
      return;
    }

    switch (command) {
      case "help": if (args.length <= 1) printHelp((args[0] || "").toLowerCase()); else printUsage("help"); break;
      case "man": if (args.length === 1) printHelp(args[0].toLowerCase()); else printUsage("man"); break;
      case "clear": if (noArgs(command, args)) output.replaceChildren(); break;
      case "echo": if (args[0] && /^-/.test(args[0])) printUsage("echo"); else appendLine(args.join(" ")); break;
      case "whoami": if (noArgs(command, args)) appendLine("www-stux"); break;
      case "id": if (noArgs(command, args)) appendLine("uid=1000(www-stux) gid=1000(www-stux) groups=1000(www-stux),27(sudo),114(netdev)"); break;
      case "groups": if (noArgs(command, args)) appendLine("www-stux sudo netdev"); break;
      case "hostname": if (!args.length || (args.length === 1 && args[0] === "-f")) appendLine("highlion.net"); else printUsage(command); break;
      case "hostnamectl": if (noArgs(command, args)) appendLines(["Static hostname: highlion.net", "Icon name: computer-server", "Machine ID: 7a0c1e0bhlv8000000000000", "Boot ID: 11c0ffeehlv800000000000", "Operating System: Kali GNU/Linux Rolling", "Kernel: Linux 6.6.0-hl1", "Architecture: x86-64"]); break;
      case "uname": {
        var values = { "": "Linux", "-s": "Linux", "-n": "highlion.net", "-r": "6.6.0-hl1", "-m": "x86_64", "-a": "Linux highlion 6.6.0-hl1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux" };
        if (args.length <= 1 && Object.prototype.hasOwnProperty.call(values, args[0] || "")) appendLine(values[args[0] || ""]); else printUsage(command); break;
      }
      case "pwd": if (noArgs(command, args)) appendLine("/home/www-stux"); break;
      case "date": if (!args.length) appendLine(new Date().toString()); else if (args.length === 1 && args[0] === "-u") appendLine(new Date().toUTCString()); else printUsage(command); break;
      case "cal": if (noArgs(command, args)) calendar(); break;
      case "uptime": if (noArgs(command, args)) appendLine("up " + uptimeValue() + ", 1 user, load average: 0.08, 0.12, 0.09"); break;
      case "last": if (noArgs(command, args)) appendLine("www-stux  tty1  highlion  still logged in"); break;
      case "w":
      case "who": if (noArgs(command, args)) appendLines(["USER      TTY   LOGIN@", "www-stux  tty1  " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })]); break;
      case "history": if (noArgs(command, args)) history.forEach(function (entry, index) { appendLine(String(index + 1).padStart(4, " ") + "  " + entry); }); break;
      case "banner": if (noArgs(command, args)) banner(); break;
      case "neofetch": if (noArgs(command, args)) neofetch(); break;
      case "ls": if (args.length <= 1) listFiles(args[0]); else printUsage(command); break;
      case "cat": if (args.length === 1) { var catText = fileText(args[0], command); if (catText !== null) appendLine(catText); } else printUsage(command); break;
      case "head":
      case "tail": headTail(command, args); break;
      case "wc": wordCount(args); break;
      case "stat": if (args.length === 1) { if (args[0] === "notes" || Object.prototype.hasOwnProperty.call(files, args[0])) { var statSize = args[0] === "notes" ? 96 : new TextEncoder().encode(files[args[0]]).length; appendLines(["File: " + args[0], "Size: " + statSize + "     Blocks: 8    IO Block: 4096", "Access: (0644/-rw-r--r--)  Uid: (1000/www-stux)", "Modify: 2026-09-23 18:00:31 +0000"]); } else appendLine("stat: cannot statx '" + args[0] + "': No such file or directory", "hlterm-error"); } else printUsage(command); break;
      case "file": if (args.length === 1) { if (args[0] === "notes") appendLine("notes: directory"); else if (Object.prototype.hasOwnProperty.call(files, args[0])) appendLine(args[0] + ": ASCII text"); else appendLine("file: cannot open '" + args[0] + "'", "hlterm-error"); } else printUsage(command); break;
      case "tree": if (noArgs(command, args)) appendLines(["/home/www-stux", "|-- README.txt", "|-- ping.txt", "|-- projects.md", "|-- writeups.md", "`-- notes", "    |-- hashes.txt", "    `-- ops.txt"]); break;
      case "find": findFiles(args); break;
      case "sha256sum":
      case "md5sum": if (args.length === 1) { if (fileText(args[0], command) !== null) appendLine("lab-sim  " + args[0]); } else printUsage(command); break;
      case "xxd": if (args.length === 1) hexDump(args[0]); else printUsage(command); break;
      case "base64": if (args[0] && args[0].charAt(0) === "-" && args[0] !== "-d") printUsage(command); else base64Command(args); break;
      case "lscpu": if (noArgs(command, args)) appendLines(["Architecture: x86_64", "CPU(s): " + (navigator.hardwareConcurrency || 4), "Model name: lab-virtual-cpu", "Flags: sse sse2 nx lm"]); break;
      case "free": if (!args.length || (args.length === 1 && args[0] === "-h")) appendLines(["             total        used        free", "Mem:         16Gi        4.1Gi       11Gi", "Swap:        2.0Gi       0.0Gi       2.0Gi"]); else printUsage(command); break;
      case "df": if (!args.length || (args.length === 1 && args[0] === "-h")) appendLines(["Filesystem      Size  Used  Avail  Use%  Mounted on", "/dev/sda2        80G   19G    58G   25%  /", "/dev/sda1       512M  32M   480M    7%  /boot", "tmpfs           1.6G   0     1.6G    0%  /tmp"]); else printUsage(command); break;
      case "ps": if (!args.length || (args.length === 1 && args[0] === "aux")) processTable(); else printUsage(command); break;
      case "top": if (noArgs(command, args)) { processTable(); appendLine("top: snapshot only — live refresh disabled in hlshell"); } break;
      case "env": if (noArgs(command, args)) appendLines(["HOME=/home/www-stux", "USER=www-stux", "SHELL=/usr/bin/hlshell", "LANG=en_US.UTF-8", "TERM=xterm-256color", "HOSTNAME=highlion.net"]); break;
      case "ping": if (args[0] && args[0].charAt(0) === "-" && args[0] !== "-c") printUsage(command); else ping(args); break;
      case "traceroute": traceroute(args); break;
      case "dig": dns(args); break;
      case "nslookup": if (args.length <= 1) { var lookupName = args[0] || "highlion.net"; appendLines(["Server:  127.0.0.1", "Address: 127.0.0.1#53", "Name:    " + lookupName, "Address: 127.0.0.1"]); } else printUsage(command); break;
      case "curl": if (args[0] && args[0].charAt(0) === "-" && args[0] !== "-I") printUsage(command); else curlCommand(args); break;
      case "wget": if (noArgs(command, args)) appendLine("wget: use curl in this shell"); break;
      case "ip": {
        var ipMode = args.join(" ");
        if (ipMode === "addr" || ipMode === "a") appendLines(["1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536", "    inet 127.0.0.1/8 scope host lo", "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500", "    inet 192.168.50.24/24 scope global eth0"]);
        else if (ipMode === "route" || ipMode === "r") appendLines(["default via 192.168.50.1 dev eth0", "192.168.50.0/24 dev eth0 proto kernel scope link src 192.168.50.24"]);
        else if (ipMode === "link" || ipMode === "l") appendLines(["1: lo: <LOOPBACK,UP> mtu 65536", "2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500"]);
        else printUsage(command); break;
      }
      case "ss": if (!args.length || (args.length === 1 && args[0] === "-lntu")) socketTable(); else printUsage(command); break;
      case "netstat": if (!args.length || (args.length === 1 && args[0] === "-tulpn")) socketTable(); else printUsage(command); break;
      case "arp": if (noArgs(command, args)) appendLines(["Address          HWtype  HWaddress           Iface", "192.168.50.1     ether   02:11:22:33:44:01   eth0"]); break;
      case "systemctl": if (args.length === 2 && args[0] === "status" && args[1] === "nginx") appendLines(["● nginx.service - HighLion frontend", "   Loaded: loaded", "   Active: active (running)"]); else if (args.length === 2 && args[0] === "status") appendLine("Unit " + args[1] + ".service could not be found", "hlterm-error"); else printUsage(command); break;
      case "journalctl": {
        var journalCount = 5;
        if (args.length === 2 && args[0] === "-n" && /^\d+$/.test(args[1])) journalCount = Math.min(12, Math.max(1, Number(args[1]))); else if (args.length) { printUsage(command); break; }
        var journal = ["Sep 23 18:04:34 highlion nginx: start worker", "Sep 23 18:04:34 highlion nginx: listen 443", "Sep 23 18:33:05 highlion hlshell: session open", "Sep 23 18:33:06 highlion nft: ruleset loaded", "Sep 23 18:33:07 highlion pihole: resolver healthy", "Sep 23 18:33:08 highlion fail2ban: jail ready"];
        for (var ji = 0; ji < journalCount; ji += 1) appendLine(journal[ji % journal.length]); break;
      }
      case "nginx": if (args.length === 1 && args[0] === "-t") appendLines(["nginx: the configuration file /etc/nginx/nginx.conf syntax is ok", "nginx: configuration file /etc/nginx/nginx.conf test is successful"]); else if (args.length === 1 && args[0] === "-v") appendLine("nginx version: nginx/1.24.0"); else printUsage(command); break;
      case "pihole": if (args.length === 1 && args[0] === "status") appendLines(["[✓] FTL running", "[✓] DNS resolution", "[i] Admin UI is not exposed — see writeups/pihole.html"]); else printUsage(command); break;
      case "nft": if (args.join(" ") === "list ruleset") appendLines(["table inet filter {", "  chain input { type filter hook input priority 0; policy drop;", "    iif lo accept", "    ct state established,related accept", "    tcp dport { 80, 443 } accept", "  }", "}"]); else printUsage(command); break;
      case "fail2ban-client": if (args.length === 1 && args[0] === "status") appendLines(["Number of jail: 1", "Jail list: nginx-http-auth"]); else printUsage(command); break;
      case "writeups": if (noArgs(command, args)) appendLines(["INCIDENT  Exposed Pi-hole Admin Page  [Patched]", "RESEARCH  CVE-2026-2441              [Research]"]); break;
      case "projects": if (noArgs(command, args)) appendLines(["Home Lab | HighLion Web | Kali tools", "Nextcloud Server | Networking Projects | Windows AD"]); break;
      case "open": if (args.length === 1 && openTargets.indexOf(args[0]) !== -1) window.location.assign(args[0] === "home" ? "/index.html" : "/" + args[0] + ".html"); else appendLine("open: allowed targets: home about projects writeups contact", "hlterm-error"); break;
      case "which": if (args.length === 1) appendLine(commands.indexOf(args[0].toLowerCase()) !== -1 ? "/usr/bin/" + args[0].toLowerCase() : args[0] + " not found", commands.indexOf(args[0].toLowerCase()) !== -1 ? undefined : "hlterm-error"); else printUsage(command); break;
      case "type": if (args.length === 1) appendLine(commands.indexOf(args[0].toLowerCase()) !== -1 ? args[0].toLowerCase() + " is a hlshell built-in" : "type: " + args[0] + ": not found", commands.indexOf(args[0].toLowerCase()) !== -1 ? undefined : "hlterm-error"); else printUsage(command); break;
      case "cmatrix": if (args.length === 1) matrixCommand(args[0]); else printUsage(command); break;
      case "exit": if (noArgs(command, args)) appendLine("hlshell: session stays open in the browser"); break;
      case "sudo": appendLine("www-stux is not in the sudoers file.  This incident will be reported.", "hlterm-error"); break;
      default: appendLine("zsh: command not found: " + command, "hlterm-error");
    }
  }

  function complete() {
    var value = input.value;
    var tokens = value.split(/\s+/);
    var current = tokens.pop() || "";
    var source = tokens.length === 0 ? commands : Object.keys(files).concat(openTargets);
    var matches = source.filter(function (item) { return item.toLowerCase().indexOf(current.toLowerCase()) === 0; });
    if (matches.length === 1) {
      tokens.push(matches[0]);
      input.value = tokens.join(" ") + " ";
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (matches.length > 1) {
      appendPrompt(value.trim());
      appendLine(matches.join("  "));
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
  window.addEventListener("resize", function () { if (matrixTimer) resizeMatrix(); }, { passive: true });
  appendLine("HighLion hlshell  HLv8  —  type help.  This shell is not networked.", "hlterm-muted");
})();
