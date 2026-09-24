<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { Attachment } from 'svelte/attachments'
    import { MediaQuery } from 'svelte/reactivity'

    let {
        fraction = 0.4,
        portraitFraction = 0.55,
        children
    }: {
        fraction?: number
        portraitFraction?: number
        children: Snippet
    } = $props()

    let scale = $state(1)
    let height = $state<number | undefined>(undefined)
    let columnHeight = $state(0)

    const portrait = new MediaQuery('(max-width: 640px) and (orientation: portrait)')

    let budget = $derived(columnHeight * (portrait.current ? portraitFraction : fraction))

    const measureColumn: Attachment<HTMLElement> = (node) => {
        const column = node.parentElement
        if (!column) return
        const read = () => {
            columnHeight = column.clientHeight
        }
        const observer = new ResizeObserver(read)
        observer.observe(column)
        read()
        return () => observer.disconnect()
    }

    // Scaling changes text wrap and so height: read at full width, ignoring self-caused resizes.
    const fitToBudget: Attachment<HTMLElement> = (node) => {
        const budgetNow = budget
        if (budgetNow <= 0) return
        let frame = 0
        let settledHeight: number | undefined
        const measure = () => {
            cancelAnimationFrame(frame)
            settledHeight = undefined
            scale = 1
            height = undefined
            frame = requestAnimationFrame(() => {
                const natural = node.scrollHeight
                if (natural <= 0) return
                scale = Math.min(1, budgetNow / natural)
                height = Math.ceil(natural * scale)
                frame = requestAnimationFrame(() => {
                    settledHeight = node.scrollHeight
                })
            })
        }
        const observer = new ResizeObserver(() => {
            if (settledHeight !== undefined && node.scrollHeight !== settledHeight) measure()
        })
        observer.observe(node)
        measure()
        return () => {
            observer.disconnect()
            cancelAnimationFrame(frame)
        }
    }
</script>

<div
    class="fit shrink-0"
    {@attach measureColumn}
    style="height:{height !== undefined ? `${height}px` : 'auto'};"
>
    <div
        class="fit__inner"
        {@attach fitToBudget}
        style="width:{scale < 1 ? `${100 / scale}%` : '100%'}; transform:{scale < 1
            ? `scale(${scale})`
            : 'none'};"
    >
        {@render children()}
    </div>
</div>

<style>
    .fit {
        position: relative;
        overflow: hidden;
    }
    .fit__inner {
        transform-origin: top left;
    }
</style>
