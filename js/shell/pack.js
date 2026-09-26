(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};
  var packBase = "/js/shell/image/packs/";

  function cleanName(value) {
    var name = String(value || "").trim();
    if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(name) || name.indexOf("..") !== -1) return "";
    return name;
  }

  async function fetchJson(name) {
    var response = await fetch(packBase + name + "?v=hl8l", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("pack unavailable: " + name);
    return response.json();
  }

  function validatePack(pack, fileName) {
    var errors = [];
    if (!pack || typeof pack !== "object" || Array.isArray(pack)) errors.push("pack must be an object");
    if (!pack || !/^[a-z0-9][a-z0-9_-]{1,31}$/i.test(String(pack.id || ""))) errors.push("invalid id");
    if (!pack || typeof pack.title !== "string" || !pack.title.trim()) errors.push("missing title");
    Object.keys((pack && pack.mount) || {}).forEach(function (path) {
      if (path.charAt(0) !== "/" || path.indexOf("..") !== -1) errors.push("invalid mount path: " + path);
      var node = pack.mount[path];
      if (!node || ["dir", "file", "symlink"].indexOf(node.type || "file") === -1) errors.push("invalid node: " + path);
    });
    ((pack && pack.flags) || []).forEach(function (flag, index) {
      var values = flag && (Array.isArray(flag.flag) ? flag.flag : [flag.flag]);
      if (!flag || !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(String(flag.id || "")) || !values || !values.length || values.some(function (value) { return typeof value !== "string" || !value; })) errors.push("invalid flag at " + index);
    });
    ((pack && pack.units) || []).forEach(function (unit, index) {
      if (!unit || !/^[a-z0-9@_.-]+\.service$/i.test(String(unit.name || ""))) errors.push("invalid unit at " + index);
    });
    if (errors.length) throw new Error(fileName + ": " + errors.join("; "));
    pack._file = fileName;
    pack.schema = Number(pack.schema || 1);
    return pack;
  }

  async function manifestNames(policy) {
    var manifestFile = cleanName(String(policy.manifest || "manifest.json").replace(/^packs\//, "")) || "manifest.json";
    var limit = Math.min(256, Math.max(1, Number(policy.maxPacks) || 64));
    try {
      var manifest = await fetchJson(manifestFile);
      if (!manifest || Number(manifest.schema) !== 1 || !Array.isArray(manifest.packs)) throw new Error("invalid pack manifest");
      var names = manifest.packs.map(cleanName).filter(Boolean).slice(0, limit);
      return Array.from(new Set(names));
    } catch (error) {
      return ["season00.json"];
    }
  }

  HL.loadPacks = async function (policy) {
    var names = await manifestNames(policy || {});
    var loaded = await Promise.all(names.map(async function (name) {
      try { return validatePack(await fetchJson(name), name); }
      catch (error) { return { _file: name, _error: error.message, id: name.replace(/\.json$/i, ""), title: "Invalid pack", hidden: true, mount: {}, flags: [], prizes: [] }; }
    }));
    var seenPacks = new Set();
    var seenFlags = new Set();
    loaded.forEach(function (pack) {
      if (seenPacks.has(pack.id)) pack._error = "duplicate pack id: " + pack.id;
      seenPacks.add(pack.id);
      (pack.flags || []).forEach(function (flag) {
        if (seenFlags.has(flag.id)) pack._error = "duplicate flag id: " + flag.id;
        seenFlags.add(flag.id);
      });
    });
    return loaded.sort(function (left, right) { return String(left.id).localeCompare(String(right.id)); });
  };

  function addFragment(fs, path, node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "dir") fs.mkdir(path, "/", true, true);
    else if (node.type === "symlink") fs.add(path, node, true);
    else fs.add(path, Object.assign({ type: "file" }, node), true);
    Object.keys(node.kids || {}).forEach(function (name) {
      addFragment(fs, (path === "/" ? "" : path) + "/" + name, node.kids[name]);
    });
  }

  HL.mountPacks = function (fs, packs) {
    (packs || []).forEach(function (pack) {
      if (pack._error) return;
      Object.keys(pack.mount || {}).forEach(function (path) { addFragment(fs, path, pack.mount[path]); });
    });
  };

  HL.validatePack = validatePack;
})(window);
