import { Card } from '@poker/ui/card'; // CORRECTED IMPORT

interface TableProps {
  community: number[];
  pot: number;
}

export function Table({ community, pot }: TableProps) {
  return (
    <div className="flex flex-col items-center p-4 bg-gray-800/50 rounded-lg">
      <h2 className="text-xl font-bold text-white">Pot: ${pot}</h2>
      <div className="flex space-x-2 mt-4">
        {community.map((cardId, index) => (
          <Card key={index} cardId={cardId} />
        ))}
      </div>
    </div>
  );
}