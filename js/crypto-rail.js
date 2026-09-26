(function () {
  "use strict";

  var pane = document.getElementById("cryptoPane");
  var canvas = document.getElementById("cryptoChart");
  if (!pane || !canvas) return;
  var context = canvas.getContext("2d");
  if (!context) return;

  var coin = "bitcoin";
  var range = "24h";
  var cache = new Map();
  var lastRequest = new Map();
  var quote = document.getElementById("cryptoQuote");
  var state = document.getElementById("cryptoState");
  var labels = { bitcoin: "BTC", "bitcoin-cash": "BCH", monero: "XMR", ethereum: "ETH", solana: "SOL" };
  var days = { "1h": 1, "24h": 1, "7d": 7, "30d": 30 };

  function key() { return coin + ":" + range; }

  function seriesForRange(prices) {
    if (range !== "1h") return prices;
    var cutoff = Date.now() - 60 * 60 * 1000;
    return prices.filter(function (point) { return point[0] >= cutoff; });
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 100 ? 0 : (value >= 1 ? 2 : 4)
    }).format(value);
  }

  function draw(prices) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!prices || prices.length < 2) return;
    var values = prices.map(function (point) { return Number(point[1]); });
    var minimum = Math.min.apply(null, values);
    var maximum = Math.max.apply(null, values);
    var span = Math.max(maximum - minimum, maximum * 0.001, 0.000001);
    var pad = 4;
    function x(index) { return pad + index / (values.length - 1) * (width - pad * 2); }
    function y(value) { return pad + (maximum - value) / span * (height - pad * 2); }
    context.beginPath();
    values.forEach(function (value, index) {
      if (index === 0) context.moveTo(x(index), y(value));
      else context.lineTo(x(index), y(value));
    });
    context.lineTo(width - pad, height - pad);
    context.lineTo(pad, height - pad);
    context.closePath();
    var fill = context.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, "rgba(102,247,255,0.18)");
    fill.addColorStop(1, "rgba(102,247,255,0.01)");
    context.fillStyle = fill;
    context.fill();
    context.beginPath();
    values.forEach(function (value, index) {
      if (index === 0) context.moveTo(x(index), y(value));
      else context.lineTo(x(index), y(value));
    });
    context.strokeStyle = "rgba(102,247,255,0.82)";
    context.lineWidth = 1;
    context.stroke();
    var first = values[0];
    var current = values[values.length - 1];
    var change = first ? (current - first) / first * 100 : 0;
    quote.textContent = labels[coin] + " " + money(current) + " " + (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    quote.dataset.trend = change >= 0 ? "up" : "down";
    canvas.setAttribute("aria-label", labels[coin] + " " + range.toUpperCase() + " price chart");
  }

  function paintSelection() {
    pane.querySelectorAll("[data-coin]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.coin === coin ? "true" : "false");
    });
    pane.querySelectorAll("[data-range]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.range === range ? "true" : "false");
    });
  }

  function load(force) {
    var cacheKey = key();
    var cached = cache.get(cacheKey);
    var requestedAt = lastRequest.get(cacheKey) || 0;
    if (!force && requestedAt && Date.now() - requestedAt < 30000) {
      state.textContent = cached && !cached.stale ? "live" : "stale";
      if (cached) draw(cached.prices);
      return;
    }
    lastRequest.set(cacheKey, Date.now());
    var url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(coin) +
      "/market_chart?vs_currency=usd&days=" + days[range];
    fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("market unavailable");
        return response.json();
      })
      .then(function (payload) {
        var prices = seriesForRange(Array.isArray(payload.prices) ? payload.prices : []);
        if (prices.length < 2) throw new Error("empty market series");
        cache.set(cacheKey, { prices: prices, stale: false });
        state.textContent = "live";
        draw(prices);
      })
      .catch(function () {
        var fallback = cache.get(cacheKey);
        state.textContent = "stale";
        if (fallback) {
          fallback.stale = true;
          draw(fallback.prices);
        } else {
          quote.textContent = labels[coin] + " unavailable";
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
  }

  pane.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.coin) coin = button.dataset.coin;
    if (button.dataset.range) range = button.dataset.range;
    paintSelection();
    load(false);
  });
  window.addEventListener("resize", function () {
    var cached = cache.get(key());
    if (cached) draw(cached.prices);
  }, { passive: true });
  paintSelection();
  load(false);
  window.setInterval(function () { load(false); }, 30000);
})();
