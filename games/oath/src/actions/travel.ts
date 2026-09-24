import * as Type from 'typebox'
import { Compile } from 'typebox/compile'
import { GameAction, HydratableAction, MachineContext } from '@tabletop/common'
import { HydratedOathGameState } from '../model/gameState.js'
import { afterTravelPersistent, reasonPersistentForbidsTravel } from '../util/persistent.js'
import { payTolls, reasonTollsUnpaid, travelFreeByToll, wayStationRuled } from '../util/tolls.js'
import { defaultTolls } from '../util/tollDefaults.js'
import {
    flipOfferedForTravel,
    flipSecretFacedown,
    reasonFlipInvalid,
    reasonSitesForbidTravel,
    siteTravelTerms
} from '../util/siteTravel.js'
import { ActionType } from '../definition/actions.js'
import { baseTravelCost } from '../util/travelCost.js'
import {
    foldNumber,
    modifierSummary,
    ModifierUse,
    ModifierUses,
    payModifierCosts,
    resolveModifiers,
    runAfter,
    type ActionPlan
} from '../util/modifiers.js'
import { flipSiteFromVault } from '../util/hiddenInputs.js'
import { nextActionIndex } from '../util/freeActions.js'
import { pawnSiteId, regionOfPawn } from '../util/pawn.js'

export type TravelMetadata = Type.Static<typeof TravelMetadata>
export const TravelMetadata = Type.Object({
    fromSiteId: Type.Optional(Type.String()),
    supplySpent: Type.Number(),
    supplyRemaining: Type.Number(),
    /** R-5.6.2 */
    revealedSiteCardId: Type.Optional(Type.String()),
    /** R-2.8.2 */
    relicsRevealed: Type.Optional(Type.Number()),
    /** R-7.4 */
    modifiers: Type.Optional(Type.Array(Type.String())),
    modifierNotes: Type.Optional(Type.Array(Type.String())),
    /** R-4.2 (Special Envoy) */
    endsActPhase: Type.Optional(Type.Boolean()),
    /** R-7.1.4 */
    tollsPaid: Type.Optional(Type.Array(Type.String())),
    /** R-11 */
    siteNotes: Type.Optional(Type.Array(Type.String())),
    secretFlipped: Type.Optional(Type.Boolean())
})

export type Travel = Type.Static<typeof Travel>
export const Travel = Type.Evaluate(
    Type.Intersect([
        Type.Omit(GameAction, ['playerId']),
        Type.Object({
            type: Type.Literal(ActionType.Travel),
            playerId: Type.String(),
            siteId: Type.String(),
            /** R-7.4 — declared at the start of the action. */
            modifiers: ModifierUses,
            /** R-7.1.4 (Toll Roads, Way Station) */
            tolls: Type.Optional(Type.Array(Type.String(), { maxItems: 8 })),
            /** R-11.12, R-11.13 — for the site that asks. */
            flipSecret: Type.Optional(Type.Boolean()),
            metadata: Type.Optional(TravelMetadata)
        })
    ])
)

export const TravelValidator = Compile(Travel)

export function isTravel(action?: GameAction): action is Travel {
    return action?.type === ActionType.Travel
}

export class HydratedTravel extends HydratableAction<typeof Travel> implements Travel {
    declare type: ActionType.Travel
    declare playerId: string
    declare siteId: string
    declare modifiers?: ModifierUse[]
    declare tolls?: string[]
    declare flipSecret?: boolean
    declare metadata?: TravelMetadata

    constructor(data: Travel) {
        super(data, TravelValidator)
    }

    apply(state: HydratedOathGameState, _context?: MachineContext) {
        const player = state.getPlayerState(this.playerId)
        const plan = HydratedTravel.plan(
            state,
            this.playerId,
            this.siteId,
            this.modifiers,
            this.tolls,
            this.flipSecret
        )
        if (plan.reason) {
            throw Error(`Cannot travel: ${plan.reason}`)
        }
        const { cost, active } = plan
        // R-11.12, R-11.13
        if (this.flipSecret) flipSecretFacedown(state, this.playerId)

        const fromSiteId = pawnSiteId(state, this.playerId)

        // R-7.1.2, R-7.4 — paid at declaration.
        payModifierCosts(state, this.playerId, active)
        // R-7.1.4 (Toll Roads, Way Station) — paid before the move.
        const tollNotes = payTolls(
            state,
            this.playerId,
            { kind: 'travel', toSiteId: this.siteId },
            this.tolls
        )

        player.spendSupply(cost)
        if (player.freeTravelAtAction === state.actionCount) {
            delete player.freeTravelAtAction
            if (player.freeCampaignAtAction === state.actionCount)
                player.freeCampaignAtAction = nextActionIndex(state)
        }

        // R-5.6.2
        player.siteId = this.siteId

        const revealed = state.isSiteFaceup(this.siteId)
            ? undefined
            : flipSiteFromVault(state, this.siteId)
        this.revealsInfo = revealed !== undefined

        // R-7.4 (Tyrant, Special Envoy) — once the pawn has arrived.
        const after = runAfter(state, this.playerId, active, { destinationSiteId: this.siteId })
        // R-7.1.4 (Grasping Vines, Boiling Lake)
        const persistent = afterTravelPersistent(state, this.playerId, fromSiteId, this.siteId)

        this.metadata = {
            fromSiteId,
            supplySpent: cost,
            supplyRemaining: player.supply,
            revealedSiteCardId: revealed?.siteCardId,
            relicsRevealed: revealed?.relicsRevealed ?? 0,
            modifiers: active.length > 0 ? modifierSummary(active) : undefined,
            modifierNotes:
                after.notes.length + persistent.length > 0
                    ? [...after.notes, ...persistent]
                    : undefined,
            endsActPhase: after.endsActPhase || undefined,
            tollsPaid: tollNotes.length > 0 ? tollNotes : undefined,
            siteNotes: plan.siteNotes.length > 0 ? plan.siteNotes : undefined,
            secretFlipped: this.flipSecret || undefined
        }
    }

    static plan(
        state: HydratedOathGameState,
        playerId: string,
        siteId: string,
        modifiers?: readonly ModifierUse[],
        tolls?: readonly string[],
        flipSecret = false
    ): ActionPlan & { siteNotes: string[] } {
        const player = state.getPlayerState(playerId)
        const base = HydratedTravel.costFor(state, playerId, siteId)
        if (base === undefined) {
            return {
                reason: `${siteId} is not a site on the map`,
                cost: 0,
                active: [],
                siteNotes: []
            }
        }
        const here = pawnSiteId(state, playerId)
        if (here === siteId) {
            return {
                reason: 'your pawn already occupies that site',
                cost: base,
                active: [],
                siteNotes: []
            }
        }
        // R-7.1.4 — Vow of Union's "cannot travel from a site you rule".
        const sworn = reasonPersistentForbidsTravel(state, playerId, here, siteId)
        if (sworn) return { reason: sworn, cost: base, active: [], siteNotes: [] }
        const resolved = resolveModifiers(state, playerId, ActionType.Travel, modifiers, {
            destinationSiteId: siteId
        })
        if (resolved.reason)
            return { reason: resolved.reason, cost: base, active: [], siteNotes: [] }
        // Forest Paths, Portal — "ignore the powers of sites", which then ask no secret either.
        const sitesIgnored = resolved.active.some((m) => m.hooks.ignoresSitePowers === true)
        // R-11.8, R-11.13 — the Narrow Pass's must and The Hidden Place's cannot.
        const barred = sitesIgnored
            ? reasonFlipInvalid(state, playerId, false, flipSecret)
            : reasonSitesForbidTravel(state, playerId, here, siteId, flipSecret)
        if (barred) return { reason: barred, cost: base, active: [], siteNotes: [] }
        // R-11.3, R-11.6, R-11.7, R-11.12 — the sites' own prices.
        const siteTerms = sitesIgnored
            ? { cost: base, notes: [] }
            : siteTravelTerms(state, here, siteId, base, flipSecret)
        let cost = foldNumber('supplyCost', siteTerms.cost, state, playerId, resolved.active, {
            destinationSiteId: siteId
        })
        // R-7.1.4 — Toll Roads' demand, Way Station's offer (`util/tolls.ts`).
        const unpaid = reasonTollsUnpaid(
            state,
            playerId,
            { kind: 'travel', toSiteId: siteId },
            tolls
        )
        if (unpaid)
            return { reason: unpaid, cost, active: resolved.active, siteNotes: siteTerms.notes }
        if (
            travelFreeByToll(state, playerId, siteId, tolls) ||
            wayStationRuled(state, playerId, siteId)
        )
            cost = 0
        // Second Wind — "you may travel … spending no Supply" as the very next action.
        if (player.freeTravelAtAction === state.actionCount) cost = 0
        if (player.supply < cost) {
            return {
                reason: `costs ${cost} Supply, player has ${player.supply}`,
                cost,
                active: resolved.active,
                siteNotes: siteTerms.notes
            }
        }
        return { cost, active: resolved.active, siteNotes: siteTerms.notes }
    }

    static reasonCannotTravel(
        state: HydratedOathGameState,
        playerId: string,
        siteId: string,
        modifiers?: readonly ModifierUse[],
        tolls?: readonly string[],
        flipSecret = false
    ): string | undefined {
        return HydratedTravel.plan(state, playerId, siteId, modifiers, tolls, flipSecret).reason
    }

    static defaultFlipSecret(
        state: HydratedOathGameState,
        playerId: string,
        siteId: string,
        tolls?: readonly string[],
        modifiers?: readonly ModifierUse[]
    ): boolean {
        const player = state.getPlayerState(playerId)
        if (player.secrets < 1) return false
        const resolved = resolveModifiers(state, playerId, ActionType.Travel, modifiers, {
            destinationSiteId: siteId
        })
        if (resolved.active.some((m) => m.hooks.ignoresSitePowers === true)) return false
        const offer = flipOfferedForTravel(state, pawnSiteId(state, playerId), siteId)
        if (offer === 'demanded') return true
        if (offer === 'offered')
            return (
                player.supply <
                HydratedTravel.plan(state, playerId, siteId, undefined, tolls, false).cost
            )
        return false
    }

    static costFor(
        state: HydratedOathGameState,
        playerId: string,
        siteId: string
    ): number | undefined {
        if (!state.allSiteIds().includes(siteId)) return undefined
        return baseTravelCost(regionOfPawn(state, playerId), state.regionOf(siteId))
    }

    /** R-5.6.1 */
    static legalDestinations(state: HydratedOathGameState, playerId: string): string[] {
        const here = pawnSiteId(state, playerId)
        return state.allSiteIds().filter((siteId) => {
            if (siteId === here) {
                return false
            }
            const tolls = defaultTolls(state, playerId, { kind: 'travel', toSiteId: siteId })
            return (
                HydratedTravel.plan(
                    state,
                    playerId,
                    siteId,
                    undefined,
                    tolls,
                    HydratedTravel.defaultFlipSecret(state, playerId, siteId, tolls)
                ).reason === undefined
            )
        })
    }

    static canDoTravel(state: HydratedOathGameState, playerId: string): boolean {
        return HydratedTravel.legalDestinations(state, playerId).length > 0
    }
}
