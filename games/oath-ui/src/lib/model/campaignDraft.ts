import { assertExists } from '@tabletop/common'
import {
    BattlePlanSide,
    CampaignTargetKind,
    HydratedCampaign,
    campaignTargetOptions,
    reasonCannotDeclareTargets,
    targetsNeedFlip,
    usableBattlePlans,
    warbandsOnBoardOf,
    type BattlePlanUse,
    type CampaignDefender,
    type CampaignParties,
    type CampaignTarget,
    type CardPower,
    type HydratedOathGameState,
    type PowerUseKey
} from '@tabletop/oath'
import { campaignDraftOpens } from './campaignTurn.js'
import { samePowerUse } from './powerUse.js'
import { StagedFlow, type PanelDraft, type StagesCover } from './stagedFlow.svelte.js'
import type { OathGameSession } from './session.svelte.js'

export function sameTarget(a: CampaignTarget, b: CampaignTarget): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

export function sameDefender(a: CampaignDefender, b: CampaignDefender): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

/** R-5.5.3, R-7.5.1 */
export function attackerPlans(state: HydratedOathGameState, playerId: string): CardPower[] {
    return usableBattlePlans(state, playerId, BattlePlanSide.Attacker)
}

function partiesOf(
    state: HydratedOathGameState,
    playerId: string,
    defender: CampaignDefender,
    targets: CampaignTarget[]
): CampaignParties {
    return HydratedCampaign.partiesFor(state, playerId, { defender, targets })
}

export function reasonCampaignTargetsInvalid(
    state: HydratedOathGameState,
    playerId: string,
    defender: CampaignDefender,
    targets: CampaignTarget[]
): string | undefined {
    return reasonCannotDeclareTargets(state, partiesOf(state, playerId, defender, targets))
}

export function toggledTargets(
    targets: readonly CampaignTarget[],
    target: CampaignTarget
): CampaignTarget[] {
    return targets.some((t) => sameTarget(t, target))
        ? targets.filter((t) => !sameTarget(t, target))
        : [...targets, target]
}

/** R-5.5.2 constrains the set as a whole, so a candidate is offered when the set with it is legal. */
export function canToggleTarget(
    state: HydratedOathGameState,
    playerId: string,
    defender: CampaignDefender,
    targets: readonly CampaignTarget[],
    target: CampaignTarget
): boolean {
    const next = toggledTargets(targets, target)
    return (
        next.length === 0 ||
        reasonCampaignTargetsInvalid(state, playerId, defender, next) === undefined
    )
}

/** R-11.13 — targeting The Hidden Place costs a flipped secret. */
export function campaignNeedsFlip(
    state: HydratedOathGameState,
    playerId: string,
    defender: CampaignDefender,
    targets: CampaignTarget[]
): boolean {
    return targetsNeedFlip(state, partiesOf(state, playerId, defender, targets))
}

type CampaignValueByStage = {
    defender: CampaignDefender
    plans: PowerUseKey[]
    targets: CampaignTarget[]
    dice: number
}

const CAMPAIGN_STAGE_ORDER = ['defender', 'plans', 'targets', 'dice'] as const
const _campaignStagesAreCovered: StagesCover<CampaignValueByStage, typeof CAMPAIGN_STAGE_ORDER> =
    true
void _campaignStagesAreCovered

export type CampaignDeclaration = {
    defender: CampaignDefender
    targets: CampaignTarget[]
    attackDice: number
    plans: BattlePlanUse[]
    flipSecret: boolean
}

/** R-5.5.1 to R-5.5.3 — the attacker's declaration, staged: defender, battle plans, targets, attack dice. */
export class CampaignDraft implements PanelDraft {
    private flow = new StagedFlow<CampaignValueByStage>(CAMPAIGN_STAGE_ORDER)

    constructor(private readonly session: OathGameSession) {}

    private get playerId(): string | undefined {
        const playerId = this.session.liveSeatId
        return playerId !== undefined &&
            campaignDraftOpens(this.session.selection.action, this.session.validActionTypes)
            ? playerId
            : undefined
    }

    get open(): boolean {
        return this.playerId !== undefined
    }

    // Sneak Attack — the card names the defender, so it is never a pick.
    get defenderFixed(): boolean {
        return this.open && this.flow.sourceOf('defender') === 'auto'
    }

    /** What the rules leave no choice over is taken for the player when the Campaign is chosen. */
    begin(): void {
        const named = this.session.sneakAttackDefenderId
        if (named !== undefined)
            this.flow.autoSelect('defender', { kind: 'player', playerId: named })
        this.autoSelectDice()
    }

    get supplyCost(): number {
        const playerId = this.playerId
        return playerId ? HydratedCampaign.supplyCostFor(this.session.gameState, playerId) : 0
    }

    get defenderOptions(): CampaignDefender[] {
        const playerId = this.playerId
        return playerId ? HydratedCampaign.legalDefenders(this.session.gameState, playerId) : []
    }

    get defender(): CampaignDefender | undefined {
        const chosen = this.flow.value('defender')
        return chosen !== undefined && this.defenderOptions.some((d) => sameDefender(d, chosen))
            ? chosen
            : undefined
    }

    chooseDefender(defender: CampaignDefender): void {
        if (this.defenderFixed || !this.defenderOptions.some((d) => sameDefender(d, defender))) {
            return
        }
        this.flow.set('defender', defender)
        this.autoSelectDice()
    }

    get planOptions(): CardPower[] {
        const playerId = this.playerId
        return playerId && this.defender ? attackerPlans(this.session.gameState, playerId) : []
    }

    get plans(): BattlePlanUse[] {
        const options = this.planOptions
        return (this.flow.value('plans') ?? []).filter((use) =>
            options.some((p) => samePowerUse(p, use))
        )
    }

    isPlanDeclared(use: PowerUseKey): boolean {
        return this.plans.some((p) => samePowerUse(p, use))
    }

    // A plan change keeps the targets it still allows and drops the rest (Relic Hunter's relics).
    declarePlan(use: PowerUseKey, on: boolean): void {
        const offered = this.planOptions.some((p) => samePowerUse(p, use))
        if (!offered) return
        const rest = this.plans.filter((p) => !samePowerUse(p, use))
        const plans = on ? [...rest, use] : rest
        const defender = this.defender
        const kept = defender
            ? this.targets.filter((target) =>
                  campaignTargetOptions(this.session.gameState, defender, plans, this.targets).some(
                      (o) => sameTarget(o, target)
                  )
              )
            : []
        this.keepingDice(() => {
            this.flow.set('plans', plans)
            if (kept.length > 0) this.flow.set('targets', kept)
        })
    }

    get targetOptions(): CampaignTarget[] {
        const defender = this.defender
        if (!defender) return []
        return campaignTargetOptions(
            this.session.gameState,
            defender,
            this.plans,
            this.flow.value('targets') ?? []
        )
    }

    get targets(): CampaignTarget[] {
        const options = this.targetOptions
        return (this.flow.value('targets') ?? []).filter((t) =>
            options.some((o) => sameTarget(o, t))
        )
    }

    hasTarget(target: CampaignTarget): boolean {
        return this.targets.some((t) => sameTarget(t, target))
    }

    canToggleTarget(target: CampaignTarget): boolean {
        const defender = this.defender
        assertExists(defender, 'A target is offered only once the defender is chosen')
        const playerId = this.playerId
        assertExists(playerId, 'A defender is chosen only from the live seat')
        return canToggleTarget(this.session.gameState, playerId, defender, this.targets, target)
    }

    toggleTarget(target: CampaignTarget): void {
        if (!this.hasTarget(target) && !this.canToggleTarget(target)) return
        this.keepingDice(() => this.flow.set('targets', toggledTargets(this.targets, target)))
    }

    get targetableSites(): string[] {
        return this.targetOptions.flatMap((target) =>
            target.kind === CampaignTargetKind.Site ? [target.siteId] : []
        )
    }

    isTargetedSite(siteId: string): boolean {
        return this.hasTarget({ kind: CampaignTargetKind.Site, siteId })
    }

    // R-5.5.2 — one attack die per warband on your board.
    get maxDice(): number {
        const playerId = this.playerId
        return playerId ? warbandsOnBoardOf(this.session.gameState, playerId) : 0
    }

    get attackDice(): number | undefined {
        const chosen = this.flow.value('dice')
        return chosen === undefined ? undefined : this.clampDice(chosen)
    }

    setAttackDice(count: number): void {
        if (!this.defender) return
        this.flow.set('dice', this.clampDice(count))
    }

    get blockedBecause(): string | undefined {
        const playerId = this.playerId
        const defender = this.defender
        const targets = this.targets
        if (!playerId || !defender || targets.length === 0) return undefined
        return reasonCampaignTargetsInvalid(this.session.gameState, playerId, defender, targets)
    }

    get declarable(): boolean {
        return (
            this.defender !== undefined &&
            this.targets.length > 0 &&
            this.attackDice !== undefined &&
            this.blockedBecause === undefined
        )
    }

    async declare(): Promise<void> {
        const playerId = this.playerId
        const defender = this.defender
        const attackDice = this.attackDice
        if (!playerId || !defender || attackDice === undefined || !this.declarable) return
        const targets = this.targets
        await this.session.declareCampaign({
            defender,
            targets,
            attackDice,
            plans: this.plans,
            flipSecret: campaignNeedsFlip(this.session.gameState, playerId, defender, targets)
        })
    }

    hasManualSelection(): boolean {
        return this.flow.hasManualSelection()
    }

    // Back takes one target or one plan at a time, the last one chosen first.
    back(): boolean {
        const top = this.flow.highestManualStage()
        if (top === 'targets' && this.targets.length > 1) {
            this.flow.set('targets', this.targets.slice(0, -1))
            return true
        }
        if (top === 'plans' && this.plans.length > 1) {
            this.flow.set('plans', this.plans.slice(0, -1))
            return true
        }
        return this.flow.back() !== undefined
    }

    reset(): void {
        this.flow.reset()
    }

    // One possible pool is taken for the player; any other waits for their tap.
    private autoSelectDice(): void {
        if (this.defender !== undefined && this.maxDice <= 1) {
            this.flow.autoSelect('dice', this.maxDice)
        }
    }

    private clampDice(count: number): number {
        return Math.max(Math.min(1, this.maxDice), Math.min(count, this.maxDice))
    }

    // The dice do not depend on the plans or the targets, so a change to those keeps them.
    private keepingDice(change: () => void): void {
        const dice = this.flow.value('dice')
        const source = this.flow.sourceOf('dice')
        change()
        if (dice !== undefined && source !== undefined) this.flow.set('dice', dice, source)
    }
}
