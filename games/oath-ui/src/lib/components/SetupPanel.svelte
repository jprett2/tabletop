<script lang="ts">
    import { ActionType, discardRegionFor } from '@tabletop/oath'
    import CardImage from '$lib/components/CardImage.svelte'
    import { widthAtHeight } from '$lib/images/cardShape.js'
    import { discardPositionLabel } from '$lib/model/discardOrder.js'
    import { cardName, regionName, siteName } from '$lib/model/names.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)
    let busy = $derived(gameSession.busy)

    let choosing = $derived(gameSession.validActionTypes.includes(ActionType.SetupChoice))
    let legalSites = $derived(gameSession.setup.sites)
    let siteId = $derived(gameSession.setup.siteId)
    let adviserCardId = $derived(gameSession.setup.adviserCardId)
    let hand = $derived(gameSession.setup.hand)
    let others = $derived(gameSession.setup.others)
    let tapped = $derived(gameSession.setup.tapped)
    let canGoBack = $derived(gameSession.selection.hasManualSelection())
</script>

<div class="rounded-lg bg-stone-900/70 border border-amber-500/40 px-3 py-2 text-stone-100">
    {#if choosing}
        <div class="flex items-start justify-between gap-2">
            {#if !siteId}
                <p class="text-sm">
                    <span class="font-semibold">Tap the site where your pawn starts.</span>
                    <span class="text-stone-400">Any faceup site — they are lit on the map.</span>
                </p>
            {:else if !adviserCardId}
                <p class="text-sm mb-2">
                    Your pawn starts at
                    <span class="font-semibold">{siteName(gameState, siteId)}</span
                    >{legalSites.length === 1 ? ', the top Cradle site' : ''}.
                    <span class="font-semibold">Tap the card to keep</span> as a facedown adviser.
                </p>
            {:else}
                <p class="text-sm mb-2">
                    Keeping <span class="font-semibold">{cardName(adviserCardId)}</span>. The other
                    two go to the
                    <span class="font-semibold"
                        >{regionName(discardRegionFor(gameState.regionOf(siteId)))} discard pile</span
                    >.
                    <span class="font-semibold">Tap the card that is discarded first</span>; the
                    other goes on top.
                </p>
            {/if}
            {#if canGoBack}
                <button
                    class="shrink-0 rounded bg-stone-700 hover:bg-stone-600 px-2 py-1 text-xs font-semibold"
                    disabled={busy}
                    onclick={() => gameSession.back()}
                >
                    Back
                </button>
            {/if}
        </div>
        {#if siteId && !adviserCardId}
            <div class="flex flex-wrap gap-2">
                {#each hand as cardId (cardId)}
                    <button
                        class="rounded border border-stone-700 p-1 hover:border-amber-400"
                        disabled={busy}
                        onclick={() => gameSession.setup.chooseAdviser(cardId)}
                    >
                        <CardImage
                            {cardId}
                            width={widthAtHeight(100, { cardId })}
                            label={cardName(cardId)}
                            inspect
                        />
                    </button>
                {/each}
            </div>
        {:else if adviserCardId}
            <div class="flex flex-wrap gap-2">
                {#each others as cardId (cardId)}
                    <button
                        class="flex flex-col items-center gap-0.5 rounded border p-1 {tapped.includes(
                            cardId
                        )
                            ? 'border-amber-300 bg-amber-950/60'
                            : 'border-stone-700 hover:border-amber-400'}"
                        disabled={busy}
                        onclick={() => gameSession.setup.tapDiscard(cardId)}
                    >
                        <CardImage
                            {cardId}
                            width={widthAtHeight(100, { cardId })}
                            label={cardName(cardId)}
                            inspect
                        />
                        <span class="text-[10px] text-sky-200 h-3"
                            >{discardPositionLabel(cardId, tapped, others)}</span
                        >
                    </button>
                {/each}
            </div>
        {/if}
    {:else}
        <p class="text-sm text-stone-400">Waiting for another player to set up.</p>
    {/if}
</div>
