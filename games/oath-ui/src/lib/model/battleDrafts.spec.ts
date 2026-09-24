import { afterEach, describe, expect, it } from 'vitest'
import { Color } from '@tabletop/common'
import {
    CampaignTargetKind,
    MachineState,
    PowerTiming,
    cardPowers,
    type CampaignState
} from '@tabletop/oath'
import { campaignRecords, required, testPlayer, testState } from '@tabletop/oath/testing'
import { disposeSessions, openSessionOn, tableOf } from '$lib/testing/sessionHarness.js'

afterEach(disposeSessions)

const ME = 'me'
const FOE = 'foe'
const WILD_MOUNTS = 'denizen.nomad.wild-mounts'
const MOUNTS_PLAN = required(
    cardPowers(WILD_MOUNTS).find((power) => power.timing === PowerTiming.BattlePlan),
    'Wild Mounts’ battle plan'
).powerIndex

function battle(machineState: MachineState, campaign: Partial<CampaignState>, onClock: string) {
    const state = testState(
        [
            testPlayer({ playerId: ME, color: Color.Red, siteId: 'c1', warbandsOnBoard: { [Color.Red]: 4 } }),
            testPlayer({
                playerId: FOE,
                color: Color.Blue,
                siteId: 'c1',
                warbandsOnBoard: { [Color.Blue]: 2 },
                advisers: [{ cardId: WILD_MOUNTS, faceUp: true }]
            })
        ],
        {
            machineState,
            activePlayerIds: [onClock],
            warbandsBySite: { c1: { [Color.Blue]: 3 }, c2: { [Color.Blue]: 2 } },
            campaign: {
                attackerPlayerId: ME,
                defenderPlayerId: FOE,
                nonImperialPlayerIds: [],
                allyPlayerIds: [],
                targets: [],
                attackPool: 0,
                defensePool: 0,
                attackRoll: [],
                defenseRoll: [],
                defense: 0,
                swords: 0,
                defendingForce: [],
                defendingBandits: 0,
                ...campaignRecords(),
                ...campaign
            }
        }
    )
    return openSessionOn(tableOf(state))
}

const SITES = [
    { kind: CampaignTargetKind.Site, siteId: 'c1' },
    { kind: CampaignTargetKind.Site, siteId: 'c2' }
] as const

/** R-5.5.7 — one entry holds every count and every bottomed relic, so Back clears them together. */
describe('the spoils draft (docs/user-interactions.md)', () => {
    const won = () =>
        battle(MachineState.CampaignVictory, { attackerVictorious: true, targets: [...SITES] }, ME).victory

    it('a count on one site keeps the counts on the others', () => {
        const spoils = won()
        spoils.setPlaceCount('c1', 2)
        spoils.setPlaceCount('c2', 1)
        expect(spoils.placeCounts).toEqual({ c1: 2, c2: 1 })
    })

    it('Back clears every count at once', () => {
        const spoils = won()
        spoils.setPlaceCount('c1', 2)
        spoils.setPlaceCount('c2', 1)
        expect(spoils.back()).toBe(true)
        expect(spoils.placeCounts).toEqual({ c1: 0, c2: 0 })
        expect(spoils.back()).toBe(false)
    })

    it('before any count there is nothing for Back or Undo to take', () => {
        const spoils = won()
        expect(spoils.hasManualSelection()).toBe(false)
        expect(spoils.back()).toBe(false)
    })

    it('a site not taken, or more warbands than the force holds, is never placed', () => {
        const spoils = won()
        spoils.setPlaceCount('p1', 1)
        expect(spoils.hasManualSelection()).toBe(false)
        spoils.setPlaceCount('c1', 9)
        expect(spoils.placeCounts.c1).toBe(4)
    })

    it('recounting a site lowers the ceiling left for the others', () => {
        const spoils = won()
        spoils.setPlaceCount('c1', 3)
        expect(spoils.ceilingAt('c2')).toBe(1)
        spoils.setPlaceCount('c1', 1)
        expect(spoils.ceilingAt('c2')).toBe(3)
    })
})

/** R-5.5.3 — the defending side's plans are one entry. */
describe('the defence draft (docs/user-interactions.md)', () => {
    const defending = () =>
        battle(
            MachineState.CampaignPlans,
            { targets: [{ kind: CampaignTargetKind.PawnAndFavor }], pendingDefenderPlans: { queue: [FOE] } },
            FOE
        ).defence

    it('declaring the plan, then taking it back, leaves nothing declared', () => {
        const defence = defending()
        defence.setPlan({ cardId: WILD_MOUNTS, powerIndex: MOUNTS_PLAN }, true)
        expect(defence.plans).toEqual([{ cardId: WILD_MOUNTS, powerIndex: MOUNTS_PLAN }])
        defence.setPlan({ cardId: WILD_MOUNTS, powerIndex: MOUNTS_PLAN }, false)
        expect(defence.plans).toEqual([])
    })

    it('Back clears the declared plans', () => {
        const defence = defending()
        defence.setPlan({ cardId: WILD_MOUNTS, powerIndex: MOUNTS_PLAN }, true)
        expect(defence.back()).toBe(true)
        expect(defence.plans).toEqual([])
        expect(defence.back()).toBe(false)
    })

    it('before any tick there is nothing for Back or Undo to take', () => {
        const defence = defending()
        expect(defence.usable.map((power) => power.cardId)).toEqual([WILD_MOUNTS])
        expect(defence.hasManualSelection()).toBe(false)
    })

    it('a plan the defender cannot use is never declared', () => {
        const defence = defending()
        defence.setPlan({ cardId: 'denizen.order.relic-hunter', powerIndex: 0 }, true)
        expect(defence.hasManualSelection()).toBe(false)
    })

    it('the attacker sees no plans of the defender’s to declare', () => {
        const session = battle(
            MachineState.CampaignPlans,
            { targets: [{ kind: CampaignTargetKind.PawnAndFavor }], pendingDefenderPlans: { queue: [FOE] } },
            ME
        )
        expect(session.defence.usable).toEqual([])
    })
})

/** R-5.5.6.a — the defeated defending side's losses, one entry for every group. */
describe('the losses draft (docs/user-interactions.md)', () => {
    const FORCE = [
        { at: { kind: 'site', siteId: 'c1' }, color: Color.Blue, count: 3 },
        { at: { kind: 'site', siteId: 'c2' }, color: Color.Blue, count: 2 }
    ] as const
    const defeated = () =>
        battle(
            MachineState.CampaignDefeat,
            {
                attackerVictorious: true,
                targets: [...SITES],
                defendingForce: FORCE.map((group) => ({ ...group, at: { ...group.at } })),
                pendingDefeatKills: { chooserPlayerId: FOE }
            },
            FOE
        ).defeat

    it('a count on one group keeps the counts on the others', () => {
        const defeat = defeated()
        defeat.setPicked(0, 1)
        defeat.setPicked(1, 1)
        expect(defeat.picked).toEqual([1, 1])
    })

    it('Back clears every count at once', () => {
        const defeat = defeated()
        defeat.setPicked(0, 2)
        expect(defeat.back()).toBe(true)
        expect(defeat.picked).toEqual([0, 0])
        expect(defeat.back()).toBe(false)
    })

    it('before any count there is nothing for Back or Undo to take', () => {
        const defeat = defeated()
        expect(defeat.required).toBeGreaterThan(0)
        expect(defeat.hasManualSelection()).toBe(false)
    })

    it('a count is held to its group', () => {
        const defeat = defeated()
        defeat.setPicked(1, 9)
        expect(defeat.picked).toEqual([0, 2])
        defeat.setPicked(5, 1)
        expect(defeat.picked).toEqual([0, 2])
    })

    it('recounting a group replaces its count only', () => {
        const defeat = defeated()
        defeat.setPicked(0, 3)
        defeat.setPicked(1, 1)
        defeat.setPicked(0, 1)
        expect(defeat.picked).toEqual([1, 1])
    })
})
