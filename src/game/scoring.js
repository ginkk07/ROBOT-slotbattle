import { ALL_SYMBOLS, isSymbol, SymbolId } from './symbols.js';

export const COMBO_VALUE = Object.freeze([0, 1, 3, 9]);

export function countSymbols(reels) {
  if (!Array.isArray(reels) || reels.length !== 3 || !reels.every(isSymbol)) {
    throw new TypeError('拉霸結果必須正好包含三個合法圖示');
  }

  return Object.fromEntries(
    ALL_SYMBOLS.map((symbol) => [
      symbol,
      reels.filter((value) => value === symbol).length,
    ]),
  );
}

export function scoreSpin(reels, wager) {
  if (!Number.isInteger(wager) || wager < 1) {
    throw new RangeError('投入的行動點必須是大於0的整數');
  }

  const counts = countSymbols(reels);
  const stunned = counts[SymbolId.UNLUCKY] === 3;

  if (stunned) {
    return {
      reels: [...reels],
      wager,
      counts,
      stunned: true,
      base: { attack: 0, defense: 0, skill: 0 },
      awarded: { attack: 0, defense: 0, skill: 0 },
    };
  }

  const luckyValue = COMBO_VALUE[counts[SymbolId.LUCKY]];
  const base = {
    attack: COMBO_VALUE[counts[SymbolId.ATTACK]] + luckyValue,
    defense: COMBO_VALUE[counts[SymbolId.DEFENSE]] + luckyValue,
    skill: COMBO_VALUE[counts[SymbolId.SKILL]] + luckyValue,
  };

  return {
    reels: [...reels],
    wager,
    counts,
    stunned: false,
    base,
    awarded: {
      attack: base.attack * wager,
      defense: base.defense * wager,
      skill: base.skill * wager,
    },
  };
}
