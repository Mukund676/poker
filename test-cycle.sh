#!/usr/bin/env bash
set -euo pipefail

# API_URL="http://your-deployed-url" # Uncomment and set if testing a deployed API
API_URL="http://localhost:4000"
echo "Testing API at $API_URL"
echo

# Create two players
P1=$(curl -s $API_URL/test-db | jq -r '.id')
P2=$(curl -s $API_URL/test-db | jq -r '.id')

# ==============================================================================
# Test 1: Fold Test
# =================================h=============================================
echo "--- Test 1: Fold Test ---"
TABLE1=$(curl -s -X POST $API_URL/start-game \
  -H 'Content-Type: application/json' \
  -d "{\"tableName\":\"FoldTest\",\"playerIds\":[\"$P1\",\"$P2\"]}" \
  | jq -r '.tableId')
echo "Game created with Table ID: $TABLE1"
echo "P1 folds, expecting P2 to win the pot."
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE1\",\"playerId\":\"$P1\",\"action\":\"fold\"}" | jq
echo "Checking game-end cleanup..."
# This should now fail with a 404, which is the correct behavior
if curl -s "http://localhost:4000/game-state?tableId=$TABLE1" | jq -e '.error == "Game not found"'; then
  echo "SUCCESS: Game state was correctly deleted after fold."
else
  echo "FAILURE: Game state was not deleted after fold."
  exit 1
fi
echo "--- Fold Test Passed ---"
echo

# ==============================================================================
# Test 2: Showdown Test
# ==============================================================================
echo "--- Test 2: Showdown Test ---"
TABLE2=$(curl -s -X POST $API_URL/start-game \
  -H 'Content-Type: application/json' \
  -d "{\"tableName\":\"ShowdownTest\",\"playerIds\":[\"$P1\",\"$P2\"]}" \
  | jq -r '.tableId')
echo "Game created with Table ID: $TABLE2"
echo "Advancing through streets by checking..."

# 1) Pre-flop → flop
echo "==> Pre-flop checks"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}" >/dev/null

# 2) Flop → turn
echo "==> Flop checks"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}" >/dev/null

# 3) Turn → river
echo "==> Turn checks"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}" >/dev/null

# 4) River → showdown
echo "==> River checks (expect showdown response)"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P1\",\"action\":\"check\"}" >/dev/null
FINAL_RESP=$(curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE2\",\"playerId\":\"$P2\",\"action\":\"check\"}")

echo "Showdown response:"
echo "$FINAL_RESP" | jq .
if echo "$FINAL_RESP" | jq -e '.winners | length > 0'; then
    echo "SUCCESS: Showdown occurred and winners were declared."
else
    echo "FAILURE: Showdown did not produce winners."
    exit 1
fi
echo "--- Showdown Test Passed ---"
echo

# ==============================================================================
# Test 3: Raise Test
# ==============================================================================
echo "--- Test 3: Raise Test ---"
TABLE3=$(curl -s -X POST $API_URL/start-game \
  -H 'Content-Type: application/json' \
  -d "{\"tableName\":\"RaiseTest\",\"playerIds\":[\"$P1\",\"$P2\"]}" \
  | jq -r '.tableId')
echo "Game created with Table ID: $TABLE3"
echo "P1 raises to 50, P2 calls."

# P1 raises
echo "==> P1 raises to 50"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE3\",\"playerId\":\"$P1\",\"action\":\"raise\",\"amount\":50}" >/dev/null

# P2 calls
echo "==> P2 calls"
curl -s -X POST $API_URL/bet \
  -H 'Content-Type: application/json' \
  -d "{\"tableId\":\"$TABLE3\",\"playerId\":\"$P2\",\"action\":\"call\"}" >/dev/null

# Check the pot size
POT_SIZE=$(curl -s "$API_URL/game-state?tableId=$TABLE3" | jq '.pot')
echo "Pot size is: $POT_SIZE"
if [ "$POT_SIZE" -eq 100 ]; then
    echo "SUCCESS: Pot size is correct after raise and call."
else
    echo "FAILURE: Pot size should be 100, but it's $POT_SIZE."
    exit 1
fi
echo "--- Raise Test Passed ---"
echo
echo "All tests passed successfully!"