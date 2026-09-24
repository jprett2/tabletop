import { describe, expect, it } from 'vitest'
import { seatAdvisers } from './seatAdvisers.js'

/** R-2.2.2, R-9.4 — a seat names a facedown adviser to its holder alone. */
const WOLVES = 'denizen.beast.wolves'
const TENTS = 'denizen.nomad.tents'
const seat = {
    advisers: [{ cardId: WOLVES, faceUp: true }, { faceUp: false }],
    adviserIds: [WOLVES, TENTS]
}

describe('seat advisers', () => {
    it('names a faceup adviser to everyone', () => {
        expect(seatAdvisers(seat, false)[0]).toEqual({ key: WOLVES, cardId: WOLVES, faceUp: true })
    })

    it('names a facedown adviser to its holder from the holder’s own list', () => {
        expect(seatAdvisers(seat, true)[1]).toEqual({ key: TENTS, cardId: TENTS, faceUp: false })
    })

    it('draws a back for anyone else, even on a client that holds the whole state', () => {
        expect(seatAdvisers(seat, false)[1]).toEqual({ key: 'facedown-1', cardId: undefined, faceUp: false })
    })

    it('draws a back for a projection that omits the list', () => {
        expect(seatAdvisers({ advisers: seat.advisers }, true)[1].cardId).toBeUndefined()
    })
})
