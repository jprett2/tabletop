# <Title> components

The inventory the data files transcribe. Ids are permanent: game state stores ids only, and an id once published is never reused or renamed.

## Id scheme

`<kind>.<group>.<name>` in kebab case, for example `card.arcane.alchemist`, `tile.forest.3`, `site.cradle.ancient-forge`. Groups are the rulebook's own groupings.

## <Kind> (<count>)

| Id | Printed name | Count | Printed values | Printed text | Digest section |
| --- | --- | --- | --- | --- | --- |

One table per kind: cards by deck or suit, tiles by type, board spaces, tokens, dice faces, tracks. Printed values are every number on the component (cost, strength, points). Printed text is verbatim.

## Totals

| Kind | Rulebook says | Rows above |
| --- | --- | --- |

The two columns match before the data ticket starts.
