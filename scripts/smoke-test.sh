#!/usr/bin/env bash
# scripts/smoke-test.sh
# End-to-end verification of PM Agent installation and basic functionality.
# Run against a freshly installed or built version.
set -euo pipefail

PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "=== PM Agent Smoke Test ==="
echo ""

# Determine PM binary path
PM_CMD="${PM_BIN:-node packages/cli/dist/index.js}"
MCP_CMD="${MCP_BIN:-node packages/mcp-server/dist/index.js}"

# Create a temporary test directory
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Override config/data paths to use temp dir
export PM_AGENT_CONFIG="$TEST_DIR/.pm-agent/config.toml"
export PM_AGENT_HOME="$TEST_DIR/.pm-agent"

# ── 1. CLI Help ──────────────────────────────────────────────────

echo "--- 1. CLI Help ---"
$PM_CMD --help 2>&1 | grep -q "PM Agent" && pass "pm --help shows PM Agent" || fail "pm --help missing PM Agent"
$PM_CMD --version 2>&1 | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+" && pass "pm --version shows semver" || fail "pm --version not semver"
$PM_CMD init --help 2>&1 | grep -q "init" && pass "pm init --help shows init command" || fail "pm init --help missing"

# ── 2. pm init ───────────────────────────────────────────────────

echo ""
echo "--- 2. pm init ---"
cd "$TEST_DIR"
mkdir -p test-project && cd test-project
git init 2>/dev/null || true

# Run init non-interactively
$PM_CMD init --name "smoke-test" --force --scan 2>&1 | tee "$TEST_DIR/init-output.txt"
grep -q "PM Agent initialized" "$TEST_DIR/init-output.txt" && pass "pm init completes" || fail "pm init did not complete"
test -f "$TEST_DIR/.pm-agent/config.toml" && pass "config.toml created" || fail "config.toml not created"
test -f "$TEST_DIR/.pm-agent/rules.toml" && pass "rules.toml created" || fail "rules.toml not created"

# ── 3. pm log ────────────────────────────────────────────────────

echo ""
echo "--- 3. pm log ---"
$PM_CMD log "Test decision for smoke test" --body "This is a smoke test decision body" --author "smoke-tester" 2>&1 | tee "$TEST_DIR/log-output.txt"
grep -q "ADR-001" "$TEST_DIR/log-output.txt" && pass "pm log creates ADR-001" || fail "pm log did not create ADR-001"
grep -q "Title:" "$TEST_DIR/log-output.txt" && pass "pm log shows title" || fail "pm log missing title"

# ── 4. pm note ───────────────────────────────────────────────────

echo ""
echo "--- 4. pm note ---"
$PM_CMD note "Smoke test note" --tag smoke-test --tag verification 2>&1 | tee "$TEST_DIR/note-output.txt"
grep -q "NOTE-001" "$TEST_DIR/note-output.txt" && pass "pm note creates NOTE-001" || fail "pm note did not create NOTE-001"
grep -q "Tags:" "$TEST_DIR/note-output.txt" && pass "pm note shows tags" || fail "pm note missing tags"

# ── 5. pm blockers ───────────────────────────────────────────────

echo ""
echo "--- 5. pm blockers ---"
$PM_CMD blockers 2>&1 | tee "$TEST_DIR/blockers-output.txt"
grep -q "No active blockers" "$TEST_DIR/blockers-output.txt" && pass "pm blockers shows no active blockers" || fail "pm blockers unexpected output"

# ── 6. pm scope ──────────────────────────────────────────────────

echo ""
echo "--- 6. pm scope ---"
$PM_CMD scope "Test feature" --committed 5 --remaining 3 2>&1 | tee "$TEST_DIR/scope-output.txt"
grep -q "Risk:" "$TEST_DIR/scope-output.txt" && pass "pm scope includes risk assessment" || fail "pm scope missing risk"
grep -q "Committed:" "$TEST_DIR/scope-output.txt" && pass "pm scope shows committed days" || fail "pm scope missing committed"
grep -q "MEDIUM" "$TEST_DIR/scope-output.txt" && pass "pm scope computes correct risk (MEDIUM)" || fail "pm scope wrong risk"

# ── 7. pm standup ────────────────────────────────────────────────

echo ""
echo "--- 7. pm standup ---"
$PM_CMD standup 2>&1 | tee "$TEST_DIR/standup-output.txt"
grep -q "Standup" "$TEST_DIR/standup-output.txt" && pass "pm standup shows standup header" || fail "pm standup missing header"
grep -q "Yesterday:" "$TEST_DIR/standup-output.txt" && pass "pm standup shows yesterday section" || fail "pm standup missing yesterday"
grep -q "Blockers:" "$TEST_DIR/standup-output.txt" && pass "pm standup shows blockers section" || fail "pm standup missing blockers"

# ── 8. pm status ─────────────────────────────────────────────────

echo ""
echo "--- 8. pm status ---"
$PM_CMD status 2>&1 | tee "$TEST_DIR/status-output.txt"
grep -q "smoke-test" "$TEST_DIR/status-output.txt" && pass "pm status shows project name" || fail "pm status missing project"
grep -q "Decisions:" "$TEST_DIR/status-output.txt" && pass "pm status shows decisions" || fail "pm status missing decisions"

# ── 9. pm rules ──────────────────────────────────────────────────

echo ""
echo "--- 9. pm rules ---"
$PM_CMD rules list 2>&1 | tee "$TEST_DIR/rules-output.txt"
grep -q "decision-before-close" "$TEST_DIR/rules-output.txt" && pass "pm rules list shows rules" || fail "pm rules list returns no rules"

# ── 10. MCP Server ───────────────────────────────────────────────

echo ""
echo "--- 10. MCP Server ---"
# Send tools/list request to MCP server via stdin/stdout with a 5s timeout
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5 $MCP_CMD 2>&1 | tee "$TEST_DIR/mcp-output.txt" || true
grep -q "pm_get_context" "$TEST_DIR/mcp-output.txt" && pass "MCP tools/list returns pm_get_context" || fail "MCP tools/list missing pm_get_context"

# ── 11. Edge Cases ───────────────────────────────────────────────

echo ""
echo "--- 11. Edge Cases ---"

# Missing config
PM_AGENT_CONFIG="/nonexistent/config.toml" $PM_CMD status 2>&1 && fail "pm status should fail with missing config" || pass "pm status fails gracefully with missing config"

# ── Summary ──────────────────────────────────────────────────────

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
