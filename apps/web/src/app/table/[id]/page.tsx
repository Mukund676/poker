'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '../../../lib/useWebSocket';

import { Table } from '../../../components/Table';
import { Controls } from '../../../components/Controls';
import { Seats } from '../../../components/Seats';

// Define a type for the game state for better type safety
interface GameState {
  tableId: string;
  holeCards: Record<string, number[]>;
  community: number[];
  pot: number;
  stacks: Record<string, number>;
  toAct: string;
  actionLog: Record<string, any[]>;
}

export default function TablePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const tableId = params.id as string;
  const playerId = searchParams.get('playerId');

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastMessage, setLastMessage] = useState<any>(null); // To store handEnded or gameOver messages

  const onMessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    if (data.type === 'gameState') {
      setGameState(data.payload);
      setLastMessage(null); // Clear previous hand/game over messages
    } else if (data.type === 'handEnded' || data.type === 'gameOver') {
      setLastMessage(data.payload);
      if (data.type === 'gameOver') {
        setTimeout(() => router.push('/'), 5000); // Redirect to home after 5s
      }
    }
  };

  useWebSocket(`ws://localhost:4000/ws/${tableId}`, onMessage);

  const handleLeaveGame = async () => {
    if (!tableId || !playerId) return;
    await fetch('http://localhost:4000/leave-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, playerId }),
    });
    router.push('/');
  };
  
  const handleAction = async (action: string, amount?: number) => {
    if (!tableId || !playerId) return;
    try {
      await fetch('http://localhost:4000/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, playerId, action, amount }),
      });
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  if (!playerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-8">
        <p>Error: Player ID is missing.</p>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-8">
        <p>Loading Table...</p>
      </main>
    );
  }
  
  const isPlayerToAct = gameState.toAct === playerId;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-gray-900 text-white p-4 md:p-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold">Table: {tableId}</h1>
            <button 
                onClick={handleLeaveGame}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
                Leave Game
            </button>
        </div>
        
        <Seats
          holeCards={gameState.holeCards}
          stacks={gameState.stacks}
          toAct={gameState.toAct}
          you={playerId}
        />
      </div>

      <div className="my-4 w-full max-w-2xl">
        <Table communityCards={gameState.community} pot={gameState.pot} />
        {lastMessage && (
          <div className="text-center p-4 my-4 bg-yellow-900/50 rounded-lg">
             {lastMessage.winner && <p className="text-xl font-bold text-yellow-300">Game Over! Winner: {lastMessage.winner}</p>}
             {lastMessage.winners && <p className="text-lg font-semibold text-yellow-400">
               Winner(s): {lastMessage.winners.map((w: any) => `${w.playerId.substring(0,4)} wins $${w.amount}`).join(', ')}
             </p>}
             {lastMessage.hands && lastMessage.hands.length > 0 && (
                <div className="text-sm text-gray-300 mt-2">
                    {lastMessage.hands.map((h: any) => <p key={h.playerId}>{h.playerId.substring(0,4)} had: {h.descr}</p>)}
                </div>
             )}
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl">
        <Controls onAction={handleAction} disabled={!isPlayerToAct} />
      </div>
    </main>
  );
}