import { afterEach, describe, expect, it } from 'vitest'
import { SearchPlay } from '@tabletop/oath'
import { disposeSessions, openSessionOn, searchingTable } from '$lib/testing/sessionHarness.js'

afterEach(disposeSessions)

function searching() {
    const session = openSessionOn(searchingTable())
    return { session, draft: session.search }
}

/** The five cases `docs/user-interactions.md` requires of each staged flow, for the Search draft. */
describe('the Search draft (docs/user-interactions.md)', () => {
    it('keeping a card clears the placement chosen for the last one', async () => {
        const { draft } = searching()
        const [first, second] = draft.drawn
        draft.keep(first)
        await draft.choosePlacement({ play: SearchPlay.Discard })
        expect(draft.placement).toEqual({ play: SearchPlay.Discard })

        draft.keep(second)
        expect(draft.kept).toBe(second)
        expect(draft.placement).toBeUndefined()
        expect(draft.tapped).toEqual([])
    })

    it('Back pops the highest manual pick, and says so only while one is left', async () => {
        const { draft } = searching()
        const [first] = draft.drawn
        draft.keep(first)
        await draft.choosePlacement({ play: SearchPlay.Discard })

        expect(draft.back()).toBe(true)
        expect(draft.placement).toBeUndefined()
        expect(draft.back()).toBe(true)
        expect(draft.kept).toBeUndefined()
        expect(draft.back()).toBe(false)
    })

    it('a Search has no auto pick: before any tap there is nothing for Back or Undo to take', () => {
        const { session, draft } = searching()
        expect(draft.hasManualSelection()).toBe(false)
        expect(draft.back()).toBe(false)
        expect(session.hasManualDraft).toBe(false)
    })

    it('a card not drawn is never kept', () => {
        const { draft } = searching()
        draft.keep('denizen.order.not-drawn')
        expect(draft.kept).toBeUndefined()
        expect(draft.hasManualSelection()).toBe(false)
    })

    it('reselecting the same card keeps nothing chosen under it', async () => {
        const { draft } = searching()
        const [first] = draft.drawn
        draft.keep(first)
        await draft.choosePlacement({ play: SearchPlay.Discard })
        draft.keep(first)
        expect(draft.kept).toBe(first)
        expect(draft.placement).toBeUndefined()
    })
})
