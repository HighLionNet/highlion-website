(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function Network(config, packs) {
    this.config = config || {};
    this.hosts = {
      "localhost": "127.0.0.1", "highlion": "10.8.0.10", "highlion.net": "10.8.0.10",
      "www.highlion.net": "10.8.0.10", "127.0.0.1": "127.0.0.1", "10.8.0.1": "10.8.0.1",
      "10.8.12.10": "10.8.12.10", "10.8.12.20": "10.8.12.20"
    };
    this.banners = {};
    (packs || []).forEach(function (pack) {
      if (pack._error) return;
      Object.assign(this.hosts, pack.hosts || {});
      Object.assign(this.banners, pack.banners || {});
    }, this);
  }

  Network.prototype.resolve = function (host) {
    return this.hosts[String(host).toLowerCase()] || "";
  };

  Network.prototype.ipAddress = function () {
    var interfaces = this.config.interfaces || [];
    var lines = [];
    interfaces.forEach(function (iface, index) {
      lines.push((index + 1) + ": " + iface.name + ": <BROADCAST,MULTICAST," + iface.state + "> mtu " + (iface.name === "lo" ? "65536" : "1500") + " state " + iface.state);
      lines.push("    link/ether " + iface.mac + " brd ff:ff:ff:ff:ff:ff");
      lines.push("    inet " + iface.address + " scope " + (iface.name === "lo" ? "host" : "global") + " " + iface.name);
    });
    return lines.join("\n") + "\n";
  };

  Network.prototype.sockets = function () {
    return ["Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port"].concat((this.config.sockets || []).map(function (row) {
      return String(row.proto).padEnd(5, " ") + " " + String(row.state).padEnd(6, " ") + " 0      128    " + row.address + ":" + row.port + " 0.0.0.0:*";
    })).join("\n") + "\n";
  };

  Network.prototype.banner = function (host, port) {
    var name = String(host).toLowerCase();
    var address = this.resolve(name);
    if (!address) return "";
    return this.banners[name + ":" + port] || this.banners[address + ":" + port] || (Number(port) === 22 ? "SSH-2.0-OpenSSH_9.8 HighLion" : "HighLion service");
  };

  HL.Network = Network;
})(window);
