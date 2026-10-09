# Art drawn in code

The default when the user supplies no assets. MarraCash is the worked example: a whole title whose board, shops, pawns, fountains, palms, cobbles and cards are SVG generated from data, because its permission covers the game and not its art. Magna Grecia's `components/board/*Layer.svelte` and `*Art.svelte` show the same for a hex map.

## Method

- **Geometry from data.** The board's coordinates live in one `boardGeometry.ts` with a spec, derived from the logic package's board data, never measured from a picture. Hit targets are transparent shapes carrying the model's ids.
- **One `<defs>` per motif.** A repeated element (a pawn, a token, a tile back, an awning) is defined once in a `*Defs.svelte` and placed with `<use>`; its shape lives in a `utils/*Shape.ts` that a spec can check, as `pawnShape.ts` and `cobbles.ts` do.
- **Seat colour from the session.** Every player-coloured element reads `gameSession.colors`; the colorizer's palette is the only place a seat colour is written.
- **Tokens in text.** A resource named in a panel or a history sentence is drawn as its symbol, the way Oath's `TokenText` does, so the table and the sentences share one vocabulary.
- **Palette as tokens.** Colours are CSS custom properties declared in `app.css` under `[data-game-ui="<id>"]` and exposed as utilities; `palette.spec.ts` fails on a raw colour anywhere in the package. The contract's palette section states what each token means (Oath: amber is yours to act on, rose costs or threatens).
- **Fonts.** OFL fonts only, as woff2 under `src/lib/fonts/` with the licence text beside them, loaded through `CustomFont`.
- **Cards and tiles.** A card face is a component that lays out its data: frame, name, cost, text with tokens, suit or kind mark. Enlarging shows the same component at a larger size, never a second asset.
- **The cover.** One `cover.jpg` composed for 150px and 340px heights, the title readable at both, rendered from the same SVG vocabulary and exported once.
- **Rasters.** Only when a texture cannot be drawn: JPEG unless transparency is real, at most twice the rendered size, with a README stating how it was made.

## Specs that guard it

- `palette.spec.ts`: every colour is a declared token.
- `boardGeometry.spec.ts`: every board place in the logic's data has a position, and no position names a place the data lacks.
- An image coverage spec, where any raster or SVG file exists: every name a lookup can build is bundled.
- Readiness gate 1 and 2 pass on the first run.
