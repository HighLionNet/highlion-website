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
  var errors = {
    name: document.getElementById("nameError"),
    email: document.getElementById("emailError"),
    message: document.getElementById("messageError")
  };
  var sending = false;
  Object.keys(errors).forEach(function (name) {
    if (errors[name]) fields[name].setAttribute("aria-describedby", errors[name].id);
  });

  function setState(state, detail) {
    status.textContent = state || "";
    status.dataset.state = (state || "").toLowerCase().replace(/[^a-z]/g, "");
    feedback.textContent = detail || "";
  }

  function setFieldError(name, message) {
    var control = fields[name];
    var wrapper = control.closest(".field");
    control.setAttribute("aria-invalid", message ? "true" : "false");
    if (wrapper) wrapper.classList.toggle("is-invalid", Boolean(message));
    if (errors[name]) errors[name].textContent = message || "";
  }

  function clearErrors() {
    ["name", "email", "message"].forEach(function (name) { setFieldError(name, ""); });
  }

  function validate(payload) {
    var messages = { name: "", email: "", message: "" };
    if (Array.from(payload.name).length < 2 || Array.from(payload.name).length > 80 || /[\r\n<>\0]/.test(payload.name)) {
      messages.name = "Name must be 2–80 characters.";
    }
    if (payload.email.length < 6 || payload.email.length > 254 || /[\r\n\0]/.test(payload.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      messages.email = "Enter a valid email.";
    }
    if (!payload.message) {
      messages.message = "Message is required.";
    } else if (Array.from(payload.message).length < 10) {
      messages.message = "Message must be at least 10 characters.";
    } else if (Array.from(payload.message).length > 4000) {
      messages.message = "Message must be at most 4000 characters.";
    } else if (/\0|\r\n\r\nFrom:|MIME-Version:/i.test(payload.message)) {
      messages.message = "Remove mail headers or control characters from the message.";
    }
    Object.keys(messages).forEach(function (name) { setFieldError(name, messages[name]); });
    return messages;
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
    return requestToken("/api/csrf.php")
      .catch(function () { return requestToken("/api/csrf"); })
      .catch(function () { return requestToken("/api/csrf/"); });
  }

  async function postOne(url, payload, token) {
    var response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify(payload)
    });
    var json = null;
    try { json = await response.json(); } catch (error) { json = null; }
    return { response: response, json: json };
  }

  async function postMessage(payload, token) {
    var endpoints = ["/api/contact.php", "/api/contact", "/api/contact/"];
    var last = null;
    for (var index = 0; index < endpoints.length; index += 1) {
      last = await postOne(endpoints[index], payload, token);
      if (last.response.status !== 404 || index === endpoints.length - 1) return last;
    }
    return last;
  }

  ["name", "email", "message"].forEach(function (name) {
    fields[name].addEventListener("input", function () {
      setFieldError(name, "");
      if (status.dataset.state === "error") setState("", "");
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (sending) return;
    var payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      message: fields.message.value.trim(),
      company: fields.company.value.trim(),
      page: document.querySelector(".error-panel-403") ? "403" : "contact"
    };
    var messages = payload.company ? { name: "", email: "", message: "" } : validate(payload);
    if (payload.company) clearErrors();
    var firstError = messages.name || messages.email || messages.message;
    if (firstError) {
      setState("Error", firstError);
      fields[Object.keys(messages).find(function (name) { return messages[name]; })].focus();
      return;
    }

    setState("Sending", "");
    sending = true;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      var token = payload.company ? "" : await loadToken();
      payload.token = token;
      var result = await postMessage(payload, token);
      if (result && result.response.ok && result.json && result.json.ok === true) {
        form.reset();
        clearErrors();
        setState("Sent", "");
      } else if (result && result.response.status === 429) {
        setState("Error", "Too many messages. Try again in 15 minutes.");
      } else {
        setState("Error", "Message not sent.");
      }
    } catch (error) {
      setState("Error", "Message not sent.");
    } finally {
      sending = false;
      button.disabled = false;
      form.setAttribute("aria-busy", "false");
    }
  });
})();
