// packages/poker-engine/index.ts
import seedrandom from 'seedrandom';

export type Card = number;

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
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

export function evaluateHand(hole: Card[], community: Card[]): string {
  return 'TBD';
}
