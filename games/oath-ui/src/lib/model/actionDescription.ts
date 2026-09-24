import {
    ConsentRequestKind,
    PeekTargetKind,
    RecoverTargetKind,
    SearchPlay,
    SearchSource,
    WarbandMoveKind,
    isAnswerConsent,
    isAnswerQuestion,
    isCampaign,
    isCampaignDefeatKills,
    isCampaignDefend,
    isCampaignResolveVictory,
    isCampaignSacrifice,
    isCompleteRest,
    isEndActPhase,
    isExileCitizen,
    isMoveWarbands,
    isMuster,
    isOfferCitizenship,
    isPeek,
    isPlayFacedownAdviser,
    isRecover,
    isResolveCitizenshipOffer,
    isResolveOathkeeper,
    isResolveWake,
    isSearch,
    isSearchResolve,
    isSelfExile,
    isSetupChoice,
    isTrade,
    isTravel,
    isUseActionPower,
    isUseRestPower,
    type AnswerConsentMetadata,
    type CampaignBattleMetadata,
    type CampaignTarget,
    type WarbandMove
} from '@tabletop/oath'
import type { GameAction } from '@tabletop/common'
import {
    bannerName,
    campaignTargetText,
    cardName,
    plural,
    reliquaryLabel,
    slotLabel,
    stripRules
} from '$lib/model/names.js'
import {
    actorOnlyOutcome,
    mergedPilesOf,
    pileDepositsOf,
    type PileDeposit
} from '$lib/model/actionOutcomes.js'

// Past tense with no leading capital or possessive about the actor: `PlayerName` renders "You" first.
// R-9.4 — a card is named only where the game showed it, recorded as `playedCardId`.

export type NameOf = (playerId: string) => string

function shownCard(cardId: string | undefined): string {
    return cardId ? cardName(cardId) : 'a card'
}

export const UNDESCRIBED = 'took an action'

export function describeAction(action: GameAction, nameOf: NameOf, viewerId?: string): string {
    return stripRules(describeActionCited(action, nameOf) + outcomeClauses(action, viewerId))
}

// R-9.4 — a pile's region is public; the cards and what was seen are the actor's alone.
function outcomeClauses(action: GameAction, viewerId: string | undefined): string {
    const isActor = viewerId !== undefined && action.playerId === viewerId
    const parts = pileDepositsOf(action).map((deposit) => describeDeposit(deposit, isActor))
    const merged = mergedPilesOf(action)
    if (merged) parts.push(`the ${merged.from} discard pile went onto the ${merged.to} pile`)
    const seen = actorOnlyOutcome(action, viewerId)
    if (seen?.peeked) parts.push(`you saw ${seen.peeked.map(cardName).join(', ')}`)
    if (seen?.relicToDeckBottom !== undefined) {
        parts.push(`you put ${cardName(seen.relicToDeckBottom)} on the bottom of the relic deck`)
    }
    return parts.length > 0 ? `; ${parts.join('; ')}` : ''
}

function describeDeposit(deposit: PileDeposit, isActor: boolean): string {
    const where = `${deposit.bottom ? 'the bottom of ' : ''}the ${deposit.region} discard pile`
    return isActor
        ? `${deposit.cardIds.map(cardName).join(', ')} went to ${where}`
        : `cards went to ${where}`
}

function supply(spent: number | undefined): string {
    return spent !== undefined && spent > 0 ? `, spending ${spent} Supply` : ''
}

function describeActionCited(action: GameAction, nameOf: NameOf): string {
    if (isSetupChoice(action)) {
        // R-1.23.2 keeps the adviser facedown, so it is never named.
        const pile = action.metadata?.discardPileRegion
        return (
            `placed a pawn at ${slotLabel(action.siteId)} and kept one card facedown` +
            (pile ? `, discarding two to the ${pile} pile` : '')
        )
    }
    if (isTravel(action)) {
        const meta = action.metadata
        const revealed = meta?.revealedSiteCardId
            ? ` — revealing ${cardName(meta.revealedSiteCardId)}` +
              ((meta.relicsRevealed ?? 0) > 0
                  ? ` and ${plural(meta.relicsRevealed ?? 0, 'facedown relic')}`
                  : '')
            : ''
        return `travelled to ${slotLabel(action.siteId)}${supply(meta?.supplySpent)}${revealed}`
    }
    if (isMuster(action)) {
        const meta = action.metadata
        return (
            `mustered at ${cardName(action.cardId)}` +
            (meta ? `, gaining ${meta.warbandsGained} warbands` : '') +
            supply(meta?.supplySpent)
        )
    }
    if (isTrade(action)) {
        const meta = action.metadata
        const gained =
            (meta?.favorGained ?? 0) > 0
                ? `${meta?.favorGained} favor`
                : `${meta?.secretsGained ?? 0} secrets`
        return `traded at ${cardName(action.cardId)} for ${gained}${supply(meta?.supplySpent)}`
    }
    if (isSearch(action)) {
        const from =
            action.drawFrom === SearchSource.WorldDeck ? 'the world deck' : 'their region’s discard'
        const shown = action.metadata?.revealedDraw
        return (
            `searched ${from}${supply(action.metadata?.supplySpent)}` +
            (shown ? `, showing ${shown.map(cardName).join(', ')} (Truthful Harp)` : '')
        )
    }
    if (isSearchResolve(action)) {
        const kept = action.metadata?.playedCardId ?? action.metadata?.revealedKeptCardId
        return `kept ${shownCard(kept)} and ${describePlay(action.play)}`
    }
    if (isRecover(action)) {
        return action.target.kind === RecoverTargetKind.Banner
            ? `recovered the ${bannerName(action.target.banner)} for ${action.amountPaid}`
            : `recovered a relic at their site${supply(action.metadata?.supplySpent)}`
    }
    if (isCampaign(action)) {
        const against =
            action.defender.kind === 'bandits' ? 'the bandits' : nameOf(action.defender.playerId)
        const targets = action.targets.map(describeTarget).join(', ')
        const declared = `campaigned against ${against}${targets ? ` for ${targets}` : ''}`
        // R-5.5.2.a — nothing is rolled until the Citizens asked have answered.
        if (action.metadata?.awaitingAllies)
            return `${declared} — Citizens are asked to join the defence`
        return `${declared} — ${describeBattle(action.metadata?.battle)}`
    }
    if (isUseRestPower(action)) {
        const summary = action.metadata?.summary
        return summary ? `rested: ${summary}` : `used ${cardName(action.cardId)}'s Rest power`
    }
    if (isCampaignDefend(action)) {
        const meta = action.metadata
        const used = meta?.plansUsed ?? []
        return (
            (used.length > 0
                ? `used ${used.join(', ')} and rolled`
                : 'used no battle plans and rolled') +
            ` — ${meta?.swords ?? 0} swords against ${meta?.defense ?? 0} defence`
        )
    }
    if (isCampaignSacrifice(action)) {
        const chooser = action.metadata?.awaitingLossesOf
        return (
            `sacrificed ${action.metadata?.sacrificed ?? action.sacrifice} warbands and ` +
            (action.metadata?.attackerVictorious ? 'won the battle' : 'lost the battle') +
            (chooser ? ` — ${nameOf(chooser)} chooses the defending side's losses` : '')
        )
    }
    if (isCampaignDefeatKills(action)) {
        return `chose the defending side's losses, ${plural(action.metadata?.defeatKilled ?? 0, 'warband')} killed`
    }
    if (isCampaignResolveVictory(action)) {
        const meta = action.metadata
        const taken = meta?.relicsTaken ?? []
        return (
            'took the spoils' +
            (taken.length > 0 ? `, taking ${taken.join(', ')}` : '') +
            ((meta?.favorBurned ?? 0) > 0 ? `, burning ${meta?.favorBurned} favor` : '')
        )
    }
    if (isPlayFacedownAdviser(action)) {
        // R-6.1 plays the adviser faceup, which shows it, or discards it, which does not.
        return describeAdviserPlay(action.play, shownCard(action.metadata?.playedCardId))
    }
    if (isUseActionPower(action)) {
        return `used ${cardName(action.cardId)}'s Action power`
    }
    if (isPeek(action)) {
        return action.target.kind === PeekTargetKind.Reliquary
            ? `peeked at the relic on ${reliquaryLabel(action.target.slotId)}`
            : 'peeked at a relic at their site'
    }
    if (isMoveWarbands(action)) {
        const warbands = `${plural(action.count, `${action.color} warband`)} ${describeMove(action.move, nameOf)}`
        const asked = action.metadata?.awaitingConsentOf
        return asked
            ? `asked ${nameOf(asked)}'s permission to move ${warbands}`
            : `moved ${warbands}`
    }
    if (isAnswerConsent(action)) {
        return describeConsentAnswer(action.metadata, action.granted, nameOf)
    }
    if (isOfferCitizenship(action)) {
        return `offered ${nameOf(action.exilePlayerId)} Citizenship for the relic on ${reliquaryLabel(action.reliquarySlotId)}`
    }
    if (isResolveCitizenshipOffer(action)) {
        const unreplaced = action.metadata?.outcome?.unreplacedCount ?? 0
        return action.granted
            ? 'accepted Citizenship' +
                  (unreplaced > 0 ? `, with ${unreplaced} warbands left uncoloured` : '')
            : 'refused Citizenship'
    }
    if (isAnswerQuestion(action)) {
        const meta = action.metadata
        return meta ? `${cardName(meta.cardId)}: ${meta.summary}` : 'answered a question'
    }
    if (isExileCitizen(action)) {
        // R-6.7 — the exiler pays the Citizen they throw out; R-9.3's leftover purple is worth a clause.
        const meta = action.metadata
        return (
            `exiled ${nameOf(action.citizenPlayerId)}` +
            ((meta?.favorGiven ?? 0) > 0 ? `, giving them ${meta?.favorGiven} favor` : '') +
            ((meta?.unreplacedCount ?? 0) > 0
                ? `, with ${meta?.unreplacedCount} warbands left purple`
                : '')
        )
    }
    if (isSelfExile(action)) {
        const meta = action.metadata
        return (
            'went into exile' +
            ((meta?.favorGiven ?? 0) > 0
                ? `, giving ${meta?.favorGiven} favor to the Grand Scepter’s holder`
                : '') +
            ((meta?.unreplacedCount ?? 0) > 0
                ? `, with ${meta?.unreplacedCount} warbands left purple`
                : '')
        )
    }
    if (isResolveWake(action)) {
        // R-4.1.3's Usurper flip decides R-3.1 at the next Wake.
        return (
            'began the turn' +
            (action.metadata?.flippedToUsurper
                ? ' — the Oathkeeper title flipped to Usurper'
                : '') +
            (action.metadata?.flippedToMob ? ' — the People’s Favor flipped to Mob' : '')
        )
    }
    if (isEndActPhase(action)) return 'ended the Act Phase'
    if (isCompleteRest(action)) {
        const roll = action.metadata?.endDieRoll
        return (
            'rested' +
            (roll !== undefined ? `, rolling ${roll} on the end die` : '') +
            (action.metadata?.endedRound ? ' — the round ended' : '')
        )
    }
    if (isResolveOathkeeper(action)) {
        return `gave the Oathkeeper title to ${nameOf(action.chosenPlayerId)}`
    }
    return UNDESCRIBED
}

function describeAdviserPlay(play: SearchPlay, card: string): string {
    switch (play) {
        case SearchPlay.Site:
            return `played ${card} to their site`
        case SearchPlay.Adviser:
            return `turned ${card} faceup as an adviser`
        case SearchPlay.RevealedVision:
            return `revealed ${card} as their Vision`
        case SearchPlay.Conspiracy:
            return 'played the Conspiracy'
        case SearchPlay.Discard:
            return `discarded ${card}`
    }
}

function describePlay(play: SearchPlay): string {
    switch (play) {
        case SearchPlay.Site:
            return 'played it to their site'
        case SearchPlay.Adviser:
            return 'played it as an adviser'
        case SearchPlay.RevealedVision:
            return 'revealed it as a Vision'
        case SearchPlay.Conspiracy:
            return 'played the Conspiracy'
        case SearchPlay.Discard:
            return 'discarded it'
    }
}

function describeTarget(target: CampaignTarget): string {
    return campaignTargetText(target, { site: slotLabel, relicSlot: () => 'a site' })
}

function describeBattle(battle: CampaignBattleMetadata | undefined): string {
    return (
        `${battle?.swords ?? 0} swords against ${battle?.defense ?? 0} defence` +
        ((battle?.skullsKilled ?? 0) > 0 ? `, losing ${battle?.skullsKilled} to skulls` : '')
    )
}

// R-6.5.a, R-6.5.b, R-5.5.2.a — the answer names what was asked of the answering player.
function describeConsentAnswer(
    meta: AnswerConsentMetadata | undefined,
    granted: boolean,
    nameOf: NameOf
): string {
    const asker = meta ? nameOf(meta.askingPlayerId) : 'the asking player'
    const battle = meta?.battle ? ` — ${describeBattle(meta.battle)}` : ''
    switch (meta?.kind) {
        case ConsentRequestKind.JoinDefence:
            return (granted ? 'asked to join the defence' : 'stayed out of the battle') + battle
        case ConsentRequestKind.AdmitAlly:
            return (
                (granted
                    ? `admitted ${asker} to the defence`
                    : `kept ${asker} out of the defence`) + battle
            )
        case ConsentRequestKind.WarbandMove:
            return granted ? `let ${asker} move the warbands` : `refused ${asker}'s warband move`
        default:
            return granted ? 'gave permission' : 'refused permission'
    }
}

function describeMove(move: WarbandMove, nameOf: NameOf): string {
    switch (move.kind) {
        case WarbandMoveKind.SiteToBoard:
            return 'from site to board'
        case WarbandMoveKind.BoardToSite:
            return 'from board to site'
        case WarbandMoveKind.GiveToImperial:
            return `to ${nameOf(move.otherPlayerId)}`
        case WarbandMoveKind.TakeFromImperial:
            return `from ${nameOf(move.otherPlayerId)}`
    }
}
