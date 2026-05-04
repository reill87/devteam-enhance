import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { isSupabaseEnabled } from '../lib/supabase';
import { getSessionUserId, loadCloudSave } from '../systems/CloudSyncSystem';
import { loadSave, persistSave } from '../systems/SaveSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {}

  create(): void {
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
      loadingText.destroy();
      this.scene.start('Menu');
      return;
    }

    // 로그인된 세션이 있으면 클라우드 세이브 비교 후 채택
    this.bootstrap()
      .catch((err) => console.warn('[boot] cloud sync failed', err))
      .finally(() => {
        loadingText.destroy();
        this.scene.start('Menu');
      });
  }

  private async bootstrap(): Promise<void> {
    const userId = await getSessionUserId();
    if (!userId) return; // 로그인 안 됨 → 로컬 모드

    const cloud = await loadCloudSave();
    if (!cloud) return;

    const local = loadSave();
    const localTime = local.lastVisitedAt ?? 0;
    const cloudTime = new Date(cloud.updatedAt).getTime();
    if (cloudTime > localTime) {
      persistSave(cloud.data);
      console.log('[boot] cloud save adopted', { cloudTime, localTime });
    }
  }
}
