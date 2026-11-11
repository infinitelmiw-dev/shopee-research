(() => {
'use strict';
const { costs, calculate, number } = globalThis.ShopeeCalculator;
const $ = id => document.getElementById(id);
const storageKey = 'shopee-research.settings.v1';
const draftKey = 'shopee-research.product.v1';
const fieldIds = ['product-url', 'sale', 'currency', 'rate', ...costs.flatMap(c => c.flexible ? [c.key, `${c.key}-mode`] : [c.key]), 'min-profit', 'min-margin'];
let lastField = '';
const yen = value => `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value)} 円`;
let settings = null;
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved?.version === 1) settings = saved; }
catch { $('save-message').textContent = '保存設定を読み込めませんでした。現在の入力で計算できます。'; }

for (const cost of costs) {
  const saved = settings?.fees?.[cost.key];
  if (cost.key !== 'purchase' && saved && typeof saved.value === 'string') {
    $(cost.key).value = saved.value;
    if (cost.flexible) $(`${cost.key}-mode`).value = saved.mode === 'percent' ? 'percent' : 'yen';
  }
}
if (settings) {
  for (const [key, id] of [['currency', 'currency'], ['rate', 'rate'], ['minProfit', 'min-profit'], ['minMargin', 'min-margin']]) {
    if (typeof settings[key] === 'string') $(id).value = settings[key];
  }
  $('save-message').textContent = 'このブラウザに保存された設定を読み込みました。';
}
function data() {
  return {
    sale: $('sale').value, currency: $('currency').value.trim().toUpperCase(), rate: $('rate').value,
    minProfit: $('min-profit').value, minMargin: $('min-margin').value,
    fees: Object.fromEntries(costs.map(c => [c.key, { value: $(c.key).value, mode: c.flexible ? $(`${c.key}-mode`).value : 'yen' }])),
  };
}
let previousRate = $('rate').value;
try {
  const draft = JSON.parse(localStorage.getItem(draftKey));
  if (draft !== null) {
    if (draft?.version !== 1 || !draft.fields || typeof draft.fields !== 'object') throw new Error('Invalid draft');
    for (const id of fieldIds) {
      const value = draft.fields[id];
      if (typeof value !== 'string') continue;
      if (id.endsWith('-mode') && !['yen', 'percent'].includes(value)) continue;
      $(id).value = value; // Restore raw text: empty string and "0" are different.
    }
    if (typeof draft.previousRate === 'string') previousRate = draft.previousRate;
    if (fieldIds.includes(draft.lastField)) lastField = draft.lastField;
    $('draft-message').textContent = '前回の商品入力を復元しました。変更は自動保存されます。';
  }
} catch {
  $('draft-message').textContent = '商品入力を読み込めませんでした。保存済みの料金設定は維持しています。入力内容を確認してください。';
}
function refreshResumeButton() {
  $('resume-input').hidden = !lastField;
}
function saveDraft(message = '商品入力を自動保存しました。') {
  try {
    localStorage.setItem(draftKey, JSON.stringify({
      version: 1,
      fields: Object.fromEntries(fieldIds.map(id => [id, $(id).value])),
      lastField, previousRate,
    }));
    $('draft-message').textContent = message;
    return true;
  } catch {
    $('draft-message').textContent = '商品入力を自動保存できませんでした。再読み込みすると入力が失われる可能性があります。ブラウザのストレージ設定を確認してください。';
    return false;
  }
}
function update() {
  const currency = $('currency').value.trim().toUpperCase();
  if (currency === 'JPY') {
    if (!$('rate').disabled) previousRate = $('rate').value;
    $('rate').value = '1'; $('rate').disabled = true;
  } else if ($('rate').disabled) { $('rate').disabled = false; $('rate').value = previousRate; }
  $('sale-unit').textContent = currency || '通貨';
  $('rate-label').textContent = `1 ${currency || '通貨'} あたりの日本円`;
  const result = calculate(data());
  const labels = { pending: '判定保留', accepted: '採用候補', rejected: '見送り' };
  $('verdict').textContent = labels[result.status];
  $('verdict').className = `verdict ${result.status}`;
  $('verdict-description').textContent = result.status === 'pending' ? '未入力・不正な値があるため、利益と判定を保留しています。' : result.status === 'accepted' ? '最低利益額・最低利益率の両方を満たしています。' : '採用基準を満たしていません。費用や販売価格を見直しましょう。';
  const pending = result.status === 'pending';
  $('profit').textContent = pending ? '— 円' : yen(result.profit);
  $('margin').textContent = pending ? '—' : `${result.margin.toFixed(2)} %`;
  $('revenue').textContent = pending ? '—' : yen(result.revenue);
  $('total').textContent = pending ? '—' : yen(result.total);
  $('issues-block').hidden = !pending;
  $('breakdown-details').hidden = pending;
  $('issues').replaceChildren(...result.issues.map(issue => { const li = document.createElement('li'); li.textContent = issue; return li; }));
  $('breakdown').replaceChildren(...(result.breakdown || []).map(item => {
    const row = document.createElement('div'); row.className = 'result-row';
    const label = document.createElement('span'); label.textContent = item.label;
    const value = document.createElement('span'); value.textContent = yen(item.amount);
    row.append(label, value); return row;
  }));
  for (const input of document.querySelectorAll('input[inputmode="decimal"]')) {
    const value = number(input.value);
    const percent = input.id === 'min-margin' || $(`${input.id}-mode`)?.value === 'percent';
    const positive = input.id === 'sale' || input.id === 'rate';
    const invalid = value !== null && (!Number.isFinite(value) || value < 0 || (positive && value <= 0) || (percent && value > 100));
    input.setAttribute('aria-invalid', String(invalid));
  }
}
function onEdit(event) {
  if (!fieldIds.includes(event.target.id)) return;
  lastField = event.target.id;
  update();
  refreshResumeButton();
  saveDraft();
  if (!['product-url', 'sale', 'purchase'].includes(event.target.id)) $('save-message').textContent = '商品入力は自動保存されます。新しい商品の初期設定にも使う場合は、下の保存ボタンを押してください。';
}
document.querySelector('main').addEventListener('input', onEdit);
document.querySelector('main').addEventListener('change', onEdit);
$('resume-input').addEventListener('click', () => {
  const input = $(lastField);
  if (!input) return;
  const target = input.disabled ? $('currency') : input;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
});
$('new-product').addEventListener('click', () => {
  if (!window.confirm('新しい商品を調べますか？\n商品URL・販売価格・仕入れ価格を空欄にし、その他の費用と単位は保存済み料金に戻します（設定がない費用は空欄）。\n通貨・為替・採用基準と保存済み設定は維持します。現在の商品入力は置き換わります。')) return;
  for (const id of ['product-url', 'sale']) $(id).value = '';
  for (const cost of costs) {
    const fee = cost.key === 'purchase' ? null : settings?.fees?.[cost.key];
    $(cost.key).value = typeof fee?.value === 'string' ? fee.value : '';
    if (cost.flexible) $(`${cost.key}-mode`).value = fee?.mode === 'percent' ? 'percent' : 'yen';
  }
  lastField = '';
  update();
  refreshResumeButton();
  saveDraft('新しい商品を開始しました。料金設定・採用基準は維持しています。');
  $('product-url').focus({ preventScroll: true });
  $('product-url').scrollIntoView({ block: 'center', behavior: 'instant' });
});
// Synchronous input saves are primary; lifecycle saves also cover browser autofill.
window.addEventListener('pagehide', () => saveDraft());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); });
$('save-settings').addEventListener('click', () => {
  const current = data();
  // Validate saved fields while allowing explicitly unknown (empty) fees and rate.
  const probe = { ...current, sale: '100', rate: current.rate.trim() || '1', fees: Object.fromEntries(Object.entries(current.fees).map(([key, fee]) => [key, { ...fee, value: key === 'purchase' ? '0' : fee.value.trim() || '0' }])) };
  const checked = calculate(probe);
  if (checked.status === 'pending') { $('save-message').textContent = `保存できません：${checked.issues.join('。')}`; return; }
  const { sale, ...saved } = current;
  delete saved.fees.purchase;
  try {
    const nextSettings = { version: 1, ...saved };
    localStorage.setItem(storageKey, JSON.stringify(nextSettings));
    settings = nextSettings;
    $('save-message').textContent = '保存しました。新しい商品でもこの料金・為替・基準を初期設定に使います。';
  } catch { $('save-message').textContent = '保存できませんでした。ブラウザのストレージ設定を確認してください。現在の入力で計算は続けられます。'; }
});
// A restored JPY draft already has its foreign-rate backup; do not replace it with 1.
if ($('currency').value.trim().toUpperCase() === 'JPY') { $('rate').value = '1'; $('rate').disabled = true; }
update();
refreshResumeButton();

$('startup-message').hidden = true;
})();
