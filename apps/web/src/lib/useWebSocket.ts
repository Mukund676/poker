import { useState, useEffect, useRef } from 'react';

// Define the shape of the messages we expect from the WebSocket server.
interface WebSocketMessage {
  type: string;
  payload: any;
}

/**
 * A custom React hook to manage a WebSocket connection.
 *
 * @param tableId The ID of the table, used to construct the WebSocket URL.
 * @returns An array of messages received from the server.
 */
export function useWebSocket(tableId: string | string[] | undefined) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Don't connect if we don't have a tableId yet.
    if (!tableId) return;

    // This should match your API server's WebSocket endpoint.
    const wsUrl = `ws://localhost:4000/ws/${tableId}`;

    // Create a new WebSocket connection.
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

    // Cleanup function to close the connection when the component unmounts.
    return () => {
      if (socket.current) {
        socket.current.close();
      }
    };
  }, [tableId]); // Re-run the effect if the tableId changes.

  return messages;
}