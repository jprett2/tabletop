import { afterEach, describe, expect, it } from 'vitest'
import { ActionSource, Color, createAction } from '@tabletop/common'
import {
    ActionType,
    Banner,
    Campaign,
    CampaignDefend,
    CampaignSacrifice,
    CampaignTargetKind,
    HydratedCampaignSacrifice,
    HydratedOathGameState,
    MachineState,
    PowerTiming,
    cardPowers,
    type CampaignTarget
} from '@tabletop/oath'
import { required, testPlayer, testState, withChancellor } from '@tabletop/oath/testing'
import { canToggleTarget, campaignNeedsFlip, toggledTargets } from './campaignDraft.js'
import {
    disposeSessions,
    openSessionOn,
    played,
    tableOf,
    type PlayedTable
} from '$lib/testing/sessionHarness.js'

const ME = 'me'
const FOE = 'foe'
const HUNTER = 'denizen.order.relic-hunter'
const HUNTER_PLAN = {
    cardId: HUNTER,
    powerIndex: required(
        cardPowers(HUNTER).find((power) => power.timing === PowerTiming.BattlePlan),
        'Relic Hunter’s battle plan'
    ).powerIndex
}
const FOE_DEFENDS = { kind: 'player', playerId: FOE } as const
const SITE_C2: CampaignTarget = { kind: CampaignTargetKind.Site, siteId: 'c2' }
const RELIC_AT_C2: CampaignTarget = { kind: CampaignTargetKind.SiteRelic, slotId: 'c2-r1' }

function board(foeSiteId = 'c1') {
    const state = testState(
        [
            testPlayer({
                playerId: ME,
                color: Color.Red,
                siteId: 'c1',
                warbandsOnBoard: { [Color.Red]: 4 }
            }),
            testPlayer({
                playerId: FOE,
                color: Color.Yellow,
                siteId: foeSiteId,
                relicIds: ['relic.map']
            })
        ],
        {
            warbandsBySite: { c2: { [Color.Yellow]: 2 } },
            relicsBySite: { c2: [{ slotId: 'c2-r1' }] }
        }
    )
    state.banners[Banner.PeoplesFavor].holderPlayerId = FOE
    return state
}

describe('choosing targets', () => {
    it('a tap adds a target, and a second tap on an equal target removes it', () => {
        const once = toggledTargets([], SITE_C2)
        expect(once).toEqual([SITE_C2])
        expect(toggledTargets(once, { kind: CampaignTargetKind.Site, siteId: 'c2' })).toEqual([])
    })

    it('a relic is offered only when the defender stands at the attacker’s site', () => {
        const relic: CampaignTarget = { kind: CampaignTargetKind.Relic, cardId: 'relic.map' }
        const away = board('h1')
        away.warbandsBySite = { ...away.warbandsBySite, c1: { [Color.Yellow]: 1 } }
        expect(canToggleTarget(board('c1'), ME, FOE_DEFENDS, [], relic)).toBe(true)
        expect(canToggleTarget(away, ME, FOE_DEFENDS, [], relic)).toBe(false)
        const siteHere: CampaignTarget = { kind: CampaignTargetKind.Site, siteId: 'c1' }
        expect(canToggleTarget(away, ME, FOE_DEFENDS, [], siteHere)).toBe(true)
    })

    it('targeting The Hidden Place flips a secret (R-11.13)', () => {
        const state = board()
        state.siteCards = { ...state.siteCards, c2: 'site.the-hidden-place' }
        expect(campaignNeedsFlip(state, ME, FOE_DEFENDS, [SITE_C2])).toBe(true)
        expect(campaignNeedsFlip(board(), ME, FOE_DEFENDS, [SITE_C2])).toBe(false)
    })
})

afterEach(disposeSessions)

function campaigning(warbands = 4) {
    const state = board()
    state.players[0].warbandsOnBoard = { [Color.Red]: warbands }
    state.players[0].advisers = [{ cardId: HUNTER, faceUp: true }]
    state.players[0].adviserIds = [HUNTER]
    const session = openSessionOn(tableOf(state))
    session.chooseAction(ActionType.Campaign)
    return session
}

const BANDITS = { kind: 'bandits' } as const
// R-5.5.2 — a Campaign must target something at the attacker's own site first.
const FOES_RELIC: CampaignTarget = { kind: CampaignTargetKind.Relic, cardId: 'relic.map' }

/** The five cases `docs/user-interactions.md` requires of each staged flow, for the Campaign draft. */
describe('the Campaign draft (docs/user-interactions.md)', () => {
    it('choosing the defender clears the plans, targets and dice chosen under the last one', () => {
        const draft = campaigning().campaign
        draft.chooseDefender(FOE_DEFENDS)
        draft.declarePlan(HUNTER_PLAN, true)
        draft.toggleTarget(FOES_RELIC)
        draft.setAttackDice(3)
        expect(draft.targets).toEqual([FOES_RELIC])

        draft.chooseDefender(BANDITS)
        expect(draft.defender).toEqual(BANDITS)
        expect(draft.plans).toEqual([])
        expect(draft.targets).toEqual([])
        expect(draft.attackDice).toBeUndefined()
    })

    it('Back takes the last target, then the plan, then the defender', () => {
        const session = campaigning()
        const draft = session.campaign
        draft.chooseDefender(FOE_DEFENDS)
        draft.declarePlan(HUNTER_PLAN, true)
        draft.toggleTarget(FOES_RELIC)
        draft.toggleTarget(SITE_C2)
        draft.toggleTarget(RELIC_AT_C2)
        expect(draft.targets).toEqual([FOES_RELIC, SITE_C2, RELIC_AT_C2])

        session.back()
        expect(draft.targets).toEqual([FOES_RELIC, SITE_C2])
        session.back()
        session.back()
        expect(draft.targets).toEqual([])
        expect(draft.plans).toEqual([HUNTER_PLAN])
        session.back()
        expect(draft.plans).toEqual([])
        expect(draft.defender).toEqual(FOE_DEFENDS)
        session.back()
        expect(draft.defender).toBeUndefined()
        expect(session.selection.action).toBe(ActionType.Campaign)
    })

    it('a pool of one die is taken for the player and is not a pick Back returns to', () => {
        const session = campaigning(1)
        const draft = session.campaign
        draft.chooseDefender(FOE_DEFENDS)
        expect(draft.attackDice).toBe(1)
        session.back()
        expect(draft.defender).toBeUndefined()
        expect(draft.hasManualSelection()).toBe(false)
    })

    it('a larger pool waits for the player to choose it', () => {
        const draft = campaigning(3).campaign
        draft.chooseDefender(FOE_DEFENDS)
        expect(draft.attackDice).toBeUndefined()
        expect(draft.declarable).toBe(false)
    })

    it('dropping the plan drops the relics it offered and keeps the chosen dice', () => {
        const draft = campaigning().campaign
        draft.chooseDefender(FOE_DEFENDS)
        draft.declarePlan(HUNTER_PLAN, true)
        draft.toggleTarget(FOES_RELIC)
        draft.toggleTarget(SITE_C2)
        draft.toggleTarget(RELIC_AT_C2)
        draft.setAttackDice(2)

        draft.declarePlan(HUNTER_PLAN, false)
        expect(draft.targets).toEqual([FOES_RELIC, SITE_C2])
        expect(draft.attackDice).toBe(2)
    })

    it('leaving the Campaign ends its draft', () => {
        const session = campaigning()
        session.campaign.chooseDefender(FOE_DEFENDS)
        session.chooseAction(ActionType.Travel)
        expect(session.campaign.open).toBe(false)
        session.chooseAction(ActionType.Campaign)
        expect(session.campaign.defender).toBeUndefined()
    })
})

// R-7.1.4-H2 — Sneak Attack's holder is asked as another player's Campaign ends.
function sneakAttackOffered(): PlayedTable {
    const state = testState(
        withChancellor([
            testPlayer({ playerId: ME, color: Color.Red, siteId: 'c1', supply: 6, warbandsOnBoard: { [Color.Red]: 6 } }),
            testPlayer({
                playerId: FOE,
                color: Color.Blue,
                siteId: 'c1',
                warbandsOnBoard: { [Color.Blue]: 4 },
                advisers: [{ cardId: 'denizen.discord.sneak-attack', faceUp: true }]
            })
        ])
    )
    state.turnManager.series = [{ type: 'turn', playerId: ME, start: 0 }]
    const envelope = { gameId: state.gameId, source: ActionSource.User }
    const campaign = played(tableOf(state), [
        createAction(Campaign, {
            ...envelope,
            playerId: ME,
            defender: { kind: 'player', playerId: FOE },
            targets: [{ kind: CampaignTargetKind.PawnAndFavor }],
            attackDice: 0,
            plans: []
        })
    ])
    const defended =
        campaign.state.machineState === MachineState.CampaignPlans
            ? played(campaign, [createAction(CampaignDefend, { ...envelope, playerId: FOE, plans: [] })])
            : campaign
    const defeatKills = HydratedCampaignSacrifice.attackerDefeatKills(new HydratedOathGameState(defended.state), 0)
    return played(defended, [createAction(CampaignSacrifice, { ...envelope, playerId: ME, sacrifice: 0, defeatKills })])
}

describe('the Campaign draft in a Sneak Attack', () => {
    it('the card names the defender, which Back never returns to; Back leaves for the question', () => {
        const session = openSessionOn(sneakAttackOffered())
        expect(session.myPlayer?.id).toBe(FOE)
        session.question.accept()
        const draft = session.campaign
        expect(draft.defender).toEqual({ kind: 'player', playerId: ME })
        expect(draft.defenderFixed).toBe(true)
        expect(draft.hasManualSelection()).toBe(false)

        draft.toggleTarget({ kind: CampaignTargetKind.PawnAndFavor })
        expect(draft.hasManualSelection()).toBe(true)
        session.back()
        expect(draft.targets).toEqual([])
        expect(draft.defender).toEqual({ kind: 'player', playerId: ME })

        session.back()
        expect(session.selection.action).toBeUndefined()
        expect(draft.open).toBe(false)
    })
})
