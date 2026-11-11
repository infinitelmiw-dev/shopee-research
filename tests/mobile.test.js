import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const fields = {
  purchase: '仕入れ価格', domestic: '国内送料', international: '国際送料', packaging: '梱包費',
  selling: '販売手数料', payment: '決済手数料', exchange: '為替費用', returns: '返品損失見込み',
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
await mkdir('artifacts', { recursive: true });

async function assertFields(page, width) {
  assert.equal(await page.locator('#cost-fields input').count(), 8);
  for (const [id, label] of Object.entries(fields)) {
    const input = page.locator(`#${id}`);
    await input.scrollIntoViewIfNeeded();
    assert.ok(await input.isVisible(), `${width}px: ${label}が表示される`);
    assert.equal(await page.locator(`label[for="${id}"]`).textContent(), label);
    assert.ok(await input.isEditable(), `${width}px: ${label}が編集できる`);
    const box = await input.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.width >= 85 && box.height >= 44, `${width}px: ${label}が画面内に収まる`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: 横スクロールなし`);
  const outside = await page.locator('input, select, label, h1, h2, button').evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBoundingClientRect();
    return box.width && (box.left < 0 || box.right > innerWidth);
  }).map(node => node.id || node.textContent));
  assert.deepEqual(outside, [], `${width}px: 文字・操作欄が画面内に収まる`);
}

async function assertCalculation(page, width) {
  await page.locator('#sale').fill('100');
  await page.locator('#rate').fill('110');
  for (const [id, value] of Object.entries({ purchase: '5000', domestic: '500', international: '1000', packaging: '100', selling: '10', payment: '3', exchange: '2', returns: '100' })) {
    await page.locator(`#${id}`).fill(value);
  }
  for (const id of ['selling', 'payment', 'exchange']) await page.locator(`#${id}-mode`).selectOption('percent');
  assert.equal(await page.locator('#profit').textContent(), '2,650 円');
  assert.equal(await page.locator('#total').textContent(), '8,350 円');
  assert.equal(await page.locator('#margin').textContent(), '24.09 %');
  assert.equal(await page.locator('#verdict').textContent(), '採用候補');
  await assertFields(page, width);
  await page.screenshot({ path: `artifacts/mobile-${width}.png`, fullPage: true });
  // Every cost must participate in calculation, and unknown must never become zero.
  for (const [id, label] of Object.entries(fields)) {
    const input = page.locator(`#${id}`), value = await input.inputValue();
    await input.fill(String(Number(value) + 1));
    const isPercent = ['selling', 'payment', 'exchange'].includes(id);
    assert.equal(await page.locator('#profit').textContent(), isPercent ? '2,540 円' : '2,649 円', `${width}px: ${label}の計算反映`);
    await input.fill('');
    assert.equal(await page.locator('#verdict').textContent(), '判定保留');
    assert.equal(await page.locator('#profit').textContent(), '— 円');
    await input.fill('0');
    assert.notEqual(await page.locator('#verdict').textContent(), '判定保留');
    await input.fill(value);
  }
}

try {
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/');
    assert.ok(await page.locator('#startup-message').isHidden());
    await assertFields(page, width);
    await assertCalculation(page, width);
    assert.deepEqual(errors, []);
    // Reproduce the original failure: the UI must remain intact if JS cannot load.
    await page.route('**/app.js*', route => route.abort());
    await page.reload();
    await assertFields(page, width);
    assert.ok(await page.locator('#startup-message').isVisible());
    await context.close();
    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 }, isMobile: true });
    const staticPage = await noScript.newPage(); await staticPage.goto('http://127.0.0.1:3000/');
    await assertFields(staticPage, width);
    await noScript.close();
    console.log(`PASS ${width}px: 全8費用の表示・編集・計算・空欄/0・横はみ出しなし・JS読み込み失敗時も費用表示`);
  }
  // A preview mounted below a path must request its own relative assets.
  const page = await browser.newPage({ viewport: { width: 360, height: 844 } });
  const requests = [];
  await page.route('http://preview.test/research/**', async route => {
    const name = new URL(route.request().url()).pathname.slice('/research/'.length) || 'index.html';
    assert.ok(['index.html', 'app.js', 'calculator.js', 'style.css'].includes(name));
    requests.push(name);
    await route.fulfill({ body: await readFile(new URL(`../${name}`, import.meta.url)), contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.goto('http://preview.test/research/');
  assert.ok(await page.locator('#startup-message').isHidden());
  for (const name of ['app.js', 'calculator.js', 'style.css']) assert.ok(requests.includes(name));
  await assertCalculation(page, 360);
  console.log('PASS: サブパスのプレビューでも必要なファイルを読み込んで計算可能');
} finally { await browser.close(); }
