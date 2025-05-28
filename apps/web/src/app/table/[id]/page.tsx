'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useWebSocket } from '@/lib/useWebSocket';
import { Table } from '@/components/Table';
import { Seats } from '@/components/Seats';
import { Controls } from '@/components/Controls';

export default function TablePage() {
  const { id: tableId } = useParams()!;
  const search = useSearchParams()!;
  const playerId = search.get('playerId')!;
  const messages = useWebSocket(tableId);

  const [state, setState] = useState<GameStateResponse | null>(null);
  const [ended, setEnded] = useState<{ winner: string; potAwarded: number } | null>(null);

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === 'gameState') {
        setState(msg.payload);
      } else if (msg.type === 'handEnded') {
        setEnded(msg.payload);
      }
    });
  }, [messages]);

  if (!state && !ended) return <div className="p-8">Loading...</div>;
  if (ended) {
    return (
      <div className="p-8">
        <h2 className="text-2xl">Player {ended.winner} wins {ended.potAwarded} chips!</h2>
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
        tableId={tableId}
        playerId={playerId}
        toAct={state.toAct}
      />
    </div>
  );
}
