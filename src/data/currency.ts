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
 * 한국어 큰 수 단위 (높은 값부터 검사).
 * 만(10^4) ~ 무량대수(10^68)까지 커버.
 */
const KRW_UNITS: readonly { v: number; name: string }[] = [
  { v: 1e68, name: '무량대수' },
  { v: 1e64, name: '불가사의' },
  { v: 1e60, name: '나유타' },
  { v: 1e56, name: '아승기' },
  { v: 1e52, name: '항하사' },
  { v: 1e48, name: '극' },
  { v: 1e44, name: '재' },
  { v: 1e40, name: '정' },
  { v: 1e36, name: '간' },
  { v: 1e32, name: '구' },
  { v: 1e28, name: '양' },
  { v: 1e24, name: '자' },
  { v: 1e20, name: '해' },
  { v: 1e16, name: '경' },
  { v: 1e12, name: '조' },
  { v: 1e8, name: '억' },
  { v: 1e4, name: '만' },
];

/**
 * KRW 값을 한국어 단위로 압축 표기. 무량대수보다 크면 깔끔한 과학 표기.
 * toFixed가 1e21 이상에서 지수 표기로 빠지는 문제 회피.
 */
function fmtCompactKRW(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '₩∞';
  if (value < 1) return KRW_FORMATTER_INT.format(value);
  // 무량대수 ×1000 이상은 과학 표기 (한글 단위로 더 못 표기)
  if (value >= 1e71) {
    const exp = Math.floor(Math.log10(value));
    const mantissa = value / Math.pow(10, exp);
    return `${mantissa.toFixed(2)}×10^${exp}`;
  }
  for (const u of KRW_UNITS) {
    if (value >= u.v) {
      const x = value / u.v;
      // x가 1000 미만이면 .1 표기, 그 이상이면 정수
      return `${x < 1000 ? x.toFixed(1) : x.toFixed(0)}${u.name}`;
    }
  }
  return KRW_FORMATTER_INT.format(value);
}

/**
 * gold → 통화 단위 표시 문자열.
 * - KRW: 100억 이상 "조" / 1억 이상 "억" / 10000 이상 "만" / 그 외 풀 자리수
 * - USD: 1M 이상 M / 1K 이상 K / 그 외 풀 자리수
 */
export function formatGold(gold: number, currency: CurrencyKey): string {
  const value = gold * RATES[currency];
  if (currency === 'KRW') {
    return `₩${fmtCompactKRW(value)}`;
  }
  // USD
  if (!isFinite(value) || isNaN(value)) return '$∞';
  if (value >= 1e21) {
    const exp = Math.floor(Math.log10(value));
    const mantissa = value / Math.pow(10, exp);
    return `$${mantissa.toFixed(2)}×10^${exp}`;
  }
  if (value >= 1e15) return `$${(value / 1e15).toFixed(2)}Q`;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
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
    return `₩${fmtCompactKRW(salaryKRW)}`;
  }
  // KRW → USD: 환율 1USD ≒ 1400 KRW
  const usd = salaryKRW / 1400;
  if (!isFinite(usd) || isNaN(usd)) return '$∞';
  if (usd >= 1e21) {
    const exp = Math.floor(Math.log10(usd));
    const mantissa = usd / Math.pow(10, exp);
    return `$${mantissa.toFixed(2)}×10^${exp}`;
  }
  if (usd >= 1e15) return `$${(usd / 1e15).toFixed(2)}Q`;
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${USD_FORMATTER_INT.format(usd)}`;
}

export function nextCurrency(c: CurrencyKey): CurrencyKey {
  return c === 'KRW' ? 'USD' : 'KRW';
}
