---
name: chronicle
description: Analyze Copilot session history for standup reports, usage tips, and session reindexing. Use when the user asks for a standup, daily summary, usage tips, workflow recommendations, wants to reindex their session store, or asks about deleting session data.
---

# Chronicle

Analyze the user's Copilot session history using the `copilot_sessionStoreSql` tool. This skill handles standup reports, usage analysis, and session store maintenance.

Sessions may be stored locally (SQLite) and optionally synced to the cloud for cross-device access. Cloud sync is controlled by the `chat.sessionSync.enabled` setting.

**Prerequisite:** Chronicle requires the `github.copilot.chat.localIndex.enabled` setting to be `true`. If the `copilot_sessionStoreSql` tool is not available, tell the user to enable this setting in VS Code Settings.

## Available Tool Actions

The `copilot_sessionStoreSql` tool supports three actions:

| Action | Purpose | `query` param |
|--------|---------|---------------|
| `standup` | Pre-fetch last 24h sessions, turns, files, refs | Not needed |
| `query` | Execute a read-only SQL query | Required |
| `reindex` | Rebuild local session index + cloud sync | Not needed |

## Workflows

### Standup

When the user asks for a standup, daily summary, or "what did I do":

1. Call `copilot_sessionStoreSql` with `action: "standup"` and `description: "Generate standup"`.
2. The tool returns pre-fetched session data (sessions, turns, files, refs from the last 24 hours).
3. For any PR references in the data, check their current status (open, merged, draft) if possible.
4. Format the returned data as a standup report grouped by work stream (branch/feature):

```
Standup for <date>:

**✅ Done**

**Feature name** (`branch-name` branch, `repo-name`)
  - 3-7 words describing the status
  - Key files: 2-3 most important files changed
  - Merged: [#123](link)
  - Session: `session-id`

**🚧 In Progress**

**Feature name** (`branch-name` branch, `repo-name`)
  - 3-7 words describing the current state of work
  - Key files: 2-3 most important files being worked on
  - Draft: [#789](link)
  - Session: `session-id`
```

Rules:
- Keep it concise and succinct — the user can always ask follow-up questions
- Use turn data (user messages AND assistant responses) to understand WHAT was done
- Use file paths to identify which components/areas were affected
- Group related sessions on the same branch into one entry
- For sessions, only show the most recent session per feature/branch
- Link PRs and issues using markdown link syntax
- Classify as Done if work appears complete, In Progress otherwise

### Tips

When the user asks for tips, workflow recommendations, or how to improve:

**Step 1: Investigate how the user works**

Use `copilot_sessionStoreSql` with `action: "query"` to explore their recent sessions. The goal is to understand their patterns — how they prompt, what tools they use, and where they spend time.

Queries to run (do not explain what you will do first — start querying immediately):
- Sessions from the last 7 days: counts, durations, repositories
- Turn data: read actual user messages to understand prompting patterns
- session_files: which files and tools are used most frequently
- session_refs: PR/issue/commit activity patterns

**Step 2: Consider available features**

If the current workspace has a `.github/` folder, check for `.github/copilot-instructions.md`, `.github/skills/`, and `.github/agents/` to see what custom configuration exists. Do NOT look outside the workspace. Look for gaps between what's available and what the user actually uses.

**Step 3: Provide tips**

Based on what you learned, provide 3-5 specific, actionable tips. Each tip should:
- Be grounded in actual usage data — reference specific patterns you observed
- Be non-obvious — skip basic features that any regular user would already know
- Focus on gaps where a feature, workflow change, or different approach would meaningfully improve their experience

Analysis dimensions to explore:
- **Prompting patterns**: Are user messages vague or specific? Do they provide context? Do they correct or redirect the agent frequently?
- **Tool usage**: Which tools are used most? Are there underutilized tools that could help?
- **Session patterns**: How long are sessions? Are there many short abandoned sessions?
- **File patterns**: Which areas of the codebase get the most attention? Any repeated edits to the same files?
- **Workflow**: Is the user leveraging agent mode, custom instructions, prompt files, skills?

If the session store has little data, acknowledge that and suggest features to try based on what configuration you found in the workspace.

### Reindex

When the user asks to reindex, rebuild, or refresh their session store:

1. Call `copilot_sessionStoreSql` with `action: "reindex"` and `description: "Reindex sessions"`.
2. The tool rebuilds the local session store from debug logs and, if cloud sync is enabled, uploads new sessions to the cloud.
3. Present the before/after stats and cloud sync results to the user.

If the user says "force reindex" or wants to re-process already-indexed sessions, add `force: true` to the call. By default, already-indexed sessions are skipped for speed.

### Delete Sessions

When the user asks to delete session data or clear their history:

- Guide them to run the **Delete Session Sync Data** command from the Command Palette (`github.copilot.sessionSync.deleteSessions`).
- This command lets them choose which sessions to delete from both local storage and the cloud.
- The tool itself does NOT support deletion — this is intentional to prevent accidental data loss.

## Query Guidelines

When using `action: "query"`:
- Only one query per call — do not combine multiple statements with semicolons
- Always use LIMIT (max 100) and prefer aggregations (COUNT, GROUP BY) over raw row dumps
- Query the **turns** table for conversation content — it gives the richest insight into what happened
- Query **session_files** for file paths and tool usage patterns
- Query **session_refs** for PR/issue/commit links
- Join tables using session_id for complete analysis
- Always filter on **updated_at** (not created_at) for time ranges
- Always JOIN sessions with turns to get session content — do not rely on sessions.summary alone

### Query routing

The tool automatically routes queries based on the user's cloud sync settings:
- **Cloud enabled**: Queries go to the cloud DuckDB backend which contains ALL sessions across devices and agents (VS Code, CLI, Copilot Coding Agent, PR reviews). The tool description will show DuckDB SQL syntax — follow it.
- **Cloud disabled**: Queries go to local SQLite which only contains sessions from this device. The tool description will show SQLite syntax.

The tool's description dynamically changes based on the active backend. **Always follow the SQL syntax shown in the tool description** — it matches the active backend.

## Database Schema

### Tables (both local and cloud unless noted)

- **sessions**: id, cwd (workspace folder path — always NULL in cloud), repository, branch, host_type, summary, agent_name, agent_description, created_at, updated_at
- **turns**: session_id, turn_index, user_message, assistant_response (first ~1000 chars, may be truncated), timestamp
- **checkpoints**: session_id, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at — compaction checkpoints storing summarized state. Note: cloud has fewer columns (no history/work_done/technical_details).
- **session_files**: session_id, file_path, tool_name, turn_index, first_seen_at
- **session_refs**: session_id, ref_type (commit/pr/issue), ref_value, turn_index, created_at
- **search_index**: FTS5 table (local only). Use `WHERE search_index MATCH 'query'` for full-text search

### Cloud-only tables

- **events**: Raw event table (~90 columns). Key columns: session_id, timestamp, type, user_content, assistant_content, tool_start_name, tool_complete_success, tool_complete_result_content, usage_model, usage_input_tokens, usage_output_tokens
- **tool_requests**: session_id, tool_call_id, name, arguments_json

Date math (SQLite): `datetime('now', '-1 day')`, `datetime('now', '-7 days')`
Date math (Cloud/DuckDB): `now() - INTERVAL '1 day'`, `now() - INTERVAL '7 days'`. Use `ILIKE` for text search (no FTS5/MATCH), `date_diff('minute', start, end)` for durations.
