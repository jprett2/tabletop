import { HydratedOathGameState } from '../model/gameState.js'
import { CampaignTargetKind } from '../model/campaign.js'
import type { CampaignParties } from './campaign.js'
import { campaignAsIfSiteNow } from './freeActions.js'
import { pawnSiteId } from './pawn.js'

/** R-5.5.1's "your site" — the pawn's, unless a card said to act as if elsewhere. */
export function attackingSiteOf(state: HydratedOathGameState, playerId: string): string {
    // Mid-Campaign the record rules: the card's flag is consumed when the Campaign starts.
    const campaign = state.campaign
    if (campaign?.attackerPlayerId === playerId && campaign.attackerSiteId)
        return campaign.attackerSiteId
    return campaignAsIfSiteNow(state, playerId) ?? pawnSiteId(state, playerId)
}

export function targetedSiteIds(parties: CampaignParties): string[] {
    const siteIds: string[] = []
    for (const target of parties.targets) {
        if (target.kind === CampaignTargetKind.Site) siteIds.push(target.siteId)
    }
    return siteIds
}
