const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const base = path.resolve(__dirname, '..');
const storage = new Map();
const events = new EventTarget();
let claimed = [];
let requests = 0;
const sandbox = {
  TextEncoder, TextDecoder, Uint8Array, URL, CustomEvent, Date, performance,
  setTimeout, clearTimeout, crypto: webcrypto, atob, btoa,
  dispatchEvent: events.dispatchEvent.bind(events),
  addEventListener: events.addEventListener.bind(events),
  sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  localStorage: { getItem: () => null },
  fetch: async url => {
    assert.ok(url.startsWith('/js/shell/image/'));
    const file = path.resolve(base, url.split('?')[0].slice(1));
    assert.ok(file.startsWith(path.join(base, 'js/shell/image') + path.sep));
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  },
  HighLionFlags: {
    state: () => ({ claimed: claimed.slice() }),
    claim: async flag => {
      requests++;
      if (flag !== 'HL8{test_flag}') throw new Error('flag not recognized');
      const duplicate = claimed.includes('modular');
      claimed = ['modular'];
      events.dispatchEvent(new CustomEvent('hl:claims', { detail: { claimed } }));
      return { ok: true, duplicate, claimed };
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ['kernel', 'fs', 'proc', 'net', 'sh', 'busybox', 'pack', 'ctf', 'machine']) {
  vm.runInContext(fs.readFileSync(path.join(base, 'js/shell', name + '.js'), 'utf8'), sandbox, { filename: name + '.js' });
}

(async () => {
  const machine = await sandbox.HLShell.boot();
  const shell = machine.shell;
  async function check(command, stdout, status = 0, stderr = '') {
    const run = await shell.run(command);
    assert.equal(run.stdout, stdout, command);
    assert.equal(run.stderr, stderr, command);
    assert.equal(run.status, status, command);
    assert.equal(machine.env['?'], String(status), command + ' exit status');
  }
  // These commands must work independently of the executable list in tree.json.
  for (const command of ['claim', 'score', 'trophies', 'hint']) {
    assert.ok(shell.complete(command.slice(0, 2), 2).choices.includes(command));
  }
  await check('score', '0 / 4 claimed\n');
  await check('trophies', 'No flags claimed.\n');
  await check('hint', 'Read /home/kali/.secret_challenge1.hlctf; take the least nonnegative residue.\n');
  await check('claim', '', 1, 'claim: usage: claim FLAG\n');
  await check('claim one two', '', 1, 'claim: usage: claim FLAG\n');
  assert.equal(requests, 0);
  await check("claim 'HL8{invalid_flag}'", '', 1, 'claim: flag not recognized\n');
  await check("claim 'HL8{test_flag}'", 'Flag claimed.\n');
  assert.deepEqual(Array.from(machine.claimed), ['modular']);
  assert.equal(machine.readFile('~/highlion/.trophies/modular.flag'), 'claimed: modular\n');
  await check('score', '1 / 4 claimed\n');
  await check('trophies', 'modular\n');
  await check('hint', "Read /opt/highlion/.secret_challenge2.hlctf; the first matching rule wins.\n");
  await check("claim 'HL8{test_flag}'", 'Already claimed.\n');
  await check("claim bad 2> /tmp/claim-error", '', 1);
  assert.equal(machine.readFile('/tmp/claim-error'), 'claim: flag not recognized\n');
  await check('score > /tmp/claim-score', '');
  assert.equal(machine.readFile('/tmp/claim-score'), '1 / 4 claimed\n');
  await check('claim bad || trophies', 'modular\n', 0, 'claim: flag not recognized\n');
  machine.remoteControl = true;
  const beforeRemote = requests;
  await check("claim 'HL8{test_flag}'", '', 1, 'claim: unavailable during remote control\n');
  assert.equal(requests, beforeRemote);
  machine.remoteControl = false;
  const flags = sandbox.HighLionFlags;
  delete sandbox.HighLionFlags;
  await check("claim 'HL8{test_flag}'", '', 1, 'claim: Claims are unavailable. Try again.\n');
  sandbox.HighLionFlags = flags;
  claimed = ['modular', 'route', 'xor', 'timeline'];
  events.dispatchEvent(new CustomEvent('hl:claims', { detail: { claimed } }));
  await check('score', '4 / 4 claimed\n');
  await check('hint', 'All challenges complete.\n');
  // Claiming leaves user edits intact; trophy state also survives a local reset.
  assert.equal(machine.readFile('/tmp/claim-score'), '1 / 4 claimed\n');
  machine.resetLocal();
  await check('score', '4 / 4 claimed\n');
  assert.equal(machine.readFile('~/highlion/.trophies/route.flag'), 'claimed: route\n');
  console.log('Claims: dispatch, status, trophies, redirects, completion, remote guards and reset passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
