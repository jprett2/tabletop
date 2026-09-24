<script lang="ts">
    import { latestActorOnlyOutcome } from '$lib/model/actionOutcomes.js'
    import { cardName } from '$lib/model/names.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let gameSession = getGameSession()
    let outcome = $derived(latestActorOnlyOutcome(gameSession.actions, gameSession.myPlayer?.id))
</script>

{#if outcome}
    <div class="mb-2 rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-xs">
        {#if outcome.peeked}
            <p class="text-amber-200">You saw: {outcome.peeked.map(cardName).join(', ')}</p>
        {/if}
        {#if outcome.relicToDeckBottom !== undefined}
            <p class="text-amber-200">
                You put {cardName(outcome.relicToDeckBottom)} on the bottom of the relic deck.
            </p>
        {/if}
        <p class="text-stone-500">Only you see this.</p>
    </div>
{/if}
