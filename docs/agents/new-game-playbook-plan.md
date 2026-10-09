# Plan: a one-shot process for building the next game on Board Together

Status: draft for discussion, not yet a playbook. Nothing in this file is committed as process until the questions at the end are answered.

## 1. What the review found

### 1.1 How Oath was actually built

- Oath landed on 2026-09-29 as one complete drop, split into layered commits: entry point and docs, state model and definition, card data, card powers, player actions, rule utilities and state handlers with the test harness; then the UI in four commits: client model, Svelte components, images, routes and docs and tests. The art arrived in the first drop.
- The same day brought a round of readiness fixes that map one to one onto the `game-pr-readiness` gates: metadata-only Info entry, tournament starting positions, Alpha visibility, shared lint config, import cycles, no `Type.Unsafe`, sequenced let-peek, SVG icons, scoped styles.
- Day two was hidden-information hardening: retained knowledge in state, exploration from projections, projection tests for every action, warbands keyed by owner not colour, final scores and a competition spec. Then release 0.1.0.
- Days three to four were live-play feedback, the biggest UI change of all: one palette, a visible Undo, one frame per panel, dice beside the Campaign, every count as number buttons, every target as a row, and the governing principle "the table is for looking; a press enlarges; the panel chooses". Focus views and full screen followed. Phone fit was fixed twice.
- Days four to six were rules correctness found in play: costs totalled before an action is accepted, facedown plays taking modifiers, Land Warden, Forced Labor, battle-plan costs. These shipped under a stored revision flag so old games keep their rules.
- Seven releases in eight days. Of those, one was the initial release and six were corrections that a one-shot process must catch before the first.

### 1.2 What made Oath tractable at 95k lines

- Printed cards as static data plus a per-card effect registry, keyed by card id and power timing, with the card's text beside each registration.
- Corpus sweeps that prove every built card is reachable by every route and fires through the engine, so a missing power is a failing test, not a surprise in play.
- Rules cited in code as `R-section`, house rulings as `R-section-H1` in `docs/rulings.md`, implementation rules as `R-X.n`, and departures in `docs/known-deviations.md`. Ambiguity has a home before it becomes a bug.
- A revision flag in state from the first release, so later rule fixes never migrate stored games.
- The vault for hidden information, `requireVault()` forcing host execution, actor-known and owner-known metadata, and an exploration that deals every unknown card afresh.
- A UI visual contract with about 60 numbered scenarios, each marked Automated or Manual, and a Playwright suite that opens named table fixtures by name.
- A palette spec that fails on any raw colour and a coverage spec that fails on any image a lookup can name but the bundle lacks.

### 1.3 What the other titles add

- 18xx family: evidence-first slice design docs with the same headings every time (Evidence and scope, Shared implementation, Title policies, Prototype and compatibility, Verification), prepared mid-game scenarios so late mechanisms are testable before the opening works, a runtime-contract snapshot that catches serialized changes, and a scripted complete-game player that plays real games end to end and then checks replay, full reverse Undo and cascade regeneration. Their review docs list the recurring failure classes: incomplete lifecycle consequences, history reading meaning from patches, tests that assumed manual step completion, one title's rule treated as a family rule, interfaces that drop information, presentation leaking into shared code, stale READMEs.
- MarraCash: the cleanest docs set (rulings tied to tests, board as data with a spec that checks it, visual contract), the only use of the shared simultaneous auction, the strongest browser tests (turns, history, touch, protected, full game), and procedural SVG art because no art permission exists.
- Magna Grecia: the named layout exemplar, hex grid from common, layered SVG board, rules interpretations doc.
- Löwenherz: the densest logic tests and the private-hand pattern, and a 2,400-line session as the thing to avoid.
- Indonesia and Bus: history aggregation through a pure aggregator and phase interstitials, the animation pattern.
- Estates: the reference competition spec. Fresh Fish and Sol: rehearsal fixtures replaying real games.
- Repo-wide: no CI. Verification is the readiness skill, the package scripts and the local hosted site. Registration touches exactly one shared file, `config/config-games/src/games.json`.

### 1.4 Gaps the one-shot goal exposes

- No new-game playbook exists. DESIGN.md deliberately excludes scaffolding and work logs, so the process lives in people's heads and in Oath's commit log.
- No intake format for rules, FAQ, errata and card text, so each game re-invents its rules digest.
- No "first live game" substitute. Oath's six fix releases came from humans playing on the site. A one-shot process needs a scripted complete game plus a hosted multi-account walkthrough before handover.
- No art pipeline for a title without publisher assets. MarraCash shows it can be done in SVG, but the method is not written down.
- The fork has no issues, so the `to-spec` and `to-tickets` skills, which publish to GitHub Issues, have nowhere to publish unless we use the fork's tracker.
- The repo is bigger than one context window. "One shot" has to mean one unattended pass made of several sessions chained by plan and handoff documents, not one session.

## 2. The proposed process

Six phases. The user is involved in phases 0 and 1 only. Phases 2 to 5 run unattended against the decisions recorded in phase 1. Every phase ends with a gate that must pass before the next starts.

### Phase 0: Intake (user supplies, agent structures)

Inputs from the user: rulebook, FAQ and errata if they exist, card or tile text, player counts, any assets and the permission that covers them, which sibling title the user considers closest.

Outputs, all in `games/<slug>/docs/`:

- `rules-digest.md`: the rules rewritten as numbered sections that the code will cite as `R-x.y`, in turn order, with every component count and track value. Produced by the `research` skill from the supplied sources only; nothing from memory.
- `components.md`: the complete inventory as data to be transcribed (cards, tiles, board spaces, tokens), each with a permanent id scheme.
- `open-questions.md`: every ambiguity, silence or conflict between rulebook, FAQ and errata, each with a recommended house ruling. Produced through the `grilling` skill. This is the file the user answers.

Gate 0: the user has answered every open question or accepted the recommendation. Answers become `rulings.md` entries with `R-x.y-H1` ids. Unanswered questions become provisional rulings, marked as Oath marks them.

### Phase 1: Design (grill, then spec)

- Domain model through `grill-with-docs`: glossary for the title's terms, the state shape, the action list, the machine states, what is hidden from whom, what counts as an information-revealing action (the undo barrier list), what is scored. Each decision cites the digest.
- UI contract before any component exists: `docs/ui-interaction-visual-contract.md` drafted with its visual intents, precedence rules, shared state, render ownership and numbered verification scenarios. The Oath principle "look on the table, choose in the menus" is the default unless the title argues otherwise. Phone layout is decided here, not discovered later.
- Art plan: for each visual element, the source (procedural SVG in code, traced SVG, user-supplied raster with a `PERMISSIONS.md` entry), the palette tokens, the fonts (OFL only, through `CustomFont`), the cover composition at 150px and 340px. Without supplied assets, the default is MarraCash's method: everything drawn in code from data.
- Compatibility plan: revision flag in state from the start, `randomnessVersion: 1`, starting positions and final scores for tournaments, visibility registration if anything is hidden.
- Spec through `to-spec`, then `to-tickets` into the layered order Oath used, each ticket sized for one context window with explicit blockers:
  1. package scaffold from `turbo gen`, docs, build config, catalogue entry
  2. component data and ids, with data-integrity specs
  3. state model and schemas, hydration round trip, projection schema if hidden
  4. actions, one file each, with specs
  5. card or tile effects through a registry, with corpus reach and playthrough sweeps
  6. rule utilities and state handlers, with the turn-engine walk and seeded replay-and-undo walk
  7. definition, scoring, competition spec, visibility and exploration specs
  8. UI session and drafts, with session harness specs
  9. UI components per the contract, palette spec, image coverage spec
  10. table fixtures and Playwright contract scenarios
  11. history descriptions for every action and every seat, major events
  12. scripted complete game, hosted multi-account walkthrough, readiness audit

Gate 1: the user approves the spec and the ticket order. This is the last required user touch before handover.

### Phase 2: Build (unattended, one ticket per session)

- Each session: `handoff` document in, `implement` with `tdd` at the agreed seams, `code-review`, commit, `handoff` document out. Commits stay layered the way Oath's first drop was.
- Standing rules from `docs/agent-coding-policy.md`: no casts, no `$effect` for state, no comments except rule citations, session owns actions, staged selections through the shared helpers, one Undo and no Back.
- Every action records in `metadata` what the history needs, from the start. Oath spent a day retrofitting seat and warband attribution.
- Every rule test asserts the whole processed cascade, then replay and Undo, as the 18xx family learned.

### Phase 3: Self-review loops (unattended)

Run in order, and loop until clean:

1. `simplify` on the whole title.
2. `code-review` on the whole diff against the spec.
3. `game-pr-readiness`, all twelve gates, fixing every violation.
4. A rules audit: a fresh agent reads `rules-digest.md` section by section and finds the spec or code that implements each section, listing anything unimplemented or deviating into `known-deviations.md`.
5. A card or tile audit when the title has them: every component in `components.md` has data, an effect, a reach test and a playthrough test, or a named reason in `known-deviations.md`.
6. A history audit: every action type produces a sentence for the actor, every other seat and a spectator, and never reads a patch.

### Phase 4: Play verification (unattended)

- Scripted complete game in the harness for every player count and option, submitting only ordinary actions, then persisted replay, full reverse Undo, and cascade regeneration compared on final state. This is the 18xx slice-20 method applied to any title.
- Hosted walkthrough through `local-hosted-game`: separate browser accounts for each seat, protected projections checked per seat, refresh and resume, Undo across seats, phone viewport.
- A Playwright phone pass over the contract scenarios at a phone viewport with touch emulation.
- The result of the first complete hosted game is saved as a rehearsal fixture under `games/<slug>/rehearsals/`.

Gate 4: a report listing what was verified and what remains manual, written into the contract's exercise record.

### Phase 5: Handover and release

- Branch pushed to the fork, PR to the upstream repository with the readiness report, the known-deviations list and the provisional rulings in the description.
- The user plays the first real game; feedback goes through `triage` into issues; fixes ship under the revision flag through the `release` skill.

## 3. What I would create in the repo to make this real

1. `docs/agents/new-game-playbook.md`: the process above in final form, routed from `AGENTS.md`.
2. `.agents/skills/new-game/SKILL.md`: the executable version, phase by phase, with the gate checklists and the exact commands.
3. Intake templates under `.agents/skills/new-game/templates/`: `rules-digest.md`, `components.md`, `open-questions.md`, `rulings.md`, `known-deviations.md`, `visibility.md`, `art-plan.md`.
4. A `complete-game` harness module in `libs/frontend-components` or a per-title script pattern, modelled on `apps/18xx-playground/src/demo/completeGame.ts`, so phase 4 is not rebuilt per title.
5. A procedural-art guide distilled from MarraCash and Magna Grecia: tokens, board layers, card faces in SVG, the palette and coverage specs.
6. A fix to the generator templates where they lag the current conventions (`defineGame`, `canonicalStateValidator`, `metadata.visibility`, the revision flag, the harness page), so scaffolding starts at the readiness bar.

## 4. Decisions recorded on 2026-10-09

- **Next game:** not decided. The playbook is written generically, with a sibling-selection step per game kind.
- **Rules input:** any of rulebook PDF, pasted text, card text as a sheet, or card scans; text is the preferred form. Intake must accept all four and transcribe scans into text first.
- **Art:** drawn in code as SVG from data, with OFL fonts through `CustomFont`, when no assets are supplied. A supplied asset needs a `PERMISSIONS.md` entry.
- **Session model:** one unattended pass made of several sessions. These run on the user's computer, not in the cloud. The design is an orchestrating session that delegates each ticket to a fresh subagent with a handoff, keeps its own context small, and writes a resumable handoff file after every ticket so a new local session can continue if the orchestrator stops.
- **Tickets:** the fork's GitHub Issues, so `to-spec`, `to-tickets`, `triage` and the frontier queries work unchanged. The triage labels need creating in the fork once.
- **Process home:** the fork only: `docs/agents/new-game-playbook.md` plus `.agents/skills/new-game/`, routed from `AGENTS.md`.
- **Release:** handover is a PR to `justinkwaugh/tabletop` with the readiness report, the known deviations and the provisional rulings; Justin merges and releases.
- **Oath lessons outside git:** none. The commit history and package docs are the whole record.
- **Scope defaults for every first pass:** tournament support, hidden-information projection and exploration where the game hides anything, GSAP animation through `AnimationContext`, and a phone layout verified by Playwright touch scenarios.
- **Citations:** Oath style. `R-x.y` in code, house rulings `R-x.y-H1` in `docs/rulings.md`, implementation rules `R-X.n`, departures in `docs/known-deviations.md`.
- **First version:** 0.1.0, Alpha visibility, beta flag.

## 5. Changes these decisions make to section 2

- Phase 1 adds an animation plan to the UI contract: which actions animate, which run the fast fallback, and the reduced-motion behaviour, following `ANIMATION_PATTERN.md` and the `game-ui-animation` skill.
- Phase 2 runs as orchestrator plus per-ticket subagents on the user's machine. Each ticket's issue in the fork is the handoff; the orchestrator claims it, runs it, closes it, and appends to a resumable `HANDOFF.md` in the title's docs.
- Phase 4's hosted walkthrough uses the devcontainer's Firestore and Redis services through `local-hosted-game`.
- Phase 5 ends with a PR to upstream, not a release.
