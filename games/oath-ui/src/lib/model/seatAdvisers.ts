import type { OathProjectedPlayerState } from '@tabletop/oath'

/** One adviser as a seat draws it: named when faceup or shown to its holder, a back otherwise. */
export interface SeatAdviser {
    key: string
    cardId?: string
    faceUp: boolean
}

// R-2.2.2, R-9.4 — a facedown adviser is named to its holder alone, from the holder's own list,
// whatever data this client happens to hold.
export function seatAdvisers(
    playerState: Pick<OathProjectedPlayerState, 'advisers' | 'adviserIds'>,
    isHolder: boolean
): SeatAdviser[] {
    return playerState.advisers.map((row, index) => {
        const cardId = row.faceUp
            ? row.cardId
            : isHolder
              ? playerState.adviserIds?.[index]
              : undefined
        return { key: cardId ?? `facedown-${index}`, cardId, faceUp: row.faceUp }
    })
}
