/**
 * 調度一次完整攻擊，而非任何傷害事件。
 *
 * 具體傷害仍由呼叫端送進既有 damage pipeline；這裡只負責 Attack / Hit
 * 時機、每 Hit 的最新快照，以及死亡後停止後續 Hit。
 */
export function resolveAttack({
  attackId,
  damageSource = null,
  attackerKey,
  targetKey,
  totalHits = 1,
  getState,
  getArmor,
  runTrigger,
  resolveHit,
}) {
  const events = [];
  const hitResults = [];
  const attackContext = createAttackContext({
    attackId,
    damageSource,
    attackerKey,
    targetKey,
    totalHits,
    getState,
    getArmor,
  });
  events.push(...runTrigger('before-attack', attackContext));

  for (let hitIndex = 0; hitIndex < totalHits; hitIndex += 1) {
    const beforeHit = createHitContext({
      ...attackContext,
      hitIndex,
      getState,
      getArmor,
    });
    events.push(...runTrigger('before-attack-hit', beforeHit));
    if (!areUnitsAlive(getState(), attackerKey, targetKey)) break;

    const result = resolveHit(beforeHit) ?? {};
    const afterHit = {
      ...beforeHit,
      ...result,
      attacker: getState()[attackerKey],
      target: getState()[targetKey],
      armorAfter: getArmor(getState(), targetKey),
      targetHpAfter: getState()[targetKey]?.hp ?? 0,
    };
    hitResults.push(afterHit);
    events.push(...runTrigger('after-attack-hit', afterHit));
    if (!areUnitsAlive(getState(), attackerKey, targetKey)) break;
  }

  const afterAttack = {
    ...attackContext,
    attacker: getState()[attackerKey],
    target: getState()[targetKey],
    hitResults,
  };
  events.push(...runTrigger('after-attack', afterAttack));
  return { attackContext, hitResults, events };
}

function createAttackContext({
  attackId,
  damageSource,
  attackerKey,
  targetKey,
  totalHits,
  getState,
  getArmor,
}) {
  const state = getState();
  return {
    attackId,
    damageSource,
    attackerKey,
    targetKey,
    totalHits,
    attacker: state[attackerKey],
    target: state[targetKey],
    targetArmor: getArmor(state, targetKey),
  };
}

function createHitContext({ getState, getArmor, hitIndex, ...attackContext }) {
  const state = getState();
  return {
    ...attackContext,
    hitIndex,
    hitNumber: hitIndex + 1,
    attacker: state[attackContext.attackerKey],
    target: state[attackContext.targetKey],
    armorBefore: getArmor(state, attackContext.targetKey),
    targetHpBefore: state[attackContext.targetKey]?.hp ?? 0,
  };
}

function areUnitsAlive(state, attackerKey, targetKey) {
  return state[attackerKey]?.hp > 0 && state[targetKey]?.hp > 0;
}
