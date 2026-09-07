---
name: agent-host-logs
description: 'Analyze Agent Host debug log exports. Use when given an ah-logs or ahp-logs zip/folder, an Export Agent Host Debug Logs bundle, events.jsonl, AHP JSONL transport logs, Agent Host.log, remote-agenthost.log, or copilot-logs.'
---

# Agent Host Debug Logs

Use this skill to orient to bundles produced by `Developer: Export Agent Host Debug Logs...`. These are different from the normal timestamped Code OSS log directory.

Treat the bundle as sensitive: it can contain tokens, prompts, file contents, terminal output, paths, and settings. Keep analysis local and avoid quoting secrets or unrelated user content. Timestamps, event names, IDs, status values, and general property values are fine.

## Open the Bundle

The export name usually starts with `ah-logs` and may be a zip or an already-unpacked folder. For a zip, use the bundled extractor:

```bash
python3 .github/skills/agent-host-logs/scripts/extract.py "<archive>.zip"
```

The final line gives the temporary extraction path. Work from that folder and delete only that exact folder when finished.

Files are collected best-effort, so a valid bundle may contain only some of these:

```text
events.jsonl
usage.jsonl
customizations.json
agenthost.log
agenthost.1.log
agenthost-server.log
vscode-logs/Window/renderer.log
vscode-logs/Window/renderer.1.log
vscode-logs/Shared/sharedprocess.log
ahp/*.jsonl
copilot-logs/*.log
remote-agenthost.log
```

## What the Files Mean

The basic flow is:

```text
Window/client <-> AHP <-> Agent Host process <-> Copilot SDK
```

| Path | What it shows |
|---|---|
| `events.jsonl` | Persisted Copilot SDK events for the selected session: turns, messages, tools, permissions, hooks, skills, and subagents. It can cover a much longer period than the other logs. |
| `usage.jsonl` | Client-captured token/credit usage, one record per model call (`turnId`, model, input/output/cache tokens, cumulative `totalNanoAiu`). The SDK's `assistant.usage` event is ephemeral and never reaches `events.jsonl`, so this is the only per-call usage record. Present only when agent-host debug logging was on. |
| `customizations.json` | Snapshot of the skills/hooks/agents/MCP servers loaded for the session. The SDK's `session.*_loaded` events are ephemeral, so this is the only record of what was actually active. Present only when agent-host debug logging was on. |
| `ahp/*.jsonl` | AHP traffic for a client connection. `_ahpLog.dir` is `c2s` or `s2c`; `_ahpLog.ts` is the wire timestamp. Use this to see requests, responses, subscriptions, actions, notifications, and client-visible ordering. |
| `agenthost*.log` | Local or server Agent Host process behavior: startup, auth, sessions, provider events, tools, Git/worktrees, and host-side errors. Numbered files are older rotated segments. |
| `copilot-logs/*.log` | Copilot SDK process logs that mention the selected session ID. A process log may contain other sessions too. |
| `vscode-logs/Window/*` | Current and rotated files from the Window log group, including renderer/client behavior, network activity, views, and other window-owned logs. |
| `vscode-logs/Shared/*` | Current and rotated files from the Shared log group. Usually secondary evidence and often noisy. |
| `Agent Host (<name>).log` | Forwarded logs from a named remote Agent Host. |
| `remote-agenthost.log` | A directly downloaded remote `agenthost.log`, when available. |

## How to Start

1. List the files and note their sizes.
2. Identify the reported symptom, approximate time, local or remote host, and any known session, chat, turn, request, or tool ID.
3. Start with the file closest to the symptom:
   - Turn or provider behavior: `events.jsonl`
   - Token/credit usage or cost questions: `usage.jsonl`
   - Client/server state or ordering: `ahp/*.jsonl`
   - Host implementation failure: `agenthost*.log`
   - SDK behavior: `copilot-logs/*.log`
   - UI behavior: `vscode-logs/Window/renderer.log` and its rotated segments
4. Search by the known time or ID, then follow the same operation into the adjacent layer.

Useful correlation fields include the raw session ID, session/chat URI, `turnId`, `interactionId`, tool/request IDs, JSON-RPC request `id`, AHP `serverSeq`, and event `id`/`parentId`.

## Important Tips

- `events.jsonl`, Copilot SDK logs, and AHP timestamps are normally UTC. The plain `.log` files may use local machine time; remote logs may use another timezone.
- An AHP log is connection-scoped and can contain multiple sessions. A Copilot SDK process log can also contain multiple sessions.
- AHP files rotate as `.jsonl`, `.1.jsonl`, `.2.jsonl`, and so on. Use `_ahpLog.ts` to reconstruct order.
- A `subscribe` result can contain a full snapshot; its contents did not necessarily change at subscription time.
- `_ahpLog.truncated: true` means large values were omitted from that log record.
- Warning or error severity alone does not prove causality. Look for the matching failed response, missing completion, or user-visible consequence.
- Missing files are normal because export collection is best-effort.
