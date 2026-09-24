import { assert, assertExists } from '@tabletop/common'
import { HydratedOathGameState, type HeldSneakAttack } from '../model/gameState.js'
import { MachineState } from '../definition/states.js'
import { PowerQuestionKind } from '../model/question.js'
import { reasonNoCampaignAgainst } from './campaign.js'
import { hasFreeActionAhead, SECOND_WIND_ID } from './freeActions.js'
import { reasonPersistentForbidsCampaign } from './persistent.js'
import { askQuestion, currentQuestion, resumeStateAfterQuestions } from './questions.js'

/** R-5.5.1, R-5.5.2 — Sneak Attack gives the opportunity, not an exemption. */
export function reasonCannotSneakAttack(
    state: HydratedOathGameState,
    holderPlayerId: string,
    defenderPlayerId: string
): string | undefined {
    if (state.campaign) return 'a Campaign is already under way'
    return (
        reasonPersistentForbidsCampaign(state, holderPlayerId) ??
        reasonNoCampaignAgainst(state, holderPlayerId, defenderPlayerId)
    )
}

export function sneakAttackOfferedTo(state: HydratedOathGameState, playerId: string) {
    const question = currentQuestion(state)
    return question?.kind === PowerQuestionKind.SneakAttack && question.askedPlayerId === playerId
        ? question
        : undefined
}

export function holdTurnForSneakAttack(state: HydratedOathGameState, playerId: string): void {
    const pending = state.pendingQuestions
    assertExists(pending, 'a Sneak Attack was taken with no question open')
    assert(
        sneakAttackOfferedTo(state, playerId) !== undefined,
        `no Sneak Attack is offered to ${playerId}`
    )
    assert(state.heldTurn === undefined, 'a Campaign out of turn is already under way')
    state.heldTurn = {
        ...pending,
        queue: pending.queue.slice(1),
        resumeMachineState: resumeStateAfterQuestions(state)
    }
    state.pendingQuestions = undefined
}

export function isCampaignOutOfTurn(state: HydratedOathGameState): boolean {
    return state.heldTurn !== undefined
}

/** The Campaign's own questions are asked before the held turn's. */
export function resumeHeldTurn(state: HydratedOathGameState): MachineState | undefined {
    const held = state.heldTurn
    if (!held) return undefined
    state.heldTurn = undefined
    const queue = [...(state.pendingQuestions?.queue ?? []), ...held.queue]
    state.pendingQuestions = queue.length > 0 || held.followUp ? { ...held, queue } : undefined
    return held.resumeMachineState
}

export function holdSneakAttack(state: HydratedOathGameState, held: HeldSneakAttack): void {
    state.sneakAttacksHeld = [...state.sneakAttacksHeld, held]
}

/** R-10.2-H1 — the attacker's Second Wind resolves before a Sneak Attack, which stays held. */
export function settleHeldSneakAttacks(
    state: HydratedOathGameState,
    secondWindCanFollow: boolean
): string[] {
    const held = state.sneakAttacksHeld
    if (held.length === 0) return []
    const attackerId = held[0].defenderPlayerId
    if (secondWindCanFollow && hasFreeActionAhead(state, attackerId)) {
        askQuestion(state, attackerId, {
            kind: PowerQuestionKind.SecondWindFirst,
            cardId: SECOND_WIND_ID,
            askedPlayerId: attackerId
        })
        return [`${attackerId} may use Second Wind before the Sneak Attack`]
    }
    state.sneakAttacksHeld = []
    return held.map(({ cardId, holderPlayerId, defenderPlayerId }) => {
        const refused = askQuestion(state, attackerId, {
            kind: PowerQuestionKind.SneakAttack,
            cardId,
            askedPlayerId: holderPlayerId,
            defenderPlayerId
        })
        return refused
            ? `Sneak Attack: ${holderPlayerId} cannot campaign against ${defenderPlayerId} (${refused})`
            : `Sneak Attack: ${holderPlayerId} may campaign against ${defenderPlayerId} for no Supply`
    })
}
