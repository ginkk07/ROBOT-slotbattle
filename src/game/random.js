import { randomInt } from 'node:crypto';

import { SymbolId } from './symbols.js';

/**
 * 使用 0～99 的整數精確實作 30/30/30/5/5 權重。
 * rng 必須回傳 0（含）到 100（不含）的整數。
 */
export function drawSymbol(rng = (max) => randomInt(max)) {
  const roll = rng(100);

  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) {
    throw new RangeError('rng 必須回傳 0～99 的整數');
  }

  if (roll < 30) return SymbolId.ATTACK;
  if (roll < 60) return SymbolId.DEFENSE;
  if (roll < 90) return SymbolId.SKILL;
  if (roll < 95) return SymbolId.LUCKY;
  return SymbolId.UNLUCKY;
}

export function drawReels(rng) {
  return [drawSymbol(rng), drawSymbol(rng), drawSymbol(rng)];
}
