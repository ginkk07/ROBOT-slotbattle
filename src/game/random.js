import { ALL_SYMBOLS, isSymbol, SYMBOL_META, SymbolId } from './symbols.js';

/**
 * 使用 0～99 的整數精確實作 30/30/30/5/5 權重。
 * rng 必須回傳 0（含）到 100（不含）的整數。
 */
export function drawSymbol(rng = secureRandomInteger, fixedChances = {}) {
  if (Object.keys(fixedChances).length > 0) {
    return drawSymbolWithFixedChances(rng, fixedChances);
  }

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

export function drawReels(rng, fixedChances = {}) {
  return [
    drawSymbol(rng, fixedChances),
    drawSymbol(rng, fixedChances),
    drawSymbol(rng, fixedChances),
  ];
}

/**
 * 指定牌面的機率維持固定，其餘牌面依原始比例分配剩餘機率。
 * 例如磨刀石將⚔️固定為50%，幸運草可同時將🍀固定為10%。
 */
function drawSymbolWithFixedChances(rng, fixedChances) {
  const probabilities = resolveSymbolChances(fixedChances);
  const precision = 1_000_000;
  const roll = rng(precision);
  if (!Number.isInteger(roll) || roll < 0 || roll >= precision) {
    throw new RangeError(`rng 必須回傳 0～${precision - 1} 的整數`);
  }

  let cumulative = 0;
  for (const [index, symbolId] of ALL_SYMBOLS.entries()) {
    cumulative += probabilities[symbolId] * precision;
    if (roll < Math.round(cumulative) || index === ALL_SYMBOLS.length - 1) {
      return symbolId;
    }
  }

  return SymbolId.UNLUCKY;
}

export function resolveSymbolChances(fixedChances = {}) {
  const fixedEntries = Object.entries(fixedChances);
  for (const [symbolId, chance] of fixedEntries) {
    if (!isSymbol(symbolId)) throw new RangeError(`不存在的拉霸牌面：${symbolId}`);
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      throw new RangeError('指定牌面機率必須介於0與1');
    }
  }

  const fixedTotal = fixedEntries.reduce((sum, [, chance]) => sum + chance, 0);
  if (fixedTotal > 1) throw new RangeError('指定牌面機率總和不可超過1');

  const fixedIds = new Set(fixedEntries.map(([symbolId]) => symbolId));
  const remainingSymbols = ALL_SYMBOLS.filter((symbolId) => !fixedIds.has(symbolId));
  const remainingBaseTotal = remainingSymbols.reduce(
    (sum, symbolId) => sum + SYMBOL_META[symbolId].probability,
    0,
  );
  if (fixedTotal < 1 && remainingBaseTotal <= 0) {
    throw new RangeError('沒有可分配剩餘機率的牌面');
  }

  return Object.fromEntries(ALL_SYMBOLS.map((symbolId) => {
    if (fixedIds.has(symbolId)) return [symbolId, fixedChances[symbolId]];
    return [
      symbolId,
      (SYMBOL_META[symbolId].probability / remainingBaseTotal) * (1 - fixedTotal),
    ];
  }));
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
