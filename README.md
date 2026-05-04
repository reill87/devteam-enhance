# 개발팀 강화하기

검 강화 메커니즘 + 개발팀 직군 풍자 컨셉의 웹 게임. Phaser 3 + Vite + TypeScript.

## 핵심 기능

- **무제한 단계 강화** — 0~22 명시 직급 + 23+ procedural (`튜링상 수상자 +N`)
- **장비 시스템** — 메인/보조/장신구 3슬롯 × 직군별 11종 + 무제한 procedural
- **보조 아이템 6종** — 보호권, 축복권, 슈퍼 축복권, 장인의 손길(쿨다운+인플레이션), 부활권, 행운 부적
- **수익 자동화** — 자동 회복, 자동 출근(lv 5+), 사이드 프로젝트, 스카웃 메일, 헤드헌터 잭팟
- **AFK 보상** — 자리비움 시간(8h 캡) 동안 누적 골드 일괄 지급
- **이직 시스템** — 명성치(prestige) 영구 보너스
- **팀 시너지** — 직군별 best 단계 → 강화/회복/클릭 영구 보너스
- **타이밍 게이지** — 강화 빌드업 중 탭으로 +%p 보너스
- **콤보 시스템** — 연속 성공 시 다음 강화 +%p
- **랜덤 이벤트** — 긴급 장애 알림, 출근 RNG 잭팟 (야근/성과급/스톡옵션)
- **클라우드 세이브** — Supabase 익명 인증, 다른 기기에서 이어서
- **리더보드** — 직군별/종합/명성치 정렬

## 로컬 개발

```bash
npm install
cp .env.example .env
# .env 파일에 stockontext 프로젝트의 Supabase URL과 ANON_KEY를 입력 (VITE_ 접두사로)
npm run dev
```

`.env`가 비어있어도 게임은 로컬 모드로 동작합니다 (클라우드 기능은 비활성).

## 배포 — Vercel

### 1. Supabase 스키마 적용

`docs/supabase-schema.sql`을 stockontext와 같은 Supabase 프로젝트의 SQL Editor에서 실행:

1. Supabase 대시보드 → SQL Editor
2. `docs/supabase-schema.sql` 내용 붙여넣기
3. Run
4. Authentication → Providers에서 **Anonymous Sign-Ins** 활성화

### 2. GitHub 레포지토리 생성

`reill87@naver.com` 계정으로:

```bash
# 1. https://github.com/new 에서 새 레포 생성 (예: devteam-enhance, public)
# 2. SSH 키 또는 Personal Access Token 인증 설정
# 3. 로컬에서:
git remote add origin git@github.com:<reill87계정>/devteam-enhance.git
git branch -M main
git push -u origin main
```

### 3. Vercel 연결

1. https://vercel.com/new 에서 GitHub 레포 import
2. Framework Preset: **Vite** (자동 인식)
3. Environment Variables 추가:
   - `VITE_SUPABASE_URL` = stockontext 프로젝트의 URL
   - `VITE_SUPABASE_ANON_KEY` = stockontext 프로젝트의 anon key
4. Deploy

배포 완료 후 표시되는 도메인(예: `https://devteam-enhance.vercel.app`)이 게임 URL.

## 단축키 (게임 화면)

| 키 | 기능 |
|---|---|
| Space | 강화하기 (스킵 포함) |
| W | 출근하기 |
| B | 테크 블로그 |
| 1~6 | 아이템 토글 (축복/슈퍼/보호/부활/행운/장인) |
| S | 상점 |
| E | 이직 |

## 폴더 구조

```
src/
├── main.ts                 # Phaser 부트스트랩
├── config.ts               # 게임 설정
├── lib/
│   └── supabase.ts         # Supabase 클라이언트
├── scenes/
│   ├── BootScene.ts        # 클라우드 동기화 + 메뉴 전환
│   ├── MenuScene.ts        # 메뉴 + 닉네임 + 리더보드
│   └── GameScene.ts        # 메인 게임 (강화/장비/수익/모달)
├── data/
│   ├── characters.ts       # 직군 + 직급명
│   ├── rates.ts            # 강화 곡선
│   ├── items.ts            # 보조 아이템
│   ├── messages.ts         # 직군별 풍자 메시지
│   ├── equipment.ts        # 장비 슬롯/직급명/효과
│   ├── income.ts           # 수익원 (출근/블로그/사이드/스카웃/헤드헌터)
│   ├── currency.ts         # KRW/USD 변환
│   └── salary.ts           # 단계별 연봉
└── systems/
    ├── EnhanceSystem.ts    # 본체 강화 로직
    ├── EquipmentSystem.ts  # 장비 강화 로직
    ├── SaveSystem.ts       # localStorage 영속화
    └── CloudSyncSystem.ts  # Supabase 동기화

docs/
└── supabase-schema.sql     # DB 스키마 (적용 필요)
```

## 라이선스

개인 프로젝트.
