import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { newDeck, shuffle, deal } from '@poker/engine';
import type * as Types from './types';
import { Hand } from 'pokersolver';

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
app.register(websocket);

const tableSockets = new Map<string, Set<any>>();
const SUITS = ['h', 's', 'c', 'd'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function cardIdToString(cardId: number): string {
  if (cardId < 0 || cardId > 51) return '';
  const suit = SUITS[Math.floor(cardId / 13)];
  const rank = RANKS[cardId % 13];
  return rank + suit;
}

function broadcast(tableId: string, msg: any) {
  const conns = tableSockets.get(tableId);
  if (!conns) return;
  const data = JSON.stringify(msg);
  for (const { socket } of conns) {
    socket.send(data);
  }
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
  } else {
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

app.post<{ Body: Types.StartGameRequest; Reply: Types.StartGameResponse | { error: string, message: string } }>(
  '/start-game',
  async (req, reply) => {
    try {
      const { tableName, playerIds } = req.body;
      const table = await prisma.table.create({ data: { name: tableName, seats: playerIds.length } });
      let deck = shuffle(newDeck(), Date.now().toString());
      const holeMap: Record<string, number[]> = {};
      for (const pid of playerIds) {
        await prisma.player.upsert({
          where: { id: pid },
          update: {},
          create: { id: pid, name: `Player ${pid}`, chips: 1000 },
        });
        const cards = [deck.shift()!, deck.shift()!];
        holeMap[pid] = cards;
      }
      const initialState: Types.InMemoryState = {
        holeCards: holeMap, community: [], deck, players: playerIds, currentIndex: 0,
        stacks: Object.fromEntries(playerIds.map(pid => [pid, 1000])),
        pot: 0, currentBet: 0,
        toCall: Object.fromEntries(playerIds.map(pid => [pid, 0])),
        bets: Object.fromEntries(playerIds.map(pid => [pid, 0])),
        actionLog: Object.fromEntries(playerIds.map(pid => [pid, []])),
      };
      await prisma.gameState.create({ data: { tableId: table.id, state: initialState as any } });
      const resp: Types.StartGameResponse = {
        tableId: table.id, holeCards: holeMap, community: [], deckRemaining: deck.length,
      };
      broadcast(table.id, { type: 'gameState', payload: resp });
      return reply.send(resp);
    } catch (error: any) {
      console.error("!!! ERROR IN /start-game:", error);
      return reply.status(500).send({ error: "Internal Server Error", message: error.message });
    }
  }
);

app.get<{ Querystring: { tableId: string }; Reply: Types.GameStateResponse | { error: string } }>(
  '/game-state', async (req, reply) => {
    const { tableId } = req.query;
    const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
    if (!gameStateRecord) {
      return reply.status(404).send({ error: 'Game not found' });
    }
    const state: Types.InMemoryState = gameStateRecord.state as any;
    const response: Types.GameStateResponse = {
        tableId,
        holeCards: state.holeCards, community: state.community,
        deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
        toAct: state.players[state.currentIndex], actionLog: state.actionLog,
    };
    return reply.send(response);
  });

app.post<{ Body: Types.BetRequest; Reply: Types.BetResponse }>(
  '/bet', async (req, reply) => {
    const { tableId, playerId, action, amount } = req.body;
    const gameStateRecord = await prisma.gameState.findUnique({ where: { tableId } });
    if (!gameStateRecord) {
      return reply.status(404).send({ success: false, error: 'Game not found' });
    }
    const state: Types.InMemoryState = gameStateRecord.state as any;
    if (state.players.length > 0 && playerId !== state.players[state.currentIndex]) {
      return reply.status(400).send({ success: false, error: 'Not your turn' });
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
          return reply.send({ success: true, winners: winnersSummary });
        }
        break;
      case 'check':
        if (state.currentBet > (state.bets[playerId] || 0)) {
          return reply.status(400).send({ success: false, error: 'Cannot check, must call or raise' });
        }
        state.actionLog[playerId].push({ action: 'check' });
        break;
      case 'call': {
        const amountToCall = state.currentBet - (state.bets[playerId] || 0);
        if (amountToCall > state.stacks[playerId]) {
            return reply.status(400).send({ success: false, error: 'Insufficient funds to call' });
        }
        state.stacks[playerId] -= amountToCall;
        state.bets[playerId] = (state.bets[playerId] || 0) + amountToCall;
        state.actionLog[playerId].push({ action: 'call' });
        break;
      }
      case 'raise': {
        if (amount == null || amount <= state.currentBet) {
          return reply.status(400).send({ success: false, error: 'Raise must exceed current bet' });
        }
        const cost = amount - (state.bets[playerId] || 0);
        if (cost > state.stacks[playerId]) {
          return reply.status(400).send({ success: false, error: 'Insufficient funds to raise' });
        }
        state.stacks[playerId] -= cost;
        state.currentBet = amount;
        state.bets[playerId] = amount;
        state.actionLog[playerId].push({ action: 'raise', amount });
        break;
      }
    }

    if (action === 'fold') {
      if (state.players.length > 0) {
        state.currentIndex = state.currentIndex % state.players.length;
      }
    } else {
      if (state.players.length > 0) {
        state.currentIndex = (state.currentIndex + 1) % state.players.length;
      }
    }

    // --- START OF FIX ---
    // This new logic correctly determines if the betting round has concluded.
    let isBettingRoundOver = false;
    const betsAreEqual = state.players.every(p => (state.bets[p] || 0) === state.currentBet);

    if (betsAreEqual) {
        // If there was a bet/raise and everyone has called, the round is over.
        if (state.currentBet > 0) {
            isBettingRoundOver = true;
        } 
        // If the round was just checks, it's only over when the action gets back to the start.
        else if (state.currentBet === 0 && state.currentIndex === 0) {
            isBettingRoundOver = true;
        }
    }
    // --- END OF FIX ---

    if (isBettingRoundOver) {
        if (state.community.length < 5) {
            state.deck.shift(); // burn card
            const toDeal = state.community.length === 0 ? 3 : 1;
            state.community.push(...state.deck.splice(0, toDeal));
            state.currentBet = 0;
            state.bets = Object.fromEntries(state.players.map(p => [p, 0]));
            state.currentIndex = 0;
            await prisma.gameState.update({ where: { tableId }, data: { state: state as any } });
            const response: Types.GameStateResponse = {
              tableId, holeCards: state.holeCards, community: state.community,
              deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
              toAct: state.players[state.currentIndex], actionLog: state.actionLog,
            };
            broadcast(tableId, { type: 'gameState', payload: response });
            return reply.send({ success: true, gameState: response });
        }
    }

    const handIsOverAfterShowdown = state.community.length === 5 && isBettingRoundOver;

    if (handIsOverAfterShowdown) {
      for(const pid of Object.keys(state.bets)) {
          state.pot += state.bets[pid] || 0;
          state.bets[pid] = 0;
      }
      const potResults = calculatePots(state);
      const winnersSummary: { playerId: string; amount: number }[] = [];
      for (const pot of potResults) {
        const share = pot.winners.length > 0 ? pot.pot / pot.winners.length : 0;
        pot.winners.forEach(winnerId => {
            state.stacks[winnerId] += share;
            const existingWinner = winnersSummary.find(w => w.playerId === winnerId);
            if(existingWinner) {
              existingWinner.amount += share;
            } else {
              winnersSummary.push({playerId: winnerId, amount: share});
            }
        });
      }
      await prisma.gameState.delete({ where: { tableId } });
      broadcast(tableId, { type: 'handEnded', payload: { winners: winnersSummary } });
      return reply.send({ success: true, winners: winnersSummary });
    }

    await prisma.gameState.update({ where: { tableId }, data: { state: state as any } });
    const response: Types.GameStateResponse = {
      tableId, holeCards: state.holeCards, community: state.community,
      deckRemaining: state.deck.length, pot: state.pot, stacks: state.stacks,
      toAct: state.players[state.currentIndex], actionLog: state.actionLog,
    };
    broadcast(tableId, { type: 'gameState', payload: response });
    return reply.send({ success: true, gameState: response });
  }
);

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
