<script lang="ts">
    import { type GameAction } from '@tabletop/common'
    import { describeAction } from '$lib/model/actionDescription.js'
    import { getGameSession } from '$lib/model/sessionContext.svelte.js'

    let { action }: { action: GameAction } = $props()

    let gameSession = getGameSession()

    let text = $derived(
        describeAction(
            action,
            (playerId) => gameSession.getPlayerName(playerId),
            gameSession.myPlayer?.id
        )
    )
</script>

<span>{text}</span>
