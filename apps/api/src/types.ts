export type Action = 'fold' | 'check' | 'call' | 'raise';

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
  currentIndex: number;
  stacks: Record<string, number>;
  pot: number;
  actionLog: Record<string, ActionPayload[]>;
  currentBet: number;
  bets: Record<string, number>;
  toCall: Record<string, number>;
}

export interface StartGameRequest {
  tableName: string;
  playerIds: string[];
}

export interface StartGameResponse {
  tableId: string;
  holeCards: CardMap;
  community: number[];
  deckRemaining: number;
}

export interface BetRequest {
  tableId: string;
  playerId: string;
  action: Action;
  amount?: number;
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

export interface BetResponse {
  success: boolean;
  gameState?: GameStateResponse;
  error?: string;
  winner?: string;
  potAwarded?: number;
  winners?: { playerId: string; amount: number }[];
}