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
  var requestedAt = new Map();
  var retries = new Map();
  var displayed = null;
  var inFlightKey = "";
  var queuedKey = "";
  var timer = 0;
  var quote = document.getElementById("cryptoQuote");
  var state = document.getElementById("cryptoState");
  var highNode = document.getElementById("cryptoHigh");
  var lowNode = document.getElementById("cryptoLow");
  var rangeNode = document.getElementById("cryptoRange");
  var labels = {
    bitcoin: "BTC", "bitcoin-cash": "BCH", monero: "XMR", ethereum: "ETH",
    solana: "SOL", litecoin: "LTC", dogecoin: "DOGE", cardano: "ADA"
  };
  var days = { "1h": 1, "24h": 1, "7d": 7, "30d": 30 };

  function pairKey(selectedCoin, selectedRange) { return selectedCoin + ":" + selectedRange; }
  function currentKey() { return pairKey(coin, range); }

  function cleanPrices(prices) {
    if (!Array.isArray(prices)) return [];
    return prices.map(function (point) { return [Number(point[0]), Number(point[1])]; })
      .filter(function (point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[0] > 0 && point[1] >= 0; });
  }

  function seriesForRange(prices, selectedRange) {
    var clean = cleanPrices(prices);
    if (selectedRange !== "1h") return clean;
    var cutoff = Date.now() - 60 * 60 * 1000;
    var hour = clean.filter(function (point) { return point[0] >= cutoff; });
    return hour.length >= 2 ? hour : clean.slice(-12);
  }

  function decimals(value) {
    if (value >= 1000) return 0;
    if (value >= 1) return 2;
    if (value >= 0.01) return 4;
    return 6;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: decimals(value) }).format(value);
  }

  function axisMoney(value) {
    if (value >= 1000000) return "$" + (value / 1000000).toFixed(1) + "m";
    if (value >= 1000) return "$" + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "k";
    return "$" + value.toFixed(decimals(value));
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    return { width: width, height: height };
  }

  function clearFor(selectedCoin, selectedRange) {
    resizeCanvas();
    displayed = null;
    state.textContent = "loading";
    quote.textContent = labels[selectedCoin] + " loading";
    delete quote.dataset.trend;
    highNode.textContent = "—";
    lowNode.textContent = "—";
    rangeNode.textContent = selectedRange.toUpperCase();
    canvas.setAttribute("aria-label", labels[selectedCoin] + " " + selectedRange.toUpperCase() + " price chart loading");
  }

  function draw(record) {
    var prices = record && record.prices;
    var size = resizeCanvas();
    if (!prices || prices.length < 2) return;
    displayed = record;
    var width = size.width; var height = size.height;
    var values = prices.map(function (point) { return point[1]; });
    var minimum = Math.min.apply(null, values); var maximum = Math.max.apply(null, values);
    var rawSpan = Math.max(maximum - minimum, maximum * 0.001, 0.000001);
    var scaleMin = minimum - rawSpan * 0.06; var scaleMax = maximum + rawSpan * 0.06; var span = scaleMax - scaleMin;
    var left = 58; var right = 8; var top = 8; var bottom = 10;
    var plotWidth = Math.max(1, width - left - right); var plotHeight = Math.max(1, height - top - bottom);
    function x(index) { return left + index / (values.length - 1) * plotWidth; }
    function y(value) { return top + (scaleMax - value) / span * plotHeight; }

    context.font = '10px "JetBrains Mono", ui-monospace, monospace';
    context.textAlign = "right"; context.textBaseline = "middle";
    for (var tick = 0; tick < 4; tick += 1) {
      var ratio = tick / 3; var value = scaleMax - span * ratio; var tickY = top + plotHeight * ratio;
      context.beginPath(); context.moveTo(left, tickY); context.lineTo(width - right, tickY);
      context.strokeStyle = "rgba(255,255,255,0.08)"; context.lineWidth = 1; context.stroke();
      context.fillStyle = "rgba(167,183,214,0.78)"; context.fillText(axisMoney(value), left - 6, tickY);
    }

    context.beginPath();
    values.forEach(function (value, index) { if (!index) context.moveTo(x(index), y(value)); else context.lineTo(x(index), y(value)); });
    context.lineTo(width - right, top + plotHeight); context.lineTo(left, top + plotHeight); context.closePath();
    var fill = context.createLinearGradient(0, top, 0, height - bottom);
    fill.addColorStop(0, "rgba(102,247,255,0.16)"); fill.addColorStop(1, "rgba(102,247,255,0.01)");
    context.fillStyle = fill; context.fill();
    context.beginPath();
    values.forEach(function (value, index) { if (!index) context.moveTo(x(index), y(value)); else context.lineTo(x(index), y(value)); });
    context.strokeStyle = "rgba(102,247,255,0.88)"; context.lineWidth = 1; context.stroke();
    var current = values[values.length - 1];
    context.beginPath(); context.arc(width - right, y(current), 3, 0, Math.PI * 2); context.fillStyle = "#66f7ff"; context.fill();

    var first = values[0]; var change = first ? (current - first) / first * 100 : 0;
    quote.textContent = labels[record.coin] + " " + money(current) + " " + (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    quote.dataset.trend = change >= 0 ? "up" : "down";
    highNode.textContent = money(maximum); lowNode.textContent = money(minimum); rangeNode.textContent = record.range.toUpperCase();
    canvas.setAttribute("aria-label", labels[record.coin] + " " + record.range.toUpperCase() + " price chart");
  }

  function paintSelection() {
    pane.querySelectorAll("[data-coin]").forEach(function (button) { button.setAttribute("aria-pressed", button.dataset.coin === coin ? "true" : "false"); });
    pane.querySelectorAll("[data-range]").forEach(function (button) { button.setAttribute("aria-pressed", button.dataset.range === range ? "true" : "false"); });
  }

  function schedule(milliseconds, force) {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { load(force); }, milliseconds);
  }

  function jsonResponse(response) {
    if (!response.ok) throw new Error("market unavailable");
    return response.json();
  }

  function serverRequest(selectedCoin, selectedRange) {
    var url = "/api/market.php?coin=" + encodeURIComponent(selectedCoin) + "&days=" + days[selectedRange];
    return fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then(jsonResponse).then(function (payload) {
        if (!payload || payload.ok !== true || payload.coin !== selectedCoin || Number(payload.days) !== days[selectedRange]) throw new Error("invalid market payload");
        return { prices: payload.prices, stale: payload.stale === true };
      });
  }

  function directRequest(selectedCoin, selectedRange) {
    var url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(selectedCoin) + "/market_chart?vs_currency=usd&days=" + days[selectedRange];
    return fetch(url, { cache: "no-store", headers: { Accept: "application/json" } }).then(jsonResponse)
      .then(function (payload) { return { prices: payload.prices, stale: false }; });
  }

  function load(force) {
    var selectedCoin = coin; var selectedRange = range; var key = pairKey(selectedCoin, selectedRange); var cached = cache.get(key);
    if (inFlightKey) {
      queuedKey = key;
      if (cached) { draw(cached); state.textContent = cached.stale ? "stale" : "live"; }
      else clearFor(selectedCoin, selectedRange);
      return;
    }
    var last = requestedAt.get(key) || 0;
    if (!force && cached && !cached.stale && Date.now() - last < 30000) {
      draw(cached); state.textContent = "live"; schedule(30000 - (Date.now() - last), false); return;
    }
    if (cached) { draw(cached); state.textContent = cached.stale ? "stale" : "loading"; }
    else clearFor(selectedCoin, selectedRange);

    inFlightKey = key; requestedAt.set(key, Date.now());
    serverRequest(selectedCoin, selectedRange)
      .catch(function () { return directRequest(selectedCoin, selectedRange); })
      .then(function (payload) {
        var prices = seriesForRange(payload.prices, selectedRange);
        if (prices.length < 2) throw new Error("empty market series");
        var record = { coin: selectedCoin, range: selectedRange, prices: prices, stale: payload.stale === true };
        cache.set(key, record); retries.set(key, record.stale ? (retries.get(key) || 0) + 1 : 0);
        if (key === currentKey()) {
          draw(record); state.textContent = record.stale ? "stale" : "live";
          if (record.stale) {
            var staleDelays = [5000, 15000, 30000];
            schedule(staleDelays[Math.min((retries.get(key) || 1) - 1, staleDelays.length - 1)], true);
          } else schedule(30000, false);
        }
      })
      .catch(function () {
        var fallback = cache.get(key); var step = retries.get(key) || 0; retries.set(key, step + 1);
        if (key === currentKey()) {
          if (fallback) { fallback.stale = true; draw(fallback); state.textContent = "stale"; }
          else { clearFor(selectedCoin, selectedRange); state.textContent = "retry"; quote.textContent = labels[selectedCoin] + " unavailable"; }
          var delays = [5000, 15000, 30000]; schedule(delays[Math.min(step, delays.length - 1)], true);
        }
      })
      .finally(function () {
        inFlightKey = "";
        if (queuedKey) { var next = queuedKey; queuedKey = ""; if (next === currentKey()) load(true); }
      });
  }

  pane.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.coin) coin = button.dataset.coin;
    if (button.dataset.range) range = button.dataset.range;
    paintSelection();
    var cached = cache.get(currentKey());
    if (cached) { draw(cached); state.textContent = cached.stale ? "stale" : "live"; }
    else clearFor(coin, range);
    load(false);
  });
  window.addEventListener("resize", function () { if (displayed && pairKey(displayed.coin, displayed.range) === currentKey()) draw(displayed); else resizeCanvas(); }, { passive: true });
  paintSelection(); clearFor(coin, range); load(false);
})();
