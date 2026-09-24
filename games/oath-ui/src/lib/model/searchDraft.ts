import { assert, assertExists } from '@tabletop/common'
import {
    MachineState,
    SearchPlay,
    carriedModifiers,
    categoryAt,
    reasonCannotPlayCard,
    type SearchSecondPlay
} from '@tabletop/oath'
import { PLAY_LABELS, teaches } from './adviserPlacements.js'
import { discardOrderOf, isDiscardOrderComplete } from './discardOrder.js'
import { cardName } from './names.js'
import { StagedFlow, type PanelDraft, type StagesCover } from './stagedFlow.svelte.js'
import type { OathGameSession } from './session.svelte.js'

export type SearchPlacement = Omit<SearchSecondPlay, 'cardId'>
export type SearchPlacementOption = SearchPlacement & {
    label: string
    blockedBecause: string | undefined
}
export type SecondPlay = SearchSecondPlay & { label: string; key: string }

/** Chosen beside the placement: another site, a Great Slum discard, a Land Warden second play. */
type SearchExtras = { toSiteId?: string; discardFirstCardId?: string; secondKey?: string }

type SearchValueByStage = {
    kept: string
    extras: SearchExtras
    placement: SearchPlacement
    discardOrder: string[]
}

const SEARCH_STAGE_ORDER = ['kept', 'extras', 'placement', 'discardOrder'] as const
const _searchStagesAreCovered: StagesCover<SearchValueByStage, typeof SEARCH_STAGE_ORDER> = true
void _searchStagesAreCovered

const PLACEMENTS: (SearchPlacement & { label: string })[] = [
    { play: SearchPlay.Site, label: PLAY_LABELS[SearchPlay.Site] },
    { play: SearchPlay.Adviser, label: 'Adviser, faceup', faceUp: true },
    { play: SearchPlay.Adviser, label: 'Adviser, facedown', faceUp: false },
    { play: SearchPlay.RevealedVision, label: PLAY_LABELS[SearchPlay.RevealedVision] },
    { play: SearchPlay.Conspiracy, label: PLAY_LABELS[SearchPlay.Conspiracy] },
    { play: SearchPlay.Discard, label: PLAY_LABELS[SearchPlay.Discard] }
]

/** R-5.1.2 to R-5.1.5 — the kept card, how it is played, and the order the rest are discarded in. */
export class SearchDraft implements PanelDraft {
    private flow = new StagedFlow<SearchValueByStage>(SEARCH_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        return this.session.gameState.machineState === MachineState.Searching
            ? this.session.liveTurnSeatId
            : undefined
    }

    private get extras(): SearchExtras {
        return this.flow.value('extras') ?? {}
    }

    // R-5.1.2 draws into the hand, so `handIds` is the set being chosen from.
    get drawn(): string[] {
        const playerId = this.playerId
        if (!playerId) return []
        const hand = this.session.gameState.getPlayerState(playerId).handIds
        assertExists(hand, 'A seat is shown its own hand')
        return hand
    }

    get kept(): string | undefined {
        const cardId = this.flow.value('kept')
        return cardId !== undefined && this.drawn.includes(cardId) ? cardId : undefined
    }

    // R-5.1.4.III and R-7.2.1 are card properties, so the placements change with the kept card;
    // refusals that teach are kept and explained.
    get placements(): SearchPlacementOption[] {
        const cardId = this.kept
        const playerId = this.playerId
        if (!cardId || !playerId) return []
        const options = PLACEMENTS.map((option) => ({
            ...option,
            blockedBecause: reasonCannotPlayCard(
                this.session.gameState,
                playerId,
                cardId,
                option.play,
                { faceUp: option.faceUp }
            )
        })).filter((option) => option.blockedBecause === undefined || teaches(option.play))
        assert(
            options.some((option) => option.blockedBecause === undefined),
            'R-5.1.4 — a kept card can always be discarded'
        )
        return options
    }

    get placement(): SearchPlacement | undefined {
        const chosen = this.flow.value('placement')
        return chosen !== undefined &&
            this.placements.some(
                (o) => o.blockedBecause === undefined && this.samePlacement(o, chosen)
            )
            ? chosen
            : undefined
    }

    // Land Warden — a second drawn card played rather than discarded.
    get secondAllowed() {
        return (
            this.playerId !== undefined &&
            carriedModifiers(
                this.session.gameState,
                this.session.gameState.pendingSearchModifiers
            ).some((m) => m.hooks.secondPlay)
        )
    }

    get secondPlays(): SecondPlay[] {
        return this.drawn
            .filter((id) => id !== this.kept)
            .flatMap((cardId) => [
                this.secondPlay(cardId, SearchPlay.Site, `${cardName(cardId)} — to your site`),
                this.secondPlay(
                    cardId,
                    SearchPlay.Adviser,
                    `${cardName(cardId)} — adviser, faceup`,
                    true
                ),
                this.secondPlay(
                    cardId,
                    SearchPlay.Adviser,
                    `${cardName(cardId)} — adviser, facedown`,
                    false
                )
            ])
    }

    get second() {
        return this.secondPlays.find((option) => option.key === this.extras.secondKey)
    }

    get others() {
        return this.drawn.filter((id) => id !== this.kept && id !== this.second?.cardId)
    }

    get tapped(): string[] {
        if (!this.placement) return []
        return (this.flow.value('discardOrder') ?? []).filter((id) => this.others.includes(id))
    }

    get orderComplete() {
        return isDiscardOrderComplete(this.tapped, this.others)
    }

    // R-11.10 — Great Slum: a denizen here to discard before a site play.
    get slumCards(): string[] {
        const here = this.playerId ? this.session.myPlayerState?.siteId : undefined
        if (!here || categoryAt(this.session.gameState, here) !== 'greatSlum') return []
        return this.session.gameState.denizensBySite[here] ?? []
    }

    get discardFirst(): string | undefined {
        const cardId = this.extras.discardFirstCardId
        return cardId !== undefined && this.slumCards.includes(cardId) ? cardId : undefined
    }

    // New Growth — another site to play to, when a carried modifier allows it.
    get otherSites(): string[] {
        const cardId = this.kept
        const playerId = this.playerId
        if (!cardId || !playerId) return []
        const here = this.session.myPlayerState?.siteId
        return this.session.gameState
            .allSiteIds()
            .filter(
                (siteId) =>
                    siteId !== here &&
                    reasonCannotPlayCard(
                        this.session.gameState,
                        playerId,
                        cardId,
                        SearchPlay.Site,
                        { toSiteId: siteId }
                    ) === undefined
            )
    }

    get toSite(): string | undefined {
        const siteId = this.extras.toSiteId
        return siteId !== undefined && this.otherSites.includes(siteId) ? siteId : undefined
    }

    keep(cardId: string): void {
        if (this.drawn.includes(cardId)) this.flow.set('kept', cardId)
    }

    setToSite(siteId: string | undefined): void {
        this.setExtras({ ...this.extras, toSiteId: siteId })
    }

    setDiscardFirst(cardId: string | undefined): void {
        this.setExtras({ ...this.extras, discardFirstCardId: cardId })
    }

    setSecondPlay(key: string | undefined): void {
        this.setExtras({ ...this.extras, secondKey: key })
    }

    async choosePlacement(placement: SearchPlacement): Promise<void> {
        if (!this.kept) return
        this.flow.set('placement', placement)
        if (this.others.length <= 1) await this.resolve()
    }

    async tapDiscard(cardId: string): Promise<void> {
        if (!this.placement || !this.others.includes(cardId) || this.tapped.includes(cardId)) {
            return
        }
        const next = [...this.tapped, cardId]
        this.flow.set('discardOrder', next)
        if (next.length >= this.others.length - 1) await this.resolve()
    }

    hasManualSelection(): boolean {
        return this.flow.hasManualSelection()
    }

    back(): boolean {
        const tapped = this.flow.value('discardOrder') ?? []
        if (tapped.length > 1) {
            this.flow.set('discardOrder', tapped.slice(0, -1))
            return true
        }
        return this.flow.back() !== undefined
    }

    reset(): void {
        this.flow.reset()
    }

    private setExtras(extras: SearchExtras): void {
        if (this.kept) this.flow.set('extras', extras)
    }

    private async resolve(): Promise<void> {
        const kept = this.kept
        const placement = this.placement
        if (!kept || !placement || !this.orderComplete) return
        const siteAt = placement.play === SearchPlay.Site
        const second = this.second
        await this.session.resolveSearch({
            keptCardId: kept,
            discardOrder: discardOrderOf(this.tapped, this.others),
            play: placement.play,
            ...(placement.faceUp === undefined ? {} : { faceUp: placement.faceUp }),
            ...(siteAt && this.discardFirst ? { discardFirstCardId: this.discardFirst } : {}),
            ...(siteAt && this.toSite ? { toSiteId: this.toSite } : {}),
            ...(second
                ? {
                      secondPlay: {
                          cardId: second.cardId,
                          play: second.play,
                          ...(second.faceUp === undefined ? {} : { faceUp: second.faceUp })
                      }
                  }
                : {})
        })
    }

    private secondPlay(
        cardId: string,
        play: SearchPlay,
        label: string,
        faceUp?: boolean
    ): SecondPlay {
        return { cardId, play, faceUp, label, key: `${cardId}|${play}|${faceUp ?? ''}` }
    }

    private samePlacement(a: SearchPlacement, b: SearchPlacement): boolean {
        return a.play === b.play && a.faceUp === b.faceUp
    }
}
