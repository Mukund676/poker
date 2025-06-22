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

// This function determines the AI's move based on the game state and difficulty
export function getAiAction(state: Types.InMemoryState, aiPlayerId: string, difficulty: Types.Difficulty): { action: string, amount?: number } {
  const amountToCall = state.currentBet - (state.bets[aiPlayerId] || 0);
  const aiStack = state.stacks[aiPlayerId];

  // Hand Evaluation
  const aiHoleCards = state.holeCards[aiPlayerId].map(cardIdToString);
  const communityCards = state.community.map(cardIdToString);
  const currentHand = Hand.solve(aiHoleCards.concat(communityCards));
  const handRank = currentHand.rank; // 1 (High Card) to 9 (Royal Flush)

  // Easy difficulty (original logic)
  if (difficulty === 'easy') {
    if (state.community.length === 0) {
      const isPair = aiHoleCards[0][0] === aiHoleCards[1][0];
      if (isPair || handRank > 1) {
        return amountToCall > 0 ? { action: 'call' } : { action: 'raise', amount: 20 };
      }
      return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
    if (handRank > 2) {
      const raiseAmount = Math.min(aiStack, state.pot + amountToCall);
      return { action: 'raise', amount: raiseAmount > state.currentBet ? raiseAmount : state.currentBet + 20 };
    }
    if (handRank === 2) {
      return amountToCall > 0 ? { action: 'call' } : { action: 'check' };
    }
    if (handRank <= 1) {
      const isRiver = state.community.length === 5;
      if (isRiver && amountToCall === 0 && Math.random() < 0.15) {
        return { action: 'raise', amount: Math.floor(state.pot / 2) };
      }
      return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
  }

  // Medium and Hard difficulties
  if (difficulty === 'medium' || difficulty === 'hard') {
    // Pre-flop logic for medium/hard
    if (state.community.length === 0) {
        const isPair = aiHoleCards[0][0] === aiHoleCards[1][0];
        const highCardValue = Math.max(aiHoleCards[0].charCodeAt(0), aiHoleCards[1].charCodeAt(0));
        // Play pairs, high cards (Jack+), or suited connectors
        if (isPair || highCardValue >= 'T'.charCodeAt(0) || (aiHoleCards[0][1] === aiHoleCards[1][1] && Math.abs(aiHoleCards[0].charCodeAt(0) - aiHoleCards[1].charCodeAt(0)) <= 2)) {
            const raiseAmount = difficulty === 'hard' ? state.pot * 0.75 : 20;
            return amountToCall > 0 ? { action: 'call' } : { action: 'raise', amount: Math.max(20, raiseAmount) };
        }
        return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
    }

    // Post-flop for medium/hard
    const potOdds = amountToCall > 0 ? amountToCall / (state.pot + amountToCall) : 0;
    // Hard AI has more advanced logic
    if (difficulty === 'hard') {
      // Strong hand (two pair or better)
      if (handRank > 2) {
        const raiseAmount = Math.min(aiStack, state.pot * 1.5);
        return { action: 'raise', amount: Math.max(state.currentBet * 2, raiseAmount) };
      }
      // Decent hand (pair) or strong draw
      if (handRank === 2 || (currentHand.descr.includes('Flush Draw') || currentHand.descr.includes('Straight Draw'))) {
          // If pot odds are good, call
          if (amountToCall > 0 && potOdds < 0.35) {
              return { action: 'call' };
          }
          return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
      }
      // Weak hand - consider bluffing
      if (handRank <= 1) {
        if (state.community.length >= 4 && Math.random() < 0.25) { // Bluff on turn or river
            return { action: 'raise', amount: Math.floor(state.pot * 0.6) };
        }
        return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
      }
    } else { // Medium AI
        if (handRank > 2) {
            const raiseAmount = Math.min(aiStack, state.pot);
            return { action: 'raise', amount: raiseAmount > state.currentBet ? raiseAmount : state.currentBet + 20 };
        }
        if (handRank === 2) {
            return amountToCall > 0 ? { action: 'call' } : { action: 'check' };
        }
        if (handRank <= 1) {
            return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
        }
    }
  }

  // Default action
  return amountToCall > 0 ? { action: 'fold' } : { action: 'check' };
}