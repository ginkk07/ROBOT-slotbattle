import { AppsScriptGameStore } from './apps-script-store.js';
import { MemoryGameStore } from './memory-store.js';

export function createGameStore(environment = process.env) {
  const url = environment.APPS_SCRIPT_URL?.trim();
  const secret = environment.APPS_SCRIPT_SECRET?.trim();

  if (!url && !secret) return new MemoryGameStore();
  if (!url || !secret) {
    throw new Error('APPS_SCRIPT_URL 與 APPS_SCRIPT_SECRET 必須同時設定');
  }

  return new AppsScriptGameStore({ url, secret });
}
