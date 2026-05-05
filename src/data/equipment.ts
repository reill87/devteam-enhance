import type { JobKey } from './characters';

export type EquipSlot = 'main' | 'sub' | 'accessory';

export type SlotMeta = {
  key: EquipSlot;
  /** UI 라벨 (직군 무관) */
  label: string;
  emoji: string;
  /** 효과 설명 */
  effectDesc: string;
};

export const SLOTS: Record<EquipSlot, SlotMeta> = {
  main: {
    key: 'main',
    label: '메인 도구',
    emoji: '🛠️',
    effectDesc: '본체 강화 성공률 +N%p',
  },
  sub: {
    key: 'sub',
    label: '보조 도구',
    emoji: '⌨️',
    effectDesc: '자동 회복 +N×10%',
  },
  accessory: {
    key: 'accessory',
    label: '장신구',
    emoji: '🎧',
    effectDesc: '클릭 보상 +N×10%',
  },
};

/** 슬롯별 강화 이펙트 색상 (이펙트 차별화) */
export const SLOT_EFFECT_COLOR: Record<EquipSlot, number> = {
  main: 0xffd23f,        // 골드
  sub: 0x4a90e2,         // 시안
  accessory: 0xa370ff,   // 보라
};

/** 슬롯별 강화 이펙트 라벨 (성공 시 컷인) */
export const SLOT_EFFECT_LABEL: Record<EquipSlot, string> = {
  main: '⚒ 도구 단조',
  sub: '⌨ 보조 튜닝',
  accessory: '🎧 감각 증폭',
};

export const SLOT_KEYS: readonly EquipSlot[] = ['main', 'sub', 'accessory'];

/** 명시 직급명 마지막 인덱스 (11~ 이상은 마지막 직급명 + "+N" 표기) */
export const EQUIP_TITLE_LAST_LEVEL = 10;
/** 본체 강화와 동일하게 lv 999까지 도달 가능 */
export const EQUIP_MAX_LEVEL = 999;

/** 직군별 × 슬롯별 단계 이름 (인덱스 = 단계, 0~10 11개) */
type SlotTitles = Record<EquipSlot, readonly string[]>;
type AllTitles = Record<JobKey, SlotTitles>;

const DEVELOPER_TITLES: SlotTitles = {
  main: [
    '회사 지급 노트북',
    '낡은 맥북',
    '맥북 에어 M2',
    '맥북 프로 14',
    '맥북 프로 16',
    '풀스펙 M3 Max',
    '듀얼 부팅 워크스테이션',
    '커스텀 데스크탑',
    '리눅스 마법사 머신',
    '외계인 노트북',
    '양자 컴퓨터',
  ],
  sub: [
    '멤브레인 키보드',
    '저렴한 기계식',
    '체리 청축',
    'HHKB 베이지',
    'HHKB 묵',
    '커스텀 키보드',
    '에르고독스',
    '아이리스 분리형',
    '코르네 무선',
    '뇌파 인식기',
    '직접 두뇌 입력',
  ],
  accessory: [
    '인이어 이어폰',
    '회사 지급 헤드셋',
    '에어팟 2',
    '에어팟 프로',
    '에어팟 맥스',
    '소니 WH-1000XM',
    '보스 QC',
    '하이엔드 모니터링',
    '스튜디오 헤드폰',
    '집중력의 콴텀 헤드폰',
    '의식 흐름 동기화 장치',
  ],
};

const PLANNER_TITLES: SlotTitles = {
  main: [
    '포스트잇 메모',
    'A4 메모지',
    '대학노트',
    '몰스킨',
    '미도리 트래블러',
    '노션 워크스페이스',
    '피그마 정리광',
    '로그시크 + 옵시디언',
    '사고 직결 노트',
    '미래 예측 다이어리',
    '두뇌 직결 다이렉트 메모리',
  ],
  sub: [
    '모나미 153',
    '제트스트림',
    '라미 사파리',
    '몽블랑 스타워커',
    '몽블랑 마이스터스튁',
    '파카 듀오폴드',
    '카르티에 만년필',
    '한정판 만년필',
    '잉크 자동 보충 펜',
    '사념 입력 펜',
    '의지로 쓰는 펜',
  ],
  accessory: [
    '안경 없음',
    '저렴한 안경',
    '디자이너 안경',
    '톰포드',
    '올리버피플즈',
    '다이아 박힌 안경',
    '커스텀 티타늄',
    '한정판 명품',
    '안경렌즈에 AR',
    'XR 글래스',
    '뇌파 인터페이스 안경',
  ],
};

const DESIGNER_TITLES: SlotTitles = {
  main: [
    '구형 와콤',
    '와콤 인튜오스',
    '와콤 인튜오스 프로',
    '신틱 16',
    '신틱 24',
    '아이패드 프로 11',
    '아이패드 프로 13',
    '신틱 프로 32',
    '듀얼 신틱 셋업',
    '홀로그램 캔버스',
    '꿈에서 그리는 도구',
  ],
  sub: [
    '연필',
    '드로잉 펜',
    '와콤 펜',
    '애플 펜슬 1',
    '애플 펜슬 프로',
    '한정판 스타일러스',
    '필압 무한 인식 펜',
    '컬러 자동 추천 펜',
    '레이어 자동 분리 펜',
    'AI 보조 펜',
    '생각으로 그리는 펜',
  ],
  accessory: [
    '24인치 모니터',
    '27인치 IPS',
    '32인치 4K',
    '32인치 5K',
    '레퍼런스 모니터',
    '듀얼 5K',
    '트리플 모니터',
    '컬러 보정 4중 셋업',
    '6K HDR 마스터',
    '8K 홀로그램',
    '망막 직접 투사',
  ],
};

export const EQUIPMENT_TITLES: AllTitles = {
  developer: DEVELOPER_TITLES,
  planner: PLANNER_TITLES,
  designer: DESIGNER_TITLES,
};

/**
 * 장비 강화 곡선 (단순화 — 본체보다 짧고 약함).
 * 0~10 11단계, 후반은 fail-stay만 (장비 폭사 없음 — UX 단순화).
 */
export type EquipRate = { successRate: number; cost: number };
export const EQUIP_RATES: readonly EquipRate[] = [
  { successRate: 1.00, cost: 50    },  // 0 → 1
  { successRate: 1.00, cost: 100   },  // 1 → 2
  { successRate: 0.95, cost: 200   },  // 2 → 3
  { successRate: 0.85, cost: 400   },  // 3 → 4
  { successRate: 0.75, cost: 800   },  // 4 → 5
  { successRate: 0.60, cost: 1500  },  // 5 → 6
  { successRate: 0.45, cost: 3000  },  // 6 → 7
  { successRate: 0.30, cost: 6000  },  // 7 → 8
  { successRate: 0.20, cost: 12000 },  // 8 → 9
  { successRate: 0.10, cost: 24000 },  // 9 → 10
];

export function equipTitleFor(job: JobKey, slot: EquipSlot, level: number): string {
  const titles = EQUIPMENT_TITLES[job][slot];
  const idx = Math.min(level, titles.length - 1);
  return titles[idx];
}

/**
 * 장비 효과 (단계 N → 효과 값). 무제한 단계 적용.
 * - main:      성공률 +1.5%p × N (lv 10=+15%p, lv 22=+33%p)
 * - sub:       자동회복 ×(1 + 0.15 × N) (lv 10=×2.5, lv 22=×4.3)
 * - accessory: 클릭 보상 ×(1 + 0.15 × N) (lv 10=×2.5, lv 22=×4.3)
 */
export function mainBonusPct(level: number): number {
  return level * 0.015;
}
export function subMultiplier(level: number): number {
  return 1 + level * 0.15;
}
export function accessoryMultiplier(level: number): number {
  return 1 + level * 0.15;
}
