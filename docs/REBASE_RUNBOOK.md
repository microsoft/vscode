# Fork maintenance runbook — stokd-ide

`stokd-ide` is a **thin patch** on upstream VS Code (`microsoft/vscode`). The whole
strategy exists to make rebasing onto new VS Code releases a routine, low-effort
operation. The governing contract is **AX-TERMINAL-AGENT-TABS**.

See also: [`../SEAM_MANIFEST.md`](../SEAM_MANIFEST.md) (every upstream line we touch)
and the source plan `agent-terminal-selector-implementation-plan.md`.

---

## Branch model

| Branch | Role | Contents |
|---|---|---|
| `main` | **mirror** of upstream | Tracks `microsoft/vscode`. No stokd commits ever land here directly. Fast-forward only. |
| `feat/agent-terminal-selector` | **patch stack** | An ordered series of commits on top of a pinned upstream **release tag**: one "seam" commit (`terminalView.ts`) + new-file commits under `terminal/browser/agentTabs/`. |

**Why track release tags, not `main`:** `main` changes daily and the terminal UI
files churn within it. Pinning to a stable release tag (e.g. `1.124.2`) trades a
few weeks of latency for far fewer, more meaningful rebases.

---

## Remotes

```bash
# origin   -> git@github.com:stokd-cloud/stokd-ide.git   (this fork)
# upstream -> https://github.com/microsoft/vscode.git     (the source)
scripts/sync-upstream.sh        # adds upstream if missing, fetches, reports next steps
```

Because the fork shares object SHAs with upstream, fetching `upstream` only
downloads the new objects since the fork's base — it is fast.

---

## Routine: pull in the latest upstream

```bash
# 1. Update the mirror (non-destructive fast-forward; aborts if histories diverged)
scripts/sync-upstream.sh --ff-main
git push origin main

# 2. Find the new release tag to pin to
TAG=$(scripts/sync-upstream.sh --print-tag)   # e.g. 1.125.0

# 3. Replay the patch stack onto the new tag
git checkout feat/agent-terminal-selector
git rebase --onto "$TAG" "$(git merge-base feat/agent-terminal-selector main)" feat/agent-terminal-selector
```

**Only the seam commit can conflict.** Every other commit only *adds* files under
`agentTabs/`, and upstream has no opinion about files it has never seen, so they
replay cleanly. If the seam commit conflicts, open `terminalView.ts`, re-apply the
three changes listed in `SEAM_MANIFEST.md`, and continue.

---

## Routine: verify after a rebase

```bash
scripts/verify-seam.sh        # flag defaults off + flag-off path uses the stock view
node --import tsx --test \
  src/vs/workbench/contrib/terminal/browser/agentTabs/test/agentTerminalSelectorModel.test.ts
# Heavy, optional, do in CI: npm ci && npm run compile
```

The **real** failure mode of this fork is not file churn (we don't import the
churning files) but **interface drift** in the upstream services we consume
(`ITerminalGroupService`, `ITerminalChatService`). That surfaces as a *compile
error*, which CI on tags catches loudly — not as a silent merge conflict.

---

## Downstream integration (stokd-mono)

`stokd-cloud/stokd-mono` consumes this fork as the IDE that ships the agent-aware
terminal. To drive terminal control downstream:

1. Build/distribute `stokd-ide` from the `feat/agent-terminal-selector` branch (or
   once cut over, from `main` with the patch merged).
2. Turn the feature on per-profile / per-build with the setting
   `"terminal.integrated.agentTabs.enabled": true`.
3. The agent rows the selector renders come straight from `ITerminalChatService`
   tool-session terminals, so stokd-mono's chat/agent tooling needs no extra
   plumbing — it already registers those terminals with VS Code.

When the patch is dogfood-stable (passes the Inventory §6 checklist + Phase 4),
flip the default on for the stokd distribution and consider upstreaming a
pluggable-view contribution so the seam edit count drops to zero.

---

## The one hard rule

> **Anything that can be a new file _is_ a new file.** A change that edits an
> upstream file outside the sanctioned seam list (`SEAM_MANIFEST.md`) does not
> merge.

This single rule is what keeps the conflict surface flat over time.
