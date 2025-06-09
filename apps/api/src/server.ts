import Fastify from 'fastify';
import websocket from 'fastify-websocket';
import { PrismaClient } from '@prisma/client';
import { newDeck, shuffle, deal } from '@poker/engine';
import type * as Types from './types';
import { Hand } from 'pokersolver';
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
  bets: Record<string, number>; // playerId to amount bet this round
  toCall: Record<string, number>; // playerId to amount to call
}

function calculatePots(state: InMemoryState): { pot: number, players: string[], winners: string[] }[] {
  const playersInHand = Object.keys(state.holeCards);
  const pots = [];
  
  // Create a sorted list of bets from players who are still in the hand
  const sortedBets = [...new Set(playersInHand.map(p => state.bets[p]))].sort((a, b) => a - b);

  let lastBet = 0;
  for (const bet of sortedBets) {
    const pot = {
      amount: 0,
      players: playersInHand.filter(p => state.bets[p] >= bet)
    };
    for (const player of playersInHand) {
      const contribution = Math.min(state.bets[player], bet) - lastBet;
      if (contribution > 0) {
        pot.amount += contribution;
      }
    }
    pots.push(pot);
    lastBet = bet;
  }
  
  // Now determine the winner(s) for each pot
  const potResults = pots.map(pot => {
    const eligibleHands = pot.players.map(pid => {
      const hand = evaluateHand(state.holeCards[pid], state.community);
      return { ...hand, playerId: pid };
    });
    const winners = Hand.winners(eligibleHands).map(w => w.playerId);
    return { pot: pot.amount, players: pot.players, winners };
  });

  return potResults;
}

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
    const initialState = {
      holeCards: holeMap,
      community: [],
      deck,
      players: playerIds,
      currentIndex: 0,
      stacks: Object.fromEntries(playerIds.map(pid => [pid, 1000])),
      pot: 0,
      currentBet: 0,
      toCall: Object.fromEntries(playerIds.map(pid => [pid, 0])),
      bets: Object.fromEntries(playerIds.map(pid => [pid, 0])),
      actionLog: Object.fromEntries(playerIds.map(pid => [pid, []])),
    };

await prisma.gameState.create({
  data: {
    tableId: table.id,
    state: initialState,
  },
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

  // 1. Fetch the game state from the database
  const gameStateRecord = await prisma.gameState.findUnique({
    where: { tableId },
  });

  // 2. Handle the case where the game doesn't exist
  if (!gameStateRecord) {
    return reply.status(404).send({ error: 'Game not found' } as any);
  }

  // 3. Extract the state and cast it to your InMemoryState type
  const state: InMemoryState = gameStateRecord.state as any;

  // 4. Construct and return the response, just like before
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
    const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
    if (!gameStateRecord) {
      return reply.status(404).send({ success: false, error: 'Game not found' });
    }
    const state: InMemoryState = gameStateRecord.state;
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
          await prisma.gameState.delete({ where: { tableId }});  // end game
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
      case 'call': {
        const amountToCall = state.toCall[playerId];
        if (amountToCall > state.stacks[playerId]) {
          return reply
            .status(400)
            .send({ success: false, error: 'Insufficient funds to call' });
        }
        state.stacks[playerId] -= amountToCall;
        state.pot += amountToCall;
        state.bets[playerId] += amountToCall; // <-- ADD THIS LINE
        state.actionLog[playerId].push('call'); // Simplified action log
        break;
      }
      case 'raise': {
        if (amount == null || amount <= state.currentBet) {
          return reply
            .status(400)
            .send({ success: false, error: 'Raise must exceed current bet' });
        }
        
        const totalBetAmount = amount;
        const amountToCall = state.toCall[playerId];
        const totalCost = totalBetAmount - state.bets[playerId];

        if (totalCost > state.stacks[playerId]) {
          return reply
            .status(400)
            .send({ success: false, error: 'Insufficient chips to raise' });
        }
        
        state.stacks[playerId] -= totalCost;
        state.pot += totalCost;
        state.bets[playerId] = totalBetAmount; // <-- SET THE TOTAL BET
        state.currentBet = totalBetAmount;

        // Update what other players need to call
        for (const pid of state.players) {
          if (pid !== playerId) {
            state.toCall[pid] = state.currentBet - state.bets[pid];
          }
        }
        state.toCall[playerId] = 0;
        
        state.actionLog[playerId].push(`raise ${amount}`);
        break;
      }
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
        state.bets[pid] = 0; // Reset bets for the new round
      }
      // else: showdown (to implement)
    }

    const isRiverComplete = state.community.length === 5;
        if ((isRiverComplete && state.currentIndex === 0) || state.players.length === 1) {
      const potResults = calculatePots(state);
      
      const winnersSummary = [];
      const allWinners = new Set<string>();

      // Distribute winnings
      for (const pot of potResults) {
        const potShare = pot.pot / pot.winners.length;
        for (const winnerId of pot.winners) {
          state.stacks[winnerId] += potShare;
          allWinners.add(winnerId);
          winnersSummary.push({playerId: winnerId, amount: potShare});
        }
      }
      
      const winnerIds = Array.from(allWinners);

      // Persist results
      await prisma.handHistory.updateMany({
        where: { tableId, playerId: { in: winnerIds } },
        data: { result: 'win' },
      });
      await prisma.handHistory.updateMany({
        where: { tableId, NOT: { playerId: { in: winnerIds } } },
        data: { result: 'lose' },
      });
      
      // End of game cleanup
      await prisma.gameState.delete({ where: { tableId }});
      
      // Broadcast the results
      const payload = { winners: winnersSummary };
      broadcast(tableId, { type: 'handEnded', payload });
      
      return { success: true, gameState: { ...state, players: [] }, winners: payload.winners };
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
    await prisma.gameState.update({
      where: { tableId },
      data: { state: state as any },
    });
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
