import type { HydratedOathGameState, TollOccasion } from '@tabletop/oath'
import { chosenTolls, travelTerms } from './actionOffers.js'

export const START_HERE = 'start here'

/** R-7.1.4 — what rides on the tap beyond Supply, as the site's chip reads it. */
export function tollLabel(
    state: HydratedOathGameState,
    playerId: string,
    occasion: TollOccasion,
    nameOf: (playerId: string) => string
): string {
    const tolls = chosenTolls(state, playerId, occasion)
    const parts: string[] = []
    if (tolls.length > 0) {
        const to = tolls.map((t) => (t.payeeId ? nameOf(t.payeeId) : 'the fire'))
        parts.push(`${tolls.length} favor to ${[...new Set(to)].join(', ')}`)
    }
    // R-11.12, R-11.13 — a secret flipped facedown for the site that asks.
    if (occasion.kind === 'travel' && travelTerms(state, playerId, occasion.toSiteId).flipSecret) {
        parts.push('a secret flipped')
    }
    return parts.length ? ` + ${parts.join(' + ')}` : ''
}
