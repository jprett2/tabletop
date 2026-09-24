<script lang="ts">
    import { PowerQuestionKind, SearchPlay, type PowerQuestion } from '@tabletop/oath'
    import { cardName, humanizeReason } from '$lib/model/names.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let {
        question
    }: { question: Extract<PowerQuestion, { kind: PowerQuestionKind.PlayOrDiscardVision }> } =
        $props()

    let gameSession = getGameSession()
    let draft = $derived(gameSession.question)
    let busy = $derived(gameSession.busy)
    let reveal = $derived(draft.visionBlockedBecause(SearchPlay.RevealedVision))
    let adviser = $derived(draft.visionBlockedBecause(SearchPlay.Adviser))
    let discard = $derived(draft.visionBlockedBecause(SearchPlay.Discard))
</script>

<p class="text-sm mb-2">
    {cardName(question.visionCardId)} was discarded with your warband on it. Play it, or discard it.
</p>
{#if draft.visionDiscards.length > 0}
    <label class="flex items-center gap-2 text-xs mb-2">
        to make room, discard
        <select
            class="rounded bg-stone-800 px-1 py-0.5 grow"
            disabled={busy}
            value={draft.visionDiscard ?? ''}
            onchange={(e) => draft.chooseVisionDiscard(e.currentTarget.value || undefined)}
        >
            <option value="">choose an adviser</option>
            {#each draft.visionDiscards as id (id)}<option value={id}>{cardName(id)}</option>{/each}
        </select>
    </label>
{/if}
<div class="flex flex-col gap-1">
    <button
        class="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-2 py-1.5 text-sm font-semibold"
        disabled={busy || !!reveal}
        title={humanizeReason(reveal)}
        onclick={() => draft.playVision(SearchPlay.RevealedVision)}
    >
        Reveal it as your Vision
    </button>
    <button
        class="rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 px-2 py-1.5 text-sm font-semibold"
        disabled={busy || !!adviser}
        title={humanizeReason(adviser)}
        onclick={() => draft.playVision(SearchPlay.Adviser)}
    >
        Keep it as a facedown adviser
    </button>
    <button
        class="rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-40 px-2 py-1.5 text-sm font-semibold"
        disabled={busy || !!discard}
        title={humanizeReason(discard)}
        onclick={() => draft.playVision(SearchPlay.Discard)}
    >
        Discard it
    </button>
</div>
