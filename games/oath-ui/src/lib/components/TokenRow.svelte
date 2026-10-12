<script lang="ts">
    import { range } from '@tabletop/common'
    import type { SizedImage } from '$lib/images/manifestIndex.js'

    // A count picked from the pieces themselves (favor, secrets, warbands), one per unit held. A
    // tap on the Nth piece sets the count to N and rings the pieces up to it; a tap on the piece at
    // the count sets 0, or the floor where the count may not go under one (a banner's least bid).
    // A piece the rules do not let the count reach (over `addable`, or under `floor`) cannot be
    // tapped and keeps its place; one under the floor is still drawn picked, as it is paid.
    // `tone`: a picked piece that is placed, given or moved is ringed gold; one that dies or burns,
    // rose (`kill`); a row whose tap sends at once (`plain`) never shows a pick, its pieces whole.
    // `per`: pieces go `per` to a button (Blood Pact's pairs), the Nth button setting N x `per`; a
    // piece left after the last whole button keeps its place, faded, and is not a button.
    // A piece is 34 x 32 px, 44 px square on a phone; a pair 54 x 32, 66 x 44 on a phone.
    // Every count (`held`, `addable`, `picked`, `floor`, and what `label` and `ontap` get) is in pieces.
    let {
        image,
        held,
        addable,
        picked,
        label,
        ontap,
        busy,
        tone = 'gold',
        floor = 0,
        per = 1
    }: {
        image: SizedImage
        held: number
        addable: number
        picked: number
        label: (count: number) => string
        ontap: (count: number) => void
        busy: boolean
        tone?: 'gold' | 'kill' | 'plain'
        floor?: number
        per?: 1 | 2
    } = $props()

    const PICKED = {
        gold: 'border-oath-accent bg-oath-accent-soft ring-1 ring-oath-accent',
        kill: 'border-oath-danger bg-oath-danger-soft ring-1 ring-oath-danger'
    }
    const SIZE = {
        1: 'h-8 w-[34px] max-sm:h-11 max-sm:w-11',
        2: 'h-8 w-[54px] max-sm:h-11 max-sm:w-[66px]'
    }

    let plain = $derived(tone === 'plain')
    let ring = $derived(tone === 'kill' ? PICKED.kill : PICKED.gold)
    let buttons = $derived(Math.floor(held / per))
    let leftOver = $derived(held - buttons * per)
</script>

{#snippet pieces(count: number, on: boolean)}
    {#each range(1, count) as piece (piece)}
        <img
            class="h-5 w-auto max-sm:h-6 {on || plain ? '' : 'opacity-35'}"
            src={image.src}
            width={image.width}
            height={image.height}
            alt=""
        />
    {/each}
{/snippet}

<span class="inline-flex flex-wrap items-center gap-1">
    {#each range(1, buttons) as button (button)}
        {@const count = button * per}
        {@const on = !plain && count <= picked}
        {@const untappable = count > addable || count < floor}
        <button
            type="button"
            class="inline-flex {SIZE[per]} flex-none items-center justify-center gap-0.5
                   rounded-md border {on ? ring : 'border-oath-frame bg-oath-surface'} {busy ||
            (untappable && !on)
                ? 'opacity-40'
                : ''}"
            aria-pressed={plain ? undefined : on}
            aria-label={label(count)}
            disabled={busy || untappable}
            onclick={() => ontap(count)}
        >
            {@render pieces(per, on)}
        </button>
    {/each}
    {#if leftOver > 0}
        <span
            class="inline-flex {SIZE[1]} flex-none items-center justify-center rounded-md border
                   border-oath-frame bg-oath-surface opacity-40"
            aria-hidden="true"
            data-left-over
        >
            {@render pieces(leftOver, false)}
        </span>
    {/if}
</span>
