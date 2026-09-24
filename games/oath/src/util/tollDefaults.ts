import { HydratedOathGameState } from '../model/gameState.js'
import { HydratedTravel } from '../actions/travel.js'
import { tollsFor, type TollOccasion } from './tolls.js'

export function defaultTolls(
    state: HydratedOathGameState,
    actorId: string,
    occasion: TollOccasion
): string[] {
    const available = tollsFor(state, actorId, occasion)
    const chosen = available.filter((t) => !t.discount).map((t) => t.cardId)
    if (occasion.kind === 'travel') {
        const discount = available.find((t) => t.discount)
        if (discount) {
            const player = state.getPlayerState(actorId)
            const cost = HydratedTravel.plan(
                state,
                actorId,
                occasion.toSiteId,
                undefined,
                chosen
            ).cost
            if (player.supply < cost) chosen.push(discount.cardId)
        }
    }
    return chosen
}
