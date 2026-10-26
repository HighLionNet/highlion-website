const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const base = path.resolve(__dirname, '..');
const storage = new Map();
const events = new EventTarget();
const sandbox = {
  TextEncoder, TextDecoder, Uint8Array, URL, CustomEvent, Date, performance,
  setTimeout, clearTimeout, crypto: webcrypto, innerWidth: 1000, innerHeight: 700,
  atob, btoa, console,
  dispatchEvent: events.dispatchEvent.bind(events),
  addEventListener: events.addEventListener.bind(events),
  sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  localStorage: { getItem: () => null, removeItem() {} },
  location: { reload() {} },
  fetch: async url => {
    assert.ok(url.startsWith('/js/shell/image/'), 'shell image fetch stays local');
    const file = path.resolve(base, url.split('?')[0].slice(1));
    assert.ok(file.startsWith(path.join(base, 'js', 'shell', 'image') + path.sep));
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ['kernel','fs','proc','net','sh','busybox','pack','ctf','machine']) {
  vm.runInContext(fs.readFileSync(path.join(base, 'js/shell', name + '.js'), 'utf8'), sandbox, { filename: name + '.js' });
}
(async () => {
  const machine = await sandbox.HLShell.boot();
  const shell = machine.shell;
  let checks = 0;
  async function check(command, output, status = 0) {
    const run = await shell.run(command);
    assert.equal(run.status, status, command + ': ' + run.stderr);
    if (output !== null) assert.equal(run.stdout, output, command);
    checks++;
    return run;
  }
  await check('echo "a | b; c > d && e"', 'a | b; c > d && e\n');
  await check("echo '$HOME'", '$HOME\n');
  await check('echo "" end', ' end\n');
  await check('echo one\\ two', 'one two\n');
  await check('VALUE="a b"; printf "%s" "$VALUE"', 'a b');
  await check('VALUE="a b"; printf "%s-%s" $VALUE', 'a-b');
  await check('touch /tmp/a.txt /tmp/b.txt; echo "/tmp/*.txt"', '/tmp/*.txt\n');
  await check('busybox basename /a/b', 'b\n');
  await check('not-a-command 2> /tmp/no-command; cat /tmp/no-command', 'zsh: command not found: not-a-command\n');
  await check('echo /tmp/*.txt', '/tmp/a.txt /tmp/b.txt\n');
  await check('printf "%s" "$(printf \'a; echo injected\')"', 'a; echo injected');
  await check("echo $(printf 'a | cat')", 'a | cat\n');
  await check('false && echo $(touch /tmp/skipped)', '', 1);
  assert.equal(machine.fs.nodes.has('/tmp/skipped'), false); checks++;
  await check("echo 'hello' > /tmp/input; cat < /tmp/input", 'hello\n');
  await check('echo two >> /tmp/input; cat /tmp/input | tail -n 1', 'two\n');
  await check('cat /missing 2> /tmp/error; wc -l < /tmp/error', '1\n');
  await check('echo hi > /tmp/first > /tmp/second; cat /tmp/first; cat /tmp/second', 'hi\n');
  await check('false || echo yes;', 'yes\n');
  await check('for n in 1 2 3; do echo "$n"; done', '1\n2\n3\n');
  await check('if test 1 = 1; then echo yes; else echo no; fi', 'yes\n');
  await check('env WORD=hello sh -c \'echo "$WORD"\'', 'hello\n');
  await check('echo ${WORD:-gone}', 'gone\n');
  await check('basename /a/b.txt .txt', 'b\n');
  await check('dirname /a/b.txt', '/a\n');
  await check('printf "ab\\ncd\\n" | rev', 'ba\ndc\n');
  await check('printf "ab\\ncd\\n" | tac', 'cd\nab\n');
  await check('factor 84', '84: 2 2 3 7\n');
  await check('expr 6 + 7', '13\n');
  await check('printf "a b c" | xargs -n 2 echo', 'a b\nc\n');
  await check('sessionctl help', '', 1);
  const started = Date.now();
  setTimeout(() => shell.cancel(), 35);
  await check('sleep 5; touch /tmp/after-cancel', '', 130);
  assert.ok(Date.now() - started < 500); checks++;
  assert.equal(machine.fs.nodes.has('/tmp/after-cancel'), false); checks++;
  await check('timeout 0.02 sh -c \'sleep 1; touch /tmp/after-timeout\'', '', 124);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(machine.fs.nodes.has('/tmp/after-timeout'), false); checks++;
  const long = await check('seq 1 10000', null);
  assert.ok(new TextEncoder().encode(long.stdout + long.stderr).length <= 33000); checks++;
  machine.remoteControl = true;
  for (const command of ['su admin', 'sessionctl list', "sh -c 'su root'", 'open home', 'reset-machine', 'less /etc/passwd']) await check(command, '', 1);
  await check("sleep 1 &", '', 2);
  machine.remoteControl = false;
  for (const command of ['ping -c 1 8.8.8.8', 'curl https://example.com', 'curl http://highlion.net/api/traffic.php']) {
    const run = await shell.run(command); assert.notEqual(run.status, 0); checks++;
  }
  const opened = [];
  events.addEventListener('hl:challenge-open', event => opened.push(event.detail.path));
  assert.equal(machine.fs.nodes.has('/home/kali/puzzles'), false); checks++;
  const files = ['/home/kali/.secret_challenge1.hlctf', '/opt/highlion/.secret_challenge2.hlctf', '/home/kali/.secret_challenge3.hlctf', '/opt/highlion/.secret_challenge4.hlctf'];
  for (const file of files) {
    assert.ok(machine.fs.nodes.has(file)); checks++;
    await check('cat ' + file, null);
    assert.equal(opened.at(-1), file); checks++;
    await check('open ' + file, null);
    assert.equal(opened.at(-1), file); checks++;
  }
  const listing = await check('ls /home/kali', null);
  assert.equal(listing.stdout.includes('.hlctf'), false); checks++;
  for (const [file, node] of machine.fs.nodes) {
    if (file.startsWith('/proc/') && node.type === 'file') { assert.ok(machine.readFile(file).length > 0, file); checks++; }
  }
  storage.set(machine.config.overlayKey, JSON.stringify({v:2, files:{version:2,nodes:{'/home/kali/puzzles':{type:'dir',mode:493,owner:'kali',group:'kali',content:''},'/home/kali/puzzles/old.txt':{type:'file',mode:420,owner:'kali',group:'kali',content:'old'},'/home/kali/migration-keep.txt':{type:'file',mode:420,owner:'kali',group:'kali',content:'keep'}},deleted:[]}}));
  const migrated = new sandbox.HLShell.Machine(machine.image);
  assert.equal(migrated.fs.nodes.has('/home/kali/puzzles'), false); checks++;
  assert.equal(migrated.fs.nodes.has('/home/kali/puzzles/old.txt'), false); checks++;
  assert.equal(migrated.readFile('/home/kali/migration-keep.txt'), 'keep'); checks++;
  storage.delete(machine.config.overlayKey);
  const originalPersist = machine.persist;
  machine.persist = () => false;
  await check('mkdir /tmp/quota-full', '', 1);
  assert.equal(machine.fs.nodes.has('/tmp/quota-full'), false); checks++;
  machine.persist = originalPersist;
  const unicode = shell.limitOutput({stdout: '🦁'.repeat(20000), stderr: '', status: 0});
  assert.ok(new TextEncoder().encode(unicode.stdout + unicode.stderr).length <= 32768); checks++;
  assert.match(unicode.stderr, /truncated/); checks++;
  assert.ok(shell.complete('base', 4).choices.includes('basename')); checks++;
  assert.ok(shell.complete('cat /tmp/in', 11).choices.includes('/tmp/input')); checks++;
  for (const file of fs.readdirSync(path.join(base, 'js/shell/image')).filter(name => name.endsWith('.json'))) JSON.parse(fs.readFileSync(path.join(base, 'js/shell/image', file)));
  assert.equal(sandbox.HLShell.path.matchGlob('a*'.repeat(100) + 'z', 'a'.repeat(100)), false); checks++;
  for (const command of machine.config.busyboxCommands) {
    const output = await shell.run(command + ' --help');
    assert.notEqual(output.stderr, 'zsh: command not found: ' + command + '\n', command + ' has no dispatcher'); checks++;
  }
  console.log(`Shell: ${checks} assertions passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
