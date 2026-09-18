# Agent Host first-response measurements

Use [agent-host-first-response.mts](./agent-host-first-response.mts) to extract and compare local Agent Host debug exports. It does not launch VS Code, invoke a model, change settings, or send telemetry. Node.js from the repository development environment is sufficient; no extra packages are required.

The primary measurement is **renderer invocation to first nonempty root response text**, not physical submit-to-paint, provider TTFT, first tool output, or semantic answer completion. A response preamble counts as response text.

## Capture a controlled comparison

1. Build the same sources, including the same measurement instrumentation, for every arm. Keep SDK/CLI versions, concrete model, reasoning/context configuration, prompt, workspace, authentication readiness, and customization inventory constant.
2. Use an isolated test profile and a development plugin checkout. Do not edit an installed plugin cache or the user's normal profile.
3. Select the intended treatment before creating each test session. Existing materialized sessions can retain their configuration. For the Azure arm, use the same authoritative upstream plugin revision with the hook patch off/on; do not compare a newly built upstream plugin to an older installed distribution.
4. Set `chat.agentHost.agentDebugLog.enabled` to `true` before the first turn, and keep the log level identical across arms. Trace logging alone does **not** enable usage/customization sidecars. Export with **Developer: Export Agent Host Debug Logs...** after each measured turn. Check a calibration export for renderer timing, host timing, `usage.jsonl`, and `customizations.json` before spending the main run budget; missing files are missing observations, not zero usage.
5. Record the actual request turn ID and effective treatment. Do not identify a turn by the nearest timestamp or the currently active session.
6. Keep the editor and Agents Window separate, and distinguish:
   - `coldProcess`: first new session after a full application/Agent Host restart;
   - `warmProcessNewSession`: another new session in that process;
   - `existingSessionTurn`: a later turn in an existing session.
7. Interleave the four arms within matched blocks. Record process age, whether SDK startup completed before invocation, cache/token usage, model-call count, hook activity, title requests, auth state, and capture order alongside the exports. Restarting VS Code does not guarantee a cold provider cache.

| Arm | Hook fix | Deferred title strategy |
| --- | --- | --- |
| `control` | Off | Off |
| `hook` | On | Off |
| `title` | Off | On |
| `combined` | On | On |

For title treatment, set `chat.agentHost.experimental.deferredTitleGeneration` to `true` in the isolated profile before creating a session. It defaults to `false` and overrides `chat.agentHost.experimental.activeAgentTitleGeneration` for new sessions. Keep the latter setting identical across comparison arms. Strategy is session-scoped and persisted, so use fresh sessions rather than toggling an existing session in place.

Agree on a run/cost budget before invoking live models. Start with a small pilot to confirm configuration and export completeness, not to claim a statistically established benefit.

Preserve setup failures separately from submitted turns. Never repeat a submitted turn automatically or discard a slow result. If calibration exposes a configuration difference, declare the revised protocol before continuing and do not pool the differently configured calibration with the measured arms.

Verify the intended behavior as well as timing: inspect foreground naming-tool calls, hook outcomes/durations, and evidence that background title refinement completes after the foreground turn. Fewer foreground model rounds do not prove fewer total requests or lower cost; background utility calls and transport retries may be outside that count. A successful hook can take longer than a broken hook that previously failed early, so distinguish correctness improvements from latency improvements.

## Manifest

Create a local JSON manifest outside the source repository:

```json
{
  "schemaVersion": 1,
  "controls": {
    "commit": "<exact source revision plus a digest of shared uncommitted instrumentation>",
    "buildMode": "development",
    "sdkVersion": "1.0.14",
    "cliVersion": "1.0.84-9",
    "workspaceHash": "<workspace identity digest>",
    "promptHash": "<identical prompt digest>",
    "model": "<concrete model ID>",
    "reasoning": "medium",
    "contextSize": "272000",
    "inventoryHash": "<customization inventory digest, excluding only intentional treatments>"
  },
  "runs": [
    {
      "runId": "editor-cold-control-01",
      "block": "01",
      "arm": "control",
      "surface": "editor",
      "cohort": "coldProcess",
      "bundle": ".\\exports\\control-01",
      "turnId": "<actual request turn ID>"
    }
  ]
}
```

Paths are relative to the manifest. Control values are strings. Use digests rather than raw prompt text or sensitive paths. These controls are experimenter declarations; the script cannot prove that a model, profile, or plugin was actually configured as declared. Preserve the configuration evidence with the local captures.

Assign the same `block` to matched runs of all four arms within one surface/cohort. Each block has at most one run of each arm. Do not reuse a captured turn as another sample. Record cancellations and failures rather than removing them from the manifest.

On Windows:

```powershell
node scripts\agent-host-first-response.mts extract C:\temp\comparison\manifest.json > C:\temp\comparison\results.json
node scripts\agent-host-first-response.mts compare C:\temp\comparison\results.json > C:\temp\comparison\summary.json
```

`compare` also accepts multiple extracted result files with identical controls.

Current extraction reads the versioned `[AgentHostFirstResponse]` record from exported renderer logs, including rotated segments. It matches the exact `requestId`, validates `firstResponseTextMs`, `totalElapsedMs` and `hasResponseText`, and accepts identical duplicate log records but rejects contradictory ones. Existing-turn replay/resume and subagent invocations are excluded before duplicate detection. No wall-clock subtraction is used. Captured first/later-turn metadata must not contradict the declared cohort.

When available, the extractor also joins `[AgentHostTurnTiming]` records by the exact turn ID to report host-process age and root-turn ordinal. Missing host records produce an explicit `host: null`; they are not inferred from renderer timestamps. An ordinal alone does not prove a cold process or cold provider cache, so retain the controlled-restart procedure.

Version 2 `usage.jsonl` records are joined only by exact host/AHP turn IDs, with repeat updates deduplicated by SDK session plus API call ID (or event ID when absent). Extracted `usage.calls` retain available per-call token/cache and timing metadata, not content. These are **observed usage-bearing calls**, not every failed transport/retry attempt. Missing sidecars are labeled `missing`; legacy records and unattributed records are counted separately and never positionally assigned. Those two counts describe the whole exported sidecar, not ownership by the selected turn.

Missing records are explicit extraction errors, not fast or successful turns. Preserve those failed captures in the experiment ledger and investigate them rather than silently removing samples. A captured `notDispatched` outcome is retained separately from error/cancellation.

## Interpretation

- Surface and cohort groups remain separate.
- All outcomes and no-text counts are retained. Missing first text is `null`, never zero.
- First-text statistics include observed text even if the turn subsequently fails; inspect outcome counts alongside latency.
- Each treatment reports matched `treatment - control` differences. Negative values indicate lower observed latency.
- Unmatched blocks and pairs without text are counted explicitly, not imputed.
- No outlier trimming is applied. Report count, median, quartiles and full range. The script emits p95 only with at least 100 observations; even then, statistical uncertainty remains.
- Build/dependency/configuration-control differences, duplicate samples, invalid durations, and mixed historical/monotonic clocks fail explicitly.
- Do not add the hook-only and title-only effects and call that the combined benefit. Both can remove the same foreground hook opportunity.

Existing chat simulation statistics intentionally remove outliers and its launch utilities have Unix-specific dependencies. This utility keeps all observations and works on Windows without importing that runner.

The script's JSON output excludes raw prompts, responses, tool arguments, and bundle paths. Input exports remain sensitive and should stay local. Individual log files larger than 64 MiB fail explicitly rather than being partially processed.

## Historical exports

For an old capture without the monotonic timing record, use the explicit diagnostic-only command:

```powershell
node scripts\agent-host-first-response.mts extract-historical C:\temp\comparison\historical-manifest.json
```

Each historical run additionally requires:

```json
{
  "chatChannel": "<exact root AHP chat channel>",
  "rendererResource": "<exact resource from the renderer invocation log>",
  "utcOffset": "-07:00"
}
```

The extractor requires exactly one matching renderer invocation and follows only live server actions for the specified channel and turn. It ignores snapshots, tools, reasoning, whitespace and other chats. An empty markdown part followed by a nonempty delta is supported. Cancellation/error/no-text outcomes remain explicit.

These durations subtract recorded wall-clock timestamps with the supplied local offset; they are labeled `historicalWallClock`. They are never silently used as a fallback, and `compare` rejects them. An ambiguous invocation, malformed input, or truncated matching action is an error. Historical extraction validates old observations, not performance of the current source.

## Tests

```powershell
node --test scripts\agent-host-first-response.test.mts
```

Tests use synthetic local fixtures and remove them afterward. They do not execute production hook scripts or issue network/model requests.
