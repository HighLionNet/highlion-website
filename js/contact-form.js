(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  // Debian: exclude /api/contact from IL geo-403 so 403 page can POST.
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
    status.dataset.state = state.toLowerCase();
    feedback.textContent = detail || "";
  }

  function valid(payload) {
    var noNewlines = function (value) { return !/[\r\n]/.test(value); };
    var checks = {
      name: payload.name.length >= 2 && payload.name.length <= 80 && noNewlines(payload.name),
      email: payload.email.length >= 6 && payload.email.length <= 254 && /^\S+@\S+\.\S+$/.test(payload.email) && noNewlines(payload.email),
      message: payload.message.length >= 10 && payload.message.length <= 4000 && noNewlines(payload.message)
    };

    Object.keys(checks).forEach(function (key) {
      fields[key].setAttribute("aria-invalid", checks[key] ? "false" : "true");
    });
    return checks.name && checks.email && checks.message;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var raw = {
      name: fields.name.value,
      email: fields.email.value,
      message: fields.message.value
    };
    var payload = {
      name: raw.name.trim(),
      email: raw.email.trim(),
      message: raw.message.trim()
    };

    if (fields.company.value.trim()) {
      setState("Error", "Message not sent.");
      return;
    }
    if (/[\r\n]/.test(raw.name) || /[\r\n]/.test(raw.email) || /[\r\n]/.test(raw.message) || !valid(payload)) {
      setState("Error", "Check the highlighted fields.");
      return;
    }

    setState("Sending", "");
    button.disabled = true;
    try {
      var response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error("Request failed");
      form.reset();
      setState("Sent", "Message sent.");
    } catch (error) {
      setState("Error", "Message not sent.");
    } finally {
      button.disabled = false;
    }
  });
})();
