import { HydratedOathGameState } from '../model/gameState.js'
import { cardDefinition } from '../data/cardRegistry.js'
import { persistentsInPlay } from './persistent.js'
import { siteHolding } from './access.js'

/** R-7.2.2 — the printed lock, or one a persistent power imposes on this actor. */
export function isLockedFor(
    state: HydratedOathGameState,
    actorId: string,
    cardId: string
): boolean {
    if (cardDefinition(cardId)?.locked) return true
    const siteId = siteHolding(state, cardId)
    return siteId !== undefined && siteLockedFor(state, actorId, siteId)
}

export function siteLockedFor(
    state: HydratedOathGameState,
    actorId: string,
    siteId: string
): boolean {
    for (const { ctx, hooks } of persistentsInPlay(state)) {
        if (hooks.locksSiteFor?.(ctx, actorId, siteId)) return true
    }
    return false
}
