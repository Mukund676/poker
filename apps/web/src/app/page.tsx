'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This function will be called when the user clicks the "Create Game" button.
  const handleCreateGame = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Generate unique IDs for the players.
      const humanPlayerId = uuidv4();
      const aiPlayerId = uuidv4();

      // 2. Send the request to your API to start a new game.
      const response = await fetch('http://localhost:4000/start-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // --- MODIFIED: Send player info, including types ---
        // The API now expects a 'players' array with objects,
        // each specifying the player's ID and their type ('human' or 'ai').
        body: JSON.stringify({
          tableName: `Game-${Math.floor(Math.random() * 1000)}`,
          players: [
            { id: humanPlayerId, type: 'human' },
            { id: aiPlayerId, type: 'ai' },
          ],
        }),
      });

      if (!response.ok) {
        // Handle cases where the API returns an error.
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create game.');
      }

      const data = await response.json();
      const { tableId } = data;

      if (!tableId) {
        throw new Error('API did not return a tableId.');
      }
      
      // 3. If the game is created successfully, navigate to the table page.
      // We pass the human player's ID in the URL so the table page knows who "we" are.
      router.push(`/table/${tableId}?playerId=${humanPlayerId}`);

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tighter mb-4">Poker Night</h1>
        <p className="text-xl text-gray-400 mb-8">
          A simple Texas Hold'em game built with Next.js and Fastify.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <button
          onClick={handleCreateGame}
          disabled={isLoading}
          className="w-full px-8 py-4 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Creating Game...' : 'Create New Game'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-800 border border-red-600 text-white rounded-lg">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
