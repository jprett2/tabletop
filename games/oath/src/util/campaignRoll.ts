import { assertExists, type Color } from '@tabletop/common'
import { HydratedOathGameState } from '../model/gameState.js'
import type { PileDeposit } from '../model/hidden.js'
import {
    type CampaignState,
    type RolledAttackFace,
    type RolledDefenseFace,
    type WarbandLocation
} from '../model/campaign.js'
import {
    attackFromFaces,
    defenseShieldsFromFaces,
    rollAttackDice,
    rollDefenseDice
} from '../data/dice.js'
import { persistentsInPlay } from './persistent.js'
import { askQuestion } from './questions.js'
import { PowerQuestionKind } from '../model/question.js'
import { collectDefendingBandits, collectDefendingForce, type CampaignParties } from './campaign.js'
import {
    addWarbandsToSite,
    forceTotal,
    killWarbands,
    removeWarbandsFrom,
    warbandsOnBoardOf,
    boardColorsOwnFirst
} from './force.js'
import { rulesSite, warbandsAt } from './rule.js'
import { discardEachFromPlay, isInPlay } from './discard.js'
import { BANDITS_PLAN_USER, plansUsedBy, sideOf, type ActiveBattlePlan } from './battlePlans.js'
import type { PlayerPlanContext } from '../powers/registry.js'
import { countOf } from './warbands.js'

/** R-5.5.4, R-5.5.5 — rolled from the protected stream inside an action's `apply`. */

export function partiesOf(campaign: CampaignState): CampaignParties {
    return {
        attackerPlayerId: campaign.attackerPlayerId,
        defenderPlayerId: campaign.defenderPlayerId,
        allyPlayerIds: campaign.allyPlayerIds,
        nonImperialPlayerIds: campaign.nonImperialPlayerIds,
        targets: campaign.targets
    }
}

export function rollCampaign(
    state: HydratedOathGameState,
    campaign: CampaignState,
    skullKillOrder?: readonly Color[]
): number {
    const parties = partiesOf(campaign)

    // R-5.5.4 — the doubling faces multiply the shields only, never the warbands.
    const rules = campaign.rollRules
    const defendingForce = collectDefendingForce(state, parties)
    const defendingBandits = collectDefendingBandits(state, parties)
    campaign.defendingForce = defendingForce
    campaign.defendingBandits = defendingBandits
    // Hearts and Minds, Peace Envoy — "you're victorious now": no dice, no skulls.
    if (campaign.decidedVictor) {
        campaign.defenseRoll = []
        campaign.attackRoll = []
        campaign.defense = 0
        campaign.swords = 0
        return 0
    }
    const prng = state.getProtectedPrng()
    applyDefenseRoll(campaign, rollDefenseDice(prng, campaign.defensePool))

    // R-5.5.5 — the skulls kill before the sacrifice, which is a separate action.
    // Mounted Patrol
    if (rules.halveAttackPool) campaign.attackPool = Math.floor(campaign.attackPool / 2)
    const skulls = applyAttackRoll(campaign, rollAttackDice(prng, campaign.attackPool))
    // Jinx — the skulls' kills wait on the answer, since a reroll replaces the roll.
    const jinxed = askRerolls(state, campaign)
    if (jinxed) {
        campaign.pendingSkullKills = { skulls, order: [...(skullKillOrder ?? [])] }
        return 0
    }
    const killed = campaign.ignoreSkulls
        ? 0
        : killForSkulls(state, campaign, skulls, skullKillOrder)
    // Zealots — judged with the skulls' kills already taken.
    if (rules.zealots) {
        const mine = warbandsOnBoardOf(state, campaign.attackerPlayerId)
        campaign.sacrificeWorth = forceTotal(defendingForce) > mine ? 3 : 1
    }
    return killed
}

/** R-5.5.4 */
export function applyDefenseRoll(campaign: CampaignState, defenseRoll: RolledDefenseFace[]): void {
    const rules = campaign.rollRules
    campaign.defenseRoll = defenseRoll
    // Rain Boots, War Tortoise — an ignored face stays on record as rolled.
    const countedDefense = defenseRoll.map((face) =>
        (rules.ignoreSingleShields && face.shields === 1 && !face.doubling) ||
        (rules.ignoreTwoShieldFaces && face.shields === 2)
            ? { shields: 0, doubling: false }
            : face
    )
    campaign.defense =
        defenseShieldsFromFaces(countedDefense) +
        forceTotal(campaign.defendingForce) +
        campaign.defendingBandits
}

/** R-5.5.5 — returns the skulls. */
export function applyAttackRoll(campaign: CampaignState, attackRoll: RolledAttackFace[]): number {
    const rules = campaign.rollRules
    // Rusting Ray, War Tortoise — an ignored face's skulls always still kill.
    const countedAttack = attackRoll.map((face) => ({
        swords: rules.ignoreTwoSwordFaces && face.skulls > 0 ? 0 : face.swords,
        hollowSwords: rules.ignoreHollowSwords ? 0 : face.hollowSwords,
        skulls: face.skulls
    }))
    const { swords, skulls } = attackFromFaces(countedAttack)
    campaign.attackRoll = attackRoll
    // Lancers — "double your total attack roll".
    campaign.swords = rules.doubleAttackRoll ? swords * 2 : swords
    return skulls
}

/** Jinx */
function askRerolls(state: HydratedOathGameState, campaign: CampaignState): boolean {
    let asked = false
    const rollers: Array<{ playerId: string | undefined; side: 'attack' | 'defense' }> = [
        { playerId: campaign.attackerPlayerId, side: 'attack' },
        { playerId: campaign.defenderPlayerId, side: 'defense' }
    ]
    for (const { playerId, side } of rollers) {
        if (!playerId) continue
        for (const { ctx, hooks } of persistentsInPlay(state)) {
            if (!hooks.offersReroll?.(ctx, playerId)) continue
            const note = askQuestion(state, campaign.attackerPlayerId, {
                kind: PowerQuestionKind.RerollDice,
                cardId: ctx.cardId,
                askedPlayerId: playerId,
                powerIndex: ctx.power.powerIndex,
                side
            })
            if (!note) asked = true
        }
    }
    return asked
}

/** Jinx */
export function settleSkullKills(state: HydratedOathGameState): void {
    const campaign = state.campaign
    if (!campaign?.pendingSkullKills) return
    const { order } = campaign.pendingSkullKills
    const skulls = campaign.attackRoll.reduce((n, face) => n + face.skulls, 0)
    campaign.pendingSkullKills = undefined
    if (!campaign.ignoreSkulls) killForSkulls(state, campaign, skulls, order)
}

/** R-5.5.5 */
function killForSkulls(
    state: HydratedOathGameState,
    campaign: CampaignState,
    skulls: number,
    skullKillOrder: readonly Color[] = []
): number {
    if (skulls <= 0) return 0
    return killFromAttackingForce(state, campaign, skulls, skullKillOrder)
}

/** R-5.5.5, R-10.22 — the board first, then the sites the force reaches; declared colours before the rest. */
export function killFromAttackingForce(
    state: HydratedOathGameState,
    campaign: CampaignState,
    count: number,
    declaredOrder: readonly Color[] = []
): number {
    const attackerId = campaign.attackerPlayerId
    const board = state.getPlayerState(attackerId).warbandsOnBoard
    const order = [
        ...declaredOrder,
        ...boardColorsOwnFirst(state, attackerId).filter((color) => !declaredOrder.includes(color))
    ]

    let remaining = count
    for (const color of order) {
        if (remaining === 0) break
        const killed = Math.min(countOf(board, color), remaining)
        if (killed > 0) {
            killOrRedirect(state, campaign, { kind: 'board', playerId: attackerId }, color, killed)
            remaining -= killed
        }
    }
    // Wild Allies, Captains, Vow of Union
    for (const siteId of campaign.forceSiteIds) {
        if (remaining === 0) break
        const onSite = warbandsAt(state, siteId)
        for (const color of order) {
            if (remaining === 0) break
            const killed = Math.min(countOf(onSite, color), remaining)
            if (killed > 0) {
                killOrRedirect(state, campaign, { kind: 'site', siteId }, color, killed)
                remaining -= killed
            }
        }
    }
    return count - remaining
}

/** R-10.13, unless Hospital places them on its site. */
export function killOrRedirect(
    state: HydratedOathGameState,
    campaign: CampaignState,
    at: WarbandLocation,
    color: Color,
    count: number
): void {
    if (count <= 0) return
    const owner = at.kind === 'board' ? at.playerId : state.warbandOwnerOf(color)
    const redirect = campaign.killRedirects.find((r) => r.playerId === owner)
    if (redirect && rulesSite(state, owner, redirect.siteId)) {
        removeWarbandsFrom(state, at, color, count)
        addWarbandsToSite(state, redirect.siteId, color, count)
        return
    }
    removeWarbandsFrom(state, at, color, count)
    killWarbands(state, color, count)
}

export function usedPlanContext(
    state: HydratedOathGameState,
    campaign: CampaignState,
    playerId: string,
    plan: ActiveBattlePlan
): PlayerPlanContext {
    return {
        state,
        playerId,
        power: plan.power,
        choices: [],
        campaign: {
            parties: partiesOf(campaign),
            side: sideOf(campaign, playerId),
            pools: { attackPool: campaign.attackPool, defensePool: campaign.defensePool }
        }
    }
}

/** Wild Mounts */
function askToSpareEndDiscards(state: HydratedOathGameState, campaign: CampaignState): string[] {
    const spared: string[] = []
    for (const [playerId, used] of Object.entries(campaign.plansUsedBy)) {
        if (playerId === BANDITS_PLAN_USER) continue
        const mine = campaign.discardAtEnd.filter(
            (cardId) => used.includes(cardId) && isInPlay(state, cardId)
        )
        for (const plan of plansUsedBy(state, campaign, playerId)) {
            const offer = plan.hooks.sparesEndDiscards?.(
                usedPlanContext(state, campaign, playerId, plan),
                mine.filter((cardId) => !spared.includes(cardId))
            )
            if (!offer) continue
            const refused = askQuestion(state, campaign.attackerPlayerId, {
                kind: PowerQuestionKind.DiscardInstead,
                cardId: plan.power.cardId,
                askedPlayerId: playerId,
                planCardIds: offer.planCardIds,
                insteadCardIds: offer.insteadCardIds,
                actingPlayerId: campaign.attackerPlayerId
            })
            if (!refused) spared.push(...offer.planCardIds)
        }
    }
    return spared
}

/** R-5.5.8, R-9.4 — each plan is discarded from its own region. */
export function endCampaign(state: HydratedOathGameState): PileDeposit[] {
    const campaign = state.campaign
    assertExists(campaign, 'only a Campaign in progress can end')
    const spared = askToSpareEndDiscards(state, campaign)
    const going = campaign.discardAtEnd.filter((cardId) => !spared.includes(cardId))
    const deposits = discardEachFromPlay(state, campaign.attackerPlayerId, going)
    state.campaign = undefined
    return deposits
}
