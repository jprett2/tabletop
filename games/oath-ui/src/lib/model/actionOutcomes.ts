import {
    isAnswerQuestion,
    isCampaignDefeatKills,
    isCampaignResolveVictory,
    isCampaignSacrifice,
    isPlayFacedownAdviser,
    isSearchResolve,
    isUseActionPower,
    isUseRestPower,
    type PileDeposit,
    type UseActionPowerMetadata
} from '@tabletop/oath'
import type { GameAction } from '@tabletop/common'

export type { PileDeposit }
export type MergedPiles = NonNullable<UseActionPowerMetadata['mergePiles']>
type ActorOnlyOutcome = Pick<UseActionPowerMetadata, 'peeked' | 'relicToDeckBottom'>

function powerOutcomeOf(
    action: GameAction
): Pick<UseActionPowerMetadata, 'peeked' | 'relicToDeckBottom' | 'mergePiles'> | undefined {
    if (
        isUseActionPower(action) ||
        isUseRestPower(action) ||
        isSearchResolve(action) ||
        isPlayFacedownAdviser(action)
    ) {
        return action.metadata
    }
    return undefined
}

export function mergedPilesOf(action: GameAction): MergedPiles | undefined {
    return powerOutcomeOf(action)?.mergePiles
}

function outcomeOf(action: GameAction): ActorOnlyOutcome | undefined {
    const powerOutcome = powerOutcomeOf(action)
    if (powerOutcome) return powerOutcome
    if (isAnswerQuestion(action)) {
        return action.metadata ? { relicToDeckBottom: action.metadata.relicToDeckBottom } : {}
    }
    return undefined
}

// R-9.4 — rendered by rule: the actor alone is shown what the action showed them,
// whatever data the client happens to hold.
export function actorOnlyOutcome(
    action: GameAction,
    viewerId: string | undefined
): ActorOnlyOutcome | undefined {
    if (viewerId === undefined || action.playerId !== viewerId) return undefined
    const outcome = outcomeOf(action)
    if (!outcome) return undefined
    const peeked = outcome.peeked && outcome.peeked.length > 0 ? outcome.peeked : undefined
    if (!peeked && outcome.relicToDeckBottom === undefined) return undefined
    return { peeked, relicToDeckBottom: outcome.relicToDeckBottom }
}

export function latestActorOnlyOutcome(
    actions: readonly GameAction[],
    viewerId: string | undefined
): ActorOnlyOutcome | undefined {
    const latest = actions.findLast((action) => action.playerId === viewerId)
    return latest ? actorOnlyOutcome(latest, viewerId) : undefined
}

export function pileDepositsOf(action: GameAction): PileDeposit[] {
    if (
        isUseActionPower(action) ||
        isUseRestPower(action) ||
        isSearchResolve(action) ||
        isPlayFacedownAdviser(action) ||
        isCampaignSacrifice(action) ||
        isCampaignDefeatKills(action) ||
        isCampaignResolveVictory(action) ||
        isAnswerQuestion(action)
    ) {
        return action.metadata?.pileDeposits ?? []
    }
    return []
}
