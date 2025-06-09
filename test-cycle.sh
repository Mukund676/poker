#!/bin/bash

# --- Comprehensive API Test Cycle for Poker Monorepo ---
#
# This script tests all major API functions to ensure game logic is correct.
# It uses unique IDs for every test to ensure test isolation.
#
# It will exit immediately if any command fails.
#
# Dependencies:
# - jq: For parsing JSON responses. (Install with `sudo apt-get install jq`)
# - uuidgen: For generating unique IDs. (Usually pre-installed)

set -e

# --- Configuration ---
API_URL="http://localhost:4000"

# --- Helper Functions ---
print_header() {
  echo ""
  echo "======================================================================"
  echo "=> $1"
  echo "======================================================================"
  echo ""
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# --- Pre-flight Check ---
if ! command_exists jq; then
  echo "❌ ERROR: 'jq' is not installed. Please install it to run this script."
  echo "On Debian/Ubuntu: sudo apt-get install jq"
  echo "On macOS: brew install jq"
  exit 1
fi

# --- Test 1: Basic Fold Scenario ---
test_fold_scenario() {
  print_header "Test 1: Fold Scenario"
  local P1_ID=$(uuidgen)
  local P2_ID=$(uuidgen)
  local TABLE_NAME="Test-Fold-$(date +%s)"

  echo "Starting game with P1: $P1_ID, P2: $P2_ID"
  local START_GAME_RESPONSE=$(curl -s -X POST "$API_URL/start-game" -H "Content-Type: application/json" -d "{\"tableName\": \"$TABLE_NAME\", \"playerIds\": [\"$P1_ID\", \"$P2_ID\"]}")
  local TABLE_ID=$(echo "$START_GAME_RESPONSE" | jq -r '.tableId')

  if [ "$TABLE_ID" == "null" ] || [ -z "$TABLE_ID" ]; then
    echo "❌ FAILURE: Failed to create game. Response: $START_GAME_RESPONSE"
    exit 1
  fi
  echo "Game created with Table ID: $TABLE_ID"

  echo "P1 ($P1_ID) folds..."
  local FOLD_RESPONSE=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"fold\"}")
  
  local WINNER_ID=$(echo "$FOLD_RESPONSE" | jq -r '.winners[0].playerId')
  if [ "$WINNER_ID" == "$P2_ID" ]; then
    echo "✅ SUCCESS: API correctly identified P2 ($P2_ID) as the winner."
  else
    echo "❌ FAILURE: Incorrect winner. Expected P2. Response: $FOLD_RESPONSE"
    exit 1
  fi

  echo "Verifying game state cleanup..."
  sleep 1
  local GAME_STATE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/game-state?tableId=$TABLE_ID")
  if [ "$GAME_STATE_CHECK" -eq 404 ]; then
    echo "✅ SUCCESS: Game state was correctly deleted."
  else
    echo "❌ FAILURE: Game state was NOT deleted (HTTP $GAME_STATE_CHECK)."
    exit 1
  fi
}

# --- Test 2: Showdown Scenario (Check all the way) ---
test_showdown_scenario() {
  print_header "Test 2: Showdown Scenario"
  local P1_ID=$(uuidgen)
  local P2_ID=$(uuidgen)
  local TABLE_NAME="Test-Showdown-$(date +%s)"

  echo "Starting game with P1: $P1_ID, P2: $P2_ID"
  local START_GAME_RESPONSE=$(curl -s -X POST "$API_URL/start-game" -H "Content-Type: application/json" -d "{\"tableName\": \"$TABLE_NAME\", \"playerIds\": [\"$P1_ID\", \"$P2_ID\"]}")
  local TABLE_ID=$(echo "$START_GAME_RESPONSE" | jq -r '.tableId')
  echo "Game created with Table ID: $TABLE_ID"

  # Pre-flop betting
  echo "--- Round: Pre-flop ---"
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"check\"}" > /dev/null
  echo "P1 checks."
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"check\"}" > /dev/null
  echo "P2 checks. (Flop should be dealt)"

  # Flop betting
  echo "--- Round: Flop ---"
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"check\"}" > /dev/null
  echo "P1 checks."
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"check\"}" > /dev/null
  echo "P2 checks. (Turn should be dealt)"
  
  # Turn betting
  echo "--- Round: Turn ---"
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"check\"}" > /dev/null
  echo "P1 checks."
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"check\"}" > /dev/null
  echo "P2 checks. (River should be dealt)"

  # River betting - final action triggers showdown
  echo "--- Round: River ---"
  curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"check\"}" > /dev/null
  echo "P1 checks."
  local FINAL_RESPONSE=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"check\"}")
  echo "P2 checks. (Showdown)"

  echo "Final API Response:"
  echo "$FINAL_RESPONSE" | jq .
  
  local WINNER_COUNT=$(echo "$FINAL_RESPONSE" | jq -r '.winners | length')
  if [ "$WINNER_COUNT" -ge 1 ]; then
    echo "✅ SUCCESS: Showdown occurred and winner(s) were declared."
  else
    echo "❌ FAILURE: Showdown did not declare a winner. Response: $FINAL_RESPONSE"
    exit 1
  fi
  
  echo "Verifying game state cleanup..."
  sleep 1
  local GAME_STATE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/game-state?tableId=$TABLE_ID")
  if [ "$GAME_STATE_CHECK" -eq 404 ]; then
    echo "✅ SUCCESS: Game state was correctly deleted."
  else
    echo "❌ FAILURE: Game state was NOT deleted (HTTP $GAME_STATE_CHECK)."
    exit 1
  fi
}

# --- Test 3: Complex Betting with 3 Players ---
test_complex_betting_scenario() {
  print_header "Test 3: Complex 3-Player Scenario"
  local P1_ID=$(uuidgen)
  local P2_ID=$(uuidgen)
  local P3_ID=$(uuidgen)
  local TABLE_NAME="Test-Complex-$(date +%s)"

  echo "Starting game with P1: $P1_ID, P2: $P2_ID, P3: $P3_ID"
  local START_GAME_RESPONSE=$(curl -s -X POST "$API_URL/start-game" -H "Content-Type: application/json" -d "{\"tableName\": \"$TABLE_NAME\", \"playerIds\": [\"$P1_ID\", \"$P2_ID\", \"$P3_ID\"]}")
  local TABLE_ID=$(echo "$START_GAME_RESPONSE" | jq -r '.tableId')
  echo "Game created with Table ID: $TABLE_ID"
  
  # Action sequence
  echo "--- Action Sequence ---"
  echo "P1 checks."
  local R1=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"check\"}")
  
  echo "P2 bets 50."
  local R2=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"raise\", \"amount\": 50}")

  echo "P3 raises to 150."
  local R3=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P3_ID\", \"action\": \"raise\", \"amount\": 150}")

  echo "P1 folds."
  local R4=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P1_ID\", \"action\": \"fold\"}")

  # Check whose turn it is now (should be P2)
  local GAME_STATE=$(curl -s "$API_URL/game-state?tableId=$TABLE_ID")
  local TO_ACT=$(echo "$GAME_STATE" | jq -r '.toAct')
  
  if [ "$TO_ACT" == "$P2_ID" ]; then
    echo "✅ SUCCESS: It is correctly P2's turn to act."
  else
    echo "❌ FAILURE: Incorrect player to act. Expected P2, got $TO_ACT."
    exit 1
  fi

  echo "P2 calls."
  local R5=$(curl -s -X POST "$API_URL/bet" -H "Content-Type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"call\"}")

  # Check that the betting round is over and the flop was dealt
  local FINAL_GAME_STATE=$(curl -s "$API_URL/game-state?tableId=$TABLE_ID")
  local COMMUNITY_COUNT=$(echo "$FINAL_GAME_STATE" | jq -r '.community | length')

  if [ "$COMMUNITY_COUNT" -eq 3 ]; then
    echo "✅ SUCCESS: Betting round concluded and flop was dealt."
  else
    echo "❌ FAILURE: Flop not dealt. Community cards: $COMMUNITY_COUNT. State: $FINAL_GAME_STATE"
    exit 1
  fi

  echo "Complex scenario test passed. Manually cleaning up this game state."
  curl -s -X POST "$API_URL/bet" -H "Content-type: application/json" -d "{\"tableId\": \"$TABLE_ID\", \"playerId\": \"$P2_ID\", \"action\": \"fold\"}" > /dev/null
}


# --- Main Execution ---

# Run all test functions
test_fold_scenario
test_showdown_scenario
test_complex_betting_scenario

print_header "✅ ALL API TESTS PASSED SUCCESSFULLY!"

