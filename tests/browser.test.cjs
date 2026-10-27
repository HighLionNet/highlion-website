const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const qa = path.join(root, '.qa');
fs.mkdirSync(qa, { recursive: true });
const csp = fs.readFileSync(path.join(root, 'deploy/nginx-headers.conf'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];
const contacts = [];
let tokens = 0;
let traffic = [{ path: '/example', n: 3 }];
let prices = [[Date.now() - 7200000, 70], [Date.now() - 1800000, 100], [Date.now(), 110]];
let marketAlias = false;
let hangMarket = false;
let marketRequests = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  function json(value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
  if (/^\/api\/csrf/.test(url.pathname)) return json({ ok: true, token: String(++tokens).padStart(64, '0') });
  if (/^\/api\/contact/.test(url.pathname)) {
    let body = ''; for await (const chunk of req) body += chunk;
    contacts.push(JSON.parse(body)); return json({ ok: true });
  }
  if (/^\/api\/market/.test(url.pathname)) {
    marketRequests++;
    if (hangMarket) return;
    if (marketAlias && url.pathname.endsWith('.php')) return json({ ok: false }, 404);
    return json({ ok: true, coin: url.searchParams.get('coin'), days: Number(url.searchParams.get('days')), prices });
  }
  if (/^\/api\/traffic/.test(url.pathname)) return json({ ok: true, codes: {}, exact: [{ code: 200, n: 3 }], top: traffic });
  if (/^\/api\/intel/.test(url.pathname)) return json({ ok: true, items: [{ url: 'https://example.org/report', title: 'Fixture news', source: 'cisa.gov', date: '2026-10-27', thumb: '/api/thumb.php?id=' + 'a'.repeat(40) }] });
  if (/^\/api\/thumb/.test(url.pathname)) { res.writeHead(204); return res.end(); }
  if (/^\/api\/ctf/.test(url.pathname)) return json({ ok: true, claimed: [], total: 4 });
  if (url.pathname.startsWith('/api/')) return json({ ok: true, mode: 'full', id: 'a'.repeat(32), ttl: 90, user: 'kali', active: 1 });
  let name = url.pathname === '/' ? '/index.html' : url.pathname;
  if (/^\/[a-z]+$/.test(name)) name += '.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.txt': 'text/plain' };
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage();
    await page.clock.install();
    page.on('pageerror', e => errors.push(e.message));
    await context.route('https://**/*', route => route.abort());
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['index', 'about', 'projects', 'writeups', 'contact', '403', '404', '405', 'writeups/pihole', 'writeups/cve-2026-2441']) {
        await page.goto(origin + '/' + name + '.html');
        await page.locator('#navCli').waitFor();
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#navCli')).backgroundColor === 'rgb(85, 84, 184)');
        assert.equal(await page.locator('header.nav').count(), 1);
        await page.locator('footer.site-footer').waitFor();
        assert.equal(await page.locator('footer.site-footer').count(), 1);
        assert.equal(await page.locator('#navCli').isVisible(), true, name);
        const before = await page.locator('#navFlags, #navCli, #navTor').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent.trim(), radius: getComputedStyle(node).borderRadius, color: getComputedStyle(node).backgroundColor })));
        assert.deepEqual(before.map(x => x.label), ['FLAGS', 'CLI', 'Tor Mirror']);
        assert.ok(before.every(x => x.radius === '6px'));
        assert.equal(before[0].color, 'rgb(85, 84, 184)');
        assert.equal(before[1].color, before[0].color);
        assert.equal(before[2].color, 'rgb(126, 71, 152)');
        const toggleColors = await page.locator('#navFx, #navScan').evaluateAll(nodes => nodes.map(node => ({
          radius: getComputedStyle(node).borderRadius,
          color: getComputedStyle(node).backgroundColor,
          pressed: node.getAttribute('aria-pressed'),
          label: node.querySelector('.nav-toggle-state').textContent.trim()
        })));
        assert.ok(toggleColors.every(item => item.radius === '6px'), name);
        assert.equal(toggleColors[0].label, toggleColors[0].pressed === 'true' ? 'ON' : 'OFF', name + ' FX label');
        assert.equal(toggleColors[1].label, toggleColors[1].pressed === 'true' ? 'ON' : 'OFF', name + ' SCAN label');
        assert.equal(toggleColors[0].color, toggleColors[0].pressed === 'true' ? 'rgb(14, 127, 141)' : 'rgb(22, 52, 59)', name + ' FX');
        assert.equal(toggleColors[1].color, toggleColors[1].pressed === 'true' ? 'rgb(29, 122, 66)' : 'rgb(22, 53, 40)', name + ' SCAN');
        for (const selector of ['#navFx', '#navScan']) {
          const initial = await page.locator(selector).getAttribute('aria-pressed');
          const initialState = (await page.locator(selector + ' .nav-toggle-state').textContent()).trim();
          await page.locator(selector).click();
          assert.notEqual(await page.locator(selector).getAttribute('aria-pressed'), initial);
          assert.notEqual((await page.locator(selector + ' .nav-toggle-state').textContent()).trim(), initialState);
          await page.locator(selector).click();
          assert.equal(await page.locator(selector).getAttribute('aria-pressed'), initial);
          assert.equal((await page.locator(selector + ' .nav-toggle-state').textContent()).trim(), initialState);
        }
        const fxState = (await page.locator('#navFx .nav-toggle-state').textContent()).trim();
        const scanState = (await page.locator('#navScan .nav-toggle-state').textContent()).trim();
        assert.ok(fxState === 'ON' || fxState === 'OFF');
        assert.ok(scanState === 'ON' || scanState === 'OFF');
        assert.equal((await page.locator('#navFx .nav-toggle-name').textContent()).trim(), 'FX');
        assert.equal((await page.locator('#navScan .nav-toggle-name').textContent()).trim(), 'SCAN');
        assert.deepEqual(await page.locator('#navFlags, #navCli, #navTor').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent.trim(), radius: getComputedStyle(node).borderRadius, color: getComputedStyle(node).backgroundColor }))), before);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflow');
        if (name === 'projects') {
          assert.equal(await page.locator('thead th').count(), 4);
          assert.deepEqual(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.cells.length)), [4, 4, 4, 4]);
          assert.equal(await page.locator('.project-checksum').count(), 1);
          assert.equal(await page.locator('.project-checksum').textContent(), 'SHA256: 67173e9f3adc374823fa617716643534d5e9d67edd04df70d76c4294e53ecf5e');
          const colors = await page.locator('tbody tr td:nth-child(2)').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
          assert.equal(new Set(colors).size, 4);
          const links = await page.locator('[data-project-class=web] .xdr-links a').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
          assert.notEqual(links[0], links[1]);
          assert.equal(await page.locator('.xdr-links').first().evaluate(node => getComputedStyle(node).display), 'table-cell');
          const borders = await page.locator('.xdr-side button').evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).borderTopWidth, getComputedStyle(node).borderLeftWidth, getComputedStyle(node).borderTopColor, getComputedStyle(node).borderLeftColor]));
          const edge = width < 980 ? 1 : 0;
          assert.equal(borders[0][edge], '0px');
          assert.ok(borders.slice(1).every(row => row[edge] === '1px' && row[edge + 2] === 'rgb(109, 132, 184)'));
          const hashBox = await page.locator('.project-checksum').evaluate(node => {
            const hash = node.getBoundingClientRect();
            const cell = node.closest('td').getBoundingClientRect();
            return { right: hash.right, left: hash.left, cellRight: cell.right, cellLeft: cell.left, height: hash.height };
          });
          assert.ok(hashBox.right <= hashBox.cellRight + 1, 'checksum stays inside its cell');
          assert.ok(hashBox.left >= hashBox.cellLeft - 1, 'checksum stays inside its cell');
          assert.ok(hashBox.height > 16, 'checksum stays visible inside the catalog');
          await page.locator('[data-project-filter=web]').click();
          assert.equal(await page.locator('tbody tr:visible').count(), 1);
          await page.locator('[data-project-filter=all]').click();
          await page.locator('.project-console').screenshot({ path: path.join(qa, `cleanup-projects-${width}.png`) });
        }
        if (name === 'about') {
          await page.locator('#srcDownload:enabled').waitFor();
          await page.locator('#srcSelect').selectOption('css/style.css');
          await page.waitForFunction(() => document.querySelector('#srcOut').textContent.startsWith('@font-face'));
          const downloadPromise = page.waitForEvent('download');
          await page.locator('#srcDownload').click();
          const download = await downloadPromise;
          assert.equal(download.suggestedFilename(), 'style.css');
          assert.equal(fs.readFileSync(await download.path(), 'utf8'), fs.readFileSync(path.join(root, 'css/style.css'), 'utf8'));
          assert.equal(await page.locator('#hlterm-panel-about a').getAttribute('href'), '/#hlterm-panel');
          await page.locator('#srcSelect').selectOption('about.html');
          await page.locator('#srcDownload:enabled').waitFor();
          assert.match(await page.locator('#srcOut').textContent(), /currnetly.*develope.*planing/);
        }
        if (['index', 'about', 'projects', 'contact', '403', '404', '405', 'writeups'].includes(name)) {
          await page.locator('#navCli').click();
          if (name !== 'index') await page.waitForURL(origin + '/#hlterm-panel');
          await page.locator('.hlterm-capture').waitFor({ state: 'attached' });
          await page.waitForFunction(() => Math.abs(document.querySelector('#hlterm-panel').getBoundingClientRect().top) < 200);
        }
      }
    }
    console.log('Browser: 20 desktop/mobile page checks, header labels/colors, CLI navigation, source downloads and projects passed.');

    await page.route('**/api/ctf.php', route => route.fulfill({ status: 403, contentType: 'text/html', body: fs.readFileSync(path.join(root, '403.html'), 'utf8') }));
    await page.goto(origin + '/projects.html');
    await page.locator('#navFlags').click();
    await page.locator('#flagValue').fill('HL8{test_flag}');
    await page.locator('.flag-form [type=submit]').click();
    await page.waitForFunction(() => document.querySelector('.flag-status').textContent === 'Claims are unavailable. Try again.');
    await page.locator('[data-close]').click();
    await page.unroute('**/api/ctf.php');

    await page.goto(origin + '/contact.html');
    assert.equal(await page.locator('a[href="mailto:admin@highlion.net"]').textContent().then(x => x.trim()), 'admin@highlion.net');
    assert.equal(await page.locator('a[href="mailto:admin@highlion.net?subject=Resume%20request"]').count(), 1);
    await page.locator('#submitContact').click();
    assert.equal(await page.locator('#name').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#name').getAttribute('aria-describedby'), 'nameError');
    await page.locator('#name').fill('Test Person');
    await page.locator('#email').fill('test@example.org');
    await page.locator('#message').evaluate(el => { el.value = 'x'.repeat(4001); });
    await page.locator('#submitContact').click();
    assert.match(await page.locator('#messageError').textContent(), /at most 4000/);
    await page.locator('#message').fill('A local fixture message.');
    const start = contacts.length;
    await page.evaluate(() => { const form = document.querySelector('#contactForm'); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector('#formStatus').textContent === 'Sent');
    assert.equal(contacts.length, start + 1, 'reentrant submit sends once');
    const firstToken = contacts.at(-1).token;
    await page.locator('#name').fill('Test Person'); await page.locator('#email').fill('test@example.org'); await page.locator('#message').fill('Another fixture message.');
    await page.locator('#submitContact').click();
    await page.waitForFunction(() => document.querySelector('#formStatus').textContent === 'Sent');
    assert.notEqual(contacts.at(-1).token, firstToken, 'token refreshed per send');
    let attempts = 0;
    await page.route('**/api/contact**', route => { attempts++; return route.abort(); });
    await page.locator('#name').fill('Test Person'); await page.locator('#email').fill('test@example.org'); await page.locator('#message').fill('Uncertain delivery fixture.');
    await page.locator('#submitContact').click();
    await page.waitForFunction(() => document.querySelector('#formStatus').textContent === 'Error');
    assert.equal(attempts, 1, 'network failure cannot duplicate a delivered message');
    await page.unroute('**/api/contact**');
    const tokenBefore = tokens;
    await page.route('**/contact.html', route => route.fulfill({ status: 403, contentType: 'text/html', body: fs.readFileSync(path.join(root, '403.html'), 'utf8') }));
    await page.goto(origin + '/contact.html');
    await page.locator('#company').evaluate(el => { el.value = 'bot'; });
    await page.locator('#submitContact').click();
    await page.waitForFunction(() => document.querySelector('#formStatus').textContent === 'Sent');
    assert.equal(contacts.at(-1).page, '403'); assert.equal(contacts.at(-1).token, ''); assert.equal(tokens, tokenBefore);
    await page.unroute('**/contact.html');
    console.log('Browser: form validation/accessibility, single submit, no unsafe retries, fresh CSRF and honeypot short circuit passed.');

    await page.goto(origin + '/projects.html');
    await page.evaluate(() => { const node = document.querySelector('[data-project-class=web] .xdr-detail'); const range = document.createRange(); range.selectNodeContents(node); getSelection().addRange(range); node.click(); });
    assert.equal(page.url(), origin + '/projects.html', 'selecting row text must not navigate');
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.locator('[data-project-class=web]').press('Control+Enter');
    assert.equal(page.url(), origin + '/projects.html');
    await page.locator('[data-project-class=web]').press('Enter');
    await page.waitForURL(origin + '/about.html');
    await page.goto(origin + '/writeups.html');
    await page.locator('tr[data-href]').first().press('Enter');
    await page.waitForURL(origin + '/writeups/pihole.html');

    prices = [null, {}, [Date.now(), 110], [Date.now() - 1800000, 100], [Date.now() - 7200000, 70], [0, 1], [3, null]];
    marketAlias = true;
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => document.querySelector('#cryptoState').textContent === 'live');
    await page.locator('[data-range="1h"]').click();
    await page.waitForFunction(() => document.querySelector('#cryptoQuote').textContent.includes('+10.00%'));
    assert.match(await page.locator('#cryptoLow').textContent(), /100/);
    await page.waitForFunction(() => document.querySelector('#dLatency').textContent.includes('ms'));
    await page.waitForFunction(() => !document.querySelector('#dTopPaths').hidden);
    traffic = [];
    await page.clock.fastForward(60000);
    await page.waitForFunction(() => document.querySelector('#dTopPaths').hidden);
    assert.equal(await page.locator('#dTopPathList li').count(), 0);
    await page.clock.resume();
    await page.waitForFunction(() => document.querySelector('#news-list').textContent.includes('Fixture news'));
    assert.equal(await page.locator('#news-list a').getAttribute('href'), 'https://example.org/report');
    await page.locator('.hlterm-capture').fill('echo terminal-ready');
    await page.locator('.hlterm-capture').press('Enter');
    await page.waitForFunction(() => document.querySelector('.hlterm-stream').textContent.includes('terminal-ready'));
    hangMarket = true;
    const priorRequests = marketRequests;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#cryptoState').textContent === 'loading');
    while (marketRequests === priorRequests) await new Promise(resolve => setTimeout(resolve, 10));
    await page.clock.fastForward(12001);
    await page.waitForFunction(() => document.querySelector('#cryptoState').textContent === 'retry');
    hangMarket = false;
    await page.clock.fastForward(5001);
    await page.waitForFunction(() => document.querySelector('#cryptoState').textContent === 'live');
    console.log('Browser: row links, malformed/sorted prices, 1h range, CSP-safe market alias, latency, traffic clearing, feed and terminal boot passed.');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => HighLionParticles.stop());
    await page.setViewportSize({ width: 900, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await page.locator('#fx').evaluate(el => el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((v, i) => i % 4 === 3 && v !== 0)), false);
    await page.evaluate(() => HighLionParticles.start());
    await page.waitForFunction(() => { const el = document.querySelector('#fx'); return el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((v, i) => i % 4 === 3 && v !== 0); });
    await page.goto(origin + '/about.html');
    await page.waitForFunction(() => [...document.querySelectorAll('.rain-canvas')].every(el => el.width > 0 && el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some(v => v)));

    await page.goto(origin + '/404.html');
    await page.setContent('<button id="navFx"><span>FX</span></button><button id="navScan">SCAN</button>');
    await page.addScriptTag({ url: origin + '/js/station-toggles.js' });
    await page.evaluate(() => { const b = document.createElement('button'); b.id = 'navCli'; b.textContent = 'CLI'; document.body.append(b); });
    await page.waitForFunction(() => document.querySelector('#navCli').dataset.bound === 'true');
    assert.equal(await page.locator('#navFx span').first().textContent(), 'FX', 'paint preserves markup');
    assert.match((await page.locator('#navFx .nav-toggle-state').textContent()).trim(), /^(ON|OFF)$/);
    await page.locator('#navCli').click();
    await page.waitForURL(origin + '/#hlterm-panel');
    assert.deepEqual(errors, [], 'uncaught browser errors');
    console.log('Browser: disabled particle state, rain canvases, late CLI insertion and preserved label markup passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
