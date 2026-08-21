import { SymbolId } from './symbols.js';

/**
 * 使用 0～99 的整數精確實作 30/30/30/5/5 權重。
 * rng 必須回傳 0（含）到 100（不含）的整數。
 */
export function drawSymbol(rng = secureRandomInteger) {
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

function secureRandomInteger(maximum) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 0x1_0000_0000) {
    throw new RangeError('maximum 必須是 1～2^32 的整數');
  }

  // 拒絕超出完整倍數範圍的值，避免取餘數造成機率偏差。
  const limit = Math.floor(0x1_0000_0000 / maximum) * maximum;
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % maximum;
}
