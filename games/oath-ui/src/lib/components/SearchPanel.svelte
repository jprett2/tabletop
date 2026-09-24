<script lang="ts">
    import CardImage from '$lib/components/CardImage.svelte'
    import { widthAtHeight } from '$lib/images/cardShape.js'
    import DiscardOrderCards from '$lib/components/DiscardOrderCards.svelte'
    import { siteName, cardName, humanizeReason } from '$lib/model/names.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)
    let search = $derived(gameSession.search)
    let busy = $derived(gameSession.busy)
</script>

<div class="rounded-lg bg-stone-900/70 border border-amber-500/40 px-3 py-2 text-stone-100">
    <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-sm">
            {#if !search.kept}
                <span class="font-semibold">Tap the card to keep.</span>
            {:else if !search.placement}
                Keeping <span class="font-semibold">{cardName(search.kept)}</span>.
                <span class="font-semibold">How do you play it?</span>
            {:else}
                <span class="font-semibold">Tap the card that is discarded first</span>; the last
                goes on top.
            {/if}
        </span>
        {#if search.kept}
            <button
                class="shrink-0 rounded bg-stone-700 hover:bg-stone-600 px-2 py-1 text-xs font-semibold"
                disabled={busy}
                onclick={() => gameSession.back()}
            >
                Back
            </button>
        {/if}
    </div>

    {#if !search.kept}
        <div class="flex flex-wrap gap-2">
            {#each search.drawn as cardId (cardId)}
                <button
                    type="button"
                    class="rounded-[5px] ring-1 ring-stone-600 hover:ring-amber-400"
                    disabled={busy}
                    onclick={() => search.keep(cardId)}
                >
                    <CardImage
                        {cardId}
                        width={widthAtHeight(112, { cardId })}
                        label={cardName(cardId)}
                        inspect
                    />
                </button>
            {/each}
        </div>
    {:else if !search.placement}
        {#if search.otherSites.length > 0}
            <label class="mb-2 flex items-center gap-2 text-xs">
                <span class="text-stone-400">Play to:</span>
                <select
                    disabled={busy}
                    class="rounded bg-stone-800 px-1 py-0.5 text-xs grow"
                    value={search.toSite ?? ''}
                    onchange={(e) => search.setToSite(e.currentTarget.value || undefined)}
                >
                    <option value="">your site</option>
                    {#each search.otherSites as siteId (siteId)}
                        <option value={siteId}>{siteName(gameState, siteId)}</option>
                    {/each}
                </select>
            </label>
        {/if}
        {#if search.secondAllowed && search.drawn.length > 1}
            <label class="mb-2 flex items-center gap-2 text-xs">
                <span class="text-stone-400">Also play:</span>
                <select
                    disabled={busy}
                    class="rounded bg-stone-800 px-1 py-0.5 text-xs grow"
                    value={search.second?.key ?? ''}
                    onchange={(e) => search.setSecondPlay(e.currentTarget.value || undefined)}
                >
                    <option value="">nothing</option>
                    {#each search.secondPlays as option (option.key)}
                        <option value={option.key}>{option.label}</option>
                    {/each}
                </select>
            </label>
        {/if}
        {#if search.slumCards.length > 0}
            <label class="mb-2 flex items-center gap-2 text-xs">
                <span class="text-stone-400">If played here, discard first:</span>
                <select
                    disabled={busy}
                    class="rounded bg-stone-800 px-1 py-0.5 text-xs grow"
                    value={search.discardFirst ?? ''}
                    onchange={(e) => search.setDiscardFirst(e.currentTarget.value || undefined)}
                >
                    <option value="">nothing</option>
                    {#each search.slumCards as id (id)}
                        <option value={id}>{cardName(id)}</option>
                    {/each}
                </select>
            </label>
        {/if}
        <div class="flex items-start gap-3">
            <CardImage
                cardId={search.kept}
                width={widthAtHeight(100, { cardId: search.kept })}
                label={cardName(search.kept)}
                inspect
            />
            <div class="flex flex-wrap gap-1 grow">
                {#each search.placements as option (option.label)}
                    <button
                        class="rounded border px-2 py-1 text-sm text-left {option.blockedBecause
                            ? 'border-stone-800 bg-stone-900/40 opacity-55'
                            : 'border-amber-500/40 bg-stone-800/60 hover:border-amber-300'}"
                        disabled={busy || !!option.blockedBecause}
                        title={option.blockedBecause ? humanizeReason(option.blockedBecause) : ''}
                        onclick={() =>
                            search.choosePlacement({ play: option.play, faceUp: option.faceUp })}
                    >
                        {option.label}
                        {#if option.blockedBecause}
                            <span class="block text-[11px] text-stone-400 leading-snug">
                                {humanizeReason(option.blockedBecause)}
                            </span>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {:else}
        <div class="flex flex-wrap gap-2">
            <DiscardOrderCards
                cards={search.others}
                tapped={search.tapped}
                {busy}
                ontap={(cardId) => search.tapDiscard(cardId)}
            />
        </div>
    {/if}
</div>
