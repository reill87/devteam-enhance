import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHARACTERS, MAX_LEVEL, titleFor, type JobKey } from '../data/characters';
import {
  rateAt,
  rewardFor,
  REGEN_INTERVAL_MS,
  regenAmount,
  DEVELOPER_COMBO_DEADLINE_MS,
  DEVELOPER_COMBO_BONUS_PER,
  DEVELOPER_COMBO_BONUS_CAP,
} from '../data/rates';
import {
  INCOMES,
  CLICK_INCOMES,
  PASSIVE_INCOMES,
  type IncomeKey,
} from '../data/income';
import {
  tryEnhance,
  costFor,
  effectiveRate,
  type EnhanceResult,
  type ActiveBuffs,
} from '../systems/EnhanceSystem';
import { pickMessage, type MessageBucket } from '../data/messages';
import { ITEMS, ITEM_KEYS, type ItemKey } from '../data/items';
import { loadSave, persistSave, type SaveData } from '../systems/SaveSystem';
import { pushCloudSave } from '../systems/CloudSyncSystem';
import { formatGold, formatSalary, nextCurrency } from '../data/currency';
import { salaryAt } from '../data/salary';
import {
  SLOTS,
  SLOT_KEYS,
  EQUIP_MAX_LEVEL,
  equipTitleFor,
  mainBonusPct,
  subMultiplier,
  accessoryMultiplier,
  type EquipSlot,
} from '../data/equipment';
import {
  tryEnhanceEquip,
  equipCostFor,
  equipSuccessRate,
} from '../systems/EquipmentSystem';
import {
  PLANNER_SLOT_COUNT,
  plannerSlotCost,
  plannerSlotDurationMs,
  plannerSlotState,
} from '../data/planner';
import {
  DESIGNER_ROUND_COUNT,
  DESIGNER_ROUND_INTERVAL_MS,
  DESIGNER_ROUND_LABELS,
  designerPerRoundRate,
} from '../data/designer';
import { failPenaltyFor, checkSynergyGate } from '../data/rates';
import { milestonesReached, type MilestoneDef } from '../data/milestones';
import { officeMultiplier } from '../data/office';
import { COLORS, hex } from '../data/theme';
import {
  makePanel,
  applyShadow,
  applyGlow,
  spawnRotatingRing,
  makeHalo,
  spawnIdleParticles,
} from '../lib/ui-helpers';

type SceneInit = { jobKey?: JobKey };

const BUILDUP_MS = 700;
const PAUSE_MS = 80;
const CUTIN_HOLD_MS = 700;
const CUTIN_OUT_MS = 200;

const COLOR_GOLD = 0xffd23f;
const COLOR_DIM = 0x5a5a5a;

export class GameScene extends Phaser.Scene {
  private jobKey: JobKey = 'developer';
  private level = 0;
  private alive = true;
  private isEnhancing = false;
  private skipReady = false;
  private skipCutIn?: () => void;

  private save!: SaveData;
  private buffs: ActiveBuffs = {};

  // 상태 표시 텍스트
  private titleText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private regenText!: Phaser.GameObjects.Text;
  private buffsText!: Phaser.GameObjects.Text;
  private salaryText!: Phaser.GameObjects.Text;
  private regenTimer?: Phaser.Time.TimerEvent;
  private characterShape!: Phaser.GameObjects.Arc;
  private charHalo!: Phaser.GameObjects.Arc;
  private charHaloOuter!: Phaser.GameObjects.Arc;
  private ringContainer!: Phaser.GameObjects.Container;
  private ringTween!: Phaser.Tweens.Tween;
  private idleParticleTimer?: Phaser.Time.TimerEvent;

  // 강화 버튼
  private enhanceBtn!: Phaser.GameObjects.Container;
  private enhanceBtnBg!: Phaser.GameObjects.Rectangle;
  private enhanceBtnLabel!: Phaser.GameObjects.Text;
  private enhanceBtnSub!: Phaser.GameObjects.Text;

  // 클릭형 수익 버튼 (출근 / 블로그 등)
  private incomeButtons: Partial<Record<IncomeKey, {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    sub: Phaser.GameObjects.Text;
  }>> = {};
  private incomeCooldownUntil: Partial<Record<IncomeKey, number>> = {};
  private passiveTimers: Phaser.Time.TimerEvent[] = [];
  private autoWorkTimer?: Phaser.Time.TimerEvent;
  private cloudPushTimer?: Phaser.Time.TimerEvent;

  // 장비 슬롯 UI
  private equipSlotUI: Partial<Record<EquipSlot, {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    levelText: Phaser.GameObjects.Text;
  }>> = {};

  // 기획자 병렬 슬롯 UI (Phase 1B)
  private plannerSlotUI: Array<{
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    sub: Phaser.GameObjects.Text;
    gauge: Phaser.GameObjects.Rectangle;
    gaugeMaxWidth: number;
  }> = [];

  // 콤보 / 타이밍 게이지 / 긴급 알림
  private comboText!: Phaser.GameObjects.Text;
  private comboPanel?: Phaser.GameObjects.Graphics;
  private teamSynergyText!: Phaser.GameObjects.Text;
  private teamSynergyPanel?: Phaser.GameObjects.Graphics;
  private currentTimingBonus = 0;
  private timingGaugeObjs: Phaser.GameObjects.GameObject[] = [];
  private timingGaugeStop?: () => number;

  private emergencyTimer?: Phaser.Time.TimerEvent;
  private emergencyActive = false;
  private emergencyObjs: Phaser.GameObjects.GameObject[] = [];

  // 인벤 슬롯 (아이콘은 SVG 이미지 또는 이모지 텍스트 fallback)
  private slotByKey: Partial<Record<ItemKey, {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    countText: Phaser.GameObjects.Text;
  }>> = {};

  private charBaseX = 0;
  private charBaseY = 0;
  private shakeAmplitude = 0;

  constructor() {
    super('Game');
  }

  init(data: SceneInit): void {
    this.jobKey = data.jobKey ?? 'developer';
    this.save = loadSave();
    // 직군별 진행 상태 복원 (새로고침 후 단계 유지)
    const prog = this.save.progress[this.jobKey];
    this.level = prog.level;
    this.alive = prog.alive;
    this.isEnhancing = false;
    this.skipReady = false;
    this.skipCutIn = undefined;
    this.shakeAmplitude = 0;
    this.buffs = {};
    this.currentTimingBonus = 0;
    this.timingGaugeObjs = [];
    this.timingGaugeStop = undefined;
    this.emergencyActive = false;
    this.emergencyObjs = [];
    this.equipSlotUI = {};
    this.incomeButtons = {};
    this.incomeCooldownUntil = {};
  }

  /** 현재 직군의 진행 상태를 SaveData에 반영 + bestByJob 갱신 */
  private syncProgress(): void {
    this.save.progress[this.jobKey] = { level: this.level, alive: this.alive };
    if (this.level > this.save.bestByJob[this.jobKey]) {
      this.save.bestByJob[this.jobKey] = this.level;
    }
  }

  /** 클라우드 push debounced 호출 (10초 안에 여러 번 호출되어도 마지막에 한 번) */
  private scheduleCloudPush(): void {
    this.cloudPushTimer?.remove(false);
    this.cloudPushTimer = this.time.delayedCall(10_000, () => {
      void pushCloudSave(this.save);
    });
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const def = CHARACTERS[this.jobKey];

    this.buildTopBar();

    this.add
      .text(cx, 200, def.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '32px',
        color: '#9aa0a6',
      })
      .setOrigin(0.5);

    this.titleText = this.add
      .text(cx, 250, titleFor(this.jobKey, this.level), {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5);
    applyShadow(this.titleText, 4, 6);

    this.salaryText = this.add
      .text(cx, 305, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: '#ffd23f',
      })
      .setOrigin(0.5);

    this.charBaseX = cx;
    this.charBaseY = 480;

    // === 캐릭터 영역 강화: 후광 + 회전 링 + idle 파티클 ===
    // 후광 (캐릭터 뒤, 직군 색상으로 흐릿하게)
    this.charHalo = makeHalo(this, this.charBaseX, this.charBaseY, 220, def.color, 0.16);
    this.charHalo.setDepth(-2);
    // 더 큰 outer halo (이중 후광)
    this.charHaloOuter = makeHalo(this, this.charBaseX, this.charBaseY, 280, def.color, 0.07);
    this.charHaloOuter.setDepth(-3);
    // 회전 링 (점선 16개, 골드, 18초 한 바퀴)
    const ring = spawnRotatingRing(
      this,
      this.charBaseX,
      this.charBaseY,
      170,
      16,
      3.5,
      COLORS.gold,
      0.45,
      18000,
    );
    this.ringContainer = ring.container;
    this.ringTween = ring.tween;
    this.charHalo.setDepth(-2);

    this.characterShape = this.add.circle(this.charBaseX, this.charBaseY, 130, def.color);
    this.characterShape.setStrokeStyle(6, 0xffffff, 0.4);

    // 캐릭터 좌측에 장비 슬롯 3개 (세로 배치)
    this.buildEquipSlots(80, [410, 480, 550]);

    // 캐릭터 우측 — 콤보 카드 (콤보 있을 때만 표시)
    this.comboPanel = makePanel(this, GAME_WIDTH - 80, 480, 110, 110, {
      fill: COLORS.bgPanel,
      fillAlpha: 0.9,
      border: COLORS.orange,
      borderAlpha: 0.4,
      radius: 12,
    });
    this.comboPanel.setVisible(false);
    this.comboText = this.add
      .text(GAME_WIDTH - 80, 480, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: hex(COLORS.orange),
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // 캐릭터 우측 — 팀 시너지 카드 (시너지 있을 때만 표시)
    this.teamSynergyPanel = makePanel(this, GAME_WIDTH - 80, 605, 130, 90, {
      fill: COLORS.bgPanel,
      fillAlpha: 0.9,
      border: COLORS.success,
      borderAlpha: 0.35,
      radius: 12,
    });
    this.teamSynergyPanel.setVisible(false);
    this.teamSynergyText = this.add
      .text(GAME_WIDTH - 80, 605, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '13px',
        color: hex(COLORS.successGlow),
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5);

    this.levelText = this.add
      .text(this.charBaseX, this.charBaseY, String(this.level), {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '128px',
        color: '#0e0e12',
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    applyGlow(this.levelText, COLORS.gold, 18);

    // 결과 메시지 박스 (카드형 패널)
    makePanel(this, cx, 705, 640, 84, {
      fill: COLORS.bgPanelDeep,
      fillAlpha: 0.85,
      border: COLORS.border,
      borderAlpha: 0.7,
      radius: 16,
      shadow: true,
    });
    this.resultText = this.add
      .text(cx, 705, '강화 버튼을 눌러보세요', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: hex(COLORS.textMuted),
        align: 'center',
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5);

    this.rateText = this.add
      .text(cx, 780, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.buffsText = this.add
      .text(cx, 825, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffd23f',
        align: 'center',
      })
      .setOrigin(0.5);

    this.buildIncomeRow(cx, 880);
    this.buildKpiBar(cx, 945);
    this.buildEnhanceButton(cx, 990);
    if (this.jobKey === 'planner') {
      this.enhanceBtn.setVisible(false);
      this.buildPlannerSlots(cx, 990);
    }
    // L3/L4: 야근/자동 강화 토글 (조건 충족 시)
    this.buildModeToggles(cx, 1075);

    // 하단 가로 두 버튼: 직군 변경 + 이직
    this.makeButton(
      cx - 110,
      1175,
      '← 직군',
      0x3a3a44,
      () => {
        if (this.isEnhancing) return;
        this.scene.start('Menu');
      },
      { width: 200, height: 56, fontSize: 20, textColor: '#ffffff' },
    );
    this.makeButton(
      cx + 110,
      1175,
      '📤 이직',
      0x4a90e2,
      () => this.openResignModal(),
      { width: 200, height: 56, fontSize: 20, textColor: '#ffffff' },
    );

    // 단축키 가이드 (작게)
    this.add
      .text(
        cx,
        1240,
        '⌨️ Space 강화 · W 출근 · B 블로그 · 1~9·0 아이템 · S 상점 · E 이직',
        {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#5f6368',
        },
      )
      .setOrigin(0.5);

    this.regenTimer = this.time.addEvent({
      delay: REGEN_INTERVAL_MS,
      loop: true,
      callback: () => this.tickRegen(),
    });
    this.registerPassiveTimers();
    this.emergencyTimer = this.time.addEvent({
      delay: 75_000,
      loop: true,
      callback: () => this.maybeFireEmergency(),
    });
    this.setupAutoWork();
    this.setupAutoEnhance();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.regenTimer?.remove(false);
      this.regenTimer = undefined;
      this.passiveTimers.forEach((t) => t.remove(false));
      this.passiveTimers = [];
      this.emergencyTimer?.remove(false);
      this.emergencyTimer = undefined;
      this.autoWorkTimer?.remove(false);
      this.autoWorkTimer = undefined;
      this.autoEnhanceTimer?.remove(false);
      this.autoEnhanceTimer = undefined;
      this.cloudPushTimer?.remove(false);
      this.cloudPushTimer = undefined;
      this.idleParticleTimer?.remove(false);
      this.idleParticleTimer = undefined;
      this.ringTween?.stop();
      this.ringContainer?.destroy();
      // 씬 종료 시 즉시 클라우드에 한 번 push (저장 누락 방지)
      void pushCloudSave(this.save);
      this.clearEmergencyObjs();
      this.clearTimingGauge();
    });

    // idle 파티클 (단계 5+ 시 활성)
    this.setupIdleParticles();

    this.refreshAll();

    // 단축키 바인딩
    this.setupKeyboardShortcuts();

    // 폭사 상태 복원 시 캐릭터 시각 처리
    if (!this.alive) {
      this.characterShape.setFillStyle(0x3a3a44);
      this.characterShape.setAlpha(0.4);
      this.levelText.setAlpha(0.5);
    }

    // AFK 보상: 마지막 접속 시각과 비교해 보상 지급
    this.grantAfkReward();
  }

  private setupKeyboardShortcuts(): void {
    if (!this.input.keyboard) return;
    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this.handlePrimaryAction());
    kb.on('keydown-W', () => this.handleIncomeClick('work'));
    kb.on('keydown-B', () => this.handleIncomeClick('blog'));
    kb.on('keydown-S', () => this.openShop());
    kb.on('keydown-E', () => this.openResignModal());
    // 1~9, 0 → 아이템 토글 (ITEM_KEYS 순서: blessing, super_blessing, protect, revive, luck,
    //                      masterhand, deadline, gamble, refactor, moodboard)
    const itemNumKeys: Array<{ key: string; idx: number }> = [
      { key: 'ONE', idx: 0 },
      { key: 'TWO', idx: 1 },
      { key: 'THREE', idx: 2 },
      { key: 'FOUR', idx: 3 },
      { key: 'FIVE', idx: 4 },
      { key: 'SIX', idx: 5 },
      { key: 'SEVEN', idx: 6 },
      { key: 'EIGHT', idx: 7 },
      { key: 'NINE', idx: 8 },
      { key: 'ZERO', idx: 9 },
    ];
    itemNumKeys.forEach(({ key, idx }) => {
      kb.on(`keydown-${key}`, () => {
        const k = ITEM_KEYS[idx];
        if (k) this.toggleBuff(k);
      });
    });
  }

  private setupIdleParticles(): void {
    this.idleParticleTimer?.remove(false);
    this.idleParticleTimer = undefined;
    if (!this.alive) return;
    if (this.level < 5) return;
    // 단계 비례 파티클 수: 5단계=1, 10=2, 15+=3
    const count = Math.min(3, Math.floor((this.level - 4) / 5) + 1);
    this.idleParticleTimer = spawnIdleParticles(
      this,
      this.charBaseX,
      this.charBaseY,
      count,
      COLORS.gold,
    );
  }

  private registerPassiveTimers(): void {
    PASSIVE_INCOMES.forEach((key) => {
      const def = INCOMES[key];
      const t = this.time.addEvent({
        delay: def.param,
        loop: true,
        callback: () => {
          if (!this.alive) return;
          if (this.level < def.unlockLevel) return;
          // 사이드 프로젝트 / 스카웃 메일도 sub 도구의 영향으로 가속됨 (자동 수익은 sub 카테고리)
          const reward = Math.ceil(def.reward(this.level) * this.currentSubMul() * this.prestigeRegenMul() * this.teamRegenMul() * this.officeMul());
          this.save.gold += reward;
          persistSave(this.save);
          this.refreshTopBar();
          this.spawnFloatingGold(reward, `${def.emoji} ${def.label}`, '#9af0a8');
          if (!this.isEnhancing) this.refreshPrimaryButton();
        },
      });
      this.passiveTimers.push(t);
    });
  }

  private tickRegen(): void {
    const base = regenAmount(this.alive ? this.level : 0);
    const amount = Math.ceil(base * this.currentSubMul() * this.prestigeRegenMul() * this.teamRegenMul() * this.officeMul());
    this.save.gold += amount;
    persistSave(this.save);
    this.refreshTopBar();
    if (!this.isEnhancing) this.refreshPrimaryButton();
  }

  private buildIncomeRow(centerX: number, y: number): void {
    const btnW = 240;
    const btnH = 70;
    const gap = 20;
    const total = CLICK_INCOMES.length * btnW + (CLICK_INCOMES.length - 1) * gap;
    let x = centerX - total / 2 + btnW / 2;
    CLICK_INCOMES.forEach((key) => {
      this.buildIncomeButton(x, y, btnW, btnH, key);
      x += btnW + gap;
    });
    this.refreshIncomeButtons();
  }

  private buildIncomeButton(x: number, y: number, w: number, h: number, key: IncomeKey): void {
    const def = INCOMES[key];
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, 0x4a90e2, 1)
      .setStrokeStyle(2, 0xffffff, 0.25);
    // 좌측 아이콘 + 우측 텍스트 (라벨/sub)
    const icon = this.add
      .image(-w / 2 + 30, 0, `icon-income-${key}`)
      .setDisplaySize(40, 40);
    const label = this.add
      .text(-w / 2 + 60, -12, def.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const sub = this.add
      .text(-w / 2 + 60, 14, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    container.add([bg, icon, label, sub]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff, 0.7));
    container.on('pointerout', () => bg.setStrokeStyle(2, 0xffffff, 0.25));
    container.on('pointerdown', () => this.handleIncomeClick(key));
    this.incomeButtons[key] = { container, bg, label, sub };
  }

  private handleIncomeClick(key: IncomeKey): void {
    const def = INCOMES[key];
    const slot = this.incomeButtons[key];
    if (!slot) return;
    if (!this.alive) return;
    if (this.level < def.unlockLevel) return;
    const now = this.time.now;
    const cd = this.incomeCooldownUntil[key] ?? 0;
    if (now < cd) return;

    // 클릭 보상 = 장신구 × 명성 × 팀 시너지
    let reward = Math.ceil(def.reward(this.level) * this.currentAccMul() * this.prestigeClickMul() * this.officeMul() * this.teamClickMul());
    let label = `${def.emoji}`;
    let color = '#ffd23f';

    // 출근하기 전용 RNG 잭팟
    if (key === 'work') {
      const r = Math.random();
      if (r < 0.001) {
        reward *= 100;
        label = '🤑 스톡옵션 행사!';
        color = '#a370ff';
      } else if (r < 0.01) {
        reward *= 10;
        label = '💰 성과급 지급!';
        color = '#ff8c42';
      } else if (r < 0.05) {
        reward *= 3;
        label = '🌙 야근 수당!';
        color = '#9af0a8';
      }
    }

    this.save.gold += reward;
    persistSave(this.save);
    this.refreshTopBar();
    this.spawnFloatingGold(reward, label, color);
    this.tweens.add({
      targets: slot.label,
      scale: { from: 1.18, to: 1.0 },
      duration: 140,
      ease: 'Cubic.easeOut',
    });

    if (def.param > 0) {
      this.incomeCooldownUntil[key] = now + def.param;
    }
    this.refreshIncomeButtons();
    if (!this.isEnhancing) this.refreshPrimaryButton();
  }

  private refreshIncomeButtons(): void {
    const now = this.time.now;
    CLICK_INCOMES.forEach((key) => {
      const slot = this.incomeButtons[key];
      if (!slot) return;
      const def = INCOMES[key];
      const locked = this.alive && this.level < def.unlockLevel;
      const cd = this.incomeCooldownUntil[key] ?? 0;
      const onCooldown = now < cd;

      if (!this.alive) {
        slot.bg.setFillStyle(COLOR_DIM);
        slot.label.setColor('#9aa0a6');
        slot.sub.setText('소멸 중');
        slot.sub.setColor('#9aa0a6');
        slot.container.disableInteractive();
        return;
      }
      if (locked) {
        slot.bg.setFillStyle(COLOR_DIM);
        slot.label.setColor('#9aa0a6');
        slot.sub.setText(`🔒 ${def.unlockLevel}단계 해금`);
        slot.sub.setColor('#9aa0a6');
        slot.container.disableInteractive();
        return;
      }
      if (onCooldown) {
        const remain = Math.ceil((cd - now) / 1000);
        slot.bg.setFillStyle(COLOR_DIM);
        slot.label.setColor('#cfd1d4');
        slot.sub.setText(`쿨타임 ${remain}s`);
        slot.sub.setColor('#cfd1d4');
        slot.container.disableInteractive();
        return;
      }
      const reward = Math.ceil(
        def.reward(this.level) * this.currentAccMul() * this.prestigeClickMul() * this.officeMul() * this.teamClickMul(),
      );
      slot.bg.setFillStyle(0x4a90e2);
      slot.label.setColor('#ffffff');
      if (key === 'work' && this.autoWorkTimer) {
        const sec = (this.autoWorkInterval() / 1000).toFixed(1);
        slot.sub.setText(`+${this.fmtGold(reward)} · 자동 ${sec}s`);
      } else {
        slot.sub.setText(`+${this.fmtGold(reward)}`);
      }
      slot.sub.setColor('#ffffff');
      slot.container.setInteractive({ useHandCursor: true });
    });
  }

  private spawnFloatingGold(amount: number, label: string, color: string = '#ffd23f'): void {
    const text = this.add
      .text(20, 90, `${label}  +${this.fmtGold(amount)}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0)
      .setDepth(150);
    this.tweens.add({
      targets: text,
      y: 130,
      alpha: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private cooldownTickAccumulator = 0;
  private comboTickAccumulator = 0;
  update(_time: number, delta: number): void {
    if (this.shakeAmplitude > 0) {
      const dx = (Math.random() - 0.5) * this.shakeAmplitude;
      const dy = (Math.random() - 0.5) * this.shakeAmplitude;
      this.characterShape.x = this.charBaseX + dx;
      this.characterShape.y = this.charBaseY + dy;
    }
    this.levelText.x = this.characterShape.x;
    this.levelText.y = this.characterShape.y;

    // 클릭 인컴 쿨타임 표시 갱신 (4Hz)
    this.cooldownTickAccumulator += delta;
    if (this.cooldownTickAccumulator >= 250) {
      this.cooldownTickAccumulator = 0;
      this.refreshIncomeButtons();
    }

    // 개발자 콤보 만료 체크 + 카운트다운 표시 (4Hz)
    if (this.jobKey === 'developer') {
      this.comboTickAccumulator += delta;
      if (this.comboTickAccumulator >= 250) {
        this.comboTickAccumulator = 0;
        this.checkComboExpiry();
        if (this.save.combo > 0) this.refreshComboText();
      }
    }

    // 기획자 슬롯 진행 상태 갱신 (4Hz, cooldownTickAccumulator 재사용)
    if (this.jobKey === 'planner' && this.cooldownTickAccumulator === 0) {
      this.refreshPlannerSlots();
    }
  }

  // -------- 상단바 (골드, 인벤, 상점) --------

  private buildTopBar(): void {
    // 상단바: 2줄 구성 (총 130px)
    //   Row 1 (0~70):  골드/회복 텍스트(좌) + 상점 버튼(우)
    //   Row 2 (70~130): 인벤 슬롯 10개 (가로 전체)
    this.add
      .rectangle(0, 0, GAME_WIDTH, 130, 0x1a1a22)
      .setOrigin(0)
      .setDepth(0);

    // Row 1: 골드 + 회복
    this.goldText = this.add
      .text(20, 26, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '24px',
        color: '#ffd23f',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.goldText.setInteractive({ useHandCursor: true });
    this.goldText.on('pointerdown', () => this.toggleCurrency());
    this.regenText = this.add
      .text(20, 52, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#9aa0a6',
      })
      .setOrigin(0, 0.5);

    // Row 1 우측: 상점 버튼
    const shopBtnW = 70;
    const shopBtnH = 56;
    const shopX = GAME_WIDTH - 12 - shopBtnW / 2;
    const shopY = 36;
    const shopBg = this.add
      .rectangle(shopX, shopY, shopBtnW, shopBtnH, 0x4a90e2)
      .setStrokeStyle(2, 0xffffff, 0.3);
    this.add
      .text(shopX, shopY, '🏪', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
      })
      .setOrigin(0.5);
    shopBg.setInteractive({ useHandCursor: true });
    shopBg.on('pointerdown', () => this.openShop());
    shopBg.on('pointerover', () => shopBg.setStrokeStyle(2, 0xffffff, 0.7));
    shopBg.on('pointerout', () => shopBg.setStrokeStyle(2, 0xffffff, 0.3));

    // Row 2: 인벤 슬롯 10개 — 가로 전체에 균등 분포
    const slotCount = ITEM_KEYS.length;
    const slotH = 54;
    const sidePad = 12;
    const totalAvail = GAME_WIDTH - sidePad * 2;
    const slotGap = 4;
    const slotW = Math.floor((totalAvail - (slotCount - 1) * slotGap) / slotCount);
    const slotY = 100;
    const startX = sidePad + slotW / 2;
    ITEM_KEYS.forEach((key, i) => {
      const x = startX + i * (slotW + slotGap);
      this.buildInventorySlot(x, slotY, slotW, slotH, key);
    });
  }

  private buildInventorySlot(x: number, y: number, w: number, h: number, key: ItemKey): void {
    void ITEMS[key];
    const bg = this.add
      .rectangle(x, y, w, h, 0x2a2a32)
      .setStrokeStyle(2, 0xffffff, 0.15);
    // 아이콘 SVG가 로드된 키만 이미지 사용. 미로드 시 이모지 fallback.
    const iconKey = `icon-item-${key}`;
    let icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.textures.exists(iconKey)) {
      icon = this.add.image(x, y - 6, iconKey).setDisplaySize(36, 36);
    } else {
      icon = this.add
        .text(x, y - 6, ITEMS[key].emoji, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
        })
        .setOrigin(0.5);
    }
    const countText = this.add
      .text(x + w / 2 - 4, y + h / 2 - 2, '×0', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 1);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.toggleBuff(key));
    bg.on('pointerover', () => {
      if (this.save.inventory[key] > 0) bg.setStrokeStyle(2, 0xffffff, 0.6);
    });
    bg.on('pointerout', () => {
      this.refreshSlotStyle(key);
    });

    this.slotByKey[key] = { bg, icon, countText };
  }

  private toggleBuff(key: ItemKey): void {
    if (this.isEnhancing) return;
    if (this.save.inventory[key] <= 0) {
      this.flashResultText(`보유한 ${ITEMS[key].label}이(가) 없습니다. 상점에서 구매하세요.`);
      return;
    }
    // 장인의 손길 글로벌 쿨다운 체크
    if (key === 'masterhand' && !this.buffs[key] && this.masterhandOnCooldown()) {
      this.flashResultText(`💎 장인의 손길 쿨타임 ${this.masterhandCooldownText()} 남음`);
      return;
    }
    this.buffs[key] = !this.buffs[key];
    this.refreshAll();
  }

  // -------- 강화 버튼 --------

  private buildEnhanceButton(x: number, y: number): void {
    const w = 400;
    const h = 96;
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, COLOR_GOLD, 1)
      .setStrokeStyle(3, 0xffffff, 0.2);
    const label = this.add
      .text(0, -16, '강화하기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 18, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#0e0e12',
      })
      .setOrigin(0.5);
    container.add([bg, label, sub]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff, 0.6));
    container.on('pointerout', () => bg.setStrokeStyle(3, 0xffffff, 0.2));
    container.on('pointerdown', () => this.handlePrimaryAction());

    this.enhanceBtn = container;
    this.enhanceBtnBg = bg;
    this.enhanceBtnLabel = label;
    this.enhanceBtnSub = sub;
  }

  // ============ L0: 분기 KPI 진행 바 ============

  private kpiBar?: Phaser.GameObjects.Rectangle;
  private kpiBarText?: Phaser.GameObjects.Text;
  private kpiBarMaxWidth = 360;

  private buildKpiBar(cx: number, y: number): void {
    const w = this.kpiBarMaxWidth;
    const h = 14;
    this.add.rectangle(cx, y, w, h, 0x1a1a22).setStrokeStyle(1, 0xffffff, 0.2);
    this.kpiBar = this.add
      .rectangle(cx - w / 2, y, 0, h - 2, 0xffd23f)
      .setOrigin(0, 0.5);
    this.kpiBarText = this.add
      .text(cx, y - 14, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '12px',
        color: '#ffd23f',
      })
      .setOrigin(0.5);
    this.refreshKpiBar();
  }

  private refreshKpiBar(): void {
    if (!this.kpiBar || !this.kpiBarText) return;
    const streak = this.save.quarterlyKpiStreak;
    const ratio = Math.max(0, Math.min(1, streak / 10));
    this.kpiBar.width = this.kpiBarMaxWidth * ratio;
    this.kpiBarText.setText(`📈 분기 KPI ${streak}/10  ·  누적 ${this.save.quarterlyKpiTotal}회`);
  }

  // ============ L3/L4: 모드 토글 ============

  private autoEnhanceTimer?: Phaser.Time.TimerEvent;

  private buildModeToggles(cx: number, y: number): void {
    const items: { unlock: number; label: () => string; onClick: () => void; getActive: () => boolean }[] = [];
    if (this.save.bestByJob[this.jobKey] >= 40 || this.level >= 40) {
      items.push({
        unlock: 40,
        label: () => `🚀 야근 ${this.save.yagunMode ? 'ON' : 'OFF'}`,
        onClick: () => {
          this.save.yagunMode = !this.save.yagunMode;
          persistSave(this.save);
          this.refreshAll();
          this.flashTickerText(this.save.yagunMode ? '🚀 야근 모드 — 비용×2/보상×3, 실패 시 -3단계' : '야근 모드 OFF');
        },
        getActive: () => this.save.yagunMode,
      });
    }
    if (this.save.bestByJob[this.jobKey] >= 250 || this.level >= 250) {
      items.push({
        unlock: 250,
        label: () => `🤖 자동 ${this.save.autoEnhanceEnabled ? 'ON' : 'OFF'}`,
        onClick: () => {
          this.save.autoEnhanceEnabled = !this.save.autoEnhanceEnabled;
          persistSave(this.save);
          this.setupAutoEnhance();
          this.refreshAll();
          this.flashTickerText(this.save.autoEnhanceEnabled ? '🤖 자동 강화 ON (5초 주기)' : '자동 강화 OFF');
        },
        getActive: () => this.save.autoEnhanceEnabled,
      });
    }
    if (items.length === 0) return;
    const btnW = 160;
    const gap = 12;
    const totalW = items.length * btnW + (items.length - 1) * gap;
    let bx = cx - totalW / 2 + btnW / 2;
    items.forEach((item) => {
      this.makeButton(bx, y, item.label(), item.getActive() ? 0xffd23f : 0x3a3a44, () => {
        item.onClick();
      }, { width: btnW, height: 44, fontSize: 16, textColor: item.getActive() ? '#0e0e12' : '#ffffff' });
      bx += btnW + gap;
    });
  }

  private setupAutoEnhance(): void {
    this.autoEnhanceTimer?.remove(false);
    this.autoEnhanceTimer = undefined;
    if (!this.save.autoEnhanceEnabled) return;
    if (!this.alive) return;
    this.autoEnhanceTimer = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        if (this.isEnhancing) return;
        if (!this.alive) return;
        if (this.level >= MAX_LEVEL) return;
        // 자동: 가격 체크만 통과하면 시도
        const cost = this.save.yagunMode ? costFor(this.level, this.jobKey) * 2 : costFor(this.level, this.jobKey);
        if (this.save.gold < cost) return;
        this.handlePrimaryAction();
      },
    });
  }

  // ============ 기획자 병렬 슬롯 (Phase 1B) ============

  private buildPlannerSlots(centerX: number, y: number): void {
    const w = 200;
    const h = 96;
    const gap = 16;
    const total = PLANNER_SLOT_COUNT * w + (PLANNER_SLOT_COUNT - 1) * gap;
    const startX = centerX - total / 2 + w / 2;
    for (let i = 0; i < PLANNER_SLOT_COUNT; i++) {
      const x = startX + i * (w + gap);
      const container = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, w, h, 0x4a90e2, 1)
        .setStrokeStyle(3, 0xffffff, 0.2);
      // 라벨/서브 — 색은 고정. 가독성은 stroke로 보장 (어떤 bg에서도 읽힘)
      const label = this.add
        .text(0, -22, '📋 새 스펙', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const sub = this.add
        .text(0, 8, '', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      const gaugeMaxWidth = w - 24;
      const gauge = this.add
        .rectangle(-gaugeMaxWidth / 2, h / 2 - 12, 0, 6, 0xffd23f, 1)
        .setOrigin(0, 0.5);
      container.add([bg, label, sub, gauge]);
      container.setSize(w, h);
      container.setInteractive({ useHandCursor: true });
      const idx = i;
      container.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff, 0.7));
      container.on('pointerout', () => bg.setStrokeStyle(3, 0xffffff, 0.2));
      container.on('pointerdown', () => this.handlePlannerSlotClick(idx));
      this.plannerSlotUI.push({ container, bg, label, sub, gauge, gaugeMaxWidth });
    }
    this.refreshPlannerSlots();
  }

  private refreshPlannerSlots(): void {
    if (this.plannerSlotUI.length === 0) return;
    // 라벨 색상은 buildPlannerSlots에서 stroke 포함 흰색으로 고정.
    // setColor를 매 프레임 호출하면 Phaser 텍스처 렌더링에서 가끔
    // null drawImage 예외가 발생해 씬이 먹통됨 → 색상 변경은 하지 않는다.
    if (!this.alive) {
      this.plannerSlotUI.forEach((ui) => {
        ui.bg.setFillStyle(COLOR_DIM);
        ui.label.setText('💀 폭사');
        ui.sub.setText('탭해서 다시 시작');
        ui.gauge.width = 0;
      });
      return;
    }
    const now = Date.now();
    const slots = this.save.plannerSlots;
    for (let i = 0; i < PLANNER_SLOT_COUNT; i++) {
      const ui = this.plannerSlotUI[i];
      if (!ui) continue;
      const slot = slots[i];
      const state = plannerSlotState(slot, now);
      switch (state.kind) {
        case 'empty': {
          const cost = plannerSlotCost(this.level);
          const canAfford = this.save.gold >= cost;
          ui.bg.setFillStyle(canAfford ? 0x4a90e2 : COLOR_DIM);
          ui.label.setText(canAfford ? '📋 새 스펙' : '골드 부족');
          ui.sub.setText(`-${this.fmtGold(cost)} · ${Math.round(plannerSlotDurationMs(this.level) / 1000)}s 소요`);
          ui.gauge.width = 0;
          break;
        }
        case 'running': {
          ui.bg.setFillStyle(0x3a4858);
          ui.label.setText('📋 작성 중...');
          const sec = Math.ceil(state.remainingMs / 1000);
          ui.sub.setText(`${sec}s 남음 · lv ${state.level}`);
          ui.gauge.width = ui.gaugeMaxWidth * state.progress01;
          break;
        }
        case 'ready': {
          ui.bg.setFillStyle(0x4ae290);
          ui.label.setText('✅ 검토 완료');
          ui.sub.setText(`탭해서 강화 시도 · lv ${state.level}`);
          ui.gauge.width = ui.gaugeMaxWidth;
          break;
        }
      }
    }
  }

  private handlePlannerSlotClick(idx: number): void {
    if (this.isEnhancing) return;
    if (!this.alive) {
      this.restartCharacter();
      return;
    }
    const slot = this.save.plannerSlots[idx];
    if (!slot) return;
    const state = plannerSlotState(slot, Date.now());
    switch (state.kind) {
      case 'empty':
        this.tryStartPlannerSlot(idx);
        break;
      case 'running':
        this.flashResultText(`${Math.ceil(state.remainingMs / 1000)}s 후 검토 완료`);
        break;
      case 'ready':
        this.claimPlannerSlot(idx);
        break;
    }
  }

  private tryStartPlannerSlot(idx: number): void {
    if (this.level >= MAX_LEVEL) {
      this.flashResultText('이미 최고 단계입니다.');
      return;
    }
    const gate = checkSynergyGate(this.level, this.otherJobsBestAvg());
    if (!gate.ok) {
      this.flashResultText(
        `🔒 팀 시너지 부족 — 다른 두 직군 평균 ${gate.required.toFixed(0)}단계 필요 (현재 ${gate.have.toFixed(1)})`,
      );
      return;
    }
    const cost = plannerSlotCost(this.level);
    if (this.save.gold < cost) {
      this.flashResultText('골드가 부족합니다.');
      return;
    }
    this.save.gold -= cost;
    const duration = plannerSlotDurationMs(this.level);
    this.save.plannerSlots[idx] = {
      startedAt: Date.now(),
      durationMs: duration,
      level: this.level,
    };
    persistSave(this.save);
    this.refreshTopBar();
    this.refreshPlannerSlots();
    this.scheduleCloudPush();
  }

  private claimPlannerSlot(idx: number): void {
    const slot = this.save.plannerSlots[idx];
    if (!slot) return;
    this.save.plannerSlots[idx] = { startedAt: 0, durationMs: 0, level: 0 };
    if (slot.level !== this.level) {
      this.flashResultText('현재 단계와 슬롯 단계가 달라 슬롯 폐기됨.');
      persistSave(this.save);
      this.refreshPlannerSlots();
      return;
    }
    // 슬롯 시작 시 이미 cost 차감했으므로 0 cost로 강화 진행
    this.startEnhancement(0);
  }

  private handlePrimaryAction(): void {
    // 1) 컷인 떠 있으면 스킵 우선
    if (this.skipReady && this.skipCutIn) {
      this.skipCutIn();
      this.skipReady = false;
    }
    if (this.isEnhancing) return;

    // 2) 폭사 상태면 다시 시작
    if (!this.alive) {
      this.restartCharacter();
      return;
    }

    // 3) 최고 단계
    if (this.level >= MAX_LEVEL) {
      this.flashResultText('이미 최고 단계입니다.');
      return;
    }

    // 3.5) 팀 시너지 게이트 체크 (lv 10+ 부터)
    const gate = checkSynergyGate(this.level, this.otherJobsBestAvg());
    if (!gate.ok) {
      this.flashResultText(
        `🔒 팀 시너지 부족 — 다른 두 직군 평균 ${gate.required.toFixed(0)}단계 필요 (현재 ${gate.have.toFixed(1)})`,
      );
      return;
    }

    // 기획자: Space 키 → 가장 먼저 ready인 슬롯 claim,
    //  ready 없으면 가장 빠르게 비어있는 슬롯에 새 스펙 시작
    if (this.jobKey === 'planner') {
      const now = Date.now();
      const readyIdx = this.save.plannerSlots.findIndex(
        (s) => plannerSlotState(s, now).kind === 'ready',
      );
      if (readyIdx >= 0) {
        this.claimPlannerSlot(readyIdx);
        return;
      }
      const emptyIdx = this.save.plannerSlots.findIndex(
        (s) => plannerSlotState(s, now).kind === 'empty',
      );
      if (emptyIdx >= 0) {
        this.handlePlannerSlotClick(emptyIdx);
        return;
      }
      this.flashResultText('모든 슬롯 작성 중. 잠시 후 다시 시도하세요.');
      return;
    }

    // 4) 비용 체크 (L3 야근 모드 시 ×2)
    let cost = costFor(this.level, this.jobKey);
    if (this.save.yagunMode) cost *= 2;
    if (this.save.gold < cost) {
      this.flashResultText('골드가 부족합니다.');
      return;
    }

    this.startEnhancement(cost);
  }

  private restartCharacter(): void {
    this.alive = true;
    this.level = 0;
    this.buffs = {};
    const def = CHARACTERS[this.jobKey];
    this.characterShape.setFillStyle(def.color);
    this.characterShape.setAlpha(1);
    this.levelText.setAlpha(1);
    this.syncProgress();
    persistSave(this.save);
    this.scheduleCloudPush();
    this.refreshAll();
    this.setupAutoWork();
    this.setupIdleParticles();
    this.resultText.setText('새 캐릭터 출근. 다시 시작합니다.');
  }

  // -------- 강화 흐름 --------

  private startEnhancement(cost: number): void {
    this.isEnhancing = true;
    this.lockButton();
    this.resultText.setText('');

    // 비용 즉시 차감 (재화 소모 도파민)
    this.save.gold -= cost;
    this.refreshTopBar();

    // 사용된 buff 스냅샷 + 인벤 차감
    const usedBuffs: ActiveBuffs = { ...this.buffs };
    for (const k of ITEM_KEYS) {
      if (this.buffs[k] && this.save.inventory[k] > 0) {
        this.save.inventory[k] -= 1;
      } else {
        usedBuffs[k] = false;
      }
    }

    // 장인의 손길 사용 추적: 인플레이션 + 쿨다운
    if (usedBuffs.masterhand) {
      this.save.masterhandLastUseAt = Date.now();
      this.save.masterhandUseCount += 1;
      this.save.masterhandIdleCounter = 0;
    } else {
      this.save.masterhandIdleCounter += 1;
      if (this.save.masterhandIdleCounter >= 5 && this.save.masterhandUseCount > 0) {
        this.save.masterhandUseCount = 0;
        this.save.masterhandIdleCounter = 0;
      }
    }

    this.buffs = {};
    this.refreshSlots();
    this.refreshBuffsText();

    // 리팩토링: 즉시 +1 확정. 단 골드 30% 손실. 다른 강화 흐름은 일반 success 처리되지만
    // gold loss는 추가로 적용한다.
    const refactorUsed = !!usedBuffs.refactor;

    this.playBuildup(() => {
      const mainBonus = this.currentMainBonus() + this.prestigeRateBonus() + this.teamRateBonus();
      const comboBonus = this.currentComboBonus();
      const timingBonus = this.currentTimingBonus;
      this.currentTimingBonus = 0;
      // 무드보드: 디자이너 best의 절반(%p) 추가 (이번 강화에만)
      const moodboardBonus = usedBuffs.moodboard
        ? this.save.bestByJob.designer * 0.005
        : 0;
      // 디자이너: 3 라운드 시안 검토. masterhand/refactor/maxed는 곧바로 처리.
      if (
        this.jobKey === 'designer'
        && !usedBuffs.masterhand
        && !usedBuffs.refactor
        && this.alive
        && this.level < MAX_LEVEL
      ) {
        this.playDesignerRoundsThenApply(
          usedBuffs,
          mainBonus,
          comboBonus + timingBonus + moodboardBonus,
          cost,
        );
        return;
      }
      // 리팩토링 후처리: 강화 결과 적용 후 골드 30% 손실
      if (refactorUsed) {
        this.time.delayedCall(50, () => {
          const lost = Math.floor(this.save.gold * 0.3);
          this.save.gold -= lost;
          this.refreshTopBar();
          this.spawnFloatingGold(lost, '🔄 리팩토링 부채', '#e24a4a');
        });
      }
      const result = tryEnhance(
        this.level,
        usedBuffs,
        undefined,
        mainBonus,
        comboBonus + timingBonus + moodboardBonus,
        this.jobKey,
        this.save.quantumCoreEnabled && this.save.bestByJob[this.jobKey] >= 800,
      );
      // eslint-disable-next-line no-console
      console.log('[enhance]', this.jobKey, { result, cost, usedBuffs, mainBonus, comboBonus, timingBonus, moodboardBonus });
      this.applyResult(result, cost);
    });
  }

  // ============ 디자이너 다라운드 시안 (Phase 1C) ============

  private playDesignerRoundsThenApply(
    usedBuffs: ActiveBuffs,
    mainBonus: number,
    extraBonus: number,
    cost: number,
  ): void {
    const eff = effectiveRate(this.level, usedBuffs, mainBonus, extraBonus);
    const perRound = designerPerRoundRate(eff);
    const cx = GAME_WIDTH / 2;
    const baseY = 760;
    // 라운드별 결과 표시용 텍스트/아이콘
    const roundIndicators: Phaser.GameObjects.Text[] = [];
    const totalW = DESIGNER_ROUND_COUNT * 90;
    const startX = cx - totalW / 2 + 45;
    for (let i = 0; i < DESIGNER_ROUND_COUNT; i++) {
      const t = this.add
        .text(startX + i * 90, baseY, DESIGNER_ROUND_LABELS[i] + '\n…', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#cfd1d4',
          align: 'center',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(70);
      roundIndicators.push(t);
    }

    const rolls: boolean[] = [];
    let allOk = true;
    let stepIdx = 0;
    const stepOnce = () => {
      const ok = Math.random() < perRound;
      rolls.push(ok);
      const ind = roundIndicators[stepIdx];
      if (ok) {
        ind.setText(`${DESIGNER_ROUND_LABELS[stepIdx]}\n✅ OK`);
        ind.setColor('#4ae290');
      } else {
        ind.setText(`${DESIGNER_ROUND_LABELS[stepIdx]}\n❌ 반려`);
        ind.setColor('#e24a4a');
        allOk = false;
      }
      stepIdx += 1;
      if (stepIdx < DESIGNER_ROUND_COUNT) {
        this.time.delayedCall(DESIGNER_ROUND_INTERVAL_MS, stepOnce);
        return;
      }
      // 모든 라운드 종료 → 결과 산출
      this.time.delayedCall(420, () => {
        roundIndicators.forEach((t) => t.destroy());
        const result = this.computeDesignerResult(usedBuffs, allOk);
        // eslint-disable-next-line no-console
        console.log('[enhance:designer]', { rolls, allOk, perRound: perRound.toFixed(3), eff: eff.toFixed(3), result });
        this.applyResult(result, cost);
      });
    };
    this.time.delayedCall(120, stepOnce);
  }

  /**
   * 디자이너 라운드 누적 결과 → EnhanceResult.
   * - allOk=true → success (축복권 우선순위 그대로)
   * - allOk=false → fail (현재 직군 페널티 적용, protect/revive 처리)
   */
  private computeDesignerResult(
    usedBuffs: ActiveBuffs,
    allOk: boolean,
  ): EnhanceResult {
    if (this.level >= MAX_LEVEL) return { kind: 'maxed', level: this.level };
    if (allOk) {
      const protectedBy: ItemKey | undefined = usedBuffs.super_blessing
        ? 'super_blessing'
        : usedBuffs.blessing
          ? 'blessing'
          : undefined;
      return {
        kind: 'success',
        from: this.level,
        to: this.level + 1,
        ...(protectedBy ? { protectedBy } : {}),
      };
    }
    let fail = failPenaltyFor(this.level, this.jobKey);
    // 마감 압박 페널티 업그레이드 (EnhanceSystem.rollOnce와 동일 로직)
    if (usedBuffs.deadline && fail.kind === 'down') {
      fail = { kind: 'down', amount: fail.amount + 1 };
    } else if (usedBuffs.deadline && fail.kind === 'stay') {
      fail = { kind: 'down', amount: 1 };
    }
    switch (fail.kind) {
      case 'stay':
        return { kind: 'fail-stay', level: this.level };
      case 'down': {
        if (usedBuffs.protect) {
          return { kind: 'fail-stay', level: this.level, protectedBy: 'protect' };
        }
        const next = Math.max(0, this.level - fail.amount);
        return { kind: 'fail-down', from: this.level, to: next };
      }
      case 'destroy':
        if (usedBuffs.protect) {
          return { kind: 'fail-stay', level: this.level, protectedBy: 'protect' };
        }
        if (usedBuffs.revive) {
          return { kind: 'fail-stay', level: this.level, protectedBy: 'revive' };
        }
        return { kind: 'destroy', from: this.level };
    }
  }

  private playBuildup(onComplete: () => void): void {
    const def = CHARACTERS[this.jobKey];
    const cx = this.charBaseX;
    const cy = this.charBaseY;

    // 타이밍 게이지 띄우기 (빌드업 동안 탭하면 보너스)
    this.currentTimingBonus = 0;
    this.spawnTimingGauge(BUILDUP_MS);

    const vignette = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(50);
    this.tweens.add({
      targets: vignette,
      alpha: 0.4,
      duration: BUILDUP_MS,
      ease: 'Quart.easeIn',
    });

    this.tweens.addCounter({
      from: 0,
      to: 22,
      duration: BUILDUP_MS,
      ease: 'Quart.easeIn',
      onUpdate: (tween) => {
        this.shakeAmplitude = tween.getValue() ?? 0;
      },
    });

    const startColor = Phaser.Display.Color.IntegerToColor(def.color);
    const endColor = Phaser.Display.Color.IntegerToColor(0xffffff);
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BUILDUP_MS,
      ease: 'Quart.easeIn',
      onUpdate: (tween) => {
        const v = tween.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(
          startColor,
          endColor,
          100,
          v,
        );
        this.characterShape.setFillStyle(
          Phaser.Display.Color.GetColor(c.r, c.g, c.b),
        );
      },
    });

    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const baseAngle = (i / particleCount) * Math.PI * 2;
      const startR = 300;
      const dot = this.add
        .circle(
          cx + Math.cos(baseAngle) * startR,
          cy + Math.sin(baseAngle) * startR,
          12,
          0xffd23f,
        )
        .setDepth(60)
        .setAlpha(0);

      this.tweens.add({ targets: dot, alpha: 1, duration: 120 });

      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: BUILDUP_MS,
        ease: 'Quart.easeIn',
        onUpdate: (tween) => {
          const t = tween.getValue() ?? 0;
          const angle = baseAngle + t * Math.PI * 2;
          const r = startR * (1 - t);
          dot.x = cx + Math.cos(angle) * r;
          dot.y = cy + Math.sin(angle) * r;
        },
        onComplete: () => dot.destroy(),
      });
    }

    this.time.delayedCall(BUILDUP_MS, () => {
      this.shakeAmplitude = 0;
      this.characterShape.x = this.charBaseX;
      this.characterShape.y = this.charBaseY;
      // 타이밍 게이지 자동 정지 (사용자가 안 눌렀으면 보너스 0)
      if (this.timingGaugeStop) this.timingGaugeStop();
      this.clearTimingGauge();
      this.cameras.main.flash(120, 255, 255, 255);
      this.tweens.add({
        targets: vignette,
        alpha: 0,
        duration: 160,
        onComplete: () => vignette.destroy(),
      });
      this.characterShape.setFillStyle(def.color);
      this.time.delayedCall(PAUSE_MS, onComplete);
    });
  }

  private applyResult(result: EnhanceResult, cost: number): void {
    if (result.kind === 'maxed') {
      this.resultText.setText(`최고 단계입니다 (${result.level})`);
      this.finishEnhanceTurn();
      return;
    }

    // 통계 누적
    this.save.stats.totalAttempts += 1;
    if (result.kind === 'success') this.save.stats.totalSuccess += 1;
    else if (result.kind === 'destroy') this.save.stats.totalDestroyed += 1;
    else this.save.stats.totalFail += 1;

    const bucket = bucketOf(result);
    let reward = rewardFor(bucket, cost);
    // L0: 크리티컬/긴급 보상 멀티
    if (result.kind === 'success' && result.modifier === 'mega') reward = Math.round(reward * 5);
    else if (result.kind === 'success' && result.modifier === 'critical') reward = Math.round(reward * 3);
    else if (result.kind === 'success' && result.modifier === 'emergency') reward = Math.round(reward * 0.3);
    // L3: 야근 모드 — 성공 시 보상 ×3
    if (result.kind === 'success' && this.save.yagunMode) reward = Math.round(reward * 3);
    // L2: 사옥 등급 멀티 (모든 매출에 영구 적용)
    reward = Math.round(reward * officeMultiplier(this.save.officeTier));
    this.save.gold += reward;

    // 보호로 막힌 케이스 안내 메시지 우선
    let message = pickMessage(this.jobKey, bucket);
    let label = '실패';
    let labelColor = 0xe2c84a;

    let extraNote = '';

    switch (result.kind) {
      case 'success': {
        const prevBest = this.save.bestByJob[this.jobKey];
        this.level = result.to;
        if (this.level > this.save.stats.highestLevel) {
          this.save.stats.highestLevel = this.level;
        }
        // 마일스톤 hit (best 갱신 시 한 번만)
        if (this.level > prevBest) {
          const newMilestones = milestonesReached(prevBest, this.level);
          newMilestones.forEach((m) => this.applyMilestone(m));
          // L1: 매 10/25/50단계 미니 보상 (50은 위 milestonesReached와 별개)
          this.applyDenseLevelRewards(prevBest, this.level);
        }
        // L0: 분기 KPI 스트릭 +1 / 10 도달 시 보상
        this.save.quarterlyKpiStreak += 1;
        if (this.save.quarterlyKpiStreak >= 10) {
          this.save.quarterlyKpiStreak = 0;
          this.save.quarterlyKpiTotal += 1;
          this.applyKpiReward();
          // L5 미션 진행도
          if (this.save.activeMissionId === 'kpi-3') {
            this.save.activeMissionProgress += 1;
          }
        }
        // L5 미션: enhance-50 / level-up-10 / critical-5
        this.tickMissionOnSuccess(result);
        this.save.combo += 1;
        this.save.comboLastAt = Date.now();
        this.refreshDisplay();
        this.playSuccessFx();
        if (result.modifier === 'mega') {
          label = '💥 메가 크리티컬';
        } else if (result.modifier === 'critical') {
          label = '🌟 크리티컬';
        } else if (result.modifier === 'emergency') {
          label = '📞 긴급 호출';
        } else if (result.protectedBy === 'masterhand') {
          label = '💎 장인의 손길';
        } else if (result.protectedBy === 'super_blessing') {
          label = '🎯 슈퍼 성공';
        } else if (result.protectedBy === 'blessing') {
          label = '⭐ 축복 성공';
        } else {
          label = '★ 성공 ★';
        }
        labelColor = 0x4ae290;
        break;
      }
      case 'fail-stay':
        if (result.protectedBy === 'protect') {
          message = '🛡️ 보호권이 발동했습니다. 단계는 유지됩니다.';
          label = '🛡️ 방어';
          labelColor = 0x4a90e2;
          this.playProtectFx();
        } else if (result.protectedBy === 'revive') {
          message = '⛑️ 부활권이 발동했습니다. 소멸을 면했습니다!';
          label = '⛑️ 부활';
          labelColor = 0x4ae290;
          this.playProtectFx();
          this.save.combo = 0;
        } else {
          this.playFailStayFx();
          label = '실패';
          labelColor = 0xe2c84a;
          this.save.combo = 0;
          this.save.quarterlyKpiStreak = 0;
        }
        break;
      case 'fail-down': {
        // L3: 야근 모드 시 추가로 -2 단계 (총 -3 또는 더)
        let next = result.to;
        if (this.save.yagunMode) {
          next = Math.max(0, next - 2);
        }
        this.level = next;
        this.save.combo = 0;
        this.save.quarterlyKpiStreak = 0;
        this.refreshDisplay();
        this.playFailDownFx();
        label = this.save.yagunMode ? '🚀 야근 폭망' : '단계 하락';
        labelColor = 0xe2904a;
        break;
      }
      case 'destroy': {
        this.alive = false;
        this.save.combo = 0;
        this.save.quarterlyKpiStreak = 0;
        // 폭사 시 보유 골드 30% 손실 (보너스 +reward와 별개)
        const lost = Math.floor(this.save.gold * 0.3);
        this.save.gold -= lost;
        if (lost > 0) extraNote = `\n💔 -${this.fmtGold(lost)} 손실`;
        this.playDestroyFx();
        label = '💥 소멸 💥';
        labelColor = 0xe24a4a;
        break;
      }
    }

    this.syncProgress();
    this.showCutIn(label, labelColor, `+${this.fmtGold(reward)}${extraNote}`);
    this.resultText.setText(message);
    this.refreshTopBar();
    this.refreshIncomeButtons();
    this.refreshComboText();
    this.refreshSalaryText();
    this.setupAutoWork();
    this.setupIdleParticles();
    persistSave(this.save);
    this.scheduleCloudPush();
    this.maybeTriggerHeadhunter();
    this.finishEnhanceTurn();
  }

  private maybeTriggerHeadhunter(): void {
    if (!this.alive) return;
    const def = INCOMES.headhunter;
    if (this.level < def.unlockLevel) return;
    if (Math.random() >= def.param) return;
    const reward = def.reward(this.level);
    this.save.gold += reward;
    persistSave(this.save);
    this.refreshTopBar();
    this.spawnFloatingGold(reward, `${def.emoji} ${def.label}!`, '#ffd23f');
  }

  /**
   * L1: 매 10/25/50단계 미니 보상 (best 갱신 시).
   *  매 10: 골드 +현재 비용×2
   *  매 25: 명성 +1
   *  매 50: 명성 +3 + 작은 컷인 (대형 마일스톤은 별도)
   */
  private applyDenseLevelRewards(prevBest: number, newBest: number): void {
    for (let lv = prevBest + 1; lv <= newBest; lv++) {
      if (lv % 10 === 0) {
        const bonus = costFor(lv, this.jobKey) * 2;
        this.save.gold += bonus;
        this.spawnFloatingGold(bonus, `🎯 ${lv}단계 보너스`, '#9af0a8');
      }
      if (lv % 25 === 0 && lv % 50 !== 0) {
        this.save.prestige += 1;
      }
      if (lv % 50 === 0) {
        // 큰 마일스톤은 별도 (lv 50/100/200/500/999만)
        if (![50, 100, 200, 500, 999].includes(lv)) {
          this.save.prestige += 3;
          this.flashTickerText(`🌟 ${lv}단계 달성 — 명성 +3`);
        }
      }
    }
  }

  /** L0: 분기 KPI 10연속 달성 시 보상 + 컷인. */
  private applyKpiReward(): void {
    const goldBonus = costFor(this.level, this.jobKey) * 3;
    this.save.gold += goldBonus;
    this.save.prestige += 1;
    this.flashTickerText(`🏆 분기 KPI 달성! +₩${this.fmtGold(goldBonus)} · 명성 +1`);
  }

  /** L5: 강화 성공 이벤트 → 진행 중인 미션의 진행도 갱신. */
  private tickMissionOnSuccess(result: EnhanceResult): void {
    if (this.save.activeMissionId === 'enhance-50') {
      this.save.activeMissionProgress += 1;
    } else if (this.save.activeMissionId === 'level-up-10' && result.kind === 'success') {
      this.save.activeMissionProgress += result.to - result.from;
    } else if (this.save.activeMissionId === 'critical-5' && result.kind === 'success'
      && (result.modifier === 'critical' || result.modifier === 'mega')) {
      this.save.activeMissionProgress += 1;
    }
  }

  /** 작은 ticker 메시지 (화면 상단에서 fade). 마일스톤보다 가벼움. */
  private flashTickerText(text: string): void {
    const t = this.add
      .text(GAME_WIDTH / 2, 350, text, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffd23f',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(180)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: 320,
      duration: 200,
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: t,
            alpha: 0,
            duration: 300,
            onComplete: () => t.destroy(),
          });
        });
      },
    });
  }

  /**
   * 마일스톤 hit 처리 — 일시불 골드/명성 보상 + 화려한 컷인.
   * 한 번에 여러 마일스톤이 동시에 터질 수 있다 (예: 50→999 점프).
   */
  private applyMilestone(m: MilestoneDef): void {
    this.save.gold += m.goldBonus;
    this.save.prestige += m.prestigeBonus;
    // 화면 중앙 큰 텍스트 + fade
    const cx = GAME_WIDTH / 2;
    const cy = 380;
    const big = this.add
      .text(cx, cy, m.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '40px',
        color: '#ffd23f',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(220)
      .setAlpha(0);
    const sub = this.add
      .text(cx, cy + 56, `${m.message}\n💰 +${this.fmtGold(m.goldBonus)} · ⭐ +${m.prestigeBonus}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(220)
      .setAlpha(0);
    this.cameras.main.flash(220, 255, 220, 100);
    this.tweens.add({
      targets: [big, sub],
      alpha: 1,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.time.delayedCall(2200, () => {
          this.tweens.add({
            targets: [big, sub],
            alpha: 0,
            duration: 400,
            onComplete: () => {
              big.destroy();
              sub.destroy();
            },
          });
        });
      },
    });
  }

  private finishEnhanceTurn(): void {
    this.time.delayedCall(Math.max(CUTIN_HOLD_MS - 150, 200), () => {
      this.isEnhancing = false;
      this.skipReady = true;
      if (!this.alive) {
        this.enhanceBtnBg.setFillStyle(0xe24a4a);
        this.enhanceBtnLabel.setText('💀 다시 시작');
        this.enhanceBtnLabel.setColor('#ffffff');
        this.enhanceBtnSub.setText('새 캐릭터로 처음부터');
        this.enhanceBtnSub.setColor('#ffffff');
        this.enhanceBtn.setInteractive({ useHandCursor: true });
      } else if (this.level >= MAX_LEVEL) {
        this.enhanceBtnBg.setFillStyle(COLOR_DIM);
        this.enhanceBtnLabel.setText('최고 단계 달성');
        this.enhanceBtnLabel.setColor('#9aa0a6');
        this.enhanceBtnSub.setText('');
        this.enhanceBtn.disableInteractive();
      } else {
        this.unlockButton();
      }
      this.refreshRateText();
    });
  }

  // -------- 결과 이펙트 --------

  private playSuccessFx(): void {
    const cx = this.charBaseX;
    const cy = this.charBaseY;

    const ring = this.add
      .circle(cx, cy, 140, 0x4ae290, 0)
      .setStrokeStyle(8, 0x4ae290, 1)
      .setDepth(40);
    this.tweens.add({
      targets: ring,
      scale: 3.5,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    this.tweens.add({
      targets: this.characterShape,
      scale: { from: 1.3, to: 1.0 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 200 + Math.random() * 120;
      const dot = this.add.circle(cx, cy, 8, 0x4ae290).setDepth(45);
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 600 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private playProtectFx(): void {
    const cx = this.charBaseX;
    const cy = this.charBaseY;
    const shield = this.add
      .circle(cx, cy, 160, 0x4a90e2, 0)
      .setStrokeStyle(10, 0x4a90e2, 1)
      .setDepth(40);
    this.tweens.add({
      targets: shield,
      scale: { from: 0.6, to: 1.4 },
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => shield.destroy(),
    });
  }

  private playFailStayFx(): void {
    this.cameras.main.shake(180, 0.005);
    this.tweens.add({
      targets: this.characterShape,
      angle: { from: -4, to: 4 },
      yoyo: true,
      repeat: 2,
      duration: 80,
      onComplete: () => this.characterShape.setAngle(0),
    });
  }

  private playFailDownFx(): void {
    this.cameras.main.shake(220, 0.008);
    this.cameras.main.flash(150, 220, 100, 80);
    this.tweens.add({
      targets: this.characterShape,
      y: { from: this.charBaseY - 30, to: this.charBaseY },
      duration: 350,
      ease: 'Bounce.easeOut',
    });
  }

  private playDestroyFx(): void {
    const cx = this.charBaseX;
    const cy = this.charBaseY;

    this.cameras.main.shake(450, 0.02);
    this.cameras.main.flash(250, 220, 60, 60);

    this.tweens.add({
      targets: this.characterShape,
      alpha: 0.25,
      duration: 600,
      onComplete: () => this.characterShape.setFillStyle(0x3a3a44),
    });
    this.tweens.add({ targets: this.levelText, alpha: 0.3, duration: 600 });

    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 250 + Math.random() * 200;
      const size = 12 + Math.random() * 10;
      const piece = this.add.rectangle(cx, cy, size, size, 0xe24a4a).setDepth(45);
      this.tweens.add({
        targets: piece,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist + 200,
        angle: Math.random() * 720 - 360,
        alpha: 0,
        duration: 900 + Math.random() * 300,
        ease: 'Cubic.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
  }

  private showCutIn(label: string, colorHex: number, message: string): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const colorStr = '#' + colorHex.toString(16).padStart(6, '0');

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(100);

    const labelText = this.add
      .text(cx, cy - 60, label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '100px',
        color: colorStr,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setAlpha(0)
      .setScale(0.4);

    const msgText = this.add
      .text(cx, cy + 100, message, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 100 },
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setAlpha(0);

    this.tweens.add({ targets: overlay, alpha: 0.3, duration: 120 });
    this.tweens.add({
      targets: labelText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: msgText,
      alpha: 1,
      duration: 220,
      delay: 120,
    });

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      this.skipCutIn = undefined;
      this.tweens.add({
        targets: [overlay, labelText, msgText],
        alpha: 0,
        duration: CUTIN_OUT_MS,
        onComplete: () => {
          overlay.destroy();
          labelText.destroy();
          msgText.destroy();
        },
      });
    };
    this.skipCutIn = dismiss;
    this.time.delayedCall(CUTIN_HOLD_MS, dismiss);
  }

  // -------- 상점 모달 --------

  private openShop(): void {
    if (this.isEnhancing) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setOrigin(0)
      .setDepth(200)
      .setInteractive();
    objs.push(overlay);

    const panelW = 660;
    const panelH = 1180;  // 10 items × ~96px = ~960px + header/footer
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x1a1a22)
      .setStrokeStyle(3, 0xffffff, 0.2)
      .setDepth(201);
    objs.push(panel);

    const title = this.add
      .text(cx, cy - panelH / 2 + 36, '🏪 상점', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(title);

    const goldLabel = this.add
      .text(cx, cy - panelH / 2 + 78, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '22px',
        color: '#ffd23f',
      })
      .setOrigin(0.5)
      .setDepth(202);
    const refreshGoldLabel = () => goldLabel.setText(`보유 ${this.fmtGold(this.save.gold)}`);
    refreshGoldLabel();
    objs.push(goldLabel);

    const cardH = 96;
    const cardGap = 6;
    const firstCardY = cy - panelH / 2 + 120 + cardH / 2;
    ITEM_KEYS.forEach((key, i) => {
      const def = ITEMS[key];
      const yy = firstCardY + i * (cardH + cardGap);
      const cardW = panelW - 40;
      // 마스터핸드는 인플레이션 가격
      const dynamicPrice = () => key === 'masterhand' ? this.masterhandPrice() : def.price;
      const card = this.add
        .rectangle(cx, yy, cardW, cardH, 0x2a2a32)
        .setStrokeStyle(2, def.color, 0.6)
        .setDepth(202);
      objs.push(card);

      const iconKey = `icon-item-${key}`;
      const iconY = yy - cardH / 2 + 22;
      const headIcon = this.textures.exists(iconKey)
        ? this.add
            .image(cx - cardW / 2 + 36, iconY, iconKey)
            .setDisplaySize(28, 28)
            .setDepth(203)
        : this.add
            .text(cx - cardW / 2 + 36, iconY, def.emoji, {
              fontFamily: 'sans-serif',
              fontSize: '22px',
            })
            .setOrigin(0.5)
            .setDepth(203);
      const head = this.add
        .text(cx - cardW / 2 + 64, yy - cardH / 2 + 8, def.label, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0)
        .setDepth(203);
      objs.push(headIcon, head);

      const buyBtnW = 130;
      const buyBtnH = 48;
      const buyX = cx + cardW / 2 - 16 - buyBtnW / 2;
      const buyY = yy;

      const desc = this.add
        .text(cx - cardW / 2 + 20, yy - cardH / 2 + 38, def.desc, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#cfd1d4',
          wordWrap: { width: cardW - 40 - buyBtnW - 12 },
        })
        .setOrigin(0, 0)
        .setDepth(203);
      objs.push(desc);

      const ownLabel = this.add
        .text(cx - cardW / 2 + 20, yy + cardH / 2 - 14, '', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
          color: '#9aa0a6',
        })
        .setOrigin(0, 0.5)
        .setDepth(203);
      const refreshOwnLabel = () =>
        ownLabel.setText(`보유 ${this.save.inventory[key]}개`);
      refreshOwnLabel();
      objs.push(ownLabel);

      const buyBg = this.add
        .rectangle(buyX, buyY, buyBtnW, buyBtnH, def.color)
        .setStrokeStyle(2, 0xffffff, 0.3)
        .setDepth(203);
      const buyText = this.add
        .text(buyX, buyY, this.fmtGold(dynamicPrice()), {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#0e0e12',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(204);
      objs.push(buyBg, buyText);

      const refreshBuy = () => {
        const price = dynamicPrice();
        buyText.setText(this.fmtGold(price));
        if (this.save.gold < price) {
          buyBg.setFillStyle(COLOR_DIM);
          buyText.setColor('#9aa0a6');
        } else {
          buyBg.setFillStyle(def.color);
          buyText.setColor('#0e0e12');
        }
      };
      refreshBuy();

      buyBg.setInteractive({ useHandCursor: true });
      buyBg.on('pointerdown', () => {
        const price = dynamicPrice();
        if (this.save.gold < price) return;
        this.save.gold -= price;
        this.save.inventory[key] += 1;
        persistSave(this.save);
        refreshGoldLabel();
        refreshOwnLabel();
        refreshBuy();
        this.refreshTopBar();
        this.refreshSlots();
      });
    });

    // 닫기 버튼
    const closeBtnW = 200;
    const closeBtnH = 56;
    const closeX = cx;
    const closeY = cy + panelH / 2 - 44;
    const closeBg = this.add
      .rectangle(closeX, closeY, closeBtnW, closeBtnH, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(203);
    const closeText = this.add
      .text(closeX, closeY, '닫기', {
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
    };
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', close);
    overlay.on('pointerdown', close);
  }

  // -------- 상태 표시 갱신 --------

  private refreshAll(): void {
    this.refreshDisplay();
    this.refreshSalaryText();
    this.refreshTopBar();
    this.refreshSlots();
    this.refreshBuffsText();
    this.refreshRateText();
    this.refreshPrimaryButton();
    this.refreshIncomeButtons();
    this.refreshComboText();
    this.refreshEquipSlots();
    this.refreshTeamSynergy();
    this.refreshPlannerSlots();
    this.refreshKpiBar();
  }

  private refreshTeamSynergy(): void {
    const rateB = this.teamRateBonus();
    const regenM = this.teamRegenMul();
    const clickM = this.teamClickMul();
    if (rateB === 0 && regenM === 1 && clickM === 1) {
      this.teamSynergyText.setText('');
      this.teamSynergyPanel?.setVisible(false);
      return;
    }
    const parts: string[] = ['🏆 팀'];
    if (rateB > 0) parts.push(`+${(rateB * 100).toFixed(1)}%p`);
    if (regenM > 1) parts.push(`회복 ×${regenM.toFixed(2)}`);
    if (clickM > 1) parts.push(`클릭 ×${clickM.toFixed(2)}`);
    this.teamSynergyText.setText(parts.join('\n'));
    this.teamSynergyPanel?.setVisible(true);
  }

  private refreshDisplay(): void {
    this.titleText.setText(titleFor(this.jobKey, this.level));
    this.levelText.setText(String(this.level));
    this.refreshSalaryText();
  }

  private refreshTopBar(): void {
    const prestigeStr = this.save.prestige > 0 ? `  · ⭐ ${this.save.prestige}` : '';
    this.goldText.setText(`💰 ${this.fmtGold(this.save.gold)}${prestigeStr}`);
    const baseAmount = regenAmount(this.alive ? this.level : 0);
    const amount = Math.ceil(baseAmount * this.currentSubMul() * this.prestigeRegenMul() * this.teamRegenMul() * this.officeMul());
    this.regenText.setText(`+${this.fmtGold(amount)} / ${REGEN_INTERVAL_MS / 1000}s · 탭하면 통화 전환`);
  }

  private refreshSalaryText(): void {
    if (!this.alive) {
      this.salaryText.setText('실직 중 — 다시 시작 가능');
      return;
    }
    const krw = salaryAt(this.level);
    this.salaryText.setText(`연봉 ${formatSalary(krw, this.save.currency)}`);
  }

  private fmtGold(gold: number): string {
    return formatGold(gold, this.save.currency);
  }

  private toggleCurrency(): void {
    this.save.currency = nextCurrency(this.save.currency);
    persistSave(this.save);
    this.refreshAll();
  }

  private refreshSlots(): void {
    for (const k of ITEM_KEYS) this.refreshSlotStyle(k);
  }

  private refreshSlotStyle(key: ItemKey): void {
    const slot = this.slotByKey[key];
    if (!slot) return;
    const count = this.save.inventory[key];
    slot.countText.setText(`×${count}`);
    if (count <= 0) {
      // 빈 슬롯 — 흐리게 (alpha 0.35)
      slot.bg.setFillStyle(COLORS.bgPanelDeep);
      slot.bg.setStrokeStyle(1, COLORS.border, 0.5);
      slot.icon.setAlpha(0.3);
      slot.countText.setAlpha(0.5);
    } else if (this.buffs[key]) {
      // 활성 (토글된) — 액센트 컬러
      slot.bg.setFillStyle(ITEMS[key].color);
      slot.bg.setStrokeStyle(3, 0xffffff, 0.95);
      slot.icon.setAlpha(1);
      slot.countText.setAlpha(1);
    } else {
      // 보유 (비활성) — 액센트 테두리
      slot.bg.setFillStyle(COLORS.bgPanelLight);
      slot.bg.setStrokeStyle(2, ITEMS[key].color, 0.85);
      slot.icon.setAlpha(1);
      slot.countText.setAlpha(1);
    }
  }

  private refreshBuffsText(): void {
    const active = ITEM_KEYS.filter((k) => this.buffs[k]);
    if (active.length === 0) {
      this.buffsText.setText('');
    } else {
      this.buffsText.setText(
        '활성: ' + active.map((k) => `${ITEMS[k].emoji} ${ITEMS[k].label}`).join('  '),
      );
    }
  }

  private refreshRateText(): void {
    if (!this.alive) {
      this.rateText.setText('소멸 — 다시 시작 가능');
      return;
    }
    if (this.level >= MAX_LEVEL) {
      this.rateText.setText('최고 단계 도달');
      return;
    }
    const mainBonus = this.currentMainBonus() + this.prestigeRateBonus() + this.teamRateBonus();
    const comboBonus = this.currentComboBonus();
    const totalBonus = mainBonus + comboBonus;
    const eff = effectiveRate(this.level, this.buffs, totalBonus, 0);
    const base = rateAt(this.level).successRate;
    const pct = formatPct(eff);
    if (eff !== base) {
      this.rateText.setText(`성공률 ${pct}  (기본 ${formatPct(base)})`);
    } else {
      this.rateText.setText(`다음 단계 성공률 ${pct}`);
    }
  }

  private refreshPrimaryButton(): void {
    if (!this.alive) {
      this.enhanceBtnBg.setFillStyle(0xe24a4a);
      this.enhanceBtnLabel.setText('💀 다시 시작');
      this.enhanceBtnLabel.setColor('#ffffff');
      this.enhanceBtnSub.setText('새 캐릭터로 처음부터');
      this.enhanceBtnSub.setColor('#ffffff');
      this.enhanceBtn.setInteractive({ useHandCursor: true });
      return;
    }
    if (this.level >= MAX_LEVEL) {
      this.enhanceBtnBg.setFillStyle(COLOR_DIM);
      this.enhanceBtnLabel.setText('최고 단계 달성');
      this.enhanceBtnLabel.setColor('#9aa0a6');
      this.enhanceBtnSub.setText('');
      this.enhanceBtn.disableInteractive();
      return;
    }
    this.unlockButton();
  }

  private lockButton(): void {
    this.enhanceBtn.disableInteractive();
    this.enhanceBtnBg.setFillStyle(COLOR_DIM);
    this.enhanceBtnLabel.setText('강화 중...');
    this.enhanceBtnLabel.setColor('#9aa0a6');
    this.enhanceBtnSub.setText('');
  }

  private unlockButton(): void {
    const cost = costFor(this.level, this.jobKey);
    const canAfford = this.save.gold >= cost;
    if (canAfford) {
      this.enhanceBtnBg.setFillStyle(COLOR_GOLD);
      this.enhanceBtnLabel.setColor('#0e0e12');
      this.enhanceBtnSub.setColor('#0e0e12');
      this.enhanceBtnLabel.setText('강화하기');
    } else {
      this.enhanceBtnBg.setFillStyle(COLOR_DIM);
      this.enhanceBtnLabel.setColor('#9aa0a6');
      this.enhanceBtnSub.setColor('#9aa0a6');
      this.enhanceBtnLabel.setText('골드 부족');
    }
    this.enhanceBtnSub.setText(`-${this.fmtGold(cost)}`);
    this.enhanceBtn.setInteractive({ useHandCursor: true });
  }

  private flashResultText(text: string): void {
    this.resultText.setText(text);
    this.resultText.setAlpha(1);
    this.tweens.add({
      targets: this.resultText,
      alpha: 0.6,
      yoyo: true,
      duration: 200,
    });
  }

  // -------- 공용 버튼 --------

  private makeButton(
    x: number,
    y: number,
    label: string,
    bgColor: number,
    onClick: () => void,
    opts?: { width?: number; height?: number; fontSize?: number; textColor?: string },
  ): Phaser.GameObjects.Container {
    const w = opts?.width ?? 480;
    const h = opts?.height ?? 110;
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, bgColor, 1)
      .setStrokeStyle(3, 0xffffff, 0.2);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: `${opts?.fontSize ?? 36}px`,
        color: opts?.textColor ?? '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add([bg, text]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    let hoverTween: Phaser.Tweens.Tween | undefined;
    container.on('pointerover', () => {
      bg.setStrokeStyle(3, 0xffffff, 0.85);
      hoverTween?.stop();
      hoverTween = this.tweens.add({
        targets: container,
        scale: 1.04,
        duration: 120,
        ease: 'Cubic.easeOut',
      });
    });
    container.on('pointerout', () => {
      bg.setStrokeStyle(3, 0xffffff, 0.2);
      hoverTween?.stop();
      hoverTween = this.tweens.add({
        targets: container,
        scale: 1,
        duration: 120,
        ease: 'Cubic.easeOut',
      });
    });
    container.on('pointerdown', () => {
      // 짧은 클릭 펀치
      this.tweens.add({
        targets: container,
        scale: { from: 0.96, to: 1.04 },
        duration: 100,
        ease: 'Cubic.easeOut',
      });
      onClick();
    });
    return container;
  }

  // ============ 장비 시스템 ============

  private equipLevel(slot: EquipSlot): number {
    return this.save.equipment[this.jobKey][slot];
  }

  private currentMainBonus(): number {
    return mainBonusPct(this.equipLevel('main'));
  }

  private currentSubMul(): number {
    return subMultiplier(this.equipLevel('sub'));
  }

  private currentAccMul(): number {
    return accessoryMultiplier(this.equipLevel('accessory'));
  }

  private buildEquipSlots(x: number, ys: readonly number[]): void {
    SLOT_KEYS.forEach((slot, i) => {
      this.buildEquipSlot(x, ys[i], slot);
    });
  }

  private buildEquipSlot(x: number, y: number, slot: EquipSlot): void {
    const meta = SLOTS[slot];
    const w = 64;
    const h = 64;
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, 0x2a2a32)
      .setStrokeStyle(2, 0xffd23f, 0.5);
    const icon = this.add
      .image(0, -10, `icon-equip-${slot}`)
      .setDisplaySize(38, 38);
    const levelText = this.add
      .text(0, 18, '0', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add([bg, icon, levelText]);
    void meta;
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => bg.setStrokeStyle(2, 0xffd23f, 1));
    container.on('pointerout', () => bg.setStrokeStyle(2, 0xffd23f, 0.5));
    container.on('pointerdown', () => this.openEquipModal(slot));
    this.equipSlotUI[slot] = { container, bg, levelText };
  }

  private refreshEquipSlots(): void {
    SLOT_KEYS.forEach((slot) => {
      const ui = this.equipSlotUI[slot];
      if (!ui) return;
      const lv = this.equipLevel(slot);
      ui.levelText.setText(String(lv));
      if (lv >= EQUIP_MAX_LEVEL) {
        ui.bg.setStrokeStyle(2, 0x4ae290, 1);
      } else {
        ui.bg.setStrokeStyle(2, 0xffd23f, 0.5);
      }
    });
  }

  private openEquipModal(slot: EquipSlot): void {
    if (this.isEnhancing) return;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setOrigin(0)
      .setDepth(200)
      .setInteractive();
    objs.push(overlay);

    const panelW = 600;
    const panelH = 700;
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.5)
      .setDepth(201);
    objs.push(panel);

    const meta = SLOTS[slot];
    const titleIcon = this.add
      .image(cx - 80, cy - panelH / 2 + 36, `icon-equip-${slot}`)
      .setDisplaySize(36, 36)
      .setDepth(202);
    objs.push(titleIcon);
    const title = this.add
      .text(cx, cy - panelH / 2 + 36, meta.label, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(title);

    const effectLine = this.add
      .text(cx, cy - panelH / 2 + 78, meta.effectDesc, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#cfd1d4',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(effectLine);

    const itemNameText = this.add
      .text(cx, cy - 100, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: panelW - 60 },
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(itemNameText);

    const levelDisplay = this.add
      .text(cx, cy - 40, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '64px',
        color: '#ffd23f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(levelDisplay);

    const rateLine = this.add
      .text(cx, cy + 30, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#cfd1d4',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(rateLine);

    const goldLine = this.add
      .text(cx, cy + 65, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#ffd23f',
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(goldLine);

    // 강화 버튼
    const btnW = 360;
    const btnH = 80;
    const btnY = cy + 150;
    const btnBg = this.add
      .rectangle(cx, btnY, btnW, btnH, 0xffd23f)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(202);
    const btnLabel = this.add
      .text(cx, btnY - 12, '강화하기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '24px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(203);
    const btnSub = this.add
      .text(cx, btnY + 16, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '16px',
        color: '#0e0e12',
      })
      .setOrigin(0.5)
      .setDepth(203);
    objs.push(btnBg, btnLabel, btnSub);

    const resultLine = this.add
      .text(cx, btnY + 80, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '18px',
        color: '#9aa0a6',
        align: 'center',
        wordWrap: { width: panelW - 60 },
      })
      .setOrigin(0.5)
      .setDepth(202);
    objs.push(resultLine);

    const refresh = () => {
      const lv = this.equipLevel(slot);
      itemNameText.setText(equipTitleFor(this.jobKey, slot, lv));
      levelDisplay.setText(`Lv ${lv}`);
      if (lv >= EQUIP_MAX_LEVEL) {
        rateLine.setText('최고 단계 달성');
        goldLine.setText('');
        btnBg.setFillStyle(COLOR_DIM);
        btnLabel.setText('최고 단계');
        btnLabel.setColor('#9aa0a6');
        btnSub.setText('');
        btnBg.disableInteractive();
        return;
      }
      const rate = equipSuccessRate(lv);
      const cost = equipCostFor(lv);
      rateLine.setText(`성공률 ${formatPct(rate)} · 실패 시 단계 유지`);
      goldLine.setText(`보유 ${this.fmtGold(this.save.gold)}`);
      const canAfford = this.save.gold >= cost;
      btnBg.setFillStyle(canAfford ? 0xffd23f : COLOR_DIM);
      btnLabel.setText(canAfford ? '강화하기' : '골드 부족');
      btnLabel.setColor(canAfford ? '#0e0e12' : '#9aa0a6');
      btnSub.setText(`-${this.fmtGold(cost)}`);
      btnSub.setColor(canAfford ? '#0e0e12' : '#9aa0a6');
      if (canAfford) {
        btnBg.setInteractive({ useHandCursor: true });
      } else {
        btnBg.disableInteractive();
      }
    };

    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => {
      const lv = this.equipLevel(slot);
      const cost = equipCostFor(lv);
      if (this.save.gold < cost) return;
      this.save.gold -= cost;
      const result = tryEnhanceEquip(lv);
      if (result.kind === 'success') {
        this.save.equipment[this.jobKey][slot] = result.to;
        resultLine.setText(`✨ 성공! Lv ${result.from} → ${result.to}`);
        resultLine.setColor('#4ae290');
      } else if (result.kind === 'fail-stay') {
        resultLine.setText('실패. 단계는 유지됩니다.');
        resultLine.setColor('#e2c84a');
      } else {
        resultLine.setText('최고 단계 달성');
      }
      persistSave(this.save);
      refresh();
      this.refreshEquipSlots();
      this.refreshTopBar();
      this.refreshRateText();
    });

    refresh();

    // 닫기 버튼
    const closeBtnW = 200;
    const closeBtnH = 56;
    const closeY = cy + panelH / 2 - 50;
    const closeBg = this.add
      .rectangle(cx, closeY, closeBtnW, closeBtnH, 0x3a3a44)
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

    const close = () => objs.forEach((o) => o.destroy());
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', close);
    overlay.on('pointerdown', close);
  }

  // ============ 콤보 시스템 ============

  /**
   * 콤보 → 다음 강화 보너스 (성공률에 가산).
   * - developer: 콤보당 +1%p, 캡 +30%p (만료 시간 8s, 끊기면 0)
   * - planner/designer: 3+/5+/10+ → +2/+5/+10%p (캡 +10%p)
   */
  private currentComboBonus(): number {
    if (this.jobKey === 'developer') {
      return Math.min(
        DEVELOPER_COMBO_BONUS_CAP,
        this.save.combo * DEVELOPER_COMBO_BONUS_PER,
      );
    }
    if (this.save.combo >= 10) return 0.10;
    if (this.save.combo >= 5) return 0.05;
    if (this.save.combo >= 3) return 0.02;
    return 0;
  }

  /** 개발자 전용: 콤보 만료 체크. 만료되면 0으로 리셋. */
  private checkComboExpiry(): void {
    if (this.jobKey !== 'developer') return;
    if (this.save.combo <= 0) return;
    if (this.isEnhancing) return;
    if (this.save.comboLastAt <= 0) return;
    const elapsed = Date.now() - this.save.comboLastAt;
    if (elapsed >= DEVELOPER_COMBO_DEADLINE_MS) {
      this.save.combo = 0;
      this.save.comboLastAt = 0;
      persistSave(this.save);
      this.showComboBreak();
      this.refreshComboText();
      this.refreshRateText();
    }
  }

  /** 콤보 끊김 시각 효과 ("프로덕션 장애!" 메시지 + 흔들림) */
  private showComboBreak(): void {
    if (!this.alive) return;
    this.cameras.main.shake(220, 0.012);
    const cx = GAME_WIDTH / 2;
    const t = this.add
      .text(cx, 700, '💥 콤보 끊김 — 프로덕션 장애!', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '26px',
        color: '#e24a4a',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(180);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: 660,
      duration: 1200,
      onComplete: () => t.destroy(),
    });
  }

  private refreshComboText(): void {
    if (this.save.combo <= 0) {
      this.comboText.setText('');
      this.comboPanel?.setVisible(false);
      return;
    }
    this.comboPanel?.setVisible(true);
    const bonus = this.currentComboBonus();
    if (this.jobKey === 'developer') {
      const remaining = Math.max(
        0,
        DEVELOPER_COMBO_DEADLINE_MS - (Date.now() - this.save.comboLastAt),
      );
      const sec = Math.ceil(remaining / 1000);
      const lines = [
        `🔥 ${this.save.combo}`,
        `콤보 +${(bonus * 100).toFixed(0)}%p`,
        `⏱ ${sec}s`,
      ];
      this.comboText.setText(lines.join('\n'));
      // 시간 임박 시 색상 변경
      if (remaining < 2000) {
        this.comboText.setColor('#e24a4a');
      } else if (remaining < 4000) {
        this.comboText.setColor('#ffd23f');
      } else {
        this.comboText.setColor('#ff8c42');
      }
    } else if (bonus > 0) {
      this.comboText.setText(`🔥 ${this.save.combo}\n콤보\n+${(bonus * 100).toFixed(0)}%p`);
    } else {
      this.comboText.setText(`🔥 ${this.save.combo}\n콤보`);
    }
  }

  // ============ 타이밍 게이지 ============

  private spawnTimingGauge(durationMs: number): void {
    const cx = GAME_WIDTH / 2;
    const y = 990;
    const gaugeW = 480;
    const gaugeH = 50;

    const bg = this.add
      .rectangle(cx, y, gaugeW, gaugeH, 0x1a1a22)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(70);
    // 스위트 스팟 (중앙 ±5%) - 퍼펙트
    const perfectW = gaugeW * 0.10;
    const perfect = this.add
      .rectangle(cx, y, perfectW, gaugeH, 0x4ae290, 0.6)
      .setDepth(71);
    // 굿 영역 (±15%)
    const goodW = gaugeW * 0.30;
    const good = this.add
      .rectangle(cx, y, goodW, gaugeH, 0xffd23f, 0.3)
      .setDepth(70);

    const marker = this.add
      .rectangle(cx - gaugeW / 2 + 6, y, 8, gaugeH - 8, 0xff5050, 1)
      .setDepth(72);

    const hint = this.add
      .text(cx, y - 36, '⏱ 탭하면 멈춤! (정중앙 = 퍼펙트)', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(72);

    this.timingGaugeObjs = [bg, perfect, good, marker, hint];

    // 마커 애니메이션 (좌→우→좌 yoyo)
    const tween = this.tweens.add({
      targets: marker,
      x: cx + gaugeW / 2 - 6,
      duration: durationMs * 0.5,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    let stopped = false;
    const stop = (): number => {
      if (stopped) return this.currentTimingBonus;
      stopped = true;
      tween.stop();
      // 마커 위치로 보너스 결정
      const offset = Math.abs(marker.x - cx);
      let bonus = 0;
      let label = '';
      if (offset <= perfectW / 2) {
        bonus = 0.15;
        label = '✨ 퍼펙트!';
      } else if (offset <= goodW / 2) {
        bonus = 0.08;
        label = '👍 굿!';
      } else {
        bonus = 0;
        label = '😐 미스';
      }
      this.currentTimingBonus = bonus;

      // 짧은 라벨 표시
      const flash = this.add
        .text(cx, y - 80, label, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '28px',
          color: bonus >= 0.15 ? '#4ae290' : bonus >= 0.08 ? '#ffd23f' : '#9aa0a6',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(72);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        y: y - 130,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => flash.destroy(),
      });
      return bonus;
    };

    this.timingGaugeStop = stop;

    // 게이지 영역 어디든 탭하면 멈춤. background에 setInteractive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => stop());
  }

  private clearTimingGauge(): void {
    this.timingGaugeStop = undefined;
    this.timingGaugeObjs.forEach((o) => o.destroy());
    this.timingGaugeObjs = [];
  }

  // ============ 긴급 알림 ============

  private maybeFireEmergency(): void {
    if (this.emergencyActive) return;
    if (!this.alive) return;
    if (this.level < 3) return; // 너무 초반엔 안 나옴
    if (Math.random() > 0.55) return;
    this.spawnEmergency();
  }

  private spawnEmergency(): void {
    this.emergencyActive = true;
    // 상단바 아래 좌측 (다른 UI와 안 겹치는 자리)
    const x = 150;
    const y = 130;
    const w = 280;
    const h = 64;

    const bg = this.add
      .rectangle(x, y, w, h, 0xe24a4a, 0.95)
      .setStrokeStyle(3, 0xffffff, 0.7)
      .setDepth(80);
    const titleText = this.add
      .text(x, y - 14, '🚨 긴급 장애!', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(81);
    const subText = this.add
      .text(x, y + 14, '탭해서 출동 (+보너스)', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    this.emergencyObjs = [bg, titleText, subText];

    // 깜빡임
    this.tweens.add({
      targets: bg,
      alpha: { from: 0.95, to: 0.6 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.handleEmergencyClick());

    // 30초 후 자동 사라짐
    this.time.delayedCall(30_000, () => {
      if (this.emergencyActive) this.clearEmergencyObjs();
    });
  }

  private handleEmergencyClick(): void {
    if (!this.emergencyActive) return;
    // 보상: 단계 비례 큰 골드
    const reward = Math.ceil(Math.pow(this.level + 1, 1.6) * 80);
    this.save.gold += reward;
    persistSave(this.save);
    this.refreshTopBar();
    this.spawnFloatingGold(reward, '🚨 긴급 출동 완료!', '#ff5050');
    this.clearEmergencyObjs();
  }

  private clearEmergencyObjs(): void {
    this.emergencyActive = false;
    this.emergencyObjs.forEach((o) => o.destroy());
    this.emergencyObjs = [];
  }

  // ============ 장인의 손길 ============

  private masterhandPrice(): number {
    return Math.round(ITEMS.masterhand.price * Math.pow(1.5, this.save.masterhandUseCount));
  }

  private masterhandRemainingMs(): number {
    const elapsed = Date.now() - this.save.masterhandLastUseAt;
    return Math.max(0, 5 * 60 * 1000 - elapsed);
  }

  private masterhandOnCooldown(): boolean {
    return this.masterhandRemainingMs() > 0;
  }

  private masterhandCooldownText(): string {
    const ms = this.masterhandRemainingMs();
    if (ms <= 0) return '';
    const sec = Math.ceil(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ============ 명성 (Prestige) ============

  /** L2: 사옥 등급 멀티 (모든 매출에 적용) */
  private officeMul(): number {
    return officeMultiplier(this.save.officeTier);
  }

  /** prestige 1 = 자동회복/패시브 ×1.10, 클릭 ×1.15, 본체 강화 +1%p */
  private prestigeRegenMul(): number {
    return 1 + this.save.prestige * 0.1;
  }
  private prestigeClickMul(): number {
    return 1 + this.save.prestige * 0.15;
  }
  private prestigeRateBonus(): number {
    return this.save.prestige * 0.01;
  }

  // ============ 팀 시너지 (Phase 3: 5배 강화) ============
  // 직군별 bestByJob 기반 영구 보너스 — 팀을 다 키워야 풀 시너지

  /** 개발자 best → 본체 강화 +1.5%p × N */
  private teamRateBonus(): number {
    return this.save.bestByJob.developer * 0.015;
  }
  /** 기획자 best → 자동회복/패시브 ×(1 + 0.10 × N) */
  private teamRegenMul(): number {
    return 1 + this.save.bestByJob.planner * 0.10;
  }
  /** 디자이너 best → 클릭 보상 ×(1 + 0.10 × N) */
  private teamClickMul(): number {
    return 1 + this.save.bestByJob.designer * 0.10;
  }

  /** 현재 직군을 제외한 다른 두 직군 best의 평균 (gating용) */
  private otherJobsBestAvg(): number {
    const keys: JobKey[] = ['planner', 'designer', 'developer'];
    const others = keys.filter((k) => k !== this.jobKey);
    const sum = others.reduce((acc, k) => acc + this.save.bestByJob[k], 0);
    return sum / others.length;
  }

  // ============ 자동 출근 ============

  private autoWorkInterval(): number {
    // lv 5: 4500ms / lv 10: 3500 / lv 15: 2500 / lv 20: 1500 / lv 25+: 500
    return Math.max(500, 5500 - this.level * 200);
  }

  private setupAutoWork(): void {
    this.autoWorkTimer?.remove(false);
    this.autoWorkTimer = undefined;
    if (!this.alive) return;
    if (this.level < 5) return;
    this.autoWorkTimer = this.time.addEvent({
      delay: this.autoWorkInterval(),
      loop: true,
      callback: () => this.doAutoWork(),
    });
  }

  private doAutoWork(): void {
    if (!this.alive) return;
    if (this.level < 5) return;
    let reward = Math.ceil(
      INCOMES.work.reward(this.level) * this.currentAccMul() * this.prestigeClickMul() * this.officeMul() * this.teamClickMul(),
    );
    let isJackpot = false;
    let label = '';
    let color = '#ffd23f';
    const r = Math.random();
    if (r < 0.001) {
      reward *= 100;
      isJackpot = true;
      label = '🤑 스톡옵션 행사!';
      color = '#a370ff';
    } else if (r < 0.01) {
      reward *= 10;
      isJackpot = true;
      label = '💰 성과급 지급!';
      color = '#ff8c42';
    } else if (r < 0.05) {
      reward *= 3;
      isJackpot = true;
      label = '🌙 야근 수당!';
      color = '#9af0a8';
    }
    this.save.gold += reward;
    persistSave(this.save);
    this.refreshTopBar();
    if (isJackpot) {
      this.spawnFloatingGold(reward, label, color);
    }
    if (!this.isEnhancing) this.refreshPrimaryButton();
  }

  // ============ AFK 보상 ============

  private grantAfkReward(): void {
    const now = Date.now();
    const last = this.save.lastVisitedAt || now;
    const elapsedMs = Math.max(0, now - last);
    const elapsedSec = Math.min(elapsedMs / 1000, 8 * 3600); // 8시간 캡
    if (elapsedSec < 60) {
      this.save.lastVisitedAt = now;
      return;
    }

    // 자동 회복 누적
    const regenPerSec = (regenAmount(this.alive ? this.level : 0) * this.currentSubMul() * this.prestigeRegenMul()) / 3;
    let total = Math.floor(regenPerSec * elapsedSec);

    // 패시브 인컴 누적
    PASSIVE_INCOMES.forEach((key) => {
      const def = INCOMES[key];
      if (this.level < def.unlockLevel) return;
      const gain = (def.reward(this.level) * this.currentSubMul() * this.prestigeRegenMul());
      const cycles = Math.floor((elapsedSec * 1000) / def.param);
      total += Math.floor(gain * cycles);
    });

    // 자동 출근 누적 (lv 5+)
    if (this.alive && this.level >= 5) {
      const autoReward = INCOMES.work.reward(this.level) * this.currentAccMul() * this.prestigeClickMul() * this.officeMul();
      const cycles = Math.floor((elapsedSec * 1000) / this.autoWorkInterval());
      total += Math.floor(autoReward * cycles);
    }

    if (total <= 0) {
      this.save.lastVisitedAt = now;
      return;
    }

    this.save.gold += total;
    this.save.lastVisitedAt = now;
    persistSave(this.save);
    this.showAfkRewardModal(total, elapsedSec);
  }

  private showAfkRewardModal(reward: number, elapsedSec: number): void {
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
      .rectangle(cx, cy, 600, 500, 0x1a1a22)
      .setStrokeStyle(3, 0xffd23f, 0.6)
      .setDepth(301);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 180, '🌙 자리비움 보상', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '36px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const hours = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    objs.push(
      this.add
        .text(cx, cy - 100, `자리비운 시간: ${hours}시간 ${mins}분`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '22px',
          color: '#cfd1d4',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    objs.push(
      this.add
        .text(cx, cy - 30, `+${this.fmtGold(reward)}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '56px',
          color: '#4ae290',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    objs.push(
      this.add
        .text(cx, cy + 50, '자동 회복 + 패시브 + 자동 출근 누적\n(최대 8시간 캡)', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#9aa0a6',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(302),
    );

    const btnW = 240;
    const btnH = 60;
    const btnY = cy + 160;
    const btnBg = this.add
      .rectangle(cx, btnY, btnW, btnH, 0xffd23f)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(302);
    const btnText = this.add
      .text(cx, btnY, '받기', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '24px',
        color: '#0e0e12',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(303);
    objs.push(btnBg, btnText);

    const close = () => {
      objs.forEach((o) => o.destroy());
      this.refreshTopBar();
    };
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', close);
    overlay.on('pointerdown', close);
  }

  // ============ 이력서 판매 (이직) ============

  private resignReward(): number {
    // 단계별 이직 보상 (gold 기준). 단계가 매우 높으면 큰 폭으로 증가
    return Math.floor(Math.pow(this.level, 2.2) * 80);
  }

  private resignPrestigeGain(): number {
    if (this.level >= 20) return 5;
    if (this.level >= 15) return 3;
    if (this.level >= 10) return 2;
    if (this.level >= 5) return 1;
    return 0;
  }

  private openResignModal(): void {
    if (this.isEnhancing) return;
    if (!this.alive) return;
    if (this.level < 5) {
      this.flashResultText('5단계 이상부터 이직 가능합니다.');
      return;
    }

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setOrigin(0)
      .setDepth(200)
      .setInteractive();
    objs.push(overlay);

    const panel = this.add
      .rectangle(cx, cy, 620, 620, 0x1a1a22)
      .setStrokeStyle(3, 0x4a90e2, 0.6)
      .setDepth(201);
    objs.push(panel);

    objs.push(
      this.add
        .text(cx, cy - 230, '📤 이직하기', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '32px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    const reward = this.resignReward();
    const prestigeGain = this.resignPrestigeGain();

    objs.push(
      this.add
        .text(cx, cy - 160, `현재 단계: ${this.level} (${titleFor(this.jobKey, this.level)})`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#cfd1d4',
          align: 'center',
          wordWrap: { width: 580 },
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    objs.push(
      this.add
        .text(cx, cy - 80, '이직 시 캐릭터 단계 0으로 리셋\n명성치 누적, 영구 보너스 획득', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '18px',
          color: '#9aa0a6',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    objs.push(
      this.add
        .text(cx, cy + 0, `이직 보상: +${this.fmtGold(reward)}`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '24px',
          color: '#ffd23f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    objs.push(
      this.add
        .text(cx, cy + 40, `명성치: +${prestigeGain} (현재 ${this.save.prestige})`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#4a90e2',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    objs.push(
      this.add
        .text(cx, cy + 80, `⚡ 명성치 1당: 자동회복 ×1.1 / 클릭 ×1.15 / 강화 +1%p (영구)`, {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '15px',
          color: '#9aa0a6',
          align: 'center',
          wordWrap: { width: 580 },
        })
        .setOrigin(0.5)
        .setDepth(202),
    );

    // 이직 버튼
    const goBtnW = 240;
    const goBtnH = 64;
    const goY = cy + 160;
    const goBg = this.add
      .rectangle(cx, goY, goBtnW, goBtnH, 0x4a90e2)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(202);
    objs.push(goBg);
    objs.push(
      this.add
        .text(cx, goY, '이직 확정', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(203),
    );

    // 닫기
    const closeY = cy + 240;
    const closeBg = this.add
      .rectangle(cx, closeY, 200, 56, 0x3a3a44)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(202);
    objs.push(closeBg);
    objs.push(
      this.add
        .text(cx, closeY, '취소', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(203),
    );

    const close = () => objs.forEach((o) => o.destroy());

    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', close);
    overlay.on('pointerdown', close);

    goBg.setInteractive({ useHandCursor: true });
    goBg.on('pointerdown', () => {
      this.save.gold += reward;
      this.save.prestige += prestigeGain;
      this.level = 0;
      this.alive = true;
      this.save.combo = 0;
      this.buffs = {};
      const def = CHARACTERS[this.jobKey];
      this.characterShape.setFillStyle(def.color);
      this.characterShape.setAlpha(1);
      this.levelText.setAlpha(1);
      this.syncProgress();
      persistSave(this.save);
      void pushCloudSave(this.save);
      this.refreshAll();
      this.setupAutoWork();
    this.setupIdleParticles();
      this.resultText.setText(`✨ 이직 완료! 명성치 +${prestigeGain} (현재 ${this.save.prestige})`);
      close();
    });
  }
}

function formatPct(rate: number): string {
  const pct = rate * 100;
  if (pct < 0.1) return `${pct.toFixed(3)}%`;
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

function bucketOf(result: EnhanceResult): MessageBucket {
  switch (result.kind) {
    case 'success':
      return 'success';
    case 'fail-stay':
      return 'fail-stay';
    case 'fail-down':
      return 'fail-down';
    case 'destroy':
      return 'destroy';
    case 'maxed':
      return 'success';
  }
}
