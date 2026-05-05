export type JobKey = 'planner' | 'designer' | 'developer';

export type CharacterDef = {
  key: JobKey;
  label: string;
  /** 단계별 직급명 (index = level, 0~34) */
  titles: readonly string[];
  /** 캐릭터 베이스 컬러 (Phaser 16진수 숫자) */
  color: number;
};

const PLANNER_TITLES = [
  '기획 인턴',          // 0
  '신입 기획자',        // 1
  '주니어 기획자',      // 2
  '사원 기획자',        // 3
  '대리 기획자',        // 4
  '중급 기획자',        // 5
  '책임 기획자',        // 6
  '시니어 기획자',      // 7
  '수석 기획자',        // 8
  '리드 기획자',        // 9
  '프로덕트 매니저',    // 10
  '시니어 PM',          // 11
  '그룹 PM',            // 12
  '시니어 그룹 PM',     // 13
  '프로덕트 디렉터',    // 14
  '시니어 디렉터',      // 15
  'VP of Product',      // 16
  'SVP of Product',     // 17
  'EVP of Product',     // 18
  'CPO',                // 19
  '시니어 CPO',         // 20
  '전설의 기획자',      // 21
  '갓 기획자',          // 22
  '기획의 신',          // 23
  '비즈니스 그루',      // 24
  '시장의 예언자',      // 25
  '산업 디스럽터',      // 26
  '메가코프 창업자',    // 27
  '경제의 입법자',      // 28
  '문명의 설계자',      // 29
  '인류의 매니페스토',  // 30
  '시간의 로드맵 작성자', // 31
  '운명의 PM',          // 32
  '스티브 잡스 환생',   // 33
  '범우주적 프로덕트 비전',  // 34
] as const;

const DESIGNER_TITLES = [
  '디자인 부트캠프 수료생',  // 0
  '인턴 디자이너',           // 1
  '신입 디자이너',           // 2
  '주니어 디자이너',         // 3
  '어소시에이트 디자이너',   // 4
  '중급 디자이너',           // 5
  '책임 디자이너',           // 6
  '시니어 디자이너',         // 7
  '수석 디자이너',           // 8
  '리드 디자이너',           // 9
  '프린시플 디자이너',       // 10
  '디자인 매니저',           // 11
  '시니어 디자인 매니저',    // 12
  '디자인 프로듀서',         // 13
  '디자인 디렉터',           // 14
  '시니어 디자인 디렉터',    // 15
  'VP of Design',            // 16
  'SVP of Design',           // 17
  'EVP of Design',           // 18
  'CDO',                     // 19
  '시니어 CDO',              // 20
  '전설의 디자이너',         // 21
  '갓 디자이너',             // 22
  '디자인의 신',             // 23
  '미적 감각의 화신',        // 24
  '컬러의 마에스트로',       // 25
  '픽셀 우주 창조자',        // 26
  '폰트의 시인',             // 27
  '여백의 철학자',           // 28
  '비주얼 신탁',             // 29
  '도형의 점성술사',         // 30
  '디터 람스 환생',          // 31
  '미니멀의 정점',           // 32
  '존재 자체가 디자인',      // 33
  '신이 그리는 화폭',        // 34
] as const;

const DEVELOPER_TITLES = [
  '코딩 부트캠프 수료생', // 0
  '인턴 개발자',          // 1
  '신입 개발자',          // 2
  '주니어 개발자',        // 3
  '정규직 전환자',        // 4
  '중급 개발자',          // 5
  '선임 개발자',          // 6
  '시니어 개발자',        // 7
  '책임 개발자',          // 8
  '테크리드',             // 9
  '스태프 엔지니어',      // 10
  '시니어 스태프',        // 11
  '프린시플',             // 12
  '시니어 프린시플',      // 13
  '디스팅귀시드',         // 14
  '시니어 디스팅귀시드',  // 15
  '펠로우',               // 16
  '시니어 펠로우',        // 17
  'VP of Engineering',    // 18
  'CTO',                  // 19
  '시니어 CTO',           // 20
  '전설의 풀스택',        // 21
  '갓 개발자',            // 22
  '코드의 신',            // 23
  '알고리즘의 화신',      // 24
  '컴파일러 그 자체',     // 25
  '우주의 운영체제',      // 26
  '튜링상 수상자',        // 27
  '커널의 메시아',        // 28
  '머신러닝 신탁',        // 29
  '양자 코드 마법사',     // 30
  '인공일반지능 그 자체', // 31
  '시뮬레이션 작성자',    // 32
  '리누스 토르발즈 +1',   // 33
  '실리콘의 영원한 수호자', // 34
] as const;

export const CHARACTERS: Record<JobKey, CharacterDef> = {
  planner: {
    key: 'planner',
    label: '기획자',
    titles: PLANNER_TITLES,
    color: 0x4a90e2,
  },
  designer: {
    key: 'designer',
    label: '디자이너',
    titles: DESIGNER_TITLES,
    color: 0xe24a90,
  },
  developer: {
    key: 'developer',
    label: '개발자',
    titles: DEVELOPER_TITLES,
    color: 0x4ae290,
  },
};

/** 명시 직급 마지막 단계 (이 값을 초과하면 tier prefix + 마지막 직급 + "+N" 표기) */
export const TITLE_LAST_LEVEL = 34;
/** 999단계까지 도달 가능 — 후반은 idle/incremental 영역 */
export const MAX_LEVEL = 999;

/**
 * Tier 라벨 — 명시 직급(0~34)을 넘어가면 단계대별 prefix가 붙는다.
 * 35~99: 신화의, 100~199: 초월한, 200~399: 차원을 넘은,
 * 400~699: 우주의, 700~999: 옴니버스
 */
type TierDef = { fromLevel: number; prefix: string };
const TIERS: readonly TierDef[] = [
  { fromLevel: 700, prefix: '옴니버스' },
  { fromLevel: 400, prefix: '우주의' },
  { fromLevel: 200, prefix: '차원을 넘은' },
  { fromLevel: 100, prefix: '초월한' },
  { fromLevel: 35,  prefix: '신화의' },
];

function tierPrefixFor(level: number): string {
  for (const t of TIERS) {
    if (level >= t.fromLevel) return t.prefix;
  }
  return '';
}

export function titleFor(jobKey: JobKey, level: number): string {
  const titles = CHARACTERS[jobKey].titles;
  if (level <= TITLE_LAST_LEVEL) {
    return titles[Math.min(level, titles.length - 1)];
  }
  // 35단계 이상: tier prefix + 마지막 직급 + "+N"
  const lastTitle = titles[titles.length - 1];
  const prefix = tierPrefixFor(level);
  // tier가 시작하는 단계로부터의 오프셋
  const tier = TIERS.find((t) => level >= t.fromLevel);
  const offset = tier ? level - tier.fromLevel : level - TITLE_LAST_LEVEL;
  return `${prefix} ${lastTitle} +${offset}`.trim();
}
