import {
    type HydratedAction,
    type MachineStateHandler,
    MachineContext,
    assertExists
} from '@tabletop/common'
import { MachineState } from '../definition/states.js'
import { HydratedOathGameState } from '../model/gameState.js'
import { ActionType } from '../definition/actions.js'
import { HydratedTravel, isTravel } from '../actions/travel.js'
import { HydratedMuster, isMuster } from '../actions/muster.js'
import { HydratedTrade, isTrade } from '../actions/trade.js'
import { HydratedSearch, isSearch } from '../actions/search.js'
import { HydratedRecover, isRecover } from '../actions/recover.js'
import { HydratedCampaign, isCampaign } from '../actions/campaign.js'
import { HydratedEndActPhase, isEndActPhase } from '../actions/endActPhase.js'
import {
    HydratedPlayFacedownAdviser,
    isPlayFacedownAdviser
} from '../actions/playFacedownAdviser.js'
import { HydratedUseActionPower, isUseActionPower } from '../actions/useActionPower.js'
import { HydratedPeek, Peek, PeekTargetKind, isPeek } from '../actions/peek.js'
import { HydratedMoveWarbands, isMoveWarbands } from '../actions/moveWarbands.js'
import { HydratedOfferCitizenship, isOfferCitizenship } from '../actions/offerCitizenship.js'
import { HydratedExileCitizen, isExileCitizen } from '../actions/exileCitizen.js'
import { HydratedSelfExile, isSelfExile } from '../actions/selfExile.js'
import { phaseAfterActPhaseAction, stateAfterCampaignDeclared } from './handlerSupport.js'
import { freeActionTypesNow, owesSecondWindFirst, sneakAttackWaitsOn } from '../util/freeActions.js'
import { settleHeldSneakAttacks } from '../util/sneakAttack.js'

type ActionAvailability = (state: HydratedOathGameState, playerId: string) => boolean

export class ActPhaseStateHandler implements MachineStateHandler<
    HydratedAction,
    HydratedOathGameState
> {
    private static readonly offeredActions: ReadonlyArray<
        readonly [ActionType, ActionAvailability]
    > = [
        [ActionType.Travel, HydratedTravel.canDoTravel],
        [ActionType.Muster, HydratedMuster.canDoMuster],
        [ActionType.Trade, HydratedTrade.canDoTrade],
        [ActionType.Search, HydratedSearch.canDoSearch],
        [ActionType.Recover, HydratedRecover.canDoRecover],
        [ActionType.Campaign, HydratedCampaign.canDoCampaign],
        // R-6.1–R-6.8 — minor actions, which cost no Supply.
        [ActionType.PlayFacedownAdviser, HydratedPlayFacedownAdviser.canDoPlayFacedownAdviser],
        [ActionType.UseActionPower, HydratedUseActionPower.canDoUseActionPower],
        [ActionType.Peek, HydratedPeek.canDoPeek],
        [ActionType.MoveWarbands, HydratedMoveWarbands.canDoMoveWarbands],
        [ActionType.OfferCitizenship, HydratedOfferCitizenship.canDoOfferCitizenship],
        [ActionType.ExileCitizen, HydratedExileCitizen.canDoExileCitizen],
        [ActionType.SelfExile, HydratedSelfExile.canDoSelfExile],
        // R-4.2 allows zero actions, so ending the phase is always offered.
        [ActionType.EndActPhase, HydratedEndActPhase.canDoEndActPhase]
    ]

    isValidAction(action: HydratedAction, context: MachineContext<HydratedOathGameState>): boolean {
        if (!action.playerId) return false
        return ActPhaseStateHandler.offeredTo(context.gameState, action.playerId).some(
            ([type]) => type === action.type
        )
    }

    validActionsForPlayer(
        playerId: string,
        context: MachineContext<HydratedOathGameState>
    ): string[] {
        return ActPhaseStateHandler.offeredTo(context.gameState, playerId)
            .filter(([, isAvailable]) => isAvailable(context.gameState, playerId))
            .map(([type]) => type)
    }

    /** R-10.2-H1 — Second Wind's free action is owed before a waiting Sneak Attack. */
    private static offeredTo(
        state: HydratedOathGameState,
        playerId: string
    ): ReadonlyArray<readonly [ActionType, ActionAvailability]> {
        const free = owesSecondWindFirst(state, playerId) ? freeActionTypesNow(state, playerId) : []
        if (free.length === 0) return ActPhaseStateHandler.offeredActions
        return ActPhaseStateHandler.offeredActions.filter(([type]) => free.includes(type))
    }

    /** R-6.4 — one free Reliquary Peek per entry; the engine re-enters after every action. */
    enter(context: MachineContext<HydratedOathGameState>) {
        const state = context.gameState
        const playerId = state.turnManager.currentTurn()?.playerId
        if (playerId === undefined || !state.activePlayerIds.includes(playerId)) return
        // R-10.2 — nothing comes between Second Wind and the Sneak Attack waiting on it, a Peek included.
        if (sneakAttackWaitsOn(state, playerId)) return

        const peeked = state.getPlayerState(playerId).peekedRelicSlotIds
        const target = HydratedPeek.legalTargets(state, playerId).find(
            (candidate) =>
                candidate.kind === PeekTargetKind.Reliquary && !peeked.includes(candidate.slotId)
        )
        if (!target) return
        if (state.vault) {
            assertExists(
                state.vault.relicFacedown[target.slotId],
                `R-1.17: the vault holds no relic for the covered Reliquary space ${target.slotId}`
            )
        }
        context.addSystemAction(Peek, { playerId, target })
    }

    onAction(action: HydratedAction, context: MachineContext<HydratedOathGameState>): MachineState {
        const next = ActPhaseStateHandler.stateAfter(action, context.gameState)
        // A Campaign settles held Sneak Attacks itself, as it ends.
        if (action.playerId && !isCampaign(action)) {
            settleHeldSneakAttacks(context.gameState, next === MachineState.ActPhase)
        }
        return next
    }

    private static stateAfter(action: HydratedAction, state: HydratedOathGameState): MachineState {
        if (isCampaign(action)) {
            return stateAfterCampaignDeclared(state)
        }
        if (isMoveWarbands(action) && state.pendingConsent) {
            // R-6.5.a, R-6.5.b — the move waits on the permission it needs.
            return MachineState.ConsentRequest
        }
        if (isSearch(action)) {
            // R-5.1.3, R-5.1.4 — the cards are drawn but not yet kept or played.
            return MachineState.Searching
        }
        if (isEndActPhase(action)) {
            return MachineState.RestPhase
        }
        if (isOfferCitizenship(action)) {
            // R-6.6.1, R-X.1 — the offer waits on the answer; a refused offer ends nothing.
            return MachineState.ConsentRequest
        }
        // R-6.8, R-7.3.2, R-7.3.3, R-7.4 — an action may report that the Act Phase is over.
        if (isSelfExile(action)) {
            return phaseAfterActPhaseAction(action.metadata)
        }
        if (isUseActionPower(action)) {
            // Oracle keeps or discards the drawn Vision "as if you searched".
            if (action.metadata?.opensSearch) return MachineState.Searching
            return phaseAfterActPhaseAction(action.metadata)
        }
        if (isTravel(action)) {
            return phaseAfterActPhaseAction(action.metadata)
        }
        if (isPlayFacedownAdviser(action)) {
            return phaseAfterActPhaseAction(action.metadata)
        }
        if (
            isMuster(action) ||
            isTrade(action) ||
            isRecover(action) ||
            isPeek(action) ||
            isMoveWarbands(action) ||
            isExileCitizen(action)
        ) {
            return MachineState.ActPhase
        }
        throw Error(`Unhandled action type: ${action.type}`)
    }
}
