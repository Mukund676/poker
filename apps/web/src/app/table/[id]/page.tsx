'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/lib/useWebSocket';
import { Table } from '@/components/Table';
import { Seats } from '@/components/Seats';
import { Controls } from '@/components/Controls';
import { Card } from '@poker/ui/card';

interface Winner {
  playerId: string;
  amount: number;
}

interface HandInfo {
  playerId: string;
  descr: string;
  holeCards: number[];
}

function ResultsModal({ ended, playerId, onPlayAgain }: { ended: any, playerId: string, onPlayAgain: () => void }) {
  if (!ended) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 text-center text-white w-full max-w-lg">
        <div className="space-y-4">
          {ended.winners.map((winner: Winner, index: number) => (
            <h2 key={index} className={`text-3xl md:text-4xl font-bold ${winner.playerId === playerId ? 'text-green-400' : 'text-red-400'}`}>
              {winner.playerId === playerId ? 'You win' : `Player ${winner.playerId.substring(0, 4)} wins`} ${winner.amount} chips!
            </h2>
          ))}
          {ended.winners.length === 0 && (
            <p className="text-3xl md:text-4xl font-bold text-gray-400">It's a tie! The pot is split.</p>
          )}
        </div>

        {ended.hands && ended.hands.length > 0 && (
          <div className="mt-6 p-4 bg-gray-900 rounded-lg space-y-3 text-base md:text-lg">
            <h3 className="text-xl font-bold border-b border-gray-600 pb-2 mb-3">Showdown</h3>
            {ended.hands.map((hand: HandInfo, index: number) => (
              // --- THIS IS THE NEW, COMBINED LAYOUT ---
              <div key={index} className="flex items-center justify-between p-2 bg-gray-700/50 rounded-md">
                <p className="font-semibold w-1/4 text-left">
                  {hand.playerId === playerId ? 'You' : `Player ${hand.playerId.substring(0, 4)}`}
                </p>
                <div className="flex items-center justify-end space-x-3 w-3/4">
                  <p className="font-mono text-gray-300 flex-shrink-0">{hand.descr}</p>
                  <div className="flex space-x-1">
                    {hand.holeCards.map((cardId, i) => <Card key={i} cardId={cardId} />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onPlayAgain}
          className="mt-6 px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}


export default function TablePage() {
  const { id: tableId } = useParams()!;
  const search = useSearchParams()!;
  const router = useRouter();
  const playerId = search.get('playerId')!;
  const messages = useWebSocket(tableId as string);

  const [state, setState] = useState<any | null>(null);
  const [ended, setEnded] = useState<{ winners: Winner[]; hands?: HandInfo[] } | null>(null);

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === 'gameState') {
        setState(msg.payload);
      } else if (msg.type === 'handEnded') {
        setEnded(msg.payload);
      }
    });
  }, [messages]);

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen text-white text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <ResultsModal ended={ended} playerId={playerId} onPlayAgain={() => router.push('/')} />
      
      <Table community={state.community} pot={state.pot} />
      <Seats
        holeCards={state.holeCards}
        stacks={state.stacks}
        toAct={ended ? '' : state.toAct} 
        you={playerId}
      />
      <Controls
        tableId={tableId as string}
        playerId={playerId}
        toAct={ended ? '' : state.toAct}
      />
    </div>
  );
}
