<script lang="ts">
    import { cardName } from '$lib/model/names.js'
    import { ActionType, powerKey } from '@tabletop/oath'
    import CardImage from '$lib/components/CardImage.svelte'
    import PowerChoicePicker from '$lib/components/PowerChoicePicker.svelte'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'
    import { powerUseKey } from '$lib/model/powerUse.js'

    // R-7.4 — declared with the action; mandatory ones (R-7.4.1) never appear here.
    let { action }: { action: ActionType } = $props()

    let gameSession = getGameSession()
    let busy = $derived(gameSession.busy)

    let usable = $derived(
        action === gameSession.selection.action ? gameSession.modifiers.options : []
    )
</script>

{#if usable.length > 0}
    <div class="mb-2 rounded border border-stone-700 px-2 py-1.5 text-xs">
        <div class="mb-1 text-stone-300">Tap a card to use it with this action:</div>
        <div class="flex flex-wrap gap-2">
            {#each usable as power (powerKey(power.cardId, power.powerIndex))}
                {@const on = gameSession.modifiers.isDeclared(powerUseKey(power))}
                <button
                    disabled={busy}
                    type="button"
                    class="card-pick {on ? 'card-pick--on' : ''}"
                    title="{cardName(power.cardId)} — {power.text}"
                    aria-pressed={on}
                    onclick={() => gameSession.modifiers.declare(powerUseKey(power), !on)}
                >
                    <CardImage cardId={power.cardId} width={72} label={cardName(power.cardId)} />
                    <span class="card-pick__name">{cardName(power.cardId)}</span>
                    <span class="card-pick__text">{power.text}</span>
                </button>
            {/each}
        </div>
        {#each usable as power (powerKey(power.cardId, power.powerIndex))}
            {#if gameSession.modifiers.isDeclared(powerUseKey(power))}
                {@const legal = gameSession.modifiers.choicesOf(power)}
                {#if legal.length > 0}
                    <div class="mt-1">
                        <div class="text-stone-400 mb-0.5">
                            {cardName(power.cardId)}:
                        </div>
                        <PowerChoicePicker
                            choices={legal}
                            bind:picks={
                                () => gameSession.modifiers.picksOf(powerUseKey(power)),
                                (picks) => gameSession.modifiers.setPicks(powerUseKey(power), picks)
                            }
                        />
                    </div>
                {/if}
            {/if}
        {/each}
    </div>
{/if}

<style>
    .card-pick {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        width: 92px;
        padding: 4px;
        border-radius: 8px;
        border: 2px solid transparent;
        background: rgba(41, 37, 36, 0.6);
        color: #e7e5e4;
        cursor: pointer;
        text-align: center;
    }
    .card-pick:hover {
        border-color: rgba(253, 230, 138, 0.5);
    }
    .card-pick--on {
        border-color: #fbbf24;
        background: rgba(251, 191, 36, 0.14);
        box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.25);
    }
    .card-pick__name {
        font-weight: 700;
        font-size: 11px;
        line-height: 1.15;
    }
    .card-pick__text {
        font-size: 10px;
        line-height: 1.2;
        color: #a8a29e;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>
