<script lang="ts">
    import { PowerQuestionKind, type PowerQuestion } from '@tabletop/oath'
    import QuestionYesNo from '$lib/components/QuestionYesNo.svelte'
    import { cardName } from '$lib/model/names.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let {
        question
    }: { question: Extract<PowerQuestion, { kind: PowerQuestionKind.PlayOrDiscardConspiracy }> } =
        $props()

    let gameSession = getGameSession()
    let draft = $derived(gameSession.question)
    let busy = $derived(gameSession.busy)
</script>

<p class="text-sm mb-2">
    {cardName(question.cardId)}: {gameSession.getPlayerName(question.holderPlayerId)}'s adviser is
    the Conspiracy. Play it faceup (it then leaves the game), or discard it.
</p>
{#if draft.takeTargets.length > 0}
    <!-- R-5.1.4.IV — burn one secret to take a relic or banner from a player at your site. -->
    <label class="flex items-center gap-2 text-xs mb-1">
        take from
        <select
            class="rounded bg-stone-800 px-1 py-0.5 grow"
            disabled={busy}
            value={draft.takeTarget ?? ''}
            onchange={(e) => draft.chooseTakeTarget(e.currentTarget.value || undefined)}
        >
            <option value="">nobody</option>
            {#each draft.takeTargets as id (id)}<option value={id}
                    >{gameSession.getPlayerName(id)}</option
                >{/each}
        </select>
    </label>
    {#if draft.takeTarget}
        <label class="flex items-center gap-2 text-xs mb-2">
            their
            <select
                class="rounded bg-stone-800 px-1 py-0.5 grow"
                disabled={busy}
                value={draft.takePrizeIndex ?? -1}
                onchange={(e) => {
                    const index = Number(e.currentTarget.value)
                    draft.chooseTakePrize(index < 0 ? undefined : index)
                }}
            >
                <option value={-1}>nothing</option>
                {#each draft.takePrizes as option, index (option.label)}
                    <option value={index}>{option.label}</option>
                {/each}
            </select>
        </label>
    {/if}
{/if}
<QuestionYesNo yes="Play it{draft.conspiracy ? ' and take' : ''}" no="Discard it" />
