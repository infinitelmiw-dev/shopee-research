import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const settingsKey = 'shopee-research.settings.v1';
const draftKey = 'shopee-research.product.v1';
const fees = ['purchase', 'domestic', 'international', 'packaging', 'selling', 'payment', 'exchange', 'returns'];
const saved = { version: 1, currency: 'SGD', rate: '110', minProfit: '500', minMargin: '20', fees: Object.fromEntries(fees.filter(k => k !== 'purchase').map(k => [k, { value: k === 'domestic' ? '500' : '0', mode: 'yen' }])) };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function getStore(page, key) { return page.evaluate(key => localStorage.getItem(key), key); }
async function snapshot(page) { return page.locator('main input[id], main select[id]').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.id, n.value]))); }
try {
  await mkdir('artifacts', { recursive: true });
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(({ settingsKey, saved }) => {
      if (!localStorage.getItem(settingsKey)) localStorage.setItem(settingsKey, JSON.stringify(saved));
    }, { settingsKey, saved });
    let page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/');
    assert.equal(await page.locator('#domestic').inputValue(), '500', '既存料金設定を移行なしで使う');
    const originalSettings = await getStore(page, settingsKey);
    await page.locator('#product-url').fill('https://shopee.sg/product?q=日本語');
    await page.locator('#sale').fill('100');
    for (const [key, value] of Object.entries({ purchase: '5000', domestic: '500', international: '1000', packaging: '100', selling: '10', payment: '3', exchange: '2', returns: '100' })) await page.locator(`#${key}`).fill(value);
    for (const id of ['selling', 'payment', 'exchange']) await page.locator(`#${id}-mode`).selectOption('percent');
    assert.equal(await page.locator('#profit').textContent(), '2,650 円');
    assert.equal(await page.locator('#verdict').textContent(), '採用候補');
    const full = await snapshot(page);
    await page.reload();
    assert.deepEqual(await snapshot(page), full);
    assert.equal(await page.locator('#profit').textContent(), '2,650 円');
    assert.match(await page.locator('#draft-message').textContent(), /復元/);
    await page.screenshot({ path: `artifacts/draft-${width}.png`, fullPage: true });
    await page.locator('#resume-input').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'exchange-mode');
    await page.locator('#packaging').fill('0');
    await page.locator('#international').fill('');
    await page.locator('#min-margin').fill('25'); // Unsaved criterion belongs to the working draft only.
    await page.locator('#returns').fill('100');
    const partial = await snapshot(page);
    assert.equal(JSON.parse(await getStore(page, draftKey)).fields.international, '');
    assert.equal(JSON.parse(await getStore(page, draftKey)).fields.packaging, '0');
    // Close/reopen the preview in the same browser storage, not just a reload.
    await page.close(); page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/');
    assert.deepEqual(await snapshot(page), partial);
    assert.equal(await page.locator('#verdict').textContent(), '判定保留');
    await page.locator('#resume-input').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'returns');
    const box = await page.locator('#returns').boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844, '最後の入力欄が表示範囲に入る');
    assert.equal(await getStore(page, settingsKey), originalSettings, '自動保存が既存の初期料金・基準を上書きしない');
    page.once('dialog', d => d.dismiss());
    await page.locator('#new-product').click();
    assert.deepEqual(await snapshot(page), partial, '初期化をキャンセルすると入力維持');
    page.once('dialog', d => d.accept());
    await page.locator('#new-product').click();
    for (const id of ['product-url', 'sale', 'purchase']) assert.equal(await page.locator(`#${id}`).inputValue(), '');
    for (const id of fees.filter(k => k !== 'purchase')) {
      assert.equal(await page.locator(`#${id}`).inputValue(), saved.fees[id].value);
      if (['selling', 'payment', 'exchange', 'returns'].includes(id)) assert.equal(await page.locator(`#${id}-mode`).inputValue(), 'yen');
    }
    assert.equal(await page.locator('#min-margin').inputValue(), '25', '作業中の採用基準も維持');
    assert.equal(await getStore(page, settingsKey), originalSettings);
    assert.ok(await page.locator('#resume-input').isHidden());
    await page.reload();
    assert.equal(await page.locator('#product-url').inputValue(), '');
    assert.equal(await page.locator('#purchase').inputValue(), '', '初期化後に古い商品が復活しない');
    assert.equal(await page.locator('#domestic').inputValue(), '500');
    assert.equal(await page.locator('#verdict').textContent(), '判定保留');
    await page.locator('#currency').fill('USD');
    await page.locator('#rate').fill('150');
    await page.locator('#currency').fill('JPY');
    await page.reload();
    assert.equal(await page.locator('#rate').inputValue(), '1');
    assert.ok(await page.locator('#rate').isDisabled());
    await page.locator('#currency').fill('USD');
    assert.equal(await page.locator('#rate').inputValue(), '150', 'JPY復元でも直前の外貨レートを維持');
    await page.locator('#currency').fill('SGD');
    await page.locator('#rate').fill('110');
    await page.locator('#sale').fill('100');
    for (const id of fees) await page.locator(`#${id}`).fill(id === 'purchase' ? '20000' : '0');
    assert.equal(await page.locator('#profit').textContent(), '-9,000 円');
    assert.equal(await page.locator('#verdict').textContent(), '見送り');
    await page.reload();
    assert.equal(await page.locator('#profit').textContent(), '-9,000 円');
    assert.equal(await page.locator('#verdict').textContent(), '見送り');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '横スクロールなし');
    // Autosave failure must not silently report success or prevent live calculation.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
    await page.locator('#purchase').fill('100');
    assert.match(await page.locator('#draft-message').textContent(), /自動保存できません/);
    assert.equal(await page.locator('#profit').textContent(), '10,900 円');
    assert.equal(await page.locator('#verdict').textContent(), '採用候補');
    assert.equal(await getStore(page, settingsKey), originalSettings);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px: 全入力自動保存・再読込/再表示復元・空欄/0・入力位置・初期化確認/キャンセル・設定維持・JPY・採用/見送り/保留・保存失敗`);
  }
  // Invalid draft and unavailable storage must not crash initialization or damage settings.
  const context = await browser.newContext();
  await context.addInitScript(({ settingsKey, draftKey, saved }) => {
    localStorage.setItem(settingsKey, JSON.stringify(saved));
    localStorage.setItem(draftKey, '{broken');
  }, { settingsKey, draftKey, saved });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/');
  assert.ok(await page.locator('#startup-message').isHidden());
  assert.match(await page.locator('#draft-message').textContent(), /読み込めません/);
  assert.equal(await page.locator('#domestic').inputValue(), '500');
  await context.close();
  const denied = await browser.newContext();
  await denied.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('denied'); };
    Storage.prototype.setItem = () => { throw new Error('denied'); };
  });
  const deniedPage = await denied.newPage(); await deniedPage.goto('http://127.0.0.1:3000/');
  assert.ok(await deniedPage.locator('#startup-message').isHidden());
  await deniedPage.locator('#sale').fill('100');
  assert.match(await deniedPage.locator('#draft-message').textContent(), /自動保存できません/);
  await denied.close();
  console.log('PASS: 破損した商品保存・ストレージ利用不可でも起動し、保存失敗を表示');
} finally { await browser.close(); }
