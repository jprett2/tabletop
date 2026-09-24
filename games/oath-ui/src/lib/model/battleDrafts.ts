import { assertExists, type Color } from '@tabletop/common'
import {
    CampaignTargetKind,
    HydratedCampaignDefeatKills,
    HydratedCampaignDefend,
    HydratedCampaignResolveVictory,
    MachineState,
    countOf,
    powerKey,
    warbandEntries,
    type BattlePlanUse,
    type CampaignPlacement,
    type PowerUseKey,
    type WarbandCounts,
    type WarbandGroup
} from '@tabletop/oath'
import { powerUseKey, samePowerUse } from './powerUse.js'
import { StagedFlow, type PanelDraft, type StagesCover } from './stagedFlow.svelte.js'
import type { OathGameSession } from './session.svelte.js'

type Spoils = { placeCounts: Record<string, number>; bottomSlots: string[] }
type VictoryValueByStage = { spoils: Spoils }

const VICTORY_STAGE_ORDER = ['spoils'] as const
const _victoryStagesAreCovered: StagesCover<VictoryValueByStage, typeof VICTORY_STAGE_ORDER> = true
void _victoryStagesAreCovered

/** R-5.5.7 — the attacker's spoils: warbands onto the sites taken, and Relic Hunter's bottomed relics. */
export class VictoryDraft implements PanelDraft {
    private flow = new StagedFlow<VictoryValueByStage>(VICTORY_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        const campaign = this.session.gameState.campaign
        const playerId = this.session.liveSeatId
        return this.session.gameState.machineState === MachineState.CampaignVictory &&
            playerId !== undefined &&
            campaign?.attackerPlayerId === playerId
            ? playerId
            : undefined
    }

    private get spoils(): Spoils {
        return this.flow.value('spoils') ?? { placeCounts: {}, bottomSlots: [] }
    }

    private get targets() {
        return this.playerId ? (this.session.gameState.campaign?.targets ?? []) : []
    }

    get capturedSites() {
        return this.targets.flatMap((target) =>
            target.kind === CampaignTargetKind.Site ? [target.siteId] : []
        )
    }

    // R-10.9, R-5.5.7.I — "from your force", so the board is the ceiling.
    get forceColor(): Color | undefined {
        return warbandEntries(this.forceBoard).find(([, count]) => count > 0)?.[0]
    }

    get forceAvailable() {
        return this.forceColor ? countOf(this.forceBoard, this.forceColor) : 0
    }

    private get forceBoard(): WarbandCounts {
        const playerId = this.playerId
        return playerId ? this.session.gameState.getPlayerState(playerId).warbandsOnBoard : {}
    }

    get placeCounts(): Record<string, number> {
        return Object.fromEntries(
            this.capturedSites.map((siteId) => [siteId, this.spoils.placeCounts[siteId] ?? 0])
        )
    }

    get placedTotal() {
        return Object.values(this.placeCounts).reduce((sum, n) => sum + n, 0)
    }

    get placements(): CampaignPlacement[] {
        const color = this.forceColor
        if (!color) return []
        return this.capturedSites
            .map((siteId) => ({ siteId, color, count: this.placeCounts[siteId] ?? 0 }))
            .filter((placement) => placement.count > 0)
    }

    get relicTargets() {
        return this.targets.flatMap((t) =>
            t.kind === CampaignTargetKind.SiteRelic ? [t.slotId] : []
        )
    }

    get bottomSlots() {
        return this.spoils.bottomSlots.filter((slotId) => this.relicTargets.includes(slotId))
    }

    ceilingAt(siteId: string): number {
        const others = this.placedTotal - (this.placeCounts[siteId] ?? 0)
        return Math.max(0, this.forceAvailable - others)
    }

    setPlaceCount(siteId: string, count: number): void {
        if (!this.capturedSites.includes(siteId)) return
        const placeCounts = {
            ...this.placeCounts,
            [siteId]: Math.max(0, Math.min(count, this.ceilingAt(siteId)))
        }
        this.flow.set('spoils', { placeCounts, bottomSlots: this.bottomSlots })
    }

    setBottom(slotId: string, bottom: boolean): void {
        if (!this.relicTargets.includes(slotId)) return
        const rest = this.bottomSlots.filter((s) => s !== slotId)
        const bottomSlots = bottom ? [...rest, slotId] : rest
        this.flow.set('spoils', { placeCounts: this.placeCounts, bottomSlots })
    }

    get blockedBecause(): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'The spoils are taken from a seat')
        return HydratedCampaignResolveVictory.reasonCannotResolveVictory(
            this.session.gameState,
            playerId,
            { placements: this.placements, burnFavor: false }
        )
    }

    // R-5.5.7.III — banishing and burning exist only against a real player's pawn and favor.
    get mayBurnFavor(): boolean {
        const campaign = this.session.gameState.campaign
        return (
            campaign?.defenderPlayerId !== undefined &&
            campaign.targets.some((target) => target.kind === CampaignTargetKind.PawnAndFavor)
        )
    }

    get burnAmount(): number {
        return HydratedCampaignResolveVictory.favorToBurn(this.session.gameState)
    }

    async takeSpoils(burnFavor: boolean): Promise<void> {
        if (!this.playerId) return
        await this.session.resolveCampaignVictory(this.placements, burnFavor, this.bottomSlots)
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

type DefenceValueByStage = { plans: string[] }

const DEFENCE_STAGE_ORDER = ['plans'] as const
const _defenceStagesAreCovered: StagesCover<DefenceValueByStage, typeof DEFENCE_STAGE_ORDER> = true
void _defenceStagesAreCovered

/** R-5.5.3, R-7.5.2 — the battle plans the answering defender or ally declares. */
export class DefenceDraft implements PanelDraft {
    private flow = new StagedFlow<DefenceValueByStage>(DEFENCE_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        const playerId = this.session.liveSeatId
        return playerId !== undefined &&
            HydratedCampaignDefend.answeringPlayerId(this.session.gameState) === playerId
            ? playerId
            : undefined
    }

    get usable() {
        return this.playerId
            ? HydratedCampaignDefend.usablePlans(this.session.gameState, this.playerId)
            : []
    }

    get plans(): BattlePlanUse[] {
        const chosen = this.flow.value('plans') ?? []
        return this.usable
            .filter((power) => chosen.includes(powerKey(power.cardId, power.powerIndex)))
            .map(powerUseKey)
    }

    isDeclared(use: PowerUseKey): boolean {
        return this.plans.some((p) => samePowerUse(p, use))
    }

    setPlan(use: PowerUseKey, on: boolean): void {
        if (!this.usable.some((p) => samePowerUse(p, use))) return
        const key = powerKey(use.cardId, use.powerIndex)
        const rest = this.plans
            .map((p) => powerKey(p.cardId, p.powerIndex))
            .filter((k) => k !== key)
        this.flow.set('plans', on ? [...rest, key] : rest)
    }

    get answeringPlayerId(): string | undefined {
        return HydratedCampaignDefend.answeringPlayerId(this.session.gameState)
    }

    get blockedBecause(): string | undefined {
        const playerId = this.session.myPlayer?.id
        assertExists(playerId, 'Battle plans are declared from a seat')
        return HydratedCampaignDefend.reasonCannotDefend(
            this.session.gameState,
            playerId,
            this.plans
        )
    }

    async answer(): Promise<void> {
        if (!this.playerId) return
        await this.session.defendCampaign(this.plans)
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

type DefeatValueByStage = { kills: number[] }

const DEFEAT_STAGE_ORDER = ['kills'] as const
const _defeatStagesAreCovered: StagesCover<DefeatValueByStage, typeof DEFEAT_STAGE_ORDER> = true
void _defeatStagesAreCovered

/** R-5.5.6.a — the defeated defending side's own pick of which of its warbands die. */
export class DefeatDraft implements PanelDraft {
    private flow = new StagedFlow<DefeatValueByStage>(DEFEAT_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        const playerId = this.session.liveSeatId
        return playerId !== undefined &&
            HydratedCampaignDefeatKills.chooserId(this.session.gameState) === playerId
            ? playerId
            : undefined
    }

    get groups(): WarbandGroup[] {
        return this.playerId ? (this.session.gameState.campaign?.defendingForce ?? []) : []
    }

    get required(): number {
        return this.playerId ? HydratedCampaignDefeatKills.required(this.session.gameState) : 0
    }

    get picked(): number[] {
        const stored = this.flow.value('kills') ?? []
        return this.groups.map((group, index) => Math.min(stored[index] ?? 0, group.count))
    }

    get pickedTotal(): number {
        return this.picked.reduce((sum, count) => sum + count, 0)
    }

    get kills(): WarbandGroup[] {
        return this.groups
            .map((group, index) => ({ ...group, count: this.picked[index] ?? 0 }))
            .filter((group) => group.count > 0)
    }

    get blockedBecause(): string | undefined {
        const playerId = this.playerId
        if (!playerId) return undefined
        return HydratedCampaignDefeatKills.reasonCannotChoose(
            this.session.gameState,
            playerId,
            this.kills
        )
    }

    setPicked(index: number, count: number): void {
        const group = this.groups[index]
        if (!group) return
        this.flow.set('kills', this.picked.with(index, Math.max(0, Math.min(count, group.count))))
    }

    async choose(): Promise<void> {
        if (!this.playerId) return
        await this.session.chooseDefeatKills(this.kills)
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
