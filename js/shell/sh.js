(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function variableToken(name, fallback) {
    var encodedFallback = fallback === undefined ? "__HL_UNSET__" : encodeURIComponent(fallback);
    return "\ue000" + encodeURIComponent(name) + "|" + encodedFallback + "\ue001";
  }

  function Shell(machine) {
    this.machine = machine;
    this.busybox = new HL.BusyBox(machine);
    this.machine.shell = this;
    this.maxScriptLines = 200;
    this.maxDepth = 20;
  }

  Shell.prototype.expandVariable = function (line, index) {
    var next = line[index + 1] || "";
    if (next === "{") {
      var end = line.indexOf("}", index + 2);
      if (end < 0) return { value: "$", end: index };
      var expression = line.slice(index + 2, end);
      var match = /^([A-Za-z_][A-Za-z0-9_]*|[?0-9])(?::-(.*))?$/.exec(expression);
      if (!match) return { value: "", end: end };
      return { value: variableToken(match[1], match[2]), end: end };
    }
    var matchName = /^([A-Za-z_][A-Za-z0-9_]*|[?0-9])/.exec(line.slice(index + 1));
    if (!matchName) return { value: "$", end: index };
    return { value: variableToken(matchName[1]), end: index + matchName[1].length };
  };

  Shell.prototype.resolveVariables = function (token) {
    return String(token).replace(/\ue000([^|]*)\|([^\ue001]*)\ue001/g, function (_, encodedName, encodedFallback) {
      var name = decodeURIComponent(encodedName);
      var current = this.machine.env[name];
      if (current !== undefined && current !== "") return current;
      return encodedFallback === "__HL_UNSET__" ? "" : decodeURIComponent(encodedFallback);
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
        index += 1; current += escaped; started = true; continue;
      }
      if (char === "'" && quote !== '"') { quote = quote === "'" ? "" : "'"; started = true; continue; }
      if (char === '"' && quote !== "'") { quote = quote === '"' ? "" : '"'; started = true; continue; }
      if (!quote && /\s/.test(char)) { push(); continue; }
      if (!quote) {
        var rest = line.slice(index);
        var operator = ["2>&1", "&&", "||", ">>", "2>", "|", ";", ">"].find(function (candidate) { return rest.indexOf(candidate) === 0; });
        if (operator) { push(); tokens.push(operator); index += operator.length - 1; continue; }
      }
      if (char === "$" && quote !== "'") {
        var expanded = this.expandVariable(line, index); current += expanded.value; index = expanded.end; started = true; continue;
      }
      current += char; started = true;
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

  Shell.prototype.expandSubstitutions = async function (line, depth) {
    var output = line; var found = this.findSubstitution(output);
    while (found) {
      var run = await this.run(found.inner, { capture: true, depth: (depth || 0) + 1, substitution: true });
      var replacement = run.stdout.replace(/\n+$/, "").replace(/\n/g, " ");
      output = output.slice(0, found.start) + replacement + output.slice(found.end + 1);
      found = this.findSubstitution(output);
    }
    return output;
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
    var alias = this.machine.aliases[tokens[0]];
    if (!alias) return tokens;
    return this.tokenize(alias).concat(tokens.slice(1));
  };

  Shell.prototype.extractRedirects = function (tokens) {
    var command = []; var redirect = { stdout: null, append: false, stderr: null, merge: false };
    for (var index = 0; index < tokens.length; index += 1) {
      var token = tokens[index];
      if (token === "2>&1") { redirect.merge = true; continue; }
      if ([">", ">>", "2>"].indexOf(token) !== -1) {
        if (!tokens[index + 1] || ["|", "&&", "||", ";"].indexOf(tokens[index + 1]) !== -1) throw new Error("missing redirection target");
        if (token === "2>") redirect.stderr = tokens[++index];
        else { redirect.stdout = tokens[++index]; redirect.append = token === ">>"; }
        continue;
      }
      command.push(token);
    }
    return { tokens: command, redirect: redirect };
  };

  Shell.prototype.runScript = async function (path, args, depth) {
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
    for (var index = 1; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      var run = await this.run(lines[index], { capture: true, depth: depth + 1 });
      stdout += run.stdout; stderr += run.stderr; status = run.status;
      if (status !== 0) break;
    }
    this.machine.proc.kill(pid, this.machine.identity.user);
    Object.keys(previous).forEach(function (name) { if (previous[name] === undefined) delete this.machine.env[name]; else this.machine.env[name] = previous[name]; }, this);
    return { stdout: stdout, stderr: stderr, status: status };
  };

  Shell.prototype.executeSimple = async function (rawTokens, stdin, options) {
    var parsed;
    try { parsed = this.extractRedirects(this.expandAlias(rawTokens)); } catch (error) { return { stdout: "", stderr: "zsh: " + error.message + "\n", status: 2 }; }
    var tokens = parsed.tokens.map(this.resolveVariables.bind(this)); var redirect = parsed.redirect;
    if (redirect.stdout) redirect.stdout = this.resolveVariables(redirect.stdout);
    if (redirect.stderr) redirect.stderr = this.resolveVariables(redirect.stderr);
    var assignments = {};
    while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
      var at = tokens[0].indexOf("="); assignments[tokens[0].slice(0, at)] = tokens.shift().slice(at + 1);
    }
    if (!tokens.length) {
      Object.assign(this.machine.env, assignments); this.machine.persist();
      return { stdout: "", stderr: "", status: 0 };
    }
    var name = tokens.shift();
    var args = [];
    tokens.forEach(function (token) { args = args.concat(this.machine.fs.glob(token, this.machine.cwd)); }, this);
    var path = this.resolveCommand(name);
    if (!path) return { stdout: "", stderr: "zsh: command not found: " + name + "\n", status: 127 };
    var lnode;
    try { lnode = this.machine.fs.lstat(path, "/"); } catch (error) { return { stdout: "", stderr: "zsh: permission denied: " + name + "\n", status: 126 }; }
    var resolved = this.machine.fs.resolve(path, "/", true);
    var node = this.machine.fs.nodes.get(resolved);
    if (!node || !this.machine.fs.canAccess(node, "x")) return { stdout: "", stderr: "zsh: permission denied: " + name + "\n", status: 126 };
    var previousEnv = {};
    var previousExported = this.machine.exported.slice();
    Object.keys(assignments).forEach(function (key) {
      previousEnv[key] = this.machine.env[key];
      this.machine.env[key] = assignments[key];
      if (this.machine.exported.indexOf(key) === -1) this.machine.exported.push(key);
    }, this);
    var run;
    if (resolved === "/bin/busybox") {
      var commandName = name.indexOf("/") !== -1 ? HL.path.basename(path) : name;
      run = await this.busybox.run(commandName, args, stdin, this);
    } else if (options.substitution) {
      run = { stdout: "", stderr: "zsh: command substitution permits busybox commands only\n", status: 126 };
    } else {
      run = await this.runScript(resolved, args, options.depth || 0);
    }
    Object.keys(assignments).forEach(function (key) { if (previousEnv[key] === undefined) delete this.machine.env[key]; else this.machine.env[key] = previousEnv[key]; }, this);
    this.machine.exported = previousExported;
    run.stdout = String(run.stdout || ""); run.stderr = String(run.stderr || ""); run.status = Number(run.status || 0);
    try {
      if (redirect.merge) { run.stdout += run.stderr; run.stderr = ""; }
      if (redirect.stdout) { this.machine.writeFile(redirect.stdout, run.stdout, redirect.append); run.stdout = ""; }
      if (redirect.stderr) { this.machine.writeFile(redirect.stderr, run.stderr, false); run.stderr = ""; }
    } catch (error) {
      run.stdout = "";
      run.stderr = "zsh: " + (redirect.stdout || redirect.stderr) + ": " + error.message + "\n";
      run.status = 1;
    }
    return run;
  };

  Shell.prototype.runPipeline = async function (tokens, options) {
    var stages = []; var current = [];
    tokens.forEach(function (token) { if (token === "|") { stages.push(current); current = []; } else current.push(token); });
    stages.push(current);
    if (stages.some(function (stage) { return !stage.length; })) return { stdout: "", stderr: "zsh: parse error near `|'\n", status: 2 };
    var stdin = null; var stderr = ""; var effect = null; var status = 0;
    for (var index = 0; index < stages.length; index += 1) {
      var run = await this.executeSimple(stages[index], stdin, options);
      stdin = run.stdout; stderr += run.stderr; effect = run.effect || effect; status = run.status;
    }
    return { stdout: stdin || "", stderr: stderr, status: status, effect: effect };
  };

  Shell.prototype.runTokens = async function (tokens, options) {
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
      output.stdout += run.stdout; output.stderr += run.stderr; output.status = run.status; output.effect = run.effect || output.effect;
      this.machine.env["?"] = String(run.status);
      if (run.effect && run.effect.type === "root-auth") break;
    }
    return output;
  };

  Shell.prototype.run = async function (line, options) {
    options = options || {};
    if ((options.depth || 0) > this.maxDepth) return { stdout: "", stderr: "zsh: maximum fork depth exceeded\n", status: 126 };
    try {
      var expanded = await this.expandSubstitutions(String(line || ""), options.depth || 0);
      var tokens = this.tokenize(expanded);
      if (!tokens.length) return { stdout: "", stderr: "", status: 0 };
      var run = await this.runTokens(tokens, options);
      this.machine.env["?"] = String(run.status);
      this.machine.persist();
      return run;
    } catch (error) {
      this.machine.env["?"] = "2";
      return { stdout: "", stderr: "zsh: " + error.message + "\n", status: 2 };
    }
  };

  Shell.prototype.complete = function (line, caret) {
    var before = line.slice(0, caret); var match = /([^\s|;&<>]*)$/.exec(before); var current = match ? match[1] : "";
    var commandPosition = before.slice(0, before.length - current.length).trim() === "" || /[|;&]\s*$/.test(before.slice(0, before.length - current.length));
    var choices = [];
    if (commandPosition) {
      choices = Array.from(this.busybox.commandNames).concat(Object.keys(this.machine.aliases));
    } else {
      var slash = current.lastIndexOf("/"); var directory = slash >= 0 ? current.slice(0, slash + 1) : ""; var leaf = slash >= 0 ? current.slice(slash + 1) : current;
      try { choices = this.machine.fs.list(directory || ".", this.machine.cwd, true).map(function (row) { return directory + row.name + (row.node.type === "dir" ? "/" : ""); }).filter(function (item) { return item.slice(directory.length).indexOf(leaf) === 0; }); } catch (error) { choices = []; }
    }
    choices = Array.from(new Set(choices)).filter(function (choice) { return choice.indexOf(current) === 0; }).sort();
    return { current: current, start: caret - current.length, choices: choices };
  };

  HL.Shell = Shell;
})(window);
