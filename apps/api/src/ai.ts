import { Hand } from 'pokersolver';
import type * as Types from './types';

// Helper function to convert card IDs to string representations for the solver
function cardIdToString(cardId: number): string {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const SUITS = ['h', 'd', 'c', 's'];
  if (cardId < 0 || cardId > 51) return '';
  const suit = SUITS[Math.floor(cardId / 13)];
  const rank = RANKS[cardId % 13];
  return rank + suit;
}

// This function determines the AI's move based on the game state
export function getAiAction(state: Types.InMemoryState, aiPlayerId: string): { action: string, amount?: number } {
  const amountToCall = state.currentBet - (state.bets[aiPlayerId] || 0);
  const aiStack = state.stacks[aiPlayerId];
  
  // Hand Evaluation
  const aiHoleCards = state.holeCards[aiPlayerId].map(cardIdToString);
  const communityCards = state.community.map(cardIdToString);
  const currentHand = Hand.solve(aiHoleCards.concat(communityCards));
  const handRank = currentHand.rank; // 1 (High Card) to 9 (Royal Flush)

  // --- Pre-flop Strategy ---
  if (state.community.length === 0) {
    // Basic pre-flop: play pairs and high connected cards
    const isPair = aiHoleCards[0][0] === aiHoleCards[1][0];
    if (isPair || handRank > 1) {
      // If there's a raise, call. Otherwise, make a standard raise.
      return amountToCall > 0 ? { action: 'call' } : { action: 'raise', amount: 20 };
    }
    // Fold weaker hands if there's a bet
    return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
  }

  // --- Post-flop Strategy ---
  
  // 1. Strong Hand (Two Pair or better)
  if (handRank > 2) {
    // Bet aggressively. Make a pot-sized raise.
    const raiseAmount = Math.min(aiStack, state.pot + amountToCall);
    return { action: 'raise', amount: raiseAmount > state.currentBet ? raiseAmount : state.currentBet + 20 };
  }

  // 2. Decent Hand (One Pair)
  if (handRank === 2) {
    // Be more cautious. Call bets, but don't initiate raises.
    return amountToCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  // 3. Weak Hand (High Card) - Bluffing
  if (handRank <= 1) {
    // Simple bluffing logic: bluff 15% of the time on the river if checked to.
    const isRiver = state.community.length === 5;
    if (isRiver && amountToCall === 0 && Math.random() < 0.15) {
      // A small "bluff" bet to try and steal the pot.
      return { action: 'raise', amount: Math.floor(state.pot / 2) };
    }
    // If not bluffing, just check or fold.
    return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
  }

  // Default action: if something goes wrong, just check or fold.
  return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
}
