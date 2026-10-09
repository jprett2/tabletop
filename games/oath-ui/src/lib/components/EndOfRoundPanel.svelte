<script lang="ts">
    import { PlayerName } from '@tabletop/frontend-components'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'
    import { endDieStakes } from '$lib/model/endOfRound.js'

    // R-3.3 — the round has ended with the Empire holding the title; only the Chancellor rolls.
    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)
    let viewerId = $derived(gameSession.myPlayer?.id)
    let chancellorId = $derived(gameState.chancellorId())
    let rolls = $derived(viewerId === chancellorId && gameSession.isMyTurn)
    let stakes = $derived(endDieStakes(gameState, viewerId))
    let busy = $derived(gameSession.busy)
</script>

<div>
    {#if stakes}
        <h3 class="text-[11px] uppercase tracking-[0.2em] text-oath-heading mb-1">End die</h3>
        {#if !rolls}
            <p class="text-sm text-oath-text-muted">
                Waiting for <PlayerName playerId={chancellorId} /> to roll the end die.
            </p>
        {/if}
        <p class="mt-1 text-sm">
            A <b class="text-oath-danger">{stakes.threshold}</b> ends the game:
            {#if stakes.winnerId === viewerId}
                you win {stakes.as}.
            {:else}
                <PlayerName playerId={stakes.winnerId} /> wins {stakes.as}.
            {/if}
        </p>
        {#if rolls}
            <button
                class="mt-2 rounded bg-oath-primary text-oath-primary-text hover:bg-oath-primary-hover disabled:opacity-40
                       px-3 py-1.5 text-sm font-semibold max-sm:min-h-11"
                disabled={busy}
                onclick={() => gameSession.rollEndDie()}
            >
                Roll the end die
            </button>
        {/if}
    {/if}
</div>
