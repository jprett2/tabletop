import { describe, expect, it } from 'vitest'
import {
    AnswerQuestion,
    EndActPhase,
    MachineState,
    PowerQuestionKind,
    Region,
    UseActionPower
} from '@tabletop/oath'
import { buildAction } from '@tabletop/oath/testing'
import {
    actorOnlyOutcome,
    latestActorOnlyOutcome,
    mergedPilesOf,
    pileDepositsOf
} from './actionOutcomes.js'
import { describeAction } from './actionDescription.js'

const nameOf = (playerId: string) => ({ me: 'Alice', other: 'Bob' })[playerId] ?? playerId

const powerUse = buildAction(UseActionPower, {
    playerId: 'me',
    cardId: 'relic.dowsing-sticks',
    powerIndex: 0,
    choices: [],
    metadata: {
        summary: 'drew a relic',
        peeked: ['relic.map'],
        pileDeposits: [{ region: Region.Cradle, cardIds: ['denizen.order.messenger'] }],
        mergePiles: { from: Region.Provinces, to: Region.Hinterland }
    }
})

const keepOrBottom = buildAction(AnswerQuestion, {
    playerId: 'me',
    answer: { kind: PowerQuestionKind.KeepOrBottomRelic, keep: false },
    metadata: {
        cardId: 'denizen.hearth.family-heirloom',
        kind: PowerQuestionKind.KeepOrBottomRelic,
        summary: 'put the relic on the bottom of the relic deck',
        resumeMachineState: MachineState.ActPhase,
        last: true,
        relicToDeckBottom: 'relic.map'
    }
})

const stacked = buildAction(AnswerQuestion, {
    playerId: 'me',
    answer: { kind: PowerQuestionKind.OrderDrawnCards, order: [1, 0] },
    metadata: {
        cardId: 'denizen.nomad.pilgrimage',
        kind: PowerQuestionKind.OrderDrawnCards,
        summary: 'stacked 2 cards on the cradle discard pile',
        resumeMachineState: MachineState.ActPhase,
        last: true,
        pileDeposits: [
            { region: Region.Cradle, cardIds: ['denizen.order.messenger', 'denizen.nomad.tents'] }
        ]
    }
})

const endPhase = buildAction(EndActPhase, { playerId: 'me' })

describe('actorOnlyOutcome', () => {
    it('shows the actor what the power showed them', () => {
        expect(actorOnlyOutcome(powerUse, 'me')).toEqual({
            peeked: ['relic.map'],
            relicToDeckBottom: undefined
        })
        expect(actorOnlyOutcome(keepOrBottom, 'me')).toEqual({
            peeked: undefined,
            relicToDeckBottom: 'relic.map'
        })
    })

    it('shows nobody else, whatever the client holds', () => {
        expect(actorOnlyOutcome(powerUse, 'other')).toBeUndefined()
        expect(actorOnlyOutcome(keepOrBottom, undefined)).toBeUndefined()
    })

    it('an action with nothing seen carries nothing', () => {
        expect(actorOnlyOutcome(endPhase, 'me')).toBeUndefined()
    })
})

describe('latestActorOnlyOutcome', () => {
    it('reads only the viewer’s latest action', () => {
        expect(latestActorOnlyOutcome([powerUse], 'me')?.peeked).toEqual(['relic.map'])
        expect(latestActorOnlyOutcome([powerUse, endPhase], 'me')).toBeUndefined()
        expect(latestActorOnlyOutcome([powerUse], 'other')).toBeUndefined()
    })
})

describe('pile deposits and merges', () => {
    it('are read from the records that carry them', () => {
        expect(pileDepositsOf(powerUse)).toEqual([
            { region: Region.Cradle, cardIds: ['denizen.order.messenger'] }
        ])
        expect(mergedPilesOf(powerUse)).toEqual({ from: Region.Provinces, to: Region.Hinterland })
        expect(pileDepositsOf(endPhase)).toEqual([])
    })

    it('the history names the region to everyone and the cards to the actor alone', () => {
        const toActor = describeAction(powerUse, nameOf, 'me')
        const toOther = describeAction(powerUse, nameOf, 'other')
        expect(toActor).toContain('Messenger went to the cradle discard pile')
        expect(toActor).toContain('you saw')
        expect(toOther).toContain('cards went to the cradle discard pile')
        expect(toOther).not.toContain('Messenger')
        expect(toOther).not.toContain('you saw')
        expect(toOther).toContain('the provinces discard pile went onto the hinterland pile')
    })

    it('an answer that stacks cards on a pile (Pilgrimage) names them to its actor alone', () => {
        expect(pileDepositsOf(stacked)).toEqual([
            { region: Region.Cradle, cardIds: ['denizen.order.messenger', 'denizen.nomad.tents'] }
        ])
        expect(describeAction(stacked, nameOf, 'me')).toContain('Messenger')
        expect(describeAction(stacked, nameOf, 'other')).toContain('cards went to the cradle discard pile')
        expect(describeAction(stacked, nameOf, 'other')).not.toContain('Messenger')
    })

    it('the relic sent to the bottom is named to its actor alone', () => {
        expect(describeAction(keepOrBottom, nameOf, 'me')).toContain(
            'on the bottom of the relic deck'
        )
        expect(describeAction(keepOrBottom, nameOf, 'other')).not.toContain('you put')
    })
})
