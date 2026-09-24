import { HydratedOathGameState } from '../model/gameState.js'
import { GRAND_SCEPTER_ID } from '../data/relics.js'
import { recordGrandScepterTaken } from './imperial.js'

/** R-6.4 — taking the Grand Scepter is recorded, since it cannot be used that turn. */
export function takeRelic(state: HydratedOathGameState, playerId: string, cardId: string): void {
    state.getPlayerState(playerId).relicIds.push(cardId)
    if (cardId === GRAND_SCEPTER_ID) recordGrandScepterTaken(state)
}

export function releaseRelic(state: HydratedOathGameState, playerId: string, cardId: string): void {
    const player = state.getPlayerState(playerId)
    player.relicIds = player.relicIds.filter((id) => id !== cardId)
}

export function moveRelic(
    state: HydratedOathGameState,
    fromId: string,
    toId: string,
    cardId: string
): void {
    releaseRelic(state, fromId, cardId)
    takeRelic(state, toId, cardId)
}

/** R-2.8.2 — the slot leaves the site with its relic. */
export function clearSiteRelicSlot(state: HydratedOathGameState, siteId: string, slotId: string) {
    state.relicsBySite[siteId] = state.relicSlotsAt(siteId).filter((s) => s.slotId !== slotId)
}

/** R-2.3 — the space is uncovered; the traits follow from the count. */
export function clearReliquarySlot(state: HydratedOathGameState, slotId: string) {
    state.reliquary = state.reliquarySlots().filter((s) => s.slotId !== slotId)
}
