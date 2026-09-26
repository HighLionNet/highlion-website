(function (root) {
  "use strict";

  var HL = root.HLShell = root.HLShell || {};
  var bootPromise = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function Machine(image) {
    this.image = image;
    this.config = image.tree;
    this.admin = image.admin || {};
    this.users = clone(this.config.users || {});
    if (!this.users.kali) this.users.kali = clone(this.config.identity);
    if (!this.users.root) {
      this.users.root = {
        user: "root", host: this.users.kali.host || "highlion", home: "/root", shell: "/bin/zsh",
        uid: 0, gid: 0, groups: ["root", "sudo", "adm"], prompt: "#"
      };
    }
    this.visitorName = String(this.config.defaultUser || "kali");
    this.identity = clone(this.users[this.visitorName] || this.users.kali);
    this.started = Date.now();
    this.fstab = image.fstab;
    this.packages = image.packages.packages || [];
    this.units = (image.units.units || []).map(clone);
    this.packs = image.packs || [];
    this.packs.forEach(function (pack) {
      (pack.units || []).forEach(function (unit) { this.units.push(clone(unit)); }, this);
    }, this);
    this.fs = new HL.VirtualFS(this.config);
    this.fs.setIdentity(this.identity);
    this.cwd = this.identity.home;
    this.previousCwd = this.identity.home;
    this.env = {};
    this.exported = [];
    this.history = [];
    this.aliases = {};
    this.umask = "0022";
    this.claimed = [];
    this.proc = new HL.ProcessTable(image.proc, this.started);
    HL.mountPacks(this.fs, this.packs);
    this.net = new HL.Network(image.proc, this.packs);
    this.installImageFiles(image.texts);
    this.installCommands();
    this.resetEnvironment();
    this.restore();
    this.proc.setSessionUser(this.visitorName);
    this.loadAliases();
  }

  Machine.prototype.resetEnvironment = function () {
    this.env = {
      HOME: this.identity.home, USER: this.identity.user, LOGNAME: this.identity.user, HOSTNAME: this.identity.host,
      SHELL: this.identity.shell, PATH: "/bin:/usr/bin:/usr/sbin", PWD: this.cwd, OLDPWD: this.previousCwd,
      LANG: "en_US.UTF-8", TERM: "xterm-256color", "?": "0", "0": "zsh"
    };
    this.exported = Object.keys(this.env);
  };

  Machine.prototype.installImageFiles = function (texts) {
    var map = {
      "passwd": ["/etc/passwd", "0644"], "group": ["/etc/group", "0644"], "shadow": ["/etc/shadow", "0000"],
      "os-release": ["/etc/os-release", "0644"], "hostname": ["/etc/hostname", "0644"], "hosts": ["/etc/hosts", "0644"],
      "resolv.conf": ["/etc/resolv.conf", "0644"], "motd": ["/etc/motd", "0644"], "issue": ["/etc/issue", "0644"]
    };
    Object.keys(map).forEach(function (name) {
      this.fs.add(map[name][0], { type: "file", mode: map[name][1], owner: "root", group: "root", content: texts[name] }, true);
    }, this);
    this.fs.add("/etc/fstab", { type: "file", mode: "0644", owner: "root", group: "root", content: this.mountText(false) }, true);
  };

  Machine.prototype.installCommands = function () {
    var self = this;
    (this.config.busyboxCommands || []).forEach(function (name) {
      var path = "/usr/bin/" + name;
      if (!self.fs.nodes.has(path)) self.fs.symlink("/bin/busybox", path, "/", true);
      var manual = String(self.config.manTemplate || "{command}\n").replace(/\{command\}/g, name);
      self.fs.add("/usr/share/man/man1/" + name + ".1", { type: "file", mode: "0444", owner: "root", group: "root", content: manual }, true);
    });
  };

  Machine.prototype.mountText = function (procView) {
    return (this.fstab.mounts || []).map(function (row) {
      if (procView) return row.source + " " + row.target + " " + row.type + " " + row.options + " 0 0";
      return row.source + "\t" + row.target + "\t" + row.type + "\t" + row.options + "\t" + row.dump + "\t" + row.pass;
    }).join("\n") + "\n";
  };

  Machine.prototype.promptPath = function () { return this.cwd === this.identity.home ? "~" : this.cwd; };
  Machine.prototype.promptSymbol = function () { return String(this.identity.prompt || (Number(this.identity.uid) === 0 ? "#" : "$")); };
  Machine.prototype.prompt = function () { return this.identity.user + "@" + this.identity.host + ":" + this.promptPath() + this.promptSymbol(); };
  Machine.prototype.isRoot = function () { return Number(this.identity.uid) === 0 || this.identity.user === "root"; };

  Machine.prototype.switchUser = function (name, options) {
    options = options || {};
    var next = this.users[name];
    if (!next) throw new Error("unknown user: " + name);
    this.identity = clone(next);
    this.fs.setIdentity(this.identity);
    if (!options.preserveCwd || !this.fs.nodes.has(this.cwd)) {
      this.cwd = this.identity.home;
      this.previousCwd = this.identity.home;
    }
    this.resetEnvironment();
    this.loadAliases();
    if (this.proc && this.proc.setSessionUser) this.proc.setSessionUser(this.identity.user);
    if (options.persist !== false) this.persist();
  };

  Machine.prototype.rootAuthStatus = function () {
    var auth = (this.admin.root || {}).auth || {};
    return {
      configured: Boolean((this.admin.root || {}).enabled && auth.kdf === "PBKDF2-SHA-256" && Number(auth.iterations) >= 100000 && HL.kernel.hexBytes(auth.salt) && HL.kernel.hexBytes(auth.verifier)),
      enabled: Boolean((this.admin.root || {}).enabled),
      clientOnly: true
    };
  };

  Machine.prototype.authenticateRoot = async function (password) {
    var status = this.rootAuthStatus();
    if (!status.configured || !root.crypto || !root.crypto.subtle) return false;
    var auth = this.admin.root.auth;
    var salt = HL.kernel.hexBytes(auth.salt);
    var expected = HL.kernel.hexBytes(auth.verifier);
    var key = await root.crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), { name: "PBKDF2" }, false, ["deriveBits"]);
    var bits = await root.crypto.subtle.deriveBits({
      name: "PBKDF2", salt: salt, iterations: Math.min(1000000, Math.max(100000, Number(auth.iterations))), hash: "SHA-256"
    }, key, expected.length * 8);
    var valid = HL.kernel.timingSafeEqual(new Uint8Array(bits), expected);
    if (valid) this.switchUser("root", { persist: false });
    return valid;
  };

  Machine.prototype.logoutRoot = function () {
    if (!this.isRoot()) return false;
    this.switchUser(this.visitorName, { persist: false });
    return true;
  };

  Machine.prototype.readFile = function (path) {
    var absolute = this.fs.resolve(path, this.cwd, true);
    var synthetic = this.proc.readProc(absolute, this);
    if (synthetic !== null) return synthetic;
    return this.fs.readFile(absolute, "/");
  };

  Machine.prototype.writeFile = function (path, content, append) {
    var absolute = this.fs.resolve(path, this.cwd, true);
    var before = this.fs.nodes.has(absolute) ? clone(this.fs.nodes.get(absolute)) : null;
    var wasDirty = this.fs.dirty.has(absolute);
    var wasDeleted = this.fs.deleted.has(absolute);
    this.fs.writeFile(absolute, content, "/", append, false);
    if (!this.persist()) {
      if (before) this.fs.nodes.set(absolute, before); else this.fs.nodes.delete(absolute);
      if (wasDirty) this.fs.dirty.add(absolute); else this.fs.dirty.delete(absolute);
      if (wasDeleted) this.fs.deleted.add(absolute); else this.fs.deleted.delete(absolute);
      throw new Error("persistence limit exceeded");
    }
  };

  Machine.prototype.changeDirectory = function (path) {
    var target = path === "-" ? this.previousCwd : this.fs.resolve(path || this.identity.home, this.cwd, true);
    var node = this.fs.stat(target, "/");
    if (!node) throw new Error("no such file or directory");
    if (node.type !== "dir") throw new Error("not a directory");
    if (!this.fs.canAccess(node, "x")) throw new Error("permission denied");
    this.previousCwd = this.cwd;
    this.cwd = target;
    this.env.OLDPWD = this.previousCwd;
    this.env.PWD = this.cwd;
    var link = this.fs.nodes.get("/proc/self/cwd");
    if (link) link.target = this.cwd;
    this.persist();
    return path === "-" ? this.cwd : "";
  };

  Machine.prototype.historyPath = function () { return this.identity.home + "/.zsh_history"; };
  Machine.prototype.addHistory = function (line) {
    if (!line) return;
    this.history.push(line);
    if (this.history.length > 500) this.history = this.history.slice(-500);
    try { this.fs.writeFile(this.historyPath(), this.history.join("\n") + "\n", "/", false, true); } catch (error) {}
    this.persist();
  };

  Machine.prototype.loadAliases = function () {
    try {
      var text = this.fs.readFile(this.identity.home + "/.zshrc", "/");
      var aliases = {};
      text.split(/\r?\n/).forEach(function (line) {
        var match = /^alias\s+([A-Za-z_][A-Za-z0-9_-]*)=(?:'([^']*)'|"([^"]*)")$/.exec(line.trim());
        if (match) aliases[match[1]] = match[2] === undefined ? match[3] : match[2];
      });
      this.aliases = Object.assign({}, this.config.aliases || {}, aliases);
    } catch (error) { this.aliases = Object.assign({}, this.config.aliases || {}); }
  };

  Machine.prototype.persistenceData = function () {
    return {
      version: 2,
      cwd: this.isRoot() ? this.users[this.visitorName].home : this.cwd,
      previousCwd: this.isRoot() ? this.users[this.visitorName].home : this.previousCwd,
      env: this.isRoot() ? {} : this.env,
      exported: this.isRoot() ? [] : this.exported,
      history: this.history,
      claimed: this.claimed,
      files: this.fs.snapshotWritable()
    };
  };

  Machine.prototype.persist = function () {
    var encoded = JSON.stringify(this.persistenceData());
    if (new TextEncoder().encode(encoded).length > Number(this.config.persistenceCap || 262144)) return false;
    return HL.kernel.storageSet(this.config.persistenceKey || "hl-machine-v1", encoded);
  };

  Machine.prototype.restore = function () {
    var raw = HL.kernel.storageGet(this.config.persistenceKey || "hl-machine-v1");
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      this.fs.restoreWritable(saved.files || {});
      var visitorHome = this.users[this.visitorName].home;
      this.cwd = this.fs.stat(saved.cwd || visitorHome, "/") ? saved.cwd : visitorHome;
      this.previousCwd = saved.previousCwd || visitorHome;
      this.env = Object.assign(this.env, saved.env || {}, { PWD: this.cwd, OLDPWD: this.previousCwd });
      this.exported = Array.isArray(saved.exported) && saved.exported.length ? saved.exported : this.exported;
      this.history = Array.isArray(saved.history) ? saved.history.slice(-500) : [];
      this.claimed = Array.isArray(saved.claimed) ? saved.claimed : [];
    } catch (error) {}
  };

  Machine.prototype.reset = function () {
    HL.kernel.storageRemove(this.config.persistenceKey || "hl-machine-v1");
    if (root.location && typeof root.location.reload === "function") root.location.reload();
  };

  async function loadImage() {
    var names = ["passwd", "group", "shadow", "os-release", "hostname", "hosts", "resolv.conf", "motd", "issue"];
    var resources = await Promise.all([
      HL.kernel.fetchJson("tree.json"), HL.kernel.fetchJson("fstab.json"), HL.kernel.fetchJson("packages.json"),
      HL.kernel.fetchJson("units.json"), HL.kernel.fetchJson("proc.json"), HL.kernel.fetchJson("admin.json"),
      Promise.all(names.map(HL.kernel.fetchText))
    ]);
    var texts = {};
    names.forEach(function (name, index) { texts[name] = resources[6][index]; });
    return {
      tree: resources[0], fstab: resources[1], packages: resources[2], units: resources[3], proc: resources[4],
      admin: resources[5], texts: texts, packs: await HL.loadPacks(resources[5].packPolicy || {})
    };
  }

  HL.boot = function () {
    if (!bootPromise) {
      bootPromise = loadImage().then(function (image) {
        var machine = new Machine(image);
        machine.ctf = new HL.ChallengeController(machine);
        machine.shell = new HL.Shell(machine);
        return machine;
      });
    }
    return bootPromise;
  };

  HL.Machine = Machine;
})(window);
