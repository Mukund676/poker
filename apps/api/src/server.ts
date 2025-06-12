import fastify from 'fastify';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { newDeck, shuffle } from '@poker/engine';
import type * as Types from './types';
import { Hand } from 'pokersolver';
import cors from '@fastify/cors';

const prisma = new PrismaClient();
const app = fastify({ logger: true });

app.register(cors, { origin: '*' });
app.register(websocket);

const connections = new Map<string, Set<any>>();

app.register(async function (fastify) {
  
  // --- Helper Functions ---
  const SUITS = ['h', 's', 'c', 'd'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

  function cardIdToString(cardId: number): string {
    if (cardId < 0 || cardId > 51) return '';
    const suit = SUITS[Math.floor(cardId / 13)];
    const rank = RANKS[cardId % 13];
    return rank + suit;
  }

  function calculatePots(state: Types.InMemoryState): { pot: number, players: string[], winners: string[] }[] {
    const playersInHand = Object.keys(state.holeCards).filter(p => state.players.includes(p));
    const pots: { amount: number; players: string[] }[] = [];
    const sortedBets = [...new Set(playersInHand.map(p => state.bets[p] || 0))].sort((a, b) => a - b);
    let lastBetLevel = 0;
    for (const betLevel of sortedBets) {
        if (betLevel <= lastBetLevel) continue;
        const pot = {
            amount: 0,
            players: playersInHand.filter(p => (state.bets[p] || 0) >= betLevel)
        };
        for (const player of playersInHand) {
            const contribution = Math.min(state.bets[player] || 0, betLevel) - lastBetLevel;
            if (contribution > 0) {
                pot.amount += contribution;
            }
        }
        if (pot.amount > 0) {
            pots.push(pot);
        }
        lastBetLevel = betLevel;
    }
    const mainPotAmount = state.pot;
    if(pots.length > 0) {
      pots[0].amount += mainPotAmount;
    } else if (mainPotAmount > 0) {
      pots.push({ amount: mainPotAmount, players: [...state.players] });
    }

    const potResults = pots.map(pot => {
      const communityCardsStr = state.community.map(cardIdToString);
      const eligibleHands = pot.players.map(pid => {
        const holeCardsStr = state.holeCards[pid].map(cardIdToString);
        const allCards = holeCardsStr.concat(communityCardsStr);
        const solvedHand = Hand.solve(allCards);
        return { pid: pid, solvedHand: solvedHand };
      });
      if (eligibleHands.length === 0) {
        return { pot: pot.amount, players: pot.players, winners: [] };
      }
      const winningPokerHands = Hand.winners(eligibleHands.map(h => h.solvedHand));
      const winningDescr = winningPokerHands[0].descr;
      const winners = eligibleHands.filter(h => h.solvedHand.descr === winningDescr).map(h => h.pid);
      return { pot: pot.amount, players: pot.players, winners: [...new Set(winners)] };
    });
    return potResults;
  }
  
  function broadcast(tableId: string, msg: any) {
    const clients = connections.get(tableId);
    if (!clients) return;
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  // --- NEW: Central function to apply actions and advance the game ---
  async function applyAction(tableId: string, playerId: string, action: string, amount?: number) {
    const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
    if (!gameStateRecord) throw new Error('Game not found');

    const state: Types.InMemoryState = gameStateRecord.state as any;
    if (state.players.length > 0 && playerId !== state.players[state.currentIndex]) {
      throw new Error('Not your turn');
    }

    switch (action) {
      case 'fold':
        state.actionLog[playerId].push({ action: 'fold' });
        state.players = state.players.filter(p => p !== playerId);
        if (state.players.length === 1) {
          const winnerId = state.players[0];
          const totalPot = state.pot + Object.values(state.bets).reduce((sum, bet) => sum + (bet || 0), 0);
          state.stacks[winnerId] += totalPot;
          const winnersSummary = [{ playerId: winnerId, amount: totalPot }];
          await prisma.gameState.delete({ where: { tableId } });
          broadcast(tableId, { type: 'handEnded', payload: { winners: winnersSummary } });
          return; // End of hand
        }
        break;
      case 'check':
        if (state.currentBet > (state.bets[playerId] || 0)) {
            throw new Error('Cannot check, must call or raise');
        }
        state.actionLog[playerId].push({ action: 'check' });
        break;
      case 'call': {
        const amountToCall = state.currentBet - (state.bets[playerId] || 0);
        if (amountToCall > state.stacks[playerId]) throw new Error('Insufficient funds to call');
        state.stacks[playerId] -= amountToCall;
        state.bets[playerId] = (state.bets[playerId] || 0) + amountToCall;
        state.actionLog[playerId].push({ action: 'call' });
        break;
      }
      case 'raise': {
        if (amount == null || amount <= state.currentBet) {
            throw new Error('Raise must exceed current bet');
        }
        const cost = amount - (state.bets[playerId] || 0);
        if (cost > state.stacks[playerId]) {
            throw new Error('Insufficient funds to raise');
        }
        state.stacks[playerId] -= cost;
        state.currentBet = amount;
        state.bets[playerId] = amount;
        state.actionLog[playerId].push({ action: 'raise', amount });
        break;
      }
    }

    // Advance turn
    if (action === 'fold') {
        if (state.players.length > 0) state.currentIndex = state.currentIndex % state.players.length;
    } else {
        if (state.players.length > 0) state.currentIndex = (state.currentIndex + 1) % state.players.length;
    }

    // Check for end of betting round
    let isBettingRoundOver = false;
    const activePlayers = state.players.filter(p => state.holeCards[p]);
    // Round is over if all active players have bet the same amount, and the amount is not zero
    // or if all players have checked (bet is zero)
    const betsAreEqual = activePlayers.every(p => (state.bets[p] || 0) === state.currentBet);
    const allActivePlayersHaveActed = activePlayers.every(p => state.actionLog[p] && state.actionLog[p].length > 0);

    if (betsAreEqual && allActivePlayersHaveActed) {
      isBettingRoundOver = true;
    }

    if (isBettingRoundOver) {
        // Collect bets into the pot
        state.pot += Object.values(state.bets).reduce((sum, bet) => sum + bet, 0);
        // Reset bets for next round
        state.bets = Object.fromEntries(state.players.map(p => [p, 0]));
        state.currentBet = 0;
        state.currentIndex = 0;
        state.actionLog = Object.fromEntries(state.players.map(p => [p, []]));

        // Deal next community cards if not at the river
        if (state.community.length < 5) {
            state.deck.shift(); // Burn card
            const toDeal = state.community.length === 0 ? 3 : 1;
            for(let i=0; i<toDeal; ++i) state.community.push(state.deck.shift()!);
        }
    }

    const handIsOverAfterShowdown = state.community.length === 5 && isBettingRoundOver;

    if (handIsOverAfterShowdown) {
      const potResults = calculatePots(state);
      const winnersSummary: { playerId: string; amount: number }[] = [];
      for (const pot of potResults) {
        const share = pot.winners.length > 0 ? Math.floor(pot.pot / pot.winners.length) : 0;
        pot.winners.forEach(winnerId => {
          state.stacks[winnerId] += share;
          const existingWinner = winnersSummary.find(w => w.playerId === winnerId);
          if (existingWinner) {
            existingWinner.amount += share;
          } else {
            winnersSummary.push({ playerId: winnerId, amount: share });
          }
        });
      }
      await prisma.gameState.delete({ where: { tableId } });
      broadcast(tableId, { type: 'handEnded', payload: { winners: winnersSummary } });
      return; // End of hand
    }
    
    await prisma.gameState.update({ where: { tableId }, data: { state: state as any } });
    const response: Types.GameStateResponse = {
        tableId, holeCards: state.holeCards, community: state.community,
        deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
        toAct: state.players[state.currentIndex], actionLog: state.actionLog,
    };
    broadcast(tableId, { type: 'gameState', payload: response });

    await processAiTurn(tableId);
  }

  // --- NEW: Function to process AI turns ---
  async function processAiTurn(tableId: string) {
    const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
    if (!gameStateRecord) return; // Game ended

    const state: Types.InMemoryState = gameStateRecord.state as any;
    if (state.players.length === 0) return; // No players left
    
    const playerToAct = state.players[state.currentIndex];

    if (state.aiPlayers.includes(playerToAct)) {
      // Simple AI: Always call if possible, otherwise check.
      setTimeout(async () => {
        const amountToCall = state.currentBet - (state.bets[playerToAct] || 0);
        if (amountToCall > 0) {
            if(state.stacks[playerToAct] >= amountToCall) {
                await applyAction(tableId, playerToAct, 'call');
            } else {
                // Not enough to call, must go all-in or fold, let's just call all-in
                await applyAction(tableId, playerToAct, 'call');
            }
        } else {
            await applyAction(tableId, playerToAct, 'check');
        }
      }, 1000); // 1-second delay for AI action
    }
  }

  // WebSocket route
  fastify.get('/ws/:tableId', { websocket: true }, (connection, req) => {
    const { tableId } = req.params as { tableId: string };
    if (!tableId) return;
    const clients = connections.get(tableId);
    if (!clients) return connection.close(1011, 'Game not found');
    clients.add(connection);
    prisma.gameState.findUnique({ where: { tableId } }).then(gameStateRecord => {
      if (connection.readyState === 1 && gameStateRecord) {
        const state: Types.InMemoryState = gameStateRecord.state as any;
        const response: Types.GameStateResponse = {
          tableId, holeCards: state.holeCards, community: state.community,
          deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
          toAct: state.players[state.currentIndex], actionLog: state.actionLog,
        };
        connection.send(JSON.stringify({ type: 'gameState', payload: response }));
      }
    });
    connection.on('close', () => {
      clients.delete(connection);
    });
  });
  
  // HTTP routes
  fastify.post('/start-game', async (req, reply) => {
    try {
      const { tableName, players } = req.body as { tableName: string, players: {id: string, type: 'human' | 'ai'}[]};
      const playerIds = players.map(p => p.id);
      const aiPlayerIds = players.filter(p => p.type === 'ai').map(p => p.id);
      const table = await prisma.table.create({ data: { name: tableName, seats: playerIds.length } });
      connections.set(table.id, new Set());
      let deck = shuffle(newDeck(), Date.now().toString());
      const holeMap: Record<string, number[]> = {};
      for (const pid of playerIds) {
        await prisma.player.upsert({
          where: { id: pid },
          update: {},
          create: { id: pid, name: `Player ${pid.substring(0,4)}`, chips: 1000 },
        });
        const cards = [deck.shift()!, deck.shift()!];
        holeMap[pid] = cards;
      }
      const initialState: Types.InMemoryState = {
        holeCards: holeMap, community: [], deck, players: playerIds, 
        aiPlayers: aiPlayerIds, // Store AI players
        currentIndex: 0,
        stacks: Object.fromEntries(playerIds.map(pid => [pid, 1000])),
        pot: 0, currentBet: 0,
        toCall: Object.fromEntries(playerIds.map(pid => [pid, 0])),
        bets: Object.fromEntries(playerIds.map(pid => [pid, 0])),
        actionLog: Object.fromEntries(playerIds.map(pid => [pid, []])),
      };
      await prisma.gameState.create({ data: { tableId: table.id, state: initialState as any } });
      
      const response: Types.GameStateResponse = {
        tableId: table.id,
        holeCards: initialState.holeCards,
        community: initialState.community,
        deckRemaining: initialState.deck.length,
        pot: initialState.pot,
        stacks: initialState.stacks,
        toAct: initialState.players[initialState.currentIndex],
        actionLog: initialState.actionLog
      };
      broadcast(table.id, { type: 'gameState', payload: response });
      await processAiTurn(table.id);
      reply.send({ tableId: table.id });
    } catch (error: any) {
      app.log.error("!!! ERROR IN /start-game:", error);
      return reply.status(500).send({ error: "Internal Server Error", message: error.message });
    }
  });

  fastify.post<{ Body: Types.BetRequest; Reply: Types.BetResponse }>(
    '/bet', async (req, reply) => {
      const { tableId, playerId, action, amount } = req.body;
      try {
        await applyAction(tableId, playerId, action, amount);
        reply.send({ success: true });
      } catch (error: any) {
        reply.status(400).send({ success: false, error: error.message });
      }
  });

  fastify.get<{ Querystring: { tableId: string }; Reply: Types.GameStateResponse | { error: string } }>(
    '/game-state', async (req, reply) => {
      const { tableId } = req.query;
      const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
      if (!gameStateRecord) return reply.status(404).send({ error: 'Game not found' });
      const state: Types.InMemoryState = gameStateRecord.state as any;
      const response: Types.GameStateResponse = {
        tableId, holeCards: state.holeCards, community: state.community,
        deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
        toAct: state.players[state.currentIndex], actionLog: state.actionLog,
      };
      return reply.send(response);
    });
});

// Start the server
async function start() {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error('Failed to start API:', err);
    process.exit(1);
  }
}
start();
