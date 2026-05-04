export type JobKey = 'planner' | 'designer' | 'developer';

export type CharacterDef = {
  key: JobKey;
  label: string;
  /** 단계별 직급명 (index = level, 0~10) */
  titles: readonly string[];
  /** 캐릭터 베이스 컬러 (Phaser 16진수 숫자) */
  color: number;
};

const PLANNER_TITLES = [
  '기획 인턴',
  '신입 기획자',
  '주니어 기획자',
  '사원 기획자',
  '대리 기획자',
  '중급 기획자',
  '책임 기획자',
  '시니어 기획자',
  '수석 기획자',
  '리드 기획자',
  '프로덕트 매니저',
  '시니어 PM',
  '그룹 PM',
  '프로덕트 디렉터',
  'VP of Product',
  'CPO',
  '전설의 기획자',
  '갓 기획자',
  '기획의 신',
  '비즈니스 그루',
  '시장의 예언자',
  '산업 디스럽터',
  '스티브 잡스 환생',
] as const;

const DESIGNER_TITLES = [
  '디자인 부트캠프 수료생',
  '인턴 디자이너',
  '신입 디자이너',
  '주니어 디자이너',
  '어소시에이트 디자이너',
  '중급 디자이너',
  '책임 디자이너',
  '시니어 디자이너',
  '수석 디자이너',
  '리드 디자이너',
  '프린시플 디자이너',
  '디자인 매니저',
  '시니어 디자인 매니저',
  '디자인 디렉터',
  'VP of Design',
  'CDO',
  '전설의 디자이너',
  '갓 디자이너',
  '디자인의 신',
  '미적 감각의 화신',
  '컬러의 마에스트로',
  '픽셀 우주 창조자',
  '디터 람스 환생',
] as const;

const DEVELOPER_TITLES = [
  '코딩 부트캠프 수료생',
  '인턴 개발자',
  '신입 개발자',
  '주니어 개발자',
  '정규직 전환자',
  '중급 개발자',
  '선임 개발자',
  '시니어 개발자',
  '책임 개발자',
  '테크리드',
  '스태프 엔지니어',
  '시니어 스태프',
  '프린시플',
  '디스팅귀시드',
  '펠로우',
  'CTO',
  '전설의 풀스택',
  '갓 개발자',
  '코드의 신',
  '알고리즘의 화신',
  '컴파일러 그 자체',
  '우주의 운영체제',
  '튜링상 수상자',
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

/** 명시된 직급명이 끝나는 단계 (이 값 이상부터는 마지막 직급명 + "+N" 표기) */
export const TITLE_LAST_LEVEL = 22;
/** 사실상 무제한이지만 타입 안전을 위해 큰 값으로 둠 (도달 불가) */
export const MAX_LEVEL = 9999;

export function titleFor(jobKey: JobKey, level: number): string {
  const titles = CHARACTERS[jobKey].titles;
  if (level < titles.length) return titles[level];
  return `${titles[titles.length - 1]} +${level - (titles.length - 1)}`;
}
