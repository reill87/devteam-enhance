import type { JobKey } from './characters';

export type MessageBucket = 'success' | 'fail-stay' | 'fail-down' | 'destroy';

type MessagePool = Record<MessageBucket, readonly string[]>;

const DEVELOPER: MessagePool = {
  success: [
    '사이드 프로젝트가 GitHub 트렌딩에 올랐습니다!',
    '테크 블로그가 입소문이 났습니다.',
    '스카웃 메일이 쇄도합니다.',
    '배포 후 24시간 무사고를 달성했습니다.',
    '"저 사람 코드는 믿고 본다"는 말이 돌기 시작했습니다.',
  ],
  'fail-stay': [
    '코드 리뷰에서 50개의 코멘트를 받았습니다.',
    'lint 에러 23개가 한 번에 떴습니다.',
    '테스트 커버리지가 떨어졌다는 알림을 받았습니다.',
    'TypeScript에 any를 한 번 더 썼습니다.',
    '어제 짠 코드가 기억나지 않습니다.',
  ],
  'fail-down': [
    '프로덕션에서 NullPointerException이 발생했습니다.',
    '금요일 오후 6시에 배포한 코드가 롤백됐습니다.',
    'Stack Overflow가 다운됐고, 아무것도 못 했습니다.',
    'PR이 두 달째 리뷰 대기 중입니다.',
    '기술 부채를 갚으려다 새 부채를 만들었습니다.',
  ],
  destroy: [
    'rm -rf / 를 prod 서버에서 실행했습니다.',
    'force push로 main 브랜치를 통째로 날렸습니다.',
    'AWS 청구서를 받고 회사가 망했습니다.',
    'AI에게 일자리를 뺏겼습니다.',
    '퇴사하고 농사를 짓기로 했습니다.',
  ],
};

const PLANNER: MessagePool = {
  success: [
    '임원 보고에서 박수가 나왔습니다.',
    '기획서가 별다른 수정 없이 통과됐습니다.',
    '개발자가 "아, 이거 명확하네요"라고 말했습니다.',
    '핵심 지표가 가설대로 움직였습니다.',
    '다른 팀에서 벤치마킹하러 왔습니다.',
  ],
  'fail-stay': [
    '요구사항이 또 바뀌었습니다.',
    '"간단한 거잖아요"라는 말을 들었습니다.',
    '회의가 또 다른 회의를 낳았습니다.',
    'Figma에 코멘트가 47개 달렸습니다.',
    '백로그가 또 늘어났습니다.',
  ],
  'fail-down': [
    '임원이 데모를 보고 한 마디 했습니다: "이거 왜 이래요?"',
    '스프린트 회고에서 본인 이름이 5번 나왔습니다.',
    'PRD가 통째로 반려됐습니다.',
    '런칭 D-1에 스코프가 두 배가 됐습니다.',
    'AB 테스트 결과가 음수로 나왔습니다.',
  ],
  destroy: [
    '런칭 다음 날 서비스가 종료됐습니다.',
    '본인이 만든 기능을 본인이 못 찾았습니다.',
    '결재라인이 7단계라는 사실을 알게 됐습니다.',
    '"우리 다시 처음부터 생각해볼까요?" 를 들었습니다.',
    'PM 자격증 학원을 알아보기 시작했습니다.',
  ],
};

const DESIGNER: MessagePool = {
  success: [
    '시안이 1차에 통과됐습니다.',
    'Dribbble에 올린 작업물이 좋아요 폭발 중입니다.',
    '개발자가 "이거 그대로 갈게요"라고 말했습니다.',
    '디자인 시스템이 회사 표준이 됐습니다.',
    '다른 회사에서 포트폴리오 보고 연락이 왔습니다.',
  ],
  'fail-stay': [
    '시안이 4번째 반려됐습니다.',
    '"좀 더 임팩트 있게"라는 피드백을 받았습니다.',
    '픽셀 정렬을 8번째 다시 했습니다.',
    'Figma 파일이 200MB가 됐습니다.',
    '폰트를 또 바꿔달라는 요청이 왔습니다.',
  ],
  'fail-down': [
    '개발자가 "이거 구현 안 돼요"라고 말했습니다.',
    '임원이 "이건 좀 촌스럽지 않아요?"라고 말했습니다.',
    '"그냥 부트스트랩 쓰면 안 돼요?"를 들었습니다.',
    '퍼블리셔가 시안을 자체 판단으로 다시 그렸습니다.',
    'QA가 디자인 가이드 위반 30건을 잡았습니다.',
  ],
  destroy: [
    '회사가 "AI로 디자인을 자동화한다"고 발표했습니다.',
    '본인 시안이 PPT 짤이 되어 돌아다닙니다.',
    '임원의 사촌이 디자인을 다시 했습니다.',
    'Comic Sans로 바꿔달라는 요청을 받았습니다.',
    '프리랜서로 전향하기로 결심했습니다.',
  ],
};

const MESSAGES: Record<JobKey, MessagePool> = {
  developer: DEVELOPER,
  planner: PLANNER,
  designer: DESIGNER,
};

export function pickMessage(job: JobKey, bucket: MessageBucket): string {
  const pool = MESSAGES[job][bucket];
  return pool[Math.floor(Math.random() * pool.length)];
}
