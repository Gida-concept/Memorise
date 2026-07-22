#!/usr/bin/env bash
# scripts/verify-package.sh
# Run before publishing to verify all packages build and work correctly.
# Designed to work in both CI and local development environments.
set -uo pipefail

echo "=== PM Agent Package Verification ==="
echo ""

PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

# ── Helper: is this CI? (GitHub Actions, Circle, etc.) ─────────────
is_ci() {
  [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]
}

# ── 1. Fresh install from lockfile ─────────────────────────────────
echo "--- 1. Dependency Install ---"
if is_ci; then
  # CI: strict — npm ci must succeed
  npm ci 2>&1 | tail -3 && pass "npm ci succeeds" || fail "npm ci failed"
else
  # Local dev: skip npm ci to preserve existing node_modules,
  # but verify deps are present
  if [ -d "node_modules" ] && [ -d "node_modules/typescript" ]; then
    pass "node_modules present (skipping npm ci for local dev)"
  else
    echo "  Installing dependencies..."
    npm install 2>&1 | tail -3 && pass "npm install succeeds" || fail "npm install failed"
  fi
fi

# ── 2. Type check ──────────────────────────────────────────────────
echo ""
echo "--- 2. Type Check ---"
npm run typecheck 2>&1 && pass "TypeScript type check passes" || fail "TypeScript type check failed"

# ── 3. Build all packages ──────────────────────────────────────────
echo ""
echo "--- 3. Build ---"
npm run build 2>&1 && pass "Build succeeds" || fail "Build failed"

# ── 4. Run all tests ────────────────────────────────────────────────
echo ""
echo "--- 4. Tests ---"
npm test 2>&1 && pass "All tests pass" || fail "Tests failed"

# ── 5. Lint ─────────────────────────────────────────────────────────
echo ""
echo "--- 5. Lint ---"
npm run lint 2>&1 && pass "Lint passes" || fail "Lint failed"

# ── 6. Verify package contents ──────────────────────────────────────
echo ""
echo "--- 6. Package Contents ---"
PKGS=("packages/core" "packages/cli" "packages/mcp-server")
ALL_CONTENTS_OK=true
for pkg in "${PKGS[@]}"; do
  echo "   Checking $pkg..."

  if [ ! -f "$pkg/dist/index.js" ]; then
    echo "   MISSING: $pkg/dist/index.js"; ALL_CONTENTS_OK=false
  fi

  # Accept .mjs or .cjs (ESM can be .js too — just check for some output)
  if [ ! -f "$pkg/dist/index.mjs" ] && [ ! -f "$pkg/dist/index.cjs" ]; then
    # core outputs .cjs + .js; cli/mcp output .cjs + .js
    if [ ! -f "$pkg/dist/index.cjs" ]; then
      echo "   MISSING: $pkg/dist/index.cjs"; ALL_CONTENTS_OK=false
    fi
  fi

  if [ ! -f "$pkg/dist/index.d.ts" ] && [ ! -f "$pkg/dist/index.d.cts" ]; then
    echo "   MISSING: $pkg/dist/index.d.ts or .d.cts"; ALL_CONTENTS_OK=false
  fi
done

if [ "$ALL_CONTENTS_OK" = true ]; then
  pass "All packages have dist/ with required files"
else
  fail "Some packages are missing dist/ files"
fi

# ── 7. Package manifest checks ──────────────────────────────────────
echo ""
echo "--- 7. Package Manifests ---"
ALL_MANIFESTS=true
for pkg in "${PKGS[@]}"; do
  NAME=$(node -e "console.log(require('./$pkg/package.json').name || 'MISSING')" 2>/dev/null)
  BIN_COUNT=$(node -e "const p=require('./$pkg/package.json'); console.log(p.bin ? Object.keys(p.bin).length : 0)" 2>/dev/null)

  if [ "$NAME" = "MISSING" ] || [ -z "$NAME" ]; then
    echo "   MISSING name in $pkg/package.json"; ALL_MANIFESTS=false
  else
    echo "   $pkg → $NAME"
  fi

  if [ "$BIN_COUNT" -gt 0 ]; then
    echo "   $pkg → $BIN_COUNT binary entry point(s)"
  fi

  # Verify publishConfig.access is "public"
  PUB_ACCESS=$(node -e "const p=require('./$pkg/package.json'); console.log(p.publishConfig?.access || 'none')" 2>/dev/null)
  if [ "$PUB_ACCESS" != "public" ]; then
    echo "   MISSING publishConfig.access in $pkg/package.json"; ALL_MANIFESTS=false
  fi
done

if [ "$ALL_MANIFESTS" = true ]; then
  pass "All package manifests valid"
else
  fail "Some package manifests are invalid"
fi

# ── 8. Dry-run pack ─────────────────────────────────────────────────
echo ""
echo "--- 8. Dry-Run Pack ---"
ALL_DRY=true
for pkg in "${PKGs[@]}"; do
  if (cd "$pkg" && npm pack --dry-run > /dev/null 2>&1); then
    echo "   $pkg: pack dry-run OK"
  else
    echo "   FAILED: $pkg dry-run"
    ALL_DRY=false
  fi
done

if [ "$ALL_DRY" = true ]; then
  pass "All packages pass npm pack --dry-run"
else
  fail "Some packages failed dry-run pack"
fi

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
