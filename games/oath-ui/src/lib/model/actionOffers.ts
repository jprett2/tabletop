import {
    Banner,
    HydratedRecover,
    HydratedSetupChoice,
    HydratedTrade,
    HydratedTravel,
    PeekTargetKind,
    RecoverTargetKind,
    Suit,
    TradeOption,
    defaultTolls,
    tollsFor,
    type HydratedOathGameState,
    type ModifierUse,
    type PeekTarget,
    type Toll,
    type TollOccasion
} from '@tabletop/oath'

export type BoardPick = { sites: string[]; label: string }
export type SiteOffer =
    | { slotId: string; intent: 'start'; label: string }
    | { slotId: string; intent: 'travel'; cost: number | undefined; toll: string }
    | { slotId: string; intent: 'target'; targeted: boolean }
    | { slotId: string; intent: 'moveWarbands' }

export type BannerBid = { banner: Banner; amount: number }

/** R-1.23.1 — every faceup site the engine accepts, holding the cards constant. */
export function setupSites(
    state: HydratedOathGameState,
    playerId: string,
    hand: readonly string[]
): string[] {
    const [adviserCardId, ...discardOrder] = hand
    if (adviserCardId === undefined) return []
    return state.faceupSiteIds().filter(
        (siteId) =>
            HydratedSetupChoice.reasonCannotResolve(state, playerId, {
                adviserCardId,
                discardOrder,
                siteId
            }) === undefined
    )
}

export type TravelTerms = { tolls: string[]; flipSecret: boolean }

/** R-7.1.4, R-11.12, R-11.13 — the tolls and the flipped secret a Travel carries. */
export function travelTerms(
    state: HydratedOathGameState,
    playerId: string,
    siteId: string,
    modifiers?: readonly ModifierUse[]
): TravelTerms {
    const tolls = defaultTolls(state, playerId, { kind: 'travel', toSiteId: siteId })
    return {
        tolls,
        flipSecret: HydratedTravel.defaultFlipSecret(state, playerId, siteId, tolls, modifiers)
    }
}

export function travelCost(
    state: HydratedOathGameState,
    playerId: string,
    siteId: string
): number | undefined {
    const { tolls, flipSecret } = travelTerms(state, playerId, siteId)
    const plan = HydratedTravel.plan(state, playerId, siteId, undefined, tolls, flipSecret)
    return plan.reason && !HydratedTravel.costFor(state, playerId, siteId) ? undefined : plan.cost
}

/** R-7.1.4 — the tolls the send attaches (`util/tollDefaults.ts`), named before the tap. */
export function chosenTolls(
    state: HydratedOathGameState,
    playerId: string,
    occasion: TollOccasion
): Toll[] {
    const chosen = defaultTolls(state, playerId, occasion)
    return tollsFor(state, playerId, occasion).filter((t) => chosen.includes(t.cardId))
}

/** R-5.3.2 — Trade's legality is per option. */
export function tradeOptions(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string,
    modifiers: ModifierUse[]
): TradeOption[] {
    const tolls = defaultTolls(state, playerId, { kind: 'trade', cardId })
    return [TradeOption.ForFavor, TradeOption.ForSecrets].filter(
        (option) =>
            HydratedTrade.reasonCannotTrade(state, playerId, cardId, option, modifiers, tolls) ===
            undefined
    )
}

// R-5.4, R-6.3 — relic slots, never card ids: a facedown relic's identity is in the vault.
export function recoverableRelicSlots(
    state: HydratedOathGameState,
    playerId: string,
    modifiers: ModifierUse[]
): string[] {
    const siteId = state.getPlayerState(playerId).siteId
    if (!siteId) return []
    return state
        .relicSlotsAt(siteId)
        .filter(
            (slot) =>
                HydratedRecover.reasonCannotRecover(state, playerId, {
                    modifiers,
                    target: { kind: RecoverTargetKind.Relic, slotId: slot.slotId }
                }) === undefined
        )
        .map((slot) => slot.slotId)
}

/** R-5.4.2 — only the minimum bid (value + 1) is offered; R-5.4.4's redistribution starts from Discord. */
export function recoverableBanners(
    state: HydratedOathGameState,
    playerId: string,
    modifiers: ModifierUse[]
): BannerBid[] {
    return Object.values(Banner)
        .map((banner) => ({ banner, amount: state.banners[banner].value + 1 }))
        .filter(
            ({ banner, amount }) =>
                HydratedRecover.reasonCannotRecover(state, playerId, {
                    modifiers,
                    target: { kind: RecoverTargetKind.Banner, banner },
                    amountPaid: amount,
                    redistributeFrom: Suit.Discord
                }) === undefined
        )
}

export function peekSlots(targets: readonly PeekTarget[], kind: PeekTargetKind): string[] {
    return targets.filter((target) => target.kind === kind).map((target) => target.slotId)
}
