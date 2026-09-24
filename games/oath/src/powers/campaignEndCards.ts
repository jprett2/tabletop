import { HydratedOathGameState } from '../model/gameState.js'
import { Suit } from '../model/oathEnums.js'
import { PowerTiming, powerIndexOf } from '../data/cardPowers.js'
import { suitOf } from '../data/cardRegistry.js'
import { ruledFaceupCardIds } from '../util/access.js'
import { isLockedFor } from '../util/locked.js'
import { holdSneakAttack } from '../util/sneakAttack.js'
import { registerBattlePlan, registerPersistent } from './registry.js'

const WILD_MOUNTS = 'denizen.nomad.wild-mounts'

/** R-10.21, R-10.14 — a facedown adviser has no suit (R-5.1.4.II), and a locked card cannot be discarded (R-7.2.2). */
function beastCardsToDiscard(state: HydratedOathGameState, playerId: string): string[] {
    return ruledFaceupCardIds(state, playerId).filter(
        (cardId) => suitOf(cardId) === Suit.Beast && !isLockedFor(state, playerId, cardId)
    )
}

// It prints no "At end, discard" of its own, so R-5.5.8 never reaches it.
registerBattlePlan(WILD_MOUNTS, powerIndexOf(WILD_MOUNTS, PowerTiming.BattlePlan), {
    hooks: {
        sparesEndDiscards: (ctx, owedCardIds) => {
            const planCardIds = owedCardIds.filter((cardId) => suitOf(cardId) === Suit.Nomad)
            const insteadCardIds = beastCardsToDiscard(ctx.state, ctx.playerId)
            return planCardIds.length > 0 && insteadCardIds.length > 0
                ? { planCardIds, insteadCardIds }
                : undefined
        }
    }
})

const SNEAK_ATTACK = 'denizen.discord.sneak-attack'

// R-7.1.4-H2 — a persistent-braided "you may" is a trigger: it is asked, never evaluated.
registerPersistent(SNEAK_ATTACK, powerIndexOf(SNEAK_ATTACK, PowerTiming.Persistent), {
    afterCampaign: (ctx, attackerId) => {
        for (const holderPlayerId of ctx.ownerIds) {
            if (holderPlayerId === attackerId) continue
            holdSneakAttack(ctx.state, {
                cardId: SNEAK_ATTACK,
                holderPlayerId,
                defenderPlayerId: attackerId
            })
        }
        return undefined
    }
})
