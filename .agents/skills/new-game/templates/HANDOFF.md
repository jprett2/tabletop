# <Title> handoff

The resumable state of the build. A fresh session reads this, the playbook and the open tickets, and continues from the frontier. Appended after every ticket; never rewritten.

## Where things are

- Spec: issue #<n>. Tickets: issues #<n> to #<n>.
- Branch: `<branch>`. Scaffold commit: `<sha>`.
- Docs: `games/<slug>/docs/` and `games/<slug>-ui/docs/ui-interaction-visual-contract.md`.

## Phase and gate

Current phase, and what the gate still needs.

## Decisions made during the build

Each with the ticket that made it and the digest section it bears on. A decision that changed the spec names the comment on the spec issue that records it.

## Ticket log

- **#<n> <title>:** closed <date>, commit `<sha>`; what it delivered; what it found that later tickets must know.

## Open findings

Anything found but not yet fixed, with the ticket or audit that will take it.
