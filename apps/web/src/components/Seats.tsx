import { Card } from '@poker/ui/card'; // CORRECTED IMPORT

interface SeatsProps {
  holeCards: Record<string, number[]>;
  stacks: Record<string, number>;
  toAct: string;
  you: string;
}

export function Seats({ holeCards, stacks, toAct, you }: SeatsProps) {
  const playerIds = Object.keys(stacks);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {playerIds.map((playerId) => (
        <div
          key={playerId}
          className={`p-4 rounded-lg border-2 ${
            toAct === playerId ? 'border-yellow-400' : 'border-gray-700'
          } ${playerId === you ? 'bg-blue-900/50' : 'bg-gray-800/50'}`}
        >
          <div className="text-center">
            <h3 className="font-bold text-white truncate">
              {playerId === you ? 'You' : `Player ${playerId.substring(0, 4)}`}
            </h3>
            <p className="text-lg text-green-400">${stacks[playerId]}</p>
          </div>
          <div className="flex justify-center space-x-1 mt-2 h-16">
            {holeCards[playerId]?.map((cardId, index) => (
              <Card key={index} cardId={cardId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}