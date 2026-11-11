import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';

// Serve the actual upload artifact at the GitHub Pages project path, not the source checkout.
const prefix = '/shopee-research/';
const mime = { 'index.html': 'text/html', 'style.css': 'text/css', 'app.js': 'text/javascript', 'calculator.js': 'text/javascript', '.nojekyll': 'text/plain' };
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const name = path.startsWith(prefix) ? path.slice(prefix.length) || 'index.html' : '';
  if (!Object.hasOwn(mime, name)) { response.writeHead(404); response.end(); return; }
  try {
    response.writeHead(200, { 'Content-Type': `${mime[name]}; charset=utf-8` });
    response.end(await readFile(new URL(`../dist/${name}`, import.meta.url)));
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}${prefix}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--no-sandbox'],
  });
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    let page = await context.newPage();
    const errors = [], failedResponses = [], outside = [];
    const observe = page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()); });
      page.on('request', request => { if (!request.url().startsWith(url)) outside.push(request.url()); });
    };
    observe(page);
    await page.goto(url);
    assert.ok(await page.locator('#startup-message').isHidden());
    assert.equal(await page.locator('#cost-fields input').count(), 8);
    await page.locator('#product-url').fill('https://shopee.sg/example');
    await page.locator('#sale').fill('100'); await page.locator('#rate').fill('110');
    const values = { purchase: '5000', domestic: '500', international: '1000', packaging: '100', selling: '10', payment: '3', exchange: '2', returns: '100' };
    for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(value);
    for (const id of ['selling', 'payment', 'exchange']) await page.locator(`#${id}-mode`).selectOption('percent');
    assert.equal(await page.locator('#profit').textContent(), '2,650 円');
    assert.equal(await page.locator('#verdict').textContent(), '採用候補');
    await page.locator('#save-settings').click();
    const savedSettings = await page.evaluate(() => localStorage.getItem('shopee-research.settings.v1'));
    const snapshot = await page.locator('input[id], select[id]').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.id, n.value])));
    await page.reload();
    assert.deepEqual(await page.locator('input[id], select[id]').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.id, n.value]))), snapshot);
    assert.equal(await page.locator('#profit').textContent(), '2,650 円');
    assert.match(await page.locator('#draft-message').textContent(), /復元/);
    await page.locator('#international').fill('');
    await page.locator('#packaging').fill('0');
    await page.close(); page = await context.newPage(); observe(page); await page.goto(url);
    assert.equal(await page.locator('#international').inputValue(), '');
    assert.equal(await page.locator('#packaging').inputValue(), '0');
    assert.equal(await page.locator('#verdict').textContent(), '判定保留');
    assert.equal(await page.evaluate(() => localStorage.getItem('shopee-research.settings.v1')), savedSettings);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []); assert.deepEqual(outside, []);
    await context.close();
    console.log(`PASS Pages artifact ${width}px: project path, 8 inputs, calculation, autosave/reload/reopen, empty/zero, saved settings, no overflow or external requests`);
  }
  for (const file of ['.env', 'server.js', 'package.json', '.git/config']) assert.equal((await fetch(`${url}${file}`)).status, 404);
  console.log('PASS: non-public files excluded from artifact server');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
