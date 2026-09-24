(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  var button = document.getElementById("submitContact");
  var status = document.getElementById("formStatus");
  var feedback = document.getElementById("formFeedback");
  var fields = {
    name: form.elements.name,
    email: form.elements.email,
    message: form.elements.message,
    company: form.elements.company
  };

  function setState(state, detail) {
    status.textContent = state;
    status.dataset.state = state.toLowerCase().replace(/[^a-z]/g, "");
    feedback.textContent = detail || "";
  }

  function requestToken(url) {
    return fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Token unavailable");
        return response.json();
      })
      .then(function (result) {
        if (!result || result.ok !== true || typeof result.token !== "string") throw new Error("Token unavailable");
        return result.token;
      });
  }

  function loadToken() {
    return requestToken("/api/csrf").catch(function () { return requestToken("/api/csrf.php"); });
  }

  var tokenPromise = loadToken().catch(function () { return ""; });

  function valid(payload) {
    var checks = {
      name: payload.name.length >= 2 && payload.name.length <= 80 && !/[\r\n<>]/.test(payload.name),
      email: payload.email.length >= 6 && payload.email.length <= 254 && !/[\r\n]/.test(payload.email) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email),
      message: payload.message.length >= 10 && payload.message.length <= 4000 && !/\r\n\r\nFrom:/i.test(payload.message) && !/MIME-Version:/i.test(payload.message)
    };
    Object.keys(checks).forEach(function (key) {
      fields[key].setAttribute("aria-invalid", checks[key] ? "false" : "true");
    });
    return checks.name && checks.email && checks.message;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (fields.company.value.trim()) {
      setState("Sent", "");
      return;
    }

    var payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      message: fields.message.value.trim()
    };
    if (!valid(payload)) {
      setState("Error", "Check the highlighted fields.");
      return;
    }

    setState("Sending", "");
    button.disabled = true;
    try {
      var token = await tokenPromise;
      if (!token) {
        token = await loadToken();
        tokenPromise = Promise.resolve(token);
      }
      payload.token = token;
      var response = await fetch("/api/contact", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token
        },
        body: JSON.stringify(payload)
      });
      var result = await response.json();
      if (response.ok && result && result.ok === true) {
        form.reset();
        setState("Sent.", "");
      } else {
        setState("Error", "Message not sent.");
      }
    } catch (error) {
      setState("Error", "Message not sent.");
    } finally {
      button.disabled = false;
    }
  });
})();
