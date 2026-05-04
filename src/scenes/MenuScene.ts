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
      this.add
        .text(cx, 240, `⭐ 명성치 ${save.prestige}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(cx, 290, '직군을 고르세요 (탭해서 시작)', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: '#cfd1d4',
      })
      .setOrigin(0.5);

    const order: JobKey[] = ['planner', 'designer', 'developer'];
    order.forEach((key, i) => {
      this.makeJobCard(cx, 360 + i * 200, key, save);
    });

    this.add
      .text(cx, GAME_HEIGHT - 60, 'v0.2 · 계정 인증 · 클라우드 세이브 · 리더보드', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#5f6368',
      })
      .setOrigin(0.5);

    if (isSupabaseEnabled()) {
      void this.refreshAuthState();
    }
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
    if (key === 'developer') synergyDesc = `시너지: 강화 +${(best * 0.3).toFixed(1)}%p`;
    else if (key === 'planner') synergyDesc = `시너지: 회복 ×${(1 + best * 0.02).toFixed(2)}`;
    else if (key === 'designer') synergyDesc = `시너지: 클릭 ×${(1 + best * 0.02).toFixed(2)}`;
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

    container.add([bg, accent, label, stateText, bestText, synergy, arrow]);
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

// -------- 시너지 / 정렬값 헬퍼 --------

function buildSynergyLine(save: SaveData): string {
  const lines: string[] = [];
  if (save.bestByJob.developer > 0) lines.push(`👨‍💻 강화 +${(save.bestByJob.developer * 0.3).toFixed(1)}%p`);
  if (save.bestByJob.planner > 0) lines.push(`📋 회복 ×${(1 + save.bestByJob.planner * 0.02).toFixed(2)}`);
  if (save.bestByJob.designer > 0) lines.push(`🎨 클릭 ×${(1 + save.bestByJob.designer * 0.02).toFixed(2)}`);
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
