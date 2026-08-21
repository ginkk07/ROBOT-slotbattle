import { getEvent } from '../data/events.js';
import { pickWeighted } from './weighted-random.js';

export function drawEvent(
  rarity,
  { events = [], regionTags = [], rng = Math.random } = {},
) {
  const candidates = events.filter((event) => (
    event.rarity === rarity
    && regionTags.every((tag) => event.tags.includes(tag))
  ));
  if (candidates.length === 0) {
    throw new RangeError(`沒有符合 ${rarity} 稀有度的奇遇`);
  }
  return pickWeighted(candidates, rng, (event) => event.weight ?? 1);
}

export function resolveEvent(eventId, { rng = Math.random } = {}) {
  const event = getEvent(eventId);
  const outcome = pickWeighted(event.outcomes, rng);

  if (outcome.type === 'continue') {
    return { event, outcome };
  }

  throw new RangeError(`尚未支援的事件結果：${outcome.type}`);
}
