export function pickWeighted(entries, rng = Math.random, weightOf = (entry) => entry.weight) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError('加權抽選至少需要一筆資料');
  }

  const weights = entries.map((entry) => weightOf(entry));
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new RangeError('抽選權重必須是大於0的數字');
  }

  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = roll * total;

  for (let index = 0; index < entries.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return entries[index];
  }

  return entries.at(-1);
}

export function randomInteger(minimum, maximum, rng = Math.random) {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum) {
    throw new RangeError('整數抽選範圍不合法');
  }

  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('rng 必須回傳0（含）到1（不含）的數字');
  }

  return minimum + Math.floor(roll * (maximum - minimum + 1));
}
