'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startGame } from '@/lib/api';

export default function HomePage() {
  const [playerId, setPlayerId] = useState('');
  const [tableName, setTableName] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // if no playerId provided, generate one
    const pid = playerId.trim() || crypto.randomUUID();
    const resp = await startGame(tableName || 'New Table', [pid]);
    router.push(`/table/${resp.tableId}?playerId=${pid}`);
  };

  return (
    <main className="p-8 max-w-md mx-auto">
      <h1 className="text-3xl mb-4">Welcome to Poker</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          className="border p-2 rounded"
          placeholder="Your Player ID (or leave blank)"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="Table Name"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          required
        />
        <button
          type="submit"
          className="bg-blue-600 text-white py-2 rounded"
        >
          Create / Join
        </button>
      </form>
    </main>
  );
}
