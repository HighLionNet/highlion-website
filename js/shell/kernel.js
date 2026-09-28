(function (root) {
  "use strict";

  var HL = root.HLShell = root.HLShell || {};
  var imageBase = "/js/shell/image/";

  function fetchText(name) {
    return fetch(imageBase + name + "?v=hl8r", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("machine image unavailable: " + name);
      return response.text();
    });
  }

  function fetchJson(name) {
    return fetch(imageBase + name + "?v=hl8r", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("machine image unavailable: " + name);
      return response.json();
    });
  }

  function localGet(key) {
    if (key !== "hl-trophies-v1" && key !== "hl-machine-v1") return null;
    try { return root.localStorage.getItem(key); } catch (error) { return null; }
  }

  function localSet(key, value) {
    if (key !== "hl-trophies-v1") return false;
    try { root.localStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function localRemove(key) {
    if (key !== "hl-trophies-v1" && key !== "hl-machine-v1") return false;
    try { root.localStorage.removeItem(key); return true; } catch (error) { return false; }
  }

  function sessionGet(key) {
    if (key !== "hl-machine-overlay-v1") return null;
    try { return root.sessionStorage.getItem(key); } catch (error) { return null; }
  }

  function sessionSet(key, value) {
    if (key !== "hl-machine-overlay-v1") return false;
    try { root.sessionStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function sessionRemove(key) {
    if (key !== "hl-machine-overlay-v1") return false;
    try { root.sessionStorage.removeItem(key); return true; } catch (error) { return false; }
  }

  function hexBytes(value) {
    var clean = String(value || "").trim().toLowerCase();
    if (!clean || clean.length % 2 !== 0 || !/^[a-f0-9]+$/.test(clean)) return null;
    var bytes = new Uint8Array(clean.length / 2);
    for (var index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }

  function timingSafeEqual(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  HL.kernel = {
    fetchText: fetchText,
    fetchJson: fetchJson,
    localGet: localGet,
    localSet: localSet,
    localRemove: localRemove,
    sessionGet: sessionGet,
    sessionSet: sessionSet,
    sessionRemove: sessionRemove,
    hexBytes: hexBytes,
    timingSafeEqual: timingSafeEqual
  };
})(window);
