export interface StartGameRequest {
  tableName: string;
  playerIds: string[];    // IDs of seated players, length ≤ 8
}

export interface CardMap {
  [playerId: string]: number[]; // hole cards per player
}

export interface StartGameResponse {
  tableId: string;
  holeCards: CardMap;
  community: number[];    // []
  deckRemaining: number;  // e.g. 42
}

interface InMemoryState {
  holeCards: Record<string, number[]>;
  community: number[];
  deck: number[];
  players: string[];
  currentIndex: number;
  stacks: Record<string, number>;
  pot: number;
  actionLog: Record<string, Action[]>;
  currentBet: number;
  toCall: Record<string, number>; // playerId to amount to call
}


export interface GameStateResponse {
  tableId: string;
  holeCards: CardMap;
  community: number[];
  deckRemaining: number;
  pot: number;          // current pot size
  stacks: Record<string, number>; // playerId to stack size
  toAct: string; // playerId of the next player to act
  actionLog: Record<string, Action[]>; // playerId to list of actions taken
}

export type Action = 'fold' | 'check' | 'call' | 'raise';

export interface BetRequest {
  success: boolean; // true if the bet was successful
  gameState: GameStateResponse;
  error?: string; // error message if the bet was not successful
}