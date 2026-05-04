import Phaser from 'phaser';
import { COLORS } from '../data/theme';

/**
 * 라운드 사각형 패널을 그린다 (Graphics 기반).
 * 기존 rectangle은 직각이지만 이건 둥근 모서리 + 옅은 그림자 옵션.
 */
export type PanelOpts = {
  fill?: number;
  fillAlpha?: number;
  border?: number;
  borderAlpha?: number;
  borderWidth?: number;
  radius?: number;
  shadow?: boolean;
  shadowOffset?: number;
  depth?: number;
};

export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOpts = {},
): Phaser.GameObjects.Graphics {
  const {
    fill = COLORS.bgPanel,
    fillAlpha = 1,
    border = COLORS.border,
    borderAlpha = 0.6,
    borderWidth = 1,
    radius = 14,
    shadow = false,
    shadowOffset = 6,
    depth = 0,
  } = opts;

  const g = scene.add.graphics();
  g.setDepth(depth);
  if (shadow) {
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + shadowOffset, w, h, radius);
  }
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  if (borderWidth > 0) {
    g.lineStyle(borderWidth, border, borderAlpha);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  }
  return g;
}

/**
 * 텍스트에 골드 글로우 효과 (배경 색상 + 광택).
 */
export function applyGlow(
  text: Phaser.GameObjects.Text,
  color: number = COLORS.gold,
  blur: number = 10,
): Phaser.GameObjects.Text {
  return text.setShadow(0, 0, '#' + color.toString(16).padStart(6, '0'), blur, false, true);
}

/**
 * 텍스트에 미세한 drop shadow (가독성 향상).
 */
export function applyShadow(
  text: Phaser.GameObjects.Text,
  offsetY: number = 3,
  blur: number = 4,
): Phaser.GameObjects.Text {
  return text.setShadow(0, offsetY, '#000000', blur, true, true);
}

/**
 * 회전 링 — 캐릭터 둘레 점선 회전.
 * 작은 점들을 원 둘레에 배치하고 angle tween으로 회전.
 */
export function spawnRotatingRing(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  radius: number,
  count: number = 12,
  dotRadius: number = 3,
  color: number = COLORS.gold,
  alpha: number = 0.55,
  durationMs: number = 16000,
): { container: Phaser.GameObjects.Container; tween: Phaser.Tweens.Tween } {
  const container = scene.add.container(cx, cy);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dot = scene.add
      .circle(Math.cos(angle) * radius, Math.sin(angle) * radius, dotRadius, color, alpha);
    container.add(dot);
  }
  const tween = scene.tweens.add({
    targets: container,
    rotation: Math.PI * 2,
    duration: durationMs,
    repeat: -1,
    ease: 'Linear',
  });
  return { container, tween };
}

/**
 * 큰 흐릿한 후광 (캐릭터 뒤). 단계별 색상 변경 가능.
 */
export function makeHalo(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  radius: number,
  color: number,
  alpha: number = 0.18,
): Phaser.GameObjects.Arc {
  return scene.add.circle(cx, cy, radius, color, alpha);
}

/**
 * 버튼 호버 시 글로우 + 살짝 scale up tween.
 */
export function attachHoverGlow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bg: Phaser.GameObjects.Rectangle,
  glowColor: number = 0xffffff,
): void {
  let activeTween: Phaser.Tweens.Tween | undefined;
  container.on('pointerover', () => {
    bg.setStrokeStyle(3, glowColor, 0.85);
    activeTween?.stop();
    activeTween = scene.tweens.add({
      targets: container,
      scale: 1.03,
      duration: 120,
      ease: 'Cubic.easeOut',
    });
  });
  container.on('pointerout', () => {
    bg.setStrokeStyle(3, glowColor, 0.25);
    activeTween?.stop();
    activeTween = scene.tweens.add({
      targets: container,
      scale: 1,
      duration: 120,
      ease: 'Cubic.easeOut',
    });
  });
}

/**
 * idle 파티클: 캐릭터 주변에 작은 점들이 떠다님 (단계 비례).
 * 각 점은 무작위 위치에서 위로 천천히 올라가다 fade out.
 */
export function spawnIdleParticles(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  count: number,
  color: number = COLORS.gold,
): Phaser.Time.TimerEvent {
  return scene.time.addEvent({
    delay: 400,
    loop: true,
    callback: () => {
      for (let i = 0; i < count; i++) {
        const startX = cx + (Math.random() - 0.5) * 280;
        const startY = cy + 100 + Math.random() * 40;
        const dot = scene.add.circle(startX, startY, 2 + Math.random() * 2, color, 0.7);
        scene.tweens.add({
          targets: dot,
          y: startY - 200 - Math.random() * 100,
          alpha: 0,
          duration: 2200 + Math.random() * 800,
          ease: 'Sine.easeOut',
          onComplete: () => dot.destroy(),
        });
      }
    },
  });
}
