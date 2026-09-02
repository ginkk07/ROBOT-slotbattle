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

export function scoreSpin(
  reels,
  wager,
  { promoteWithLucky = false, unluckyActsAsLucky = false } = {},
) {
  if (!Number.isInteger(wager) || wager < 1) {
    throw new RangeError('投入的行動點必須是大於0的整數');
  }

  const counts = countSymbols(reels);
  const stunned = counts[SymbolId.UNLUCKY] === 3;

  const luckyValue = COMBO_VALUE[counts[SymbolId.LUCKY]]
    + (unluckyActsAsLucky ? COMBO_VALUE[counts[SymbolId.UNLUCKY]] : 0);
  const comboValue = (symbolId) => {
    const count = counts[symbolId];
    // 幸運蘿蔔只提升實際出現的⚔️／🛡️／✨，🍀原有效果另外保留。
    const promotedCount = promoteWithLucky && count > 0
      ? Math.min(3, count + counts[SymbolId.LUCKY])
      : count;
    return COMBO_VALUE[promotedCount];
  };
  // 一般三個💀仍是0收益；惡魔之血則保留暈眩，但讓💀同時提供🍀收益。
  const base = stunned && !unluckyActsAsLucky
    ? { attack: 0, defense: 0, skill: 0 }
    : {
      attack: comboValue(SymbolId.ATTACK) + luckyValue,
      defense: comboValue(SymbolId.DEFENSE) + luckyValue,
      skill: comboValue(SymbolId.SKILL) + luckyValue,
    };

  return {
    reels: [...reels],
    wager,
    counts,
    stunned,
    base,
    awarded: {
      attack: base.attack * wager,
      defense: base.defense * wager,
      skill: base.skill * wager,
    },
  };
}
