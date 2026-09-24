import { assertExists } from '@tabletop/common'
import { ActionType, MachineState } from '@tabletop/oath'
import { setupSites, type BoardPick } from './actionOffers.js'
import { START_HERE } from './offerText.js'
import type { OathGameSession } from './session.svelte.js'

/**
 * R-1.19 to R-1.23.3 — the pawn's site, the adviser kept, then the order of the discards. The
 * pawn goes first because R-10.5 sends the discards one region along from it; the last tap sends.
 */
export class SetupDraft {
    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        const session = this.session
        return session.gameState.machineState === MachineState.Setup &&
            session.validActionTypes.includes(ActionType.SetupChoice)
            ? session.liveTurnSeatId
            : undefined
    }

    get hand(): string[] {
        const playerId = this.playerId
        if (!playerId) return []
        const hand = this.session.gameState.getPlayerState(playerId).handIds
        assertExists(hand, 'A seat is shown its own hand')
        return hand
    }

    private value<S extends 'site' | 'card' | 'discardOrder'>(stage: S) {
        const selection = this.session.selection
        return selection.action === ActionType.SetupChoice ? selection.value(stage) : undefined
    }

    get sites(): string[] {
        const playerId = this.playerId
        return playerId ? setupSites(this.session.gameState, playerId, this.hand) : []
    }

    get siteId(): string | undefined {
        const sites = this.sites
        const manual = this.value('site')
        if (manual !== undefined && sites.includes(manual)) return manual
        return sites.length === 1 ? sites[0] : undefined
    }

    get adviserCardId(): string | undefined {
        if (this.siteId === undefined) return undefined
        const manual = this.value('card')
        return manual !== undefined && this.hand.includes(manual) ? manual : undefined
    }

    get others(): string[] {
        const adviserCardId = this.adviserCardId
        return adviserCardId === undefined ? [] : this.hand.filter((id) => id !== adviserCardId)
    }

    get tapped(): string[] {
        return this.adviserCardId === undefined ? [] : (this.value('discardOrder') ?? [])
    }

    get boardPick(): BoardPick | undefined {
        const sites = this.sites
        if (sites.length === 0 || this.siteId !== undefined) return undefined
        return { sites, label: START_HERE }
    }

    chooseSite(siteId: string): void {
        if (!this.sites.includes(siteId)) return
        this.session.selection.autoSelect('action', ActionType.SetupChoice)
        this.session.selection.set('site', siteId)
    }

    async chooseAdviser(cardId: string): Promise<void> {
        if (this.siteId === undefined || !this.hand.includes(cardId)) return
        this.session.selection.autoSelect('action', ActionType.SetupChoice)
        this.session.selection.set('card', cardId)
        if (this.others.length <= 1) await this.send(this.others)
    }

    async tapDiscard(cardId: string): Promise<void> {
        const others = this.others
        const tapped = this.tapped
        if (!others.includes(cardId) || tapped.includes(cardId)) return
        const next = [...tapped, cardId]
        this.session.selection.set('discardOrder', next)
        if (next.length >= others.length - 1) {
            await this.send([...next, ...others.filter((id) => !next.includes(id))])
        }
    }

    private async send(discardOrder: string[]): Promise<void> {
        const siteId = this.siteId
        const adviserCardId = this.adviserCardId
        assertExists(siteId, 'The discards are ordered after the site is chosen')
        assertExists(adviserCardId, 'The discards are ordered after the adviser is kept')
        await this.session.resolveSetup(siteId, adviserCardId, discardOrder)
    }
}
