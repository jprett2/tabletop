<script lang="ts">
    import { CardKind, PeekTargetKind } from '@tabletop/oath'
    import CardImage from '$lib/components/CardImage.svelte'
    import {
        RELIQUARY_PLACARD,
        reliquaryPlacardImage,
        reliquaryTraitImage
    } from '$lib/images/tileImages.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'
    import { cardName, reliquaryLabel } from '$lib/model/names.js'
    import { reliquarySpaces } from '$lib/model/reliquary.js'

    // R-2.3, R-6.3, R-6.4, R-6.6.2.a — a covered space shows its relic, an uncovered one its trait.
    let gameSession = getGameSession()
    let gameState = $derived(gameSession.gameState)

    const RELIC_THUMB = 52
</script>

<div
    class="placard"
    title="The Imperial Reliquary"
    style="--placard-w:{Math.round(RELIC_THUMB / RELIQUARY_PLACARD.space)}px;"
>
    <img class="placard__art" src={reliquaryPlacardImage()} alt="Imperial Reliquary" />
    {#each reliquarySpaces(gameState) as space, index (space.slotId)}
        {@const slotId = space.slotId}
        {@const known = space.covered ? gameSession.knownRelicAt(slotId) : undefined}
        {@const peekable = gameSession.selectableReliquarySlots.includes(slotId)}
        <div
            class="space"
            class:space--pickable={peekable}
            style="left:{RELIQUARY_PLACARD.centers[index] * 100}%; top:{RELIQUARY_PLACARD.cy *
                100}%;"
        >
            {#if !space.covered}
                <figure
                    class="trait"
                    title="{reliquaryLabel(slotId)} — uncovered; the Chancellor has this trait"
                >
                    <img src={reliquaryTraitImage(index)} alt="Reliquary trait {index + 1}" />
                </figure>
            {:else if peekable}
                <button
                    type="button"
                    class="pick"
                    title="Peek at the facedown relic on {reliquaryLabel(slotId)}"
                    onclick={() =>
                        void gameSession.choosePeek({ kind: PeekTargetKind.Reliquary, slotId })}
                >
                    <CardImage
                        faceDown
                        backKind={CardKind.Relic}
                        width={RELIC_THUMB}
                        label={'Facedown relic on ' + reliquaryLabel(slotId)}
                    />
                </button>
            {:else}
                <CardImage
                    cardId={known}
                    faceDown={known === undefined}
                    backKind={CardKind.Relic}
                    width={RELIC_THUMB}
                    label={known ? cardName(known) : 'Facedown relic on ' + reliquaryLabel(slotId)}
                    inspect
                />
            {/if}
        </div>
    {/each}
</div>

<style>
    .placard {
        position: relative;
        width: var(--placard-w);
        margin: 8px auto 10px;
        line-height: 0;
    }
    .placard__art {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 6px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    }
    /* Explicit size: an absolutely positioned box otherwise shrinks to the room
       left of its `left`, squeezing the fourth space. */
    .space {
        position: absolute;
        width: 52px;
        height: 52px;
        transform: translate(-50%, -50%);
        line-height: 0;
    }
    .space :global(img) {
        max-width: none;
    }
    .space--pickable {
        outline: 3px solid #fbbf24;
        outline-offset: 2px;
        border-radius: 4px;
        box-shadow: 0 0 10px 2px rgba(251, 191, 36, 0.6);
    }
    /* An uncovered space shows the placard's print; the trait card appears large on hover. */
    .trait {
        position: relative;
        margin: 0;
    }
    .trait img {
        display: block;
        width: 52px;
        height: 52px;
        object-fit: cover;
        border-radius: 4px;
        opacity: 0;
        transition: transform 0.12s;
        transform-origin: top left;
    }
    .trait:hover {
        z-index: 20;
    }
    .trait:hover img {
        opacity: 1;
        transform: scale(3.2);
        position: relative;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
    }
    .pick {
        display: block;
        padding: 0;
        border: 0;
        background: transparent;
        line-height: 0;
        cursor: pointer;
    }
</style>
