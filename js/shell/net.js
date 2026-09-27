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

  function octets(ip) { return String(ip).split(".").map(Number); }

  function service(port, state, name, version, banner, protocol) {
    return {
      port: Number(port), protocol: protocol || "tcp", state: state || "open",
      service: name || "unknown", version: version || "", banner: banner || ""
    };
  }

  function Network(config, packs) {
    this.config = config || {};
    this.hosts = {
      "localhost": "127.0.0.1",
      "highlion": "10.8.0.10",
      "fw01.osprey.corp": "10.8.0.1",
      "fw01": "10.8.0.1",
      "intranet.osprey.corp": "10.8.0.21",
      "intranet": "10.8.0.21",
      "web01": "10.8.0.21",
      "files01.osprey.corp": "10.8.0.34",
      "files01": "10.8.0.34",
      "fs01": "10.8.0.34"
    };
    this.reverse = {
      "127.0.0.1": "localhost",
      "10.8.0.1": "fw01.osprey.corp",
      "10.8.0.10": "highlion",
      "10.8.0.21": "intranet.osprey.corp",
      "10.8.0.34": "files01.osprey.corp"
    };
    this.world = {
      "10.8.0.1": {
        up: true, role: "office edge", mac: "02:0a:8e:00:00:01", rtt: 0.5, jitter: 0.2, loss: 0,
        services: [
          service(22, "open", "ssh", "OpenSSH 8.9p1 Debian 3 (protocol 2.0)", "SSH-2.0-OpenSSH_8.9p1 Debian-3"),
          service(53, "open", "domain", "unbound", "", "udp"),
          service(80, "open", "http", "lighttpd 1.4.59", "HTTP/1.1 200 OK")
        ],
        users: ["admin"], fileshares: [], routes: ["10.8.0.0/24"]
      },
      "10.8.0.10": {
        up: true, role: "contractor laptop", mac: "02:0a:8e:00:00:0a", rtt: 0.35, jitter: 0.1, loss: 0,
        services: [
          service(22, "open", "ssh", "OpenSSH 9.9p1 Debian 3 (protocol 2.0)", "SSH-2.0-OpenSSH_9.9p1 Debian-3"),
          service(80, "closed", "http"), service(443, "closed", "https")
        ],
        users: ["kali"], fileshares: [], routes: ["10.8.0.0/24"]
      },
      "10.8.0.21": {
        up: true, role: "internal staff portal", mac: "02:0a:8e:00:00:15", rtt: 0.9, jitter: 0.3, loss: 0,
        services: [
          service(22, "closed", "ssh"),
          service(80, "open", "http", "Apache httpd 2.4.58 (Debian)", "HTTP/1.1 200 OK"),
          service(443, "closed", "https")
        ],
        users: ["www-data"], fileshares: [], routes: ["10.8.0.0/24"]
      },
      "10.8.0.34": {
        up: true, role: "office file server", mac: "02:0a:8e:00:00:22", rtt: 1.2, jitter: 0.3, loss: 0,
        services: [
          service(22, "open", "ssh", "OpenSSH 8.9p1 Debian 3 (protocol 2.0)", "SSH-2.0-OpenSSH_8.9p1 Debian-3"),
          service(80, "closed", "http"),
          service(139, "open", "netbios-ssn", "Samba smbd 4.19.5"),
          service(445, "open", "microsoft-ds", "Samba smbd 4.19.5")
        ],
        users: ["backup", "smbguest"], fileshares: ["public", "transfer", "finance", "admin$"], routes: ["10.8.0.0/24"]
      }
    };
    this.shares = {
      public: { guest: true, files: { "welcome.txt": "Drop files for reception here.\n" } },
      transfer: { guest: true, files: { "1042-vpn.txt": "Ticket 1042: transfer is readable without credentials.\nHL{east-node-01}\nHL8{east-node-01}\n" } },
      finance: { guest: false, error: "NT_STATUS_ACCESS_DENIED" },
      "admin$": { guest: false, error: "NT_STATUS_ACCESS_DENIED" }
    };
    this.firewall = {};
    this.neighbors = { "10.8.0.1": { mac: "02:0a:8e:00:00:01", seen: Date.now() } };
    this.packBanners = {};
    (packs || []).forEach(function (pack) {
      if (!pack._error) Object.assign(this.packBanners, pack.banners || {});
    }, this);
  }

  Network.prototype.seed = function (value) {
    return parseInt(sha1(String(value).toLowerCase()).slice(0, 8), 16) >>> 0;
  };

  Network.prototype.resolve = function (host) {
    var name = String(host || "").trim().toLowerCase().replace(/\.$/, "");
    if (validIpv4(name)) return name;
    return this.hosts[name] || "";
  };

  Network.prototype.classify = function (ip) {
    if (!validIpv4(ip)) return "unreachable";
    var row = octets(ip);
    if (row[0] === 127) return "loopback";
    if (row[0] === 10 && row[1] === 8 && row[2] === 0 && (row[3] === 0 || row[3] === 255)) return "broadcast";
    if (row[0] === 10 && row[1] === 8 && row[2] === 0) return "lan";
    return "unreachable";
  };

  Network.prototype.profile = function (target) {
    var input = String(target || "").trim().toLowerCase().replace(/\.$/, "");
    var address = this.resolve(input);
    var className = this.classify(address);
    var source = this.world[address];
    if (className === "loopback") source = this.world["10.8.0.10"];
    return {
      input: input,
      name: this.reverse[address] || input,
      address: address,
      className: className,
      seed: this.seed(input + "|" + address),
      up: Boolean(source && source.up),
      loss: source ? source.loss : 100,
      rtt: className === "loopback" ? 0.04 : (source ? source.rtt : 0),
      jitter: className === "loopback" ? 0.01 : (source ? source.jitter : 0),
      mac: className === "loopback" ? "00:00:00:00:00:00" : (source ? source.mac : ""),
      ports: this.ports(address, className),
      services: source ? source.services.slice() : [],
      users: source ? source.users.slice() : [],
      fileshares: source ? source.fileshares.slice() : [],
      routes: source && source.routes ? source.routes.slice() : []
    };
  };

  Network.prototype.ports = function (address, className) {
    var source = this.world[address];
    if (className === "loopback") source = this.world["10.8.0.10"];
    if (!source) return [];
    return source.services.filter(function (row) { return row.protocol === "tcp"; }).map(function (row) {
      var copy = Object.assign({}, row);
      if (this.firewall[address + ":" + copy.port]) copy.state = "filtered";
      return copy;
    }, this);
  };

  Network.prototype.touch = function (target) {
    var address = this.resolve(target);
    var source = this.world[address];
    if (source && address !== "10.8.0.10") this.neighbors[address] = { mac: source.mac, seen: Date.now() };
  };

  Network.prototype.port = function (target, port, protocol) {
    var profile = this.profile(target);
    var wanted = protocol || "tcp";
    var source = profile.className === "loopback" ? this.world["10.8.0.10"] : this.world[profile.address];
    if (!source) return { port: Number(port), protocol: wanted, state: "unreachable", service: "unknown", version: "", banner: "" };
    var row = source.services.find(function (entry) { return entry.protocol === wanted && Number(entry.port) === Number(port); });
    var copy = row ? Object.assign({}, row) : service(port, "closed", "unknown", "", "", wanted);
    if (this.firewall[profile.address + ":" + Number(port)]) copy.state = "filtered";
    return copy;
  };

  Network.prototype.setFirewall = function (target, port, blocked) {
    var address = this.resolve(target);
    if (!validIpv4(address)) return false;
    if (this.classify(address) !== "lan") return true;
    var key = address + ":" + Number(port);
    if (blocked) this.firewall[key] = true;
    else delete this.firewall[key];
    return true;
  };

  Network.prototype.flushFirewall = function () { this.firewall = {}; };

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
    if (!profile.address || profile.className === "unreachable" || profile.className === "broadcast") return { error: "network", profile: profile };
    if (!profile.up) return { error: "noroute", profile: profile };
    var port = parsed.port ? Number(parsed.port) : (parsed.protocol === "https:" ? 443 : 80);
    var endpoint = this.port(parsed.hostname, port);
    if (endpoint.state === "filtered") return { error: "timeout", profile: profile, port: port };
    if (endpoint.state !== "open") return { error: "refused", profile: profile, port: port };
    this.touch(profile.address);

    var path = parsed.pathname || "/";
    var code = 404;
    var body = "404 Not Found\n";
    var server = endpoint.version || "http";
    if (profile.address === "10.8.0.1") {
      if (path === "/") {
        code = 200;
        body = "<!doctype html>\n<title>Osprey & Hale — edge</title>\n<h1>Osprey & Hale — edge</h1>\n<p>Office gateway. WAN unavailable.</p>\n";
      } else if (path === "/status") {
        code = 200;
        body = "<!doctype html>\n<title>fw01 status</title>\n<h1>fw01</h1>\n<p>uptime: 37 days</p>\n<p>wan: down</p>\n<!-- ack HL8{relay-ack} -->\n";
      }
    } else if (profile.address === "10.8.0.21") {
      if (path === "/") {
        code = 200;
        body = "<!doctype html>\n<title>Osprey & Hale Intranet</title>\n<h1>Osprey & Hale Intranet</h1>\n<nav><a href=\"/staff\">Staff</a> <a href=\"/helpdesk\">Helpdesk</a> <a href=\"/robots.txt\">robots.txt</a></nav>\n";
      } else if (path === "/robots.txt") {
        code = 200; body = "User-agent: *\nDisallow: /helpdesk/archive/\n";
      } else if (path === "/staff") {
        code = 200; body = "<!doctype html>\n<title>Staff directory</title>\n<h1>Staff</h1>\n<ul><li>Mara — desk 12</li><li>Jon — desk 18</li><li>Priya — desk 24</li></ul>\n";
      } else if (path === "/helpdesk") {
        code = 200; body = "<!doctype html>\n<title>Helpdesk</title>\n<h1>Tickets</h1>\n<p>1042 — VPN token reset</p>\n<p>1047 — printer queue</p>\n";
      } else if (path === "/helpdesk/archive/") {
        code = 403; body = "403 Forbidden\n";
      } else if (path === "/helpdesk/archive/1042.txt") {
        code = 200;
        body = "Ticket 1042 — VPN token reset\nThe fileserver share 'transfer' is world-readable.\nEast node refs: HL{east-node-01} HL8{east-node-01}\n";
      } else if (path === "/server-status") {
        code = 403; body = "403 Forbidden\n";
      }
    }
    var labels = { 200: "OK", 403: "Forbidden", 404: "Not Found" };
    return { code: code, label: labels[code], location: "", body: body, profile: profile, server: server, port: port };
  };

  Network.prototype.trace = function (target) {
    var profile = this.profile(target);
    if (!profile.address) return [];
    if (profile.className === "unreachable" || profile.className === "broadcast") {
      return [{ address: "10.8.0.1", name: "fw01.osprey.corp", rtt: 0.5 }, { unreachable: true }];
    }
    if (!profile.up) return [{ address: "10.8.0.1", name: "fw01.osprey.corp", rtt: 0.5 }, { unreachable: true }];
    this.touch(profile.address);
    return [{ address: profile.address, name: profile.name, rtt: profile.rtt }];
  };

  Network.prototype.ipAddress = function () {
    return "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n"
      + "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n"
      + "    inet 127.0.0.1/8 scope host lo\n"
      + "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n"
      + "    link/ether 02:0a:8e:00:00:0a brd ff:ff:ff:ff:ff:ff\n"
      + "    inet 10.8.0.10/24 scope global eth0\n";
  };

  Network.prototype.ifconfig = function () {
    return "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n"
      + "        inet 10.8.0.10  netmask 255.255.255.0  broadcast 10.8.0.255\n"
      + "        ether 02:0a:8e:00:00:0a\n\n"
      + "lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n"
      + "        inet 127.0.0.1  netmask 255.0.0.0\n"
      + "        loop  00:00:00:00:00:00\n";
  };

  Network.prototype.routes = function () {
    return "default via 10.8.0.1 dev eth0 proto static metric 100\n"
      + "10.8.0.0/24 dev eth0 proto kernel scope link src 10.8.0.10\n";
  };

  Network.prototype.routeTable = function () {
    return "Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\n"
      + "0.0.0.0         10.8.0.1        0.0.0.0         UG    100    0        0 eth0\n"
      + "10.8.0.0        0.0.0.0         255.255.255.0   U     0      0        0 eth0\n";
  };

  Network.prototype.neighborRows = function () {
    var now = Date.now();
    return Object.keys(this.neighbors).sort(function (left, right) { return octets(left)[3] - octets(right)[3]; }).map(function (address) {
      var row = this.neighbors[address];
      return { address: address, mac: row.mac, state: now - row.seen > 30000 ? "STALE" : "REACHABLE" };
    }, this);
  };

  Network.prototype.neighborText = function (style) {
    var rows = this.neighborRows();
    if (style === "arp") return rows.map(function (row) { return "? (" + row.address + ") at " + row.mac + " [ether] on eth0"; }).join("\n") + "\n";
    return rows.map(function (row) { return row.address + " dev eth0 lladdr " + row.mac + " " + row.state; }).join("\n") + "\n";
  };

  Network.prototype.procArp = function () {
    return "IP address       HW type     Flags       HW address            Mask     Device\n"
      + this.neighborRows().map(function (row) { return row.address.padEnd(16, " ") + " 0x1         0x2         " + row.mac + "     *        eth0"; }).join("\n") + "\n";
  };

  Network.prototype.procRoute = function () {
    return "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\n"
      + "eth0\t00000000\t0100080A\t0003\t0\t0\t100\t00000000\t0\t0\t0\n"
      + "eth0\t0000080A\t00000000\t0001\t0\t0\t0\t00FFFFFF\t0\t0\t0\n";
  };

  Network.prototype.procTcp = function () {
    return "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"
      + "   0: 0A00080A:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 509 1 0000000000000000\n";
  };

  Network.prototype.sockets = function (netstat) {
    var heading = netstat ? "Proto Recv-Q Send-Q Local Address           Foreign Address         State" : "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port";
    var row = netstat ? "tcp   0      0      10.8.0.10:22          0.0.0.0:*               LISTEN" : "tcp   LISTEN 0      128    10.8.0.10:22 0.0.0.0:*";
    return heading + "\n" + row + "\n";
  };

  Network.prototype.liveProfiles = function () {
    return ["10.8.0.1", "10.8.0.10", "10.8.0.21", "10.8.0.34"].map(function (address) { return this.profile(address); }, this);
  };

  Network.prototype.sha1 = sha1;
  HL.Network = Network;
})(window);
