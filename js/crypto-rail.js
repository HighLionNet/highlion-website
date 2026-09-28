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
  var displayed = null;
  var inFlight = false;
  var retryStep = 0;
  var pollTimer = 0;
  var quote = document.getElementById("cryptoQuote");
  var state = document.getElementById("cryptoState");
  var highNode = document.getElementById("cryptoHigh");
  var lowNode = document.getElementById("cryptoLow");
  var rangeNode = document.getElementById("cryptoRange");
  var labels = {
    bitcoin: "BTC",
    "bitcoin-cash": "BCH",
    monero: "XMR",
    ethereum: "ETH",
    solana: "SOL",
    litecoin: "LTC",
    dogecoin: "DOGE",
    cardano: "ADA"
  };
  var days = { "1h": 1, "24h": 1, "7d": 7, "30d": 30 };

  function key() { return coin + ":" + range; }

  function seriesForRange(prices, selectedRange) {
    if (selectedRange !== "1h") return prices;
    var cutoff = Date.now() - 60 * 60 * 1000;
    return prices.filter(function (point) { return Number(point[0]) >= cutoff; });
  }

  function decimals(value) {
    if (value >= 1000) return 0;
    if (value >= 1) return 2;
    if (value >= 0.01) return 4;
    return 6;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: decimals(value)
    }).format(value);
  }

  function axisMoney(value) {
    if (value >= 1000000) return "$" + (value / 1000000).toFixed(1) + "m";
    if (value >= 1000) return "$" + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "k";
    return "$" + value.toFixed(decimals(value));
  }

  function draw(record) {
    if (!record || !record.prices || record.prices.length < 2) return;
    displayed = record;
    var prices = record.prices;
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    var values = prices.map(function (point) { return Number(point[1]); }).filter(Number.isFinite);
    if (values.length < 2) return;
    var minimum = Math.min.apply(null, values);
    var maximum = Math.max.apply(null, values);
    var rawSpan = Math.max(maximum - minimum, maximum * 0.001, 0.000001);
    var scaleMin = minimum - rawSpan * 0.06;
    var scaleMax = maximum + rawSpan * 0.06;
    var span = scaleMax - scaleMin;
    var left = 58;
    var right = 8;
    var top = 8;
    var bottom = 10;
    var plotWidth = Math.max(1, width - left - right);
    var plotHeight = Math.max(1, height - top - bottom);
    function x(index) { return left + index / (values.length - 1) * plotWidth; }
    function y(value) { return top + (scaleMax - value) / span * plotHeight; }

    context.font = '10px "JetBrains Mono", ui-monospace, monospace';
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (var tick = 0; tick < 4; tick += 1) {
      var ratio = tick / 3;
      var value = scaleMax - span * ratio;
      var tickY = top + plotHeight * ratio;
      context.beginPath();
      context.moveTo(left, tickY);
      context.lineTo(width - right, tickY);
      context.strokeStyle = "rgba(255,255,255,0.08)";
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = "rgba(167,183,214,0.78)";
      context.fillText(axisMoney(value), left - 6, tickY);
    }

    context.beginPath();
    values.forEach(function (value, index) {
      if (index === 0) context.moveTo(x(index), y(value));
      else context.lineTo(x(index), y(value));
    });
    context.lineTo(width - right, top + plotHeight);
    context.lineTo(left, top + plotHeight);
    context.closePath();
    var fill = context.createLinearGradient(0, top, 0, height - bottom);
    fill.addColorStop(0, "rgba(102,247,255,0.16)");
    fill.addColorStop(1, "rgba(102,247,255,0.01)");
    context.fillStyle = fill;
    context.fill();

    context.beginPath();
    values.forEach(function (value, index) {
      if (index === 0) context.moveTo(x(index), y(value));
      else context.lineTo(x(index), y(value));
    });
    context.strokeStyle = "rgba(102,247,255,0.88)";
    context.lineWidth = 1;
    context.stroke();

    var current = values[values.length - 1];
    context.beginPath();
    context.arc(width - right, y(current), 3, 0, Math.PI * 2);
    context.fillStyle = "#66f7ff";
    context.fill();

    var first = values[0];
    var change = first ? (current - first) / first * 100 : 0;
    quote.textContent = labels[record.coin] + " " + money(current) + " " + (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    quote.dataset.trend = change >= 0 ? "up" : "down";
    highNode.textContent = money(maximum);
    lowNode.textContent = money(minimum);
    rangeNode.textContent = record.range.toUpperCase();
    canvas.setAttribute("aria-label", labels[record.coin] + " " + record.range.toUpperCase() + " price chart");
  }

  function paintSelection() {
    pane.querySelectorAll("[data-coin]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.coin === coin ? "true" : "false");
    });
    pane.querySelectorAll("[data-range]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.range === range ? "true" : "false");
    });
  }

  function schedule(milliseconds, force) {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(function () { load(force); }, milliseconds);
  }

  function load(force) {
    if (inFlight) return;
    var requestedCoin = coin;
    var requestedRange = range;
    var cacheKey = key();
    var cached = cache.get(cacheKey);
    if (!cached && !displayed) {
      state.textContent = "loading";
      quote.textContent = "loading";
      delete quote.dataset.trend;
    }
    var requestedAt = lastRequest.get(cacheKey) || 0;
    if (!force && requestedAt && Date.now() - requestedAt < 30000) {
      state.textContent = cached && !cached.stale ? "live" : "stale";
      if (cached) draw(cached);
      schedule(30000 - (Date.now() - requestedAt), false);
      return;
    }

    inFlight = true;
    lastRequest.set(cacheKey, Date.now());
    var url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(requestedCoin) +
      "/market_chart?vs_currency=usd&days=" + days[requestedRange];
    fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("market unavailable");
        return response.json();
      })
      .then(function (payload) {
        var prices = seriesForRange(Array.isArray(payload.prices) ? payload.prices : [], requestedRange);
        if (prices.length < 2) throw new Error("empty market series");
        var record = { coin: requestedCoin, range: requestedRange, prices: prices, stale: false };
        cache.set(cacheKey, record);
        retryStep = 0;
        state.textContent = "live";
        if (requestedCoin === coin && requestedRange === range) draw(record);
        schedule(30000, false);
      })
      .catch(function () {
        var fallback = cache.get(cacheKey);
        state.textContent = "stale";
        if (fallback) {
          fallback.stale = true;
          if (requestedCoin === coin && requestedRange === range) draw(fallback);
        } else if (!displayed) {
          quote.textContent = labels[requestedCoin] + " unavailable";
        }
        var retryDelays = [5000, 15000, 30000];
        schedule(retryDelays[Math.min(retryStep, retryDelays.length - 1)], true);
        retryStep += 1;
      })
      .finally(function () {
        inFlight = false;
        if (requestedCoin !== coin || requestedRange !== range) schedule(0, false);
      });
  }

  pane.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.coin) coin = button.dataset.coin;
    if (button.dataset.range) range = button.dataset.range;
    retryStep = 0;
    paintSelection();
    load(false);
  });
  window.addEventListener("resize", function () {
    if (displayed) draw(displayed);
  }, { passive: true });
  paintSelection();
  load(false);
})();
