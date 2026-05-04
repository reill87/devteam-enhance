import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { isSupabaseEnabled } from '../lib/supabase';
import { ensureAnonymousUser, loadCloudSave } from '../systems/CloudSyncSystem';
import { loadSave, persistSave } from '../systems/SaveSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {}

  create(): void {
    // 로딩 텍스트
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const loadingText = this.add
      .text(cx, cy, '로딩 중...', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '28px',
        color: '#cfd1d4',
      })
      .setOrigin(0.5);

    if (!isSupabaseEnabled()) {
      // 로컬 모드: 즉시 메뉴
      loadingText.destroy();
      this.scene.start('Menu');
      return;
    }

    // 클라우드 동기화: cloud > local이면 cloud 채택
    this.bootstrap()
      .catch((err) => console.warn('[boot] cloud sync failed', err))
      .finally(() => {
        loadingText.destroy();
        this.scene.start('Menu');
      });
  }

  private async bootstrap(): Promise<void> {
    await ensureAnonymousUser();
    const cloud = await loadCloudSave();
    if (!cloud) return;

    const local = loadSave();
    const localTime = local.lastVisitedAt ?? 0;
    const cloudTime = new Date(cloud.updatedAt).getTime();
    if (cloudTime > localTime) {
      // 클라우드가 더 최신 — 로컬에 덮어쓰기
      persistSave(cloud.data);
      console.log('[boot] cloud save adopted', { cloudTime, localTime });
    }
  }
}
