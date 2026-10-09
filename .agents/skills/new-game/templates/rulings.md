# Rulings

The code cites the rules as `R-<section>` of `rules-digest.md`. A citation ending in `-H1` or `-H2` names one of the house rulings below, made where the rules are silent or ambiguous. `R-X.<n>` names a rule of this implementation. A ruling marked *provisional* awaits the publisher's answer; it stands until answered. Each ruling names the spec that covers it.

## House rulings

- **R-x.y-H1:** the ruling, in one or two sentences, with the reading it rejects. Spec: `src/...spec.ts`.

## Rules of the implementation

- **R-X.1:** every choice arrives as explicit input from the player it belongs to; the engine infers none.
- **R-X.2:** undo stops at an action that revealed information: one that advanced the random stream, moved a card into or out of concealment, or showed a player something they had not seen.
- **R-X.3:** a game keeps the rules of the revision it was created under (`<slug>Revision`, set at initialization). Revision 1 is the first release.
