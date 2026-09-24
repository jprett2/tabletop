<script lang="ts">
    import { assertExists } from '@tabletop/common'
    import { powerKey } from '@tabletop/oath'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'
    import { cardName, humanizeReason } from '$lib/model/names.js'

    // R-5.5.3, R-7.5.2 — the defending side's battle plans, answered knowing
    // the pools and not the roll. R-5.5.3.a: the defender first, then each ally.
    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)
    let campaign = $derived.by(() => {
        const campaign = gameState.campaign
        assertExists(campaign, 'Battle plans are answered mid-Campaign')
        return campaign
    })
    let myId = $derived(gameSession.myPlayer?.id)
    let defence = $derived(gameSession.defence)
    let answeringId = $derived(defence.answeringPlayerId)
    let isAnswering = $derived(!!myId && answeringId === myId)
    let ally = $derived(
        answeringId !== undefined && answeringId !== campaign.defenderPlayerId
            ? { name: gameSession.getPlayerName(answeringId), defender: defenderName() }
            : undefined
    )
    let attackerName = $derived(gameSession.getPlayerName(campaign.attackerPlayerId))

    function defenderName(): string {
        const defenderId = campaign.defenderPlayerId
        assertExists(defenderId, 'Allies answer only for a defending player')
        return gameSession.getPlayerName(defenderId)
    }

    let usable = $derived(defence.usable)
    let plans = $derived(defence.plans)
    let busy = $derived(gameSession.busy)

    let blockedBecause = $derived(defence.blockedBecause)
</script>

<div class="rounded-lg bg-stone-900/70 border border-rose-500/40 px-3 py-2 text-stone-100">
    <h3 class="text-[11px] uppercase tracking-[0.2em] text-rose-200/80 mb-2">
        Campaign — battle plans
    </h3>

    <div class="text-sm mb-2 flex gap-4">
        <span>Attack dice <span class="font-semibold">{campaign.attackPool}</span></span>
        <span>Defense dice <span class="font-semibold">{campaign.defensePool}</span></span>
    </div>
    {#if campaign.plansUsed.length > 0}
        <p class="text-[11px] text-stone-400 mb-2">
            {attackerName} used: {campaign.plansUsed.map(cardName).join(', ')}
        </p>
    {/if}

    {#if isAnswering}
        <p class="text-sm mb-2">
            {#if ally}
                You are {ally.defender}'s ally. Use any defender's battle plans you rule, once each.
            {:else}
                You are defending. Use any battle plans you rule, once each, then roll.
            {/if}
        </p>
        {#each usable as power (powerKey(power.cardId, power.powerIndex))}
            <label class="flex items-start gap-2 text-sm mb-1">
                <input
                    disabled={busy}
                    type="checkbox"
                    checked={defence.isDeclared(power)}
                    onchange={(event) => defence.setPlan(power, event.currentTarget.checked)}
                />
                <span>
                    <span class="font-semibold">{cardName(power.cardId)}</span>
                    <span class="text-stone-400"> — {power.text}</span>
                </span>
            </label>
        {/each}
        {#if blockedBecause}
            <p class="mb-2 text-[11px] text-rose-300">{humanizeReason(blockedBecause)}</p>
        {/if}
        <button
            class="w-full rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40
                   px-2 py-1.5 text-sm font-semibold"
            disabled={busy || !!blockedBecause}
            onclick={() => defence.answer()}
        >
            {plans.length > 0 ? `Use ${plans.length} and roll` : 'Use none and roll'}
        </button>
    {:else}
        <p class="text-sm text-stone-400">
            {#if ally}
                Waiting for {ally.name}, {ally.defender}'s ally, to use battle plans.
            {:else}
                Waiting for the defender to use their battle plans.
            {/if}
        </p>
    {/if}
</div>
