# Play verification

The stand-in for the first week of live play. Three runs and one artifact.

## Scripted complete games

Model: `apps/18xx-playground/src/demo/completeGame.ts` and its spec, and Oath's `src/actions/replay.spec.ts`.

Write `games/<slug>/src/testing/completeGame.ts`: a scripted player that, from an initialized game and a master seed, repeatedly asks the current handler for the valid actions of the active players, picks one by a seeded policy that prefers actions not yet taken this game, builds it through the action's own helpers, and submits it through `GameEngine`, until the game ends. It submits ordinary user actions only. Its spec runs every player count and every configuration option, with at least three seeds each, and for each run checks:

- the game reaches a terminal state and `scoring.finalScores` returns a score for every seat;
- persisted replay: serializing the action history and the initial state, replaying the user actions through a fresh engine, and comparing cascade lengths and the final state;
- full reverse Undo: undoing every processed action from the end back to the initial state, comparing with the initial state after each step's undo patch;
- for a title with hidden information, the same replay from each seat's projection reaches the same public final state, and a hidden read during projected execution defers rather than guesses.

A run that cannot reach the end because the policy stalls is a finding about the rules or the handlers, never a reason to widen the policy to system actions.

## Hosted walkthrough

Start the site with the `local-hosted-game` skill. In Playwright, one browser context per seat with its own account, plus a spectator. Drive one complete game, or the scripted player's first thirty actions, and check at each turn that each seat's visible state matches what `visibility.md` permits, that the acting seat's panel offers what the handler offers, that a refresh restores the same view, and that Undo across seats behaves as the contract says. Repeat the opening turns at a phone viewport with touch.

## Phone pass

Run the Playwright contract scenarios at a 390 by 844 viewport with touch emulation. Every scenario the contract marks Automated passes there as well as at desktop width.

## Rehearsal fixture

Export the first complete hosted game's canonical state and action history into `games/<slug>/rehearsals/first-game/` with a `fixture.mjs`, following `docs/game-rehearsals.md`, and confirm `pnpm rehearse <slug>` passes. The fixture is the guard for every later release of the title.
