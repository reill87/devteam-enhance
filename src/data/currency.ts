export type CurrencyKey = 'KRW' | 'USD';

/**
 * gold (게임 내 단위) → 표시 통화 환율.
 * 1 gold = ₩10,000 = $7 (대략 환율 ≒ 1,400원/USD)
 */
export const RATES: Record<CurrencyKey, number> = {
  KRW: 10_000,
  USD: 7,
};

const KRW_FORMATTER_INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const USD_FORMATTER_INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * gold → 통화 단위 표시 문자열.
 * - KRW: 100억 이상 "조" / 1억 이상 "억" / 10000 이상 "만" / 그 외 풀 자리수
 * - USD: 1M 이상 M / 1K 이상 K / 그 외 풀 자리수
 */
export function formatGold(gold: number, currency: CurrencyKey): string {
  const value = gold * RATES[currency];
  if (currency === 'KRW') {
    if (value >= 1_000_000_000_000) return `₩${(value / 1_000_000_000_000).toFixed(1)}조`;
    if (value >= 100_000_000) return `₩${(value / 100_000_000).toFixed(1)}억`;
    if (value >= 10_000) return `₩${(value / 10_000).toFixed(0)}만`;
    return `₩${KRW_FORMATTER_INT.format(value)}`;
  }
  // USD
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${USD_FORMATTER_INT.format(value)}`;
}

/**
 * 연봉 표시 (KRW 원 단위 입력 → 표시 통화).
 */
export function formatSalary(salaryKRW: number, currency: CurrencyKey): string {
  if (currency === 'KRW') {
    if (salaryKRW >= 1e16) return `₩${(salaryKRW / 1e16).toFixed(1)}경`;
    if (salaryKRW >= 1e12) return `₩${(salaryKRW / 1e12).toFixed(1)}조`;
    if (salaryKRW >= 1e8) return `₩${(salaryKRW / 1e8).toFixed(1)}억`;
    if (salaryKRW >= 1e4) return `₩${(salaryKRW / 1e4).toFixed(0)}만`;
    return `₩${KRW_FORMATTER_INT.format(salaryKRW)}`;
  }
  // KRW → USD: 환율 1USD ≒ 1400 KRW
  const usd = salaryKRW / 1400;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${USD_FORMATTER_INT.format(usd)}`;
}

export function nextCurrency(c: CurrencyKey): CurrencyKey {
  return c === 'KRW' ? 'USD' : 'KRW';
}
