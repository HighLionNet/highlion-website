(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function sha1(value) {
    var text = unescape(encodeURIComponent(String(value)));
    var words = [];
    for (var index = 0; index < text.length; index += 1) words[index >> 2] = (words[index >> 2] || 0) | text.charCodeAt(index) << (24 - (index % 4) * 8);
    words[text.length >> 2] = (words[text.length >> 2] || 0) | 0x80 << (24 - (text.length % 4) * 8);
    words[((text.length + 8 >> 6) + 1) * 16 - 1] = text.length * 8;
    var h = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
    function rol(number, bits) { return number << bits | number >>> 32 - bits; }
    for (var block = 0; block < words.length; block += 16) {
      var w = new Array(80);
      for (index = 0; index < 80; index += 1) w[index] = index < 16 ? words[block + index] | 0 : rol(w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16], 1);
      var a = h[0]; var b = h[1]; var c = h[2]; var d = h[3]; var e = h[4];
      for (index = 0; index < 80; index += 1) {
        var f; var k;
        if (index < 20) { f = b & c | ~b & d; k = 0x5a827999; }
        else if (index < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (index < 60) { f = b & c | b & d | c & d; k = 0x8f1bbcdc | 0; }
        else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
        var temp = (rol(a, 5) + f + e + k + w[index]) | 0;
        e = d; d = c; c = rol(b, 30); b = a; a = temp;
      }
      h[0] = h[0] + a | 0; h[1] = h[1] + b | 0; h[2] = h[2] + c | 0; h[3] = h[3] + d | 0; h[4] = h[4] + e | 0;
    }
    return h.map(function (word) { return (word >>> 0).toString(16).padStart(8, "0"); }).join("");
  }

  function validIpv4(value) {
    var parts = String(value).split(".");
    return parts.length === 4 && parts.every(function (part) { return /^\d{1,3}$/.test(part) && Number(part) <= 255; });
  }

  function octets(ip) { return ip.split(".").map(Number); }

  function Network(config, packs) {
    this.config = config || {};
    this.hosts = {
      "localhost": "127.0.0.1", "highlion": "10.8.0.10", "highlion.net": "10.8.0.10",
      "www.highlion.net": "10.8.0.10", "gw.lab": "10.8.0.1", "east.lab": "10.8.12.10", "relay.lab": "10.8.12.20"
    };
    this.reverse = {
      "127.0.0.1": "localhost", "10.8.0.10": "highlion", "10.8.0.1": "gw.lab",
      "10.8.12.10": "east.lab", "10.8.12.20": "relay.lab"
    };
    this.packBanners = {};
    (packs || []).forEach(function (pack) {
      if (pack._error) return;
      Object.assign(this.hosts, pack.hosts || {});
      Object.assign(this.packBanners, pack.banners || {});
    }, this);
  }

  Network.prototype.seed = function (value) {
    return parseInt(sha1(String(value).toLowerCase()).slice(0, 8), 16) >>> 0;
  };

  Network.prototype.resolve = function (host) {
    var name = String(host || "").trim().toLowerCase().replace(/\.$/, "");
    if (validIpv4(name)) return name;
    if (this.hosts[name]) return this.hosts[name];
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(name)) return "";
    var digest = sha1(name);
    var first = 23 + parseInt(digest.slice(0, 2), 16) % 180;
    if ([10, 100, 127, 169, 172, 192].indexOf(first) !== -1 || first >= 224) first = 45;
    return [first, 1 + parseInt(digest.slice(2, 4), 16) % 254, 1 + parseInt(digest.slice(4, 6), 16) % 254, 1 + parseInt(digest.slice(6, 8), 16) % 254].join(".");
  };

  Network.prototype.classify = function (ip) {
    if (!validIpv4(ip) || ip === "0.0.0.0") return "invalid";
    if (ip === "255.255.255.255") return "broadcast";
    var row = octets(ip);
    if (row[0] === 127) return "loopback";
    if (row[0] >= 224 && row[0] <= 239) return "multicast";
    if (row[0] === 169 && row[1] === 254) return "linklocal";
    if (row[0] === 10 && row[1] === 8) return "lab";
    if (row[0] === 10 || (row[0] === 172 && row[1] >= 16 && row[1] <= 31) || (row[0] === 192 && row[1] === 168)) return "private";
    return "public";
  };

  Network.prototype.profile = function (target) {
    var name = String(target || "").toLowerCase();
    var address = this.resolve(name);
    var hostClass = this.classify(address);
    var seed = this.seed(name + "|" + address);
    var blocked = ["invalid", "multicast", "broadcast"].indexOf(hostClass) !== -1;
    var up = !blocked && (hostClass === "loopback" || hostClass === "lab" || seed % 17 !== 0);
    var loss = !up ? 100 : (hostClass === "private" || hostClass === "linklocal" ? seed % 21 : (hostClass === "public" ? seed % 9 : 0));
    var rtt = hostClass === "loopback" ? 0.03 : hostClass === "lab" ? 0.6 + seed % 35 / 10 : hostClass === "public" ? 18 + seed % 930 / 10 : 2 + seed % 280 / 10;
    return { input: name, name: this.reverse[address] || name, address: address, className: hostClass, seed: seed, up: up, loss: loss, rtt: rtt, ports: this.ports(name, address, hostClass, seed, up) };
  };

  Network.prototype.ports = function (name, address, hostClass, seed, up) {
    function record(port, state, service, version, banner) { return { port: port, state: state, service: service, version: version, banner: banner || "" }; }
    if (!up) return [record(22, "filtered", "ssh", "", ""), record(80, "filtered", "http", "", ""), record(443, "filtered", "https", "", "")];
    var known = {
      "10.8.0.10": [record(22, "open", "ssh", "OpenSSH 9.9p1 Debian 3", "SSH-2.0-OpenSSH_9.9p1 Debian-3"), record(80, "open", "http", "nginx 1.28.0", "HTTP/1.1 301 Moved Permanently"), record(443, "open", "https", "nginx 1.28.0", "HTTP/1.1 200 OK")],
      "10.8.0.1": [record(22, "open", "ssh", "OpenSSH 9.7", "SSH-2.0-OpenSSH_9.7"), record(53, "open", "domain", "dnsmasq 2.90", ""), record(80, "open", "http", "lighttpd 1.4", "HTTP/1.1 200 OK")],
      "10.8.12.10": [record(22, "open", "ssh", "OpenSSH 9.6p1", "SSH-2.0-OpenSSH_9.6p1"), record(80, "open", "http", "Apache httpd 2.4.62", "HTTP/1.1 200 OK"), record(445, "filtered", "microsoft-ds", "", "")],
      "10.8.12.20": [record(22, "open", "ssh", "OpenSSH 9.8p1", "SSH-2.0-OpenSSH_9.8p1"), record(5900, "open", "vnc", "VNC protocol 3.8", "RFB 003.008")]
    };
    if (known[address]) return known[address];
    if (hostClass === "loopback") return known["10.8.0.10"];
    if (hostClass === "public") {
      var web = [record(80, "open", "http", seed % 2 ? "nginx" : "Apache httpd", "HTTP/1.1 200 OK"), record(443, "open", "https", seed % 2 ? "nginx" : "cloud edge", "HTTP/1.1 200 OK")];
      if (seed % 4 === 0) web.push(record(8080, "open", "http-proxy", "Jetty 11", "HTTP/1.1 302 Found"));
      return web;
    }
    var privatePorts = [record(22, seed % 5 ? "open" : "closed", "ssh", "OpenSSH 9.6p1", "SSH-2.0-OpenSSH_9.6p1")];
    if (seed % 3 !== 0) privatePorts.push(record(80, "open", "http", "nginx", "HTTP/1.1 200 OK"));
    if (seed % 7 === 0) privatePorts.push(record(445, "open", "microsoft-ds", "Samba smbd 4.20", ""));
    return privatePorts;
  };

  Network.prototype.port = function (target, port) {
    var profile = this.profile(target);
    return profile.ports.find(function (row) { return Number(row.port) === Number(port); }) || { port: Number(port), state: profile.up ? "closed" : "filtered", service: "unknown", version: "", banner: "" };
  };

  Network.prototype.banner = function (host, port) {
    var address = this.resolve(host);
    var custom = this.packBanners[String(host).toLowerCase() + ":" + port] || this.packBanners[address + ":" + port];
    if (custom) return custom;
    var row = this.port(host, port);
    return row.state === "open" ? row.banner : "";
  };

  Network.prototype.http = function (url) {
    var parsed;
    try { parsed = new URL(url); } catch (error) { return { error: "malformed" }; }
    var profile = this.profile(parsed.hostname);
    if (!profile.up) return { error: "timeout", profile: profile };
    var seed = this.seed(parsed.hostname + parsed.pathname);
    var codes = [200, 200, 200, 200, 301, 302, 401, 403, 404];
    var code = codes[seed % codes.length];
    var labels = { 200: "OK", 301: "Moved Permanently", 302: "Found", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" };
    var location = code === 301 || code === 302 ? parsed.protocol + "//" + parsed.hostname + "/" : "";
    var body = code === 200 ? "<!doctype html>\n<title>" + parsed.hostname + "</title>\n<h1>It works</h1>\n<p>simulated host " + profile.address + "</p>\n" : code + " " + labels[code] + "\n";
    return { code: code, label: labels[code], location: location, body: body.slice(0, 8192), profile: profile, server: seed % 2 ? "nginx" : "Apache" };
  };

  Network.prototype.trace = function (target) {
    var profile = this.profile(target);
    if (!profile.address) return [];
    var hops = [{ address: "10.8.0.1", name: "gw.lab", rtt: 0.7 }];
    var count = profile.className === "lab" ? 2 : 3 + profile.seed % 6;
    for (var index = 1; index < count - 1; index += 1) {
      var octet = 1 + (profile.seed >>> index * 3) % 253;
      hops.push({ address: "100.64." + index + "." + octet, name: "edge-" + index + ".sim", rtt: 4 + index * 7 + profile.seed % 13 / 10 });
    }
    hops.push({ address: profile.address, name: profile.name || target, rtt: profile.rtt });
    return hops;
  };

  Network.prototype.ipAddress = function () {
    var lines = [];
    (this.config.interfaces || []).forEach(function (iface, index) {
      lines.push((index + 1) + ": " + iface.name + ": <BROADCAST,MULTICAST," + iface.state + "> mtu " + (iface.name === "lo" ? "65536" : "1500") + " state " + iface.state);
      lines.push("    link/ether " + iface.mac + " brd ff:ff:ff:ff:ff:ff");
      lines.push("    inet " + iface.address + " scope " + (iface.name === "lo" ? "host" : "global") + " " + iface.name);
    });
    return lines.join("\n") + "\n";
  };

  Network.prototype.routes = function () {
    return "default via 10.8.0.1 dev eth0 proto static\n10.0.0.0/8 via 10.8.0.1 dev eth0\n172.16.0.0/12 via 10.8.0.1 dev eth0\n192.168.0.0/16 via 10.8.0.1 dev eth0\n10.8.0.0/24 dev eth0 proto kernel scope link src 10.8.0.10\n";
  };

  Network.prototype.sockets = function (netstat) {
    var heading = netstat ? "Proto Recv-Q Send-Q Local Address           Foreign Address         State" : "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port";
    var rows = (this.config.sockets || []).map(function (row) {
      if (netstat) return String(row.proto).padEnd(5, " ") + " 0      0      " + row.address + ":" + row.port + "          0.0.0.0:*               " + row.state;
      return String(row.proto).padEnd(5, " ") + " " + String(row.state).padEnd(6, " ") + " 0      128    " + row.address + ":" + row.port + " 0.0.0.0:*";
    });
    rows.push(netstat ? "unix  2      [ ACC ]     STREAM     LISTENING     /run/php/php-fpm.sock" : "u_str LISTEN 0      128    /run/php/php-fpm.sock");
    return [heading].concat(rows).join("\n") + "\n";
  };

  Network.prototype.sha1 = sha1;
  HL.Network = Network;
})(window);
