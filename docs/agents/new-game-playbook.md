# New game playbook

How a title goes from a rulebook to a pull request in one unattended pass. The `/new-game` skill runs it; this page is the map the skill and its reviewers share. [DESIGN.md](../DESIGN.md) owns the architecture, the [coding policy](../agent-coding-policy.md) owns the code, and `game-pr-readiness` owns the acceptance bar; this page owns the order of work and the gates between phases.

## Why the phases are shaped this way

Oath landed complete and then shipped six corrective releases in seven days. Every one of those corrections belongs to a phase here: readiness-gate fixes (phase 3), hidden-information hardening (phase 2 tickets 3 and 7), live-play UI feedback (phase 1's contract and phase 4's hosted walkthrough), rules correctness found at the table (phase 0's digest and phase 3's rules audit), and history attribution (phase 2's metadata rule and phase 3's history audit). The pass is one-shot when each of those finds its defect before the first release instead of after.

## Phases and gates

| Phase | Who | Produces | Gate |
| --- | --- | --- | --- |
| 0 Intake | user supplies, agent structures | rules digest, component inventory, open questions | every open question answered or its recommendation accepted |
| 1 Design | user and agent | rulings, domain model, visual contract, art plan, compatibility plan, spec, tickets | user approves the spec and the ticket order |
| 2 Build | agent, one ticket per subagent | the two packages, layered commits, a resumable handoff | every ticket closed with its acceptance criteria checked |
| 3 Self-review | agent | clean `simplify`, `code-review`, readiness, rules, component and history audits | every audit reports nothing left |
| 4 Play verification | agent | scripted complete games, hosted walkthrough, phone pass, a rehearsal fixture | the contract's exercise record names every scenario as automated or checked |
| 5 Handover | agent, then Justin | a pull request to the upstream repository | merged and released upstream |

The user touches phases 0 and 1 and reads the result of 5. Phases 2 to 4 run from the decisions phase 1 recorded.

### Phase 0: intake

Inputs arrive as any of a rulebook PDF, pasted text, card or tile text as a sheet, or scans. Scans are transcribed to text before anything else reads them. The agent writes, in `games/<slug>/docs/`:

- `rules-digest.md`: the rules as numbered sections the code will cite as `R-x.y`, in play order, with every component count and track value. Built from the supplied sources alone.
- `components.md`: the inventory to transcribe into data, each component with its permanent id.
- `open-questions.md`: every silence, ambiguity and conflict between rulebook, FAQ and errata, each with a recommended house ruling.

The user answers the questions. Each answer becomes a ruling.

### Phase 1: design

Grilling settles the domain model: glossary, state shape, action list, machine states, what is hidden from whom, which actions reveal information and so bound Undo, how the game ends and scores. The UI contract is drafted before a component exists, with its visual intents, precedence, shared state, render ownership, numbered scenarios, animation plan and phone layout. The art plan names a source for every visual: drawn in code from data by default, or a supplied asset with a `PERMISSIONS.md` entry. The compatibility plan fixes the revision flag, randomness version, tournament support and visibility registration. `to-spec` and `to-tickets` turn this into the fork's issues in the layered order the skill lists.

### Phase 2: build

An orchestrating session claims each frontier ticket, runs it in a fresh subagent with `implement`, checks the acceptance criteria, commits in the ticket's layer, closes the issue and appends to the title's `HANDOFF.md`, so a new session resumes from the handoff if the orchestrator stops. Two rules from the day Oath spent retrofitting them: every action records in `metadata` what the history will need to say, and every rule test asserts the whole processed cascade, then replay and Undo.

### Phase 3: self-review

Run until each reports nothing left: `simplify`, `code-review` against the spec, `game-pr-readiness` with every violation fixed, then three audits by fresh agents. The rules audit walks the digest section by section and finds the code or spec for each. The component audit checks every component in the inventory has data, an effect, a reach test and a playthrough test. The history audit reads every action type as the actor, another seat and a spectator. A gap either gets fixed or gets a line in `known-deviations.md`.

### Phase 4: play verification

A scripted player plays complete games in the harness for every player count and option through ordinary actions, then the run is checked by persisted replay, full reverse Undo and cascade regeneration against the final state. The local hosted site is driven with one browser account per seat, comparing each projection, refreshing, resuming and undoing across seats, and at a phone viewport. The first complete hosted game becomes the title's rehearsal fixture.

### Phase 5: handover

The branch is pushed to the fork and a pull request opened against the upstream repository. Its description carries the readiness report, the known deviations and the provisional rulings. Justin reviews, merges and releases. Feedback from the first real games enters through `triage`, and rule corrections ship under the revision flag so stored games keep the rules they started with.

## Standing decisions

- A title starts at version 0.1.0 with Alpha visibility and the beta flag.
- The rulebook is cited in code as `R-x.y`; house rulings are `R-x.y-H1` in `docs/rulings.md`; rules of the implementation are `R-X.n`; departures are listed in `docs/known-deviations.md`.
- Every first pass includes tournament support, hidden-information projection and exploration where the game hides anything, animation through `AnimationContext`, and a phone layout verified by touch scenarios.
- The sibling to copy is chosen by game kind: the skill's sibling table names them.
- Art without a supplied asset is drawn in code as SVG from data, with OFL fonts.
