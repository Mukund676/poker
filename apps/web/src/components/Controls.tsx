interface ControlsProps {
  tableId: string | string[];
  playerId: string;
  toAct: string;
}

async function handleAction(
  tableId: string | string[],
  playerId: string,
  action: 'fold' | 'check' | 'call' | 'raise',
  amount?: number
) {
  try {
    const res = await fetch('http://localhost:4000/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, playerId, action, amount }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`Error: ${err.error || 'Failed to perform action'}`);
    }
  } catch (error) {
    console.error('Failed to send action:', error);
    alert('Failed to send action to server.');
  }
}

export function Controls({ tableId, playerId, toAct }: ControlsProps) {
  // Do not show controls if it's not our turn
  if (playerId !== toAct) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/80 backdrop-blur-sm border-t border-gray-700">
      <div className="flex justify-center items-center space-x-4">
        <button
          onClick={() => handleAction(tableId, playerId, 'fold')}
          className="px-6 py-2 font-bold text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Fold
        </button>
        <button
          onClick={() => handleAction(tableId, playerId, 'call')}
          className="px-6 py-2 font-bold text-white bg-gray-500 rounded-md hover:bg-gray-600"
        >
          Call
        </button>
        <button
          onClick={() => {
            const amount = parseInt(prompt('Raise amount:', '100') || '0', 10);
            if (amount > 0) {
              handleAction(tableId, playerId, 'raise', amount);
            }
          }}
          className="px-6 py-2 font-bold text-white bg-green-600 rounded-md hover:bg-green-700"
        >
          Raise
        </button>
      </div>
    </div>
  );
}