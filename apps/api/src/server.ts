import Fastify from 'fastify';
import websocket from 'fastify-websocket';
import { PrismaClient } from '@prisma/client';
import { newDeck, shuffle, deal } from '@poker/engine';
import type * as Types from './types';

const prisma = new PrismaClient();
const app = Fastify({ logger: false });
app.register(websocket);
//
// In-memory game state
//
interface InMemoryState {
  holeCards: Record<string, number[]>;
  community: number[];
  deck: number[];
  players: string[];
  currentIndex: number;
  stacks: Record<string, number>;
  pot: number;
  actionLog: Record<string, Types.Action[]>;
  currentBet: number;
  toCall: Record<string, number>; // playerId to amount to call
}

const gameStates = new Map<string, InMemoryState>();

// Map of tableId → set of WebSocket connections
const tableSockets = new Map<string, Set<{
  socket: WebSocket;
}>>();


app.get('/ws/:tableId', { websocket: true }, (connection, req) => {
  const { tableId } = (req.params as any);
  if (!tableSockets.has(tableId)) {
    tableSockets.set(tableId, new Set());
  }
  tableSockets.get(tableId)!.add(connection);

  connection.socket.on('close', () => {
    tableSockets.get(tableId)!.delete(connection);
  });
});


function broadcast(tableId: string, msg: any) {
  const conns = tableSockets.get(tableId);
  if (!conns) return;
  const data = JSON.stringify(msg);
  for (const { socket } of conns) {
    socket.send(data);
  }
}

app.get(
  '/ws/:tableId',
  { websocket: true },
  (connection, req) => {
    const { tableId } = req.params as { tableId: string };
    if (!tableSockets.has(tableId)) {
      tableSockets.set(tableId, new Set());
    }
    tableSockets.get(tableId)!.add(connection);

    // Clean up on close
    connection.socket.once('close', () => {
      tableSockets.get(tableId)!.delete(connection);
    });
  }
);


//
// Health-check
//
app.get('/health', async () => ({ ok: true }));

//
// Test endpoints
//
app.get('/test-db', async () => {
  const p = await prisma.player.create({ data: { name: 'Alice' } });
  return p;
});

app.get('/test-deck', () => {
  const deck = shuffle(newDeck(), 'test-seed');
  const { hole, flop, turn, river, remainder } = deal(deck);
  return { hole, flop, turn, river, remaining: remainder.length };
});

//
// Start a new game
//
app.post<{ Body: Types.StartGameRequest; Reply: Types.StartGameResponse }>(
  '/start-game',
  async (req, reply) => {
    const { tableName, playerIds } = req.body;

    // 1) Create Table in DB
    const table = await prisma.table.create({
      data: { name: tableName, seats: playerIds.length },
    });

    // 2) Shuffle & deal hole cards
    let deck = shuffle(newDeck(), Date.now().toString());
    const holeMap: Record<string, number[]> = {};

    // Upsert players, persist initial hand history
    for (const pid of playerIds) {
      await prisma.player.upsert({
        where: { id: pid },
        update: {},
        create: { id: pid, name: `Player ${pid}`, chips: 1000 },
      });

      const cards = [deck.shift()!, deck.shift()!];
      holeMap[pid] = cards;

      await prisma.handHistory.create({
        data: {
          tableId: table.id,
          playerId: pid,
          holeCards: cards.join(','),
          community: '',
          actionLog: '[]',
          result: 'none',
        },
      });
    }

    // 3) Initialize in-memory state
    gameStates.set(table.id, {
      holeCards: holeMap,
      community: [],
      deck,
      players: playerIds,
      currentIndex: 0,
      stacks: Object.fromEntries(playerIds.map(pid => [pid, 1000])),
      pot: 0,
      currentBet: 0,
      toCall: Object.fromEntries(playerIds.map(pid => [pid, 0])),
      actionLog: Object.fromEntries(playerIds.map(pid => [pid, []])),
    });

    // 4) Respond
    const resp = {
      tableId: table.id,
      holeCards: holeMap,
      community: [],
      deckRemaining: deck.length,
    };
    broadcast(table.id, { type: 'gameState', payload: resp });
    return resp;
  }
);

//
// Fetch current game state
//
app.get<{
  Querystring: { tableId: string };
  Reply: Types.GameStateResponse;
}>('/game-state', async (req, reply) => {
  const { tableId } = req.query;
  const state = gameStates.get(tableId);
  if (!state) {
    return reply.status(404).send({ error: 'Game not found' } as any);
  }

  return {
    tableId,
    holeCards: state.holeCards,
    community: state.community,
    deckRemaining: state.deck.length,
    pot: state.pot,
    stacks: state.stacks,
    toAct: state.players[state.currentIndex],
    actionLog: state.actionLog,
  };
});

//
// Handle a bet / action
//
app.post<{ Body: Types.BetRequest; Reply: Types.BetResponse }>(
  '/bet',
  async (req, reply) => {
    const { tableId, playerId, action, amount } = req.body;
    const state = gameStates.get(tableId);
    if (!state) {
      return reply.status(404).send({ success: false, error: 'Table not found' });
    }

    // Validate turn
    const expected = state.players[state.currentIndex];
    if (playerId !== expected) {
      return reply
        .status(400)
        .send({ success: false, error: 'Not your turn' });
    }

    // Process action
    switch (action) {
      case 'fold':
        state.actionLog[playerId].push('fold');
        state.players = state.players.filter(p => p !== playerId);
        if (state.players.length === 1) {
          const winner = state.players[0];
          state.stacks[winner] += state.pot; // winner takes pot

          await prisma.handHistory.updateMany({
            where: { tableId, playerId: winner },
            data: { result: 'win'},
          });
          await prisma.handHistory.updateMany({
            where: { tableId, NOT: { playerId: winner } },
            data: { result: 'lose' },
          });
          gameStates.delete(tableId); // end game
          const potAwarded = state.pot;
          broadcast(tableId, { type: 'handEnded', payload: { winner,  potAwarded} });

          return { success: true, winner, potAwarded: state.pot };
        }
        break;
      case 'check':
        if (state.currentBet !== state.toCall[playerId]) {
          return reply
            .status(400)
            .send({ success: false, error: 'Cannot check, must call or raise' });
        }
        state.actionLog[playerId].push('check');
        break;
      case 'call':
        const amountToCall = state.toCall[playerId];
        if (amountToCall > state.stacks[playerId]) {
          return reply
            .status(400)
            .send({ success: false, error: 'Insufficient funds to call' });
        }
        state.stacks[playerId] -= amountToCall;
        state.pot += amountToCall;
        state.actionLog[playerId].push(`call ${amountToCall}`);
        break;
      case 'raise':
        if (amount == null || amount <= state.currentBet) {
          return reply
            .status(400)
            .send({ success: false, error: 'Raise must exceed current bet' });
        }
        if (amount > state.stacks[playerId] + state.toCall[playerId]) {
          return reply
            .status(400)
            .send({ success: false, error: 'Insufficient chips to raise' });
        }
        const owed = state.toCall[playerId];
        state.stacks[playerId] -= owed; // pay to call
        state.pot += owed; // add to pot

        const raiseAmount = amount - owed; // additional raise
        state.stacks[playerId] -= raiseAmount; // pay raise
        state.pot += raiseAmount; // add to pot
        state.currentBet = amount; // update current bet
        for (const pid of state.players) {
          state.toCall[pid] = amount; // reset to call for all players
        }
        state.toCall[playerId] = 0; // reset for raiser
        state.actionLog[playerId].push(`raise ${amount}`);
        break;
    }

    // Advance turn
    state.currentIndex =
      (state.currentIndex + 1) % state.players.length;

        // If back to first player, deal next street
    if (state.currentIndex === 0) {
      const c = state.community.length;
      state.deck.shift(); // burn
      if (c === 0) {
        state.community.push(...state.deck.splice(0, 3)); // flop
      } else if (c === 3) {
        state.community.push(state.deck.shift()!); // turn
      } else if (c === 4) {
        state.community.push(state.deck.shift()!); // river
      }
      state.currentBet = 0;
      for (const pid of state.players) {
        state.toCall[pid] = 0;
      }
      // else: showdown (to implement)
    }

    const isRiverComplete = state.community.length === 5;
    if (isRiverComplete && state.currentIndex === 0) {
     // Determine winner by stub evaluator (highest random for now)
     let best: string | null = null;
     let bestRank = -Infinity;
     for (const pid of state.players) {
       // stub: use sum of hole community as proxy
       const rank = [...state.holeCards[pid], ...state.community].reduce((s, c) => s + c, 0);
       if (rank > bestRank) { bestRank = rank; best = pid; }
     }
     const winner = best!;
     state.stacks[winner] += state.pot;
     // Persist results
     await prisma.handHistory.updateMany({
       where: { tableId, playerId: winner },
       data: { result: 'win' },
     });
     await prisma.handHistory.updateMany({
       where: { tableId, NOT: { playerId: winner } },
       data: { result: 'lose' },
     });
     gameStates.delete(tableId);
     const potAwarded = state.pot;
     broadcast(tableId, { type: 'handEnded', payload: { winner, potAwarded } });
     return { success: true, winner, potAwarded: state.pot };
   }


    // Build updated GameStateResponse
    const gameState: Types.GameStateResponse = {
      tableId,
      holeCards: state.holeCards,
      community: state.community,
      deckRemaining: state.deck.length,
      pot: state.pot,
      stacks: state.stacks,
      toAct: state.players[state.currentIndex],
      actionLog: state.actionLog,
    };
    broadcast(tableId, { type: 'gameState', payload: gameState });
    return { success: true, gameState };
  }
);

//
// Start the server
//
async function start() {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' });
    console.log('🚀 API listening on http://localhost:4000');
  } catch (err) {
    console.error('Failed to start API:', err);
    process.exit(1);
  }
}
start();
