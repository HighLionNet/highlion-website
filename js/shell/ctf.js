(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};

  function ChallengeController(machine) {
    this.machine = machine;
    this.flags = [];
    this.prizes = [];
    (machine.packs || []).forEach(function (pack) {
      if (pack._error) return;
      (pack.flags || []).forEach(function (flag) { this.flags.push(Object.assign({ pack: pack.id }, flag)); }, this);
      (pack.prizes || []).forEach(function (prize) { this.prizes.push(Object.assign({ pack: pack.id }, prize)); }, this);
    }, this);
    this.prizes.sort(function (left, right) { return Number(left.count) - Number(right.count); });
  }

  ChallengeController.prototype.find = function (value) {
    var candidate = String(value || "").trim();
    return this.flags.find(function (row) {
      var values = Array.isArray(row.flag) ? row.flag : [row.flag];
      return values.indexOf(candidate) !== -1;
    }) || null;
  };

  ChallengeController.prototype.isClaimed = function (id) {
    return this.machine.claimed.indexOf(id) !== -1;
  };

  ChallengeController.prototype.postClaim = function (flag) {
    fetch("/api/ctf.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag: flag, ts: Date.now() })
    }).catch(function () {});
  };

  ChallengeController.prototype.claim = function (value) {
    var row = this.find(value);
    if (!row) {
      if (root.HighLionSfx) root.HighLionSfx.error();
      return { status: 1, stdout: "", stderr: "claim: flag not recognized\n" };
    }
    if (this.isClaimed(row.id)) return { status: 0, stdout: "already claimed: " + row.id + "\n", stderr: "" };
    this.machine.claimed.push(row.id);
    var trophy = "/home/kali/.trophies/" + row.id + ".flag";
    try { this.machine.fs.writeFile(trophy, String(value).trim() + "\n", "/", false, false); } catch (error) {}
    if (row.id === "notice") {
      this.machine.fs.writeFile("/home/kali/mail/draft.txt", "bots fill every field on the letterbox\n", "/", false, false);
    }
    if (row.id === "east") {
      this.machine.fs.writeFile("/home/kali/.local/share/highlion/relay.path", "/lab/relay\n", "/", false, false);
    }
    this.machine.persist();
    this.postClaim(String(value).trim());
    if (root.HighLionSfx) root.HighLionSfx.ok();
    var output = "claimed " + row.id + " — badge " + row.prize + "\n";
    if (this.machine.claimed.length >= this.flags.length) output += "mail admin@highlion.net subject CTF-CLAIM body FLAGS\n";
    return { status: 0, stdout: output, stderr: "" };
  };

  ChallengeController.prototype.score = function () {
    var count = this.machine.claimed.length;
    var lines = ["HighLion score: " + count + "/" + this.flags.length];
    this.prizes.forEach(function (prize) {
      if (count >= Number(prize.count)) lines.push("[earned] " + prize.badge + " — " + prize.text);
      else if (!lines.some(function (line) { return line.indexOf("[locked]") === 0; })) lines.push("[locked] " + prize.badge);
    });
    if (count >= this.flags.length) lines.push("mail admin@highlion.net subject CTF-CLAIM body FLAGS");
    return lines.join("\n") + "\n";
  };

  ChallengeController.prototype.trophies = function () {
    if (!this.machine.claimed.length) return "No trophies claimed.\n";
    return this.machine.claimed.map(function (id) { return "/home/kali/.trophies/" + id + ".flag"; }).join("\n") + "\n";
  };

  ChallengeController.prototype.hint = function () {
    var next = this.flags.find(function (row) { return !this.isClaimed(row.id); }, this);
    return next ? String(next.hint || "Look more closely at the mounted files.") + "\n" : "All mounted flags are claimed.\n";
  };

  HL.ChallengeController = ChallengeController;
})(window);
