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
    this.userStack = [];
    this.lease = { id: "", operator: false };
    this.sessionControl = null;
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

  Machine.prototype.attachLease = function (lease, controller) {
    this.lease = {
      id: lease && typeof lease.id === "string" ? lease.id : "",
      operator: Boolean(lease && lease.operator)
    };
    this.sessionControl = typeof controller === "function" ? controller : null;
  };

  Machine.prototype.authenticateUser = function (name) {
    if (name !== "root" && name !== "admin") return false;
    this.switchUser(name, { persist: false });
    return true;
  };

  Machine.prototype.dropToKali = function () {
    this.userStack = [];
    this.switchUser(this.visitorName, { persist: false });
    return true;
  };

  Machine.prototype.readFile = function (path) {
    var absolute = this.fs.resolve(path, this.cwd, true);
    if (absolute === "/proc/net/arp") return this.net.procArp();
    if (absolute === "/proc/net/route") return this.net.procRoute();
    if (absolute === "/proc/net/tcp") return this.net.procTcp();
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
    if (this.history.length > 300) this.history = this.history.slice(-300);
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
      v: 1,
      files: this.fs.snapshotWritable()
    };
  };

  Machine.prototype.persist = function () {
    var encoded = JSON.stringify(this.persistenceData());
    if (new TextEncoder().encode(encoded).length > Number(this.config.overlayCap || 262144)) return false;
    return HL.kernel.sessionSet(this.config.overlayKey || "hl-machine-overlay-v1", encoded);
  };

  Machine.prototype.persistTrophies = function () {
    var ids = Array.from(new Set(this.claimed.filter(function (id) {
      return typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
    })));
    return HL.kernel.localSet(this.config.trophiesKey || "hl-trophies-v1", JSON.stringify({ v: 1, claimed: ids }));
  };

  Machine.prototype.restore = function () {
    HL.kernel.localRemove("hl-machine-v1");
    var raw = HL.kernel.sessionGet(this.config.overlayKey || "hl-machine-overlay-v1");
    try {
      var saved = raw ? JSON.parse(raw) : null;
      if (saved && saved.v === 1) this.fs.restoreWritable(saved.files || {});
    } catch (error) {}
    var trophyRaw = HL.kernel.localGet(this.config.trophiesKey || "hl-trophies-v1");
    try {
      var trophies = trophyRaw ? JSON.parse(trophyRaw) : null;
      this.claimed = trophies && trophies.v === 1 && Array.isArray(trophies.claimed)
        ? trophies.claimed.filter(function (id) { return typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id); })
        : [];
    } catch (error) { this.claimed = []; }
  };

  Machine.prototype.syncTrophyFiles = function () {
    this.claimed.forEach(function (id) {
      try {
        this.fs.writeFile("/home/kali/highlion/.trophies/" + id + ".flag", "claimed: " + id + "\n", "/", false, true);
      } catch (error) {}
    }, this);
  };

  Machine.prototype.remountHome = function (userName) {
    var user = this.users[userName];
    if (!user) return false;
    var home = user.home;
    var prefix = home + "/";
    var template = new HL.VirtualFS(this.config);
    HL.mountPacks(template, this.packs);
    Array.from(this.fs.nodes.keys()).forEach(function (path) {
      if (path === home || path.indexOf(prefix) === 0) this.fs.nodes.delete(path);
    }, this);
    template.nodes.forEach(function (node, path) {
      if (path === home || path.indexOf(prefix) === 0) this.fs.nodes.set(path, clone(node));
    }, this);
    [this.fs.dirty, this.fs.deleted].forEach(function (set) {
      Array.from(set).forEach(function (path) {
        if (path === home || path.indexOf(prefix) === 0) set.delete(path);
      });
    });
    if (this.identity.user === userName) {
      this.cwd = home;
      this.previousCwd = home;
      this.resetEnvironment();
      this.loadAliases();
    }
    this.syncTrophyFiles();
    return this.persist();
  };

  Machine.prototype.reset = function () {
    HL.kernel.sessionRemove(this.config.overlayKey || "hl-machine-overlay-v1");
    HL.kernel.localRemove("hl-machine-v1");
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
        machine.syncTrophyFiles();
        machine.shell = new HL.Shell(machine);
        return machine;
      });
    }
    return bootPromise;
  };

  HL.Machine = Machine;
})(window);
