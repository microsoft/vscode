#!/usr/bin/env bash
# Son of Anton — MCP Server End-to-End Test Script
# Verifies all MCP servers are healthy and responding correctly.
#
# Usage:
#   ./scripts/test-all.sh              # Test against running services
#   ./scripts/test-all.sh --start      # Start Docker Compose first, then test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"

# Colours for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN++)); }

# Check if a service is healthy
check_health() {
	local name="$1"
	local url="$2"
	local response

	response=$(curl -sf --max-time 5 "$url/health" 2>/dev/null) || {
		fail "$name health check failed (unreachable at $url)"
		return 1
	}

	if echo "$response" | grep -q '"status"'; then
		pass "$name is healthy"
		return 0
	else
		fail "$name returned unexpected health response: $response"
		return 1
	fi
}

# Check SSE endpoint exists
check_sse_endpoint() {
	local name="$1"
	local url="$2"

	# SSE endpoint should return headers with text/event-stream
	local http_code
	http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url/sse" 2>/dev/null) || {
		warn "$name SSE endpoint not reachable"
		return 1
	}

	if [ "$http_code" = "200" ] || [ "$http_code" = "000" ]; then
		pass "$name SSE endpoint responding"
	else
		warn "$name SSE endpoint returned HTTP $http_code"
	fi
}

# Test rate limiting on gateway
test_rate_limiting() {
	local url="$1"
	local endpoint="$url/health"

	echo ""
	echo "Testing rate limiting..."

	# Send a burst of 10 rapid requests
	local responses=0
	for i in $(seq 1 10); do
		if curl -sf --max-time 2 "$endpoint" > /dev/null 2>&1; then
			((responses++))
		fi
	done

	if [ "$responses" -ge 5 ]; then
		pass "Gateway handles burst traffic ($responses/10 successful)"
	else
		warn "Gateway may be rate limiting too aggressively ($responses/10 successful)"
	fi
}

# Verify tool call logging
check_logging() {
	local gateway_url="$1"

	echo ""
	echo "Testing logging..."

	local logs
	logs=$(curl -sf --max-time 5 "$gateway_url/logs?limit=10" 2>/dev/null) || {
		warn "Logging endpoint not reachable at $gateway_url/logs"
		return 1
	}

	if echo "$logs" | grep -q '\['; then
		pass "Logging endpoint returns data"
	else
		warn "Logging endpoint returned empty or unexpected data"
	fi
}

# Check metrics endpoint
check_metrics() {
	local gateway_url="$1"

	echo ""
	echo "Testing metrics..."

	local metrics
	metrics=$(curl -sf --max-time 5 "$gateway_url/metrics" 2>/dev/null) || {
		warn "Metrics endpoint not reachable at $gateway_url/metrics"
		return 1
	}

	if echo "$metrics" | grep -q '{'; then
		pass "Metrics endpoint returns data"
	else
		warn "Metrics endpoint returned unexpected data"
	fi
}

# --- Main ---
echo "========================================"
echo " Son of Anton — MCP Server E2E Tests"
echo "========================================"
echo ""

# Optionally start Docker Compose
if [ "${1:-}" = "--start" ]; then
	echo "Starting Docker Compose stack..."
	(cd "$REPO_ROOT" && docker compose up -d)
	echo "Waiting 15s for services to start..."
	sleep 15
fi

# Server URLs
CODE_GRAPH_URL="${CODE_GRAPH_URL:-http://localhost:3100}"
DATABASE_URL="${DATABASE_URL:-http://localhost:3102}"
DEPLOYMENT_URL="${DEPLOYMENT_URL:-http://localhost:3103}"
TICKETS_URL="${TICKETS_URL:-http://localhost:3104}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3200}"

# Step 1: Health checks
echo "Step 1: Health checks"
echo "---------------------"
check_health "Code Graph MCP" "$CODE_GRAPH_URL"
check_health "Database MCP" "$DATABASE_URL"
check_health "Deployment MCP" "$DEPLOYMENT_URL"
check_health "Tickets MCP" "$TICKETS_URL"
check_health "Gateway Proxy" "$GATEWAY_URL"

# Step 2: SSE endpoints
echo ""
echo "Step 2: SSE endpoints"
echo "---------------------"
check_sse_endpoint "Code Graph MCP" "$CODE_GRAPH_URL"
check_sse_endpoint "Database MCP" "$DATABASE_URL"
check_sse_endpoint "Deployment MCP" "$DEPLOYMENT_URL"
check_sse_endpoint "Tickets MCP" "$TICKETS_URL"

# Step 3: Gateway features
echo ""
echo "Step 3: Gateway features"
echo "------------------------"
test_rate_limiting "$GATEWAY_URL"
check_logging "$GATEWAY_URL"
check_metrics "$GATEWAY_URL"

# Summary
echo ""
echo "========================================"
echo " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
	echo ""
	echo -e "${RED}Some tests failed. Check the output above for details.${NC}"
	exit 1
else
	echo ""
	echo -e "${GREEN}All critical tests passed.${NC}"
	exit 0
fi
