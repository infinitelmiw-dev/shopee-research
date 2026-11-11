(() => {
'use strict';
const costs = [
  { key: 'purchase', label: '仕入れ価格' },
  { key: 'domestic', label: '国内送料' },
  { key: 'international', label: '国際送料' },
  { key: 'packaging', label: '梱包費' },
  { key: 'selling', label: '販売手数料', flexible: true },
  { key: 'payment', label: '決済手数料', flexible: true },
  { key: 'exchange', label: '為替費用', flexible: true },
  { key: 'returns', label: '返品損失見込み', flexible: true },
];

function number(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '') return null;
  if (!/^\d+(\.\d+)?$/.test(String(value).trim())) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function calculate(data) {
  const issues = [];
  function read(raw, label, { positive = false, percent = false } = {}) {
    const value = number(raw);
    if (value === null) issues.push(`${label}が未入力です`);
    else if (!Number.isFinite(value) || value < 0 || (positive && value <= 0) || (percent && value > 100)) {
      issues.push(`${label}は${positive ? '0より大きい数値' : percent ? '0〜100の数値' : '0以上の数値'}で入力してください`);
    }
    return value;
  }
  const sale = read(data.sale, '想定販売価格', { positive: true });
  const rate = data.currency === 'JPY' ? 1 : read(data.rate, '為替レート', { positive: true });
  if (!/^[A-Z]{3}$/.test(data.currency || '')) issues.push('販売通貨は3文字の通貨コードで入力してください');
  const revenue = sale * rate;
  const breakdown = costs.map(cost => {
    const mode = data.fees?.[cost.key]?.mode || 'yen';
    if (!['yen', 'percent'].includes(mode) || (!cost.flexible && mode !== 'yen')) issues.push(`${cost.label}の単位が不正です`);
    const value = read(data.fees?.[cost.key]?.value, cost.label, { percent: mode === 'percent' });
    return { ...cost, amount: mode === 'percent' ? revenue * value / 100 : value };
  });
  const minProfit = read(data.minProfit, '最低利益額');
  const minMargin = read(data.minMargin, '最低利益率', { percent: true });
  if (issues.length) return { status: 'pending', issues };
  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const profit = revenue - total;
  const margin = profit / revenue * 100;
  if (![revenue, total, profit, margin].every(Number.isFinite) || revenue <= 0) {
    return { status: 'pending', issues: ['金額が計算可能な範囲を超えています。入力値を確認してください'] };
  }
  const status = profit >= minProfit && margin >= minMargin ? 'accepted' : 'rejected';
  return { status, issues: [], revenue, total, profit, margin, breakdown };
}

globalThis.ShopeeCalculator = Object.freeze({ costs, calculate, number });
})();
