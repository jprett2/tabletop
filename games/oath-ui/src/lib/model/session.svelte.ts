import { GameSession } from '@tabletop/frontend-components'
import { assert, assertExists, type GameAction } from '@tabletop/common'
import {
    ActionType,
    AnswerConsent,
    AnswerQuestion,
    Campaign,
    CampaignDefeatKills,
    CampaignDefend,
    CampaignResolveVictory,
    CampaignSacrifice,
    CampaignTargetKind,
    CompleteRest,
    ConsentRequestKind,
    EndActPhase,
    ExileCitizen,
    HydratedAnswerConsent,
    HydratedCampaign,
    HydratedCampaignSacrifice,
    HydratedResolveOathkeeper,
    HydratedResolveWake,
    HydratedExileCitizen,
    HydratedMuster,
    HydratedPeek,
    HydratedPlayFacedownAdviser,
    HydratedSearch,
    HydratedTrade,
    HydratedTravel,
    MachineState,
    MoveWarbands,
    Muster,
    OfferCitizenship,
    Peek,
    PeekTargetKind,
    PlayFacedownAdviser,
    Recover,
    RecoverTargetKind,
    ResolveCitizenshipOffer,
    ResolveOathkeeper,
    ResolveWake,
    Search,
    SearchPlay,
    SearchResolve,
    SelfExile,
    SetupChoice,
    Suit,
    Trade,
    TradeOption,
    Travel,
    UseActionPower,
    UseRestPower,
    Banner,
    defaultTolls,
    owesSecondWindFirst,
    sneakAttackOfferedTo,
    type BattlePlanUse,
    type CampaignPlacement,
    type CitizenshipTerms,
    type HydratedOathGameState,
    type OathProjectedState,
    type PendingConsent,
    type OpportunityTake,
    type PeekTarget,
    type PowerChoice,
    type QuestionAnswer,
    type SearchResolveChoice,
    type SearchSource,
    type WakeFavorStep,
    type WarbandGroup,
    type WarbandMoveOption
} from '@tabletop/oath'
import { OathSelection } from './oathSelection.svelte.js'
import { SearchDraft } from './searchDraft.js'
import { QuestionDraft } from './questionDraft.js'
import { DefeatDraft, DefenceDraft, VictoryDraft } from './battleDrafts.js'
import {
    ActionPowersDraft,
    CitizenshipDraft,
    ConsentDraft,
    RestDraft,
    WakeDraft
} from './phaseDrafts.js'
import type { PanelDraft } from './stagedFlow.svelte.js'
import { SeatDetail } from './seatDetail.svelte.js'
import { peekedRelicAt } from './relicKnowledge.js'
import { adviserPlacements, type AdviserPlacement } from './adviserPlacements.js'
import { CampaignDraft, type CampaignDeclaration } from './campaignDraft.js'
import {
    peekSlots,
    recoverableBanners,
    recoverableRelicSlots,
    tradeOptions,
    travelCost,
    travelTerms,
    type BannerBid,
    type SiteOffer
} from './actionOffers.js'
import { tollLabel } from './offerText.js'
import { SetupDraft } from './setupDraft.js'
import { ModifierDeclarations } from './modifierDeclarations.js'
import { WarbandMoveDraft } from './warbandMoveDraft.js'

export class OathGameSession extends GameSession<OathProjectedState, HydratedOathGameState> {
    selection = new OathSelection()
    readonly search = new SearchDraft(this)
    readonly question = new QuestionDraft(this)
    readonly victory = new VictoryDraft(this)
    readonly defence = new DefenceDraft(this)
    readonly defeat = new DefeatDraft(this)
    readonly wake = new WakeDraft(this)
    readonly rest = new RestDraft(this)
    readonly actionPowers = new ActionPowersDraft(this)
    readonly citizenship = new CitizenshipDraft(this)
    readonly consent = new ConsentDraft(this)
    readonly seatDetail = new SeatDetail(this)

    readonly campaign = new CampaignDraft(this)
    readonly setup = new SetupDraft(this)
    readonly modifiers = new ModifierDeclarations(this)
    readonly warbandMoves = new WarbandMoveDraft(this)

    // docs/ui-interaction-visual-contract.md — every draft reads as empty while a send or a new state is under way.
    get liveSeatId(): string | undefined {
        const settled = !this.processingActions && !this.updatingVisibleState
        return this.isPlayable && !this.isViewingHistory && settled ? this.myPlayer?.id : undefined
    }

    get liveTurnSeatId(): string | undefined {
        return this.isMyTurn ? this.liveSeatId : undefined
    }

    // At most one panel is on screen, so at most one of these holds picks.
    private get panelDrafts(): PanelDraft[] {
        return [
            this.search,
            this.question,
            this.victory,
            this.defence,
            this.defeat,
            this.wake,
            this.rest,
            this.actionPowers,
            this.citizenship,
            this.consent,
            this.campaign
        ]
    }

    get hasManualDraft(): boolean {
        return (
            this.selection.hasManualSelection() ||
            this.panelDrafts.some((draft) => draft.hasManualSelection())
        )
    }

    resetAction(): void {
        this.selection.reset()
        this.clearActionDrafts()
        for (const draft of this.panelDrafts) draft.reset()
    }

    override beforeNewState(): void {
        this.resetAction()
    }

    // Back unwinds manual picks only: an auto pick stays when nothing manual is left.
    back(): void {
        if (this.busy) return
        if (this.panelDrafts.some((draft) => draft.back())) return
        const action = this.selection.action
        if (this.selection.back() === undefined) return
        if (this.selection.action !== action) this.clearActionDrafts()
    }

    override async undo(): Promise<void> {
        if (this.busy) return
        if (this.hasManualDraft) {
            this.back()
            return
        }
        await super.undo()
    }

    private clearActionDrafts(): void {
        this.actionPowers.reset()
        this.citizenship.reset()
        this.campaign.reset()
    }

    async resolveSetup(
        siteId: string,
        adviserCardId: string,
        discardOrder: string[]
    ): Promise<void> {
        await this.commit(
            this.createPlayerAction(SetupChoice, {
                type: ActionType.SetupChoice,
                siteId,
                adviserCardId,
                discardOrder
            })
        )
    }

    async resolveWake(favorSteps: WakeFavorStep[], sitePowerTake?: OpportunityTake): Promise<void> {
        await this.commit(
            this.createPlayerAction(ResolveWake, {
                type: ActionType.ResolveWake,
                favorSteps,
                ...(sitePowerTake ? { sitePowerTake } : {})
            })
        )
    }

    async endActPhase(): Promise<void> {
        await this.commit(this.createPlayerAction(EndActPhase, { type: ActionType.EndActPhase }))
    }

    async completeRest(): Promise<void> {
        await this.commit(this.createPlayerAction(CompleteRest, { type: ActionType.CompleteRest }))
    }

    async useRestPower(cardId: string, powerIndex: number, choices: PowerChoice[]): Promise<void> {
        await this.commit(
            this.createPlayerAction(UseRestPower, {
                type: ActionType.UseRestPower,
                cardId,
                powerIndex,
                choices
            })
        )
    }

    // R-X.1 — a Wake with nothing to decide is resolved by the engine.
    get wakeNeedsDecision(): boolean {
        const playerId = this.myPlayer?.id
        return (
            this.gameState.machineState === MachineState.WakePhase &&
            playerId !== undefined &&
            !HydratedResolveWake.nothingToDecide(this.gameState, playerId)
        )
    }

    // R-10.2-H1 — Second Wind's free action is owed before a waiting Sneak Attack.
    get owesSecondWindFirst(): boolean {
        const playerId = this.myPlayer?.id
        return playerId !== undefined && owesSecondWindFirst(this.gameState, playerId)
    }

    reasonCannotChooseOathkeeper(candidateId: string): string | undefined {
        const playerId = this.myPlayer?.id
        assertExists(playerId, 'The Oathkeeper title is passed on from a seat')
        return HydratedResolveOathkeeper.reasonCannotResolveOathkeeper(
            this.gameState,
            playerId,
            candidateId
        )
    }

    async resolveOathkeeper(chosenPlayerId: string): Promise<void> {
        await this.commit(
            this.createPlayerAction(ResolveOathkeeper, {
                type: ActionType.ResolveOathkeeper,
                chosenPlayerId
            })
        )
    }

    async answerCitizenshipOffer(granted: boolean, recolorChoice?: WarbandGroup[]): Promise<void> {
        await this.commit(
            this.createPlayerAction(ResolveCitizenshipOffer, {
                type: ActionType.ResolveCitizenshipOffer,
                granted,
                ...(recolorChoice ? { recolorChoice } : {})
            })
        )
    }

    /** R-6.5.a, R-6.5.b, R-5.5.2.a — the request this seat is asked to answer, if any. */
    get consentAsked(): PendingConsent | undefined {
        const pending = this.gameState.pendingConsent
        return pending !== undefined &&
            pending.request.kind !== ConsentRequestKind.CitizenshipOffer &&
            pending.askedPlayerId === this.liveSeatId
            ? pending
            : undefined
    }

    get consentGrantBlockedBecause(): string | undefined {
        const playerId = this.liveSeatId
        if (!playerId || !this.consentAsked) return undefined
        return HydratedAnswerConsent.reasonCannotAnswer(this.gameState, playerId, true)
    }

    async answerConsent(granted: boolean): Promise<void> {
        await this.commit(
            this.createPlayerAction(AnswerConsent, { type: ActionType.AnswerConsent, granted })
        )
    }

    async answerQuestion(answer: QuestionAnswer): Promise<void> {
        await this.commit(
            this.createPlayerAction(AnswerQuestion, { type: ActionType.AnswerQuestion, answer })
        )
    }

    // Sneak Attack — the defender is the one the card names.
    get sneakAttackDefenderId(): string | undefined {
        const playerId = this.liveSeatId
        if (!playerId) return undefined
        return sneakAttackOfferedTo(this.gameState, playerId)?.defenderPlayerId
    }

    startSneakAttack(): void {
        if (this.sneakAttackDefenderId === undefined) return
        this.chooseAction(ActionType.Campaign)
    }

    // R-5.5.1 — nothing right after Knights Errant or Hunting Party, or as a Sneak Attack.
    get campaignSupplyCost(): number | undefined {
        const playerId = this.myPlayer?.id
        return playerId ? HydratedCampaign.supplyCostFor(this.gameState, playerId) : undefined
    }

    // R-5.5.5.b, R-5.5.5.c — the exact winning sacrifice, or zero.
    get sacrificeNeeded(): number {
        const campaign = this.gameState.campaign
        return campaign ? HydratedCampaignSacrifice.sacrificeNeeded(campaign) : 0
    }

    reasonCannotSacrifice(sacrifice: number): string | undefined {
        const playerId = this.myPlayer?.id
        assertExists(playerId, 'A sacrifice is decided from a seat')
        return HydratedCampaignSacrifice.reasonCannotResolve(this.gameState, playerId, {
            sacrifice,
            defeatKills: HydratedCampaignSacrifice.attackerDefeatKills(this.gameState, sacrifice)
        })
    }

    async declareCampaign(declaration: CampaignDeclaration): Promise<void> {
        const { defender, targets, attackDice, plans, flipSecret } = declaration
        await this.commit(
            this.createPlayerAction(Campaign, {
                type: ActionType.Campaign,
                defender,
                targets,
                attackDice,
                ...(plans.length > 0 ? { plans } : {}),
                ...(flipSecret ? { flipSecret: true } : {})
            })
        )
    }

    async defendCampaign(plans: BattlePlanUse[]): Promise<void> {
        await this.commit(
            this.createPlayerAction(CampaignDefend, { type: ActionType.CampaignDefend, plans })
        )
    }

    // R-5.5.6 — the attacker's own losses when defeated; the defending side picks its own.
    async resolveCampaignSacrifice(sacrifice: number): Promise<void> {
        await this.commit(
            this.createPlayerAction(CampaignSacrifice, {
                type: ActionType.CampaignSacrifice,
                sacrifice,
                defeatKills: HydratedCampaignSacrifice.attackerDefeatKills(
                    this.gameState,
                    sacrifice
                )
            })
        )
    }

    async chooseDefeatKills(kills: WarbandGroup[]): Promise<void> {
        await this.commit(
            this.createPlayerAction(CampaignDefeatKills, {
                type: ActionType.CampaignDefeatKills,
                kills
            })
        )
    }

    async resolveCampaignVictory(
        placements: CampaignPlacement[],
        burnFavor: boolean,
        bottomRelicSlotIds: string[]
    ): Promise<void> {
        await this.commit(
            this.createPlayerAction(CampaignResolveVictory, {
                type: ActionType.CampaignResolveVictory,
                placements,
                burnFavor,
                ...(bottomRelicSlotIds.length > 0 ? { bottomRelicSlotIds } : {})
            })
        )
    }

    private get legalAdvisers(): string[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        if (this.selection.action !== ActionType.PlayFacedownAdviser) return []
        return HydratedPlayFacedownAdviser.legalCards(this.gameState, playerId)
    }

    // R-6.1 — the adviser tapped on the seat card, or the only legal one.
    get adviserCardId(): string | undefined {
        const legal = this.legalAdvisers
        const manual =
            this.selection.action === ActionType.PlayFacedownAdviser
                ? this.selection.value('card')
                : undefined
        if (manual !== undefined && legal.includes(manual)) return manual
        return legal.length === 1 ? legal[0] : undefined
    }

    get selectableAdvisers(): string[] {
        return this.adviserCardId === undefined ? this.legalAdvisers : []
    }

    get facedownAdviserOptions(): { cardId: string; placements: AdviserPlacement[] }[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        return this.legalAdvisers.map((cardId) => ({
            cardId,
            placements: adviserPlacements(this.gameState, playerId, cardId)
        }))
    }

    get peekTargets(): PeekTarget[] {
        const playerId = this.liveTurnSeatId
        if (!playerId || this.selection.action !== ActionType.Peek) return []
        return HydratedPeek.legalTargets(this.gameState, playerId)
    }

    get exileTargets(): string[] {
        const playerId = this.liveTurnSeatId
        if (!playerId || this.selection.action !== ActionType.ExileCitizen) return []
        return HydratedExileCitizen.legalTargets(this.gameState, playerId)
    }

    chooseAdviser(cardId: string): void {
        if (this.selectableAdvisers.includes(cardId)) this.selection.set('card', cardId)
    }

    async playFacedownAdviser(cardId: string, play: SearchPlay): Promise<void> {
        await this.commit(
            this.createPlayerAction(PlayFacedownAdviser, {
                type: ActionType.PlayFacedownAdviser,
                cardId,
                play
            })
        )
    }

    async useActionPower(
        cardId: string,
        powerIndex: number,
        choices: PowerChoice[]
    ): Promise<void> {
        await this.commit(
            this.createPlayerAction(UseActionPower, {
                type: ActionType.UseActionPower,
                cardId,
                powerIndex,
                choices
            })
        )
    }

    async exileCitizen(citizenPlayerId: string): Promise<void> {
        await this.commit(
            this.createPlayerAction(ExileCitizen, {
                type: ActionType.ExileCitizen,
                citizenPlayerId
            })
        )
    }

    async selfExile(): Promise<void> {
        await this.commit(this.createPlayerAction(SelfExile, { type: ActionType.SelfExile }))
    }

    async offerCitizenship(
        exilePlayerId: string,
        reliquarySlotId: string,
        terms: CitizenshipTerms | undefined
    ): Promise<void> {
        await this.commit(
            this.createPlayerAction(OfferCitizenship, {
                type: ActionType.OfferCitizenship,
                exilePlayerId,
                reliquarySlotId,
                ...(terms ? { terms } : {})
            })
        )
    }

    async moveWarbands(option: WarbandMoveOption, count: number): Promise<void> {
        await this.commit(
            this.createPlayerAction(MoveWarbands, {
                type: ActionType.MoveWarbands,
                move: option.move,
                color: option.color,
                count
            })
        )
    }

    // R-6.3, R-6.4 — a Peek, by tapping the relic where it sits.
    async choosePeek(target: PeekTarget): Promise<void> {
        if (this.selection.action !== ActionType.Peek) return
        await this.commit(this.createPlayerAction(Peek, { type: ActionType.Peek, target }))
    }

    get selectableSites(): string[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        const pick = this.setup.boardPick
        if (pick) return pick.sites
        if (this.selection.action === ActionType.Campaign) return this.campaign.targetableSites
        if (this.selection.action === ActionType.MoveWarbands) {
            const siteId = this.gameState.getPlayerState(playerId).siteId
            return this.warbandMoves.boardToSite && siteId ? [siteId] : []
        }
        if (this.selection.action !== ActionType.Travel) return []
        if (this.selection.value('site') !== undefined) return []
        return HydratedTravel.legalDestinations(this.gameState, playerId)
    }

    get siteOffers(): SiteOffer[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        const sites = this.selectableSites
        const pick = this.setup.boardPick
        if (pick) return sites.map((slotId) => ({ slotId, intent: 'start', label: pick.label }))
        switch (this.selection.action) {
            case ActionType.Campaign:
                return sites.map((slotId) => ({
                    slotId,
                    intent: 'target',
                    targeted: this.campaign.isTargetedSite(slotId)
                }))
            case ActionType.MoveWarbands:
                return sites.map((slotId) => ({ slotId, intent: 'moveWarbands' }))
            case ActionType.Travel:
                return sites.map((slotId) => ({
                    slotId,
                    intent: 'travel',
                    cost: travelCost(this.gameState, playerId, slotId),
                    toll: tollLabel(
                        this.gameState,
                        playerId,
                        { kind: 'travel', toSiteId: slotId },
                        (id) => this.getPlayerName(id)
                    )
                }))
            default:
                return []
        }
    }

    get mapDimmed(): boolean {
        return this.siteOffers.some((offer) => offer.intent !== 'moveWarbands')
    }

    // R-5.3.2 — Trade's legality is per option, so a card is offered if either is legal.
    get selectableCards(): string[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        if (this.selection.value('card') !== undefined) return []
        if (this.selection.action === ActionType.Muster) {
            return HydratedMuster.legalCards(this.gameState, playerId)
        }
        if (this.selection.action === ActionType.Trade) {
            return HydratedTrade.legalCards(this.gameState, playerId, this.modifiers.declared)
        }
        return []
    }

    tradeOptionsFor(cardId: string): TradeOption[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        return tradeOptions(this.gameState, playerId, cardId, this.modifiers.declared)
    }

    // R-5.4, R-6.3 — relic slots, never card ids: a facedown relic's identity
    // is in the vault.
    get selectableRelicSlots(): string[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        if (this.selection.value('relicSlot') !== undefined) return []
        if (this.selection.action === ActionType.Peek) {
            return peekSlots(this.peekTargets, PeekTargetKind.SiteRelic)
        }
        if (this.selection.action !== ActionType.Recover) return []
        return recoverableRelicSlots(this.gameState, playerId, this.modifiers.declared)
    }

    get selectableReliquarySlots(): string[] {
        return peekSlots(this.peekTargets, PeekTargetKind.Reliquary)
    }

    get recoverableBanners(): BannerBid[] {
        const playerId = this.liveTurnSeatId
        if (!playerId || this.selection.action !== ActionType.Recover) return []
        return recoverableBanners(this.gameState, playerId, this.modifiers.declared)
    }

    /** The bid a Recover would pay for this banner, while it is one the seat may take. */
    bannerBid(banner: Banner): number | undefined {
        return this.recoverableBanners.find((bid) => bid.banner === banner)?.amount
    }

    get searchSources(): SearchSource[] {
        const playerId = this.liveTurnSeatId
        if (!playerId) return []
        if (this.selection.action !== ActionType.Search) return []
        return HydratedSearch.legalSources(this.gameState, playerId)
    }

    knownRelicAt(slotId: string | undefined): string | undefined {
        return peekedRelicAt(this.gameState, this.myPlayer?.id, slotId)
    }

    chooseAction(type: ActionType): void {
        if (this.selection.action !== type) this.clearActionDrafts()
        this.selection.set('action', type)
        if (type === ActionType.Campaign) this.campaign.begin()
    }

    async chooseSite(siteId: string): Promise<void> {
        if (this.setup.boardPick) {
            this.setup.chooseSite(siteId)
            return
        }
        if (this.selection.action === ActionType.MoveWarbands) {
            const option = this.warbandMoves.boardToSite
            if (option && siteId === this.myPlayerState?.siteId)
                await this.warbandMoves.choose(option)
            return
        }
        if (this.selection.action === ActionType.Campaign) {
            this.campaign.toggleTarget({ kind: CampaignTargetKind.Site, siteId })
            return
        }
        this.selection.set('site', siteId)
        if (this.selection.action === ActionType.Travel) await this.travel(siteId)
    }

    async chooseCard(cardId: string): Promise<void> {
        this.selection.set('card', cardId)
        if (this.selection.action === ActionType.Muster) {
            await this.muster(cardId)
            return
        }
        if (this.selection.action === ActionType.Trade) {
            const options = this.tradeOptionsFor(cardId)
            if (options.length === 1) {
                this.selection.autoSelect('option', options[0])
                await this.trade(cardId, options[0])
            }
        }
    }

    async chooseRelicSlot(slotId: string): Promise<void> {
        if (this.selection.action === ActionType.Peek) {
            await this.choosePeek({ kind: PeekTargetKind.SiteRelic, slotId })
            return
        }
        this.selection.set('relicSlot', slotId)
        await this.commit(
            this.createPlayerAction(Recover, {
                type: ActionType.Recover,
                target: { kind: RecoverTargetKind.Relic, slotId },
                modifiers: this.modifiers.declared
            })
        )
    }

    // R-5.4.4 — the redistribution starts from Discord; the direction is board geometry.
    async chooseBanner(banner: Banner, amount: number): Promise<void> {
        this.selection.set('banner', banner)
        this.selection.set('amount', amount)
        await this.commit(
            this.createPlayerAction(Recover, {
                type: ActionType.Recover,
                target: { kind: RecoverTargetKind.Banner, banner },
                amountPaid: amount,
                redistributeFrom: Suit.Discord,
                modifiers: this.modifiers.declared
            })
        )
    }

    async chooseSearchSource(source: SearchSource): Promise<void> {
        const playerId = this.liveTurnSeatId
        assertExists(playerId, 'A Search source is offered only to the live seat')
        this.selection.set('option', source)
        const tolls = defaultTolls(this.gameState, playerId, { kind: 'search' })
        await this.commit(
            this.createPlayerAction(Search, {
                type: ActionType.Search,
                drawFrom: source,
                revealsInfo: true,
                modifiers: this.modifiers.declared,
                ...(tolls.length > 0 ? { tolls } : {})
            })
        )
    }

    async chooseTradeOption(option: TradeOption): Promise<void> {
        const cardId = this.selection.value('card')
        assertExists(cardId, 'A Trade option is offered once its card is chosen')
        this.selection.set('option', option)
        await this.trade(cardId, option)
    }

    async resolveSearch(resolution: SearchResolveChoice): Promise<void> {
        await this.commit(
            this.createPlayerAction(SearchResolve, {
                type: ActionType.SearchResolve,
                ...resolution
            })
        )
    }

    private async travel(siteId: string): Promise<void> {
        const playerId = this.liveTurnSeatId
        assertExists(playerId, 'A destination is offered only to the live seat')
        const { tolls, flipSecret } = travelTerms(
            this.gameState,
            playerId,
            siteId,
            this.modifiers.declared
        )
        await this.commit(
            this.createPlayerAction(Travel, {
                type: ActionType.Travel,
                siteId,
                modifiers: this.modifiers.declared,
                ...(tolls.length > 0 ? { tolls } : {}),
                ...(flipSecret ? { flipSecret } : {})
            })
        )
    }

    private async muster(cardId: string): Promise<void> {
        await this.commit(
            this.createPlayerAction(Muster, {
                type: ActionType.Muster,
                cardId,
                modifiers: this.modifiers.declared
            })
        )
    }

    private async trade(cardId: string, option: TradeOption): Promise<void> {
        const playerId = this.liveTurnSeatId
        assertExists(playerId, 'A Trade is offered only to the live seat')
        const tolls = defaultTolls(this.gameState, playerId, { kind: 'trade', cardId })
        await this.commit(
            this.createPlayerAction(Trade, {
                type: ActionType.Trade,
                cardId,
                option,
                modifiers: this.modifiers.declared,
                ...(tolls.length > 0 ? { tolls } : {})
            })
        )
    }

    // Sending ends the flow whatever the outcome: a rejected action must leave
    // the player where they were, not mid-flow against a moved board.
    private async commit(action: GameAction): Promise<void> {
        assert(!this.isViewingHistory, 'An action is sent from the live game, never from history')
        try {
            await this.applyAction(action)
        } finally {
            this.resetAction()
        }
    }
}
