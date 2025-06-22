export type Action = 'fold' | 'check' | 'call' | 'raise';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type ActionPayload =
  | { action: 'fold' }
  | { action: 'check' }
  | { action: 'call' }
  | { action: 'raise'; amount: number };

export interface CardMap {
  [playerId: string]: number[];
}

export interface InMemoryState {
  holeCards: Record<string, number[]>;
  community: number[];
  deck: number[];
  players: string[];
  initialPlayers: string[]; // To keep track of all original players
  currentIndex: number;
  dealerIndex: number; // To track the dealer button
  aiPlayers: string[];
  stacks: Record<string, number>;
  pot: number;
  actionLog: Record<string, ActionPayload[]>;
  currentBet: number;
  bets: Record<string, number>;
  toCall: Record<string, number>;
  difficulty: Difficulty;
}

export interface StartGameRequest {
  tableName: string;
  players: { id: string, type: 'human' | 'ai' }[];
  difficulty: Difficulty;
}

// ... rest of the file is unchanged
export interface StartGameResponse {
  tableId: string;
  holeCards: CardMap;
  community: number[];
  deckRemaining: number;
}

export interface GameStateResponse {
  tableId: string;
  holeCards: CardMap;
  community: number[];
  deckRemaining: number;
  pot: number;
  stacks: Record<string, number>;
  toAct: string;
  actionLog: Record<string, ActionPayload[]>;
}

export interface BetRequest {
    tableId: string;
    playerId: string;
    action: 'fold' | 'check' | 'call' | 'raise';
    amount?: number;
}

export interface BetResponse {
  success: boolean;
  gameState?: GameStateResponse;
  error?: string;
  winner?: string;
  potAwarded?: number;
  winners?: { playerId: string; amount: number }[];
}