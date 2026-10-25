(function (root) {
  "use strict";

  var HL = root.HLShell = root.HLShell || {};
  var imageBase = "/js/shell/image/";

  function fetchText(name) {
    return fetch(imageBase + name + "?v=hl8u", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("machine image unavailable: " + name);
      return response.text();
    });
  }

  function fetchJson(name) {
    return fetch(imageBase + name + "?v=hl8u", { cache: "no-store", credentials: "same-origin" }).then(function (response) {
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

  HL.kernel = {
    fetchText: fetchText,
    fetchJson: fetchJson,
    localGet: localGet,
    localSet: localSet,
    localRemove: localRemove,
    sessionGet: sessionGet,
    sessionSet: sessionSet,
    sessionRemove: sessionRemove
  };
})(window);
