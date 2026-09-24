import { ActionType, Banner, type PowerUseKey, type WarbandMoveOption } from '@tabletop/oath'
import type { StagedSelectionState } from '@tabletop/frontend-components'
import { StagedFlow, type StagesCover } from './stagedFlow.svelte.js'
import type { PowerChoicePicks } from './powerChoices.js'

/** R-7.4 — a modifier declared on the staged action, with the choices its text opens. */
export type ModifierDeclaration = { use: PowerUseKey; picks?: PowerChoicePicks }

// A `type`, not an `interface`: the shared helpers are generic over `Record<string, unknown>`.
export type OathValueByStage = {
    action: ActionType
    modifiers: ModifierDeclaration[]
    warbandMove: WarbandMoveOption
    site: string
    card: string
    discardOrder: string[]
    relicSlot: string
    banner: Banner
    option: string
    amount: number
}

export const OATH_STAGE_ORDER = [
    'action',
    'modifiers',
    'warbandMove',
    'site',
    'card',
    'discardOrder',
    'relicSlot',
    'banner',
    'option',
    'amount'
] as const

export type OathStage = (typeof OATH_STAGE_ORDER)[number]

const _stagesAreCovered: StagesCover<OathValueByStage, typeof OATH_STAGE_ORDER> = true
void _stagesAreCovered

export type OathSelectionState = StagedSelectionState<OathValueByStage>

/** The action grid's flow: an action, the modifiers declared on it, then what it acts on. */
export class OathSelection extends StagedFlow<OathValueByStage> {
    constructor() {
        super(OATH_STAGE_ORDER)
    }

    get action(): ActionType | undefined {
        return this.value('action')
    }

    get modifiers(): ModifierDeclaration[] {
        return this.value('modifiers') ?? []
    }

    // Back takes the last modifier declared, one at a time, before the action under it.
    back(): OathStage | undefined {
        const modifiers = this.modifiers
        if (this.highestManualStage() === 'modifiers' && modifiers.length > 1) {
            this.set('modifiers', modifiers.slice(0, -1))
            return 'modifiers'
        }
        return super.back()
    }
}
