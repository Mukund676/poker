import { useState, useEffect, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  payload: any;
}

/**
 * A custom React hook to manage a WebSocket connection.
 * @param tableId The ID of the table to connect to.
 * @param playerId The ID of the current player.
 * @returns An array of messages received from the server.
 */
export function useWebSocket(tableId: string, playerId: string | null) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Don't connect if we don't have a tableId or playerId yet.
    if (!tableId || !playerId) return;

    // --- THE CHANGE: Add playerId to the WebSocket URL ---
    // This allows the server to know which player this connection belongs to.
    const wsUrl = `ws://localhost:4000/ws/${tableId}?playerId=${playerId}`;

    socket.current = new WebSocket(wsUrl);

    socket.current.onopen = () => {
      console.log('WebSocket connection established');
    };

    socket.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setMessages((prevMessages) => [...prevMessages, message]);
      } catch (error) {
        console.error('Failed to parse incoming message:', event.data);
      }
    };

    socket.current.onclose = () => {
      console.log('WebSocket connection closed');
    };

    socket.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (socket.current) {
        socket.current.close();
      }
    };
  }, [tableId, playerId]); // Re-run if tableId or playerId changes.

  return messages;
}
