// packages/poker-engine/index.ts
import seedrandom from 'seedrandom';
import { Hand } from 'pokersolver';

export type Card = number;
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const suits = ['h', 'd', 'c', 's'];
export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
export function cardToString(card: Card): string {
  const rank = ranks[card % 13];
  const suit = suits[card / 13 | 0];
  return rank + suit;
}

export function shuffle(deck: Card[], seed?: string): Card[] {
  const drng = seed
    ? seedrandom(seed)
    : Math.random;
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(drng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function deal(deck: Card[]) {
  const d = deck.slice();
  const hole = [d.shift()!, d.shift()!];
  d.shift(); // burn
  const flop = [d.shift()!, d.shift()!, d.shift()!];
  d.shift(); // burn
  const turn = d.shift()!;
  d.shift(); // burn
  const river = d.shift()!;
  return { hole, flop, turn, river, remainder: d };
}

export function evaluateHand(hole: Card[], community: Card[]): any {
  const allCards = [...hole, ...community].map(cardToString);
  return Hand.solve(allCards);
}

