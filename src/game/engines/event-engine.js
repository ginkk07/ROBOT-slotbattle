import { getEvent } from '../data/events.js';
import { pickWeighted } from './weighted-random.js';

export function drawEvent(
  rarity,
  { events = [], regionTags = [], rng = Math.random } = {},
) {
  const candidates = events.filter((event) => (
    event.available !== false
    && event.rarity === rarity
    && regionTags.every((tag) => event.tags.includes(tag))
  ));
  if (candidates.length === 0) {
    throw new RangeError(`沒有符合 ${rarity} 稀有度的奇遇`);
  }
  return pickWeighted(candidates, rng, (event) => event.weight ?? 1);
}

export function resolveEvent(eventId, optionId, { rng = Math.random } = {}) {
  const event = getEvent(eventId);
  const option = event.options.find((entry) => entry.id === optionId);
  if (!option) throw new RangeError('奇遇選項不存在');
  const outcome = pickWeighted(option.outcomes, rng);
  return { event, option, outcome };
}
