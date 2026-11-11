import test from 'node:test';
import assert from 'node:assert/strict';
import '../calculator.js';
const { calculate, costs } = globalThis.ShopeeCalculator;

function sample() {
  return { sale: '100', currency: 'SGD', rate: '110', minProfit: '500', minMargin: '20', fees: Object.fromEntries(costs.map(c => [c.key, { value: '0', mode: 'yen' }])) };
}
test('外貨を円換算し、円費用と割合費用を合算する', () => {
  const data = sample();
  Object.assign(data.fees, {
    purchase: { value: '5000', mode: 'yen' }, domestic: { value: '500', mode: 'yen' }, international: { value: '1000', mode: 'yen' }, packaging: { value: '100', mode: 'yen' },
    selling: { value: '10', mode: 'percent' }, payment: { value: '3', mode: 'percent' }, exchange: { value: '2', mode: 'percent' }, returns: { value: '100', mode: 'yen' },
  });
  const result = calculate(data);
  assert.equal(result.revenue, 11000);
  assert.equal(result.total, 8350);
  assert.equal(result.profit, 2650);
  assert.equal(result.margin, 2650 / 11000 * 100);
  assert.equal(result.status, 'accepted');
});
test('全費用について空欄は保留、明示的な0は計算できる', () => {
  for (const c of costs) {
    const data = sample(); data.fees[c.key].value = '';
    const result = calculate(data);
    assert.equal(result.status, 'pending'); assert.equal(result.profit, undefined);
    assert.ok(result.issues.includes(`${c.label}が未入力です`));
    data.fees[c.key].value = '0'; assert.equal(calculate(data).status, 'accepted');
  }
});
test('基準ちょうどは採用、片方でも下回れば見送り、赤字も表示する', () => {
  const data = sample(); data.currency = 'JPY'; data.sale = '1000'; data.fees.purchase.value = '500'; data.minMargin = '50';
  assert.equal(calculate(data).status, 'accepted');
  data.minProfit = '501'; assert.equal(calculate(data).status, 'rejected');
  data.minProfit = '500'; data.minMargin = '50.01'; assert.equal(calculate(data).status, 'rejected');
  data.fees.purchase.value = '1200'; assert.equal(calculate(data).profit, -200);
});
test('JPYはレート1固定、小数の費用も計算する', () => {
  const data = sample(); data.currency = 'JPY'; data.rate = ''; data.fees.purchase.value = '10.25';
  assert.equal(calculate(data).revenue, 100); assert.equal(calculate(data).profit, 89.75);
});
test('価格・レート・基準・不正な費用を検出する', () => {
  for (const key of ['sale', 'rate', 'minProfit', 'minMargin']) {
    for (const invalid of ['', '-1', 'abc', 'Infinity']) {
      const data = sample(); data[key] = invalid; assert.equal(calculate(data).status, 'pending');
    }
  }
  for (const key of ['sale', 'rate']) { const data = sample(); data[key] = '0'; assert.equal(calculate(data).status, 'pending'); }
  for (const invalid of ['-1', 'NaN', '1,000', '1e3']) { const data = sample(); data.fees.purchase.value = invalid; assert.equal(calculate(data).status, 'pending'); }
  const data = sample(); data.fees.selling = { value: '101', mode: 'percent' }; assert.equal(calculate(data).status, 'pending');
  data.fees.selling.value = '100'; assert.equal(calculate(data).status, 'rejected');
  data.currency = 'S'; assert.equal(calculate(data).status, 'pending');
});
test('極端な値のオーバーフローを保留する', () => {
  const data = sample(); data.sale = '9'.repeat(300); data.rate = '9'.repeat(300);
  assert.equal(calculate(data).status, 'pending');
});
