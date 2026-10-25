(function (root) {
  "use strict";
  var HL = root.HLShell = root.HLShell || {};
  function ChallengeController(machine) {
    this.machine = machine;
    this.flags = (machine.packs || []).filter(function (pack) { return !pack._error; }).flatMap(function (pack) { return pack.flags || []; });
    this.sync();
    root.addEventListener("hl:claims", this.sync.bind(this));
  }
  ChallengeController.prototype.sync = function () {
    var state = root.HighLionFlags && root.HighLionFlags.state();
    if (state) this.machine.claimed = state.claimed.slice();
    this.machine.syncTrophyFiles();
  };
  ChallengeController.prototype.claim = async function (value) {
    try {
      if (!root.HighLionFlags) throw new Error("Claims are unavailable. Try again.");
      var payload = await root.HighLionFlags.claim(value);
      this.sync();
      return { status: 0, stdout: (payload.duplicate ? "Already claimed." : "Flag claimed.") + "\n", stderr: "" };
    } catch (error) { return { status: 1, stdout: "", stderr: "claim: " + error.message + "\n" }; }
  };
  ChallengeController.prototype.score = function () { return this.machine.claimed.filter(function (id) { return this.flags.some(function (row) { return row.id === id; }); }, this).length + " / " + this.flags.length + " claimed\n"; };
  ChallengeController.prototype.trophies = function () { return this.machine.claimed.length ? this.machine.claimed.join("\n") + "\n" : "No flags claimed.\n"; };
  ChallengeController.prototype.hint = function () {
    var next = this.flags.find(function (row) { return this.machine.claimed.indexOf(row.id) === -1; }, this);
    return next ? next.hint + "\n" : "All challenges complete.\n";
  };
  HL.ChallengeController = ChallengeController;
})(window);
