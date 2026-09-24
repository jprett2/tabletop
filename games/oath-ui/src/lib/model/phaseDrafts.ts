import {
    ActionType,
    Banner,
    bannerHolder,
    ConsentRequestKind,
    HydratedCompleteRest,
    HydratedOfferCitizenship,
    HydratedResolveCitizenshipOffer,
    HydratedResolveWake,
    HydratedUseActionPower,
    HydratedUseRestPower,
    MachineState,
    PlayerStatus,
    PowerChoiceKind,
    availableImperialWarbands,
    availablePeoplesFavorOptions,
    availableSitePowerTakes,
    banksWithLeastFavor,
    canUseSitePower,
    citizenshipRecolorGroups,
    endDieIsRolled,
    forceTotal,
    powerKey,
    requiredFavorSteps,
    usableFavor,
    type CitizenshipTerms,
    type LegalPowerUse,
    type OpportunityTake,
    type PowerChoice,
    type PowerUseKey,
    type Suit,
    type WakeFavorStep,
    type WarbandGroup
} from '@tabletop/oath'
import { assertExists, range } from '@tabletop/common'
import { emptyPicks, powerChoicesFrom, type PowerChoicePicks } from './powerChoices.js'
import { samePowerUse } from './powerUse.js'
import { StagedFlow, type PanelDraft, type StagesCover } from './stagedFlow.svelte.js'
import type { OathGameSession } from './session.svelte.js'

/** The panel drafts with one step: Back clears the draft, and the derived default returns. */
abstract class OneStepDraft<V> implements PanelDraft {
    private flow = new StagedFlow<{ draft: V }>(['draft'])

    constructor(protected readonly session: OathGameSession) {}

    protected get stored(): V | undefined {
        return this.flow.value('draft')
    }

    protected store(value: V): void {
        this.flow.set('draft', value)
    }

    hasManualSelection(): boolean {
        return this.flow.hasManualSelection()
    }

    back(): boolean {
        return this.flow.back() !== undefined
    }

    reset(): void {
        this.flow.reset()
    }
}

export type FavorStepKind = 'place' | 'return'
type WakeChoices = { kinds?: FavorStepKind[]; suits?: (Suit | undefined)[]; take?: OpportunityTake }

/** R-4.1.1 to R-4.1.4 — the People's Favor steps and the site power's take, before the Wake resolves. */
export class WakeDraft extends OneStepDraft<WakeChoices> {
    private get playerId(): string | undefined {
        return this.session.gameState.machineState === MachineState.WakePhase
            ? this.session.liveTurnSeatId
            : undefined
    }

    // R-4.1.1 is mandatory for the holder alone; `requiredFavorSteps` counts the steps the
    // holder is able to take (R-9.2.a) without asking who holds it.
    get holdsPeoplesFavor() {
        return (
            this.playerId !== undefined &&
            bannerHolder(this.session.gameState, Banner.PeoplesFavor) === this.playerId
        )
    }

    get stepCount() {
        return this.holdsPeoplesFavor && this.playerId
            ? requiredFavorSteps(this.session.gameState, this.playerId)
            : 0
    }

    get options() {
        return this.playerId
            ? availablePeoplesFavorOptions(this.session.gameState, this.playerId)
            : []
    }

    get leastBanks() {
        return this.playerId ? banksWithLeastFavor(this.session.gameState) : []
    }

    // R-4.1.4-H1 — the engine knows what the site prints and what is on it.
    get sitePowerTakes() {
        return this.playerId ? availableSitePowerTakes(this.session.gameState, this.playerId) : []
    }

    // One option, or one bank tied for least, is not a choice.
    get kinds(): FavorStepKind[] {
        return range(0, this.stepCount).map((index) => {
            const kind = this.stored?.kinds?.[index]
            if (kind !== undefined && this.options.includes(kind)) return kind
            return this.options.length === 1 ? this.options[0] : 'place'
        })
    }

    get suits(): (Suit | undefined)[] {
        return range(0, this.stepCount).map((index) => {
            const suit = this.stored?.suits?.[index]
            if (suit !== undefined && this.leastBanks.includes(suit)) return suit
            return this.leastBanks.length === 1 ? this.leastBanks[0] : undefined
        })
    }

    get sitePowerTake(): OpportunityTake | undefined {
        const take = this.stored?.take
        return take !== undefined && this.sitePowerTakes.includes(take) ? take : undefined
    }

    get favorSteps(): WakeFavorStep[] | undefined {
        const steps: WakeFavorStep[] = []
        for (const [index, kind] of this.kinds.entries()) {
            if (kind === 'place') {
                steps.push({ kind: 'place' })
                continue
            }
            const toSuit = this.suits[index]
            if (toSuit === undefined) return undefined
            steps.push({ kind: 'return', toSuit })
        }
        return steps
    }

    setKind(index: number, kind: FavorStepKind): void {
        if (index >= this.stepCount || !this.options.includes(kind)) return
        this.store({ ...this.stored, kinds: this.kinds.with(index, kind), suits: this.suits })
    }

    setSuit(index: number, suit: Suit): void {
        if (index >= this.stepCount || !this.leastBanks.includes(suit)) return
        this.store({ ...this.stored, kinds: this.kinds, suits: this.suits.with(index, suit) })
    }

    setSitePowerTake(take: OpportunityTake | undefined): void {
        this.store({ ...this.stored, take })
    }

    get sitePowerOffered(): boolean {
        return this.playerId !== undefined && canUseSitePower(this.session.gameState, this.playerId)
    }

    get blockedBecause(): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'The Wake is resolved from a seat')
        const favorSteps = this.favorSteps
        if (!favorSteps) return 'Choose which bank the favor returns to.'
        return HydratedResolveWake.reasonCannotResolveWake(
            this.session.gameState,
            playerId,
            favorSteps,
            this.sitePowerTake
        )
    }

    async resolve(): Promise<void> {
        const steps = this.favorSteps
        if (!this.playerId || !steps) return
        await this.session.resolveWake(steps, this.sitePowerTake)
    }
}

/** R-4.3.5, R-7.3.4 — the favor bank each Rest power's gain comes from. */
export class RestDraft extends OneStepDraft<Record<string, Suit>> {
    private get playerId(): string | undefined {
        return this.session.gameState.machineState === MachineState.RestPhase
            ? this.session.liveTurnSeatId
            : undefined
    }

    get powers() {
        return this.playerId
            ? HydratedUseRestPower.legalRestPowers(this.session.gameState, this.playerId)
            : []
    }

    bankOptions(power: LegalPowerUse): Suit[] {
        const bank = power.choices.find((c) => c.spec.kind === PowerChoiceKind.FavorBank)
        return (bank?.options ?? []).flatMap((option) =>
            option.kind === PowerChoiceKind.FavorBank ? [option.suit] : []
        )
    }

    pickedSuit(power: LegalPowerUse): Suit | undefined {
        const options = this.bankOptions(power)
        const chosen = this.stored?.[powerKey(power.cardId, power.powerIndex)]
        return chosen !== undefined && options.includes(chosen) ? chosen : options[0]
    }

    choicesFor(power: LegalPowerUse): PowerChoice[] {
        const suit = this.pickedSuit(power)
        return suit === undefined ? [] : [{ kind: PowerChoiceKind.FavorBank, suit }]
    }

    pickBank(power: LegalPowerUse, suit: Suit): void {
        if (!this.bankOptions(power).includes(suit)) return
        this.store({ ...this.stored, [powerKey(power.cardId, power.powerIndex)]: suit })
    }

    reasonCannotUse(power: LegalPowerUse): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'A Rest power is used from a seat')
        if (power.choices.some((c) => c.spec.kind !== PowerChoiceKind.FavorBank))
            return 'this power asks a choice this panel does not offer'
        return HydratedUseRestPower.reasonCannotUse(
            this.session.gameState,
            playerId,
            power.cardId,
            power.powerIndex,
            this.choicesFor(power)
        )
    }

    // R-3.3 — the last turn of the round, from round 5, while the Empire holds the title.
    get rollsEndDie(): boolean {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'The Rest Phase is shown to a seat')
        const state = this.session.gameState
        return HydratedCompleteRest.isLastTurnOfRound(state, playerId) && endDieIsRolled(state)
    }

    get completeBlockedBecause(): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'The Rest Phase is completed from a seat')
        return HydratedCompleteRest.reasonCannotCompleteRest(this.session.gameState, playerId)
    }

    async use(power: LegalPowerUse): Promise<void> {
        if (!this.playerId) return
        await this.session.useRestPower(power.cardId, power.powerIndex, this.choicesFor(power))
    }
}

/** R-6.2, R-7.3.2 — the choices each "Action:" power's text opens. */
export class ActionPowersDraft extends OneStepDraft<Record<string, PowerChoicePicks>> {
    private get playerId(): string | undefined {
        return this.session.selection.action === ActionType.UseActionPower
            ? this.session.liveTurnSeatId
            : undefined
    }

    get powers() {
        return this.playerId
            ? HydratedUseActionPower.legalActionPowers(this.session.gameState, this.playerId)
            : []
    }

    picksOf(use: PowerUseKey): PowerChoicePicks {
        return this.stored?.[powerKey(use.cardId, use.powerIndex)] ?? emptyPicks()
    }

    setPicks(use: PowerUseKey, picks: PowerChoicePicks): void {
        if (!this.powers.some((p) => samePowerUse(p, use))) {
            return
        }
        this.store({ ...this.stored, [powerKey(use.cardId, use.powerIndex)]: picks })
    }

    choicesFor(power: LegalPowerUse): PowerChoice[] {
        return powerChoicesFrom(power.choices, this.picksOf(power))
    }

    reasonCannotUse(power: LegalPowerUse): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'An Action power is used from a seat')
        return HydratedUseActionPower.reasonCannotUse(
            this.session.gameState,
            playerId,
            power.cardId,
            power.powerIndex,
            this.choicesFor(power)
        )
    }

    async use(power: LegalPowerUse): Promise<void> {
        if (!this.playerId) return
        await this.session.useActionPower(power.cardId, power.powerIndex, this.choicesFor(power))
    }
}

type OfferTerms = {
    givenFavor: number
    givenSecrets: number
    askedFavor: number
    askedSecrets: number
}
type CitizenshipValueByStage = { exile: string; reliquarySlot: string; terms: OfferTerms }

const CITIZENSHIP_STAGE_ORDER = ['exile', 'reliquarySlot', 'terms'] as const
const _citizenshipStagesAreCovered: StagesCover<
    CitizenshipValueByStage,
    typeof CITIZENSHIP_STAGE_ORDER
> = true
void _citizenshipStagesAreCovered

type SideHoldings = { favor: number; secrets: number }

const NO_TERMS: OfferTerms = { givenFavor: 0, givenSecrets: 0, askedFavor: 0, askedSecrets: 0 }

/** R-6.6.1, R-9.6 — an offer of Citizenship: the Exile, the relic space, then the terms. */
export class CitizenshipDraft implements PanelDraft {
    private flow = new StagedFlow<CitizenshipValueByStage>(CITIZENSHIP_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        return this.session.selection.action === ActionType.OfferCitizenship
            ? this.session.liveTurnSeatId
            : undefined
    }

    // R-6.6.1 — "any Exile (including yourself)".
    get exiles() {
        return this.playerId
            ? this.session.gameState.players
                  .filter((p) => p.status === PlayerStatus.Exile)
                  .map((p) => p.playerId)
            : []
    }

    // R-2.3 — the spaces still holding a relic.
    get spaces() {
        return this.playerId ? this.session.gameState.reliquarySlots() : []
    }

    get exilePlayerId(): string | undefined {
        const playerId = this.flow.value('exile')
        return playerId !== undefined && this.exiles.includes(playerId) ? playerId : undefined
    }

    get reliquarySlotId(): string | undefined {
        const slotId = this.flow.value('reliquarySlot')
        return this.exilePlayerId &&
            slotId !== undefined &&
            this.spaces.some((s) => s.slotId === slotId)
            ? slotId
            : undefined
    }

    get offerTerms() {
        return this.reliquarySlotId ? (this.flow.value('terms') ?? NO_TERMS) : NO_TERMS
    }

    // Omitted rather than sent as empty transfers: the schema makes `terms` optional.
    get terms(): CitizenshipTerms | undefined {
        const { givenFavor, givenSecrets, askedFavor, askedSecrets } = this.offerTerms
        const from = givenFavor > 0 || givenSecrets > 0
        const to = askedFavor > 0 || askedSecrets > 0
        if (!from && !to) return undefined
        return {
            fromScepterHolder: from
                ? { favor: givenFavor || undefined, secrets: givenSecrets || undefined }
                : undefined,
            fromExile: to
                ? { favor: askedFavor || undefined, secrets: askedSecrets || undefined }
                : undefined
        }
    }

    get holdings(): { offerer: SideHoldings; exile: SideHoldings } {
        const exilePlayerId = this.exilePlayerId
        assertExists(exilePlayerId, 'The terms are set once the Exile is chosen')
        return { offerer: this.holdingsOf(this.offererId), exile: this.holdingsOf(exilePlayerId) }
    }

    private get offererId(): string {
        const playerId = this.playerId
        assertExists(playerId, 'An Exile is chosen only from the live seat')
        return playerId
    }

    private holdingsOf(playerId: string): SideHoldings {
        const state = this.session.gameState
        return {
            favor: usableFavor(state, playerId),
            secrets: state.getPlayerState(playerId).secrets
        }
    }

    get blockedBecause(): string | undefined {
        const exilePlayerId = this.exilePlayerId
        const reliquarySlotId = this.reliquarySlotId
        if (!exilePlayerId || !reliquarySlotId) return 'Choose an Exile and a relic.'
        const playerId = this.offererId
        return HydratedOfferCitizenship.reasonCannotOffer(this.session.gameState, playerId, {
            exilePlayerId,
            reliquarySlotId,
            terms: this.terms
        })
    }

    chooseExile(playerId: string): void {
        if (this.exiles.includes(playerId)) this.flow.set('exile', playerId)
    }

    chooseReliquarySlot(slotId: string): void {
        if (this.exilePlayerId && this.spaces.some((s) => s.slotId === slotId)) {
            this.flow.set('reliquarySlot', slotId)
        }
    }

    setTerm(term: keyof OfferTerms, amount: number): void {
        if (this.reliquarySlotId) {
            this.flow.set('terms', { ...this.offerTerms, [term]: Math.max(0, amount) })
        }
    }

    async offer(): Promise<void> {
        const exilePlayerId = this.exilePlayerId
        const reliquarySlotId = this.reliquarySlotId
        if (this.blockedBecause || !exilePlayerId || !reliquarySlotId) return
        await this.session.offerCitizenship(exilePlayerId, reliquarySlotId, this.terms)
    }

    hasManualSelection(): boolean {
        return this.flow.hasManualSelection()
    }

    back(): boolean {
        return this.flow.back() !== undefined
    }

    reset(): void {
        this.flow.reset()
    }
}

/** R-6.6.2, R-9.3 — which warbands take the purple, when the Empire cannot cover them all. */
export class ConsentDraft extends OneStepDraft<number[]> {
    private get playerId(): string | undefined {
        const pending = this.session.gameState.pendingConsent
        const playerId = this.session.liveSeatId
        return pending?.request.kind === ConsentRequestKind.CitizenshipOffer &&
            playerId !== undefined &&
            pending.askedPlayerId === playerId
            ? playerId
            : undefined
    }

    get groups(): WarbandGroup[] {
        return this.playerId ? citizenshipRecolorGroups(this.session.gameState, this.playerId) : []
    }

    get purpleAvailable() {
        return availableImperialWarbands(this.session.gameState)
    }

    get mustChoose() {
        return this.playerId !== undefined && this.purpleAvailable < forceTotal(this.groups)
    }

    // The default fills the groups in order until the purple runs out.
    get picked(): number[] {
        if (!this.mustChoose) return []
        const stored = this.stored
        if (
            stored?.length === this.groups.length &&
            stored.every((count, index) => count <= this.groups[index].count)
        ) {
            return stored
        }
        let left = this.purpleAvailable
        return this.groups.map((group) => {
            const take = Math.min(group.count, left)
            left -= take
            return take
        })
    }

    get pickedTotal() {
        return this.picked.reduce((n, c) => n + c, 0)
    }

    get recolorChoice(): WarbandGroup[] | undefined {
        if (!this.mustChoose) return undefined
        return this.groups
            .map((group, index) => ({ ...group, count: this.picked[index] ?? 0 }))
            .filter((group) => group.count > 0)
    }

    setPicked(index: number, count: number): void {
        const group = this.groups[index]
        if (!this.mustChoose || !group) return
        this.store(this.picked.with(index, Math.max(0, Math.min(count, group.count))))
    }

    get blockedBecause(): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'A Citizenship offer is answered from a seat')
        return HydratedResolveCitizenshipOffer.reasonCannotResolve(
            this.session.gameState,
            playerId,
            { granted: true, recolorChoice: this.recolorChoice }
        )
    }

    async answer(granted: boolean): Promise<void> {
        if (!this.playerId) return
        await this.session.answerCitizenshipOffer(granted, granted ? this.recolorChoice : undefined)
    }
}
