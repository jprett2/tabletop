import { describe, expect, it } from 'vitest'
import { Color } from '@tabletop/common'
import { HydratedUseActionPower } from '../actions/useActionPower.js'
import { HydratedCampaign, Campaign } from '../actions/campaign.js'
import { HydratedCampaignDefend, CampaignDefend } from '../actions/campaignDefend.js'
import { HydratedCampaignSacrifice, CampaignSacrifice } from '../actions/campaignSacrifice.js'
import { HydratedCampaignResolveVictory, CampaignResolveVictory } from '../actions/campaignResolveVictory.js'
import { HydratedRecover, RecoverTargetKind, Recover } from '../actions/recover.js'
import { HydratedAnswerQuestion, AnswerQuestion } from '../actions/answerQuestion.js'
import { Banner, CardKind } from '../model/oathEnums.js'
import { CampaignTargetKind } from '../model/campaign.js'
import { registerCards } from '../data/cardRegistry.js'
import { PowerQuestionKind } from '../model/question.js'
import { testPlayer, testState, testVaultWithRelics, openTurn } from '../testing/fixture.js'
import { PowerTiming, powerIndexOf } from '../data/cardPowers.js'
import { warbandsAt } from '../util/rule.js'
import { attackingSiteOf } from '../util/campaignSite.js'
import '../powers/index.js'
import { ongoingCampaign, required } from '../testing/required.js'
import { buildAction, defendingSideChooses } from '../testing/actions.js'
import { battlePlanUse, site, actionPowerUse } from '../testing/choices.js'
import { INN } from '../testing/cards.js'

const HEARTS = 'denizen.hearth.hearts-and-minds'
const ENVOY = 'denizen.order.peace-envoy'
const WILD_ALLIES = 'denizen.beast.wild-allies'
const CAPTAINS = 'denizen.order.captains'
const HOSPITAL = 'denizen.hearth.hospital'
const RELIC_THIEF = 'denizen.discord.relic-thief'
const WOLVES = 'denizen.beast.wolves'

// c1 needs a Recover cost the fixture can pay; the Plains prints none.
registerCards([{ id: 'site.test-cheap', name: 'Cheap', kind: CardKind.Site, recoverCost: { kind: 'burnFavor', amount: 1 } }])

function board(cards: string[] = [], over: Record<string, Record<string, unknown>> = {}, state: Record<string, unknown> = {}) {
    const s = testState(
        [
            testPlayer({ playerId: 'att', color: Color.Red, siteId: 'c1', favor: 4, secrets: 3, supply: 6, warbandsOnBoard: { [Color.Red]: 4 }, warbandsInPersonalBank: { [Color.Red]: 6 }, ...over['att'] }),
            testPlayer({ playerId: 'def', color: Color.Blue, siteId: 'c1', favor: 3, secrets: 2, supply: 4, warbandsOnBoard: { [Color.Blue]: 2 }, warbandsInPersonalBank: { [Color.Blue]: 5 }, ...over['def'] }),
            testPlayer({ playerId: 'far', color: Color.Yellow, siteId: 'h1', favor: 2, secrets: 2, ...over['far'] })
        ],
        {
            denizensBySite: { c1: cards, c2: [INN], p1: [WOLVES], h1: [] },
            warbandsBySite: { c1: { [Color.Blue]: 2 }, c2: { [Color.Red]: 2 }, p1: { [Color.Blue]: 3 } },
            siteCards: { c1: 'site.plains', c2: 'site.river', p1: 'site.marshes', h1: 'site.mountain' },
            ...state
        }
    )
    openTurn(s, 'att')
    return s
}
function campaign(s: ReturnType<typeof board>, fields: Record<string, unknown> = {}) {
    const a = new HydratedCampaign(buildAction(Campaign, { playerId: 'att', defender: { kind: 'player', playerId: 'def' }, targets: [{ kind: CampaignTargetKind.Site, siteId: 'c1' }], attackDice: 3, ...fields }))
    a.apply(s)
    return a
}
function finish(s: ReturnType<typeof board>, sacrifice = 0) {
    const sac = new HydratedCampaignSacrifice(buildAction(CampaignSacrifice, { playerId: 'att', sacrifice, defeatKills: HydratedCampaignSacrifice.attackerDefeatKills(s, sacrifice) }))
    sac.apply(s)
    defendingSideChooses(s)
    if (s.campaign) new HydratedCampaignResolveVictory(buildAction(CampaignResolveVictory, { playerId: 'att', placements: [], burnFavor: false })).apply(s)
    return sac
}

describe('Hearts and Minds and Peace Envoy — a battle decided without a roll', () => {
    it("Hearts and Minds: the defender wins outright, nothing is rolled, and the card goes unless they hold the People's Favor", () => {
        const s = board([HEARTS], { def: { favor: 5 } })
        campaign(s)
        expect(s.campaign?.pendingDefenderPlans).toBeDefined()
        new HydratedCampaignDefend(buildAction(CampaignDefend, { playerId: 'def', plans: [battlePlanUse(HEARTS)] })).apply(s)
        expect(s.campaign).toMatchObject({ decidedVictor: 'defender', attackRoll: [], defenseRoll: [], swords: 0, defense: 0 })
        expect(HydratedCampaignSacrifice.sacrificeNeeded(ongoingCampaign(s))).toBe(0)
        expect(HydratedCampaignSacrifice.reasonCannotResolve(s, 'att', { sacrifice: 1 })).toMatch(/already decided/)
        const before = required(s.getPlayerState('att').warbandsOnBoard[Color.Red], 'the attacker’s red warbands')
        const sac = finish(s)
        expect(sac.metadata?.attackerVictorious).toBe(false)
        // R-5.5.6 — the defeated attacker still loses half of four.
        expect(s.getPlayerState('att').warbandsOnBoard[Color.Red]).toBe(before - 2)
        expect(sac.metadata?.planNotes?.[0]).toMatch(/discarded at the end/)
        expect(s.denizensBySite['c1']).not.toContain(HEARTS)

        const kept = board([HEARTS], { def: { favor: 5 } }, { banners: { [Banner.PeoplesFavor]: { value: 1, holderPlayerId: 'def' }, [Banner.DarkestSecret]: { value: 1 } } })
        campaign(kept)
        new HydratedCampaignDefend(buildAction(CampaignDefend, { playerId: 'def', plans: [battlePlanUse(HEARTS)] })).apply(kept)
        finish(kept)
        expect(kept.denizensBySite['c1']).toContain(HEARTS)
    })

    it("Peace Envoy: the user wins, pays the enemy a favor per defense die, and nobody's warbands die", () => {
        const s = board([], { att: { favor: 4, advisers: [{ cardId: ENVOY, faceUp: true }] } })
        campaign(s, { plans: [battlePlanUse(ENVOY)] })
        expect(s.campaign?.decidedVictor).toBe('attacker')
        expect(s.getPlayerState('def').favor).toBe(4)
        expect(s.getPlayerState('att').favor).toBe(2)
        const sac = finish(s)
        expect(sac.metadata?.attackerVictorious).toBe(true)
        expect(sac.metadata?.defeatKilled).toBe(0)
        expect(s.getPlayerState('def').warbandsOnBoard[Color.Blue]).toBe(4)
        expect(warbandsAt(s, 'c1')[Color.Blue] ?? 0).toBe(0)
        expect(HydratedCampaign.reasonCannotCampaign(board([], { att: { advisers: [{ cardId: ENVOY, faceUp: true }, { cardId: 'denizen.discord.mercenaries', faceUp: true }] } }), 'att', { defender: { kind: 'player', playerId: 'def' }, targets: [{ kind: CampaignTargetKind.Site, siteId: 'c1' }], attackDice: 1, plans: [battlePlanUse(ENVOY), battlePlanUse('denizen.discord.mercenaries')] })).toMatch(/cannot use other battle plans/)
    })
})

describe('Wild Allies and Captains — a Campaign from another site', () => {
    it('Captains: the next Campaign acts from a ruled site, for no Supply, with the warbands there in the force', () => {
        const s = board([CAPTAINS], {}, { warbandsBySite: { c1: { [Color.Red]: 1, [Color.Blue]: 2 }, c2: { [Color.Red]: 2, [Color.Blue]: 1 }, p1: { [Color.Blue]: 3 } } })
        actionPowerUse('att', CAPTAINS, [site('c2')]).apply(s)
        s.actionCount += 1
        expect(attackingSiteOf(s, 'att')).toBe('c2')
        expect(HydratedCampaign.supplyCostFor(s, 'att')).toBe(0)
        expect(HydratedCampaign.legalDefenders(s, 'att')).toContainEqual({ kind: 'player', playerId: 'def' })
        expect(HydratedCampaign.reasonCannotCampaign(s, 'att', { defender: { kind: 'player', playerId: 'def' }, targets: [{ kind: CampaignTargetKind.Site, siteId: 'c2' }], attackDice: 6 })).toBeUndefined()
        expect(HydratedCampaign.reasonCannotCampaign(s, 'att', { defender: { kind: 'player', playerId: 'def' }, targets: [{ kind: CampaignTargetKind.Site, siteId: 'c2' }], attackDice: 7 })).toMatch(/at most 6/)
        const a = campaign(s, { targets: [{ kind: CampaignTargetKind.Site, siteId: 'c2' }], attackDice: 6 })
        expect(a.metadata?.supplySpent).toBe(0)
        expect(s.campaign?.forceSiteIds).toEqual(['c2'])
        expect(s.getPlayerState('att').campaignAsIf).toBeUndefined()
        expect(attackingSiteOf(s, 'att')).toBe('c2')
    })

    it('Wild Allies reaches a site with a beast card; without the power the pawn is where it is', () => {
        const s = board([WILD_ALLIES])
        expect(HydratedUseActionPower.reasonCannotUse(s, 'att', WILD_ALLIES, powerIndexOf(WILD_ALLIES, PowerTiming.Action), [site('c2')])).toMatch(/not among the options/)
        actionPowerUse('att', WILD_ALLIES, [site('p1')]).apply(s)
        s.actionCount += 1
        expect(attackingSiteOf(s, 'att')).toBe('p1')
        s.actionCount += 1
        expect(attackingSiteOf(s, 'att')).toBe('c1')
    })
})

describe('Hospital — a kill becomes a placement', () => {
    it("the defender's would-be-killed warbands go to Hospital's site while they rule it", () => {
        const s = board([HOSPITAL], {}, { warbandsBySite: { c1: { [Color.Blue]: 2 }, c2: { [Color.Red]: 2 }, p1: { [Color.Blue]: 3 } } })
        campaign(s)
        new HydratedCampaignDefend(buildAction(CampaignDefend, { playerId: 'def', plans: [battlePlanUse(HOSPITAL)] })).apply(s)
        expect(s.campaign?.killRedirects).toEqual([{ playerId: 'def', siteId: 'c1' }])
        ongoingCampaign(s).swords = 9
        ongoingCampaign(s).defense = 0
        const bank = s.getPlayerState('def').warbandsInPersonalBank[Color.Blue]
        const sac = finish(s)
        expect(sac.metadata?.attackerVictorious).toBe(true)
        // Half the defending force of four would die; Hospital keeps them at c1 instead.
        expect(s.getPlayerState('def').warbandsInPersonalBank[Color.Blue]).toBe(bank)
        expect(warbandsAt(s, 'c1')[Color.Blue]).toBe(2)
    })
})

describe('Relic Thief — a roll for the relics somebody took', () => {
    it("asks the holder after a Recover in their region; a roll with no shields takes the relics, and the power's cost is paid", () => {
        const s = board([], { far: { siteId: 'c2', advisers: [{ cardId: RELIC_THIEF, faceUp: true }], favor: 2, secrets: 2 } }, { relicsBySite: { c1: [{ slotId: 'c1-r1' }] }, vault: testVaultWithRelics({ 'c1-r1': 'relic.cup' }), siteCards: { c1: 'site.test-cheap', c2: 'site.river', p1: 'site.marshes', h1: 'site.mountain' } })
        const r = new HydratedRecover(buildAction(Recover, { playerId: 'att', target: { kind: RecoverTargetKind.Relic, slotId: 'c1-r1' } }))
        r.apply(s)
        expect(s.getPlayerState('att').relicIds).toContain('relic.cup')
        expect(r.metadata?.modifierNotes?.[0]).toMatch(/Relic Thief: far may roll/)
        expect(s.pendingQuestions?.queue[0]).toMatchObject({ kind: PowerQuestionKind.RelicThiefRoll, askedPlayerId: 'far', takerPlayerId: 'att', relicCardIds: ['relic.cup'] })
        let took = false
        for (let seed = 1; seed < 40 && !took; seed++) {
            const t = board([], { far: { siteId: 'c2', advisers: [{ cardId: RELIC_THIEF, faceUp: true }], favor: 2, secrets: 2 } }, { relicsBySite: { c1: [{ slotId: 'c1-r1' }] }, vault: testVaultWithRelics({ 'c1-r1': 'relic.cup' }), prng: { seed, invocations: 0 }, siteCards: { c1: 'site.test-cheap', c2: 'site.river', p1: 'site.marshes', h1: 'site.mountain' } })
            new HydratedRecover(buildAction(Recover, { playerId: 'att', target: { kind: RecoverTargetKind.Relic, slotId: 'c1-r1' } })).apply(t)
            const a = new HydratedAnswerQuestion(buildAction(AnswerQuestion, { playerId: 'far', answer: { kind: PowerQuestionKind.RelicThiefRoll, roll: true } }))
            a.apply(t)
            expect(a.revealsInfo).toBe(true)
            expect(t.getPlayerState('far')).toMatchObject({ favor: 1, secrets: 1 })
            if (t.getPlayerState('far').relicIds.includes('relic.cup')) took = true
        }
        expect(took).toBe(true)
    })

    it('is not asked when the taker is in another region, or when the holder cannot pay', () => {
        const s = board([], { far: { advisers: [{ cardId: RELIC_THIEF, faceUp: true }] } }, { relicsBySite: { c1: [{ slotId: 'c1-r1' }] }, vault: testVaultWithRelics({ 'c1-r1': 'relic.cup' }), siteCards: { c1: 'site.test-cheap', c2: 'site.river', p1: 'site.marshes', h1: 'site.mountain' } })
        new HydratedRecover(buildAction(Recover, { playerId: 'att', target: { kind: RecoverTargetKind.Relic, slotId: 'c1-r1' } })).apply(s)
        expect(s.pendingQuestions).toBeUndefined()
        const broke = board([], { far: { siteId: 'c2', advisers: [{ cardId: RELIC_THIEF, faceUp: true }], favor: 0 } }, { relicsBySite: { c1: [{ slotId: 'c1-r1' }] }, vault: testVaultWithRelics({ 'c1-r1': 'relic.cup' }), siteCards: { c1: 'site.test-cheap', c2: 'site.river', p1: 'site.marshes', h1: 'site.mountain' } })
        const r = new HydratedRecover(buildAction(Recover, { playerId: 'att', target: { kind: RecoverTargetKind.Relic, slotId: 'c1-r1' } })).apply(broke)
        expect(broke.pendingQuestions).toBeUndefined()
        void r
    })
})
