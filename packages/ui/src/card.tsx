'use client';

// Define ranks and suits for mapping
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS_MAP: Record<string, { symbol: string; color: string }> = {
  h: { symbol: '♥', color: 'text-red-500' },
  d: { symbol: '♦', color: 'text-red-500' },
  c: { symbol: '♣', color: 'text-black' },
  s: { symbol: '♠', color: 'text-black' },
};
const SUIT_KEYS = ['h', 'd', 'c', 's'];

/**
 * A component that renders a single playing card.
 * @param cardId A number from 0-51 representing a card.
 */
export function Card({ cardId }: { cardId: number }) {
  // Calculate rank and suit from the cardId
  const rank = RANKS[cardId % 13];
  const suitKey = SUIT_KEYS[Math.floor(cardId / 13)];
  const { symbol, color } = SUITS_MAP[suitKey];

  return (
    <div className="flex flex-col items-center justify-center w-12 h-16 bg-white rounded-md shadow-md border border-gray-300">
      <span className={`text-xl font-bold ${color}`}>{rank}</span>
      <span className={`text-lg ${color}`}>{symbol}</span>
    </div>
  );
}