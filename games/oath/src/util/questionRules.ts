import { assertExists } from '@tabletop/common'
import { burnFavor } from './burn.js'
import { gainFavorFromBank, giveFavor, spendFavor, usableFavor } from './favor.js'
import { HydratedOathGameState, discardRegionFor } from '../model/gameState.js'
import { SearchPlay } from '../model/oathEnums.js'
import { PowerQuestionKind } from '../model/question.js'
import { CONSPIRACY_ID } from '../data/cardRegistry.js'
import { cardPowers, type CardPower, type PowerUseKey } from '../data/cardPowers.js'
import { payPowerCost, reasonCannotPayPowerCost } from './powerCost.js'
import { pawnSiteId, regionOfPawn, rollDefenseShields } from '../powers/vocabulary.js'
import {
    playCard,
    playConspiracy,
    reasonCannotPlayCard,
    reasonCannotPlayConspiracy
} from '../actions/searchResolve.js'
import { discardCards, discardEachFromPlay } from './discard.js'
import { rulesCard } from './access.js'
import { forfeitFreeActions, hasFreeActionAhead } from './freeActions.js'
import { afterTravelPersistent } from './persistent.js'
import { applyAttackRoll, applyDefenseRoll } from './campaignRoll.js'
import { rollAttackDice, rollDefenseDice } from '../data/dice.js'
import { moveRelic, takeRelic, clearReliquarySlot } from './relics.js'
import { reliquarySlot } from './imperial.js'
import { askQuestion, banksWithFavor, playersAt } from './questions.js'
import type { QuestionRules } from './questions.js'
import {
    GATHERING_ALLOWS,
    applyExchange,
    reasonExchangeInvalid,
    reasonTermsOutsideCard
} from './exchange.js'
import { reasonCannotSneakAttack, settleHeldSneakAttacks } from './sneakAttack.js'

function isPermutationOf(order: readonly number[], count: number): boolean {
    const seen = new Set(order)
    return (
        order.length === count &&
        seen.size === count &&
        order.every((position) => Number.isInteger(position) && position >= 0 && position < count)
    )
}

function reasonCannotUsePowerToReroll(
    state: HydratedOathGameState,
    playerId: string,
    question: PowerUseKey
): string | undefined {
    const power = cardPowers(question.cardId)[question.powerIndex]
    return power ? reasonCannotPayPowerCost(state, playerId, power) : 'the power is not in play'
}

function powerForQuestion(state: HydratedOathGameState, question: PowerUseKey): CardPower {
    const power = cardPowers(question.cardId)[question.powerIndex]
    assertExists(power, `${question.cardId} power ${question.powerIndex} is not in play`)
    return power
}

export const QUESTION_RULES: { [K in PowerQuestionKind]: QuestionRules<K> } = {
    [PowerQuestionKind.BurnFavorForSecrets]: {
        forcedOutcome: (state, question) => {
            return usableFavor(state, question.askedPlayerId) <= 0
                ? `${question.askedPlayerId} has no favor to burn`
                : undefined
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            const favor = matched.answer.favor
            if (!Number.isInteger(favor) || favor < 0)
                return 'the favor to burn must be a whole number'
            const usable = usableFavor(state, playerId)
            if (favor > usable) return `you have ${usable} favor, not ${favor}`
            return undefined
        },
        apply: (state, playerId, matched, asked) => {
            const favor = matched.answer.favor
            // R-10.4, R-9.3 — secrets are unlimited.
            spendFavor(state, playerId, favor)
            burnFavor(state, favor)
            asked.secrets += favor
            return favor > 0 ? `burned ${favor} favor for ${favor} secrets` : 'burned no favor'
        }
    },
    [PowerQuestionKind.PayOrLoseRelic]: {
        forcedOutcome: (state, question, asked) => {
            if (!asked.relicIds.includes(question.relicCardId)) {
                return `${question.askedPlayerId} no longer holds ${question.relicCardId}`
            }
            if (usableFavor(state, question.askedPlayerId) >= question.price) return undefined
            moveRelic(state, question.askedPlayerId, question.takerPlayerId, question.relicCardId)
            return `${question.askedPlayerId} could not pay ${question.price} favor, so ${question.takerPlayerId} took ${question.relicCardId}`
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            const usable = usableFavor(state, playerId)
            if (matched.answer.pay && usable < matched.question.price) {
                return `paying takes ${matched.question.price} favor and you have ${usable}`
            }
            return undefined
        },
        apply: (state, playerId, matched) => {
            const { price, takerPlayerId, relicCardId } = matched.question
            if (matched.answer.pay) {
                giveFavor(state, playerId, takerPlayerId, price)
                return `paid ${price} favor to keep ${relicCardId}`
            }
            moveRelic(state, playerId, takerPlayerId, relicCardId)
            return `let ${takerPlayerId} take ${relicCardId}`
        }
    },
    [PowerQuestionKind.PickFavorBank]: {
        forcedOutcome: (state, question) => {
            const banks = banksWithFavor(state)
            if (banks.length > 1) return undefined
            if (banks.length === 0) return 'no favor bank has any favor to gain'
            const gained = gainFavorFromBank(
                state,
                question.askedPlayerId,
                banks[0],
                question.amount
            )
            return `${question.askedPlayerId} gained ${gained} favor from the ${banks[0]} bank, the only one with favor`
        },
        reasonCannotAnswer: (state, _playerId, matched) => {
            const suit = matched.answer.suit
            if (state.favorBank[suit] <= 0) return `the ${suit} bank has no favor`
            return undefined
        },
        apply: (state, playerId, matched) => {
            const suit = matched.answer.suit
            const gained = gainFavorFromBank(state, playerId, suit, matched.question.amount)
            return `gained ${gained} favor from the ${suit} bank`
        }
    },
    [PowerQuestionKind.Exchange]: {
        forcedOutcome: (state, question) => {
            return reasonExchangeInvalid(
                state,
                question.proposerPlayerId,
                question.askedPlayerId,
                question.terms
            )
                ? `the proposed exchange can no longer be honoured: ${reasonExchangeInvalid(state, question.proposerPlayerId, question.askedPlayerId, question.terms)}`
                : undefined
        },
        reasonCannotAnswer: (state, _playerId, matched) => {
            if (!matched.answer.accept) return undefined
            const { proposerPlayerId, askedPlayerId, terms } = matched.question
            return reasonExchangeInvalid(state, proposerPlayerId, askedPlayerId, terms)
        },
        apply: (state, playerId, matched) => {
            const { proposerPlayerId, terms } = matched.question
            if (!matched.answer.accept) return `refused ${proposerPlayerId}'s exchange`
            const disclosed = applyExchange(state, proposerPlayerId, playerId, terms)
            return { summary: `accepted ${proposerPlayerId}'s exchange`, disclosed }
        }
    },
    [PowerQuestionKind.JoinSite]: {
        forcedOutcome: (_state, question, asked) => {
            return asked.siteId === question.siteId
                ? `${question.askedPlayerId} is already there`
                : undefined
        },
        reasonCannotAnswer: () => undefined,
        apply: (_state, _playerId, matched, asked) => {
            const { siteId } = matched.question
            if (!matched.answer.join) return `stayed away from ${siteId}`
            asked.siteId = siteId
            return `put their pawn at ${siteId}`
        }
    },
    [PowerQuestionKind.GatheringFloor]: {
        forcedOutcome: (state, question) => {
            return playersAt(state, question.siteId).filter((id) => id !== question.askedPlayerId)
                .length === 0
                ? 'nobody else is here to negotiate with'
                : undefined
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            const proposal = matched.answer.proposal
            if (!proposal) return undefined
            if (proposal.withPlayerId === playerId) return 'you cannot exchange with yourself'
            if (state.findPlayerState(proposal.withPlayerId)?.siteId !== matched.question.siteId) {
                return `${proposal.withPlayerId} is not at ${matched.question.siteId}`
            }
            return (
                reasonTermsOutsideCard(proposal.terms, GATHERING_ALLOWS) ??
                reasonExchangeInvalid(state, playerId, proposal.withPlayerId, proposal.terms)
            )
        },
        apply: (state, playerId, matched, _asked, askingPlayerId) => {
            const proposal = matched.answer.proposal
            if (!proposal) return 'proposed nothing'
            askQuestion(
                state,
                askingPlayerId,
                {
                    kind: PowerQuestionKind.Exchange,
                    cardId: matched.question.cardId,
                    askedPlayerId: proposal.withPlayerId,
                    proposerPlayerId: playerId,
                    terms: proposal.terms
                },
                true
            )
            return `proposed an exchange to ${proposal.withPlayerId}`
        }
    },
    [PowerQuestionKind.KeepOrBottomRelic]: {
        forcedOutcome: () => undefined,
        reasonCannotAnswer: () => undefined,
        apply: (state, _playerId, matched, asked) => {
            const { relicCardId } = matched.question
            if (matched.answer.keep) {
                takeRelic(state, asked.playerId, relicCardId)
                return `took ${relicCardId}`
            }
            return {
                summary: 'put the relic on the bottom of the relic deck',
                relicToDeckBottom: relicCardId
            }
        }
    },
    [PowerQuestionKind.TakeOrLeaveRelic]: {
        forcedOutcome: (state, question) => {
            return reliquarySlot(state, question.slotId) !== undefined
                ? undefined
                : 'the Reliquary space is no longer occupied'
        },
        reasonCannotAnswer: () => undefined,
        apply: (state, _playerId, matched, asked) => {
            const { relicCardId, slotId } = matched.question
            if (!matched.answer.take) return 'left the relic in the Reliquary'
            clearReliquarySlot(state, slotId)
            takeRelic(state, asked.playerId, relicCardId)
            return {
                summary: `took ${relicCardId} from the Reliquary`,
                relicTakenFromSlotId: slotId
            }
        }
    },
    [PowerQuestionKind.PlayOrDiscardConspiracy]: {
        forcedOutcome: (state, question) => {
            return state.getPlayerState(question.holderPlayerId).hasAdviser(CONSPIRACY_ID)
                ? undefined
                : 'the Conspiracy is no longer there'
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            if (!matched.answer.play) return undefined
            return reasonCannotPlayConspiracy(state, playerId, {
                keptCardId: CONSPIRACY_ID,
                conspiracy: matched.answer.conspiracy
            })
        },
        apply: (state, playerId, matched) => {
            const { play, conspiracy } = matched.answer
            const holder = state.getPlayerState(matched.question.holderPlayerId)
            holder.removeAdviser(CONSPIRACY_ID)
            if (play) {
                // R-5.1.4.IV — played faceup by the finder, then to the box.
                playConspiracy(state, playerId, CONSPIRACY_ID, conspiracy)
                return `played the Conspiracy${conspiracy ? ` and took from ${conspiracy.targetPlayerId}` : ''}`
            }
            const region = regionOfPawn(state, playerId)
            discardCards(state, playerId, [CONSPIRACY_ID], region)
            return {
                summary: 'discarded the Conspiracy',
                discardedCardIds: [CONSPIRACY_ID],
                discardPileRegion: discardRegionFor(region)
            }
        }
    },
    [PowerQuestionKind.TravelFreeTo]: {
        forcedOutcome: (_state, question) =>
            question.siteIds.length === 0 ? 'no site to travel to' : undefined,
        reasonCannotAnswer: (_state, _playerId, matched) => {
            const siteId = matched.answer.siteId
            return matched.question.siteIds.includes(siteId)
                ? undefined
                : `${siteId} is not one of the sites the Brass Horse named`
        },
        apply: (state, playerId, matched, asked) => {
            const siteId = matched.answer.siteId
            const from = pawnSiteId(state, asked.playerId)
            asked.siteId = siteId
            const notes = afterTravelPersistent(state, playerId, from, siteId)
            return `travelled to ${siteId} for no Supply${notes.length ? ` (${notes.join('; ')})` : ''}`
        }
    },
    [PowerQuestionKind.RerollDice]: {
        forcedOutcome: (state, question) => {
            assertExists(state.campaign, 'Jinx is asked only during a Campaign roll')
            const power = cardPowers(question.cardId)[question.powerIndex]
            assertExists(power, `${question.cardId} has a power at index ${question.powerIndex}`)
            const cost = reasonCannotPayPowerCost(state, question.askedPlayerId, power)
            return cost ? `${question.askedPlayerId} cannot use Jinx: ${cost}` : undefined
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            if (!matched.answer.reroll) return undefined
            return reasonCannotUsePowerToReroll(state, playerId, matched.question)
        },
        apply: (state, playerId, matched) => {
            if (!matched.answer.reroll) return 'kept the roll'
            const campaign = state.campaign
            assertExists(campaign, 'Jinx rerolled with no Campaign under way')
            payPowerCost(state, playerId, powerForQuestion(state, matched.question))
            const prng = state.getProtectedPrng()
            if (matched.question.side === 'attack') {
                applyAttackRoll(campaign, rollAttackDice(prng, campaign.attackRoll.length))
                return {
                    summary: `Jinx: rerolled the attack — ${campaign.swords} swords`,
                    rolled: true
                }
            }
            applyDefenseRoll(campaign, rollDefenseDice(prng, campaign.defenseRoll.length))
            return {
                summary: `Jinx: rerolled the defense — ${campaign.defense} defense`,
                rolled: true
            }
        }
    },
    [PowerQuestionKind.RelicThiefRoll]: {
        forcedOutcome: (state, question) => {
            const still = question.relicCardIds.filter((id) =>
                state.getPlayerState(question.takerPlayerId).relicIds.includes(id)
            )
            if (still.length === 0) return `${question.takerPlayerId} no longer holds the relics`
            const power = cardPowers(question.cardId)[question.powerIndex]
            const cost = power
                ? reasonCannotPayPowerCost(state, question.askedPlayerId, power)
                : 'the power is not in play'
            return cost ? `${question.askedPlayerId} cannot use Relic Thief: ${cost}` : undefined
        },
        reasonCannotAnswer: (state, playerId, matched) => {
            if (!matched.answer.roll) return undefined
            return reasonCannotUsePowerToReroll(state, playerId, matched.question)
        },
        apply: (state, playerId, matched) => {
            const { takerPlayerId, relicCardIds } = matched.question
            if (!matched.answer.roll) return 'let the relics go'
            payPowerCost(state, playerId, powerForQuestion(state, matched.question))
            const taker = state.getPlayerState(takerPlayerId)
            const relics = relicCardIds.filter((id) => taker.relicIds.includes(id))
            const shields = rollDefenseShields(state.getProtectedPrng(), relics.length)
            if (shields > 0) {
                return {
                    summary: `Relic Thief: rolled ${shields} shields, so ${takerPlayerId} keeps ${relics.join(', ')}`,
                    rolled: true
                }
            }
            for (const id of relics) moveRelic(state, takerPlayerId, playerId, id)
            return {
                summary: `Relic Thief: rolled no shields and took ${relics.join(', ')} from ${takerPlayerId}`,
                rolled: true
            }
        }
    },
    [PowerQuestionKind.PlayOrDiscardVision]: {
        forcedOutcome: () => undefined,
        reasonCannotAnswer: (state, playerId, matched) => {
            return reasonCannotPlayCard(
                state,
                playerId,
                matched.question.visionCardId,
                matched.answer.play,
                { faceUp: false, discardedAdviserCardId: matched.answer.discardedAdviserCardId }
            )
        },
        apply: (state, playerId, matched) => {
            const { visionCardId } = matched.question
            const { play, discardedAdviserCardId } = matched.answer
            const region = regionOfPawn(state, playerId)
            // R-5.1.4 — "as if you had searched": the same play a Search's kept card gets.
            const played = playCard(state, playerId, visionCardId, play, region, {
                faceUp: false,
                discardedAdviserCardId
            })
            const summary =
                play === SearchPlay.Discard
                    ? `discarded ${visionCardId}`
                    : `played ${visionCardId} (${play})`
            if (played.discarded.length === 0) return summary
            return {
                summary,
                discardedCardIds: played.discarded,
                discardPileRegion: discardRegionFor(region)
            }
        }
    },
    [PowerQuestionKind.DiscardInstead]: {
        forcedOutcome: () => undefined,
        reasonCannotAnswer: (state, playerId, matched) => {
            const insteadCardId = matched.answer.insteadCardId
            if (insteadCardId === undefined) return undefined
            if (!matched.question.insteadCardIds.includes(insteadCardId))
                return `${insteadCardId} is not one of the cards you may discard instead`
            return rulesCard(state, playerId, insteadCardId)
                ? undefined
                : `you no longer rule ${insteadCardId}`
        },
        apply: (state, _playerId, matched) => {
            const { planCardIds, actingPlayerId } = matched.question
            const insteadCardId = matched.answer.insteadCardId
            const pileDeposits = discardEachFromPlay(
                state,
                actingPlayerId,
                insteadCardId === undefined ? planCardIds : [insteadCardId]
            )
            const going = pileDeposits.flatMap((deposit) => deposit.cardIds)
            return {
                summary:
                    insteadCardId === undefined
                        ? `discarded ${going.join(', ')} as printed`
                        : `discarded ${insteadCardId} instead of ${planCardIds.join(', ')}`,
                pileDeposits
            }
        }
    },
    [PowerQuestionKind.SneakAttack]: {
        forcedOutcome: (state, question) =>
            reasonCannotSneakAttack(state, question.askedPlayerId, question.defenderPlayerId),
        reasonCannotAnswer: () => undefined,
        apply: (_state, _playerId, matched) =>
            `passed on a Sneak Attack against ${matched.question.defenderPlayerId}`
    },
    [PowerQuestionKind.SecondWindFirst]: {
        forcedOutcome: () => undefined,
        reasonCannotAnswer: (state, playerId, matched) => {
            return !matched.answer.use || hasFreeActionAhead(state, playerId)
                ? undefined
                : 'no free Travel or Campaign is waiting to be used'
        },
        apply: (state, playerId, matched) => {
            if (matched.answer.use) return 'will use Second Wind before the Sneak Attack'
            forfeitFreeActions(state, playerId)
            const notes = settleHeldSneakAttacks(state, false)
            return ['gave up Second Wind', ...notes].join('; ')
        }
    },
    [PowerQuestionKind.OrderDrawnCards]: {
        forcedOutcome: () => undefined,
        reasonCannotAnswer: (_state, _playerId, matched) => {
            return isPermutationOf(matched.answer.order, matched.question.cardIds.length)
                ? undefined
                : `the order must name each of the ${matched.question.cardIds.length} cards once`
        },
        apply: (state, playerId, matched) => {
            const { cardIds, region } = matched.question
            const stacked = matched.answer.order.map((position) => cardIds[position])
            // R-10.30 — the card names the pawn's own region, not R-10.5's next one.
            const pileDeposits = discardCards(state, playerId, stacked, region, {
                region,
                bottom: false
            })
            return {
                summary: `stacked ${stacked.length} cards on the ${region} discard pile`,
                pileDeposits
            }
        }
    }
}
