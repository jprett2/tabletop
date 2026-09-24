import { bannerHolder } from '../util/oathkeeper.js'
import { gainFavorFromBank, settleBoardFavor } from '../util/favor.js'
import { SearchPlay, CardKind, PlayerStatus, Region } from '../model/oathEnums.js'
import { ConspiracyPlay } from '../model/conspiracy.js'
export { SearchPlay }
import { isLockedFor } from '../util/locked.js'
import * as Type from 'typebox'
import { Compile } from 'typebox/compile'
import {
    GameAction,
    HydratableAction,
    MachineContext,
    Visibility,
    assertExists
} from '@tabletop/common'
import { discardRegionFor, HydratedOathGameState } from '../model/gameState.js'
import { HiddenReveal } from '../model/hidden.js'
import { PowerOutcome } from '../model/powerOutcome.js'
import { ActionType } from '../definition/actions.js'
import { cardDefinition, CONSPIRACY_ID, kindOf, suitOf } from '../data/cardRegistry.js'
import { effectiveSiteCapacity, SALT_THE_EARTH } from '../util/capacity.js'
import { detachFromPlay, discardCards, type DiscardTarget } from '../util/discard.js'
import { discardRevealedVision } from '../util/revealedVision.js'
import { seizeBanner } from '../util/seize.js'
import { powersWithTiming, PowerTiming } from '../data/cardPowers.js'
import { effectFor } from '../powers/registry.js'
import { regionOfPawn, siteHasRoom, pawnSiteId } from '../powers/vocabulary.js'
import { isFaceupPlay, isIrreversible, powerOutcomeOf } from '../util/powerDoorway.js'
import { PowerChoice, reasonChoicesInvalid } from '../util/powerChoice.js'
import {
    carriedModifiers,
    modifierContext,
    runAfter,
    type ActiveModifier
} from '../util/modifiers.js'
import {
    advisersTowardLimit,
    cannotPlayVisionsFaceup,
    countsTowardAdviserLimit,
    effectiveAdviserLimit
} from '../util/continuous.js'
import {
    afterCardPlayedPersistent,
    reasonPersistentForbidsFacedownAdviser,
    reasonPersistentForbidsFaceupVision
} from '../util/persistent.js'
import { categoryAt, homelandPayout } from '../util/sitePowers.js'
import { commitHiddenOutputs, revealForPlay } from '../util/hiddenInputs.js'
import { moveRelic } from '../util/relics.js'

/** R-9.4 */
export function playShowsCard(play: SearchPlay, faceUp: boolean | undefined): boolean {
    return (
        play === SearchPlay.RevealedVision ||
        play === SearchPlay.Conspiracy ||
        isFaceupPlay(play, faceUp)
    )
}

export type SearchResolveMetadata = Type.Static<typeof SearchResolveMetadata>
export const SearchResolveMetadata = Type.Object({
    /** R-7.3.3 */
    ...PowerOutcome.properties,
    discardedCardIds: Visibility.protect(Type.Array(Type.String()), {
        policy: Visibility.Policy.Actor
    }),
    /** R-9.4 */
    reveal: Type.Optional(Visibility.protect(HiddenReveal, { policy: Visibility.Policy.Actor })),
    /** R-10.5 — the next region's pile, not the pawn's, unless Bracken named one. */
    discardPileRegion: Type.Enum(Region),
    /** Bracken */
    discardToBottom: Type.Optional(Type.Boolean()),
    /** R-9.4 — only when the play shows it. */
    playedCardId: Type.Optional(Type.String()),
    /** Land Warden — only when the play shows it. */
    secondPlayedCardId: Type.Optional(Type.String()),
    /** Truthful Harp */
    revealedKeptCardId: Type.Optional(Type.String()),
    /** Cracked Horn */
    discardToWorldDeck: Type.Optional(Type.Boolean()),
    favorGained: Type.Number(),
    /** R-7.3.3 */
    whenPlayed: Type.Optional(Type.String()),
    /** R-7.1.4 */
    triggered: Type.Optional(Type.Array(Type.String())),
    /** R-7.3.3 */
    endsActPhase: Type.Optional(Type.Boolean()),
    /** R-11.2 */
    sitePower: Type.Optional(Type.String()),
    /** R-7.4 (Wild Cry, Welcoming Party) */
    modifierNotes: Type.Optional(Type.Array(Type.String()))
})

/** Land Warden — "if you play at least one card to a site". */
export type SearchSecondPlay = Type.Static<typeof SearchSecondPlay>
export const SearchSecondPlay = Type.Object({
    cardId: Visibility.protect(Type.String(), { policy: Visibility.Policy.Actor }),
    play: Type.Enum(SearchPlay),
    faceUp: Type.Optional(Type.Boolean())
})

export type SearchResolve = Type.Static<typeof SearchResolve>
export const SearchResolve = Type.Evaluate(
    Type.Intersect([
        Type.Omit(GameAction, ['playerId']),
        Type.Object({
            type: Type.Literal(ActionType.SearchResolve),
            playerId: Type.String(),
            /** R-5.1.3, R-9.4 */
            keptCardId: Visibility.protect(Type.String(), { policy: Visibility.Policy.Actor }),
            discardOrder: Visibility.protect(Type.Array(Type.String(), { maxItems: 16 }), {
                policy: Visibility.Policy.Actor
            }),
            play: Type.Enum(SearchPlay),
            /** R-5.1.4.II — advisers may be played either way up. */
            faceUp: Type.Optional(Type.Boolean()),
            conspiracy: Type.Optional(ConspiracyPlay),
            discardedAdviserCardId: Type.Optional(
                Visibility.protect(Type.String(), { policy: Visibility.Policy.Actor })
            ),
            /** R-7.3.3 */
            choices: Type.Optional(Type.Array(PowerChoice, { maxItems: 16 })),
            /** R-11.10 (Great Slum) — discarded before the site play. */
            discardFirstCardId: Type.Optional(Type.String()),
            /** New Growth */
            toSiteId: Type.Optional(Type.String()),
            secondPlay: Type.Optional(SearchSecondPlay),
            metadata: Type.Optional(SearchResolveMetadata)
        })
    ])
)

export const SearchResolveValidator = Compile(SearchResolve)

export type SearchResolveChoice = Pick<
    SearchResolve,
    | 'keptCardId'
    | 'discardOrder'
    | 'play'
    | 'faceUp'
    | 'conspiracy'
    | 'discardedAdviserCardId'
    | 'choices'
    | 'discardFirstCardId'
    | 'toSiteId'
    | 'secondPlay'
>

export function isSearchResolve(action?: GameAction): action is SearchResolve {
    return action?.type === ActionType.SearchResolve
}

export class HydratedSearchResolve
    extends HydratableAction<typeof SearchResolve>
    implements SearchResolve
{
    declare type: ActionType.SearchResolve
    declare playerId: string
    declare keptCardId: string
    declare discardOrder: string[]
    declare play: SearchPlay
    declare faceUp?: boolean
    declare conspiracy?: ConspiracyPlay
    declare discardedAdviserCardId?: string
    declare choices?: PowerChoice[]
    declare discardFirstCardId?: string
    declare toSiteId?: string
    declare secondPlay?: SearchSecondPlay
    declare metadata?: SearchResolveMetadata

    constructor(data: SearchResolve) {
        super(data, SearchResolveValidator)
    }

    apply(state: HydratedOathGameState, _context?: MachineContext) {
        const player = state.getPlayerState(this.playerId)
        const reason = HydratedSearchResolve.reasonCannotResolve(state, this.playerId, this)
        if (reason) {
            throw Error(`Cannot resolve search: ${reason}`)
        }
        const reveal = revealForPlay(state, this)

        const region = regionOfPawn(state, this.playerId)

        const carried = carriedModifiers(state, state.pendingSearchModifiers)
        state.pendingSearchModifiers = undefined
        const discardTarget = carried
            .map((m) => m.hooks.discardTo?.(modifierContext(state, this.playerId, m)))
            .find((t) => t !== undefined)

        // R-5.1.3, R-10.5 — to the next region's pile, or where Bracken says.
        discardCards(state, this.playerId, this.discardOrder, region, discardTarget)
        player.setHand([])

        // R-5.1.4
        const played = playCard(state, this.playerId, this.keptCardId, this.play, region, {
            faceUp: this.faceUp,
            conspiracy: this.conspiracy,
            discardedAdviserCardId: this.discardedAdviserCardId,
            choices: this.choices,
            reveal,
            discardTarget,
            carried,
            discardFirstCardId: this.discardFirstCardId,
            toSiteId: this.toSiteId
        })

        // Land Warden
        const second = this.secondPlay
            ? playCard(state, this.playerId, this.secondPlay.cardId, this.secondPlay.play, region, {
                  faceUp: this.secondPlay.faceUp,
                  discardTarget
              })
            : undefined

        const after = runAfter(state, this.playerId, carried, {
            playedCardId: this.keptCardId,
            playedTo: this.play
        })

        const pileDeposits = [
            ...(played.outcome.pileDeposits ?? []),
            ...(second?.outcome.pileDeposits ?? [])
        ]
        this.metadata = {
            ...played.outcome,
            reveal,
            pileDeposits: pileDeposits.length > 0 ? pileDeposits : undefined,
            discardedCardIds: [
                ...this.discardOrder,
                ...played.discarded,
                ...(second?.discarded ?? [])
            ],
            playedCardId: playShowsCard(this.play, this.faceUp) ? this.keptCardId : undefined,
            secondPlayedCardId:
                this.secondPlay && playShowsCard(this.secondPlay.play, this.secondPlay.faceUp)
                    ? this.secondPlay.cardId
                    : undefined,
            revealedKeptCardId: carried.some((m) => m.hooks.revealsDraw)
                ? this.keptCardId
                : undefined,
            discardPileRegion: discardTarget?.region ?? discardRegionFor(region),
            discardToBottom: discardTarget?.bottom || undefined,
            discardToWorldDeck: discardTarget?.worldDeck || undefined,
            favorGained: played.favorGained,
            whenPlayed: played.whenPlayed,
            triggered: played.triggered,
            endsActPhase: played.endsActPhase,
            sitePower: played.sitePower,
            modifierNotes: after.notes.length > 0 ? after.notes : undefined
        }

        // R-X.3 — the vault is never rolled back, and a card shown to everyone cannot be unseen.
        this.revealsInfo =
            this.metadata.discardedCardIds.length > 0 ||
            this.metadata.playedCardId !== undefined ||
            this.metadata.secondPlayedCardId !== undefined ||
            this.metadata.revealedKeptCardId !== undefined ||
            isIrreversible(this.metadata) ||
            reveal !== undefined
        commitHiddenOutputs(this, state)
    }

    static conspiracyMatchIsValid(
        state: HydratedOathGameState,
        playerId: string,
        targetPlayerId: string
    ): boolean {
        const player = state.getPlayerState(playerId)
        const target = state.getPlayerState(targetPlayerId)

        const targetSuits = new Set(
            target
                .faceupAdviserIds()
                .map((cardId) => suitOf(cardId))
                .filter((suit) => suit !== undefined)
        )

        const matching = player.faceupAdviserIds().filter((cardId) => {
            const suit = suitOf(cardId)
            return suit !== undefined && targetSuits.has(suit)
        }).length

        return matching >= 2
    }

    static reasonCannotResolve(
        state: HydratedOathGameState,
        playerId: string,
        choice: SearchResolveChoice
    ): string | undefined {
        const player = state.getPlayerState(playerId)

        // R-5.1.3 — one card kept, every other drawn card discarded. Exactly.
        if (!player.knownHand().includes(choice.keptCardId)) {
            return `${choice.keptCardId} was not drawn`
        }
        // Land Warden
        const second = choice.secondPlay
        if (second) {
            const allowed = carriedModifiers(state, state.pendingSearchModifiers).some(
                (m) => m.hooks.secondPlay
            )
            if (!allowed) return 'only one drawn card may be played'
            if (second.cardId === choice.keptCardId || !player.knownHand().includes(second.cardId))
                return `${second.cardId} is not a second drawn card`
            if (second.play !== SearchPlay.Site && second.play !== SearchPlay.Adviser)
                return 'the second card is played to your site or as an adviser'
            if (choice.play !== SearchPlay.Site && second.play !== SearchPlay.Site)
                return 'Land Warden: at least one of the two cards must be played to a site'
            const secondReason = reasonCannotPlayCard(state, playerId, second.cardId, second.play, {
                faceUp: second.faceUp
            })
            if (secondReason) return `second card: ${secondReason}`
            if (choice.play === SearchPlay.Site && second.play === SearchPlay.Site) {
                const here = pawnSiteId(state, playerId)
                if (state.denizensAt(here).length + 2 > effectiveSiteCapacity(state, here))
                    return 'no room at your site for two cards'
            }
        }
        const expected = player
            .knownHand()
            .filter((id) => id !== choice.keptCardId && id !== second?.cardId)
        if (!HydratedSearchResolve.sameMembers(expected, choice.discardOrder)) {
            return `must discard exactly the cards not kept (${expected.join(', ') || 'none'})`
        }

        // R-5.1.4
        return reasonCannotPlayCard(state, playerId, choice.keptCardId, choice.play, {
            discardFirstCardId: choice.discardFirstCardId,
            toSiteId: choice.toSiteId,
            faceUp: choice.faceUp,
            conspiracy: choice.conspiracy,
            discardedAdviserCardId: choice.discardedAdviserCardId,
            choices: choice.choices
        })
    }

    static canDoSearchResolve(state: HydratedOathGameState, playerId: string): boolean {
        const player = state.getPlayerState(playerId)
        return player.handCount > 0
    }

    private static sameMembers(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false
        const counts = new Map<string, number>()
        for (const id of a) counts.set(id, (counts.get(id) ?? 0) + 1)
        for (const id of b) {
            const n = counts.get(id)
            if (!n) return false
            counts.set(id, n - 1)
        }
        return true
    }
}

export function reasonCannotPlayConspiracy(
    state: HydratedOathGameState,
    playerId: string,
    choice: { keptCardId: string; conspiracy?: ConspiracyPlay }
): string | undefined {
    if (choice.keptCardId !== CONSPIRACY_ID) {
        return `${choice.keptCardId} is not the Conspiracy`
    }
    const play = choice.conspiracy
    if (!play) {
        return undefined
    }

    const player = state.getPlayerState(playerId)
    const target = state.findPlayerState(play.targetPlayerId)
    if (!target) return 'no such target player'
    if (pawnSiteId(state, target.playerId) !== pawnSiteId(state, playerId)) {
        return 'the target pawn is not at your site'
    }
    if (player.secrets < 1) {
        // R-7.1.2.a — facedown secrets cannot pay a cost.
        return 'taking requires one secret to burn'
    }
    if (!HydratedSearchResolve.conspiracyMatchIsValid(state, playerId, play.targetPlayerId)) {
        return 'needs two faceup advisers whose suits each match one of theirs'
    }

    if (play.take.kind === 'relic') {
        if (!target.relicIds.includes(play.take.cardId)) {
            return `${play.take.cardId} is not held by that player`
        }
    } else if (bannerHolder(state, play.take.banner) !== play.targetPlayerId) {
        return `that player does not hold the ${play.take.banner}`
    }

    return undefined
}

/** R-5.1.4 */
export interface CardPlayOptions {
    /** R-7.4 (Crop Rotation) */
    carried?: ActiveModifier[]
    /** R-11.10 (Great Slum) — discarded before the site play. */
    discardFirstCardId?: string
    /** New Growth */
    toSiteId?: string
    reveal?: HiddenReveal
    /** Bracken */
    discardTarget?: DiscardTarget
    /** R-5.1.4.II — advisers may be played either way up. */
    faceUp?: boolean
    /** R-5.1.4.IV — the Conspiracy's optional When Played power. */
    conspiracy?: ConspiracyPlay
    /** R-5.1.4.II — to make room at the limit. */
    discardedAdviserCardId?: string
    fromAdvisers?: boolean
    choices?: readonly PowerChoice[]
}

/** R-5.1.4.I */
export interface CardPlayResult {
    favorGained: number
    discarded: string[]
    /** R-7.3.3 */
    whenPlayed?: string
    /** R-7.1.4 (Saddle Makers) */
    triggered?: string[]
    /** R-7.3.3 (Long-Lost Heir, Bewitch) */
    endsActPhase?: boolean
    /** R-11.2 */
    sitePower?: string
    /** R-7.3.3 */
    outcome: PowerOutcome
}

export function playCard(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string,
    play: SearchPlay,
    region: Region,
    options: CardPlayOptions = {}
): CardPlayResult {
    const player = state.getPlayerState(playerId)
    const discarded: string[] = []
    const discard = (id: string) => {
        discardCards(state, playerId, [id], region, options.discardTarget)
        discarded.push(id)
    }
    let favorGained = 0
    let sitePower: string | undefined

    switch (play) {
        case SearchPlay.Site: {
            // R-5.1.4.I — New Growth may name another site.
            const siteId = options.toSiteId ?? pawnSiteId(state, playerId)
            // Crop Rotation — "you may discard a denizen there first"; Great Slum (R-11.10) offers the same.
            const firsts = [
                ...(options.carried ?? []).map((m) =>
                    m.hooks.beforeSitePlay?.(modifierContext(state, playerId, m))
                ),
                options.discardFirstCardId
            ]
            for (const first of firsts) {
                if (first && state.isMusterableCard(siteId, first)) {
                    detachFromPlay(state, first)
                    discard(first)
                }
            }
            state.denizensBySite[siteId] = [...state.denizensAt(siteId), cardId]

            const suit = suitOf(cardId)
            assertExists(suit, `${cardId} has no suit`)
            if ((options.carried ?? []).some((m) => m.hooks.sitePlayGainsSecret)) {
                // Book of Records — "you must gain a secret instead of favor".
                player.secrets += 1
            } else {
                // R-9.3 — component-limited; take as much as the bank holds.
                favorGained = gainFavorFromBank(state, playerId, suit, 1)
            }

            // R-11.2
            sitePower = homelandPayout(state, playerId, siteId, cardId, options.reveal)
            break
        }

        case SearchPlay.Adviser: {
            // R-5.1.4.II — discard first if the limit would be exceeded.
            if (options.discardedAdviserCardId) {
                player.removeAdviser(options.discardedAdviserCardId)
                discard(options.discardedAdviserCardId)
            }
            player.addAdviser(cardId, options.faceUp === true)
            settleBoardFavor(state, playerId)
            break
        }

        case SearchPlay.RevealedVision: {
            // R-5.1.4.III — one at a time; the old one is discarded, not returned to the deck.
            if (player.revealedVisionId) {
                const toPile = discardRevealedVision(state, playerId, region, options.discardTarget)
                if (toPile) discarded.push(toPile)
            }
            player.revealedVisionId = cardId
            break
        }

        case SearchPlay.Discard: {
            discard(cardId)
            break
        }

        case SearchPlay.Conspiracy: {
            playConspiracy(state, playerId, cardId, options.conspiracy)
            break
        }
    }

    let whenPlayed: string | undefined
    let endsActPhase = false
    let outcome: PowerOutcome = {}
    const faceupPlay = isFaceupPlay(play, options.faceUp)
    if (faceupPlay) {
        const power = powersWithTiming(cardId, PowerTiming.WhenPlayed)[0]
        const effect = power ? effectFor(power) : undefined
        if (power && effect) {
            const result = effect.resolve({
                state,
                playerId,
                power,
                choices: options.choices ?? [],
                reveal: options.reveal
            })
            whenPlayed = result.summary
            endsActPhase = result.endsActPhase === true
            outcome = powerOutcomeOf(result)
        }
    }

    // R-7.1.4 — "After another player plays a … card" (Saddle Makers). Faceup only: a facedown card has no suit.
    // A Vision revealed, or the Conspiracy played, is a faceup play too (Book Binders).
    const playedFaceup =
        faceupPlay || play === SearchPlay.RevealedVision || play === SearchPlay.Conspiracy
    const triggered = playedFaceup ? afterCardPlayedPersistent(state, playerId, cardId) : []
    return {
        favorGained,
        discarded,
        whenPlayed,
        sitePower,
        triggered: triggered.length > 0 ? triggered : undefined,
        endsActPhase: endsActPhase || undefined,
        outcome
    }
}

export function playConspiracy(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string,
    play?: ConspiracyPlay
) {
    if (play) {
        const player = state.getPlayerState(playerId)
        const target = state.getPlayerState(play.targetPlayerId)

        // "burn one secret" — R-10.4; the shared secret supply is not tracked.
        player.secrets -= 1

        const take = play.take
        if (take.kind === 'relic') {
            moveRelic(state, target.playerId, playerId, take.cardId)
        } else {
            // R-10.23 — taking a banner this way is a Seize, so R-2.5.3's penalty fires.
            seizeBanner(state, take.banner, playerId)
        }
    }

    state.boxIds.push(cardId)
}

export function reasonWhenPlayedChoicesInvalid(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string,
    play: SearchPlay,
    options: CardPlayOptions = {}
): string | undefined {
    const faceupPlay = isFaceupPlay(play, options.faceUp)
    const power = powersWithTiming(cardId, PowerTiming.WhenPlayed)[0]
    const effect = faceupPlay && power ? effectFor(power) : undefined
    if (!power || !effect) {
        return (options.choices?.length ?? 0) > 0
            ? `${cardId} takes no choices on this play`
            : undefined
    }
    const bad = reasonChoicesInvalid(state, playerId, power, options.choices)
    if (bad) return bad
    return effect.reasonCannotResolve?.({ state, playerId, power, choices: options.choices ?? [] })
}

export function reasonCannotPlayCard(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string,
    play: SearchPlay,
    options: CardPlayOptions = {}
): string | undefined {
    const player = state.getPlayerState(playerId)
    const here = pawnSiteId(state, playerId)

    const whenPlayedReason = reasonWhenPlayedChoicesInvalid(state, playerId, cardId, play, options)
    if (whenPlayedReason) return whenPlayedReason

    const kind = kindOf(cardId)
    const definition = cardDefinition(cardId)

    switch (play) {
        case SearchPlay.Site: {
            // R-5.1.4.III — Visions can never be played to a site.
            if (kind === CardKind.Vision) {
                return 'Visions cannot be played to a site'
            }
            if (definition?.placement === 'adviser') {
                return `${cardId} can only be played to your advisers`
            }
            // New Growth — a site other than the pawn's, only when a carried
            // modifier allows it for this card, and only where there is room.
            if (options.toSiteId !== undefined && options.toSiteId !== here) {
                const allowed = carriedModifiers(state, state.pendingSearchModifiers).some((m) =>
                    m.hooks.playAnywhere?.({
                        ...modifierContext(state, playerId, m),
                        particulars: { playedCardId: cardId, playedTo: play }
                    })
                )
                if (!allowed) return `${cardId} can only be played to your own site`
                if (!state.isSiteFaceup(options.toSiteId))
                    return `${options.toSiteId} is not a faceup site`
                if (!siteHasRoom(state, options.toSiteId)) {
                    return `site ${options.toSiteId} is at its capacity of ${effectiveSiteCapacity(state, options.toSiteId)}`
                }
                return suitOf(cardId)
                    ? undefined
                    : `${cardId} has no suit, so no favor bank matches it`
            }
            // Salt the Earth — "cannot play to a site with any locked cards";
            // and, when played, "ignore this site's capacity".
            if (cardId === SALT_THE_EARTH) {
                if (state.denizensAt(here).some((id) => isLockedFor(state, playerId, id))) {
                    return 'Salt the Earth cannot be played to a site with any locked cards'
                }
            } else {
                if (options.discardFirstCardId !== undefined) {
                    if (categoryAt(state, here) !== 'greatSlum')
                        return 'only the Great Slum lets a card here be discarded first'
                    if (!state.denizensAt(here).includes(options.discardFirstCardId)) {
                        return `${options.discardFirstCardId} is not a denizen at ${here}`
                    }
                }
                const capacity = effectiveSiteCapacity(state, here)
                const freed =
                    carriedModifiers(state, state.pendingSearchModifiers).filter(
                        (m) => m.hooks.beforeSitePlay
                    ).length + (options.discardFirstCardId ? 1 : 0)
                const atSite = state.denizensAt(here).length - Math.min(freed, 1)
                if (atSite >= capacity) {
                    return `site ${here} is at its capacity of ${capacity}`
                }
            }
            if (!suitOf(cardId)) {
                return `${cardId} has no suit, so no favor bank matches it`
            }
            return undefined
        }

        case SearchPlay.Adviser: {
            if (options.faceUp) {
                if (kind !== CardKind.Denizen) {
                    return 'only denizens can be faceup advisers'
                }
                // R-7.2.1; R-7.2 exempts facedown cards, hence the guard.
                if (definition?.placement === 'site') {
                    return `${cardId} can only be played to a site`
                }
            } else if (kind !== CardKind.Denizen && kind !== CardKind.Vision) {
                return 'only denizens and Visions can be advisers'
            } else {
                // R-7.1.4 — Gossip: enemies of its ruler cannot play facedown advisers.
                const gagged = reasonPersistentForbidsFacedownAdviser(state, playerId)
                if (gagged) return gagged
            }

            const withCardId = options.faceUp ? cardId : undefined
            const played = countsTowardAdviserLimit(
                state,
                playerId,
                cardId,
                !!options.faceUp,
                withCardId
            )
            const held =
                advisersTowardLimit(state, playerId, withCardId) -
                (options.fromAdvisers && played ? 1 : 0)
            const limit = effectiveAdviserLimit(state, playerId, withCardId)
            const atLimit = played && held >= limit
            if (atLimit && !options.discardedAdviserCardId) {
                return `already at the adviser limit of ${limit}; one must be discarded first`
            }
            if (options.discardedAdviserCardId) {
                if (!atLimit) {
                    return 'cannot discard an adviser without being at the limit'
                }
                const displaced = player.knownAdviser(options.discardedAdviserCardId)
                if (!displaced) {
                    return `${options.discardedAdviserCardId} is not one of your advisers`
                }
                if (
                    displaced.faceUp &&
                    isLockedFor(state, playerId, options.discardedAdviserCardId)
                ) {
                    return `${options.discardedAdviserCardId} is locked and cannot be discarded`
                }
            }
            return undefined
        }

        case SearchPlay.RevealedVision: {
            if (kind !== CardKind.Vision) {
                return `${cardId} is not a Vision`
            }
            if (cardId === CONSPIRACY_ID) {
                return 'the Conspiracy is not played to the Revealed Vision space (R-5.1.4.IV)'
            }
            if (player.status !== PlayerStatus.Exile) {
                return `a ${player.status} cannot play a Vision faceup`
            }
            // R-7.1.4-H1, R-9.2 — Vow of Obedience's "cannot play Visions faceup".
            if (cannotPlayVisionsFaceup(state, playerId)) {
                return 'you cannot play Visions faceup (Vow of Obedience)'
            }
            // R-7.1.4 — Secret Police, Sacred Ground.
            return reasonPersistentForbidsFaceupVision(state, playerId, cardId)
        }

        case SearchPlay.Discard:
            return undefined

        case SearchPlay.Conspiracy:
            return reasonCannotPlayConspiracy(state, playerId, {
                keptCardId: cardId,
                conspiracy: options.conspiracy
            })
    }
}
