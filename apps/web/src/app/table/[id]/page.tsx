'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/lib/useWebSocket';
import { Table } from '@/components/Table';
import { Seats } from '@/components/Seats';
import { Controls } from '@/components/Controls';

// --- Updated state shapes to match the new server payload ---
interface Winner {
  playerId: string;
  amount: number;
}

interface HandInfo {
    playerId: string;
    descr: string;
}

export default function TablePage() {
  const { id: tableId } = useParams()!;
  const search = useSearchParams()!;
  const router = useRouter();
  const playerId = search.get('playerId')!;
  const messages = useWebSocket(tableId as string);

  const [state, setState] = useState<any | null>(null);
  // --- The 'ended' state now holds both winners and hand info ---
  const [ended, setEnded] = useState<{ winners: Winner[]; hands: HandInfo[] } | null>(null);

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === 'gameState') {
        setState(msg.payload);
      } else if (msg.type === 'handEnded') {
        setEnded(msg.payload);
      }
    });
  }, [messages]);

  if (!state && !ended) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white text-xl">
        Loading...
      </div>
    );
  }

  // --- Updated rendering logic for the end-of-hand screen ---
  if (ended) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center text-white">
        <div className="space-y-4">
          {ended.winners.map((winner, index) => (
            <h2 key={index} className={`text-4xl font-bold ${winner.playerId === playerId ? 'text-green-400' : 'text-red-400'}`}>
              {winner.playerId === playerId ? 'You win' : `Player ${winner.playerId.substring(0, 4)} wins`} ${winner.amount} chips!
            </h2>
          ))}
           {ended.winners.length === 0 && (
             <p className="text-4xl font-bold text-gray-400">It's a tie! The pot is split.</p>
          )}
        </div>

        {/* --- NEW: Display the hand evaluation for each player --- */}
        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg space-y-2 text-lg">
            <h3 className="text-xl font-bold border-b border-gray-600 pb-2 mb-2">Showdown</h3>
            {ended.hands.map((hand, index) => (
                <p key={index} className="font-mono">
                    <span className="font-semibold">{hand.playerId === playerId ? 'You' : `Player ${hand.playerId.substring(0, 4)}`}:</span> {hand.descr}
                </p>
            ))}
        </div>

        <button
          onClick={() => router.push('/')}
          className="mt-8 px-8 py-4 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <Table community={state.community} pot={state.pot} />
      <Seats
        holeCards={state.holeCards}
        stacks={state.stacks}
        toAct={state.toAct}
        you={playerId}
      />
      <Controls
        tableId={tableId as string}
        playerId={playerId}
        toAct={state.toAct}
      />
    </div>
  );
}
