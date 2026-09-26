(function (root) {
  "use strict";

  var HL = root.HLShell = root.HLShell || {};

  function nowStamp() {
    return new Date().toISOString();
  }

  function cleanMode(value, fallback) {
    var text = String(value || fallback || "0644").replace(/^0+/, "");
    var parsed = parseInt(text || "0", 8);
    return Number.isFinite(parsed) ? parsed : parseInt(String(fallback || "0644"), 8);
  }

  function dirname(path) {
    if (path === "/") return "/";
    var at = path.lastIndexOf("/");
    return at <= 0 ? "/" : path.slice(0, at);
  }

  function basename(path) {
    return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
  }

  function cloneNode(node) {
    return JSON.parse(JSON.stringify(node));
  }

  function VirtualFS(config) {
    this.config = config || {};
    this.identity = this.config.identity || { user: "kali", groups: ["kali"] };
    this.nodes = new Map();
    this.writable = (this.config.writable || ["/home/kali", "/tmp", "/var/tmp"]).slice();
    this.protectedRoots = (this.config.syntheticReadOnly || ["/proc", "/sys"]).slice();
    this.dirty = new Set();
    this.deleted = new Set();
    this.mount(this.config);
  }

  VirtualFS.prototype.setIdentity = function (identity) {
    this.identity = identity || this.identity;
  };

  VirtualFS.prototype.isRoot = function () {
    return Number(this.identity.uid) === 0 || this.identity.user === "root";
  };

  VirtualFS.prototype.isProtected = function (absolute) {
    return this.protectedRoots.some(function (prefix) {
      return absolute === prefix || absolute.indexOf(prefix + "/") === 0;
    });
  };

  VirtualFS.prototype.markDirty = function (absolute) {
    this.dirty.add(absolute);
    this.deleted.delete(absolute);
  };

  VirtualFS.prototype.normalize = function (input, cwd) {
    var raw = String(input === undefined || input === "" ? "." : input);
    var home = this.identity.home || "/home/kali";
    if (raw === "~") raw = home;
    else if (raw.indexOf("~/") === 0) raw = home + raw.slice(1);
    var base = raw.charAt(0) === "/" ? [] : String(cwd || home).split("/");
    var parts = base.concat(raw.split("/"));
    var result = [];
    parts.forEach(function (part) {
      if (!part || part === ".") return;
      if (part === "..") result.pop();
      else result.push(part);
    });
    return "/" + result.join("/");
  };

  VirtualFS.prototype.mount = function (config) {
    var self = this;
    this.nodes.clear();
    (config.directories || []).forEach(function (entry) {
      self.add(entry[0], { type: "dir", mode: entry[1], owner: entry[2], group: entry[3] }, true);
    });
    Object.keys(config.files || {}).forEach(function (path) {
      var data = Object.assign({ type: "file" }, config.files[path]);
      self.add(path, data, true);
    });
    Object.keys(config.symlinks || {}).forEach(function (path) {
      self.add(path, { type: "symlink", mode: "0777", owner: "root", group: "root", target: config.symlinks[path] }, true);
    });
  };

  VirtualFS.prototype.add = function (path, data, system) {
    var absolute = this.normalize(path, "/");
    var node = Object.assign({
      type: "file",
      mode: data && data.type === "dir" ? "0755" : "0644",
      owner: "root",
      group: "root",
      mtime: nowStamp(),
      content: ""
    }, data || {});
    node.mode = cleanMode(node.mode, node.type === "dir" ? "0755" : "0644");
    node.name = basename(absolute);
    if (!system && !this.canWritePath(absolute, !this.nodes.has(absolute))) throw new Error("permission denied");
    this.nodes.set(absolute, node);
    if (!system) this.markDirty(absolute);
    return node;
  };

  VirtualFS.prototype._resolve = function (path, cwd, followLast, depth) {
    var absolute = this.normalize(path, cwd);
    if ((depth || 0) > 16) throw new Error("too many levels of symbolic links");
    var parts = absolute === "/" ? [] : absolute.slice(1).split("/");
    var built = "";
    for (var index = 0; index < parts.length; index += 1) {
      built += "/" + parts[index];
      var node = this.nodes.get(built);
      if (!node) return absolute;
      var isLast = index === parts.length - 1;
      if (node.type === "symlink" && (followLast !== false || !isLast)) {
        var rest = parts.slice(index + 1).join("/");
        var target = node.target.charAt(0) === "/" ? node.target : dirname(built) + "/" + node.target;
        return this._resolve(target + (rest ? "/" + rest : ""), "/", true, (depth || 0) + 1);
      }
    }
    return absolute;
  };

  VirtualFS.prototype.resolve = function (path, cwd, followLast) {
    return this._resolve(path, cwd, followLast !== false, 0);
  };

  VirtualFS.prototype.permissionBits = function (node) {
    if (this.isRoot()) return 7;
    var shift = 0;
    if (node.owner === this.identity.user) shift = 6;
    else if ((this.identity.groups || []).indexOf(node.group) !== -1) shift = 3;
    return (node.mode >> shift) & 7;
  };

  VirtualFS.prototype.canAccess = function (node, flag) {
    if (!node) return false;
    var bit = flag === "r" ? 4 : flag === "w" ? 2 : 1;
    return (this.permissionBits(node) & bit) === bit;
  };

  VirtualFS.prototype.canTraverse = function (absolute) {
    var parts = absolute === "/" ? [] : absolute.slice(1).split("/");
    var built = "";
    for (var index = 0; index < parts.length - 1; index += 1) {
      built += "/" + parts[index];
      var node = this.nodes.get(this.resolve(built, "/"));
      if (!node || node.type !== "dir" || !this.canAccess(node, "x")) return false;
    }
    return true;
  };

  VirtualFS.prototype.canWritePath = function (absolute, creating) {
    if (this.isProtected(absolute)) return false;
    if (absolute === "/dev/null") return true;
    if (absolute === "/dev" || absolute.indexOf("/dev/") === 0) return false;
    var identity = this.identity.user;
    var permitted = identity === "root"
      ? ["/home/kali", "/home/admin", "/tmp", "/var/tmp", "/root", "/var/log"]
      : identity === "admin"
        ? ["/home/admin", "/tmp", "/var/tmp"]
        : ["/home/kali", "/tmp", "/var/tmp"];
    var allowed = permitted.some(function (prefix) { return absolute === prefix || absolute.indexOf(prefix + "/") === 0; });
    if (!allowed) return false;
    if (this.isRoot()) {
      var rootNode = this.nodes.get(this.resolve(absolute, "/"));
      if (rootNode && !creating) return rootNode.type !== "dir" || absolute !== "/";
      var rootParent = this.nodes.get(this.resolve(dirname(absolute), "/"));
      return Boolean(rootParent && rootParent.type === "dir");
    }
    if (!this.canTraverse(absolute)) return false;
    var node = this.nodes.get(this.resolve(absolute, "/"));
    if (node && !creating) return this.canAccess(node, "w");
    var parent = this.nodes.get(this.resolve(dirname(absolute), "/"));
    return Boolean(parent && parent.type === "dir" && this.canAccess(parent, "w") && this.canAccess(parent, "x"));
  };

  VirtualFS.prototype.lstat = function (path, cwd) {
    var absolute = this.resolve(path, cwd, false);
    if (!this.canTraverse(absolute)) throw new Error("permission denied");
    return this.nodes.get(absolute) || null;
  };

  VirtualFS.prototype.stat = function (path, cwd) {
    var absolute = this.resolve(path, cwd, true);
    if (!this.canTraverse(absolute)) throw new Error("permission denied");
    return this.nodes.get(absolute) || null;
  };

  VirtualFS.prototype.readFile = function (path, cwd) {
    var absolute = this.resolve(path, cwd, true);
    if (!this.canTraverse(absolute)) throw new Error("permission denied");
    var node = this.nodes.get(absolute);
    if (!node) throw new Error("no such file or directory");
    if (node.type === "dir") throw new Error("is a directory");
    if (!this.canAccess(node, "r")) throw new Error("permission denied");
    if (node.device === "null") return "";
    if (node.device === "zero") return "\0".repeat(64 * 1024);
    if (node.device === "random" || node.device === "urandom") {
      var bytes = new Uint8Array(32);
      if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
      else bytes.forEach(function (_, index) { bytes[index] = Math.floor(Math.random() * 256); });
      return Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("") + "\n";
    }
    return String(node.content || "");
  };

  VirtualFS.prototype.writeFile = function (path, content, cwd, append, system) {
    var absolute = this.resolve(path, cwd, true);
    if (absolute === "/dev/null") return;
    if (!system && !this.canWritePath(absolute, !this.nodes.has(absolute))) throw new Error("permission denied");
    var node = this.nodes.get(absolute);
    if (node && node.type === "dir") throw new Error("is a directory");
    if (!node) {
      node = this.add(absolute, { type: "file", mode: "0644", owner: this.identity.user, group: this.identity.user }, true);
    }
    node.content = append ? String(node.content || "") + String(content) : String(content);
    node.mtime = nowStamp();
    if (!system) this.markDirty(absolute);
  };

  VirtualFS.prototype.list = function (path, cwd, all) {
    var absolute = this.resolve(path || ".", cwd, true);
    if (!this.canTraverse(absolute)) throw new Error("permission denied");
    var directory = this.nodes.get(absolute);
    if (!directory) throw new Error("no such file or directory");
    if (directory.type !== "dir") return [{ path: absolute, name: basename(absolute), node: directory }];
    if (!this.canAccess(directory, "r") || !this.canAccess(directory, "x")) throw new Error("permission denied");
    var prefix = absolute === "/" ? "/" : absolute + "/";
    var rows = [];
    this.nodes.forEach(function (node, nodePath) {
      if (nodePath.indexOf(prefix) !== 0) return;
      var tail = nodePath.slice(prefix.length);
      if (!tail || tail.indexOf("/") !== -1 || (!all && tail.charAt(0) === ".")) return;
      rows.push({ path: nodePath, name: tail, node: node });
    });
    rows.sort(function (left, right) { return left.name.localeCompare(right.name); });
    return rows;
  };

  VirtualFS.prototype.mkdir = function (path, cwd, parents, system) {
    var absolute = this.normalize(path, cwd);
    var parts = absolute.slice(1).split("/");
    var built = "";
    for (var index = 0; index < parts.length; index += 1) {
      built += "/" + parts[index];
      if (this.nodes.has(built)) {
        if (this.nodes.get(built).type !== "dir") throw new Error("file exists");
        if (!parents && index === parts.length - 1) throw new Error("file exists");
        continue;
      }
      if (!parents && index !== parts.length - 1) throw new Error("no such file or directory");
      this.add(built, { type: "dir", mode: "0755", owner: this.identity.user, group: this.identity.user }, Boolean(system));
    }
  };

  VirtualFS.prototype.touch = function (path, cwd) {
    var absolute = this.resolve(path, cwd, true);
    var node = this.nodes.get(absolute);
    if (node) {
      if (!this.canWritePath(absolute, false)) throw new Error("permission denied");
      node.mtime = nowStamp();
      this.markDirty(absolute);
      return;
    }
    this.writeFile(absolute, "", "/", false, false);
  };

  VirtualFS.prototype.remove = function (path, cwd, recursive) {
    var absolute = this.resolve(path, cwd, false);
    var node = this.nodes.get(absolute);
    if (!node) throw new Error("no such file or directory");
    if (!this.canWritePath(absolute, false)) throw new Error("permission denied");
    var children = this.list(absolute, "/", true);
    if (node.type === "dir" && children.length && !recursive) throw new Error("directory not empty");
    var prefix = absolute + "/";
    Array.from(this.nodes.keys()).forEach(function (nodePath) {
      if (nodePath === absolute || (recursive && nodePath.indexOf(prefix) === 0)) {
        this.nodes.delete(nodePath);
        this.dirty.delete(nodePath);
        this.deleted.add(nodePath);
      }
    }, this);
  };

  VirtualFS.prototype.rename = function (source, destination, cwd) {
    var from = this.resolve(source, cwd, false);
    var to = this.normalize(destination, cwd);
    var node = this.nodes.get(from);
    if (!node) throw new Error("no such file or directory");
    var target = this.nodes.get(this.resolve(to, "/"));
    if (target && target.type === "dir") to = (to === "/" ? "" : to) + "/" + basename(from);
    if (!this.canWritePath(from, false) || !this.canWritePath(to, !this.nodes.has(to))) throw new Error("permission denied");
    var moved = [];
    var prefix = from + "/";
    this.nodes.forEach(function (value, nodePath) {
      if (nodePath === from || nodePath.indexOf(prefix) === 0) moved.push([nodePath, cloneNode(value)]);
    });
    moved.forEach(function (entry) { this.nodes.delete(entry[0]); }, this);
    moved.forEach(function (entry) {
      var next = to + entry[0].slice(from.length);
      entry[1].name = basename(next);
      this.nodes.set(next, entry[1]);
      this.markDirty(next);
      this.deleted.add(entry[0]);
    }, this);
  };

  VirtualFS.prototype.copy = function (source, destination, cwd, recursive) {
    var from = this.resolve(source, cwd, true);
    var to = this.normalize(destination, cwd);
    var node = this.nodes.get(from);
    if (!node) throw new Error("no such file or directory");
    var target = this.nodes.get(this.resolve(to, "/"));
    if (target && target.type === "dir") to = (to === "/" ? "" : to) + "/" + basename(from);
    if (node.type === "dir" && !recursive) throw new Error("omitting directory");
    var rows = [];
    var prefix = from + "/";
    this.nodes.forEach(function (value, nodePath) {
      if (nodePath === from || (recursive && nodePath.indexOf(prefix) === 0)) rows.push([nodePath, cloneNode(value)]);
    });
    rows.forEach(function (entry) {
      var next = to + entry[0].slice(from.length);
      if (!this.canWritePath(next, !this.nodes.has(next))) throw new Error("permission denied");
      entry[1].owner = this.identity.user;
      entry[1].group = this.identity.user;
      entry[1].name = basename(next);
      entry[1].mtime = nowStamp();
      this.nodes.set(next, entry[1]);
      this.markDirty(next);
    }, this);
  };

  VirtualFS.prototype.symlink = function (target, path, cwd, system) {
    var absolute = this.normalize(path, cwd);
    if (this.nodes.has(absolute)) throw new Error("file exists");
    this.add(absolute, { type: "symlink", mode: "0777", owner: system ? "root" : this.identity.user, group: system ? "root" : this.identity.user, target: target }, Boolean(system));
  };

  VirtualFS.prototype.chmod = function (path, mode, cwd) {
    var absolute = this.resolve(path, cwd, false);
    var node = this.nodes.get(absolute);
    if (!node) throw new Error("no such file or directory");
    if (!this.canWritePath(absolute, false) || (!this.isRoot() && node.owner !== this.identity.user)) throw new Error("operation not permitted");
    node.mode = cleanMode(mode, "0644");
    node.mtime = nowStamp();
    this.markDirty(absolute);
  };

  VirtualFS.prototype.chown = function (path, owner, group, cwd) {
    var absolute = this.resolve(path, cwd, false);
    var node = this.nodes.get(absolute);
    if (!node) throw new Error("no such file or directory");
    if (!this.canWritePath(absolute, false)) throw new Error("operation not permitted");
    if (!this.isRoot() && owner && owner !== this.identity.user) throw new Error("operation not permitted");
    node.owner = owner || node.owner;
    node.group = group || node.group;
    node.mtime = nowStamp();
    this.markDirty(absolute);
  };

  VirtualFS.prototype.walk = function (path, cwd) {
    var absolute = this.resolve(path || ".", cwd, true);
    var node = this.nodes.get(absolute);
    if (!node) throw new Error("no such file or directory");
    if (!this.canTraverse(absolute)) throw new Error("permission denied");
    if (node.type === "dir" && (!this.canAccess(node, "r") || !this.canAccess(node, "x"))) throw new Error("permission denied");
    var prefix = absolute === "/" ? "/" : absolute + "/";
    var result = [{ path: absolute, node: node }];
    this.nodes.forEach(function (child, childPath) {
      if (childPath.indexOf(prefix) === 0) result.push({ path: childPath, node: child });
    });
    result.sort(function (left, right) { return left.path.localeCompare(right.path); });
    return result;
  };

  VirtualFS.prototype.glob = function (pattern, cwd) {
    if (!/[?*]/.test(pattern)) return [pattern];
    var absolute = this.normalize(pattern, cwd);
    var parent = dirname(absolute);
    var leaf = basename(absolute);
    var expression = new RegExp("^" + leaf.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    try {
      var matches = this.list(parent, "/", false).filter(function (row) { return expression.test(row.name); });
      return matches.length ? matches.map(function (row) { return parent === "/" ? "/" + row.name : parent + "/" + row.name; }) : [pattern];
    } catch (error) {
      return [pattern];
    }
  };

  VirtualFS.prototype.modeString = function (node) {
    var lead = node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-";
    var chars = "rwx";
    var out = lead;
    [6, 3, 0].forEach(function (shift) {
      var bits = (node.mode >> shift) & 7;
      for (var bit = 0; bit < 3; bit += 1) out += bits & (4 >> bit) ? chars[bit] : "-";
    });
    if ((node.mode & 512) && out.length === 10) out = out.slice(0, 9) + (out[9] === "x" ? "t" : "T");
    return out;
  };

  VirtualFS.prototype.size = function (node) {
    return node.type === "file" ? new TextEncoder().encode(String(node.content || "")).length : 0;
  };

  VirtualFS.prototype.snapshotWritable = function () {
    var data = { version: 2, nodes: {}, deleted: Array.from(this.deleted) };
    var self = this;
    this.nodes.forEach(function (node, path) {
      var visitorPath = self.writable.some(function (prefix) { return path === prefix || path.indexOf(prefix + "/") === 0; });
      if ((visitorPath || self.dirty.has(path)) && !self.isProtected(path)) data.nodes[path] = cloneNode(node);
    });
    return data;
  };

  VirtualFS.prototype.restoreWritable = function (data) {
    var self = this;
    var versioned = data && data.version === 2 && data.nodes;
    var nodes = versioned ? data.nodes : (data || {});
    var deleted = versioned && Array.isArray(data.deleted) ? data.deleted : [];
    deleted.forEach(function (path) {
      if (!self.isProtected(path)) {
        self.nodes.delete(path);
        self.deleted.add(path);
      }
    });
    Object.keys(nodes).forEach(function (path) {
      var visitorPath = self.writable.some(function (prefix) { return path === prefix || path.indexOf(prefix + "/") === 0; });
      if (!versioned && !visitorPath) return;
      if (self.isProtected(path)) return;
      self.nodes.set(path, cloneNode(nodes[path]));
      self.dirty.add(path);
    });
  };

  HL.VirtualFS = VirtualFS;
  HL.path = { dirname: dirname, basename: basename };
})(window);
