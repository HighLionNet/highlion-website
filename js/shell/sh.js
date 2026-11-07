(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  var literalChars = "|;&<>*?[]~ \t\n\r\"'\\$`#";
  function protect(value, split) {
    return Array.from(String(value)).map(function (char) {
      var index = literalChars.indexOf(char);
      return index < 0 || (split && /\s/.test(char)) ? char : String.fromCharCode(0xe100 + index);
    }).join("");
  }
  function literal(value) {
    return String(value).replace(/[\ue100-\ue13f]/g, function (char) { return literalChars[char.charCodeAt(0) - 0xe100] || ""; }).replace(/\ue140/g, "");
  }
  function quoteWord(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
  HL.quoteWord = quoteWord;
  HL.literalWord = literal;

  function variableToken(name, fallback, quoted) {
    var encodedFallback = fallback === undefined ? "__HL_UNSET__" : encodeURIComponent(fallback);
    return "\ue000" + encodeURIComponent((quoted ? "@" : "") + name) + "|" + encodedFallback + "\ue001";
  }

  function Shell(machine) {
    this.machine = machine;
    this.busybox = new HL.BusyBox(machine);
    this.builtins = ["claim", "score", "trophies", "hint"];
    this.machine.shell = this;
    this.maxScriptLines = 200;
    this.maxDepth = 20;
    this.maxInstructions = 50000;
    this.maxWallMs = 15000;
    this.epoch = 0;
    this.maxOutputBytes = 32768;
    this.background = null;
    this.pending = new Set();
  }

  Shell.prototype.charge = function (options, amount) {
    var budget = options && options.budget;
    if (!budget) return;
    if (budget.epoch !== undefined && budget.epoch !== this.epoch) { var interrupted = new Error("Interrupted"); interrupted.interrupted = true; throw interrupted; }
    if (budget.deadline && Date.now() >= budget.deadline) { var timeout = new Error("Timed out"); timeout.timedOut = true; throw timeout; }
    budget.steps += amount || 1;
    var now = root.performance && root.performance.now ? root.performance.now() : Date.now();
    if (budget.steps > this.maxInstructions || (!options.background && now - budget.started > this.maxWallMs)) {
      var error = new Error("Killed");
      error.killed = true;
      throw error;
    }
  };

  Shell.prototype.limitOutput = function (run) {
    var remaining = this.maxOutputBytes;
    var truncated = new TextEncoder().encode(String(run.stdout || "") + String(run.stderr || "")).length > remaining;
    function take(value) {
      var text = String(value || "");
      if (remaining <= 0) return "";
      var encoded = new TextEncoder().encode(text);
      if (encoded.length <= remaining) {
        remaining -= encoded.length;
        return text;
      }
      var low = 0; var high = Math.min(text.length, remaining);
      while (low < high) {
        var middle = Math.ceil((low + high) / 2);
        if (new TextEncoder().encode(text.slice(0, middle)).length <= remaining) low = middle;
        else high = middle - 1;
      }
      if (low && text.charCodeAt(low - 1) >= 0xd800 && text.charCodeAt(low - 1) <= 0xdbff) low -= 1;
      var clipped = text.slice(0, low);
      remaining -= new TextEncoder().encode(clipped).length;
      return clipped;
    }
    run.stdout = take(run.stdout);
    run.stderr = take(run.stderr);
    if (truncated) { run.stdout = run.stdout.slice(0, -96); run.stderr += "\n[output truncated at 32 KiB; use head, tail, or a narrower query]\n"; }
    return run;
  };

  Shell.prototype.expandVariable = function (line, index, quoted) {
    var next = line[index + 1] || "";
    if (next === "{") {
      var end = line.indexOf("}", index + 2);
      if (end < 0) return { value: "$", end: index };
      var expression = line.slice(index + 2, end);
      var match = /^([A-Za-z_][A-Za-z0-9_]*|[?0-9])(?::-(.*))?$/.exec(expression);
      if (!match) return { value: "", end: end };
      return { value: variableToken(match[1], match[2], quoted), end: end };
    }
    var matchName = /^([A-Za-z_][A-Za-z0-9_]*|[?0-9])/.exec(line.slice(index + 1));
    if (!matchName) return { value: "$", end: index };
    return { value: variableToken(matchName[1], undefined, quoted), end: index + matchName[1].length };
  };

  Shell.prototype.resolveVariables = function (token) {
    return String(token).replace(/\ue000([^|]*)\|([^\ue001]*)\ue001/g, function (_, encodedName, encodedFallback) {
      var name = decodeURIComponent(encodedName);
      var quoted = name.charAt(0) === "@";
      if (quoted) name = name.slice(1);
      var current = this.machine.env[name];
      var value = current !== undefined && current !== "" ? current : (encodedFallback === "__HL_UNSET__" ? "" : decodeURIComponent(encodedFallback));
      return quoted ? protect(value) + "\ue140" : String(value);

    }.bind(this));
  };

  Shell.prototype.tokenize = function (line) {
    var tokens = []; var current = ""; var quote = ""; var started = false;
    var push = function () { if (started) tokens.push(current); current = ""; started = false; };
    for (var index = 0; index < line.length; index += 1) {
      var char = line[index];
      if (!quote && char === "#" && !started) break;
      if (char === "\\" && quote !== "'") {
        var escaped = line[index + 1] || "";
        if (quote === '"' && ["$", '"', "\\", "`"].indexOf(escaped) === -1) current += "\\";
        index += 1; current += protect(escaped); started = true; continue;
      }
      if (char === "'" && quote !== '"') { quote = quote === "'" ? "" : "'"; current += "\ue140"; started = true; continue; }
      if (char === '"' && quote !== "'") { quote = quote === '"' ? "" : '"'; current += "\ue140"; started = true; continue; }
      if (quote !== "'" && (char === "`" || (char === "$" && line[index + 1] === "("))) {
        var substitution = this.findSubstitution(line.slice(index));
        if (!substitution || substitution.start !== 0) throw new Error("unclosed command substitution");
        current += "\ue200" + encodeURIComponent(substitution.inner) + "|" + (quote ? "q" : "s") + "\ue201";
        index += substitution.end; started = true; continue;
      }
      if (!quote && /\s/.test(char)) { push(); continue; }
      if (!quote) {
        var rest = line.slice(index);
        var operator = ["2>&1", "1>&2", "&&", "||", "2>>", ">>", "2>", "|", ";", ">", "<"].find(function (candidate) { return rest.indexOf(candidate) === 0; });
        if (operator) { push(); tokens.push(operator); index += operator.length - 1; continue; }
      }
      if (char === "$" && quote !== "'") {
        var expanded = this.expandVariable(line, index, Boolean(quote)); current += expanded.value; index = expanded.end; started = true; continue;
      }
      current += quote ? protect(char) : char; started = true;
    }
    if (quote) throw new Error("unmatched quote");
    push();
    return tokens;
  };

  Shell.prototype.findSubstitution = function (line) {
    var quote = "";
    for (var index = 0; index < line.length; index += 1) {
      var char = line[index];
      if (char === "\\") { index += 1; continue; }
      if (char === "'" && quote !== '"') { quote = quote === "'" ? "" : "'"; continue; }
      if (char === '"' && quote !== "'") { quote = quote === '"' ? "" : '"'; continue; }
      if (quote === "'") continue;
      if (char === "`") {
        var endTick = line.indexOf("`", index + 1);
        if (endTick >= 0) return { start: index, end: endTick, inner: line.slice(index + 1, endTick) };
      }
      if (char === "$" && line[index + 1] === "(") {
        var depth = 1; var innerQuote = "";
        for (var cursor = index + 2; cursor < line.length; cursor += 1) {
          var token = line[cursor];
          if (token === "\\") { cursor += 1; continue; }
          if (token === "'" && innerQuote !== '"') { innerQuote = innerQuote === "'" ? "" : "'"; continue; }
          if (token === '"' && innerQuote !== "'") { innerQuote = innerQuote === '"' ? "" : '"'; continue; }
          if (innerQuote) continue;
          if (token === "(") depth += 1;
          if (token === ")") depth -= 1;
          if (depth === 0) return { start: index, end: cursor, inner: line.slice(index + 2, cursor) };
        }
        throw new Error("unclosed command substitution");
      }
    }
    return null;
  };

  Shell.prototype.expandSubstitutions = async function (token, options) {
    var pattern = /\ue200([^|]*)\|(q|s)\ue201/g;
    var output = ""; var from = 0; var found;
    while ((found = pattern.exec(token))) {
      this.charge(options, 1);
      var run = await this.run(decodeURIComponent(found[1]), { capture: true, depth: (options.depth || 0) + 1, substitution: true, budget: options.budget, script: options.script });
      this.charge(options, 1);
      output += token.slice(from, found.index) + protect(run.stdout.replace(/\n+$/, ""), found[2] === "s");
      from = pattern.lastIndex;
    }
    return output + token.slice(from);
  };

  Shell.prototype.pause = async function (milliseconds, options) {
    var until = Date.now() + Math.max(0, milliseconds);
    do {
      this.charge(options, 1);
      await new Promise(function (resolve) { root.setTimeout(resolve, Math.min(40, Math.max(0, until - Date.now()))); });
    } while (Date.now() < until);
    this.charge(options, 1);
  };

  Shell.prototype.resolveCommand = function (name) {
    if (!name) return "";
    var fs = this.machine.fs;
    if (name.indexOf("/") !== -1) {
      var direct = fs.resolve(name, this.machine.cwd, false);
      return fs.nodes.has(direct) ? direct : "";
    }
    var paths = String(this.machine.env.PATH || "/bin:/usr/bin:/usr/sbin").split(":");
    for (var index = 0; index < paths.length; index += 1) {
      var candidate = fs.normalize(paths[index] + "/" + name, this.machine.cwd);
      if (fs.nodes.has(candidate)) return candidate;
    }
    return "";
  };

  Shell.prototype.expandAlias = function (tokens) {
    if (!tokens.length) return tokens;
    var alias = Object.prototype.hasOwnProperty.call(this.machine.aliases, tokens[0]) ? this.machine.aliases[tokens[0]] : "";
    if (!alias) return tokens;
    return this.tokenize(alias).concat(tokens.slice(1));
  };

  Shell.prototype.extractRedirects = function (tokens) {
    var command = []; var redirect = [];
    for (var index = 0; index < tokens.length; index += 1) {
      var token = tokens[index];
      if (token === "2>&1" || token === "1>&2") { redirect.push({ op: token }); continue; }
      if ([">", ">>", "2>", "2>>", "<"].indexOf(token) !== -1) {
        if (tokens[index + 1] === undefined || [">", ">>", "2>", "2>>", "<", "|", "&&", "||", ";"].indexOf(tokens[index + 1]) !== -1) throw new Error("missing redirection target");
        redirect.push({ op: token, path: tokens[++index] });
      } else command.push(token);
    }
    return { tokens: command, redirect: redirect };
  };

  Shell.prototype.runScript = async function (path, args, options) {
    var depth = options.depth || 0;
    if (depth > this.maxDepth) return { stdout: "", stderr: "zsh: maximum script depth exceeded\n", status: 126 };
    var text;
    try { text = this.machine.readFile(path); } catch (error) { return { stdout: "", stderr: "zsh: " + path + ": " + error.message + "\n", status: 126 }; }
    var lines = text.split(/\r?\n/);
    if (lines.length > this.maxScriptLines) return { stdout: "", stderr: "zsh: script exceeds 200 lines\n", status: 126 };
    if (!/^#!\/(?:bin\/sh|usr\/bin\/env bash)\b/.test(lines[0] || "")) return { stdout: "", stderr: "zsh: exec format error: " + path + "\n", status: 126 };
    var previous = {};
    ["0"].concat(args.map(function (_, index) { return String(index + 1); })).forEach(function (name) { previous[name] = this.machine.env[name]; }, this);
    this.machine.env["0"] = path;
    args.forEach(function (value, index) { this.machine.env[String(index + 1)] = value; }, this);
    var pid = this.machine.proc.spawn(HL.path.basename(path));
    var stdout = ""; var stderr = ""; var status = 0;
    try {
    for (var index = 1; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      this.charge(options, 1);
      var run = await this.run(lines[index], { capture: true, depth: depth + 1, budget: options.budget, script: true });
      stdout = (stdout + run.stdout).slice(0, this.maxOutputBytes); stderr = (stderr + run.stderr).slice(0, this.maxOutputBytes); status = run.status;
      if (status !== 0) break;
    }
    } finally {
    this.machine.proc.kill(pid, this.machine.identity.user);
    Object.keys(previous).forEach(function (name) { if (previous[name] === undefined) delete this.machine.env[name]; else this.machine.env[name] = previous[name]; }, this);
    }
    return { stdout: stdout, stderr: stderr, status: status };
  };

  Shell.prototype.invokeCommand = async function (name, args, stdin, options) {
    if (!name) return { stdout: "", stderr: "", status: 0 };
    if (this.builtins.indexOf(name) !== -1) return this.busybox.run(name, args, stdin, this, options);
    var path = this.resolveCommand(name);
    if (!path) return { stdout: "", stderr: "zsh: command not found: " + name + "\n", status: 127 };
    var resolved = this.machine.fs.resolve(path, "/", true);
    var node = this.machine.fs.stat(resolved, "/");
    if (!node || node.type === "dir" || !this.machine.fs.canAccess(node, "x")) return { stdout: "", stderr: "zsh: permission denied: " + name + "\n", status: 126 };
    var commandName = name.indexOf("/") !== -1 ? HL.path.basename(path) : name;
    var delays = { nmap: 280, ping: 150, traceroute: 180, tracepath: 180, curl: 100, wget: 100, dig: 90, host: 90, nslookup: 90, nc: 90, netcat: 90, ssh: 140, apt: 180 };
    if (delays[commandName]) await this.pause(delays[commandName], options);
    if (resolved === "/bin/busybox") return this.busybox.run(commandName, args, stdin, this, options);
    if (options.substitution) return { stdout: "", stderr: "zsh: command substitution permits busybox commands only\n", status: 126 };
    return this.runScript(resolved, args, options);
  };

  Shell.prototype.executeSimple = async function (rawTokens, stdin, options) {
    this.charge(options, rawTokens.length + 1);
    var parsed = this.extractRedirects(this.expandAlias(rawTokens));
    var tokens = [];
    for (var token of parsed.tokens) tokens.push(this.resolveVariables(await this.expandSubstitutions(token, options)));
    var sinks = [{ kind: "stdout" }, { kind: "stderr" }];
    for (var redirect of parsed.redirect) {
      this.charge(options, 1);
      if (redirect.op === "2>&1") { sinks[1] = sinks[0]; continue; }
      if (redirect.op === "1>&2") { sinks[0] = sinks[1]; continue; }
      var target = literal(this.resolveVariables(await this.expandSubstitutions(redirect.path, options)));
      if (redirect.op === "<") stdin = this.machine.readFile(target);
      else {
        this.machine.writeFile(target, "", redirect.op.endsWith(">>"));
        sinks[redirect.op.charAt(0) === "2" ? 1 : 0] = { kind: "file", path: target };
      }
    }
    var assignments = Object.create(null);
    while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
      var at = tokens[0].indexOf("="); var assignment = tokens.shift();
      assignments[assignment.slice(0, at)] = literal(assignment.slice(at + 1));
    }
    var args = [];
    tokens.forEach(function (word) {
      word.split(/[ \t\n]+/).filter(Boolean).forEach(function (field) {
        args = args.concat(this.machine.fs.glob(field, this.machine.cwd).map(literal));
      }, this);
    }, this);
    var name = args.shift();
    var previousEnv = Object.create(null); var previousExported = this.machine.exported.slice();
    Object.keys(assignments).forEach(function (key) {
      previousEnv[key] = this.machine.env[key]; this.machine.env[key] = assignments[key];
      if (this.machine.exported.indexOf(key) === -1) this.machine.exported.push(key);
    }, this);
    var changingFiles = ["mkdir", "rmdir", "touch", "cp", "mv", "rm", "ln", "chmod", "chown", "tar", "gzip", "gunzip"].indexOf(name) !== -1;
    var checkpoint = changingFiles ? {
      nodes: new Map(Array.from(this.machine.fs.nodes, function (entry) { return [entry[0], JSON.parse(JSON.stringify(entry[1]))]; })),
      dirty: new Set(this.machine.fs.dirty), deleted: new Set(this.machine.fs.deleted)
    } : null;
    var run;
    try {
      run = await this.invokeCommand(name, args, stdin, Object.assign({}, options, { tty: options.tty && !parsed.redirect.length }));
      this.charge(options, 1);
      if (checkpoint && !this.machine.persist()) {
        this.machine.fs.nodes = checkpoint.nodes; this.machine.fs.dirty = checkpoint.dirty; this.machine.fs.deleted = checkpoint.deleted;
        run = { stdout: "", stderr: name + ": No space left on device\n", status: 1 };
      }
      run = this.limitOutput(run);
    } finally {
      if (name) {
        Object.keys(assignments).forEach(function (key) { if (previousEnv[key] === undefined) delete this.machine.env[key]; else this.machine.env[key] = previousEnv[key]; }, this);
        this.machine.exported = previousExported;
      }
    }
    var streams = [String(run.stdout || ""), String(run.stderr || "")];
    run.stdout = ""; run.stderr = "";
    streams.forEach(function (text, index) {
      if (!text) return;
      var sink = sinks[index];
      if (sink.kind === "file") this.machine.writeFile(sink.path, text, true);
      else run[sink.kind] += text;
    }, this);
    return run;
  };

  Shell.prototype.runPipeline = async function (tokens, options) {
    this.charge(options, tokens.length + 1);
    var stages = []; var current = [];
    tokens.forEach(function (token) { if (token === "|") { stages.push(current); current = []; } else current.push(token); });
    stages.push(current);
    if (stages.some(function (stage) { return !stage.length; })) return { stdout: "", stderr: "zsh: parse error near `|'\n", status: 2 };
    var stdin = null; var stderr = ""; var effect = null; var status = 0;
    for (var index = 0; index < stages.length; index += 1) {
      var run = await this.executeSimple(stages[index], stdin, Object.assign({}, options, { tty: options.tty && stages.length === 1 }));
      stdin = run.stdout; stderr += run.stderr; effect = run.effect || effect; status = run.status;
    }
    return { stdout: stdin || "", stderr: stderr, status: status, effect: effect };
  };

  Shell.prototype.runTokens = async function (tokens, options) {
    this.charge(options, tokens.length + 1);
    var groups = []; var current = []; var connector = ";";
    tokens.forEach(function (token) {
      if (["&&", "||", ";"].indexOf(token) !== -1) { groups.push({ tokens: current, connector: connector }); current = []; connector = token; }
      else current.push(token);
    });
    groups.push({ tokens: current, connector: connector });
    if (groups.some(function (group) { return !group.tokens.length; })) return { stdout: "", stderr: "zsh: parse error\n", status: 2 };
    var output = { stdout: "", stderr: "", status: 0, effect: null };
    for (var index = 0; index < groups.length; index += 1) {
      var group = groups[index];
      if (index > 0 && group.connector === "&&" && output.status !== 0) continue;
      if (index > 0 && group.connector === "||" && output.status === 0) continue;
      var run = await this.runPipeline(group.tokens, options);
      output.stdout = (output.stdout + run.stdout).slice(0, this.maxOutputBytes); output.stderr = (output.stderr + run.stderr).slice(0, this.maxOutputBytes); output.status = run.status; output.effect = run.effect || output.effect;
      this.machine.env["?"] = String(run.status);
    }
    return output;
  };

  Shell.prototype.runControl = async function (line, options) {
    var match = /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+?)\s*;\s*do\s+(.+?)\s*;\s*done\s*$/.exec(line);
    var output = { stdout: "", stderr: "", status: 0, effect: null };
    if (match) {
      var name = match[1];
      var previous = this.machine.env[name];
      var values = this.tokenize(match[2]).map(this.resolveVariables.bind(this)).map(literal);
      for (var index = 0; index < values.length; index += 1) {
        this.charge(options, 1);
        this.machine.env[name] = values[index];
        var run = await this.run(match[3], { capture: true, depth: (options.depth || 0) + 1, budget: options.budget, script: options.script, background: options.background });
        output.stdout = (output.stdout + run.stdout).slice(0, this.maxOutputBytes); output.stderr = (output.stderr + run.stderr).slice(0, this.maxOutputBytes); output.status = run.status; output.effect = run.effect || output.effect;
        if (run.status !== 0) break;
      }
      if (previous === undefined) delete this.machine.env[name]; else this.machine.env[name] = previous;
      return output;
    }
    match = /^\s*while\s+(.+?)\s*;\s*do\s+(.+?)\s*;\s*done\s*$/.exec(line);
    if (match) {
      while (true) {
        this.charge(options, 2);
        var condition = await this.run(match[1], { capture: true, depth: (options.depth || 0) + 1, budget: options.budget, script: options.script, background: options.background });
        output.stdout = (output.stdout + condition.stdout).slice(0, this.maxOutputBytes); output.stderr = (output.stderr + condition.stderr).slice(0, this.maxOutputBytes);
        if (condition.status !== 0) { output.status = 0; break; }
        var body = await this.run(match[2], { capture: true, depth: (options.depth || 0) + 1, budget: options.budget, script: options.script, background: options.background });
        output.stdout = (output.stdout + body.stdout).slice(0, this.maxOutputBytes); output.stderr = (output.stderr + body.stderr).slice(0, this.maxOutputBytes); output.status = body.status; output.effect = body.effect || output.effect;
        if (body.status !== 0) break;
      }
      return output;
    }
    match = /^\s*if\s+(.+?)\s*;\s*then\s+(.+?)(?:\s*;\s*else\s+(.+?))?\s*;\s*fi\s*$/.exec(line);
    if (match) {
      var tested = await this.run(match[1], { capture: true, depth: (options.depth || 0) + 1, budget: options.budget, script: options.script, background: options.background });
      output.stdout = tested.stdout; output.stderr = tested.stderr;
      var branch = tested.status === 0 ? match[2] : match[3];
      if (!branch) { output.status = 0; return output; }
      var branched = await this.run(branch, { capture: true, depth: (options.depth || 0) + 1, budget: options.budget, script: options.script, background: options.background });
      output.stdout += branched.stdout; output.stderr += branched.stderr; output.status = branched.status; output.effect = branched.effect;
      return output;
    }
    return null;
  };

  Shell.prototype.startBackground = function (command) {
    if (this.background) return { stdout: "", stderr: "zsh: one background job is already active\n", status: 1 };
    var pid = this.machine.proc.spawn((command.trim().split(/\s+/)[0] || "job"));
    var started = root.performance && root.performance.now ? root.performance.now() : Date.now();
    var job = { id: 1, pid: pid, command: command, state: "Running", output: null, promise: null };
    this.background = job;
    job.promise = this.run(command, { capture: true, depth: 1, budget: { steps: 0, started: started, epoch: this.epoch }, background: true }).then(function (run) {
      job.output = run;
      job.state = "Done";
      this.machine.proc.kill(pid, this.machine.identity.user);
      return run;
    }.bind(this));
    return { stdout: "[1] " + pid + "\n", stderr: "", status: 0 };
  };

  Shell.prototype.jobsText = function () {
    return this.background ? "[1]+  " + this.background.state.padEnd(8, " ") + " " + this.background.command + "\n" : "";
  };

  Shell.prototype.foregroundJob = async function () {
    if (!this.background) return { stdout: "", stderr: "fg: no current job\n", status: 1 };
    var job = this.background;
    var run = job.output || await job.promise;
    this.background = null;
    return { stdout: String(run.stdout || ""), stderr: String(run.stderr || ""), status: Number(run.status || 0), effect: run.effect || null };
  };

  Shell.prototype.backgroundJobStatus = function () {
    if (!this.background) return { stdout: "", stderr: "bg: no current job\n", status: 1 };
    return { stdout: "[1]+ " + this.background.command + " &\n", stderr: "", status: 0 };
  };

  Shell.prototype.run = async function (line, options) {
    options = options || {};
    var top = !options.budget;
    if (top) options.budget = {
      steps: 0, epoch: this.epoch,
      started: root.performance && root.performance.now ? root.performance.now() : Date.now()
    };
    if ((options.depth || 0) > this.maxDepth) return { stdout: "", stderr: "zsh: maximum fork depth exceeded\n", status: 126 };
    try {
      var source = String(line || "");
      if (source.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ue000-\ue2ff]/.test(source)) throw new Error("invalid or oversized command");
      this.charge(options, source.length + 1);
      if (options.budget.steps - (options.budget.yieldAt || 0) > 2000) {
        options.budget.yieldAt = options.budget.steps;
        await this.pause(0, options);
      }
      if (this.machine.remoteControl && /&\s*$/.test(source) && !/&&\s*$/.test(source)) throw new Error("background jobs are unavailable during remote control");
      if (top && !options.background && /\s&\s*$/.test(source) && !/&&\s*$/.test(source)) {
        return this.limitOutput(this.startBackground(source.replace(/\s&\s*$/, "")));
      }
      var controlled = await this.runControl(source, options);
      if (controlled) {
        this.machine.env["?"] = String(controlled.status);
        this.machine.persist();
        return top ? this.limitOutput(controlled) : controlled;
      }
      var tokens = this.tokenize(source);
      if (tokens[tokens.length - 1] === ";") tokens.pop();
      if (!tokens.length) return { stdout: "", stderr: "", status: 0 };
      var run = await this.runTokens(tokens, options);
      this.charge(options, 1);
      this.machine.env["?"] = String(run.status);
      this.machine.persist();
      return top ? this.limitOutput(run) : run;
    } catch (error) {
      if (error && error.timedOut) return { stdout: "", stderr: "Timed out\n", status: 124 };
      if (error && error.interrupted) return { stdout: "", stderr: "Interrupted\n", status: 130 };
      var killed = Boolean(error && error.killed);
      this.machine.env["?"] = killed ? "137" : "2";
      var failed = killed
        ? { stdout: "", stderr: "Killed\n", status: 137 }
        : { stdout: "", stderr: "zsh: " + error.message + "\n", status: 2 };
      return top ? this.limitOutput(failed) : failed;
    }
  };

  var executeRun = Shell.prototype.run;
  Shell.prototype.run = function (line, options) {
    var tracked = !options || !options.budget || (options.background && options.depth === 1);
    var pending = executeRun.call(this, line, options);
    if (tracked) {
      this.pending.add(pending);
      pending.finally(function () { this.pending.delete(pending); }.bind(this));
    }
    return pending;
  };
  Shell.prototype.idle = function () { return Promise.allSettled(Array.from(this.pending)); };

  Shell.prototype.cancel = function () { this.epoch += 1; if (this.background) { this.machine.proc.kill(this.background.pid, this.machine.identity.user); this.background = null; } };

  Shell.prototype.complete = function (line, caret) {
    var before = line.slice(0, caret); var match = /([^\s|;&<>]*)$/.exec(before); var current = match ? match[1] : "";
    var commandPosition = before.slice(0, before.length - current.length).trim() === "" || /[|;&]\s*$/.test(before.slice(0, before.length - current.length));
    var choices = [];
    if (commandPosition) {
      choices = this.builtins.concat(Array.from(this.busybox.commandNames), Object.keys(this.machine.aliases));
    } else {
      var slash = current.lastIndexOf("/"); var directory = slash >= 0 ? current.slice(0, slash + 1) : ""; var leaf = slash >= 0 ? current.slice(slash + 1) : current;
      try { choices = this.machine.fs.list(directory || ".", this.machine.cwd, true).map(function (row) { return directory + row.name + (row.node.type === "dir" ? "/" : ""); }).filter(function (item) { return item.slice(directory.length).indexOf(leaf) === 0; }); } catch (error) { choices = []; }
    }
    choices = Array.from(new Set(choices)).filter(function (choice) { return choice.indexOf(current) === 0; }).sort();
    return { current: current, start: caret - current.length, choices: choices };
  };

  HL.Shell = Shell;
})(window);
