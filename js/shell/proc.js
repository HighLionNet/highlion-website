(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function ProcessTable(config, started) {
    this.config = config || {};
    this.started = started || Date.now();
    this.processes = (this.config.processes || []).map(function (row) { return Object.assign({ state: "running" }, row); });
    this.nextPid = this.processes.reduce(function (highest, row) { return Math.max(highest, Number(row.pid) || 0); }, 1337) + 1;
  }

  ProcessTable.prototype.spawn = function (command) {
    var session = this.processes.find(function (item) { return item.command === "zsh" && item.tty === "pts/0"; });
    var row = { pid: this.nextPid++, user: session ? session.user : "kali", tty: "pts/0", command: command, cpu: "0.0", mem: "0.1", state: "running" };
    this.processes.push(row);
    return row.pid;
  };

  ProcessTable.prototype.setSessionUser = function (user) {
    this.processes.forEach(function (row) {
      if (row.tty === "pts/0" && (row.command === "zsh" || row.command === "qterminal")) row.user = user;
    });
  };

  ProcessTable.prototype.kill = function (pid, user) {
    var row = this.processes.find(function (item) { return Number(item.pid) === Number(pid); });
    if (!row) return { ok: false, message: "No such process" };
    if (user !== "root" && row.user !== user) return { ok: false, message: "Operation not permitted" };
    row.state = "stopped";
    return { ok: true };
  };

  ProcessTable.prototype.killByName = function (name, user) {
    var matches = this.processes.filter(function (row) {
      return row.state === "running" && row.command.split(/\s+/)[0] === name;
    });
    var killed = 0;
    matches.forEach(function (row) {
      var state = this.kill(row.pid, user);
      if (state.ok) killed += 1;
    }, this);
    return { ok: killed > 0, count: killed, message: matches.length ? "Operation not permitted" : "No such process" };
  };

  ProcessTable.prototype.pidof = function (name) {
    return this.processes.filter(function (row) { return row.state === "running" && row.command.split(/\s+/)[0] === name; }).map(function (row) { return row.pid; });
  };

  ProcessTable.prototype.ps = function (aux) {
    var rows = this.processes.filter(function (row) { return row.state === "running"; });
    if (!aux) return ["  PID TTY          TIME CMD"].concat(rows.map(function (row) {
      return String(row.pid).padStart(5, " ") + " " + String(row.tty || "?").padEnd(8, " ") + " 00:00:00 " + row.command;
    })).join("\n") + "\n";
    return ["USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND"].concat(rows.map(function (row) {
      return String(row.user).padEnd(11, " ") + String(row.pid).padStart(5, " ") + " " + String(row.cpu).padStart(4, " ") + " " + String(row.mem).padStart(4, " ") + "  20480  4096 " + String(row.tty || "?").padEnd(8, " ") + " S    05:20   0:00 " + row.command;
    })).join("\n") + "\n";
  };

  ProcessTable.prototype.uptimeSeconds = function () {
    return Math.max(1, Math.floor((Date.now() - this.started) / 1000));
  };

  ProcessTable.prototype.readProc = function (path, machine) {
    var seconds = this.uptimeSeconds();
    if (path === "/proc/version") return String(this.config.version || "Linux highlion 6.12.0-hl8 #1 SMP") + "\n";
    if (path === "/proc/cpuinfo") {
      var rows = [];
      for (var index = 0; index < Number(this.config.cores || 4); index += 1) {
        rows.push("processor\t: " + index + "\nvendor_id\t: HighLion\nmodel name\t: " + (this.config.cpuModel || "HighLion Virtual CPU") + "\ncpu MHz\t: 2400.000\n");
      }
      return rows.join("\n");
    }
    if (path === "/proc/meminfo") return "MemTotal:       " + Number(this.config.memTotalKb || 2048000) + " kB\nMemFree:         987312 kB\nMemAvailable:   1512048 kB\nBuffers:           42120 kB\nCached:           482616 kB\n";
    if (path === "/proc/loadavg") return "0.04 0.02 0.01 1/96 1337\n";
    if (path === "/proc/uptime") return seconds.toFixed(2) + " " + (seconds * 0.91).toFixed(2) + "\n";
    if (path === "/proc/mounts") return machine.mountText(true);
    if (path === "/proc/self/cwd") return machine.cwd + "\n";
    if (path === "/proc/self/environ") return Object.keys(machine.env).sort().map(function (name) { return name + "=" + machine.env[name]; }).join("\n") + "\n";
    if (path === "/proc/self/status") return "Name:\tzsh\nUmask:\t" + machine.umask + "\nState:\tR (running)\nTgid:\t1337\nPid:\t1337\nPPid:\t1336\nUid:\t" + machine.identity.uid + "\t" + machine.identity.uid + "\t" + machine.identity.uid + "\t" + machine.identity.uid + "\nGid:\t" + machine.identity.gid + "\t" + machine.identity.gid + "\t" + machine.identity.gid + "\t" + machine.identity.gid + "\nThreads:\t1\n";
    if (path === "/proc/net/dev") {
      var tick = seconds * 193;
      return "Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n"
        + (this.config.interfaces || []).map(function (iface, index) {
          var rx = Number(iface.rx || 0) + tick * (index + 1);
          var tx = Number(iface.tx || 0) + Math.floor(tick * 0.62) * (index + 1);
          return String(iface.name).padStart(6, " ") + ": " + String(rx).padStart(8, " ") + " 1024 0 0 0 0 0 0 " + String(tx).padStart(8, " ") + " 768 0 0 0 0 0 0";
        }).join("\n") + "\n";
    }
    if (path === "/proc/net/tcp") return "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0A00080A:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 509 1 0000000000000000\n   1: 0A00080A:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000    33        0 412 1 0000000000000000\n   2: 0A00080A:01BB 00000000:0000 0A 00000000:00000000 00:00000000 00000000    33        0 413 1 0000000000000000\n";
    return null;
  };

  HL.ProcessTable = ProcessTable;
})(window);
