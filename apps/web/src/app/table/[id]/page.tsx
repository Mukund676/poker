'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/lib/useWebSocket';
import { Table } from '@/components/Table';
import { Seats } from '@/components/Seats';
import { Controls } from '@/components/Controls';

// --- 1. Update the state shape to match the server's payload ---
interface Winner {
  playerId: string;
  amount: number;
}

export default function TablePage() {
  const { id: tableId } = useParams()!;
  const search = useSearchParams()!;
  const router = useRouter(); // For the "Play Again" button
  const playerId = search.get('playerId')!;
  const messages = useWebSocket(tableId as string);

  const [state, setState] = useState<any | null>(null);
  // --- 2. Update the 'ended' state to hold an array of winners ---
  const [ended, setEnded] = useState<{ winners: Winner[] } | null>(null);

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

  // --- 3. Implement the new, clearer rendering logic for the end of the hand ---
  if (ended) {
    const youAreAWinner = ended.winners.some(w => w.playerId === playerId);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center text-white">
        <div className="space-y-4">
          {ended.winners.map((winner, index) => (
            <h2 key={index} className={`text-4xl font-bold ${winner.playerId === playerId ? 'text-green-400' : 'text-red-400'}`}>
              {winner.playerId === playerId ? 'You win' : `Player ${winner.playerId.substring(0, 4)} wins`} ${winner.amount} chips!
            </h2>
          ))}
        </div>

        {!youAreAWinner && ended.winners.length > 0 && (
          <p className="mt-4 text-2xl text-red-500">You lost.</p>
        )}
        
        {ended.winners.length === 0 && (
           <p className="mt-4 text-2xl text-gray-400">It's a tie! The pot is split.</p>
        )}

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
