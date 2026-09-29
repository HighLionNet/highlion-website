(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function result(stdout, status, stderr, effect) {
    return { stdout: stdout || "", stderr: stderr || "", status: status || 0, effect: effect || null };
  }

  function failure(command, error, status) {
    var message = error && error.message ? error.message : String(error || "error");
    return result("", status || 1, command + ": " + message + "\n");
  }

  function bytes(text) {
    return new TextEncoder().encode(String(text));
  }

  function wildcard(pattern) {
    var escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + escaped + "$");
  }

  function human(size) {
    if (size < 1024) return size + "B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + "K";
    return (size / (1024 * 1024)).toFixed(1) + "M";
  }

  function figletText(value) {
    var font = {
      A:[" /\\ ","/  \\","/ /\\ \\","/ ____ \\","/_/  \\_\\"], B:["████ ","█   █","████ ","█   █","████ "],
      C:[" ███","█   ","█   ","█   "," ███"], D:["████ ","█   █","█   █","█   █","████ "],
      E:["█████","█    ","████ ","█    ","█████"], F:["█████","█    ","████ ","█    ","█    "],
      G:[" ███ ","█    ","█  ██","█   █"," ███ "], H:["█   █","█   █","█████","█   █","█   █"],
      I:["█████","  █  ","  █  ","  █  ","█████"], J:["█████","   █ ","   █ ","█  █ "," ██  "],
      K:["█  █ ","█ █  ","██   ","█ █  ","█  █ "], L:["█    ","█    ","█    ","█    ","█████"],
      M:["█   █","██ ██","█ █ █","█   █","█   █"], N:["█   █","██  █","█ █ █","█  ██","█   █"],
      O:[" ███ ","█   █","█   █","█   █"," ███ "], P:["████ ","█   █","████ ","█    ","█    "],
      Q:[" ███ ","█   █","█   █","█  ██"," ████"], R:["████ ","█   █","████ ","█ █  ","█  ██"],
      S:[" ████","█    "," ███ ","    █","████ "], T:["█████","  █  ","  █  ","  █  ","  █  "],
      U:["█   █","█   █","█   █","█   █"," ███ "], V:["█   █","█   █","█   █"," █ █ ","  █  "],
      W:["█   █","█   █","█ █ █","██ ██","█   █"], X:["█   █"," █ █ ","  █  "," █ █ ","█   █"],
      Y:["█   █"," █ █ ","  █  ","  █  ","  █  "], Z:["█████","   █ ","  █  "," █   ","█████"],
      " ":["  ","  ","  ","  ","  "]
    };
    var text = String(value || "HighLion").toUpperCase().slice(0, 20);
    var rows = ["", "", "", "", ""];
    text.split("").forEach(function (letter) {
      var glyph = font[letter] || ["?????","    ?","  ?? ","     ","  ?  "];
      glyph.forEach(function (line, index) { rows[index] += line + " "; });
    });
    return rows.join("\n") + "\n";
  }

  async function digest(algorithm, text) {
    if (!root.crypto || !root.crypto.subtle) return "unavailable";
    var hash = await root.crypto.subtle.digest(algorithm, bytes(text));
    return Array.from(new Uint8Array(hash)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
  }

  function md5(text) {
    function add(x, y) { return (((x & 0xffff) + (y & 0xffff)) + ((((x >>> 16) + (y >>> 16)) & 0xffff) << 16)) | 0; }
    function rol(value, shift) { return (value << shift) | (value >>> (32 - shift)); }
    function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    var data = Array.from(bytes(text));
    var bitLength = data.length * 8;
    data.push(128);
    while (data.length % 64 !== 56) data.push(0);
    for (var lengthIndex = 0; lengthIndex < 8; lengthIndex += 1) data.push((bitLength >>> (8 * lengthIndex)) & 255);
    var a0 = 0x67452301; var b0 = -0x10325477; var c0 = -0x67452302; var d0 = 0x10325476;
    for (var offset = 0; offset < data.length; offset += 64) {
      var x = [];
      for (var word = 0; word < 16; word += 1) x[word] = data[offset + word * 4] | (data[offset + word * 4 + 1] << 8) | (data[offset + word * 4 + 2] << 16) | (data[offset + word * 4 + 3] << 24);
      var a = a0; var b = b0; var c = c0; var d = d0;
      a = ff(a,b,c,d,x[0],7,-680876936); d=ff(d,a,b,c,x[1],12,-389564586); c=ff(c,d,a,b,x[2],17,606105819); b=ff(b,c,d,a,x[3],22,-1044525330);
      a=ff(a,b,c,d,x[4],7,-176418897); d=ff(d,a,b,c,x[5],12,1200080426); c=ff(c,d,a,b,x[6],17,-1473231341); b=ff(b,c,d,a,x[7],22,-45705983);
      a=ff(a,b,c,d,x[8],7,1770035416); d=ff(d,a,b,c,x[9],12,-1958414417); c=ff(c,d,a,b,x[10],17,-42063); b=ff(b,c,d,a,x[11],22,-1990404162);
      a=ff(a,b,c,d,x[12],7,1804603682); d=ff(d,a,b,c,x[13],12,-40341101); c=ff(c,d,a,b,x[14],17,-1502002290); b=ff(b,c,d,a,x[15],22,1236535329);
      a=gg(a,b,c,d,x[1],5,-165796510); d=gg(d,a,b,c,x[6],9,-1069501632); c=gg(c,d,a,b,x[11],14,643717713); b=gg(b,c,d,a,x[0],20,-373897302);
      a=gg(a,b,c,d,x[5],5,-701558691); d=gg(d,a,b,c,x[10],9,38016083); c=gg(c,d,a,b,x[15],14,-660478335); b=gg(b,c,d,a,x[4],20,-405537848);
      a=gg(a,b,c,d,x[9],5,568446438); d=gg(d,a,b,c,x[14],9,-1019803690); c=gg(c,d,a,b,x[3],14,-187363961); b=gg(b,c,d,a,x[8],20,1163531501);
      a=gg(a,b,c,d,x[13],5,-1444681467); d=gg(d,a,b,c,x[2],9,-51403784); c=gg(c,d,a,b,x[7],14,1735328473); b=gg(b,c,d,a,x[12],20,-1926607734);
      a=hh(a,b,c,d,x[5],4,-378558); d=hh(d,a,b,c,x[8],11,-2022574463); c=hh(c,d,a,b,x[11],16,1839030562); b=hh(b,c,d,a,x[14],23,-35309556);
      a=hh(a,b,c,d,x[1],4,-1530992060); d=hh(d,a,b,c,x[4],11,1272893353); c=hh(c,d,a,b,x[7],16,-155497632); b=hh(b,c,d,a,x[10],23,-1094730640);
      a=hh(a,b,c,d,x[13],4,681279174); d=hh(d,a,b,c,x[0],11,-358537222); c=hh(c,d,a,b,x[3],16,-722521979); b=hh(b,c,d,a,x[6],23,76029189);
      a=hh(a,b,c,d,x[9],4,-640364487); d=hh(d,a,b,c,x[12],11,-421815835); c=hh(c,d,a,b,x[15],16,530742520); b=hh(b,c,d,a,x[2],23,-995338651);
      a=ii(a,b,c,d,x[0],6,-198630844); d=ii(d,a,b,c,x[7],10,1126891415); c=ii(c,d,a,b,x[14],15,-1416354905); b=ii(b,c,d,a,x[5],21,-57434055);
      a=ii(a,b,c,d,x[12],6,1700485571); d=ii(d,a,b,c,x[3],10,-1894986606); c=ii(c,d,a,b,x[10],15,-1051523); b=ii(b,c,d,a,x[1],21,-2054922799);
      a=ii(a,b,c,d,x[8],6,1873313359); d=ii(d,a,b,c,x[15],10,-30611744); c=ii(c,d,a,b,x[6],15,-1560198380); b=ii(b,c,d,a,x[13],21,1309151649);
      a=ii(a,b,c,d,x[4],6,-145523070); d=ii(d,a,b,c,x[11],10,-1120210379); c=ii(c,d,a,b,x[2],15,718787259); b=ii(b,c,d,a,x[9],21,-343485551);
      a0=add(a0,a); b0=add(b0,b); c0=add(c0,c); d0=add(d0,d);
    }
    return [a0,b0,c0,d0].map(function (word) { return [0,8,16,24].map(function (shift) { return ((word >>> shift) & 255).toString(16).padStart(2,"0"); }).join(""); }).join("");
  }

  function bytesToBase64(data) {
    var binary = "";
    for (var offset = 0; offset < data.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, data.subarray(offset, offset + 0x8000));
    }
    return root.btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = root.atob(String(value || ""));
    var data = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
    return data;
  }

  async function gzipText(text) {
    var data = bytes(text);
    if (!root.CompressionStream) return "HLGZIP0:" + bytesToBase64(data);
    var stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
    return "HLGZIP1:" + bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function gunzipText(value) {
    var stored = String(value || "");
    if (stored.indexOf("HLGZIP0:") === 0) return new TextDecoder().decode(base64ToBytes(stored.slice(8)));
    if (stored.indexOf("HLGZIP1:") !== 0 || !root.DecompressionStream) throw new Error("not in gzip format");
    var stream = new Blob([base64ToBytes(stored.slice(8))]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }

  var MANUALS = {
    ls: ["LS(1)", "NAME", "    ls - list directory contents", "SYNOPSIS", "    ls [-a] [-l] [PATH ...]", "DESCRIPTION", "    Lists files from the mounted browser filesystem.", "    -a includes dot files; -l prints modes, owners and sizes.", "    Multiple paths are printed in separate blocks."],
    cd: ["CD(1)", "NAME", "    cd - change the working directory", "SYNOPSIS", "    cd [DIRECTORY|-]", "DESCRIPTION", "    With no directory, changes to the current user's home.", "    A dash returns to the previous directory.", "    Traversal follows simulated permissions."],
    cat: ["CAT(1)", "NAME", "    cat - concatenate files", "SYNOPSIS", "    cat [FILE ...]", "DESCRIPTION", "    Writes file contents to standard output.", "    With pipeline input and no file, reads standard input.", "    Device nodes use their simulated behavior."],
    grep: ["GREP(1)", "NAME", "    grep - print matching lines", "SYNOPSIS", "    grep [-n] [-i] [-v] PATTERN [FILE ...]", "DESCRIPTION", "    Searches text files or pipeline input.", "    -n adds line numbers; -i ignores case; -v inverts.", "    Matching is bounded by the shell output budget."],
    find: ["FIND(1)", "NAME", "    find - walk a directory tree", "SYNOPSIS", "    find [PATH] [-name GLOB] [-type f|d]", "DESCRIPTION", "    Walks only the mounted simulated filesystem.", "    Results respect directory read and execute permissions.", "    Host paths are never visible."],
    nano: ["NANO(1)", "NAME", "    nano - edit a file in the panel", "SYNOPSIS", "    nano [FILE]", "DESCRIPTION", "    Opens the in-panel 64 KiB text editor.", "    Ctrl+S writes; Ctrl+O then Enter also writes.", "    Ctrl+X exits and discards unsaved changes."],
    vim: ["VIM(1)", "NAME", "    vim - edit a file in the panel", "SYNOPSIS", "    vim [FILE]", "DESCRIPTION", "    Opens the in-panel 64 KiB text editor.", "    Ctrl+S or :w writes; :wq writes and exits.", "    :q! exits and discards unsaved changes."],
    su: ["SU(1)", "NAME", "    su - switch simulated identity", "SYNOPSIS", "    su [-] [root|admin|kali]", "DESCRIPTION", "    Root and admin require server-verified passwords.", "    Root also requires the operator capability cookie.", "    A login switch resets home, environment and prompt."],
    sudo: ["SUDO(1)", "NAME", "    sudo - execute under simulated policy", "SYNOPSIS", "    sudo COMMAND [ARG ...]", "DESCRIPTION", "    Root may execute mounted commands.", "    Admin has a narrow challenge-read policy.", "    Kali is not in the simulated sudoers file."],
    ip: ["IP(1)", "NAME", "    ip - show simulated network state", "SYNOPSIS", "    ip addr|route|neigh|link", "DESCRIPTION", "    Reports the isolated Osprey & Hale 10.8.0.0/24 LAN.", "    No host interface or real route is exposed.", "    State comes from deterministic local fixtures."],
    ping: ["PING(1)", "NAME", "    ping - probe a simulated LAN host", "SYNOPSIS", "    ping [-c COUNT] HOST", "DESCRIPTION", "    Resolves and probes only local fixture hosts.", "    Timing is deterministic and no network packet is sent.", "    Unknown and off-LAN destinations fail closed."],
    nmap: ["NMAP(1)", "NAME", "    nmap - scan simulated LAN services", "SYNOPSIS", "    nmap [-sV] [-p PORTS] HOST", "DESCRIPTION", "    Reads the sealed 10.8.0.0/24 service profiles.", "    It never opens sockets or scans the public internet.", "    Branded offensive suites remain unavailable."],
    curl: ["CURL(1)", "NAME", "    curl - fetch a simulated endpoint", "SYNOPSIS", "    curl [-I] URL", "DESCRIPTION", "    Routes requests through the local fixture network.", "    Documented challenge URLs are supported.", "    Real WAN fetches are rejected."],
    tar: ["TAR(1)", "NAME", "    tar - archive mounted files", "SYNOPSIS", "    tar -cf ARCHIVE PATH ...", "    tar -tf ARCHIVE | tar -xf ARCHIVE", "DESCRIPTION", "    Creates, lists and extracts bounded in-memory archives.", "    Add z to the option group for gzip compression.", "    Extraction rejects absolute and parent paths."],
    git: ["GIT(1)", "NAME", "    git - inspect the fixture repository", "SYNOPSIS", "    git --version|status|log", "DESCRIPTION", "    Operates only on ~/highlion's simulated repository.", "    Status reports overlay edits under that path.", "    No remote, credentials or GitHub connection exists."]
  };

  function BusyBox(machine) {
    this.machine = machine;
    this.fs = machine.fs;
    this.commandNames = new Set(machine.config.busyboxCommands || []);
  }

  BusyBox.prototype.readInput = function (args, stdin, command) {
    if (!args.length && stdin !== null && stdin !== undefined) return { text: String(stdin), label: "-" };
    if (!args.length) throw new Error("missing file operand");
    var chunks = [];
    args.forEach(function (path) { chunks.push(this.machine.readFile(path)); }, this);
    return { text: chunks.join(""), label: args.join(" ") };
  };

  BusyBox.prototype.mutate = function (callback) {
    callback();
    this.machine.persist();
    return result();
  };

  BusyBox.prototype.cmdPwd = function (args) { return args.length ? failure("pwd", "too many arguments") : result(this.machine.cwd + "\n"); };
  BusyBox.prototype.cmdCd = function (args) {
    if (args.length > 1) return failure("cd", "too many arguments");
    try { var output = this.machine.changeDirectory(args[0] || this.machine.identity.home); return result(output ? output + "\n" : ""); }
    catch (error) { return failure("cd", error); }
  };

  BusyBox.prototype.cmdLs = function (args) {
    var all = false; var long = false; var paths = [];
    args.forEach(function (arg) {
      if (/^-[al]+$/.test(arg)) { all = all || arg.indexOf("a") !== -1; long = long || arg.indexOf("l") !== -1; }
      else paths.push(arg);
    });
    try {
      var targets = paths.length ? paths : ["."];
      var blocks = targets.map(function (target) {
        var absolute = this.fs.resolve(target, this.machine.cwd, true);
        var node = this.fs.stat(absolute, "/");
        if (!node) throw new Error(target + ": no such file or directory");
        var rows = this.fs.list(absolute, "/", all);
        if (node.type === "dir" && all) rows = [{ name: ".", path: absolute, node: node }, { name: "..", path: HL.path.dirname(absolute), node: this.fs.stat(HL.path.dirname(absolute), "/") }].concat(rows);
        var output = !long ? rows.map(function (row) { return row.name; }).join("  ") : rows.map(function (row) {
          var stamp = new Date(row.node.mtime || Date.now());
          var month = stamp.toLocaleString("en", { month: "short" });
          var day = String(stamp.getDate()).padStart(2, " ");
          var time = stamp.toTimeString().slice(0, 5);
          var name = row.name + (row.node.type === "symlink" ? " -> " + row.node.target : "");
          return this.fs.modeString(row.node) + " 1 " + String(row.node.owner).padEnd(8, " ") + " " + String(row.node.group).padEnd(8, " ") + " " + String(this.fs.size(row.node)).padStart(6, " ") + " " + month + " " + day + " " + time + " " + name;
        }, this).join("\n");
        return (targets.length > 1 && node.type === "dir" ? target + ":\n" : "") + output;
      }, this);
      return result(blocks.join("\n\n") + (blocks.length ? "\n" : ""));
    } catch (error) { return failure("ls", error); }
  };

  BusyBox.prototype.cmdCat = function (args, stdin) {
    try { return result(this.readInput(args, stdin, "cat").text); } catch (error) { return failure("cat", error); }
  };

  BusyBox.prototype.cmdHeadTail = function (name, args, stdin) {
    var count = 10;
    if (args[0] === "-n" && /^\d+$/.test(args[1] || "")) { count = Number(args[1]); args = args.slice(2); }
    try {
      var data = this.readInput(args, stdin, name);
      var lines = data.text.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      var selected = name === "head" ? lines.slice(0, count) : lines.slice(-count);
      return result(selected.join("\n") + (selected.length ? "\n" : ""));
    } catch (error) { return failure(name, error); }
  };

  BusyBox.prototype.cmdWc = function (args, stdin) {
    var flag = "";
    if (["-l", "-w", "-c"].indexOf(args[0]) !== -1) flag = args.shift();
    try {
      var data = this.readInput(args, stdin, "wc");
      var lines = data.text === "" ? 0 : data.text.replace(/\n$/, "").split("\n").length;
      var words = data.text.trim() ? data.text.trim().split(/\s+/).length : 0;
      var count = bytes(data.text).length;
      var value = flag === "-l" ? lines : flag === "-w" ? words : flag === "-c" ? count : lines + " " + words + " " + count;
      return result(String(value) + (data.label === "-" ? "" : " " + data.label) + "\n");
    } catch (error) { return failure("wc", error); }
  };

  BusyBox.prototype.cmdTee = function (args, stdin) {
    var append = args[0] === "-a";
    if (append) args.shift();
    if (!args.length) return failure("tee", "missing file operand");
    try {
      var text = String(stdin || "");
      args.forEach(function (path) { this.machine.writeFile(path, text, append); }, this);
      return result(text);
    } catch (error) { return failure("tee", error); }
  };

  BusyBox.prototype.cmdEcho = function (args) {
    var newline = true; var escapes = false;
    while (args[0] === "-n" || args[0] === "-e" || args[0] === "-ne" || args[0] === "-en") {
      var option = args.shift();
      if (option.indexOf("n") !== -1) newline = false;
      if (option.indexOf("e") !== -1) escapes = true;
    }
    var text = args.join(" ");
    if (escapes) text = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r").replace(/\\\\/g, "\\");
    return result(text + (newline ? "\n" : ""));
  };

  BusyBox.prototype.cmdPrintf = function (args) {
    if (!args.length) return result();
    var format = args.shift().replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
    var index = 0;
    return result(format.replace(/%[sd%]/g, function (token) {
      if (token === "%%") return "%";
      var value = args[index++] || "";
      return token === "%d" ? String(Number(value) || 0) : value;
    }));
  };

  BusyBox.prototype.cmdTest = function (args, bracket) {
    if (bracket) {
      if (args[args.length - 1] !== "]") return failure("[", "missing ]", 2);
      args.pop();
    }
    var ok = false;
    try {
      if (args.length === 1) ok = args[0] !== "";
      else if (args.length === 2 && ["-e", "-f", "-d", "-s", "-r", "-w", "-x"].indexOf(args[0]) !== -1) {
        var node = this.fs.stat(args[1], this.machine.cwd);
        ok = Boolean(node && (args[0] === "-e" || (args[0] === "-f" && node.type === "file") || (args[0] === "-d" && node.type === "dir") || (args[0] === "-s" && this.fs.size(node) > 0) || (["-r", "-w", "-x"].indexOf(args[0]) !== -1 && this.fs.canAccess(node, args[0].slice(1)))));
      } else if (args.length === 2 && (args[0] === "-z" || args[0] === "-n")) {
        ok = args[0] === "-z" ? args[1] === "" : args[1] !== "";
      } else if (args.length === 3 && ["-eq", "-ne", "-gt", "-lt"].indexOf(args[1]) !== -1) {
        var left = Number(args[0]); var right = Number(args[2]);
        ok = Number.isFinite(left) && Number.isFinite(right) && (args[1] === "-eq" ? left === right : args[1] === "-ne" ? left !== right : args[1] === "-gt" ? left > right : left < right);
      } else if (args.length === 3) ok = args[1] === "=" ? args[0] === args[2] : args[1] === "!=" ? args[0] !== args[2] : false;
    } catch (error) { ok = false; }
    return result("", ok ? 0 : 1);
  };

  BusyBox.prototype.cmdMkdir = function (args) {
    var parents = args[0] === "-p"; if (parents) args.shift();
    if (!args.length) return failure("mkdir", "missing operand");
    try { args.forEach(function (path) { this.fs.mkdir(path, this.machine.cwd, parents, false); }, this); this.machine.persist(); return result(); }
    catch (error) { return failure("mkdir", error); }
  };

  BusyBox.prototype.cmdRmdir = function (args) {
    if (!args.length) return failure("rmdir", "missing operand");
    try { args.forEach(function (path) { this.fs.remove(path, this.machine.cwd, false); }, this); this.machine.persist(); return result(); }
    catch (error) { return failure("rmdir", error); }
  };

  BusyBox.prototype.cmdTouch = function (args) {
    if (!args.length) return failure("touch", "missing file operand");
    try { args.forEach(function (path) { this.fs.touch(path, this.machine.cwd); }, this); this.machine.persist(); return result(); }
    catch (error) { return failure("touch", error); }
  };

  BusyBox.prototype.cmdCpMv = function (name, args) {
    var recursive = args[0] === "-r" || args[0] === "-R"; if (recursive) args.shift();
    if (args.length !== 2) return failure(name, "usage: " + name + " SRC DST");
    try {
      if (name === "cp") this.fs.copy(args[0], args[1], this.machine.cwd, recursive);
      else this.fs.rename(args[0], args[1], this.machine.cwd);
      this.machine.persist(); return result();
    } catch (error) { return failure(name, error); }
  };

  BusyBox.prototype.cmdRm = function (args) {
    var recursive = args[0] === "-r" || args[0] === "-R" || args[0] === "-rf"; if (recursive) args.shift();
    if (!args.length) return failure("rm", "missing operand");
    try {
      var visitorHome = this.machine.users[this.machine.visitorName].home;
      var remountHome = recursive && this.machine.identity.user === this.machine.visitorName && args.some(function (path) {
        return this.fs.resolve(path, this.machine.cwd, false) === visitorHome;
      }, this);
      args.forEach(function (path) { this.fs.remove(path, this.machine.cwd, recursive); }, this);
      if (remountHome) this.machine.remountHome(this.machine.visitorName);
      else this.machine.persist();
      return result();
    }
    catch (error) { return failure("rm", error); }
  };

  BusyBox.prototype.cmdLn = function (args) {
    if (args[0] !== "-s" || args.length !== 3) return failure("ln", "only symbolic links are supported");
    try { this.fs.symlink(args[1], args[2], this.machine.cwd, false); this.machine.persist(); return result(); }
    catch (error) { return failure("ln", error); }
  };

  BusyBox.prototype.cmdChmod = function (args) {
    if (args.length !== 2 || (!/^[0-7]{3,4}$/.test(args[0]) && args[0] !== "u+x")) return failure("chmod", "usage: chmod MODE FILE");
    try {
      var mode = args[0];
      if (mode === "u+x") {
        var node = this.fs.lstat(args[1], this.machine.cwd);
        if (!node) throw new Error("no such file or directory");
        mode = (Number(node.mode) | 64).toString(8).padStart(4, "0");
      }
      this.fs.chmod(args[1], mode, this.machine.cwd); this.machine.persist(); return result();
    } catch (error) { return failure("chmod", error); }
  };

  BusyBox.prototype.cmdChown = function (args) {
    if (args.length !== 2) return failure("chown", "usage: chown OWNER[:GROUP] FILE");
    var parts = args[0].split(":");
    try { this.fs.chown(args[1], parts[0], parts[1] || parts[0], this.machine.cwd); this.machine.persist(); return result(); } catch (error) { return failure("chown", error); }
  };

  BusyBox.prototype.cmdStat = function (args) {
    if (args.length !== 1) return failure("stat", "missing file operand");
    try {
      var absolute = this.fs.resolve(args[0], this.machine.cwd, false); var node = this.fs.lstat(absolute, "/");
      if (!node) throw new Error("no such file or directory");
      return result("  File: " + absolute + "\n  Size: " + this.fs.size(node) + "\tType: " + node.type + "\nAccess: (" + node.mode.toString(8).padStart(4,"0") + "/" + this.fs.modeString(node) + ")  Uid: ( " + node.owner + " )   Gid: ( " + node.group + " )\nModify: " + node.mtime + "\n");
    } catch (error) { return failure("stat", error); }
  };

  BusyBox.prototype.cmdFile = function (args) {
    if (!args.length) return failure("file", "missing file operand");
    var lines = [];
    try {
      args.forEach(function (path) {
        var node = this.fs.lstat(path, this.machine.cwd); if (!node) throw new Error(path + ": no such file");
        var kind = node.type === "dir" ? "directory" : node.type === "symlink" ? "symbolic link to " + node.target : String(node.content || "").indexOf("#!") === 0 ? "POSIX shell script, ASCII text executable" : /[^\x09\x0a\x0d\x20-\x7e]/.test(String(node.content || "")) ? "data" : "ASCII text";
        lines.push(path + ": " + kind);
      }, this);
      return result(lines.join("\n") + "\n");
    } catch (error) { return failure("file", error); }
  };

  BusyBox.prototype.cmdTree = function (args) {
    var maxDepth = Infinity;
    var path = ".";
    for (var index = 0; index < args.length; index += 1) {
      if (args[index] === "-L" && /^\d+$/.test(args[index + 1] || "")) maxDepth = Number(args[++index]);
      else if (args[index].charAt(0) === "-") return failure("tree", "usage: tree [-L LEVEL] [DIRECTORY]");
      else if (path === ".") path = args[index];
      else return failure("tree", "too many arguments");
    }
    try {
      var rootPath = this.fs.resolve(path, this.machine.cwd, true);
      var lines = [rootPath];
      var directories = 0;
      var files = 0;
      var visit = function (directory, depth, prefix) {
        if (depth > maxDepth) return;
        var rows;
        try { rows = this.fs.list(directory, "/", false); }
        catch (error) { lines.push(prefix + "└── [error opening dir]"); return; }
        rows.forEach(function (row, rowIndex) {
          var last = rowIndex === rows.length - 1;
          lines.push(prefix + (last ? "└── " : "├── ") + row.name);
          if (row.node.type === "dir") {
            directories += 1;
            if (depth < maxDepth) visit(row.path, depth + 1, prefix + (last ? "    " : "│   "));
          } else files += 1;
        });
      }.bind(this);
      visit(rootPath, 1, "");
      lines.push("", directories + " directories, " + files + " files");
      return result(lines.join("\n") + "\n");
    } catch (error) { return failure("tree", error); }
  };

  BusyBox.prototype.cmdFind = function (args) {
    var start = "."; var pattern = null; var type = ""; var maxDepth = Infinity;
    if (args[0] && args[0].charAt(0) !== "-") start = args.shift();
    while (args.length) {
      var flag = args.shift();
      if (flag === "-name" && args.length) pattern = wildcard(HL.path.basename(args.shift()));
      else if (flag === "-type" && /^[fdl]$/.test(args[0] || "")) type = args.shift();
      else if (flag === "-maxdepth" && /^\d+$/.test(args[0] || "")) maxDepth = Number(args.shift());
      else return failure("find", "usage: find [path] [-maxdepth N] [-type f|d|l] [-name GLOB]");
    }
    try {
      var base = this.fs.resolve(start, this.machine.cwd, true);
      var rows = this.fs.walk(start, this.machine.cwd).filter(function (row) {
        var depth = row.path === base ? 0 : row.path.slice(base === "/" ? 1 : base.length + 1).split("/").length;
        var kind = row.node.type === "file" ? "f" : row.node.type === "dir" ? "d" : "l";
        return depth <= maxDepth && (!type || type === kind) && (!pattern || pattern.test(HL.path.basename(row.path)));
      });
      return result(rows.map(function (row) { return row.path; }).join("\n") + "\n");
    } catch (error) { return failure("find", error); }
  };

  BusyBox.prototype.cmdGrep = function (args, stdin) {
    var numbered = false; var insensitive = false; var recursive = false; var invert = false; var filesOnly = false; var extended = false;
    while (args[0] && /^-/.test(args[0])) {
      var flags = args.shift(); numbered = numbered || flags.indexOf("n") !== -1; insensitive = insensitive || flags.indexOf("i") !== -1; recursive = recursive || /[Rr]/.test(flags); invert = invert || flags.indexOf("v") !== -1; filesOnly = filesOnly || flags.indexOf("l") !== -1; extended = extended || flags.indexOf("E") !== -1;
    }
    var pattern = args.shift();
    if (!pattern) return failure("grep", "missing pattern", 2);
    var targets = args; var inputs = [];
    try {
      if (!targets.length && stdin !== null && stdin !== undefined) inputs.push({ path: "", text: String(stdin) });
      else if (!targets.length) throw new Error("missing file operand");
      else targets.forEach(function (path) {
        var node = this.fs.stat(path, this.machine.cwd);
        if (node && node.type === "dir" && recursive) {
          this.fs.walk(path, this.machine.cwd).forEach(function (row) { if (row.node.type === "file") inputs.push({ path: row.path, text: this.machine.readFile(row.path) }); }, this);
        } else inputs.push({ path: path, text: this.machine.readFile(path) });
      }, this);
      var needle = insensitive ? pattern.toLowerCase() : pattern; var expression = null; var out = [];
      if (extended) expression = new RegExp(pattern, insensitive ? "i" : "");
      inputs.forEach(function (input) {
        var matchedFile = false;
        input.text.split("\n").forEach(function (line, index) {
          var hay = insensitive ? line.toLowerCase() : line;
          var matched = expression ? expression.test(line) : hay.indexOf(needle) !== -1;
          if (invert) matched = !matched;
          if (matched && !filesOnly) out.push((inputs.length > 1 || recursive ? input.path + ":" : "") + (numbered ? (index + 1) + ":" : "") + line);
          if (matched) matchedFile = true;
        });
        if (filesOnly && matchedFile) out.push(input.path);
      });
      return result(out.join("\n") + (out.length ? "\n" : ""), out.length ? 0 : 1);
    } catch (error) { return failure("grep", error, 2); }
  };

  BusyBox.prototype.cmdSort = function (args, stdin) { try { var data=this.readInput(args,stdin,"sort"); return result(data.text.replace(/\n$/,"").split("\n").sort().join("\n")+"\n"); } catch(error){return failure("sort",error);} };
  BusyBox.prototype.cmdUniq = function (args, stdin) {
    var counts = args[0] === "-c"; if (counts) args.shift();
    try { var lines=this.readInput(args,stdin,"uniq").text.replace(/\n$/,"").split("\n"); var out=[]; var previous=null; var count=0; lines.concat([null]).forEach(function(line){if(line===previous)count+=1;else{if(previous!==null)out.push((counts?String(count).padStart(7," ")+" ":"")+previous);previous=line;count=1;}}); return result(out.join("\n")+(out.length?"\n":"")); } catch(error){return failure("uniq",error);}
  };
  BusyBox.prototype.cmdCut = function (args, stdin) {
    var delimiter="\t"; var field=0;
    for(var index=0;index<args.length;index+=1){if(args[index]==="-d")delimiter=args[++index]||"";else if(args[index]==="-f")field=Number(args[++index]);else break;}
    var files=args.slice(index); if(!field)return failure("cut","usage: cut -d DELIM -f N [FILE]");
    try{var text=this.readInput(files,stdin,"cut").text;return result(text.split("\n").map(function(line){return (line.split(delimiter)[field-1]||"");}).join("\n"));}catch(error){return failure("cut",error);}
  };
  BusyBox.prototype.cmdTr = function (args, stdin) {
    if(args.length!==2||stdin===null||stdin===undefined)return failure("tr","usage: tr SET1 SET2"); var from=args[0];var to=args[1];var out=String(stdin).split("").map(function(char){var at=from.indexOf(char);return at<0?char:to[Math.min(at,to.length-1)]||"";}).join("");return result(out);
  };

  BusyBox.prototype.cmdSed = function (args, stdin) {
    var quiet = args[0] === "-n"; if (quiet) args.shift();
    var expression = args.shift() || "";
    var match = /^s(.)(.*?)\1(.*?)\1([gp]*)$/.exec(expression);
    if (!match) return failure("sed", "usage: sed [-n] 's/REGEXP/REPLACEMENT/[gp]' [FILE]");
    try {
      var data = this.readInput(args, stdin, "sed").text;
      var regex = new RegExp(match[2], match[4].indexOf("g") !== -1 ? "g" : "");
      var changed = false;
      var output = data.split("\n").map(function (line) {
        regex.lastIndex = 0;
        var hit = regex.test(line); regex.lastIndex = 0;
        if (hit) changed = true;
        var next = line.replace(regex, match[3].replace(/\\n/g, "\n"));
        return quiet ? (hit && match[4].indexOf("p") !== -1 ? next : null) : next;
      }).filter(function (line) { return line !== null; }).join("\n");
      return result(output + (output && !output.endsWith("\n") ? "\n" : ""), changed || !quiet ? 0 : 1);
    } catch (error) { return failure("sed", error); }
  };

  BusyBox.prototype.cmdAwk = function (args, stdin) {
    var program = args.shift() || "";
    var match = /^\{\s*print(?:\s+\$(\d+))?\s*\}$/.exec(program);
    if (!match) return failure("awk", "only '{ print }' and '{ print $N }' are available");
    try {
      var text = this.readInput(args, stdin, "awk").text.replace(/\n$/, "");
      var field = Number(match[1] || 0);
      var lines = text ? text.split("\n").map(function (line) {
        return field ? (line.trim().split(/\s+/)[field - 1] || "") : line;
      }) : [];
      return result(lines.join("\n") + (lines.length ? "\n" : ""));
    } catch (error) { return failure("awk", error); }
  };

  BusyBox.prototype.cmdDiff = function (args) {
    if (args.length !== 2) return failure("diff", "usage: diff FILE1 FILE2", 2);
    try {
      var left = this.machine.readFile(args[0]).split("\n");
      var right = this.machine.readFile(args[1]).split("\n");
      if (left.join("\n") === right.join("\n")) return result();
      var out = ["--- " + args[0], "+++ " + args[1], "@@ -1," + left.length + " +1," + right.length + " @@"];
      left.forEach(function (line) { out.push("-" + line); });
      right.forEach(function (line) { out.push("+" + line); });
      return result(out.join("\n") + "\n", 1);
    } catch (error) { return failure("diff", error, 2); }
  };

  BusyBox.prototype.cmdCal = function (args) {
    if (args.length) return failure("cal", "usage: cal");
    var now = new Date(); var year = now.getFullYear(); var month = now.getMonth();
    var title = now.toLocaleString("en", { month: "long" }) + " " + year;
    var first = new Date(year, month, 1).getDay(); var days = new Date(year, month + 1, 0).getDate();
    var cells = Array(first).fill("  ");
    for (var day = 1; day <= days; day += 1) cells.push(String(day).padStart(2, " "));
    var rows = [];
    for (var at = 0; at < cells.length; at += 7) rows.push(cells.slice(at, at + 7).join(" "));
    return result(title.padStart(Math.floor((20 + title.length) / 2), " ") + "\nSu Mo Tu We Th Fr Sa\n" + rows.join("\n") + "\n");
  };

  BusyBox.prototype.cmdYes = function (args) { return result(Array(256).fill(args.join(" ") || "y").join("\n") + "\n"); };
  BusyBox.prototype.cmdSeq = function (args) {
    if (!args.length || args.length > 3 || args.some(function (value) { return !Number.isFinite(Number(value)); })) return failure("seq", "usage: seq [FIRST [INCREMENT]] LAST");
    var first = args.length === 1 ? 1 : Number(args[0]); var step = args.length === 3 ? Number(args[1]) : 1; var last = Number(args[args.length - 1]);
    if (!step) return failure("seq", "zero increment");
    var out = [];
    for (var value = first; out.length < 10000 && (step > 0 ? value <= last : value >= last); value += step) out.push(String(value));
    return result(out.join("\n") + (out.length ? "\n" : ""));
  };
  BusyBox.prototype.cmdSleep = async function (args) {
    if (args.length !== 1 || !/^\d+(?:\.\d+)?$/.test(args[0])) return failure("sleep", "invalid time interval");
    await new Promise(function (resolve) { root.setTimeout(resolve, Math.min(10000, Number(args[0]) * 1000)); });
    return result();
  };
  BusyBox.prototype.cmdTimeout = async function (args, shell) {
    if (args.length < 2 || !/^\d+(?:\.\d+)?s?$/.test(args[0])) return failure("timeout", "usage: timeout DURATION COMMAND [ARG]...");
    var milliseconds = Math.min(10000, Number(args.shift().replace(/s$/, "")) * 1000);
    var timer;
    var expired = new Promise(function (resolve) { timer = root.setTimeout(function () { resolve(result("", 124)); }, milliseconds); });
    var run = shell.run(args.join(" "), { capture: true, depth: 1 });
    var output = await Promise.race([run, expired]);
    root.clearTimeout(timer);
    return output;
  };

  BusyBox.prototype.cmdHash = async function (name, args, stdin) {
    try {
      if (!args.length && stdin !== null && stdin !== undefined) return result((name === "sha256sum" ? await digest("SHA-256", stdin) : md5(stdin)) + "  -\n");
      if (!args.length) throw new Error("missing file operand");
      var lines=[]; for(var index=0;index<args.length;index+=1){var text=this.machine.readFile(args[index]);lines.push((name==="sha256sum"?await digest("SHA-256",text):md5(text))+"  "+args[index]);} return result(lines.join("\n")+"\n");
    } catch(error){return failure(name,error);}
  };

  BusyBox.prototype.cmdBase64 = function(args,stdin){try{var text=this.readInput(args,stdin,"base64").text;var binary=String.fromCharCode.apply(null,bytes(text));return result(root.btoa(binary)+"\n");}catch(error){return failure("base64",error);}};
  BusyBox.prototype.cmdHex = function(name,args,stdin){try{var data=bytes(this.readInput(args,stdin,name).text);var lines=[];for(var offset=0;offset<data.length;offset+=16){var slice=Array.from(data.slice(offset,offset+16));if(name==="od")lines.push(offset.toString(8).padStart(7,"0")+" "+slice.map(function(v){return v.toString(8).padStart(3,"0");}).join(" "));else lines.push(offset.toString(16).padStart(8,"0")+"  "+slice.map(function(v){return v.toString(16).padStart(2,"0");}).join(" ").padEnd(47," ")+"  |"+slice.map(function(v){return v>=32&&v<127?String.fromCharCode(v):".";}).join("")+"|");}return result(lines.join("\n")+"\n");}catch(error){return failure(name,error);}};
  BusyBox.prototype.cmdPager=function(name,args,stdin){try{var data=this.readInput(args,stdin,name);return result("",0,"",{pager:{command:name,label:data.label,text:data.text}});}catch(error){return failure(name,error);}};

  BusyBox.prototype.cmdGzip = async function(name,args){
    if(args.length!==1)return failure(name,"usage: "+name+" FILE");
    var source=args[0];
    try{
      if(name==="gzip"){
        var compressed=await gzipText(this.machine.readFile(source));
        this.machine.writeFile(source+".gz",compressed,false);
        this.fs.remove(source,this.machine.cwd,false);this.machine.persist();
        return result();
      }
      var text=await gunzipText(this.machine.readFile(source));
      if(name==="zcat")return result(text);
      var destination=source.replace(/\.gz$/,"");
      if(destination===source)throw new Error("unknown suffix -- ignored");
      this.machine.writeFile(destination,text,false);
      this.fs.remove(source,this.machine.cwd,false);this.machine.persist();
      return result();
    }catch(error){return failure(name,error);}
  };

  BusyBox.prototype.cmdTar = async function(args){
    if(args.length<2)return failure("tar","usage: tar -cf|-tf|-xf ARCHIVE [PATH ...]");
    var option=args.shift();var archive=args.shift();
    if(!/^-?[ctx]z?f$/.test(option))return failure("tar","supported options: -cf -tf -xf -czf -tzf -xzf");
    var action=option.indexOf("c")!==-1?"c":option.indexOf("t")!==-1?"t":"x";var zipped=option.indexOf("z")!==-1;
    try{
      if(action==="c"){
        if(!args.length)throw new Error("cowardly refusing to create an empty archive");
        var entries=[];var seen=new Set();
        args.forEach(function(path){
          this.fs.walk(path,this.machine.cwd).forEach(function(row){
            var absolute=row.path;var stored=absolute.indexOf(this.machine.cwd+"/")===0?absolute.slice(this.machine.cwd.length+1):absolute.replace(/^\/+/,"");
            if(!stored||seen.has(stored))return;seen.add(stored);
            var entry={path:stored,type:row.node.type,mode:Number(row.node.mode).toString(8),target:row.node.target||""};
            if(row.node.type==="file")entry.content=this.machine.readFile(absolute);
            entries.push(entry);
          },this);
        },this);
        var packed="HLTAR1:"+bytesToBase64(bytes(JSON.stringify(entries)));
        if(zipped)packed=await gzipText(packed);
        this.machine.writeFile(archive,packed,false);return result();
      }
      var packedText=this.machine.readFile(archive);if(zipped)packedText=await gunzipText(packedText);
      if(packedText.indexOf("HLTAR1:")!==0)throw new Error("this does not look like a tar archive");
      var rows=JSON.parse(new TextDecoder().decode(base64ToBytes(packedText.slice(7))));
      if(!Array.isArray(rows))throw new Error("invalid archive");
      if(action==="t")return result(rows.map(function(row){return row.path+(row.type==="dir"?"/":"");}).join("\n")+"\n");
      rows.forEach(function(row){
        if(!row||typeof row.path!=="string"||row.path.charAt(0)==="/"||/(^|\/)\.\.?($|\/)/.test(row.path))throw new Error("unsafe archive path");
        if(row.type==="dir")this.fs.mkdir(row.path,this.machine.cwd,true,false);
        else{
          var parent=HL.path.dirname(this.fs.normalize(row.path,this.machine.cwd));
          if(!this.fs.nodes.has(parent))this.fs.mkdir(parent,"/",true,false);
          if(row.type==="symlink")this.fs.symlink(String(row.target||""),row.path,this.machine.cwd,false);
          else this.fs.writeFile(row.path,String(row.content||""),this.machine.cwd,false,false);
        }
      },this);
      if(!this.machine.persist())throw new Error("persistence limit exceeded");
      return result();
    }catch(error){return failure("tar",error);}
  };

  BusyBox.prototype.cmdGit = function(args){
    if(args.length===1&&args[0]==="--version")return result("git version 2.51.0\n");
    var repo="/home/kali/highlion";var cwd=this.machine.cwd;
    if(cwd!==repo&&cwd.indexOf(repo+"/")!==0)return failure("git","not a git repository (or any parent up to mount point /)",128);
    if(!args.length||args[0]==="status"){
      var dirty=Array.from(this.fs.dirty).filter(function(path){return path.indexOf(repo+"/")===0&&path.indexOf(repo+"/.trophies/")!==0&&path.indexOf(repo+"/.git/")!==0;});
      var out="On branch main\n";
      if(!dirty.length)out+="nothing to commit, working tree clean\n";
      else out+="Changes not staged for commit:\n"+dirty.map(function(path){return "\tmodified:   "+path.slice(repo.length+1);}).join("\n")+"\n";
      return result(out);
    }
    if(args[0]==="log")return result("commit 545b41606a274209003cc1e66e4cd1bfc04468f9 (HEAD -> main)\nAuthor: HighLion Lab <lab@localhost>\nDate:   Sun Sep 28 11:17:19 2026 +0000\n\n    harden HLv8 shell and loading states\n\ncommit 69c6a4f52c2a32fd7ae88bf40000000000000000\nAuthor: HighLion Lab <lab@localhost>\nDate:   Sat Sep 26 09:00:00 2026 +0000\n\n    add auth and shell slots\n");
    return failure("git","supported: git --version, git status, git log");
  };

  BusyBox.prototype.cmdMan = function(args){if(args.length!==1)return failure("man","what manual page do you want?");if(MANUALS[args[0]])return result(MANUALS[args[0]].join("\n")+"\n");try{return result(this.machine.readFile("/usr/share/man/man1/"+args[0]+".1"));}catch(error){return failure("man","No manual entry for "+args[0]);}};
  BusyBox.prototype.cmdHelp = function(args){
    if(args.length===1)return this.cmdMan(args);
    if(args.length)return failure("help","usage: help [command]");
    return result("GNU bash, version 5.3\nShell commands:\n  cd pwd help history alias clear reset exit export unset env jobs fg bg\n  ls cat head tail less more grep find mkdir touch cp mv rm chmod chown\n  nano vim vi tar gzip gunzip zcat git sha256sum md5sum bash\n  ps top kill pkill who w id groups df free lsblk mount\n  ip ifconfig route arp ss netstat ping nmap nc ssh traceroute dig host whois curl wget\n  su sudo score trophies claim hint motd open writeups projects\n");
  };

  BusyBox.prototype.cmdWhichType = function(name,args,shell){if(args.length!==1)return failure(name,"usage: "+name+" NAME");var path=shell.resolveCommand(args[0]);if(!path)return result("",1,name+": "+args[0]+" not found\n");if(name==="type")return result(args[0]+" is "+(this.commandNames.has(args[0])?"a shell builtin":""+path)+"\n");return result(path+"\n");};
  BusyBox.prototype.cmdEnv=function(args){if(args.length)return failure("env","command execution through env is not supported");return result(Object.keys(this.machine.env).filter(function(name){return this.machine.exported.indexOf(name)!==-1;},this).sort().map(function(name){return name+"="+this.machine.env[name];},this).join("\n")+"\n");};
  BusyBox.prototype.cmdExport=function(args){if(!args.length)return this.cmdEnv([]);for(var index=0;index<args.length;index+=1){var match=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(args[index]);if(!match)return failure("export","not valid in this context: "+args[index]);this.machine.env[match[1]]=match[2];if(this.machine.exported.indexOf(match[1])===-1)this.machine.exported.push(match[1]);}this.machine.persist();return result();};
  BusyBox.prototype.cmdUnset=function(args){args.forEach(function(name){delete this.machine.env[name];this.machine.exported=this.machine.exported.filter(function(item){return item!==name;});},this);this.machine.persist();return result();};
  BusyBox.prototype.cmdSet=function(){return result(Object.keys(this.machine.env).sort().map(function(name){return name+"="+this.machine.env[name];},this).join("\n")+"\n");};
  BusyBox.prototype.cmdSource=function(args){if(args.length!==1)return failure("source","usage: source ~/.zshrc");try{var path=this.fs.resolve(args[0],this.machine.cwd,true);if(path!==this.machine.identity.home+"/.zshrc")throw new Error("only ~/.zshrc may be sourced");this.machine.loadAliases();return result();}catch(error){return failure("source",error);}};

  BusyBox.prototype.cmdIdentity=function(name,args){
    if(args.length)return failure(name,"extra operand");
    var identity=this.machine.identity;
    if(name==="whoami")return result(identity.user+"\n");
    if(name==="hostname")return result(identity.host+"\n");
    if(name==="id")return result("uid="+identity.uid+"("+identity.user+") gid="+identity.gid+"("+identity.user+") groups="+(identity.groups||[]).join(",")+"\n");
    return result((identity.groups||[]).join(" ")+"\n");
  };
  BusyBox.prototype.cmdDate=function(args){return args.length?failure("date","extra operand"):result(new Date().toString()+"\n");};
  BusyBox.prototype.cmdUname=function(args){if(!args.length)return result("Linux\n");if(args.length===1&&args[0]==="-a")return result(String(this.machine.image.proc.version)+"\n");if(args.length===1&&args[0]==="-m")return result(String(this.machine.image.proc.architecture)+"\n");return failure("uname","invalid option");};
  BusyBox.prototype.cmdUmask=function(args){if(!args.length)return result(this.machine.umask+"\n");if(args.length===1&&/^[0-7]{3,4}$/.test(args[0])){this.machine.umask=args[0].padStart(4,"0");return result();}return failure("umask","usage: umask [MODE]");};

  BusyBox.prototype.cmdPs=function(args){return result(this.machine.proc.ps(args.indexOf("aux")!==-1||args.indexOf("-ef")!==-1));};
  BusyBox.prototype.cmdPidof=function(args){if(args.length!==1)return failure("pidof","usage: pidof NAME");var ids=this.machine.proc.pidof(args[0]);return result(ids.join(" ")+(ids.length?"\n":""),ids.length?0:1);};
  BusyBox.prototype.cmdKill=function(args){if(args.length!==1||!/^\d+$/.test(args[0]))return failure("kill","usage: kill PID");var state=this.machine.proc.kill(args[0],this.machine.identity.user);return state.ok?result():failure("kill",state.message);};
  BusyBox.prototype.cmdPkill=function(args){if(args.length!==1)return failure("pkill","usage: pkill NAME");var state=this.machine.proc.killByName(args[0],this.machine.identity.user);return state.ok?result():failure("pkill",state.message);};
  BusyBox.prototype.cmdDf=function(args){if(args.length&&!(args.length===1&&args[0]==="-h"))return failure("df","usage: df -h");return result("Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        24G  8.1G   15G  36% /\n/dev/vda1       512M   82M  430M  17% /boot\ntmpfs           1.0G  1.2M 1023M   1% /run\n");};
  BusyBox.prototype.cmdDu=function(args){var summary=args[0]==="-sh";if(summary)args.shift();var path=args[0]||".";try{var total=this.fs.walk(path,this.machine.cwd).reduce(function(sum,row){return sum+this.fs.size(row.node);}.bind(this),0);return result((summary?human(total):String(total))+"\t"+path+"\n");}catch(error){return failure("du",error);}};
  BusyBox.prototype.cmdFree=function(args){if(args.length&&!(args.length===1&&args[0]==="-h"))return failure("free","usage: free -h");return result("               total        used        free      shared  buff/cache   available\nMem:           2.0Gi       512Mi       964Mi        24Mi       572Mi       1.4Gi\nSwap:          512Mi          0B       512Mi\n");};
  BusyBox.prototype.cmdUptime=function(){var seconds=this.machine.proc.uptimeSeconds();var hours=Math.floor(seconds/3600);var minutes=Math.floor((seconds%3600)/60);return result("up "+hours+":"+String(minutes).padStart(2,"0")+", 1 user, load average: 0.04, 0.02, 0.01\n");};
  BusyBox.prototype.cmdMount=function(args){return args.length?failure("mount","operation not permitted"):result(this.machine.mountText(true));};
  BusyBox.prototype.cmdDmesg=function(args){if(args.length)return failure("dmesg","unsupported option");return result("[    0.000000] Linux version 6.12.0-hl8 (debian-kernel@highlion)\n[    0.214008] smp: Bringing up secondary CPUs ...\n[    0.611402] virtio_net virtio0 eth0: link up\n[    1.093102] systemd[1]: Detected virtualization kvm.\n[    1.422941] systemd[1]: Reached target multi-user.target.\n");};
  BusyBox.prototype.cmdLscpu=function(args){if(args.length)return failure("lscpu","unsupported option");return result("Architecture:                         x86_64\nCPU op-mode(s):                       32-bit, 64-bit\nAddress sizes:                        39 bits physical, 48 bits virtual\nByte Order:                           Little Endian\nCPU(s):                               4\nOn-line CPU(s) list:                  0-3\nVendor ID:                            GenuineIntel\nModel name:                           HighLion Virtual CPU\nVirtualization:                       VT-x\nHypervisor vendor:                    KVM\n");};
  BusyBox.prototype.cmdLsmod=function(args){if(args.length)return failure("lsmod","unsupported option");return result("Module                  Size  Used by\nnf_tables             380928  12\nvirtio_net              73728  0\nvirtio_blk              28672  2\n");};
  BusyBox.prototype.cmdGetent=function(args){
    if(args.length===1&&["passwd","group"].indexOf(args[0])!==-1){try{return result(this.machine.readFile("/etc/"+args[0]));}catch(error){return failure("getent",error);}}
    if(args.length===2&&args[0]==="hosts"){
      var address=this.machine.net.resolve(args[1]);
      return address?result(address+"       "+args[1]+"\n"):result("",2);
    }
    return failure("getent","usage: getent passwd|group|hosts NAME");
  };
  BusyBox.prototype.cmdLast=function(){return result("kali     pts/0        10.8.0.38       Sat Sep 26 05:20   still logged in\nreboot   system boot  6.12.0-hl8     Sat Sep 26 05:19   still running\n");};
  BusyBox.prototype.cmdWho=function(name,args){
    if(args.length)return failure(name,"extra operand");
    var row=this.machine.identity.user+"     pts/0        "+new Date().toISOString().slice(0,16).replace("T"," ")+" (10.8.0.38)";
    if(name==="who")return result(row+"\n");
    return result(" "+new Date().toTimeString().slice(0,5)+" up "+Math.max(1,Math.floor(this.machine.proc.uptimeSeconds()/60))+" min, 1 user, load average: 0.04, 0.02, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n"+row+"   0.00s  0.01s  0.00s zsh\n");
  };

  BusyBox.prototype.cmdSessionctl=async function(args){
    var action=args[0]||"";
    if(!action)return result("usage: sessionctl who|list|drop ID\n");
    if(action==="who"&&args.length===1)return result(this.machine.identity.user+"\t"+(this.machine.lease.id||"local")+"\n");
    if(action!=="list"&&action!=="drop")return failure("sessionctl","usage: sessionctl who|list|drop ID");
    if(!this.machine.isRoot()||!this.machine.lease.operator||typeof this.machine.sessionControl!=="function")return failure("sessionctl","permission denied");
    if(action==="drop"&&(args.length!==2||!args[1]))return failure("sessionctl","usage: sessionctl drop ID");
    try{
      var payload=await this.machine.sessionControl(action,args[1]||"");
      if(!payload||payload.ok!==true)return failure("sessionctl","request failed");
      if(action==="drop")return result("dropped "+args[1]+"\n");
      var slots=Array.isArray(payload.slots)?payload.slots:[];
      return result(slots.map(function(row){return String(row.id)+"\t"+String(row.user||"kali");}).join("\n")+(slots.length?"\n":""));
    }catch(error){return failure("sessionctl","request failed");}
  };

  BusyBox.prototype.cmdPing=async function(args){
    var count=4; var host="";
    for(var at=0;at<args.length;at+=1){
      if(args[at]==="-c"&&/^\d+$/.test(args[at+1]||"")){count=Math.max(1,Math.min(10,Number(args[++at])));}
      else if(args[at].charAt(0)==="-")return failure("ping","usage: ping [-c COUNT] HOST");
      else if(!host)host=args[at];else return failure("ping","usage: ping [-c COUNT] HOST");
    }
    if(!host)return failure("ping","usage: ping [-c COUNT] HOST");
    var profile=this.machine.net.profile(host);
    if(!profile.address||profile.className==="unreachable"||profile.className==="broadcast")return failure("ping","connect: Network is unreachable",2);
    var address=profile.address;
    var lines=["PING "+host+" ("+address+") 56(84) bytes of data."];
    var received=0; var times=[];
    if(!profile.up){
      for(var missed=1;missed<=count;missed+=1)lines.push("From 10.8.0.1 icmp_seq="+missed+" Destination Host Unreachable");
      lines.push("","--- "+host+" ping statistics ---",count+" packets transmitted, 0 received, 100% packet loss, time 0ms");
      return result(lines.join("\n")+"\n",1);
    }
    this.machine.net.touch(address);
    for(var index=1;index<=count;index+=1){
      await new Promise(function(resolve){root.setTimeout(resolve,Math.max(0,profile.rtt));});
      var delivered=profile.up&&((profile.seed+index*37)%100>=profile.loss);
      if(!delivered)continue;
      var spread=((profile.seed>>>index%16)%200-100)/100;
      var timing=Math.max(0.02,profile.rtt+spread*profile.jitter);
      received+=1;times.push(timing);
      lines.push("64 bytes from "+address+": icmp_seq="+index+" ttl=64 time="+timing.toFixed(timing<1?3:1)+" ms");
    }
    var loss=Math.round((count-received)/count*100);
    lines.push("","--- "+host+" ping statistics ---",count+" packets transmitted, "+received+" received, "+loss+"% packet loss, time "+Math.ceil(count*profile.rtt)+"ms");
    if(times.length){var min=Math.min.apply(null,times);var max=Math.max.apply(null,times);var avg=times.reduce(function(sum,value){return sum+value;},0)/times.length;lines.push("rtt min/avg/max/mdev = "+min.toFixed(3)+"/"+avg.toFixed(3)+"/"+max.toFixed(3)+"/0.214 ms");}
    return result(lines.join("\n")+"\n",received?0:1);
  };
  BusyBox.prototype.cmdCurl=async function(name,args){
    var includeHeaders=false; var headOnly=false; var url="";
    args.forEach(function(arg){if(arg==="-i")includeHeaders=true;else if(arg==="-I"||arg==="--head")headOnly=true;else if(["-s","-S","-L","--silent"].indexOf(arg)===-1&&arg.charAt(0)!=="-")url=arg;});
    if(!url)return failure(name,"usage: "+name+" URL");
    function refused(host,port,detail){return result("",7,name+": (7) Failed to connect to "+host+" port "+port+": "+detail+"\n");}
    function allowed(path){
      return ["/","/index.html","/about.html","/projects.html","/writeups.html","/writeups/pihole.html","/writeups/cve-2026-2441.html","/css/style.css","/components/header.html","/components/footer.html","/404.html"].indexOf(path)!==-1
        || path.indexOf("/assets/icons/")===0 || path.indexOf("/assets/writeups/")===0;
    }
    var parsed;
    try{parsed=new URL(url.indexOf("://")===-1?"http://"+url:url);}catch(error){return result("",7,name+": (7) URL rejected: malformed input\n");}
    var port=parsed.port?Number(parsed.port):(parsed.protocol==="https:"?443:80);
    if(["http:","https:"].indexOf(parsed.protocol)===-1||parsed.pathname.indexOf("/api/")===0)return refused(parsed.hostname,port,"Connection refused");
    var localBrochure=["127.0.0.1","localhost"].indexOf(parsed.hostname.toLowerCase())!==-1&&allowed(parsed.pathname);
    if(!localBrochure){
      var simulated=this.machine.net.http(parsed.href);
      if(simulated.error==="timeout"){await new Promise(function(resolve){root.setTimeout(resolve,25);});return result("",28,name+": (28) Connection timed out after 25 milliseconds\n");}
      if(simulated.error==="network")return refused(parsed.hostname,port,"Network is unreachable");
      if(simulated.error==="noroute")return refused(parsed.hostname,port,"No route to host");
      if(simulated.error==="refused")return refused(parsed.hostname,port,"Connection refused");
      if(simulated.error)return refused(parsed.hostname,port,"Connection refused");
      var headers="HTTP/1.1 "+simulated.code+" "+simulated.label+"\nServer: "+simulated.server+"\nContent-Type: text/html; charset=utf-8\nContent-Length: "+simulated.body.length+"\n"+(simulated.location?"Location: "+simulated.location+"\n":"")+"Connection: close\n\n";
      return result((includeHeaders||headOnly?headers:"")+(headOnly?"":simulated.body)+(headOnly||simulated.body.endsWith("\n")?"":"\n"),simulated.code>=400?22:0);
    }
    var controller=typeof AbortController!=="undefined"?new AbortController():null;
    var timer=controller?root.setTimeout(function(){controller.abort();},8000):0;
    try{
      var response=await fetch(parsed.pathname+parsed.search,{method:"GET",credentials:"same-origin",cache:"no-store",redirect:"follow",signal:controller?controller.signal:undefined});
      var finalUrl=new URL(response.url,root.location.href);
      if(["127.0.0.1","localhost",root.location.hostname.toLowerCase()].indexOf(finalUrl.hostname.toLowerCase())===-1||!allowed(finalUrl.pathname))return refused(parsed.hostname,port,"Connection refused");
      var chunks=[];
      var total=0;
      if(response.body&&typeof response.body.getReader==="function"){
        var reader=response.body.getReader();
        while(true){
          var read=await reader.read();
          if(read.done)break;
          total+=read.value.byteLength;
          if(total>65536){await reader.cancel();return failure(name,"response exceeds 64 KiB");}
          chunks.push(read.value);
        }
      }else{
        var buffer=await response.arrayBuffer();
        total=buffer.byteLength;
        if(total>65536)return failure(name,"response exceeds 64 KiB");
        chunks.push(new Uint8Array(buffer));
      }
      var text="";
      var decoder=new TextDecoder("utf-8");
      chunks.forEach(function(chunk,index){text+=decoder.decode(chunk,{stream:index<chunks.length-1});});
      if(timer)root.clearTimeout(timer);
      var liveHeaders="HTTP/1.1 "+response.status+" "+response.statusText+"\nContent-Type: "+(response.headers.get("content-type")||"text/plain")+"\n\n";
      return result((includeHeaders||headOnly?liveHeaders:"")+(headOnly?"":text+(text.endsWith("\n")?"":"\n")),response.ok?0:22,response.ok?"":name+": server returned "+response.status+"\n");
    }catch(error){if(timer)root.clearTimeout(timer);return refused(parsed.hostname,port,"Connection refused");}
  };
  BusyBox.prototype.cmdNc=function(args){
    if(args.indexOf("-l")!==-1)return failure("nc","listen mode is not supported in this sealed network");
    var clean=args.filter(function(arg){return ["-v","-z","-n"].indexOf(arg)===-1;});
    if(clean.length!==2||!/^\d+$/.test(clean[1]))return failure("nc","usage: nc [-vz] HOST PORT");
    var profile=this.machine.net.profile(clean[0]);
    if(!profile.address||profile.className==="unreachable"||profile.className==="broadcast")return failure("nc","connect to "+clean[0]+" port "+clean[1]+" (tcp) failed: Network is unreachable");
    if(!profile.up)return failure("nc","connect to "+clean[0]+" port "+clean[1]+" (tcp) failed: No route to host");
    var row=this.machine.net.port(clean[0],Number(clean[1]));
    if(row.state!=="open")return failure("nc","connect to "+clean[0]+" port "+clean[1]+" (tcp) failed: Connection "+(row.state==="filtered"?"timed out":"refused"));
    this.machine.net.touch(profile.address);
    var banner=this.machine.net.banner(clean[0],Number(clean[1]));
    return result("Connection to "+clean[0]+" "+clean[1]+" port [tcp/"+row.service+"] succeeded!\n"+(banner?banner+"\n":""));
  };
  BusyBox.prototype.cmdSsh=function(args){
    var target=args.filter(function(arg){return arg.charAt(0)!=="-";}).pop()||"";
    if(target.indexOf("@")===-1)return failure("ssh","usage: ssh user@host");
    var pair=target.split("@");var profile=this.machine.net.profile(pair[1]);var port=this.machine.net.port(pair[1],22);
    if(!profile.address)return failure("ssh","Could not resolve hostname "+pair[1]+": Name or service not known",255);
    if(profile.className==="unreachable"||profile.className==="broadcast")return failure("ssh","connect to host "+pair[1]+" port 22: Network is unreachable",255);
    if(!profile.up)return failure("ssh","connect to host "+pair[1]+" port 22: No route to host",255);
    if(port.state!=="open")return failure("ssh","connect to host "+pair[1]+" port 22: "+(port.state==="filtered"?"Connection timed out":"Connection refused"),255);
    this.machine.net.touch(profile.address);
    var banner=port.banner||"SSH-2.0-OpenSSH_9.8";
    return result(banner+"\n"+pair[0]+"@"+pair[1]+": Permission denied (publickey,password).\n",255);
  };
  BusyBox.prototype.cmdIp=function(args){if(args.length===1&&(args[0]==="a"||args[0]==="addr"))return result(this.machine.net.ipAddress());if(args.length===1&&(args[0]==="r"||args[0]==="route"))return result(this.machine.net.routes());if(args.length===1&&(args[0]==="n"||args[0]==="neigh"||args[0]==="neighbor"))return result(this.machine.net.neighborText("ip"));return failure("ip","usage: ip addr|route|neigh");};
  BusyBox.prototype.cmdIfconfig=function(args){return args.length?failure("ifconfig","unsupported option"):result(this.machine.net.ifconfig());};
  BusyBox.prototype.cmdRoute=function(args){return !args.length||(args.length===1&&args[0]==="-n")?result(this.machine.net.routeTable()):failure("route","usage: route -n");};
  BusyBox.prototype.cmdArp=function(args){return !args.length||(args.length===1&&args[0]==="-a")?result(this.machine.net.neighborText("arp")):failure("arp","usage: arp -a");};
  BusyBox.prototype.cmdSs=function(args){return !args.length||args.indexOf("-tuln")!==-1||args.indexOf("-lntup")!==-1?result(this.machine.net.sockets(false)):failure("ss","usage: ss -tuln");};
  BusyBox.prototype.cmdNetstat=function(args){return !args.length||args.some(function(arg){return /^-[a-z]*[tuln][a-z]*$/i.test(arg);})?result(this.machine.net.sockets(true)):failure("netstat","usage: netstat -tuln");};

  BusyBox.prototype.cmdNmap=async function(args){
    var serviceScan=false;var aggressive=false;var pingless=false;var discovery=false;var fast=false;var openOnly=false;var portSpec="";var target="";
    for(var at=0;at<args.length;at+=1){
      var arg=args[at];
      if(arg==="-sV"||arg==="-sT")serviceScan=serviceScan||arg==="-sV";
      else if(arg==="-Pn")pingless=true;
      else if(arg==="-sn")discovery=true;
      else if(arg==="-F")fast=true;
      else if(arg==="-A"){aggressive=true;serviceScan=true;}
      else if(arg==="--open")openOnly=true;
      else if(arg==="-p"){portSpec=args[++at]||"";}
      else if(arg.indexOf("-p")===0&&arg.length>2)portSpec=arg.slice(2);
      else if(arg.charAt(0)==="-")return failure("nmap","unrecognized option "+arg+"\nSee the output of nmap -h for a summary of options.");
      else if(!target)target=arg;else return failure("nmap","only one target may be scanned");
    }
    if(!target)return failure("nmap","usage: nmap [-sn] [-sV] [-sT] [-Pn] [-p PORTS] [-F] [-A] [--open] target");
    var started="Starting Nmap 7.95 ( https://nmap.org ) at "+new Date().toISOString().replace("T"," ").slice(0,19)+" UTC";
    if(target.indexOf("/")!==-1){
      if(!discovery||target!=="10.8.0.0/24")return failure("nmap","Network is unreachable");
      await new Promise(function(resolve){root.setTimeout(resolve,210);});
      var sweep=[started];
      this.machine.net.liveProfiles().forEach(function(profile){
        sweep.push("Nmap scan report for "+profile.name+" ("+profile.address+")");
        sweep.push("Host is up ("+(profile.rtt/1000).toFixed(5)+"s latency).");
        this.machine.net.touch(profile.address);
      },this);
      sweep.push("Nmap done: 256 IP addresses (4 hosts up) scanned in 0.21 seconds");
      return result(sweep.join("\n")+"\n");
    }
    var profile=this.machine.net.profile(target);
    if(!profile.address)return failure("nmap","Failed to resolve \""+target+"\".");
    if(profile.className==="unreachable"||profile.className==="broadcast")return failure("nmap","Network is unreachable");
    await new Promise(function(resolve){root.setTimeout(resolve,40+profile.seed%81);});
    var reportName=profile.name&&profile.name!==profile.address?profile.name+" ("+profile.address+")":profile.address;
    var lines=[started,"Nmap scan report for "+reportName];
    if(!profile.up){lines.push("Host seems down.","Nmap done: 1 IP address (0 hosts up) scanned in 0.08 seconds");return result(lines.join("\n")+"\n",1);}
    this.machine.net.touch(profile.address);
    lines.push("Host is up ("+(profile.rtt/1000).toFixed(5)+"s latency).");
    if(discovery){lines.push("Nmap done: 1 IP address (1 host up) scanned in 0.06 seconds");return result(lines.join("\n")+"\n");}
    var ports=[];
    if(portSpec){
      var valid=true;
      portSpec.split(",").forEach(function(part){
        if(/^\d+$/.test(part))ports.push(Number(part));
        else if(/^\d+-\d+$/.test(part)){var limits=part.split("-").map(Number);if(limits[1]-limits[0]>1024){valid=false;return;}for(var port=limits[0];port<=limits[1];port+=1)ports.push(port);}
        else valid=false;
      });
      if(!valid||ports.some(function(port){return port<1||port>65535;}))return failure("nmap","Ports to be scanned must be between 1 and 65535");
    }else if(fast)ports=[21,22,23,25,53,80,110,139,143,443,445,3389,5900,8080];
    else ports=profile.ports.map(function(row){return row.port;});
    ports=Array.from(new Set(ports)).sort(function(left,right){return left-right;});
    var rows=ports.map(function(port){return this.machine.net.port(target,port);},this).filter(function(row){return !openOnly||row.state==="open";});
    if(rows.length){
      lines.push("PORT      STATE    SERVICE        "+(serviceScan?"VERSION":""));
      rows.forEach(function(row){lines.push((row.port+"/tcp").padEnd(10," ")+row.state.padEnd(9," ")+String(row.service||"unknown").padEnd(15," ")+(serviceScan?row.version||"":""));});
    }else lines.push("All scanned ports are closed or filtered");
    if(aggressive){lines.push("Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel","OS details: Linux 5.15 - 6.12","TRACEROUTE (using port 80/tcp)","HOP RTT      ADDRESS", "1   "+profile.rtt.toFixed(2)+" ms  "+profile.name+" ("+profile.address+")");}
    lines.push("Nmap done: 1 IP address (1 host up) scanned in "+(0.04+(profile.seed%81)/1000).toFixed(2)+" seconds");
    return result(lines.join("\n")+"\n");
  };

  BusyBox.prototype.cmdTrace=async function(name,args){
    var target=args.filter(function(arg){return arg.charAt(0)!=="-";}).pop()||"";
    if(!target)return failure(name,"usage: "+name+" HOST");
    var profile=this.machine.net.profile(target);if(!profile.address)return failure(name,"unknown host "+target);
    var hops=this.machine.net.trace(target);var lines=name==="traceroute"?["traceroute to "+target+" ("+profile.address+"), 30 hops max, 60 byte packets"]:[" 1?: [LOCALHOST]                      pmtu 1500"];
    for(var index=0;index<hops.length;index+=1){
      var hop=hops[index];
      if(hop.unreachable){lines.push(String(index+1).padStart(2," ")+"  * * *","!N  network unreachable");continue;}
      var time=hop.rtt.toFixed(1);
      lines.push(String(index+1).padStart(2," ")+"  "+hop.name+" ("+hop.address+")  "+time+" ms  "+time+" ms  "+time+" ms");
    }
    return result(lines.join("\n")+"\n",profile.up?0:1);
  };

  BusyBox.prototype.cmdDns=async function(name,args){
    var server="10.8.0.1";var short=false;var target="";
    args.forEach(function(arg){if(arg.charAt(0)==="@")server=arg.slice(1);else if(arg==="+short")short=true;else if(["-","+"].indexOf(arg.charAt(0))===-1)target=arg;});
    if(!target)return failure(name,"usage: "+name+" NAME");
    if(this.machine.net.resolve(server)!=="10.8.0.1")return failure(name,"communications error to "+server+": Network is unreachable");
    var clean=target.toLowerCase().replace(/\.$/,"");
    var address=this.machine.net.hosts[clean]||"";
    var delay=10+this.machine.net.seed(target)%21;
    await new Promise(function(resolve){root.setTimeout(resolve,delay);});
    if(short)return result(address?address+"\n":"",address?0:1);
    if(name==="host")return address?result(target+" has address "+address+"\n"):result("Host "+target+" not found: 3(NXDOMAIN)\n",1);
    if(name==="nslookup")return address?result("Server:\t\t10.8.0.1\nAddress:\t10.8.0.1#53\n\nNon-authoritative answer:\nName:\t"+target+"\nAddress: "+address+"\n"):result("** server can't find "+target+": NXDOMAIN\n",1);
    var status=address?"NOERROR":"NXDOMAIN";var serial=this.machine.net.sha1(target).slice(0,8);
    var out="; <<>> DiG 9.20.4 <<>> "+target+"\n;; ->>HEADER<<- opcode: QUERY, status: "+status+", id: "+(parseInt(serial,16)%65535)+"\n;; flags: qr aa; QUERY: 1, ANSWER: "+(address?1:0)+", AUTHORITY: 0, ADDITIONAL: 0\n\n;; QUESTION SECTION:\n;"+target+".\t\tIN\tA\n\n";
    if(address)out+=";; ANSWER SECTION:\n"+target+".\t300\tIN\tA\t"+address+"\n\n";
    out+=";; SERVER: 10.8.0.1#53(10.8.0.1)\n;; Query time: "+delay+" msec\n";
    return result(out,address?0:1);
  };

  BusyBox.prototype.cmdWhois=function(args){
    if(args.length!==1)return failure("whois","usage: whois DOMAIN");
    var target=args[0].toLowerCase();var address=this.machine.net.resolve(target);if(!address)return failure("whois","No match for "+target.toUpperCase());
    var digest=this.machine.net.sha1(target);var year=2020+parseInt(digest.slice(0,2),16)%6;
    return result("Domain Name: "+target.toUpperCase()+"\nRegistry Domain ID: "+digest.slice(0,16).toUpperCase()+"-SIM\nRegistrar WHOIS Server: whois.sim\nCreation Date: "+year+"-01-12T00:00:00Z\nRegistry Expiry Date: "+(year+8)+"-01-12T00:00:00Z\nName Server: NS1.SIM\nName Server: NS2.SIM\nDNSSEC: unsigned\n");
  };

  BusyBox.prototype.cmdSystemctl=function(args){
    if(!args.length||args[0]==="list-units")return result("UNIT                       LOAD   ACTIVE SUB     DESCRIPTION\n"+this.machine.units.map(function(unit){return unit.name.padEnd(27," ")+unit.load.padEnd(7," ")+unit.active.padEnd(7," ")+unit.sub.padEnd(8," ")+unit.description;}).join("\n")+"\n");
    var unit=this.machine.units.find(function(row){return row.name===args[1]||row.name===args[1]+".service";});
    if(args[0]==="status"&&unit)return result("● "+unit.name+" - "+unit.description+"\n   Loaded: "+unit.load+"\n   Active: "+unit.active+" ("+unit.sub+")\n Main PID: "+unit.pid+"\n");
    if(["start","stop","restart"].indexOf(args[0])!==-1){
      if(!unit)return failure("systemctl","unit not found");
      if(!this.machine.isRoot()||unit.controllable!==true)return failure("systemctl","Failed: operation not permitted");
      unit.active=args[0]==="stop"?"inactive":"active";
      unit.sub=args[0]==="stop"?"dead":"running";
      return result(unit.name+" "+unit.active+"\n");
    }
    return failure("systemctl","unit not found");
  };
  BusyBox.prototype.cmdJournalctl=function(args){try{var lines=this.machine.readFile("/var/log/syslog").trim().split("\n").slice(-20);return result(lines.join("\n")+"\n");}catch(error){return failure("journalctl",error);}};
  BusyBox.prototype.cmdService=function(args){if(args.length<2)return failure("service","usage: service UNIT status|start|stop|restart");return this.cmdSystemctl([args[1],args[0]]);};
  BusyBox.prototype.cmdDpkg=function(args){if(args.length!==1||args[0]!=="-l")return failure("dpkg","usage: dpkg -l");return result("Desired=Unknown/Install/Remove/Purge/Hold\n||/ Name                 Version          Architecture Description\n"+this.machine.packages.map(function(row){return "ii  "+row.name.padEnd(20," ")+row.version.padEnd(17," ")+row.arch.padEnd(13," ")+row.description;}).join("\n")+"\n");};
  BusyBox.prototype.cmdApt=function(args){
    if(args.length===1&&args[0]==="update")return result("Hit: https://http.kali.org/kali kali-rolling InRelease\nAll packages are up to date.\n");
    if(args[0]==="install")return this.machine.isRoot()?failure("apt","Read-only file system"):failure("apt","Permission denied: need root");
    return failure("apt","usage: apt update|install PACKAGE");
  };
  BusyBox.prototype.cmdSudo=async function(args,shell){
    if(this.machine.isRoot()){
      if(!args.length)return failure("sudo","a command is required");
      return shell.run(args.join(" "),{capture:true,depth:1});
    }
    if(this.machine.identity.user==="admin"&&args.length&&["cat","ls","find","grep"].indexOf(args[0])!==-1&&args.slice(1).some(function(value){return value.indexOf("/opt/highlion/challenges")===0;}))return shell.run(args.join(" "),{capture:true,depth:1});
    try{this.fs.writeFile("/var/log/auth.log",new Date().toISOString()+" highlion sudo: "+this.machine.identity.user+" : user NOT in sudoers\n","/",true,true);}catch(error){}
    return failure("sudo",this.machine.identity.user+" is not in the sudoers file.  This incident will be reported.");
  };
  BusyBox.prototype.cmdSu=function(args){
    var target=args.filter(function(arg){return arg!=="-";})[0]||"root";
    if(target!=="root"&&target!=="admin"&&target!==this.machine.visitorName)return failure("su","user "+target+" does not exist");
    if(target===this.machine.visitorName){this.machine.dropToKali();return result();}
    if(target===this.machine.identity.user)return result();
    return result("",0,"",{authenticate:target});
  };
  BusyBox.prototype.cmdLogout=function(args){
    if(args.length)return failure("logout","extra operand");
    this.machine.dropToKali();
    return result("logout\n");
  };

  BusyBox.prototype.cmdIptables=function(args){
    if(!this.machine.isRoot())return failure("iptables","Permission denied (you must be root)",4);
    if(args.length===1&&args[0]==="-F"){this.machine.net.flushFirewall();return result();}
    var action=args[0];var chain=args[1];var target="";var port="";var jump="";
    for(var index=2;index<args.length;index+=1){if(args[index]==="-d")target=args[++index]||"";else if(args[index]==="--dport")port=args[++index]||"";else if(args[index]==="-j")jump=(args[++index]||"").toUpperCase();}
    if(["-A","-D"].indexOf(action)===-1||["INPUT","FORWARD","OUTPUT"].indexOf(chain)===-1||!target||!/^\d+$/.test(port)||jump!=="DROP")return failure("iptables","supported: iptables -A|-D INPUT|FORWARD|OUTPUT -d HOST --dport PORT -j DROP, or iptables -F");
    if(!this.machine.net.setFirewall(target,Number(port),action==="-A"))return failure("iptables","invalid destination");
    return result();
  };
  BusyBox.prototype.cmdHostnamectl=function(){return result(" Static hostname: highlion\n       Icon name: computer-vm\n         Chassis: vm\nOperating System: Kali GNU/Linux Rolling\n          Kernel: Linux 6.12.0-hl8\n    Architecture: x86-64\n");};
  BusyBox.prototype.cmdLsbRelease=function(args){return args.length===1&&args[0]==="-a"?result("Distributor ID:\tKali\nDescription:\tKali GNU/Linux Rolling\nRelease:\t2026.3\nCodename:\tkali-rolling\n"):failure("lsb_release","usage: lsb_release -a");};
  BusyBox.prototype.cmdTimedatectl=function(args){if(args.length)return failure("timedatectl","extra operand");var now=new Date();return result("               Local time: "+now.toString()+"\n           Universal time: "+now.toUTCString()+"\n                 RTC time: "+now.toISOString().replace("T"," ").slice(0,19)+"\n                Time zone: Etc/UTC (UTC, +0000)\nSystem clock synchronized: yes\n              NTP service: active\n          RTC in local TZ: no\n");};
  BusyBox.prototype.cmdLsblk=function(args){if(args.length)return failure("lsblk","unsupported option");return result("NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\nvda    252:0    0   25G  0 disk\n├─vda1 252:1    0  512M  0 part /boot\n└─vda2 252:2    0 24.5G  0 part /\n");};
  BusyBox.prototype.cmdTop=function(args){if(args.length&&args.join(" ")!=="-bn1"&&args.join(" ")!=="-b -n 1")return failure("top","only batch snapshot mode is available");var up=Math.max(1,Math.floor(this.machine.proc.uptimeSeconds()/60));return result("top - "+new Date().toTimeString().slice(0,8)+" up "+up+" min,  1 user,  load average: 0.04, 0.02, 0.01\nTasks:   7 total,   1 running,   6 sleeping,   0 stopped,   0 zombie\n%Cpu(s):  1.0 us,  0.5 sy,  0.0 ni, 98.5 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st\nMiB Mem :   2000.0 total,    964.0 free,    512.0 used,    524.0 buff/cache\nMiB Swap:    512.0 total,    512.0 free,      0.0 used.   1400.0 avail Mem\n\n    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n      1 root      20   0   22840  12800   9216 S   0.0   0.6   0:01.42 systemd\n   1337 "+this.machine.identity.user.padEnd(8," ")+"  20   0   11240   6912   3712 R   0.3   0.3   0:00.04 zsh\n");};
  BusyBox.prototype.cmdAlias=function(args){if(args.length)return failure("alias","setting aliases interactively is not supported; edit ~/.zshrc");return result(Object.keys(this.machine.aliases).sort().map(function(name){return "alias "+name+"='"+this.machine.aliases[name]+"'";},this).join("\n")+"\n");};
  BusyBox.prototype.cmdBash=async function(args,shell){
    if(args.length===1&&args[0]==="--version")return result("GNU bash, version 5.3.0(1)-release (x86_64-pc-linux-gnu)\n");
    if(args[0]==="-c"&&args.length===2)return shell.run(args[1],{capture:true,script:true,depth:1});
    if(args.length===1){var started=root.performance&&root.performance.now?root.performance.now():Date.now();return shell.runScript(args[0],[],{capture:true,script:true,depth:1,budget:{steps:0,started:started}});}
    return failure("bash","usage: bash FILE | bash -c COMMAND");
  };
  BusyBox.prototype.cmdRuntime=function(name,args){var versions={python3:"Python 3.13.5",perl:"This is perl 5, version 40, subversion 2",ruby:"ruby 3.3.8 (2026-04-09 revision hl8) [x86_64-linux]"};if(args.length&&["--version","-v","-V"].indexOf(args[0])===-1)return failure(name,"evaluation is disabled in this sealed browser TTY");return result(versions[name]+"\n"+(args.length?"":name+": can't open an interactive TTY\n"));};
  BusyBox.prototype.cmdPasswd=function(args){if(args.length>1)return failure("passwd","usage: passwd [USER]");return failure("passwd","Authentication token manipulation error");};
  BusyBox.prototype.cmdEditor=function(name,args){
    if(args.length>1)return failure(name,"usage: "+name+" [FILE]");
    var label=args[0]||"[No Name]";var path="";var text="";
    try{
      if(args[0]){
        path=this.fs.resolve(args[0],this.machine.cwd,true);
        var node=this.fs.stat(path,"/");
        if(node&&node.type==="dir")throw new Error("is a directory");
        if(node)text=this.machine.readFile(path);
      }
      return result("",0,"",{editor:{command:name,label:label,path:path,text:text}});
    }catch(error){return failure(name,error);}
  };
  BusyBox.prototype.cmdMissingTool=function(name){return result("",127,name+": not installed in this sealed TTY\n");};
  BusyBox.prototype.cmdJobs=function(args,shell){if(args.length)return failure("jobs","extra operand");return result(shell.jobsText());};
  BusyBox.prototype.cmdFg=async function(args,shell){if(args.length>1)return failure("fg","usage: fg [%1]");return shell.foregroundJob();};
  BusyBox.prototype.cmdBg=function(args,shell){if(args.length>1)return failure("bg","usage: bg [%1]");return shell.backgroundJobStatus();};

  BusyBox.prototype.cmdCowsay=function(args){var message=args.join(" ")||"moo";var bar="-".repeat(message.length+2);return result(" "+"_".repeat(message.length+2)+"\n< "+message+" >\n "+bar+"\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n");};
  BusyBox.prototype.cmdFiglet=function(args){return result(figletText(args.join(" ")||"HighLion")+"HLv8 / "+this.machine.identity.user+"@"+this.machine.identity.host+"\n");};
  BusyBox.prototype.cmdBanner=function(args){return this.cmdFiglet(args);};
  BusyBox.prototype.cmdNeofetch=function(){
    var seconds=this.machine.proc.uptimeSeconds();var uptime=Math.floor(seconds/3600)+"h "+Math.floor((seconds%3600)/60)+"m";
    var info=[this.machine.identity.user+"@highlion","----------------", "OS: Kali GNU/Linux Rolling 2026.3","Host: HighLion","Kernel: Linux 6.12.0-hl8 x86_64","Uptime: "+uptime,"Packages: "+this.machine.packages.length+" (dpkg)","Shell: "+this.machine.env.SHELL];
    if(root.innerWidth&&root.innerHeight)info.push("Resolution: "+root.innerWidth+"x"+root.innerHeight);
    info=info.concat(["DE/WM: QTerminal / HighLion","CPU: HighLion Virtual CPU (4) @ 2.40GHz","Memory: 512 MiB / 2000 MiB","IP: 10.8.0.10"]);
    var art=["        ,.....,","     .:||||||||:.","    /||||||||||||\\","   /|||  /\\  |||\\","  | ||  /  \\  || |","  |  \\_/ /\\ \\_/ |","   \\   _/  \\_   /","    `-._ KALI _.-'","        `-----'","           /\\","          /  \\ ","         /_/\\_\\"];
    var lines=[];var count=Math.max(art.length,info.length);for(var index=0;index<count;index+=1)lines.push((art[index]||"").padEnd(22," ")+(info[index]||""));
    return result(lines.join("\n")+"\n");
  };
  BusyBox.prototype.cmdFortune=function(){var rows=this.machine.config.fortunes||["Verify the clock."];return result(rows[Math.floor(Math.random()*rows.length)]+"\n");};
  BusyBox.prototype.cmdSl=function(){return result("      ====        ________\n  _D _|  |_______/        \\__\n |(_)---  |   H\\________/ |\n /     |  |   H  |  |     |\n|      |  |   H  |__-----------------|\n");};
  BusyBox.prototype.cmdCmatrix=function(args){var state=!args.length||args[0]==="on"?"on":(["-q","off"].indexOf(args[0])!==-1?"off":"");if(!state)return failure("cmatrix","usage: cmatrix [-q]");return result("",0,"","matrix-"+state);};

  BusyBox.prototype.cmdHistory=function(){return result(this.machine.history.map(function(line,index){return String(index+1).padStart(5," ")+"  "+line;}).join("\n")+(this.machine.history.length?"\n":""));};
  BusyBox.prototype.cmdScore=function(){return result(this.machine.ctf.score());};
  BusyBox.prototype.cmdTrophies=function(){return result(this.machine.ctf.trophies());};
  BusyBox.prototype.cmdClaim=function(args){return args.length===1?this.machine.ctf.claim(args[0]):failure("claim","usage: claim FLAG");};
  BusyBox.prototype.cmdHint=function(args){return args.length?failure("hint","usage: hint"):result(this.machine.ctf.hint());};
  BusyBox.prototype.cmdMotd=function(){try{return result(this.machine.readFile("/etc/motd"));}catch(error){return failure("motd",error);}};
  BusyBox.prototype.cmdOpen=function(args){if(args.length!==1||!this.machine.config.sitePages[args[0]])return failure("open","usage: open home|about|projects|writeups|contact");return result("opening "+args[0]+"\n",0,"",{navigate:this.machine.config.sitePages[args[0]]});};
  BusyBox.prototype.cmdPublished=function(name,args){if(args.length)return failure(name,"extra operand");try{return result(this.machine.readFile("/home/kali/highlion/"+name+".md"));}catch(error){return failure(name,error);}};

  BusyBox.prototype.run = async function (name, args, stdin, shell) {
    args = args.slice();
    if(name==="pwd")return this.cmdPwd(args); if(name==="cd")return this.cmdCd(args); if(name==="ls")return this.cmdLs(args);
    if(name==="cat")return this.cmdCat(args,stdin); if(name==="head"||name==="tail")return this.cmdHeadTail(name,args,stdin); if(name==="wc")return this.cmdWc(args,stdin); if(name==="tee")return this.cmdTee(args,stdin);
    if(name==="echo")return this.cmdEcho(args); if(name==="printf")return this.cmdPrintf(args); if(name==="true")return result(); if(name==="false")return result("",1); if(name==="test"||name==="[")return this.cmdTest(args,name==="[");
    if(name==="mkdir")return this.cmdMkdir(args); if(name==="rmdir")return this.cmdRmdir(args); if(name==="touch")return this.cmdTouch(args); if(name==="cp"||name==="mv")return this.cmdCpMv(name,args); if(name==="rm")return this.cmdRm(args); if(name==="ln")return this.cmdLn(args); if(name==="chmod")return this.cmdChmod(args); if(name==="chown")return this.cmdChown(args); if(name==="stat")return this.cmdStat(args); if(name==="file")return this.cmdFile(args);
    if(name==="tree")return this.cmdTree(args); if(name==="find")return this.cmdFind(args); if(name==="grep")return this.cmdGrep(args,stdin); if(name==="sed")return this.cmdSed(args,stdin); if(name==="awk")return this.cmdAwk(args,stdin); if(name==="sort")return this.cmdSort(args,stdin); if(name==="uniq")return this.cmdUniq(args,stdin); if(name==="cut")return this.cmdCut(args,stdin); if(name==="tr")return this.cmdTr(args,stdin); if(name==="diff")return this.cmdDiff(args);
    if(name==="sha256sum"||name==="md5sum")return this.cmdHash(name,args,stdin); if(name==="base64")return this.cmdBase64(args,stdin); if(name==="xxd"||name==="od"||name==="hexdump")return this.cmdHex(name,args,stdin); if(name==="less"||name==="more")return this.cmdPager(name,args,stdin);
    if(name==="tar")return this.cmdTar(args); if(name==="gzip"||name==="gunzip"||name==="zcat")return this.cmdGzip(name,args); if(name==="git")return this.cmdGit(args);
    if(name==="man")return this.cmdMan(args); if(name==="help")return this.cmdHelp(args); if(name==="which"||name==="type")return this.cmdWhichType(name,args,shell); if(name==="command"){if(!args.length)return result();if(args[0]==="-v")return this.cmdWhichType("which",args.slice(1),shell);return shell.run(args.join(" "),{capture:true,depth:1});}
    if(name==="env")return this.cmdEnv(args); if(name==="export")return this.cmdExport(args); if(name==="unset")return this.cmdUnset(args); if(name==="set")return this.cmdSet(args); if(name==="source")return this.cmdSource(args);
    if(name==="date")return this.cmdDate(args); if(name==="cal")return this.cmdCal(args); if(name==="yes")return this.cmdYes(args); if(name==="seq")return this.cmdSeq(args); if(name==="sleep")return this.cmdSleep(args); if(name==="timeout")return this.cmdTimeout(args,shell); if(name==="uname")return this.cmdUname(args); if(["hostname","whoami","id","groups"].indexOf(name)!==-1)return this.cmdIdentity(name,args); if(name==="umask")return this.cmdUmask(args);
    if(name==="ps")return this.cmdPs(args); if(name==="pidof")return this.cmdPidof(args); if(name==="kill")return this.cmdKill(args); if(name==="pkill")return this.cmdPkill(args); if(name==="dmesg")return this.cmdDmesg(args); if(name==="lscpu")return this.cmdLscpu(args); if(name==="df")return this.cmdDf(args); if(name==="du")return this.cmdDu(args); if(name==="free")return this.cmdFree(args); if(name==="uptime")return this.cmdUptime(args); if(name==="mount")return this.cmdMount(args); if(name==="lsmod")return this.cmdLsmod(args); if(name==="getent")return this.cmdGetent(args); if(name==="last")return this.cmdLast(args); if(name==="who"||name==="w")return this.cmdWho(name,args); if(name==="sessionctl")return this.cmdSessionctl(args);
    if(name==="ip")return this.cmdIp(args); if(name==="ifconfig")return this.cmdIfconfig(args); if(name==="route")return this.cmdRoute(args); if(name==="arp")return this.cmdArp(args); if(name==="ss")return this.cmdSs(args); if(name==="netstat")return this.cmdNetstat(args); if(name==="ping")return this.cmdPing(args); if(name==="curl"||name==="wget")return this.cmdCurl(name,args); if(name==="nc"||name==="netcat")return this.cmdNc(args); if(name==="ssh")return this.cmdSsh(args);
    if(name==="nmap")return this.cmdNmap(args); if(name==="traceroute"||name==="tracepath")return this.cmdTrace(name,args); if(name==="dig"||name==="host"||name==="nslookup")return this.cmdDns(name,args); if(name==="whois")return this.cmdWhois(args);
    if(name==="systemctl")return this.cmdSystemctl(args); if(name==="journalctl")return this.cmdJournalctl(args); if(name==="service")return this.cmdService(args); if(name==="dpkg")return this.cmdDpkg(args); if(name==="apt")return this.cmdApt(args); if(name==="sudo")return this.cmdSudo(args,shell); if(name==="su")return this.cmdSu(args); if(name==="exit"||name==="logout")return this.cmdLogout(args); if(name==="passwd")return this.cmdPasswd(args); if(name==="nano"||name==="vim"||name==="vi")return this.cmdEditor(name,args); if(name==="iptables")return this.cmdIptables(args); if(name==="hostnamectl")return this.cmdHostnamectl(args); if(name==="lsb_release")return this.cmdLsbRelease(args); if(name==="timedatectl")return this.cmdTimedatectl(args); if(name==="lsblk")return this.cmdLsblk(args); if(name==="top")return this.cmdTop(args); if(name==="alias")return this.cmdAlias(args); if(name==="bash")return this.cmdBash(args,shell); if(name==="python3"||name==="perl"||name==="ruby")return this.cmdRuntime(name,args);
    if(["msfconsole","msfvenom","searchsploit","hydra","john","hashcat","sqlmap","aircrack-ng","burpsuite","wireshark","responder","crackmapexec"].indexOf(name)!==-1)return this.cmdMissingTool(name);
    if(name==="cowsay")return this.cmdCowsay(args); if(name==="fortune")return this.cmdFortune(args); if(name==="sl")return this.cmdSl(args); if(name==="figlet")return this.cmdFiglet(args); if(name==="banner")return this.cmdBanner(args); if(name==="neofetch")return this.cmdNeofetch(args); if(name==="cmatrix")return this.cmdCmatrix(args);
    if(name==="history")return this.cmdHistory(args); if(name==="jobs")return this.cmdJobs(args,shell); if(name==="fg")return this.cmdFg(args,shell); if(name==="bg")return this.cmdBg(args,shell); if(name==="clear")return result("",0,"","clear"); if(name==="reset")return result("",0,"","reset"); if(name==="reset-machine"){this.machine.reset();return result("",0,"","reset");}
    if(name==="score")return this.cmdScore(args); if(name==="trophies")return this.cmdTrophies(args); if(name==="claim")return this.cmdClaim(args); if(name==="hint")return this.cmdHint(args); if(name==="motd")return this.cmdMotd(args); if(name==="open")return this.cmdOpen(args); if(name==="writeups"||name==="projects")return this.cmdPublished(name,args);
    return result("",127,"zsh: command not found: "+name+"\n");
  };

  HL.BusyBox = BusyBox;
})(window);
