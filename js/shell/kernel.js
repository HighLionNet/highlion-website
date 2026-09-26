(function (root) {
  "use strict";

  var HL = root.HLShell = root.HLShell || {};
  var imageBase = "/js/shell/image/";

  function fetchText(name) {
    return fetch(imageBase + name + "?v=hl8j", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("machine image unavailable: " + name);
      return response.text();
    });
  }

  function fetchJson(name) {
    return fetch(imageBase + name + "?v=hl8j", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("machine image unavailable: " + name);
      return response.json();
    });
  }

  function storageGet(key) {
    if (key !== "hl-machine-v1") return null;
    try { return root.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    if (key !== "hl-machine-v1") return false;
    try { root.localStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function storageRemove(key) {
    if (key !== "hl-machine-v1") return false;
    try { root.localStorage.removeItem(key); return true; } catch (error) { return false; }
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
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    hexBytes: hexBytes,
    timingSafeEqual: timingSafeEqual
  };
})(window);
