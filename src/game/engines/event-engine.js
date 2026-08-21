import { getEvent } from '../data/events.js';
import { drawEncounter } from './encounter-engine.js';
import { pickWeighted } from './weighted-random.js';

export function resolveEvent(eventId, { rng = Math.random } = {}) {
  const event = getEvent(eventId);
  const outcome = pickWeighted(event.outcomes, rng);

  if (outcome.type === 'encounter') {
    return {
      event,
      outcome,
      unit: drawEncounter(outcome.encounterTableId, { rng }),
    };
  }

  throw new RangeError(`尚未支援的事件結果：${outcome.type}`);
}
