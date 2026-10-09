# Which sibling to copy

Copy package configuration and conventions from the sibling; take contracts from the canonical interfaces in DESIGN.md. Read the sibling's `src/definition/`, `src/model/`, its docs, and its UI's `model/session.svelte.ts` and `components/GameTable.svelte` before designing.

| The title has | Copy from | Because |
| --- | --- | --- |
| cards with printed powers | `games/oath` | card data in `src/data/`, effects registered per card and timing in `src/powers/registry.ts`, corpus reach and playthrough sweeps, `docs/rulings.md` and `docs/known-deviations.md` |
| private hands and a deck | `games/lowenherz` | owner-known hands, deck assembly from typed card unions, the densest action tests; keep the session far smaller than its 2,400 lines |
| a hex board | `games/magna-grecia` | common's `HexGrid` and axial coordinates, a layered SVG board, the layout exemplar, `docs/rules-interpretations.md` |
| a square or route board | `games/marracash` | board as data with a spec checking derived routes (`docs/board-map.md`), everything drawn in code, `hoverOrTap` touch handling |
| sealed or simultaneous bids | `games/marracash` | the only title on common's `SimultaneousAuction`, `Policy.Actor` bids, documented undo barriers, the strongest Playwright suite |
| sequential bidding | `games/santiago` | `stateHandlers/bidding.ts` |
| a hidden bag or private money | `games/santiago`, `games/estates` | `docs/visibility.md` compatibility notes, the reference `competition.spec.ts` |
| dice | `games/oath` | the end die and battle dice from the state PRNG, golden-vector specs for faces to outcomes |
| phases or eras players navigate by | `games/indonesia` | round and phase managers feeding history interstitials, `utils/actionAggregator.ts` |
| many piece moves to animate | `games/bus`, `games/sol` | the animator files behind `ANIMATION_PATTERN.md` |
| 18xx mechanics | `libs/18xx` and `games/shikoku-1889` | the family library; follow `docs/agents/18xx-design.md` instead of this table |

Whatever the kind, every title also takes from Oath: the `R-x.y` citation convention, the revision flag, the palette spec that fails on a raw colour, the image coverage spec, the named table fixtures behind the Playwright contract scenarios, and the session harness that runs the real session in vitest.
