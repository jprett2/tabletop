import { describe, expect, it } from 'vitest'
import { ActionType, SearchPlay, SearchSource } from '@tabletop/oath'
import { UNDESCRIBED, describeAction } from './actionDescription.js'
import { ActionSource, type GameAction } from '@tabletop/common'

const nameOf = (playerId: string) => ({ p1: 'Alice', p2: 'Bob' })[playerId] ?? playerId

function action(fields: { type: ActionType; playerId?: string } & Record<string, unknown>): GameAction {
    return { id: 'a1', gameId: 'g1', source: ActionSource.User, ...fields }
}

// A registered card: a sentence names the card an action was taken on.
const CARD = 'denizen.beast.errand-boy'

/** Only each schema's required fields, so every sentence must survive missing metadata. */
const MINIMAL: Record<string, Record<string, unknown>> = {
    [ActionType.SetupChoice]: { siteId: 'c1', adviserCardId: 'x', discardOrder: [] },
    [ActionType.Travel]: { siteId: 'c1' },
    [ActionType.Muster]: { cardId: CARD },
    [ActionType.Trade]: { cardId: CARD, option: 'forFavor' },
    [ActionType.Search]: { drawFrom: SearchSource.WorldDeck },
    [ActionType.SearchResolve]: { keptCardId: 'x', discardOrder: [], play: 'adviser' },
    [ActionType.Recover]: { target: { kind: 'relic', slotId: 's1' } },
    [ActionType.Campaign]: {
        defender: { kind: 'bandits' },
        targets: [],
        attackDice: 1
    },
    [ActionType.CampaignDefend]: { plans: [] },
    [ActionType.UseRestPower]: { cardId: CARD, powerIndex: 0 },
    [ActionType.CampaignSacrifice]: { sacrifice: 0 },
    [ActionType.CampaignDefeatKills]: { kills: [] },
    [ActionType.CampaignResolveVictory]: { placements: [], burnFavor: false },
    [ActionType.PlayFacedownAdviser]: { cardId: CARD, play: 'adviser' },
    [ActionType.UseActionPower]: { cardId: CARD },
    [ActionType.Peek]: { target: { kind: 'siteRelic', slotId: 's1' } },
    [ActionType.MoveWarbands]: { move: { kind: 'siteToBoard' }, color: 'red', count: 1 },
    [ActionType.OfferCitizenship]: { exilePlayerId: 'p2', reliquarySlotId: 'r1' },
    [ActionType.ResolveCitizenshipOffer]: { granted: true },
    [ActionType.AnswerConsent]: { granted: true },
    [ActionType.AnswerQuestion]: { answer: { kind: 'exchange', accept: true } },
    [ActionType.ExileCitizen]: { citizenPlayerId: 'p2' },
    [ActionType.SelfExile]: {},
    [ActionType.ResolveWake]: { favorSteps: [] },
    [ActionType.EndActPhase]: {},
    [ActionType.CompleteRest]: {},
    [ActionType.ResolveOathkeeper]: { chosenPlayerId: 'p2' }
}

describe('the history tab describes every action', () => {
    it('has a sentence for all 27 action types, and reaches no fallback', () => {
        const types = Object.values(ActionType)
        // Pinned rather than read off the enum, so adding an action type fails here.
        expect(types).toHaveLength(27)

        for (const type of types) {
            const fields = MINIMAL[type]
            expect(fields, `no fixture for ${type}`).toBeDefined()
            const text = describeAction(action({ type, playerId: 'p1', ...fields }), nameOf)
            expect(text, `${type} fell through to the fallback`).not.toBe(UNDESCRIBED)
            expect(text.length, `${type} described as empty`).toBeGreaterThan(3)
        }
    })

    it('names players rather than printing their ids', () => {
        expect(
            describeAction(
                action({ type: ActionType.ExileCitizen, playerId: 'p1', citizenPlayerId: 'p2' }),
                nameOf
            )
        ).toBe('exiled Bob')
    })

    it('R-4.1.3 — says when the title flipped to Usurper', () => {
        const text = describeAction(
            action({
                type: ActionType.ResolveWake,
                playerId: 'p1',
                favorSteps: [],
                metadata: { flippedToUsurper: true }
            }),
            nameOf
        )
        expect(text).toContain('Usurper')
    })

    it('never says "their" about the acting player', () => {
        // Listed, not banned by regex: a Campaign's "their" is the defender's.
        const cases: Array<[ActionType, Record<string, unknown>, string]> = [
            [ActionType.ResolveWake, { favorSteps: [] }, 'began the turn'],
            [ActionType.EndActPhase, {}, 'ended the Act Phase'],
            [
                ActionType.SetupChoice,
                { siteId: 'c1', adviserCardId: 'x', discardOrder: [] },
                'placed a pawn at c1 and kept one card facedown'
            ],
            [
                ActionType.MoveWarbands,
                { move: { kind: 'siteToBoard' }, color: 'red', count: 2 },
                'moved 2 red warbands from site to board'
            ]
        ]
        for (const [type, fields, expected] of cases) {
            expect(describeAction(action({ type, playerId: 'p1', ...fields }), nameOf)).toBe(
                expected
            )
        }
    })

    it('pluralises warbands', () => {
        expect(
            describeAction(
                action({
                    type: ActionType.MoveWarbands,
                    playerId: 'p1',
                    move: { kind: 'boardToSite' },
                    color: 'red',
                    count: 1
                }),
                nameOf
            )
        ).toBe('moved 1 red warband from board to site')
    })

    it('R-5.6.2 — names the site a Travel revealed, and its relics', () => {
        expect(
            describeAction(
                action({
                    type: ActionType.Travel,
                    playerId: 'p1',
                    siteId: 'slot.cradle.1',
                    metadata: {
                        supplySpent: 1,
                        supplyRemaining: 6,
                        revealedSiteCardId: 'site.mine',
                        relicsRevealed: 1
                    }
                }),
                nameOf
            )
        ).toBe(
            'travelled to Cradle 2, spending 1 Supply — revealing Mine and 1 facedown relic'
        )
    })

    it('describes an action that has no metadata yet', () => {
        expect(() =>
            describeAction(
                action({ type: ActionType.Travel, playerId: 'p1', siteId: 'c1' }),
                nameOf
            )
        ).not.toThrow()
        expect(
            describeAction(
                action({ type: ActionType.Travel, playerId: 'p1', siteId: 'c1' }),
                nameOf
            )
        ).toBe('travelled to c1')
    })

    describe('R-9.4 — never names a card the game did not show', () => {
        // Checked by absence, not exact strings, so a rewording cannot bring the card back.
        const HIDDEN = 'denizen.order.secret-police'
        // Lines print a card's name, never its id.
        const SHOWN = 'Secret Police'

        it('R-1.23.2 — the setup adviser is kept facedown, so it is never named', () => {
            const line = describeAction(
                action({
                    type: ActionType.SetupChoice,
                    playerId: 'p1',
                    siteId: 'slot.cradle.0',
                    adviserCardId: HIDDEN,
                    discardOrder: ['a', 'b'],
                    metadata: { discardPileRegion: 'provinces' }
                }),
                nameOf
            )
            expect(line).not.toContain(SHOWN)
            expect(line).toContain('facedown')
        })

        it('R-5.1.4.II — a facedown adviser is not named, a faceup one is', () => {
            const facedown = describeAction(
                action({
                    type: ActionType.SearchResolve,
                    playerId: 'p1',
                    keptCardId: HIDDEN,
                    discardOrder: [],
                    play: SearchPlay.Adviser,
                    faceUp: false
                }),
                nameOf
            )
            expect(facedown).not.toContain(SHOWN)

            const faceup = describeAction(
                action({
                    type: ActionType.SearchResolve,
                    playerId: 'p1',
                    keptCardId: HIDDEN,
                    discardOrder: [],
                    play: SearchPlay.Adviser,
                    faceUp: true,
                    metadata: { playedCardId: HIDDEN }
                }),
                nameOf
            )
            expect(faceup).toContain(SHOWN)
        })

        it('R-5.1.4 — a card kept and then discarded is never named', () => {
            const line = describeAction(
                action({
                    type: ActionType.SearchResolve,
                    playerId: 'p1',
                    keptCardId: HIDDEN,
                    discardOrder: [],
                    play: SearchPlay.Discard
                }),
                nameOf
            )
            expect(line).not.toContain(SHOWN)
        })

        it('R-5.1.4.I — a card played to a site is named; it is on the board', () => {
            const line = describeAction(
                action({
                    type: ActionType.SearchResolve,
                    playerId: 'p1',
                    keptCardId: HIDDEN,
                    discardOrder: [],
                    play: SearchPlay.Site,
                    metadata: { playedCardId: HIDDEN }
                }),
                nameOf
            )
            expect(line).toContain(SHOWN)
        })

        it('R-6.1 — turning a facedown adviser faceup names it; discarding it does not', () => {
            expect(
                describeAction(
                    action({
                        type: ActionType.PlayFacedownAdviser,
                        playerId: 'p1',
                        cardId: HIDDEN,
                        play: SearchPlay.Adviser,
                        metadata: { playedCardId: HIDDEN }
                    }),
                    nameOf
                )
            ).toContain(SHOWN)

            expect(
                describeAction(
                    action({
                        type: ActionType.PlayFacedownAdviser,
                        playerId: 'p1',
                        cardId: HIDDEN,
                        play: SearchPlay.Discard
                    }),
                    nameOf
                )
            ).not.toContain(SHOWN)
        })

        it('R-6.7, R-6.8 — the exile lines carry the price', () => {
            // R-6.7 — the exiler pays the Citizen; neither price can be read back off the board.
            expect(
                describeAction(
                    action({
                        type: ActionType.ExileCitizen,
                        playerId: 'p1',
                        citizenPlayerId: 'p2',
                        metadata: { favorGiven: 4, recoloredCount: 3, unreplacedCount: 0 }
                    }),
                    nameOf
                )
            ).toBe('exiled Bob, giving them 4 favor')

            expect(
                describeAction(
                    action({
                        type: ActionType.SelfExile,
                        playerId: 'p1',
                        metadata: { favorGiven: 4, recoloredCount: 3, unreplacedCount: 0 }
                    }),
                    nameOf
                )
            ).toBe('went into exile, giving 4 favor to the Grand Scepter’s holder')
        })

        it('R-9.3 — warbands left purple for want of the player’s own colour', () => {
            expect(
                describeAction(
                    action({
                        type: ActionType.SelfExile,
                        playerId: 'p1',
                        metadata: { favorGiven: 2, recoloredCount: 1, unreplacedCount: 3 }
                    }),
                    nameOf
                )
            ).toContain('with 3 warbands left purple')
        })

        it('R-6.1 — names the card in place, with no dangling "it"', () => {
            const play = (p: SearchPlay) =>
                describeAction(
                    action({
                        type: ActionType.PlayFacedownAdviser,
                        playerId: 'p1',
                        cardId: 'denizen.beast.errand-boy',
                        play: p,
                        metadata: p === SearchPlay.Discard ? {} : { playedCardId: 'denizen.beast.errand-boy' }
                    }),
                    nameOf
                )

            expect(play(SearchPlay.Site)).toBe('played Errand Boy to their site')
            expect(play(SearchPlay.Adviser)).toBe(
                'turned Errand Boy faceup as an adviser'
            )
            // R-10.5 — a discarded card is never named, so nothing is placed.
            expect(play(SearchPlay.Discard)).toBe('discarded a card')
        })

        it('R-6.2 — an Action power is named, since only a faceup card has one (R-5.1.4.II)', () => {
            const line = describeAction(
                action({ type: ActionType.UseActionPower, playerId: 'p1', cardId: HIDDEN }),
                nameOf
            )
            expect(line).toContain(SHOWN)
        })

        it('R-5.1.3 — the two discarded cards are never named', () => {
            const line = describeAction(
                action({
                    type: ActionType.SearchResolve,
                    playerId: 'p1',
                    keptCardId: 'denizen.hearth.herald',
                    discardOrder: ['denizen.beast.wolves', 'denizen.nomad.tents'],
                    play: SearchPlay.Site
                }),
                nameOf
            )
            expect(line).not.toContain('denizen.beast.wolves')
            expect(line).not.toContain('denizen.nomad.tents')
        })
    })
})
