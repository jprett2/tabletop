<script lang="ts">
    import { assertExists } from '@tabletop/common'
    import { MachineState, forceTotal, type WarbandGroup } from '@tabletop/oath'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'
    import { cardName, plural, siteName, relicSiteName } from '$lib/model/names.js'
    import { spoilsSummary } from '$lib/model/spoils.js'
    import { favorTokenImage } from '$lib/images/tileImages.js'

    // R-5.5.5's sacrifice, then R-5.5.7's spoils: each needs the roll, or the surviving force, first.
    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)
    let campaign = $derived.by(() => {
        const campaign = gameState.campaign
        assertExists(campaign, 'The battle is fought mid-Campaign')
        return campaign
    })
    let attackerId = $derived(campaign.attackerPlayerId)
    let isAttacker = $derived(gameSession.myPlayer?.id === attackerId)
    let defence = $derived.by(() => {
        const warbands = plural(forceTotal(campaign.defendingForce), 'warband')
        const bandits = campaign.defendingBandits
        return bandits > 0 ? `${warbands} and ${plural(bandits, 'bandit')}` : warbands
    })

    let busy = $derived(gameSession.busy)
    let spoils = $derived(gameSession.victory)

    // R-5.5.5.b, R-5.5.5.c — the exact winning sacrifice, or zero.
    let needed = $derived(gameSession.sacrificeNeeded)

    let defeat = $derived(gameSession.defeat)
    let chooserId = $derived(campaign.pendingDefeatKills?.chooserPlayerId)
    let iChooseLosses = $derived(!!chooserId && gameSession.myPlayer?.id === chooserId)

    function whereText(group: WarbandGroup): string {
        return group.at.kind === 'board'
            ? `on ${gameSession.getPlayerName(group.at.playerId)}'s board`
            : `at ${siteName(gameState, group.at.siteId)}`
    }

    let sacrificing = $derived(
        isAttacker && gameState.machineState === MachineState.CampaignSacrifice
    )
    let winBlockedBecause = $derived(
        sacrificing && needed > 0 ? gameSession.reasonCannotSacrifice(needed) : undefined
    )
    let loseBlockedBecause = $derived(
        sacrificing ? gameSession.reasonCannotSacrifice(0) : undefined
    )

    function resolveSacrifice(amount: number) {
        void gameSession.resolveCampaignSacrifice(amount)
    }

    let spoilsList = $derived(spoilsSummary(gameState, campaign.targets, spoils.placeCounts))
</script>

<div class="rounded-lg bg-stone-900/70 border border-rose-500/40 px-3 py-2 text-stone-100">
    <h3 class="text-[11px] uppercase tracking-[0.2em] text-rose-200/80 mb-2">
        Campaign — the battle
    </h3>

    <div class="text-sm mb-1 flex gap-4">
        <span>Swords <span class="font-semibold">{campaign.swords}</span></span>
        <span>Defense <span class="font-semibold">{campaign.defense}</span></span>
    </div>
    <p class="text-[11px] text-stone-400 mb-2">
        Defending: {defence}.
    </p>

    {#if gameState.machineState === MachineState.CampaignDefeat}
        {#if !iChooseLosses}
            <p class="text-sm text-stone-400">
                The attacker won. Waiting for {chooserId
                    ? gameSession.getPlayerName(chooserId)
                    : 'the defending side'} to choose which defending warbands die.
            </p>
        {:else}
            <p class="text-sm mb-2">
                The attacker won. Choose which {plural(defeat.required, 'warband')} of the defending force
                die; the rest go home to their boards.
            </p>
            <div class="mb-2 rounded border border-rose-500/40 px-2 py-1.5 text-xs">
                {#each defeat.groups as group, index (JSON.stringify(group.at) + group.color)}
                    <label class="block mb-1">
                        {defeat.picked[index] ?? 0} of {group.count}
                        {group.color}
                        {whereText(group)}
                        <input
                            type="range"
                            min="0"
                            max={group.count}
                            value={defeat.picked[index] ?? 0}
                            disabled={busy}
                            oninput={(event) =>
                                defeat.setPicked(index, Number(event.currentTarget.value))}
                            class="w-full"
                        />
                    </label>
                {/each}
                <div
                    class={defeat.pickedTotal === defeat.required
                        ? 'text-stone-400'
                        : 'text-rose-300'}
                >
                    Chosen {defeat.pickedTotal} of {defeat.required}
                </div>
            </div>
            {#if defeat.blockedBecause}
                <p class="mb-2 text-[11px] text-rose-300">{defeat.blockedBecause}</p>
            {/if}
            <button
                class="w-full rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40
                       px-2 py-1.5 text-sm font-semibold"
                disabled={busy || !!defeat.blockedBecause}
                onclick={() => defeat.choose()}
            >
                Kill these warbands
            </button>
        {/if}
    {:else if !isAttacker}
        <p class="text-sm text-stone-400">
            Waiting for {gameSession.getPlayerName(attackerId)}, the attacker.
        </p>
    {:else if gameState.machineState === MachineState.CampaignSacrifice}
        <p class="text-sm mb-2">
            {#if campaign.decidedVictor}
                A battle plan has decided the battle: the
                <span class="font-semibold">{campaign.decidedVictor}</span> is victorious. No sacrifice
                is possible.
            {:else if needed > 0}
                Sacrifice <span class="font-semibold">{needed}</span> warbands to win, or none and lose.
                The rules allow no amount in between.
            {:else}
                You are already victorious — no sacrifice is needed.
            {/if}
        </p>
        {#if needed > 0 && winBlockedBecause}
            <p class="mb-2 text-[11px] text-rose-300">
                You cannot win this battle: {winBlockedBecause}
            </p>
        {/if}

        <div class="flex gap-2">
            {#if needed > 0}
                <button
                    class="grow rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40
                           px-2 py-1.5 text-sm font-semibold"
                    disabled={busy || !!winBlockedBecause}
                    onclick={() => resolveSacrifice(needed)}
                >
                    Sacrifice {needed} and win
                </button>
            {/if}
            <button
                class="grow rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-40
                       px-2 py-1.5 text-sm"
                disabled={busy || !!loseBlockedBecause}
                onclick={() => resolveSacrifice(0)}
            >
                {needed > 0 ? 'Sacrifice nothing' : 'Continue'}
            </button>
        </div>

        {#if loseBlockedBecause}
            <p class="mt-2 text-[11px] text-rose-300">{loseBlockedBecause}</p>
        {/if}

        <p class="mt-2 text-[11px] text-stone-500">
            Defeated, you lose half your force, allocated for you. Victorious, the defending side
            chooses its own losses.
        </p>
    {:else if gameState.machineState === MachineState.CampaignVictory}
        <p class="text-sm mb-1">You were victorious. The spoils:</p>
        <ul class="mb-2 list-disc pl-5 text-sm text-stone-200">
            {#each spoilsList as item (item)}
                <li>{item}</li>
            {/each}
        </ul>
        {#if spoils.relicTargets.length > 0}
            <div class="mb-2 rounded border border-amber-500/40 px-2 py-1.5 text-xs">
                <div class="mb-1">
                    The relics you targeted are yours, and you have seen them. Any you tick go to
                    the bottom of the relic deck instead.
                </div>
                {#each spoils.relicTargets as slotId (slotId)}
                    {@const knownRelic = gameSession.knownRelicAt(slotId)}
                    <label class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={spoils.bottomSlots.includes(slotId)}
                            disabled={busy}
                            onchange={(e) => spoils.setBottom(slotId, e.currentTarget.checked)}
                        />
                        {knownRelic ? cardName(knownRelic) : 'the relic'} at {relicSiteName(
                            gameState,
                            slotId
                        )}
                    </label>
                {/each}
            </div>
        {/if}
        {#if spoils.capturedSites.length > 0 && spoils.forceColor}
            <div class="mb-2 rounded border border-amber-500/40 px-2 py-1.5 text-xs">
                <div class="mb-1">
                    Place warbands on the sites you took — {spoils.placedTotal} of
                    {spoils.forceAvailable} in your force. This is how you come to rule them.
                </div>
                {#each spoils.capturedSites as siteId (siteId)}
                    {@const count = spoils.placeCounts[siteId] ?? 0}
                    {@const ceiling = spoils.ceilingAt(siteId)}
                    <div class="mb-1 flex items-center gap-2">
                        <span class="grow">{siteName(gameState, siteId)}</span>
                        <button
                            type="button"
                            class="rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-40 px-2 py-0.5"
                            disabled={busy || count <= 0}
                            onclick={() => spoils.setPlaceCount(siteId, count - 1)}
                        >
                            −
                        </button>
                        <span class="w-6 text-center font-semibold">{count}</span>
                        <button
                            type="button"
                            class="rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-40 px-2 py-0.5"
                            disabled={busy || count >= ceiling}
                            onclick={() => spoils.setPlaceCount(siteId, count + 1)}
                        >
                            +
                        </button>
                    </div>
                {/each}
            </div>
        {/if}

        {#if spoils.blockedBecause}
            <p class="mb-2 text-[11px] text-rose-300">{spoils.blockedBecause}</p>
        {/if}
        <div class="flex gap-2">
            <button
                class="grow rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40
                       px-2 py-1.5 text-sm font-semibold"
                disabled={busy || !!spoils.blockedBecause}
                onclick={() => spoils.takeSpoils(false)}
            >
                Take the spoils{spoils.mayBurnFavor ? ', no burn' : ''}
            </button>
            {#if spoils.mayBurnFavor}
                <!-- R-5.5.7.III — "may burn half their favor" is a choice, so a second button. -->
                <button
                    class="grow rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40
                           px-2 py-1.5 text-sm font-semibold flex items-center justify-center gap-2"
                    disabled={busy || !!spoils.blockedBecause}
                    title="Take the spoils and burn half the defeated player's favor, {spoils.burnAmount} of it"
                    onclick={() => spoils.takeSpoils(true)}
                >
                    <img class="h-5 w-5 burn" src={favorTokenImage()} alt="" />
                    …and burn {spoils.burnAmount} favor
                </button>
            {/if}
        </div>
        <p class="mt-2 text-[11px] text-stone-500">
            This panel does not offer banishing the defeated pawn.
        </p>
    {/if}
</div>

<style>
    .burn {
        filter: sepia(1) saturate(4) hue-rotate(-30deg) brightness(0.7) contrast(1.3);
    }
</style>
