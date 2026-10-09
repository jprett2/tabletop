# <Title> visibility

Written when anything in the game is hidden from anyone. The contract this title registers under `docs/hidden-information.md`.

## What is concealed

The host-only fields of canonical state (decks in order, bags, facedown identities), with the digest section that hides each. Public state carries what the rules make public about them: counts, top backs, whether a stack is empty.

## What each player knows

Owner-known fields (hands, private money, what a player has peeked at) and the policy on each. What a player has seen stays in state, owner-known, so a projection alone says what its player knows.

## Action records

For each action that reads concealed state: which metadata fields are actor-known, which are public, and which custom policies apply. Draws and reveals are engine output written in `apply` from canonical state; the engine strips them from anything a client submits.

## Undo barriers

The actions that set `revealsInfo`, and why each discloses something.

## Exploration

How `createFromProjectedState` keeps every card the projection names and deals the rest, and how `createFromCanonicalState` reshuffles within each hidden list.

## Compatibility

No migrations: Logic and UI publish together, and a stored game created under an earlier revision keeps its rules.

## Verification

The specs that cover each section above.
