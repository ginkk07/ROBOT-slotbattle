import { AppsScriptGameStore } from './apps-script-store.js';
import { D1GameStore } from './d1-store.js';
import { MemoryGameStore } from './memory-store.js';
import { ProfileMirrorGameStore } from './profile-mirror-store.js';

export function createGameStore(environment = process.env, { enqueue } = {}) {
  const url = environment.APPS_SCRIPT_URL?.trim();
  const secret = environment.APPS_SCRIPT_SECRET?.trim();

  if (environment.DB) {
    const primary = new D1GameStore({ database: environment.DB });
    if (!url && !secret) return primary;
    if (!url || !secret) {
      throw new Error('APPS_SCRIPT_URL 與 APPS_SCRIPT_SECRET 必須同時設定');
    }

    return new ProfileMirrorGameStore({
      primary,
      mirror: new AppsScriptGameStore({ url, secret, timeoutMs: 25000 }),
      enqueue,
    });
  }

  if (!url && !secret) return new MemoryGameStore();
  if (!url || !secret) {
    throw new Error('APPS_SCRIPT_URL 與 APPS_SCRIPT_SECRET 必須同時設定');
  }

  return new AppsScriptGameStore({ url, secret });
}
