import { assertExists, type Color } from '@tabletop/common'
import { pieceFiles } from './imageManifest.generated.js'
import { imageNamed, indexByName } from './manifestIndex.js'

// Cut onto one canvas so relative heights survive; callers set height, not width.
function byColor(kind: 'warband' | 'pawn'): Map<string, string> {
    const prefix = `${kind}.`
    return new Map(
        [...indexByName(pieceFiles)]
            .filter(([name]) => name.startsWith(prefix))
            .map(([name, url]) => [name.slice(prefix.length), url] as const)
            .filter(([key]) => key !== BANDIT_KEY)
    )
}

// R-10.3 — the bandits are not a colour.
const BANDIT_KEY = 'bandit'

const warbandsByColor = byColor('warband')
const pawnsByColor = byColor('pawn')

export function warbandImage(color: Color): string {
    return imageNamed(warbandsByColor, color)
}

export function warbandImageKeys(): string[] {
    return [...warbandsByColor.keys()]
}

export function pawnImage(color: Color): string {
    return imageNamed(pawnsByColor, color)
}

export function pawnImageKeys(): string[] {
    return [...pawnsByColor.keys()]
}

// R-2.8.3, R-10.3 — the bandits' figure, for the sites they rule.
export function banditWarbandImage(): string {
    const url = pieceFiles['./pieces/warband.bandit.png']
    assertExists(url, "The bandits' figure is bundled")
    return url
}
