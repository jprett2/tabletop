import { ActionSource, type GameAction } from '@tabletop/common'
import { HydratedOathGameState } from '../model/gameState.js'
import { ActionType } from '../definition/actions.js'
import { MachineState } from '../definition/states.js'

export const SECOND_WIND_ID = 'denizen.discord.second-wind'

export function nextActionIndex(state: HydratedOathGameState): number {
    return state.actionCount + 1
}

/** Wild Allies, Captains — for this action only. */
export function campaignAsIfSiteNow(
    state: HydratedOathGameState,
    playerId: string
): string | undefined {
    const asIf = state.getPlayerState(playerId).campaignAsIf
    return asIf && asIf.atAction === state.actionCount ? asIf.siteId : undefined
}

export function carryFreeActions(
    state: HydratedOathGameState,
    action: GameAction,
    takenIn: MachineState
): void {
    const index = state.actionCount
    for (const player of state.players) {
        if (isOwnActPhaseAction(action, takenIn, player.playerId)) continue
        if (player.freeTravelAtAction === index) player.freeTravelAtAction += 1
        if (player.freeCampaignAtAction === index) player.freeCampaignAtAction += 1
        if (player.campaignAsIf?.atAction === index) player.campaignAsIf.atAction += 1
    }
}

function isOwnActPhaseAction(action: GameAction, takenIn: MachineState, playerId: string) {
    return (
        takenIn === MachineState.ActPhase &&
        action.source === ActionSource.User &&
        action.playerId === playerId
    )
}

function isAhead(state: HydratedOathGameState, actionIndex: number | undefined): boolean {
    return actionIndex !== undefined && actionIndex >= state.actionCount
}

export function hasFreeActionAhead(state: HydratedOathGameState, playerId: string): boolean {
    const player = state.getPlayerState(playerId)
    return isAhead(state, player.freeTravelAtAction) || isAhead(state, player.freeCampaignAtAction)
}

export function forfeitFreeActions(state: HydratedOathGameState, playerId: string): void {
    const player = state.getPlayerState(playerId)
    delete player.freeTravelAtAction
    delete player.freeCampaignAtAction
}

export function freeActionTypesNow(state: HydratedOathGameState, playerId: string): ActionType[] {
    const player = state.getPlayerState(playerId)
    const types: ActionType[] = []
    if (player.freeTravelAtAction === state.actionCount) types.push(ActionType.Travel)
    if (player.freeCampaignAtAction === state.actionCount) types.push(ActionType.Campaign)
    return types
}

/** R-10.2-H1 — a Sneak Attack is held until this player's Second Wind is settled. */
export function sneakAttackWaitsOn(state: HydratedOathGameState, playerId: string): boolean {
    return state.sneakAttacksHeld.some((held) => held.defenderPlayerId === playerId)
}

/** R-10.2-H1 — only this player's free Travel or Campaign may come before the waiting Sneak Attack. */
export function owesSecondWindFirst(state: HydratedOathGameState, playerId: string): boolean {
    return sneakAttackWaitsOn(state, playerId) && freeActionTypesNow(state, playerId).length > 0
}
