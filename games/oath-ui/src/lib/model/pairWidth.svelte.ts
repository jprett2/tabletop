import { untrack } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { SvelteMap } from 'svelte/reactivity'
import { assertExists } from '@tabletop/common'

/**
 * One width for a pair of confirms, the wider one's, whether the two stand side by side or, when
 * they do not fit, one per line. A grid's equal columns give one width only on one row, so each
 * button's own width is measured instead (its label, sized to itself, plus the button's padding
 * and border), and every button in the pair takes the widest as its minimum.
 */
export class PairWidth {
    private widths = new SvelteMap<HTMLElement, number>()

    /**
     * In CSS pixels, read from the layout rather than the screen, so a scaled panel reads the
     * same. Not rounded: the widest button is given back its own width, as a grid track would.
     */
    readonly widest = $derived(Math.max(0, ...this.widths.values()))

    /**
     * On a button's label, which sizes itself (`w-max`) whatever the button's width. It is read
     * before the first paint; a later change of layout alone (a font arriving) is read a frame
     * late.
     */
    readonly measure: Attachment<HTMLElement> = (label) => {
        const button = label.parentElement
        assertExists(button, 'A label sits in its button')
        let frame = 0
        const read = () => {
            const inside = getComputedStyle(label)
            const box = getComputedStyle(button)
            const width = [
                inside.width,
                box.paddingLeft,
                box.paddingRight,
                box.borderLeftWidth,
                box.borderRightWidth
            ].reduce((sum, length) => sum + parseFloat(length), 0)
            untrack(() => this.widths.set(label, width))
        }
        const layoutChanges = new ResizeObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(read)
        })
        read()
        layoutChanges.observe(label)
        return () => {
            layoutChanges.disconnect()
            cancelAnimationFrame(frame)
            untrack(() => this.widths.delete(label))
        }
    }
}
