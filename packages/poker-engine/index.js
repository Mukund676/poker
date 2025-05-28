const seedrandom = require('seedrandom');

// Card: 0–51 mapping
// Build a fresh deck
function newDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

// Fisher–Yates shuffle with optional seed
function shuffle(deck, seed) {
  const drng = seed ? seedrandom(seed) : Math.random;
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(drng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal hole + community
function deal(deck) {
  const d = deck.slice();
  const hole = [d.shift(), d.shift()];
  d.shift(); // burn
  const flop = [d.shift(), d.shift(), d.shift()];
  d.shift(); // burn
  const turn = d.shift();
  d.shift(); // burn
  const river = d.shift();
  return { hole, flop, turn, river, remainder: d };
}

module.exports = { newDeck, shuffle, deal };
