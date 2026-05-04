/**
 * 디자인 토큰. 모든 색상을 한 곳에서 관리.
 *
 * 무드: A+B 믹스 — 평소엔 사무실 다크 톤, 강화/잭팟 순간엔 카지노 골드 글로우.
 */

export const COLORS = {
  // === 배경 ===
  bg: 0x0a0a10,
  bgPanel: 0x16161e,
  bgPanelDeep: 0x0e0e16,
  bgPanelLight: 0x1f1f28,
  border: 0x2a2a36,
  borderHover: 0x3a3a44,
  borderSubtle: 0x1a1a22,

  // === 텍스트 (number + string 동시 제공) ===
  text: 0xffffff,
  textMuted: 0x9aa0a6,
  textSubtle: 0x5f6368,
  textDim: 0x4a4a52,

  // === 골드 (강화/연봉/잭팟) ===
  gold: 0xffd23f,
  goldGlow: 0xffe06f,
  goldDeep: 0xe2a800,

  // === 결과 색 ===
  success: 0x4ae290,
  successGlow: 0x9af0a8,
  warning: 0xe2c84a,
  danger: 0xe24a4a,
  dangerGlow: 0xff8080,

  // === 액센트 ===
  blue: 0x4a90e2,
  blueDeep: 0x2a70c2,
  purple: 0xa370ff,
  pink: 0xe24a90,
  orange: 0xff8c42,
  teal: 0x4ae2c8,
  indigo: 0x5a4ae2,
  brown: 0x8b5a3c,
  slate: 0x6a7080,
  navy: 0x4a6a8a,
  plum: 0x8a4a8a,
} as const;

/** 16진수 number → "#RRGGBB" 문자열 */
export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** 자주 쓰는 텍스트 스타일 프리셋 */
export const TEXT = {
  /** 직급명 — 큰 글씨, 흰색 + 그림자 */
  title: {
    fontFamily: 'Pretendard, sans-serif',
    fontSize: '52px',
    color: hex(COLORS.text),
    fontStyle: 'bold',
  },
  /** 부제 — 직군 라벨 / 연봉 등 */
  subtitle: {
    fontFamily: 'Pretendard, sans-serif',
    fontSize: '22px',
    color: hex(COLORS.textMuted),
    fontStyle: 'normal',
  },
  /** 단계 숫자 — 거대 글씨, 검은색 */
  hugeNum: {
    fontFamily: 'Pretendard, sans-serif',
    fontSize: '130px',
    color: '#0e0e12',
    fontStyle: 'bold',
  },
  /** 본문 텍스트 */
  body: {
    fontFamily: 'Pretendard, sans-serif',
    fontSize: '20px',
    color: hex(COLORS.text),
  },
  /** 작은 보조 텍스트 */
  caption: {
    fontFamily: 'Pretendard, sans-serif',
    fontSize: '14px',
    color: hex(COLORS.textSubtle),
  },
} as const;
