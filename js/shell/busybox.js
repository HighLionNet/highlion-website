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
    if (paths.length > 1) return failure("ls", "multiple paths are not supported");
    try {
      var target = paths[0] || ".";
      var absolute = this.fs.resolve(target, this.machine.cwd, true);
      var node = this.fs.stat(absolute, "/");
      if (!node) throw new Error("no such file or directory");
      var rows = this.fs.list(absolute, "/", all);
      if (node.type === "dir" && all) rows = [{ name: ".", path: absolute, node: node }, { name: "..", path: HL.path.dirname(absolute), node: this.fs.stat(HL.path.dirname(absolute), "/") }].concat(rows);
      if (!long) return result(rows.map(function (row) { return row.name; }).join("  ") + "\n");
      var output = rows.map(function (row) {
        var stamp = new Date(row.node.mtime || Date.now());
        var month = stamp.toLocaleString("en", { month: "short" });
        var day = String(stamp.getDate()).padStart(2, " ");
        var time = stamp.toTimeString().slice(0, 5);
        var name = row.name + (row.node.type === "symlink" ? " -> " + row.node.target : "");
        return this.fs.modeString(row.node) + " 1 " + String(row.node.owner).padEnd(8, " ") + " " + String(row.node.group).padEnd(8, " ") + " " + String(this.fs.size(row.node)).padStart(6, " ") + " " + month + " " + day + " " + time + " " + name;
      }, this).join("\n");
      return result(output + (output ? "\n" : ""));
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
    var newline = args[0] !== "-n";
    if (!newline) args.shift();
    return result(args.join(" ") + (newline ? "\n" : ""));
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
      else if (args.length === 2 && ["-e", "-f", "-d"].indexOf(args[0]) !== -1) {
        var node = this.fs.stat(args[1], this.machine.cwd);
        ok = Boolean(node && (args[0] === "-e" || (args[0] === "-f" && node.type === "file") || (args[0] === "-d" && node.type === "dir")));
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
    try { args.forEach(function (path) { this.fs.remove(path, this.machine.cwd, recursive); }, this); this.machine.persist(); return result(); }
    catch (error) { return failure("rm", error); }
  };

  BusyBox.prototype.cmdLn = function (args) {
    if (args[0] !== "-s" || args.length !== 3) return failure("ln", "only symbolic links are supported");
    try { this.fs.symlink(args[1], args[2], this.machine.cwd, false); this.machine.persist(); return result(); }
    catch (error) { return failure("ln", error); }
  };

  BusyBox.prototype.cmdChmod = function (args) {
    if (args.length !== 2 || !/^[0-7]{3,4}$/.test(args[0])) return failure("chmod", "usage: chmod MODE FILE");
    try { this.fs.chmod(args[1], args[0], this.machine.cwd); this.machine.persist(); return result(); } catch (error) { return failure("chmod", error); }
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
    if (args.length > 1) return failure("tree", "too many arguments");
    try {
      var rootPath = this.fs.resolve(args[0] || ".", this.machine.cwd, true);
      var rows = this.fs.walk(rootPath, "/");
      var lines = [rootPath];
      rows.slice(1).forEach(function (row) {
        var relative = row.path.slice(rootPath === "/" ? 1 : rootPath.length + 1);
        var depth = relative.split("/").length;
        lines.push("│   ".repeat(Math.max(0, depth - 1)) + "├── " + HL.path.basename(row.path));
      });
      return result(lines.join("\n") + "\n");
    } catch (error) { return failure("tree", error); }
  };

  BusyBox.prototype.cmdFind = function (args) {
    var start = "."; var pattern = null;
    if (args[0] && args[0] !== "-name") start = args.shift();
    if (args[0] === "-name" && args[1]) pattern = wildcard(HL.path.basename(args[1]));
    else if (args.length) return failure("find", "usage: find [path] [-name GLOB]");
    try {
      var rows = this.fs.walk(start, this.machine.cwd).filter(function (row) { return !pattern || pattern.test(HL.path.basename(row.path)); });
      return result(rows.map(function (row) { return row.path; }).join("\n") + "\n");
    } catch (error) { return failure("find", error); }
  };

  BusyBox.prototype.cmdGrep = function (args, stdin) {
    var numbered = false; var insensitive = false; var recursive = false;
    while (args[0] && /^-/.test(args[0])) {
      var flags = args.shift(); numbered = numbered || flags.indexOf("n") !== -1; insensitive = insensitive || flags.indexOf("i") !== -1; recursive = recursive || flags.indexOf("R") !== -1;
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
      var needle = insensitive ? pattern.toLowerCase() : pattern; var out = [];
      inputs.forEach(function (input) {
        input.text.split("\n").forEach(function (line, index) {
          var hay = insensitive ? line.toLowerCase() : line;
          if (hay.indexOf(needle) !== -1) out.push((inputs.length > 1 || recursive ? input.path + ":" : "") + (numbered ? (index + 1) + ":" : "") + line);
        });
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

  BusyBox.prototype.cmdHash = async function (name, args, stdin) {
    try {
      if (!args.length && stdin !== null && stdin !== undefined) return result((name === "sha256sum" ? await digest("SHA-256", stdin) : md5(stdin)) + "  -\n");
      if (!args.length) throw new Error("missing file operand");
      var lines=[]; for(var index=0;index<args.length;index+=1){var text=this.machine.readFile(args[index]);lines.push((name==="sha256sum"?await digest("SHA-256",text):md5(text))+"  "+args[index]);} return result(lines.join("\n")+"\n");
    } catch(error){return failure(name,error);}
  };

  BusyBox.prototype.cmdBase64 = function(args,stdin){try{var text=this.readInput(args,stdin,"base64").text;var binary=String.fromCharCode.apply(null,bytes(text));return result(root.btoa(binary)+"\n");}catch(error){return failure("base64",error);}};
  BusyBox.prototype.cmdHex = function(name,args,stdin){try{var data=bytes(this.readInput(args,stdin,name).text);var lines=[];for(var offset=0;offset<data.length;offset+=16){var slice=Array.from(data.slice(offset,offset+16));if(name==="od")lines.push(offset.toString(8).padStart(7,"0")+" "+slice.map(function(v){return v.toString(8).padStart(3,"0");}).join(" "));else lines.push(offset.toString(16).padStart(8,"0")+"  "+slice.map(function(v){return v.toString(16).padStart(2,"0");}).join(" ").padEnd(47," ")+"  |"+slice.map(function(v){return v>=32&&v<127?String.fromCharCode(v):".";}).join("")+"|");}return result(lines.join("\n")+"\n");}catch(error){return failure(name,error);}};
  BusyBox.prototype.cmdPager=function(name,args,stdin){try{var text=this.readInput(args,stdin,name).text;return result(text+(text.endsWith("\n")?"":"\n")+"--end--\n");}catch(error){return failure(name,error);}};

  BusyBox.prototype.cmdMan = function(args){if(args.length!==1)return failure("man","what manual page do you want?");try{return result(this.machine.readFile("/usr/share/man/man1/"+args[0]+".1"));}catch(error){return failure("man","No manual entry for "+args[0]);}};
  BusyBox.prototype.cmdHelp = function(args){
    if(args.length===1)return this.cmdMan(args);
    if(args.length)return failure("help","usage: help [command]");
    return result("GNU bash, version 5.2\nShell commands:\n  cd pwd help history clear reset exit export unset env\n  ls cat head tail grep find mkdir touch cp mv rm chmod\n  ps kill pkill who w id groups ip ss ping curl wget nc ssh\n");
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
  BusyBox.prototype.cmdGetent=function(args){if(args.length!==1||["passwd","group"].indexOf(args[0])===-1)return failure("getent","usage: getent passwd|group");try{return result(this.machine.readFile("/etc/"+args[0]));}catch(error){return failure("getent",error);}};
  BusyBox.prototype.cmdLast=function(){return result("kali     pts/0        10.8.0.20       Sat Sep 26 05:20   still logged in\nreboot   system boot  6.12.0-hl8     Sat Sep 26 05:19   still running\n");};
  BusyBox.prototype.cmdWho=function(name,args){
    if(args.length)return failure(name,"extra operand");
    var row=this.machine.identity.user+"     pts/0        "+new Date().toISOString().slice(0,16).replace("T"," ")+" (10.8.0.20)";
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

  BusyBox.prototype.cmdPing=async function(args){var host=args[0]==="-c"?args[2]:args[0];if(!host)return failure("ping","usage: ping HOST");var address=this.machine.net.resolve(host);if(!address)return result("PING "+host+" (0.0.0.0) 56(84) bytes of data.\n\n--- "+host+" ping statistics ---\n3 packets transmitted, 0 received, 100% packet loss\n",1);var lines=["PING "+host+" ("+address+") 56(84) bytes of data."];for(var index=1;index<=3;index+=1)lines.push("64 bytes from "+address+": icmp_seq="+index+" ttl=64 time="+(7+index*1.7).toFixed(1)+" ms");lines.push("--- "+host+" ping statistics ---","3 packets transmitted, 3 received, 0% packet loss");return result(lines.join("\n")+"\n");};
  BusyBox.prototype.cmdCurl=async function(name,args){
    if(args.length!==1)return failure(name,"usage: "+name+" PATH");
    function refused(){return result("",7,name+": (7) Failed to connect\n");}
    function allowed(path){
      return ["/","/index.html","/about.html","/projects.html","/writeups.html","/writeups/pihole.html","/writeups/cve-2026-2441.html","/css/style.css","/components/header.html","/components/footer.html","/404.html"].indexOf(path)!==-1
        || path.indexOf("/assets/icons/")===0 || path.indexOf("/assets/writeups/")===0;
    }
    var parsed;
    try{parsed=new URL(args[0],"https://www.highlion.net/");}catch(error){return refused();}
    if(parsed.protocol!=="https:"||["www.highlion.net","highlion.net"].indexOf(parsed.hostname.toLowerCase())===-1||!allowed(parsed.pathname))return refused();
    var controller=typeof AbortController!=="undefined"?new AbortController():null;
    var timer=controller?root.setTimeout(function(){controller.abort();},175):0;
    try{
      var response=await fetch(parsed.pathname+parsed.search,{method:"GET",credentials:"same-origin",cache:"no-store",redirect:"follow",signal:controller?controller.signal:undefined});
      var finalUrl=new URL(response.url,root.location.href);
      if(["www.highlion.net","highlion.net"].indexOf(finalUrl.hostname.toLowerCase())===-1||!allowed(finalUrl.pathname))return refused();
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
      return result(text+(text.endsWith("\n")?"":"\n"),response.ok?0:22,response.ok?"":name+": server returned "+response.status+"\n");
    }catch(error){if(timer)root.clearTimeout(timer);return refused();}
  };
  BusyBox.prototype.cmdNc=function(args){if(args.length!==2)return failure("nc","usage: nc HOST PORT");if(!this.machine.net.resolve(args[0]))return failure("nc","ncat: connection refused");var banner=this.machine.net.banner(args[0],Number(args[1]));return banner?result(banner+"\n"):failure("nc","ncat: connection refused");};
  BusyBox.prototype.cmdSsh=function(args){if(args.length!==1||args[0].indexOf("@")===-1)return failure("ssh","usage: ssh user@host");var pair=args[0].split("@");if(!this.machine.net.resolve(pair[1]))return failure("ssh","Could not resolve hostname "+pair[1]);var banner=this.machine.net.banner(pair[1],22)||"SSH-2.0-OpenSSH_9.8";return result(banner+"\nConnection to "+pair[1]+" closed.\n");};
  BusyBox.prototype.cmdIp=function(args){return args.length===1&&args[0]==="a"?result(this.machine.net.ipAddress()):failure("ip","usage: ip a");};
  BusyBox.prototype.cmdSs=function(args){return args.length===1&&args[0]==="-tuln"?result(this.machine.net.sockets()):failure("ss","usage: ss -tuln");};

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
    try{this.fs.writeFile("/var/log/auth.log",new Date().toISOString()+" highlion sudo: "+this.machine.identity.user+" : user NOT in sudoers\n","/",true,true);}catch(error){}
    return failure("sudo",this.machine.identity.user+" is not in the sudoers file. This incident will be reported.");
  };
  BusyBox.prototype.cmdSu=function(args){
    var target=args.filter(function(arg){return arg!=="-";})[0]||"root";
    if(target!=="root"&&target!=="admin"&&target!==this.machine.visitorName)return failure("su","user "+target+" does not exist");
    if(this.machine.isRoot()&&target!=="root"){this.machine.switchUser(target,{persist:false});return result();}
    if(this.machine.isRoot()&&target==="root")return result();
    if(target===this.machine.visitorName)return result();
    return result("",0,"",{type:"su-auth",target:target});
  };
  BusyBox.prototype.cmdLogout=function(args){
    if(args.length)return failure("logout","extra operand");
    return this.machine.logoutRoot()?result("logout\n"):failure("logout","not a login shell",1);
  };
  BusyBox.prototype.cmdHostnamectl=function(){return result(" Static hostname: highlion\n       Icon name: computer-vm\n         Chassis: vm\nOperating System: Kali GNU/Linux Rolling\n          Kernel: Linux 6.12.0-hl8\n    Architecture: x86-64\n");};
  BusyBox.prototype.cmdLsbRelease=function(args){return args.length===1&&args[0]==="-a"?result("Distributor ID:\tKali\nDescription:\tKali GNU/Linux Rolling\nRelease:\t2026.3\nCodename:\tkali-rolling\n"):failure("lsb_release","usage: lsb_release -a");};

  BusyBox.prototype.cmdCowsay=function(args){var message=args.join(" ")||"moo";var bar="-".repeat(message.length+2);return result(" "+"_".repeat(message.length+2)+"\n< "+message+" >\n "+bar+"\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n");};
  BusyBox.prototype.cmdFiglet=function(args){var text=(args.join(" ")||"HighLion").toUpperCase().slice(0,20);return result("== "+text+" ==\n"+text.split("").join(" ")+"\n");};
  BusyBox.prototype.cmdBanner=function(){return result("H  H I GGG H  H L    I OOO N  N\nHHHH I G G HHHH L    I O O N NN\nH  H I GGG H  H LLLL I OOO N  N\nHLv8 / "+this.machine.identity.user+"@"+this.machine.identity.host+"\n");};
  BusyBox.prototype.cmdNeofetch=function(){return result("      /\\          "+this.machine.identity.user+"@"+this.machine.identity.host+"\n     /  \\         OS: Kali GNU/Linux Rolling 2026.3\n    / /\\ \\        Host: HighLion\n   / ____ \\       Kernel: 6.12.0-hl8\n  /_/    \\_\\      Shell: "+this.machine.identity.shell+"\n     ||           Uptime: "+this.machine.proc.uptimeSeconds()+"s\n");};
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
  BusyBox.prototype.cmdPublished=function(name,args){if(args.length)return failure(name,"extra operand");try{return result(this.machine.readFile("/home/kali/"+name+".md"));}catch(error){return failure(name,error);}};

  BusyBox.prototype.run = async function (name, args, stdin, shell) {
    args = args.slice();
    if(name==="pwd")return this.cmdPwd(args); if(name==="cd")return this.cmdCd(args); if(name==="ls")return this.cmdLs(args);
    if(name==="cat")return this.cmdCat(args,stdin); if(name==="head"||name==="tail")return this.cmdHeadTail(name,args,stdin); if(name==="wc")return this.cmdWc(args,stdin); if(name==="tee")return this.cmdTee(args,stdin);
    if(name==="echo")return this.cmdEcho(args); if(name==="printf")return this.cmdPrintf(args); if(name==="true")return result(); if(name==="false")return result("",1); if(name==="test"||name==="[")return this.cmdTest(args,name==="[");
    if(name==="mkdir")return this.cmdMkdir(args); if(name==="rmdir")return this.cmdRmdir(args); if(name==="touch")return this.cmdTouch(args); if(name==="cp"||name==="mv")return this.cmdCpMv(name,args); if(name==="rm")return this.cmdRm(args); if(name==="ln")return this.cmdLn(args); if(name==="chmod")return this.cmdChmod(args); if(name==="chown")return this.cmdChown(args); if(name==="stat")return this.cmdStat(args); if(name==="file")return this.cmdFile(args);
    if(name==="tree")return this.cmdTree(args); if(name==="find")return this.cmdFind(args); if(name==="grep")return this.cmdGrep(args,stdin); if(name==="sort")return this.cmdSort(args,stdin); if(name==="uniq")return this.cmdUniq(args,stdin); if(name==="cut")return this.cmdCut(args,stdin); if(name==="tr")return this.cmdTr(args,stdin);
    if(name==="sha256sum"||name==="md5sum")return this.cmdHash(name,args,stdin); if(name==="base64")return this.cmdBase64(args,stdin); if(name==="xxd"||name==="od"||name==="hexdump")return this.cmdHex(name,args,stdin); if(name==="less"||name==="more")return this.cmdPager(name,args,stdin);
    if(name==="man")return this.cmdMan(args); if(name==="help")return this.cmdHelp(args); if(name==="which"||name==="type")return this.cmdWhichType(name,args,shell); if(name==="command"&&args[0]==="-v")return this.cmdWhichType("which",args.slice(1),shell);
    if(name==="env")return this.cmdEnv(args); if(name==="export")return this.cmdExport(args); if(name==="unset")return this.cmdUnset(args); if(name==="set")return this.cmdSet(args); if(name==="source")return this.cmdSource(args);
    if(name==="date")return this.cmdDate(args); if(name==="uname")return this.cmdUname(args); if(["hostname","whoami","id","groups"].indexOf(name)!==-1)return this.cmdIdentity(name,args); if(name==="umask")return this.cmdUmask(args);
    if(name==="ps")return this.cmdPs(args); if(name==="pidof")return this.cmdPidof(args); if(name==="kill")return this.cmdKill(args); if(name==="pkill")return this.cmdPkill(args); if(name==="df")return this.cmdDf(args); if(name==="du")return this.cmdDu(args); if(name==="free")return this.cmdFree(args); if(name==="uptime")return this.cmdUptime(args); if(name==="mount")return this.cmdMount(args); if(name==="getent")return this.cmdGetent(args); if(name==="last")return this.cmdLast(args); if(name==="who"||name==="w")return this.cmdWho(name,args); if(name==="sessionctl")return this.cmdSessionctl(args);
    if(name==="ip")return this.cmdIp(args); if(name==="ss")return this.cmdSs(args); if(name==="ping")return this.cmdPing(args); if(name==="curl"||name==="wget")return this.cmdCurl(name,args); if(name==="nc")return this.cmdNc(args); if(name==="ssh")return this.cmdSsh(args);
    if(name==="systemctl")return this.cmdSystemctl(args); if(name==="journalctl")return this.cmdJournalctl(args); if(name==="dpkg")return this.cmdDpkg(args); if(name==="apt")return this.cmdApt(args); if(name==="sudo")return this.cmdSudo(args,shell); if(name==="su")return this.cmdSu(args); if(name==="exit"||name==="logout")return this.cmdLogout(args); if(name==="hostnamectl")return this.cmdHostnamectl(args); if(name==="lsb_release")return this.cmdLsbRelease(args);
    if(name==="cowsay")return this.cmdCowsay(args); if(name==="fortune")return this.cmdFortune(args); if(name==="sl")return this.cmdSl(args); if(name==="figlet")return this.cmdFiglet(args); if(name==="banner")return this.cmdBanner(args); if(name==="neofetch")return this.cmdNeofetch(args); if(name==="cmatrix")return this.cmdCmatrix(args);
    if(name==="history")return this.cmdHistory(args); if(name==="clear")return result("",0,"","clear"); if(name==="reset")return result("",0,"","reset"); if(name==="reset-machine"){this.machine.reset();return result("",0,"","reset");}
    if(name==="score")return this.cmdScore(args); if(name==="trophies")return this.cmdTrophies(args); if(name==="claim")return this.cmdClaim(args); if(name==="hint")return this.cmdHint(args); if(name==="motd")return this.cmdMotd(args); if(name==="open")return this.cmdOpen(args); if(name==="writeups"||name==="projects")return this.cmdPublished(name,args);
    return result("",127,"zsh: command not found: "+name+"\n");
  };

  HL.BusyBox = BusyBox;
})(window);
