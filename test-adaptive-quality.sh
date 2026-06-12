#!/bin/bash
# PairPair Adaptive Quality Test Script
# このスクリプトはホスト・ゲスト・サーバーを自動起動し、テスト結果を記録します。

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEST_LOG="${TEST_RESULTS_DIR}/test-${TIMESTAMP}.log"

echo "PairPair Adaptive Quality Test Suite"
echo "====================================="
echo "Test started at $(date)"
echo ""

# Create results directory
mkdir -p "${TEST_RESULTS_DIR}"

# Function to start a service in background
start_service() {
    local name=$1
    local cmd=$2
    echo "[$(date +'%H:%M:%S')] Starting ${name}..."
    eval "${cmd}" > "${TEST_RESULTS_DIR}/${name}-${TIMESTAMP}.log" 2>&1 &
    local pid=$!
    echo "[$(date +'%H:%M:%S')] ${name} started (PID: ${pid})"
    echo "${pid}" > "${TEST_RESULTS_DIR}/${name}.pid"
}

# Start services
start_service "signaling-server" "cd ${PROJECT_ROOT}/apps/signaling-server && npx pnpm@9 dev"
sleep 3

start_service "host" "cd ${PROJECT_ROOT}/apps/desktop && npx pnpm@9 dev"
sleep 5

start_service "guest" "cd ${PROJECT_ROOT}/apps/desktop && npx pnpm@9 dev"
sleep 3

echo ""
echo "====================================="
echo "Services started. Test framework ready."
echo ""
echo "Next steps (manual):"
echo "  1. Open Host window (first desktop app)"
echo "  2. Click 'ホストとして開始' (Start as Host)"
echo "  3. Select screen to share"
echo "  4. Click '適応モード (PairPro)' tab"
echo "  5. Click 'セッションを作成' (Create Session)"
echo "  6. Note the 6-digit code"
echo "  7. Switch to Guest window (second desktop app)"
echo "  8. Click 'コードで接続' (Connect with Code)"
echo "  9. Enter the code"
echo " 10. Wait for P2P connection"
echo " 11. Open DevTools (F12) on Guest window"
echo " 12. Go to Console tab"
echo " 13. Run each test scene (see TEST_ADAPTIVE_QUALITY.md)"
echo ""
echo "Metrics will be automatically logged to console as:"
echo "  [QualityMetrics] ... | FD:X DR:Y BR:Z.XXMbps"
echo "  [SharpnessAnalysis] ... | Sharpness: XX.X/100"
echo ""
echo "To stop all services, run:"
echo "  pkill -f 'pnpm.*dev' || true"
echo ""
echo "Test results logged to: ${TEST_RESULTS_DIR}/"
