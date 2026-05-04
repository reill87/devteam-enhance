import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHARACTERS, titleFor, type JobKey } from '../data/characters';
import { loadSave, type SaveData } from '../systems/SaveSystem';
import { isSupabaseEnabled } from '../lib/supabase';
import {
  fetchOwnNickname,
  setNickname as cloudSetNickname,
  fetchLeaderboard,
  type LeaderboardRow,
  type LeaderboardSort,
} from '../systems/CloudSyncSystem';

export class MenuScene extends Phaser.Scene {
  private nicknameLabel?: Phaser.GameObjects.Text;
  private cachedNickname: string | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const save = loadSave();

    // 상단 좌측: 닉네임 / 우측: 리더보드 (Supabase 활성 시만)
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
      .text(cx, GAME_HEIGHT - 60, 'v0.1 · 팀빌드 · 클라우드 세이브 · 리더보드', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#5f6368',
      })
      .setOrigin(0.5);

    // Supabase 활성 시 비동기 닉네임 로드
    if (isSupabaseEnabled()) {
      void this.loadNicknameAsync();
    }
  }

  // -------- 상단 버튼 (닉네임 / 리더보드) --------

  private buildTopButtons(): void {
    // 좌측: 닉네임 영역 (클릭하면 변경 모달)
    this.nicknameLabel = this.add
      .text(20, 36, '👤 …', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.nicknameLabel.setInteractive({ useHandCursor: true });
    this.nicknameLabel.on('pointerdown', () => this.openNicknameModal());

    // 우측: 리더보드 버튼
    const lbW = 140;
    const lbH = 48;
    const lbX = GAME_WIDTH - 16 - lbW / 2;
    const lbY = 36;
    const bg = this.add
      .rectangle(lbX, lbY, lbW, lbH, 0x4a90e2)
      .setStrokeStyle(2, 0xffffff, 0.3);
    const text = this.add
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
    void text;
  }

  private async loadNicknameAsync(): Promise<void> {
    const nick = await fetchOwnNickname();
    this.cachedNickname = nick;
    if (this.nicknameLabel) {
      this.nicknameLabel.setText(nick ? `👤 ${nick}` : '👤 닉네임 설정');
    }
    if (!nick) {
      // 닉네임 없으면 자동으로 입력 모달 띄움
      this.openNicknameModal();
    }
  }

  // -------- 닉네임 입력 모달 --------

  private openNicknameModal(): void {
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
      .rectangle(cx, cy, 560, 380, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.6)
      .setDepth(301);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 130, '👤 닉네임', {
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
        .text(cx, cy - 80, '리더보드에 노출될 이름 (1~20자)', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '16px',
          color: '#9aa0a6',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    // Phaser는 텍스트 입력 위젯이 없어 HTML input을 통해 받음
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.maxLength = 20;
    inputEl.value = this.cachedNickname ?? '';
    inputEl.placeholder = '예: 갓개발자';
    Object.assign(inputEl.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -10px)',
      width: '380px',
      padding: '12px 16px',
      fontSize: '20px',
      fontFamily: 'Pretendard, sans-serif',
      borderRadius: '8px',
      border: '2px solid #ffd23f',
      background: '#0e0e12',
      color: '#ffffff',
      zIndex: '500',
      outline: 'none',
    });
    document.body.appendChild(inputEl);
    inputEl.focus();
    inputEl.select();

    const status = this.add
      .text(cx, cy + 50, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#e2c84a',
      })
      .setOrigin(0.5)
      .setDepth(302);
    objs.push(status);

    // 확인 버튼
    const okBg = this.add
      .rectangle(cx - 80, cy + 110, 140, 50, 0xffd23f)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const okText = this.add
      .text(cx - 80, cy + 110, '저장', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(okBg, okText);

    const cancelBg = this.add
      .rectangle(cx + 80, cy + 110, 140, 50, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const cancelText = this.add
      .text(cx + 80, cy + 110, '취소', {
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
      inputEl.remove();
    };

    const submit = async () => {
      const v = inputEl.value.trim();
      if (!v) {
        status.setText('닉네임을 입력해주세요.');
        return;
      }
      status.setText('저장 중...');
      const ok = await cloudSetNickname(v);
      if (ok) {
        this.cachedNickname = v;
        if (this.nicknameLabel) this.nicknameLabel.setText(`👤 ${v}`);
        close();
      } else {
        status.setText('저장 실패. 다시 시도해주세요.');
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
      } else if (e.key === 'Escape') {
        close();
      }
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

    // 정렬 탭
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
      // 기존 list 제거
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

      // 하이라이트 갱신
      if (hl) {
        // 다른 모든 탭 흐리게
        objs.forEach((o) => {
          if ((o as any).__isTab) {
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

    // 닫기 버튼
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
