#!/usr/bin/env bash
set -euo pipefail

# Create two players
P1=$(curl -s http://localhost:4000/test-db | jq -r '.id')
P2=$(curl -s http://localhost:4000/test-db | jq -r '.id')

# Fold test
TABLE1=$(curl -s -X POST http://localhost:4000/start-game \
  -H 'Content-Type: application/json' \
  -d "{\"tableName\":\"FoldTest\",\"playerIds\":[\"$P1\",\"$P2\"]}" \
  | jq -r '.tableId')
echo "Fold test: P1 folds"
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE1\",\"playerId\":\"$P1\",\"action\":\"fold\"}" | jq
echo "Expect game-end cleanup:"
curl -s "http://localhost:4000/game-state?tableId=$TABLE1" || echo "Game ended"

# Showdown test
TABLE2=$(curl -s -X POST http://localhost:4000/start-game \
  -H 'Content-Type: application/json' \
  -d "{\"tableName\":\"ShowdownTest\",\"playerIds\":[\"$P1\",\"$P2\"]}" \
  | jq -r '.tableId')
echo
echo "Showdown test: advance through streets by single check–check pairs"

# 1) Pre-flop → flop
echo "== Pre-flop checks =="
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}" >/dev/null
echo "Community size:" \
  $(curl -s "http://localhost:4000/game-state?tableId=$TABLE2" | jq '.community | length')

# 2) Flop → turn
echo "== Flop checks =="
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}" >/dev/null
echo "Community size:" \
  $(curl -s "http://localhost:4000/game-state?tableId=$TABLE2" | jq '.community | length')

# 3) Turn → river + showdown
echo "== Turn checks (expect showdown response) =="
curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
FINAL=$(curl -s -X POST http://localhost:4000/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}")
echo "$FINAL" | jq
