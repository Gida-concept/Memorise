# PM Agent Release Checklist

> Steps to follow when publishing a new version of PM Agent.

---

## Pre-release

- [ ] All tests pass: `npm test`
- [ ] All lint checks pass: `npm run lint`
- [ ] Type check passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] CHANGELOG generated (semantic-release handles this from conventional commits)
- [ ] Package contents verified: `./scripts/verify-package.sh`
- [ ] Smoke test passes: `./scripts/smoke-test.sh`
- [ ] npm login works and token has publish permissions
- [ ] Dry-run publish succeeds for all packages: `npm pack --dry-run` for each
- [ ] All commits since last release follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] Root `package.json` version bumped (semantic-release does this, but verify)
- [ ] Breaking changes documented (if any)

## Release

- [ ] Push to `main` → semantic-release triggered via GitHub Actions
- [ ] Monitor the Release workflow: https://github.com/owner/pm-agent/actions
- [ ] GitHub Release created with release notes
- [ ] npm packages published:
  - `@pm-agent/core`
  - `@pm-agent/cli` (provides `pm` binary)
  - `@pm-agent/mcp-server` (provides `pm-mcp` binary)
- [ ] Release tag signed and pushed
- [ ] npm provenance attestation present (check on npmjs.com)

## Post-release

- [ ] Verify global install: `npm install -g pm-agent`
- [ ] Verify CLI version: `pm --version` shows new version
- [ ] Verify `pm init` works in a test directory
- [ ] Verify MCP server starts: `npx pm-mcp` (should start and wait for stdin)
- [ ] Verify `pm log`, `pm note`, `pm blockers`, `pm standup`, `pm status` all functional
- [ ] Run full smoke test: `./scripts/smoke-test.sh`
- [ ] Update ROADMAP.md if any items were completed in this release
- [ ] Announce release (Slack, Discord, etc.)

## Rollback (if needed)

- [ ] `npm unpublish @pm-agent/core@<version>` (within 72h)
- [ ] `npm unpublish @pm-agent/cli@<version>`
- [ ] `npm unpublish @pm-agent/mcp-server@<version>`
- [ ] Revert the triggering commit on `main`
- [ ] Delete the GitHub Release and tag
- [ ] Fix the root cause and re-release

---

## npm Token Setup

1. Generate a token on [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens)
2. Set the token as a repository secret:
   ```
   gh secret set NPM_TOKEN
   ```
3. The `GITHUB_TOKEN` secret is auto-provided by GitHub Actions
4. Verify provenance: requires `id-token: write` permission (already in `release.yml`)

## Conventional Commits Reference

| Prefix          | Release Type |
| --------------- | ------------ |
| `fix:`          | Patch        |
| `feat:`         | Minor        |
| `feat!:`        | Major        |
| `fix!:`         | Major        |
| `chore:`        | No release   |
| `docs:`         | No release   |
| `refactor:`     | No release   |
| `test:`         | No release   |
| `ci:`           | No release   |
