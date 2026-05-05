import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHARACTERS, titleFor, type JobKey } from '../data/characters';
import { loadSave, persistSave, type SaveData } from '../systems/SaveSystem';
import { isSupabaseEnabled } from '../lib/supabase';
import {
  fetchOwnNickname,
  setNickname as cloudSetNickname,
  fetchLeaderboard,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  getSessionUserId,
  loadCloudSave,
  type LeaderboardRow,
  type LeaderboardSort,
} from '../systems/CloudSyncSystem';
import {
  canLaunchProject,
  nextProjectThreshold,
  projectDefAt,
  projectSuccessRate,
  projectSuccessReward,
  projectFailureReward,
  PROJECT_SUCCESS_PRESTIGE,
} from '../data/project';
import {
  RD_TRACKS,
  RD_TRACK_IDS,
  RD_MAX_LEVEL,
  rdNextCost,
  rdGlobalMultiplier,
} from '../data/rd';
import {
  teamCapForProjects,
  hireCost,
  fireRefund,
  diversityMultiplier,
  teamRevenuePerTick,
  createMember,
  pickAutoHireJob,
  memberContribution,
  companyMultiplier,
  rollGacha,
  GACHA_COST,
  TEAM_REVENUE_TICK_MS,
  MAX_TEAM_SIZE,
  type TeamMember,
} from '../data/team';
import { runTeamTick } from '../systems/TeamSystem';
import { OFFICE_TIERS, nextOfficeTier, officeTierAt } from '../data/office';
import { MISSIONS, MISSION_DURATION_MS, pickRandomMission, isMissionExpired, type MissionId } from '../data/missions';

export class MenuScene extends Phaser.Scene {
  private authLabel?: Phaser.GameObjects.Text;
  private cachedNickname: string | null = null;
  private isLoggedIn = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const save = loadSave();

    // Phase C: 메뉴 진입 시 팀 누적 틱 (offline 매출 + 자동 강화)
    const tick = runTeamTick(save);
    // Phase D: 폭사한 팀원 위로금 + 명단에서 영구 제거
    if (tick.destroyed.length > 0) {
      const destroyedMembers = save.team.filter((m) => tick.destroyed.includes(m.id));
      const totalConsolation = destroyedMembers.reduce((acc, m) => acc + 2000 * m.level, 0);
      save.gold = Math.max(0, save.gold - totalConsolation);
      // 죽은 멤버 제거 (퇴사 처리)
      save.team = save.team.filter((m) => !tick.destroyed.includes(m.id));
      this.scheduleDestroyedToast(destroyedMembers, totalConsolation);
    }
    if (tick.ticks > 0) {
      persistSave(save);
    }

    if (isSupabaseEnabled()) {
      this.buildTopButtons();
    }

    this.add
      .text(cx, 100, '개발팀 강화하기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '52px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 160, '🏆 우리 팀 빌드', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '24px',
        color: '#ffd23f',
      })
      .setOrigin(0.5);

    const synergyText = buildSynergyLine(save);
    this.add
      .text(cx, 200, synergyText, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#9af0a8',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5);

    if (save.prestige > 0) {
      const office = officeTierAt(save.officeTier);
      this.add
        .text(cx, 230, `⭐ 명성치 ${save.prestige}  ·  ${office.emoji} ${office.name}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }
    // L2/L4/L5: 메뉴 상단 우측 작은 액션 버튼 (사옥/가챠/미션 등) — 명성치 라인 아래
    this.buildMetaButtons(cx, 265, save);
    // ("직군을 고르세요" 안내 제거 — 화면 공간 확보 + 메타 버튼과 겹침 회피)

    const order: JobKey[] = ['planner', 'designer', 'developer'];
    order.forEach((key, i) => {
      this.makeJobCard(cx, 420 + i * 200, key, save);
    });

    // Phase A~D: 팀 패널 (CEO 승격 후 표시) — 마지막 직군 카드 아래
    this.buildTeamPanel(cx, 920, save);

    // 팀 패널이 2×6 큰 그리드라 콘텐츠가 화면을 넘어감 → 프로젝트/푸터를 아래로
    // 920(헤더) + 90(grid 오프셋) + 6×64(셀) + 5×10(간격) + 32(마지막 셀 하단) + 30(마진)
    const teamBottom = 920 + 90 + 6 * 64 + 5 * 10 + 32 + 30;
    const projectY = teamBottom + 60;
    const footerY = projectY + 110;
    this.buildProjectLaunchButton(cx, projectY, save);

    this.add
      .text(cx, footerY, 'v0.2 · 계정 인증 · 클라우드 세이브 · 리더보드 · ↑↓로 스크롤', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#5f6368',
      })
      .setOrigin(0.5);

    if (isSupabaseEnabled()) {
      void this.refreshAuthState();
    }

    // 콘텐츠 총 높이 + 여유 → scroll max
    const contentBottom = footerY + 40;
    this.menuScrollMaxY = Math.max(0, contentBottom - GAME_HEIGHT);
    this.setupMenuScroll();
  }

  // -------- 메뉴 세로 스크롤 (wheel + touch drag) --------

  private menuScrollMaxY = 0; // create() 끝에서 계산
  private dragStartPointerY: number | null = null;
  private dragStartScrollY = 0;

  private setupMenuScroll(): void {
    this.cameras.main.scrollY = 0;

    // 마우스 휠
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _gos: unknown, _dx: number, dy: number) => {
      this.applyMenuScroll(dy * 0.5);
    });

    // 터치/포인터 드래그
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragStartPointerY = p.y;
      this.dragStartScrollY = this.cameras.main.scrollY;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragStartPointerY === null || !p.isDown) return;
      const dy = this.dragStartPointerY - p.y;
      this.cameras.main.scrollY = Phaser.Math.Clamp(
        this.dragStartScrollY + dy,
        0,
        this.menuScrollMaxY,
      );
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragStartPointerY = null;
    });
  }

  private applyMenuScroll(delta: number): void {
    this.cameras.main.scrollY = Phaser.Math.Clamp(
      this.cameras.main.scrollY + delta,
      0,
      this.menuScrollMaxY,
    );
  }

  // -------- 상단 버튼 (로그인 상태 / 리더보드) --------

  private buildTopButtons(): void {
    // 좌측: 로그인 상태 또는 닉네임
    this.authLabel = this.add
      .text(20, 36, '🔓 …', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.authLabel.setInteractive({ useHandCursor: true });
    this.authLabel.on('pointerdown', () => {
      if (this.isLoggedIn) {
        this.openAccountMenu();
      } else {
        this.openAuthModal();
      }
    });

    // 우측: 리더보드 버튼
    const lbW = 140;
    const lbH = 48;
    const lbX = GAME_WIDTH - 16 - lbW / 2;
    const lbY = 36;
    const bg = this.add
      .rectangle(lbX, lbY, lbW, lbH, 0x4a90e2)
      .setStrokeStyle(2, 0xffffff, 0.3);
    this.add
      .text(lbX, lbY, '🏆 리더보드', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.openLeaderboardModal());
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff, 0.7));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffffff, 0.3));
  }

  private async refreshAuthState(): Promise<void> {
    const userId = await getSessionUserId();
    this.isLoggedIn = userId !== null;
    if (this.isLoggedIn) {
      const nick = await fetchOwnNickname();
      this.cachedNickname = nick;
      if (this.authLabel) this.authLabel.setText(`👤 ${nick ?? '닉네임 없음'}`);
    } else {
      this.cachedNickname = null;
      if (this.authLabel) this.authLabel.setText('🔓 로그인');
    }
  }

  // -------- 로그인 / 회원가입 모달 --------

  private openAuthModal(initialMode: 'login' | 'signup' = 'login'): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    let mode: 'login' | 'signup' = initialMode;

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);

    const panel = this.add
      .rectangle(cx, cy, 580, 600, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.6)
      .setDepth(301);
    objs.push(panel);

    const title = this.add
      .text(cx, cy - 240, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(302);
    objs.push(title);

    // 탭 (로그인 / 회원가입)
    const tabLogin = this.add
      .text(cx - 90, cy - 180, '로그인', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(302)
      .setInteractive({ useHandCursor: true });
    const tabSignup = this.add
      .text(cx + 90, cy - 180, '회원가입', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(302)
      .setInteractive({ useHandCursor: true });
    objs.push(tabLogin, tabSignup);

    const tabUnderline = this.add
      .rectangle(cx, cy - 165, 90, 3, 0xffd23f)
      .setDepth(302);
    objs.push(tabUnderline);

    // HTML inputs
    const emailInput = makeHtmlInput('email', 'email', '이메일');
    const passwordInput = makeHtmlInput('password', 'current-password', '비밀번호 (6자 이상)');
    const nicknameInput = makeHtmlInput('text', 'username', '닉네임 (1~20자)');

    // 위치 조정 (Phaser는 캔버스, 입력은 absolute로 화면 위에 깔림)
    positionInput(emailInput, 0, -90);
    positionInput(passwordInput, 0, -30);
    positionInput(nicknameInput, 0, 30);

    document.body.appendChild(emailInput);
    document.body.appendChild(passwordInput);
    document.body.appendChild(nicknameInput);

    const status = this.add
      .text(cx, cy + 100, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#e2c84a',
        align: 'center',
        wordWrap: { width: 520 },
      })
      .setOrigin(0.5)
      .setDepth(302);
    objs.push(status);

    // 액션 버튼
    const okBg = this.add
      .rectangle(cx - 90, cy + 200, 160, 56, 0xffd23f)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const okText = this.add
      .text(cx - 90, cy + 200, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(okBg, okText);

    const cancelBg = this.add
      .rectangle(cx + 90, cy + 200, 160, 56, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const cancelText = this.add
      .text(cx + 90, cy + 200, '취소', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(cancelBg, cancelText);

    const close = () => {
      objs.forEach((o) => o.destroy());
      emailInput.remove();
      passwordInput.remove();
      nicknameInput.remove();
    };

    const updateMode = () => {
      if (mode === 'login') {
        title.setText('로그인');
        okText.setText('로그인');
        nicknameInput.style.display = 'none';
        tabUnderline.setX(cx - 90);
        tabLogin.setColor('#ffd23f');
        tabSignup.setColor('#9aa0a6');
      } else {
        title.setText('회원가입');
        okText.setText('가입하기');
        nicknameInput.style.display = 'block';
        tabUnderline.setX(cx + 90);
        tabLogin.setColor('#9aa0a6');
        tabSignup.setColor('#ffd23f');
      }
      status.setText('');
    };

    tabLogin.on('pointerdown', () => {
      mode = 'login';
      updateMode();
    });
    tabSignup.on('pointerdown', () => {
      mode = 'signup';
      updateMode();
    });

    updateMode();

    const submit = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        status.setText('이메일과 비밀번호를 입력해주세요.');
        status.setColor('#e24a4a');
        return;
      }

      status.setText('처리 중...');
      status.setColor('#cfd1d4');
      try {
        if (mode === 'signup') {
          const nickname = nicknameInput.value.trim();
          const result = await signUpWithEmail(email, password, nickname);
          if (result.ok) {
            await this.afterAuth();
            close();
          } else {
            status.setText(result.reason ?? '가입 실패');
            status.setColor('#e24a4a');
          }
        } else {
          const result = await signInWithEmail(email, password);
          if (result.ok) {
            await this.afterAuth();
            close();
          } else {
            status.setText(result.reason ?? '로그인 실패');
            status.setColor('#e24a4a');
          }
        }
      } catch (err) {
        console.error('[auth] error', err);
        status.setText(`예외: ${err instanceof Error ? err.message : String(err)}`);
        status.setColor('#e24a4a');
      }
    };

    okBg.setInteractive({ useHandCursor: true });
    okBg.on('pointerdown', () => void submit());

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', close);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      } else if (e.key === 'Escape') {
        close();
      }
    };
    emailInput.addEventListener('keydown', onKey);
    passwordInput.addEventListener('keydown', onKey);
    nicknameInput.addEventListener('keydown', onKey);
    setTimeout(() => emailInput.focus(), 50);
  }

  private async afterAuth(): Promise<void> {
    await this.refreshAuthState();
    // 로그인 성공 후 클라우드 세이브 풀 → 더 최신이면 채택
    const cloud = await loadCloudSave();
    if (cloud) {
      const local = loadSave();
      const localTime = local.lastVisitedAt ?? 0;
      const cloudTime = new Date(cloud.updatedAt).getTime();
      if (cloudTime > localTime) {
        persistSave(cloud.data);
        // 메뉴 다시 그림 (단계/시너지 갱신)
        this.scene.restart();
      }
    }
  }

  // -------- L2/L4/L5: 메타 버튼 (사옥/가챠/미션) --------

  private buildMetaButtons(cx: number, y: number, save: SaveData): void {
    const aceBest = Math.max(save.bestByJob.developer, save.bestByJob.planner, save.bestByJob.designer);
    const buttons: { label: string; color: number; onClick: () => void; visible: boolean }[] = [];

    // 사옥 (lv 50+ 노출)
    if (aceBest >= 50 || save.officeTier > 0) {
      const next = nextOfficeTier(save.officeTier);
      const lbl = next ? `🏢 사옥` : `🌌 최종 사옥`;
      buttons.push({
        label: lbl,
        color: 0x4a90e2,
        visible: true,
        onClick: () => this.openOfficeModal(save),
      });
    }
    // 가챠 (lv 300+)
    if (aceBest >= 300) {
      buttons.push({
        label: '🎰 헤드헌터',
        color: 0xa370ff,
        visible: true,
        onClick: () => this.openGachaModal(save),
      });
    }
    // 미션 (lv 500+)
    if (aceBest >= 500) {
      buttons.push({
        label: '📋 분기 미션',
        color: 0xffd23f,
        visible: true,
        onClick: () => this.openMissionModal(save),
      });
    }
    // 양자 코어 토글 (lv 800+)
    if (aceBest >= 800) {
      buttons.push({
        label: `⚛️ 양자 ${save.quantumCoreEnabled ? 'ON' : 'OFF'}`,
        color: save.quantumCoreEnabled ? 0xa370ff : 0x3a3a44,
        visible: true,
        onClick: () => {
          save.quantumCoreEnabled = !save.quantumCoreEnabled;
          persistSave(save);
          this.scene.restart();
        },
      });
    }
    // R&D 투자 (lv 100+ — 골드 sink 제공)
    if (aceBest >= 100) {
      buttons.push({
        label: '🔬 R&D',
        color: 0x4ae290,
        visible: true,
        onClick: () => this.openRdModal(save),
      });
    }
    if (buttons.length === 0) return;

    const btnW = 130;
    const btnH = 36;
    const gap = 10;
    const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
    let bx = cx - totalW / 2 + btnW / 2;
    buttons.forEach((b) => {
      const c = this.add.container(bx, y);
      const bg = this.add.rectangle(0, 0, btnW, btnH, b.color, 0.85).setStrokeStyle(1, 0xffffff, 0.4);
      const txt = this.add.text(0, 0, b.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#0e0e12',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      c.add([bg, txt]);
      c.setSize(btnW, btnH);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerover', () => bg.setStrokeStyle(1, 0xffffff, 1));
      c.on('pointerout', () => bg.setStrokeStyle(1, 0xffffff, 0.4));
      c.on('pointerdown', b.onClick);
      bx += btnW + gap;
    });
  }

  // -------- 사옥 모달 --------

  private openOfficeModal(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78).setOrigin(0).setDepth(300).setInteractive();
    objs.push(overlay);
    const panel = this.add.rectangle(cx, cy, 600, 800, 0x1a1a22).setStrokeStyle(3, 0x4a90e2, 0.7).setDepth(301);
    objs.push(panel);
    objs.push(this.add.text(cx, cy - 360, '🏢 사옥 등급', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302));

    OFFICE_TIERS.forEach((t, i) => {
      const yy = cy - 300 + i * 130;
      const owned = save.officeTier >= t.tier;
      const aceBest = Math.max(save.bestByJob.developer, save.bestByJob.planner, save.bestByJob.designer);
      const reqMet = aceBest >= t.requiredLevel;
      const canBuy = !owned && reqMet && save.officeTier === t.tier - 1 && save.gold >= t.upgradeCost;
      const statusColor = owned ? 0x4ae290 : (canBuy ? 0xffd23f : 0x3a3a44);
      const card = this.add.rectangle(cx, yy, 540, 110, 0x2a2a32).setStrokeStyle(2, statusColor, 0.7).setDepth(302);
      objs.push(card);
      objs.push(this.add.text(cx - 240, yy - 30, `${t.emoji} ${t.name}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(303));
      objs.push(this.add.text(cx - 240, yy - 4, `매출 ×${t.multiplier.toFixed(1)} · 필요 단계 ${t.requiredLevel}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#cfd1d4',
      }).setOrigin(0, 0.5).setDepth(303));
      objs.push(this.add.text(cx - 240, yy + 18, t.upgradeCost > 0 ? `비용 ${fmtGoldKRW(t.upgradeCost)}원` : '시작 등급', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '13px',
        color: '#9aa0a6',
      }).setOrigin(0, 0.5).setDepth(303));

      const stateLabel = owned ? '✅ 보유' : (canBuy ? '🔓 입주 가능' : (reqMet ? '🔒 잠김' : `🔒 lv ${t.requiredLevel}`));
      const stateText = this.add.text(cx + 200, yy, stateLabel, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '15px',
        color: owned ? '#4ae290' : (canBuy ? '#ffd23f' : '#9aa0a6'),
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(303);
      objs.push(stateText);

      if (canBuy) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => {
          save.gold -= t.upgradeCost;
          save.officeTier = t.tier;
          persistSave(save);
          objs.forEach((o) => o.destroy());
          this.scene.restart();
        });
      }
    });

    const closeBg = this.add.rectangle(cx, cy + 360, 200, 50, 0x3a3a44).setStrokeStyle(2, 0xffffff, 0.3).setDepth(302);
    const closeText = this.add.text(cx, cy + 360, '닫기', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(303);
    objs.push(closeBg, closeText);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => objs.forEach((o) => o.destroy()));
  }

  // -------- 가챠 모달 (L4) --------

  private openGachaModal(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78).setOrigin(0).setDepth(300).setInteractive();
    objs.push(overlay);
    const panel = this.add.rectangle(cx, cy, 540, 460, 0x1a1a22).setStrokeStyle(3, 0xa370ff, 0.7).setDepth(301);
    objs.push(panel);
    objs.push(this.add.text(cx, cy - 200, '🎰 헤드헌터', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy - 160, `1회 ${fmtGoldKRW(GACHA_COST)}원`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '18px',
      color: '#ffd23f',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy - 110, '확률: 일반 90% · 시니어 9% · 전설 1%', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '13px',
      color: '#9aa0a6',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy - 80, '시니어 ×2 매출 / 전설 ×5 매출', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '13px',
      color: '#9aa0a6',
    }).setOrigin(0.5).setDepth(302));

    const result = this.add.text(cx, cy, '', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 480 },
    }).setOrigin(0.5).setDepth(303);
    objs.push(result);

    const tryBg = this.add.rectangle(cx - 110, cy + 130, 200, 56, 0xa370ff).setStrokeStyle(2, 0xffffff, 0.4).setDepth(302);
    const tryText = this.add.text(cx - 110, cy + 130, '🎰 시도', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(303);
    objs.push(tryBg, tryText);
    tryBg.setInteractive({ useHandCursor: true });
    tryBg.on('pointerdown', () => {
      if (save.gold < GACHA_COST) {
        result.setText('💸 골드 부족');
        result.setColor('#e24a4a');
        return;
      }
      const aliveTeam = save.team.filter((m) => m.alive);
      if (aliveTeam.length >= teamCapForProjects(save.projectsCompleted)) {
        result.setText('팀 자리가 가득 찼습니다');
        result.setColor('#e2904a');
        return;
      }
      save.gold -= GACHA_COST;
      save.gachaCount += 1;
      // L5 미션 진행도
      if (save.activeMissionId === 'gacha-3') save.activeMissionProgress += 1;
      const tier = rollGacha();
      const aceJob = pickAceJob(save.bestByJob);
      const job = pickAutoHireJob(save.team, aceJob);
      const m = createMember(job, tier);
      save.team.push(m);
      const tierLabel = tier === 'legendary' ? '🟡 전설' : tier === 'senior' ? '🔵 시니어' : '⚪ 일반';
      result.setText(`${tierLabel}\n${m.name} (${JOB_LABEL[job]}) 합류!`);
      result.setColor(tier === 'legendary' ? '#ffd23f' : tier === 'senior' ? '#a370ff' : '#cfd1d4');
      persistSave(save);
    });

    const closeBg = this.add.rectangle(cx + 110, cy + 130, 200, 56, 0x3a3a44).setStrokeStyle(2, 0xffffff, 0.3).setDepth(302);
    const closeText = this.add.text(cx + 110, cy + 130, '닫기', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(303);
    objs.push(closeBg, closeText);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => {
      objs.forEach((o) => o.destroy());
      this.scene.restart();
    });
  }

  // -------- R&D 투자 모달 --------

  private openRdModal(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78).setOrigin(0).setDepth(300).setInteractive();
    objs.push(overlay);
    const panel = this.add.rectangle(cx, cy, 620, 700, 0x1a1a22).setStrokeStyle(3, 0x4ae290, 0.7).setDepth(301);
    objs.push(panel);

    const renderTitle = () => {
      objs.push(this.add.text(cx, cy - 310, '🔬 R&D 투자', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(302));
      objs.push(this.add.text(cx, cy - 275, `보유 ₩${fmtGoldKRW(save.gold)}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '15px',
        color: '#ffd23f',
      }).setOrigin(0.5).setDepth(302));
    };

    const renderTracks = () => {
      RD_TRACK_IDS.forEach((id, i) => {
        const def = RD_TRACKS[id];
        const lv = save.rdLevels[id];
        const yy = cy - 200 + i * 160;
        const card = this.add.rectangle(cx, yy, 540, 140, 0x2a2a32).setStrokeStyle(2, 0x4ae290, 0.5).setDepth(302);
        objs.push(card);
        objs.push(this.add.text(cx - 240, yy - 50, `${def.emoji} ${def.label}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0, 0.5).setDepth(303));
        objs.push(this.add.text(cx - 240, yy - 22, def.desc, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#cfd1d4',
        }).setOrigin(0, 0.5).setDepth(303));
        // 단계 진행도 바
        const barW = 320;
        const barH = 14;
        objs.push(this.add.rectangle(cx - 240 + barW / 2, yy + 8, barW, barH, 0x3a3a44).setStrokeStyle(1, 0xffffff, 0.3).setDepth(303));
        const ratio = lv / RD_MAX_LEVEL;
        if (ratio > 0) {
          objs.push(this.add.rectangle(cx - 240, yy + 8, barW * ratio, barH - 2, 0x4ae290).setOrigin(0, 0.5).setDepth(304));
        }
        objs.push(this.add.text(cx - 240 + barW / 2, yy + 8, `${lv}/${RD_MAX_LEVEL}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '11px',
          color: '#0e0e12',
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(305));

        // 다음 비용 / 투자 버튼
        const nextCost = rdNextCost(id, lv);
        const isMaxed = nextCost < 0;
        const canBuy = !isMaxed && save.gold >= nextCost;
        objs.push(this.add.text(cx - 240, yy + 36, isMaxed ? '✅ 최대 투자 완료' : `다음 ${def.effectPerLevel} · ₩${fmtGoldKRW(nextCost)}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '13px',
          color: isMaxed ? '#4ae290' : (canBuy ? '#ffd23f' : '#9aa0a6'),
        }).setOrigin(0, 0.5).setDepth(303));

        if (!isMaxed) {
          const btnBg = this.add.rectangle(cx + 200, yy + 8, 100, 50, canBuy ? 0x4ae290 : 0x3a3a44).setStrokeStyle(2, 0xffffff, canBuy ? 0.4 : 0.2).setDepth(303);
          const btnText = this.add.text(cx + 200, yy + 8, canBuy ? '투자' : '골드 부족', {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: canBuy ? '17px' : '13px',
            color: canBuy ? '#0e0e12' : '#9aa0a6',
            fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(304);
          objs.push(btnBg, btnText);
          if (canBuy) {
            btnBg.setInteractive({ useHandCursor: true });
            btnBg.on('pointerdown', () => {
              save.gold -= nextCost;
              save.rdLevels[id] += 1;
              persistSave(save);
              objs.forEach((o) => o.destroy());
              this.openRdModal(save); // 다시 열어 갱신
            });
          }
        }
      });
    };

    renderTitle();
    renderTracks();

    const closeBg = this.add.rectangle(cx, cy + 310, 200, 50, 0x3a3a44).setStrokeStyle(2, 0xffffff, 0.3).setDepth(302);
    const closeText = this.add.text(cx, cy + 310, '닫기', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(303);
    objs.push(closeBg, closeText);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => objs.forEach((o) => o.destroy()));
  }

  // -------- 분기 미션 모달 (L5) --------

  private openMissionModal(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78).setOrigin(0).setDepth(300).setInteractive();
    objs.push(overlay);
    const panel = this.add.rectangle(cx, cy, 580, 580, 0x1a1a22).setStrokeStyle(3, 0xffd23f, 0.7).setDepth(301);
    objs.push(panel);
    objs.push(this.add.text(cx, cy - 240, '📋 분기 미션', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302));

    // 만료 시 새로 뽑기
    if (save.activeMissionId == null || isMissionExpired(save.activeMissionStartedAt)) {
      const newMission = pickRandomMission();
      save.activeMissionId = newMission.id;
      save.activeMissionStartedAt = Date.now();
      save.activeMissionProgress = 0;
      persistSave(save);
    }

    const mission = MISSIONS[save.activeMissionId as MissionId];
    const remaining = MISSION_DURATION_MS - (Date.now() - save.activeMissionStartedAt);
    const remainHrs = Math.floor(remaining / 3600000);
    const remainMins = Math.floor((remaining % 3600000) / 60000);

    objs.push(this.add.text(cx, cy - 180, `${mission.emoji} ${mission.label}`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '24px',
      color: '#ffd23f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy - 140, mission.desc, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '16px',
      color: '#cfd1d4',
      align: 'center',
      wordWrap: { width: 500 },
    }).setOrigin(0.5).setDepth(302));

    const progress = Math.min(save.activeMissionProgress, mission.target);
    const ratio = progress / mission.target;
    objs.push(this.add.rectangle(cx, cy - 70, 480, 24, 0x3a3a44).setStrokeStyle(1, 0xffffff, 0.3).setDepth(302));
    objs.push(this.add.rectangle(cx - 240, cy - 70, 480 * ratio, 22, 0xffd23f).setOrigin(0, 0.5).setDepth(303));
    objs.push(this.add.text(cx, cy - 70, `${progress}/${mission.target}`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '14px',
      color: '#0e0e12',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(304));

    objs.push(this.add.text(cx, cy - 20, `보상: ${mission.rewardLabel}`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '17px',
      color: '#9af0a8',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy + 10, `남은 시간: ${remainHrs}시간 ${remainMins}분`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '14px',
      color: '#9aa0a6',
    }).setOrigin(0.5).setDepth(302));
    objs.push(this.add.text(cx, cy + 40, `누적 완료 ${save.completedMissionsCount}회`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '13px',
      color: '#5f6368',
    }).setOrigin(0.5).setDepth(302));

    const canClaim = progress >= mission.target;
    const claimBg = this.add.rectangle(cx - 110, cy + 150, 200, 56, canClaim ? 0x4ae290 : 0x3a3a44).setStrokeStyle(2, 0xffffff, canClaim ? 0.4 : 0.2).setDepth(302);
    const claimText = this.add.text(cx - 110, cy + 150, canClaim ? '🏆 보상 수령' : '진행 중', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '18px',
      color: canClaim ? '#0e0e12' : '#9aa0a6',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(303);
    objs.push(claimBg, claimText);
    if (canClaim) {
      claimBg.setInteractive({ useHandCursor: true });
      claimBg.on('pointerdown', () => {
        if (mission.reward.gold) save.gold += mission.reward.gold;
        if (mission.reward.prestige) save.prestige += mission.reward.prestige;
        save.completedMissionsCount += 1;
        // 새 미션 자동 픽
        const newM = pickRandomMission();
        save.activeMissionId = newM.id;
        save.activeMissionStartedAt = Date.now();
        save.activeMissionProgress = 0;
        persistSave(save);
        objs.forEach((o) => o.destroy());
        this.scene.restart();
      });
    }
    const closeBg = this.add.rectangle(cx + 110, cy + 150, 200, 56, 0x3a3a44).setStrokeStyle(2, 0xffffff, 0.3).setDepth(302);
    const closeText = this.add.text(cx + 110, cy + 150, '닫기', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(303);
    objs.push(closeBg, closeText);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => objs.forEach((o) => o.destroy()));
  }

  // -------- 팀 누적 결과 토스트 --------

  private scheduleDestroyedToast(members: TeamMember[], consolation: number): void {
    // 타이밍: 메뉴 그려진 후 잠시 뒤 표시
    this.time.delayedCall(400, () => {
      const cx = GAME_WIDTH / 2;
      const cy = GAME_HEIGHT / 2;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const overlay = this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
        .setOrigin(0)
        .setDepth(310)
        .setInteractive();
      objs.push(overlay);
      const panel = this.add
        .rectangle(cx, cy, 540, 360, 0x1a1a22)
        .setStrokeStyle(3, 0xe24a4a, 0.8)
        .setDepth(311);
      objs.push(panel);
      const lines = members.map((m) => `· ${JOB_EMOJI[m.jobKey]} ${m.name} (Lv ${m.level})`).join('\n');
      objs.push(
        this.add
          .text(cx, cy - 130, '💔 동료 퇴사', {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '28px',
            color: '#e24a4a',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(312),
        this.add
          .text(cx, cy - 60, `자리비움 동안 ${members.length}명이 폭사로 퇴사했습니다.\n\n${lines}`, {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '15px',
            color: '#cfd1d4',
            align: 'center',
            wordWrap: { width: 480 },
          })
          .setOrigin(0.5)
          .setDepth(312),
        this.add
          .text(cx, cy + 80, `💰 위로금 -₩${fmtGoldKRW(consolation)}`, {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '17px',
            color: '#e2904a',
          })
          .setOrigin(0.5)
          .setDepth(312),
      );
      const closeBg = this.add
        .rectangle(cx, cy + 130, 200, 50, 0x3a3a44)
        .setStrokeStyle(2, 0xffffff, 0.3)
        .setDepth(312);
      const closeText = this.add
        .text(cx, cy + 130, '확인', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(313);
      objs.push(closeBg, closeText);
      const close = () => objs.forEach((o) => o.destroy());
      closeBg.setInteractive({ useHandCursor: true });
      closeBg.on('pointerdown', close);
      overlay.on('pointerdown', close);
    });
  }

  // -------- 팀 패널 (Phase A~D) --------

  private buildTeamPanel(cx: number, y: number, save: SaveData): void {
    // 잠금 상태 (CEO 승격 전)
    if (save.projectsCompleted <= 0) {
      this.add
        .rectangle(cx, y + 30, 600, 70, 0x2a2a32)
        .setStrokeStyle(2, 0x5a5a5a, 0.5);
      this.add
        .text(cx, y + 14, '🔒 우리 팀', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#9aa0a6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add
        .text(cx, y + 44, '첫 프로젝트 출시 성공 시 동료가 합류합니다', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '13px',
          color: '#5f6368',
        })
        .setOrigin(0.5);
      return;
    }

    // 활성 상태
    const cap = teamCapForProjects(save.projectsCompleted);
    const aliveTeam = save.team.filter((m) => m.alive);
    const revenue = Math.round(
      teamRevenuePerTick(save.team, save.prestige, save.projectsCompleted)
      * rdGlobalMultiplier(save.rdLevels.global),
    );
    const diversity = diversityMultiplier(save.team);
    const tickSec = TEAM_REVENUE_TICK_MS / 1000;

    // 헤더
    this.add
      .text(cx, y, `👥 우리 팀  ${aliveTeam.length}/${cap}명`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subParts = [`💰 ₩${fmtGoldKRW(revenue)}/${tickSec}s`];
    if (diversity > 1) subParts.push(`직군 ×${diversity.toFixed(1)}`);
    this.add
      .text(cx, y + 24, subParts.join('  ·  '), {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '13px',
        color: '#9af0a8',
      })
      .setOrigin(0.5);

    // 그리드 (2열 × 6행 = 최대 12 슬롯, 더 넉넉한 셀)
    const cols = 2;
    const rows = 6;
    const cellW = 290;
    const cellH = 64;
    const gap = 10;
    const totalW = cols * cellW + (cols - 1) * gap;
    const startX = cx - totalW / 2 + cellW / 2;
    // 헤더(y) + sub-stats(y+24) 아래로 충분히 띄움
    const gridStartY = y + 90;
    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sx = startX + col * (cellW + gap);
      const sy = gridStartY + row * (cellH + gap);
      this.buildTeamCell(sx, sy, cellW, cellH, i, save);
    }
  }

  private buildTeamCell(
    x: number,
    y: number,
    w: number,
    h: number,
    slotIdx: number,
    save: SaveData,
  ): void {
    const cap = teamCapForProjects(save.projectsCompleted);
    const aliveTeam = save.team.filter((m) => m.alive);
    const isLockedSlot = slotIdx >= cap;
    const member = aliveTeam[slotIdx]; // 살아있는 N번째

    if (isLockedSlot) {
      // 잠긴 슬롯
      this.add
        .rectangle(x, y, w, h, 0x1a1a22)
        .setStrokeStyle(1, 0x3a3a44, 0.6);
      this.add
        .text(x, y, '🔒', {
          fontFamily: 'sans-serif',
          fontSize: '16px',
        })
        .setOrigin(0.5);
      return;
    }

    if (!member) {
      // 빈 채용 가능 슬롯
      const cost = hireCost(aliveTeam.length);
      const canAfford = save.gold >= cost;
      const bg = this.add
        .rectangle(x, y, w, h, canAfford ? 0x4a90e2 : 0x2a2a32)
        .setStrokeStyle(2, canAfford ? 0xffffff : 0x5a5a5a, canAfford ? 0.4 : 0.3);
      this.add
        .text(x, y - 8, '+ 채용', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '15px',
          color: canAfford ? '#ffffff' : '#9aa0a6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 12, `₩${fmtGoldKRW(cost)}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '12px',
          color: canAfford ? '#dde2ee' : '#5f6368',
        })
        .setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.openHireModal(save));
      bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff, 0.8));
      bg.on('pointerout', () => bg.setStrokeStyle(2, canAfford ? 0xffffff : 0x5a5a5a, canAfford ? 0.4 : 0.3));
      return;
    }

    // 점유된 슬롯 — 멤버 표시
    const jobColor = JOB_COLOR[member.jobKey];
    const bg = this.add
      .rectangle(x, y, w, h, 0x2a2a32)
      .setStrokeStyle(2, jobColor, 0.7);
    // 직군 SVG 아이콘 (좌측). 미로드 시 emoji fallback.
    const iconKey = `icon-job-${member.jobKey}`;
    if (this.textures.exists(iconKey)) {
      this.add.image(x - w / 2 + 22, y, iconKey).setDisplaySize(28, 28);
    } else {
      this.add
        .text(x - w / 2 + 14, y, JOB_EMOJI[member.jobKey], {
          fontFamily: 'sans-serif',
          fontSize: '20px',
        })
        .setOrigin(0, 0.5);
    }
    this.add
      .text(x - w / 2 + 40, y - 9, member.name, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(x - w / 2 + 40, y + 9, `Lv ${member.level}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '12px',
        color: '#ffd23f',
      })
      .setOrigin(0, 0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.openMemberDetail(save, member));
    bg.on('pointerover', () => bg.setStrokeStyle(2, jobColor, 1));
    bg.on('pointerout', () => bg.setStrokeStyle(2, jobColor, 0.7));
  }

  private openHireModal(save: SaveData): void {
    const cap = teamCapForProjects(save.projectsCompleted);
    const aliveTeam = save.team.filter((m) => m.alive);
    if (aliveTeam.length >= cap) {
      // 자리 없음 (모달 막기)
      return;
    }
    const cost = hireCost(aliveTeam.length);
    if (save.gold < cost) {
      // 골드 부족 알림
      const tx = GAME_WIDTH / 2;
      const ty = GAME_HEIGHT / 2;
      const t = this.add
        .text(tx, ty, `골드 부족 — ₩${fmtGoldKRW(cost)} 필요`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#e24a4a',
          backgroundColor: '#1a1a22',
          padding: { x: 16, y: 12 },
        })
        .setOrigin(0.5)
        .setDepth(310);
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 1500,
        delay: 800,
        onComplete: () => t.destroy(),
      });
      return;
    }

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);
    const panel = this.add
      .rectangle(cx, cy, 540, 480, 0x1a1a22)
      .setStrokeStyle(3, 0x4a90e2, 0.7)
      .setDepth(301);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 200, '👥 새 동료 채용', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '28px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 160, `채용 비용  ₩${fmtGoldKRW(cost)}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#ffd23f',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 120, '직군을 선택하세요', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '15px',
          color: '#cfd1d4',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const close = () => objs.forEach((o) => o.destroy());

    const jobs: { key: JobKey; label: string; emoji: string; y: number; color: number }[] = [
      { key: 'planner', label: '기획자', emoji: '📋', y: cy - 65, color: 0x4a90e2 },
      { key: 'designer', label: '디자이너', emoji: '🎨', y: cy - 5, color: 0xe24a90 },
      { key: 'developer', label: '개발자', emoji: '👨‍💻', y: cy + 55, color: 0x4ae290 },
    ];
    jobs.forEach((j) => {
      const btn = this.add
        .rectangle(cx, j.y, 380, 50, j.color, 0.85)
        .setStrokeStyle(2, 0xffffff, 0.4)
        .setDepth(302);
      const label = this.add
        .text(cx, j.y, `${j.emoji}  ${j.label}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#0e0e12',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(303);
      objs.push(btn, label);
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        save.gold -= cost;
        save.team.push(createMember(j.key));
        // L5 미션 진행도: hire-2
        if (save.activeMissionId === 'hire-2') {
          save.activeMissionProgress += 1;
        }
        persistSave(save);
        close();
        this.scene.restart();
      });
    });

    const cancelBg = this.add
      .rectangle(cx, cy + 145, 200, 50, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const cancelText = this.add
      .text(cx, cy + 145, '취소', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(cancelBg, cancelText);
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', close);
  }

  private openMemberDetail(save: SaveData, member: TeamMember): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);
    const panel = this.add
      .rectangle(cx, cy, 520, 380, 0x1a1a22)
      .setStrokeStyle(3, JOB_COLOR[member.jobKey], 0.7)
      .setDepth(301);
    objs.push(panel);

    const aliveTeam = save.team.filter((m) => m.alive);
    const sizeAtHire = Math.max(0, aliveTeam.indexOf(member));
    const refund = fireRefund(sizeAtHire);
    const elapsedDays = Math.floor((Date.now() - member.hiredAt) / 86_400_000);

    objs.push(
      this.add
        .text(cx, cy - 145, `${JOB_EMOJI[member.jobKey]} ${member.name}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '28px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 100, JOB_LABEL[member.jobKey], {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#9aa0a6',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 50, `현재 단계  Lv ${member.level}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '22px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(
          cx,
          cy - 16,
          `매출 기여  ₩${fmtGoldKRW(Math.ceil(memberContribution(member) * companyMultiplier(save.prestige, save.projectsCompleted) * diversityMultiplier(save.team)))}/30s`,
          {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '15px',
            color: '#9af0a8',
          },
        )
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy + 10, `근속 ${elapsedDays}일`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '13px',
          color: '#5f6368',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const close = () => objs.forEach((o) => o.destroy());

    // 해고 버튼
    const fireBg = this.add
      .rectangle(cx - 110, cy + 110, 200, 50, 0xe24a4a)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const fireText = this.add
      .text(cx - 110, cy + 110, `해고  +₩${fmtGoldKRW(refund)}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(fireBg, fireText);
    fireBg.setInteractive({ useHandCursor: true });
    fireBg.on('pointerdown', () => {
      save.gold += refund;
      save.team = save.team.filter((m) => m.id !== member.id);
      persistSave(save);
      close();
      this.scene.restart();
    });

    // 닫기 버튼
    const closeBg = this.add
      .rectangle(cx + 110, cy + 110, 200, 50, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const closeText = this.add
      .text(cx + 110, cy + 110, '닫기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(closeBg, closeText);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', close);
  }

  // -------- 프로젝트 출시 (Phase 4) --------

  private buildProjectLaunchButton(x: number, y: number, save: SaveData): void {
    const canLaunch = canLaunchProject(save.bestByJob, save.projectsCompleted);
    const threshold = nextProjectThreshold(save.projectsCompleted);
    const w = 480;
    const h = 76;
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, canLaunch ? 0xffd23f : 0x3a3a44, 1)
      .setStrokeStyle(2, 0xffffff, canLaunch ? 0.6 : 0.15);
    const titleLabel = this.add
      .text(0, -14, canLaunch ? '🚀 프로젝트 출시' : '🔒 프로젝트 잠김', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: canLaunch ? '#0e0e12' : '#9aa0a6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const subLabel = this.add
      .text(
        0,
        16,
        canLaunch
          ? `누적 ${save.projectsCompleted}회 · 모든 직군 ${threshold} 이상 도달`
          : `다음 출시: 모든 직군 ${threshold}단계 필요 (현재 P${save.bestByJob.planner}/D${save.bestByJob.designer}/E${save.bestByJob.developer})`,
        {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '13px',
          color: canLaunch ? '#0e0e12' : '#9aa0a6',
        },
      )
      .setOrigin(0.5);
    container.add([bg, titleLabel, subLabel]);
    container.setSize(w, h);
    if (canLaunch) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff, 1));
      container.on('pointerout', () => bg.setStrokeStyle(2, 0xffffff, 0.6));
      container.on('pointerdown', () => this.openProjectModal(save));
    }
  }

  private openProjectModal(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);

    const panel = this.add
      .rectangle(cx, cy, 580, 660, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.7)
      .setDepth(301);
    objs.push(panel);

    const def = projectDefAt(save.projectsCompleted);
    const rate = projectSuccessRate(save.bestByJob, save.projectsCompleted);
    const reward = projectSuccessReward(save.projectsCompleted);
    const consol = projectFailureReward(save.projectsCompleted);

    objs.push(
      this.add
        .text(cx, cy - 270, '🚀 프로젝트 출시', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '32px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 220, def.name, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '24px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 175, `“${def.pitch}”`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '17px',
          color: '#cfd1d4',
          align: 'center',
          wordWrap: { width: 520 },
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy - 100, `성공률 ${(rate * 100).toFixed(0)}%`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '36px',
          color: '#9af0a8',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(
          cx,
          cy - 50,
          `팀 best — 기획 ${save.bestByJob.planner} · 디자인 ${save.bestByJob.designer} · 개발 ${save.bestByJob.developer}`,
          {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '15px',
            color: '#cfd1d4',
          },
        )
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(
          cx,
          cy + 0,
          `🎯 성공 시: ⭐ 명성 +${PROJECT_SUCCESS_PRESTIGE} · 💰 +${reward.toLocaleString()}`,
          {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '17px',
            color: '#ffd23f',
          },
        )
        .setOrigin(0.5)
        .setDepth(302),
      this.add
        .text(cx, cy + 28, `💔 실패 시: 위로금 💰 +${consol.toLocaleString()}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '15px',
          color: '#e2904a',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const okBg = this.add
      .rectangle(cx - 110, cy + 130, 200, 60, 0x4ae290)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(302);
    const okText = this.add
      .text(cx - 110, cy + 130, '시도하기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    const cancelBg = this.add
      .rectangle(cx + 110, cy + 130, 200, 60, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const cancelText = this.add
      .text(cx + 110, cy + 130, '취소', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(okBg, okText, cancelBg, cancelText);

    const result = this.add
      .text(cx, cy + 200, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '17px',
        color: '#cfd1d4',
        align: 'center',
        wordWrap: { width: 520 },
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(result);

    let resolved = false;
    const close = () => objs.forEach((o) => o.destroy());

    okBg.setInteractive({ useHandCursor: true });
    okBg.on('pointerdown', () => {
      if (resolved) return;
      resolved = true;
      const ok = Math.random() < rate;
      if (ok) {
        save.projectsCompleted += 1;
        save.prestige += PROJECT_SUCCESS_PRESTIGE;
        save.gold += reward;
        // Phase D: 출시 성공 시 자동 채용 (cap 미만일 때 1명 영입)
        const cap = teamCapForProjects(save.projectsCompleted);
        const aliveTeam = save.team.filter((m) => m.alive);
        let hireMessage = '';
        if (aliveTeam.length < cap && save.team.length < MAX_TEAM_SIZE) {
          const aceJob = pickAceJob(save.bestByJob);
          const newJob = pickAutoHireJob(save.team, aceJob);
          const newMember = createMember(newJob);
          save.team.push(newMember);
          hireMessage = `\n🎉 ${newMember.name} (${JOB_LABEL[newJob]}) 합류!`;
        }
        result.setText(
          `${def.successMessage}\n+⭐ ${PROJECT_SUCCESS_PRESTIGE} · 💰 +${reward.toLocaleString()}${hireMessage}`,
        );
        result.setColor('#9af0a8');
        this.playProjectSuccessFx();
      } else {
        save.gold += consol;
        result.setText(`${def.failureMessage}\n💰 +${consol.toLocaleString()}`);
        result.setColor('#e2904a');
        this.playProjectFailFx();
      }
      persistSave(save);
      okBg.disableInteractive();
      cancelText.setText('닫기');
      // 자동 닫힘 제거 — 성공 컷인이 짧아서 실패처럼 느껴졌음.
      // 사용자가 직접 "닫기"를 눌러 메뉴로 복귀 (cancelBg 핸들러에서 restart).
    });
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', () => {
      close();
      if (resolved) this.scene.restart();
    });
  }

  // -------- 프로젝트 출시 이펙트 (아이템 강화와 동일 메커니즘) --------

  /** 프로젝트 출시 성공 — ring 3겹 + 파티클 폭발 + 카메라 플래시 + 흔들림 */
  private playProjectSuccessFx(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const D = 320;
    const color = 0xffd23f; // 골드 (출시 성공)

    // Ring 3겹 wave (스태거)
    const ringConfig = [
      { delay: 0, start: 50, end: 480 },
      { delay: 80, start: 80, end: 380 },
      { delay: 160, start: 110, end: 280 },
    ];
    ringConfig.forEach((rc) => {
      this.time.delayedCall(rc.delay, () => {
        const ring = this.add
          .circle(cx, cy, rc.start, color, 0)
          .setStrokeStyle(8, color, 1)
          .setDepth(D);
        this.tweens.add({
          targets: ring,
          radius: rc.end,
          alpha: 0,
          duration: 600,
          ease: 'Quart.easeOut',
          onComplete: () => ring.destroy(),
        });
      });
    });

    // 사방 파티클 폭발 (60개)
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.3;
      const distance = 350 + Math.random() * 100;
      const dotColor = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? color : 0x9af0a8);
      const size = 6 + Math.random() * 4;
      const dot = this.add.circle(cx, cy, size, dotColor, 1).setDepth(D);
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: 800 + Math.random() * 200,
        ease: 'Quart.easeOut',
        onComplete: () => dot.destroy(),
      });
    }

    // 12방향 빛줄기
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const ray = this.add
        .rectangle(cx, cy, 380, 6, 0xffffff, 1)
        .setOrigin(0, 0.5)
        .setRotation(angle)
        .setDepth(D);
      this.tweens.add({
        targets: ray,
        alpha: 0,
        scaleX: 1.4,
        duration: 500,
        ease: 'Quart.easeOut',
        onComplete: () => ray.destroy(),
      });
    }

    // 카메라 플래시 + 흔들림
    this.cameras.main.flash(400, 255, 220, 80);
    this.cameras.main.shake(320, 0.012);
    // 후속 골드 플래시
    this.time.delayedCall(180, () => {
      this.cameras.main.flash(200, 255, 210, 80);
    });
  }

  /** 프로젝트 출시 실패 — 작은 회색 ✕ 페이드만 (멀미 방지) */
  private playProjectFailFx(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const t = this.add
      .text(cx, cy, '✕', {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: '#6a6a6a',
      })
      .setOrigin(0.5)
      .setDepth(320)
      .setAlpha(0.7);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: cy - 30,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // -------- 계정 메뉴 (로그아웃/닉네임 변경) --------

  private openAccountMenu(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);

    const panel = this.add
      .rectangle(cx, cy, 480, 360, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.6)
      .setDepth(301);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 130, '👤 계정', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '28px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    objs.push(
      this.add
        .text(cx, cy - 80, this.cachedNickname ?? '닉네임 없음', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffd23f',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const close = () => objs.forEach((o) => o.destroy());

    // 닉네임 변경
    const changeBg = this.add
      .rectangle(cx, cy - 10, 320, 50, 0x4a90e2)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    objs.push(changeBg);
    objs.push(
      this.add
        .text(cx, cy - 10, '닉네임 변경', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(303),
    );
    changeBg.setInteractive({ useHandCursor: true });
    changeBg.on('pointerdown', () => {
      close();
      this.openNicknameChangeModal();
    });

    // 로그아웃
    const outBg = this.add
      .rectangle(cx, cy + 60, 320, 50, 0xe24a4a)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    objs.push(outBg);
    objs.push(
      this.add
        .text(cx, cy + 60, '로그아웃', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(303),
    );
    outBg.setInteractive({ useHandCursor: true });
    outBg.on('pointerdown', async () => {
      await signOut();
      close();
      void this.refreshAuthState();
    });

    // 닫기
    const cancelBg = this.add
      .rectangle(cx, cy + 130, 200, 44, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    objs.push(cancelBg);
    objs.push(
      this.add
        .text(cx, cy + 130, '닫기', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(303),
    );
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', close);
    overlay.on('pointerdown', close);
  }

  private openNicknameChangeModal(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0)
      .setDepth(300)
      .setInteractive();
    objs.push(overlay);

    const panel = this.add
      .rectangle(cx, cy, 520, 320, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.6)
      .setDepth(301);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 110, '닉네임 변경', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const inputEl = makeHtmlInput('text', 'username', '1~20자');
    inputEl.value = this.cachedNickname ?? '';
    positionInput(inputEl, 0, -20);
    document.body.appendChild(inputEl);
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 50);

    const status = this.add
      .text(cx, cy + 50, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#e24a4a',
      })
      .setOrigin(0.5)
      .setDepth(302);
    objs.push(status);

    const okBg = this.add
      .rectangle(cx - 80, cy + 110, 140, 50, 0xffd23f)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    objs.push(okBg);
    objs.push(
      this.add
        .text(cx - 80, cy + 110, '저장', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#0e0e12',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(303),
    );

    const cancelBg = this.add
      .rectangle(cx + 80, cy + 110, 140, 50, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    objs.push(cancelBg);
    objs.push(
      this.add
        .text(cx + 80, cy + 110, '취소', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(303),
    );

    const close = () => {
      objs.forEach((o) => o.destroy());
      inputEl.remove();
    };

    const submit = async () => {
      const v = inputEl.value.trim();
      if (!v) {
        status.setText('닉네임을 입력해주세요.');
        return;
      }
      const result = await cloudSetNickname(v);
      if (result.ok) {
        this.cachedNickname = v;
        if (this.authLabel) this.authLabel.setText(`👤 ${v}`);
        close();
      } else {
        status.setText(result.reason ?? '저장 실패');
      }
    };

    okBg.setInteractive({ useHandCursor: true });
    okBg.on('pointerdown', () => void submit());

    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerdown', close);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      } else if (e.key === 'Escape') close();
    });
  }

  // -------- 리더보드 모달 --------

  private openLeaderboardModal(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setOrigin(0)
      .setDepth(200)
      .setInteractive();
    objs.push(overlay);

    const panelW = 660;
    const panelH = 1180;
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x1a1a22)
      .setStrokeStyle(3, 0x4a90e2, 0.6)
      .setDepth(201);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - panelH / 2 + 36, '🏆 리더보드', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '32px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    const tabs: { label: string; sort: LeaderboardSort }[] = [
      { label: '종합', sort: 'best_overall' },
      { label: '👨‍💻 개발', sort: 'best_developer' },
      { label: '📋 기획', sort: 'best_planner' },
      { label: '🎨 디자인', sort: 'best_designer' },
      { label: '⭐ 명성', sort: 'prestige' },
    ];
    const tabY = cy - panelH / 2 + 90;
    const tabW = 110;
    const totalW = tabs.length * tabW + (tabs.length - 1) * 6;
    let tabX = cx - totalW / 2 + tabW / 2;

    let listObjs: Phaser.GameObjects.GameObject[] = [];
    const renderList = async (sort: LeaderboardSort, hl?: Phaser.GameObjects.Rectangle) => {
      listObjs.forEach((o) => o.destroy());
      listObjs = [];

      const loading = this.add
        .text(cx, cy + 30, '불러오는 중...', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#9aa0a6',
        })
        .setOrigin(0.5)
        .setDepth(202);
      listObjs.push(loading);

      const rows = await fetchLeaderboard(sort, 20);
      loading.destroy();
      listObjs = listObjs.filter((o) => o !== loading);

      if (rows.length === 0) {
        const empty = this.add
          .text(cx, cy + 30, '아직 등록된 데이터가 없습니다.', {
            fontFamily: 'Pretendard, sans-serif',
            fontSize: '18px',
            color: '#9aa0a6',
          })
          .setOrigin(0.5)
          .setDepth(202);
        listObjs.push(empty);
      } else {
        const startY = cy - panelH / 2 + 170;
        const rowH = 42;
        rows.forEach((row, idx) => {
          const ry = startY + idx * rowH;
          const value = pickSortValue(row, sort);
          const rank = `${idx + 1}.`;
          const line = this.add
            .text(
              cx - panelW / 2 + 30,
              ry,
              `${rank.padEnd(3, ' ')} ${row.nickname.padEnd(12, ' ')}  ${value}`,
              {
                fontFamily: 'Pretendard, sans-serif',
                fontSize: '17px',
                color: idx === 0 ? '#ffd23f' : idx === 1 ? '#cfd1d4' : idx === 2 ? '#e2904a' : '#cfd1d4',
                fontStyle: idx < 3 ? 'bold' : 'normal',
              },
            )
            .setOrigin(0, 0.5)
            .setDepth(202);
          listObjs.push(line);
        });
      }

      if (hl) {
        objs.forEach((o) => {
          if ((o as unknown as { __isTab?: boolean }).__isTab) {
            (o as Phaser.GameObjects.Rectangle).setFillStyle(0x2a2a32);
          }
        });
        hl.setFillStyle(0x4a90e2);
      }
    };

    tabs.forEach((t) => {
      const bg = this.add
        .rectangle(tabX, tabY, tabW, 36, t.sort === 'best_overall' ? 0x4a90e2 : 0x2a2a32)
        .setStrokeStyle(1, 0xffffff, 0.2)
        .setDepth(202);
      (bg as unknown as { __isTab: boolean }).__isTab = true;
      const txt = this.add
        .text(tabX, tabY, t.label, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(203);
      objs.push(bg, txt);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => void renderList(t.sort, bg));
      tabX += tabW + 6;
    });

    void renderList('best_overall');

    const closeY = cy + panelH / 2 - 50;
    const closeBg = this.add
      .rectangle(cx, closeY, 200, 56, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(203);
    const closeText = this.add
      .text(cx, closeY, '닫기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(204);
    objs.push(closeBg, closeText);

    const close = () => {
      objs.forEach((o) => o.destroy());
      listObjs.forEach((o) => o.destroy());
    };
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', close);
    overlay.on('pointerdown', close);
  }

  // -------- 직군 카드 --------

  private makeJobCard(x: number, y: number, key: JobKey, save: SaveData): void {
    const def = CHARACTERS[key];
    const w = 600;
    const h = 170;
    const container = this.add.container(x, y);

    const bg = this.add
      .rectangle(0, 0, w, h, 0x2a2a32)
      .setStrokeStyle(3, def.color, 0.6);
    const accent = this.add.rectangle(-w / 2 + 10, 0, 8, h - 20, def.color);

    // 직군 SVG 아이콘 (우측 상단). 미로드 시 emoji fallback.
    const iconKey = `icon-job-${key}`;
    const iconObj: Phaser.GameObjects.GameObject = this.textures.exists(iconKey)
      ? this.add.image(w / 2 - 80, 0, iconKey).setDisplaySize(96, 96)
      : this.add
          .text(w / 2 - 80, 0, JOB_EMOJI[key], { fontFamily: 'sans-serif', fontSize: '60px' })
          .setOrigin(0.5);

    const label = this.add
      .text(-w / 2 + 30, -h / 2 + 16, def.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    const prog = save.progress[key];
    const currentStateText = prog.alive
      ? `현재 ${prog.level}단계 (${titleFor(key, prog.level)})`
      : '💀 소멸 — 다시 시작 가능';
    const stateText = this.add
      .text(-w / 2 + 30, -h / 2 + 60, currentStateText, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '17px',
        color: '#cfd1d4',
        wordWrap: { width: w - 80 },
      })
      .setOrigin(0, 0);

    const best = save.bestByJob[key];
    const bestText = this.add
      .text(-w / 2 + 30, -h / 2 + 90, `🏅 최고 도달 ${best}단계`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '15px',
        color: '#ffd23f',
      })
      .setOrigin(0, 0);

    let synergyDesc = '';
    if (key === 'developer') synergyDesc = `시너지: 강화 +${(best * 1.5).toFixed(1)}%p`;
    else if (key === 'planner') synergyDesc = `시너지: 회복 ×${(1 + best * 0.10).toFixed(2)}`;
    else if (key === 'designer') synergyDesc = `시너지: 클릭 ×${(1 + best * 0.10).toFixed(2)}`;
    const synergy = this.add
      .text(-w / 2 + 30, -h / 2 + 116, synergyDesc, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#9af0a8',
      })
      .setOrigin(0, 0);

    const arrow = this.add
      .text(w / 2 - 20, 0, '▶', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5);

    container.add([bg, accent, iconObj, label, stateText, bestText, synergy, arrow]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => bg.setStrokeStyle(3, def.color, 1));
    container.on('pointerout', () => bg.setStrokeStyle(3, def.color, 0.6));
    container.on('pointerdown', () => {
      this.scene.start('Game', { jobKey: key });
    });
  }
}

// -------- HTML input 헬퍼 --------

function makeHtmlInput(type: string, autocomplete: string, placeholder: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  el.setAttribute('autocomplete', autocomplete);
  el.placeholder = placeholder;
  if (type === 'text') el.maxLength = 20;
  Object.assign(el.style, {
    position: 'absolute',
    left: '50%',
    width: '380px',
    padding: '12px 16px',
    fontSize: '18px',
    fontFamily: 'Pretendard, sans-serif',
    borderRadius: '8px',
    border: '2px solid #4a4a52',
    background: '#0e0e12',
    color: '#ffffff',
    zIndex: '500',
    outline: 'none',
    boxSizing: 'border-box',
  });
  return el;
}

function positionInput(el: HTMLInputElement, _xOffset: number, yOffset: number): void {
  // 화면 중앙 기준 yOffset px만큼 이동
  el.style.top = '50%';
  el.style.transform = `translate(-50%, calc(-50% + ${yOffset}px))`;
}

// -------- 팀 헬퍼 --------

const JOB_EMOJI: Record<JobKey, string> = {
  planner: '📋',
  designer: '🎨',
  developer: '👨‍💻',
};
const JOB_COLOR: Record<JobKey, number> = {
  planner: 0x4a90e2,
  designer: 0xe24a90,
  developer: 0x4ae290,
};
const JOB_LABEL: Record<JobKey, string> = {
  planner: '기획자',
  designer: '디자이너',
  developer: '개발자',
};

/** 본인 에이스 직군 — bestByJob이 가장 높은 직군. 동률이면 dev > planner > designer 우선. */
function pickAceJob(bestByJob: Record<JobKey, number>): JobKey {
  const entries: [JobKey, number][] = [
    ['developer', bestByJob.developer],
    ['planner', bestByJob.planner],
    ['designer', bestByJob.designer],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * gold 단위(save.gold나 비용 raw 값)를 KRW로 환산해 한국어 단위 표기.
 * 항상 ×10000 (RATES.KRW) 적용 후 formatCompactWon에 위임.
 */
function fmtGoldKRW(goldAmount: number): string {
  return formatCompactWon(goldAmount * 10000);
}

/** 큰 KRW 값 압축 표기 (1234567 → 123만 / 1234567890 → 12.3억). */
function formatCompactWon(amount: number): string {
  const ABS = Math.abs(amount);
  if (ABS < 10_000) return amount.toLocaleString();
  if (ABS < 100_000_000) return `${(amount / 10_000).toFixed(ABS < 1_000_000 ? 1 : 0)}만`;
  if (ABS < 1_000_000_000_000) return `${(amount / 100_000_000).toFixed(ABS < 10_000_000_000 ? 1 : 0)}억`;
  if (ABS < 1e16) return `${(amount / 1_000_000_000_000).toFixed(1)}조`;
  return `${(amount / 1e16).toFixed(2)}경`;
}

// -------- 시너지 / 정렬값 헬퍼 --------

function buildSynergyLine(save: SaveData): string {
  const lines: string[] = [];
  if (save.bestByJob.developer > 0) lines.push(`👨‍💻 강화 +${(save.bestByJob.developer * 1.5).toFixed(1)}%p`);
  if (save.bestByJob.planner > 0) lines.push(`📋 회복 ×${(1 + save.bestByJob.planner * 0.10).toFixed(2)}`);
  if (save.bestByJob.designer > 0) lines.push(`🎨 클릭 ×${(1 + save.bestByJob.designer * 0.10).toFixed(2)}`);
  return lines.length > 0 ? lines.join('  ·  ') : '아직 활성화된 시너지 없음';
}

function pickSortValue(row: LeaderboardRow, sort: LeaderboardSort): string {
  switch (sort) {
    case 'best_overall':
      return `종합 ${row.best_overall}단계 (D${row.best_developer}/P${row.best_planner}/De${row.best_designer})`;
    case 'best_developer':
      return `${row.best_developer}단계`;
    case 'best_planner':
      return `${row.best_planner}단계`;
    case 'best_designer':
      return `${row.best_designer}단계`;
    case 'prestige':
      return `명성치 ${row.prestige}`;
  }
}
