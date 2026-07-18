# Claude Agent Host — live E2E smoke tests

Assertion-driven **live** smoke tests for the Claude agent host session lifecycle. Unlike the
node unit suites under `src/vs/platform/agentHost/test/node/` (which drive the code with an SDK
_fake_), these launch a **real, authenticated Agents window** and a **real Claude SDK subprocess**,
then assert on ground truth pulled from `agenthost.log` and `ps`.

They exist to catch regressions in the **C9 immutable-pipeline / session-orchestrated-rebuild**
work ([PR #326270](https://github.com/microsoft/vscode/pull/326270)) that a fake can't fully
prove — most importantly that the OS subprocess is actually **reaped** and that rapid
abort→rebuild churn never leaks a process or hits a `<id>.jsonl` two-writer conflict.

## Why this isn't a normal test yet

These need **authentication** (a signed-in Copilot/Claude profile) and a **GUI window driven over
CDP**, so there is no clean CI slot for them today. For now they're a script you run by hand
before/after touching the agent-host session lifecycle. The assertions are structured so this can
graduate into a real gated smoke suite once we have an authenticated headless runner.

## Requirements

- An authenticated `~/.vscode-oss-dev` profile (sign in to Copilot once in a dev build).
- Full product build (`npm run compile` or a running watch) — the launcher builds if missing.
- `@playwright/cli` (already a devDependency), `jq`, and macOS/Linux.
- The **launch skill** at `.claude/skills/launch/scripts/launch.sh` (override with
  `$CLAUDE_LAUNCH_SH` or `--launch`). It clones the authed profile into a throwaway dir and prints
  the CDP port.

## Usage

```bash
# launch a throwaway authed window, run all scenarios, tear it down:
test/agent-host-e2e/claude-agenthost-smoke.sh

# more churn cycles + verbose per-phase counters:
test/agent-host-e2e/claude-agenthost-smoke.sh --cycles 6 -v

# drive an already-open window instead of launching one:
SMOKE_RUN=/tmp/code-oss-dev/<run-dir> \
  test/agent-host-e2e/claude-agenthost-smoke.sh --cdp 59123 --keep
```

Exit code is the number of failed assertions (`0` = all green). The tail prints
`=== summary: N passed, M failed ===`.

## Scenarios & invariants

| # | Scenario | Key assertions (ground truth) |
|---|----------|-------------------------------|
| 1 | **materialize** | first turn ⇒ exactly **one** `startup isResume=false`, ≥1 `result`, exactly **1** SDK subprocess |
| 2 | **multi-turn reuse** | 2 more turns ⇒ startup count **unchanged**, subprocess **PID unchanged** (warm reuse) |
| 3 | **recover-rebuild** | abort → next send ⇒ **+1** startup, that startup is `isResume=true`, back to 1 subprocess, session usable |
| 4 | **abort-churn × N** | every cycle: subprocess count **≤ 1** in-flight and post-abort; overall **peak ≤ 1**, **0** `<id>.jsonl`/spawn-conflict/leak errors, session usable afterward (recover-rebuilds exercised are reported informationally — the deterministic proof lives in scenario 3) |

## How it stays reliable

The workbench composer churns element refs on every render and reveals some actions only on real
hover, which makes snapshot-ref automation flaky. This harness sidesteps that:

- **Send / Cancel are clicked via in-page `eval`** (find the button by accessible name + enabled
  state, `.click()` it) rather than by snapshot ref.
- **Truth comes from `agenthost.log` + `ps`**, never from asserting on UI state.
- Sends **verify-and-retry** (paste, nudge, re-check that Send enabled); aborts **retry until a
  cancel is actually logged** (or the turn is detected to have completed first).
- Turns are held open with a long, tool-free enumeration prompt so there's a wide abort window.

## Known soft spots

- If the model finishes a "held-open" turn before the abort lands, that cycle becomes a normal
  completion (the harness detects it and retries once); the orphan/conflict invariants still hold.
- Model/agent/customization **pickers** (hover- or flyout-gated) are intentionally **not** driven
  here — those rebuild triggers are covered deterministically by the node suite
  (`claudeAgent.test.ts`: `changeAgent … triggers a rebind`, `dirty customizations triggers a
  rebind`, and the C9 abort/rebuild-race edge tests).
