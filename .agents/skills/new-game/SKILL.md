---
name: new-game
description: Build a new game title from its rulebook as one unattended pass, from intake to a pull request.
argument-hint: "<slug> [phase]"
disable-model-invocation: true
---

# New game

Run the phases of [the playbook](../../../docs/agents/new-game-playbook.md) for one title. The argument is the title's slug, and optionally the phase to resume at; without a phase, start at the first phase whose gate is open.

Read first: [DESIGN.md](../../../docs/DESIGN.md), the [coding policy](../../../docs/agent-coding-policy.md), `libs/common/CONTEXT.md`, `libs/frontend-components/CONTEXT.md`. Then pick the sibling titles from [siblings.md](reference/siblings.md) and read their definition, model and session files before designing anything: the sibling is the convention, the canonical interfaces are the contract.

Every file this skill writes into `games/<slug>/docs/` starts from the matching file in [templates/](templates/). A template's headings are the completion criterion for that file: a heading left empty means the phase is not done.

## Phase 0: intake

1. Collect the sources the user gives: rulebook, FAQ, errata, card or tile text, assets. Transcribe scans into text with the `research` skill before reading them as rules. Record each source's name and date at the top of the digest.
2. Write `rules-digest.md` from [its template](templates/rules-digest.md). Done when every rule the game needs to play is a numbered section, every component count and track value is in it, and nothing in it comes from memory of the game rather than from a supplied source.
3. Write `components.md` from [its template](templates/components.md). Done when every physical component has a row with a permanent id and the text printed on it.
4. Write `open-questions.md` from [its template](templates/open-questions.md) by running the `grilling` skill over the digest: every silence, ambiguity, FAQ or errata conflict, and every place two readings would make different code. Each question carries a recommended ruling with the digest section it hangs on.
5. Put the questions to the user, one round at a time as `grilling` does. Gate 0 is passed when each question has an answer or an accepted recommendation. Record each as a ruling in `rulings.md` from [its template](templates/rulings.md); a question the user could not answer becomes a provisional ruling.

## Phase 1: design

1. Run `grill-with-docs` over the domain: glossary, state shape, action list, machine states, hidden information and who knows what, the information-revealing actions that bound Undo, game end and scoring. Each decision names its `R-x.y`. Write `visibility.md` from [its template](templates/visibility.md) when anything is hidden.
2. Draft `games/<slug>-ui/docs/ui-interaction-visual-contract.md` under the [contract guide](../../../docs/ui-interaction-visual-contract.md) with the [layout rules](../../../docs/game-ui-layout.md), the [interaction semantics](../../../docs/user-interactions.md) and the `game-ui-animation` skill. Start from the Oath principle that the table is for looking, a press enlarges, and the panel chooses; depart from it only for a reason the contract states. Number every verification scenario. Include the animation plan and the phone layout.
3. Write `art-plan.md` from [its template](templates/art-plan.md) following [art.md](reference/art.md). Without a supplied asset every visual is drawn in code; a supplied asset needs its `PERMISSIONS.md` entry before it is used.
4. Fix the compatibility plan in the spec: a revision field in state from the first release, `randomnessVersion: 1`, `supportsStartingPositions`, `scoring.finalScores`, visibility registration where anything is hidden, version 0.1.0 with Alpha visibility and the beta flag.
5. Run `to-spec`, then `to-tickets` with the layered order and acceptance criteria in [tickets.md](reference/tickets.md), publishing to the fork's issues. Gate 1 is passed when the user approves the spec and the tickets.

## Phase 2: build

1. Scaffold with `pnpm turbo gen create-game` and `create-game-ui`, add the catalogue entry, and commit that as the first layer.
2. Create `games/<slug>/docs/HANDOFF.md` from [its template](templates/HANDOFF.md).
3. Work the frontier: for each ticket whose blockers are closed, claim it, dispatch a fresh subagent with the ticket body, `HANDOFF.md` and the instruction to run `implement`, then check every acceptance criterion yourself against the diff and the test run. A criterion that fails goes back to a subagent with the failure; it never gets ticked by reading the subagent's report. Commit on the ticket's layer, close the issue, append the ticket's outcome and any decision it made to `HANDOFF.md`.
4. Gate 2 is passed when every ticket is closed, `pnpm turbo run build lint check test --filter=@tabletop/<slug>... ` is clean, and `HANDOFF.md` says so.

## Phase 3: self-review

Run the loops in [self-review.md](reference/self-review.md) in order, each until it reports nothing left. Gate 3 is passed when `game-pr-readiness` returns READY and the three audits list no gap that is not in `known-deviations.md` from [its template](templates/known-deviations.md).

## Phase 4: play verification

Run [play-verification.md](reference/play-verification.md). Gate 4 is passed when the contract's exercise record names every scenario as automated or checked, the scripted games pass for every player count and option, the hosted walkthrough found nothing, and the rehearsal fixture replays.

## Phase 5: handover

1. Push the branch to the fork.
2. Open a pull request against `justinkwaugh/tabletop` whose description carries the readiness report, the known deviations, the provisional rulings, and the player counts and options the scripted games covered.
3. Tell the user the pull request is up and that Justin releases. Subscribe to the pull request and drive it to green as the review rules require.
