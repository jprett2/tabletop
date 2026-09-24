import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameSession } from '@tabletop/frontend-components'
import { ActionType, MachineState, SearchPlay } from '@tabletop/oath'
import { required } from '@tabletop/oath/testing'
import { disposeSessions, openSessionOn, searchingTable, setupTable } from '$lib/testing/sessionHarness.js'

// docs/user-interactions.md — Back unwinds manual picks, Undo waits for them, and nothing is offered from history.
function openSession() {
    return openSessionOn(searchingTable())
}

afterEach(() => {
    disposeSessions()
    vi.restoreAllMocks()
})

describe('OathGameSession — Back, Undo and the history gate', () => {
    it('opens on the Search the chancellor drew, with nothing picked', () => {
        const session = openSession()
        expect(session.gameState.machineState).toBe(MachineState.Searching)
        expect(session.search.drawn).toHaveLength(3)
        expect(session.hasManualDraft).toBe(false)
    })

    it('Undo with a Search pick on screen steps back through it instead of undoing the Search', async () => {
        const session = openSession()
        const historyUndo = vi.spyOn(GameSession.prototype, 'undo').mockResolvedValue()
        const [first] = session.search.drawn
        session.search.keep(first)
        expect(session.hasManualDraft).toBe(true)

        await session.undo()
        expect(session.search.kept).toBeUndefined()
        expect(historyUndo).not.toHaveBeenCalled()

        await session.undo()
        expect(historyUndo).toHaveBeenCalledTimes(1)
    })

    it('Back unwinds one pick at a time: the placement, then the kept card', () => {
        const session = openSession()
        const [first] = session.search.drawn
        session.search.keep(first)
        void session.search.choosePlacement({ play: SearchPlay.Discard })
        expect(session.search.placement).toEqual({ play: SearchPlay.Discard })

        session.back()
        expect(session.search.placement).toBeUndefined()
        expect(session.search.kept).toBe(first)

        session.back()
        expect(session.search.kept).toBeUndefined()
        expect(session.hasManualDraft).toBe(false)
    })

    it('a pick in the action grid is a draft too, and Back returns to the grid', async () => {
        const session = openSession()
        const historyUndo = vi.spyOn(GameSession.prototype, 'undo').mockResolvedValue()
        session.chooseAction(ActionType.Travel)
        expect(session.hasManualDraft).toBe(true)
        await session.undo()
        expect(session.selection.action).toBeUndefined()
        expect(historyUndo).not.toHaveBeenCalled()
    })

    it('a new visible state ends every draft before it is published', () => {
        const session = openSession()
        const [first] = session.search.drawn
        session.search.keep(first)
        session.beforeNewState()
        expect(session.search.kept).toBeUndefined()
        expect(session.hasManualDraft).toBe(false)
    })

    it('while the visible state is updating, a draft reads as empty and comes back if nothing replaced it', () => {
        const session = openSession()
        const [first] = session.search.drawn
        session.search.keep(first)
        session.updatingVisibleState = true
        expect(session.search.drawn).toEqual([])
        expect(session.search.kept).toBeUndefined()
        session.updatingVisibleState = false
        expect(session.search.kept).toBe(first)
    })

    it('while an action is being sent, every draft reads as empty and the staged action offers nothing', () => {
        const session = openSession()
        const [first] = session.search.drawn
        session.search.keep(first)
        session.processingActions = true
        expect(session.liveSeatId).toBeUndefined()
        expect(session.search.kept).toBeUndefined()
        session.processingActions = false
        expect(session.search.kept).toBe(first)
    })

    it('with only the auto-staged Setup action left, Undo reverses the last Processed Action', async () => {
        const session = openSessionOn(setupTable())
        const historyUndo = vi.spyOn(GameSession.prototype, 'undo').mockResolvedValue()
        // R-1.23 — the Chancellor's only start is taken for them, so the adviser is the first pick.
        expect(session.setup.siteId).toBeDefined()
        const [adviser] = required(session.myPlayerState?.handIds, 'the hand of the seat on the clock')
        await session.setup.chooseAdviser(adviser)
        expect(session.selection.sourceOf('action')).toBe('auto')

        await session.undo()
        expect(session.setup.adviserCardId).toBeUndefined()
        expect(historyUndo).not.toHaveBeenCalled()

        await session.undo()
        expect(historyUndo).toHaveBeenCalledTimes(1)
        expect(session.selection.action).toBe(ActionType.SetupChoice)
    })

    it('offers nothing and sends nothing while history is on screen', async () => {
        const session = openSession()
        const [first] = session.search.drawn
        vi.spyOn(session, 'isViewingHistory', 'get').mockReturnValue(true)
        expect(session.liveSeatId).toBeUndefined()
        expect(session.search.drawn).toEqual([])
        session.search.keep(first)
        expect(session.hasManualDraft).toBe(false)
        await expect(session.endActPhase()).rejects.toThrow(/never from history/)
    })
})
