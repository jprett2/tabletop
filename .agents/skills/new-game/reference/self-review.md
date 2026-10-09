# Self-review loops

Run in this order. Each loop repeats until it reports nothing left; a fix made in a later loop sends the title back through the earlier ones once more.

1. **`simplify`** over both packages.
2. **`code-review`** of the whole branch against the spec issue, with the fixed point at the scaffold commit.
3. **`game-pr-readiness`** with the base at the scaffold commit. Fix every violation it lists, then rerun until READY.
4. **Rules audit.** A fresh subagent reads `rules-digest.md` section by section. For each section it names the spec that covers it and the code that implements it, or writes the section into a gap list. Every gap is fixed or recorded in `known-deviations.md` with what the engine does instead and what governs.
5. **Component audit**, for a title with cards, tiles or sites. A fresh subagent reads `components.md` row by row and finds the data record, the effect registration, the reach test and the playthrough test for each. A row missing any of the four is a gap, handled as above.
6. **History audit.** A fresh subagent lists every action type and, for each, reads its history sentence as the actor, as another seat and as a spectator, and checks the sentence comes from input and `metadata` alone. A sentence that names a seat wrongly, says "you" to the wrong reader, or needs a fact the action did not record is a gap: the action records the fact and the sentence is rewritten.
7. **Docs audit.** `rulings.md`, `known-deviations.md`, `visibility.md`, the visual contract and the package README say what the code does today; a line that no longer does is removed or corrected.
