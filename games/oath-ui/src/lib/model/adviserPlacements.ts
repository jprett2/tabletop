import { HydratedPlayFacedownAdviser, SearchPlay, type HydratedOathGameState } from '@tabletop/oath'

// R-5.1.4 — the plays a Search and a facedown adviser print alike; an adviser play reads differently in each.
export const PLAY_LABELS = {
    [SearchPlay.Site]: 'Play to your site',
    [SearchPlay.RevealedVision]: 'Reveal as your Vision',
    [SearchPlay.Conspiracy]: 'Play the Conspiracy',
    [SearchPlay.Discard]: 'Discard it'
} as const satisfies Record<Exclude<SearchPlay, SearchPlay.Adviser>, string>

// R-6.1 — a route into R-5.1.4, played faceup; the action's predicate discounts the slot being vacated.
export const ADVISER_PLAYS: { play: SearchPlay; label: string }[] = [
    { play: SearchPlay.Site, label: PLAY_LABELS[SearchPlay.Site] },
    { play: SearchPlay.Adviser, label: 'Turn faceup' },
    { play: SearchPlay.RevealedVision, label: PLAY_LABELS[SearchPlay.RevealedVision] },
    { play: SearchPlay.Conspiracy, label: PLAY_LABELS[SearchPlay.Conspiracy] },
    { play: SearchPlay.Discard, label: PLAY_LABELS[SearchPlay.Discard] }
]

export type AdviserPlacement = {
    play: SearchPlay
    label: string
    blockedBecause: string | undefined
}

// A refused Site or Adviser placement is shown greyed with its reason; the
// Conspiracy and the Vision are refused for almost every card and are hidden.
export function teaches(play: SearchPlay): boolean {
    return play === SearchPlay.Site || play === SearchPlay.Adviser
}

export function adviserPlacements(
    state: HydratedOathGameState,
    playerId: string,
    cardId: string
): AdviserPlacement[] {
    return ADVISER_PLAYS.map((option) => ({
        ...option,
        blockedBecause: HydratedPlayFacedownAdviser.reasonCannotPlay(state, playerId, {
            cardId,
            play: option.play
        })
    })).filter((option) => option.blockedBecause === undefined || teaches(option.play))
}
