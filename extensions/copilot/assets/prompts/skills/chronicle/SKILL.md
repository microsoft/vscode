---
name: chronicle
description: Analyze Copilot session history for standup reports, usage tips, session search, and session reindexing. Use when the user asks for a standup, daily summary, usage tips, workflow recommendations, wants to search or find past sessions by keyword/file/PR, wants to reindex their session store, or asks about deleting session data.
---

# Chronicle

Analyze the user's Copilot session history using the `copilot_sessionStoreSql` tool. This skill handles standup reports, usage analysis, session search, and session store maintenance.

Sessions may be stored locally (SQLite) and optionally synced to the cloud for cross-device access. Cloud sync is controlled by the `chat.sessionSync.enabled` setting.

**Prerequisite:** Chronicle requires the `github.copilot.chat.localIndex.enabled` setting to be `true`. If the `copilot_sessionStoreSql` tool is not available, tell the user to enable this setting in VS Code Settings.

## Available Tool Actions

The `copilot_sessionStoreSql` tool supports two actions:

| Action | Purpose | `query` param |
|--------|---------|---------------|
| `query` | Execute a read-only SQL query | Required |
| `reindex` | Rebuild local session index + cloud sync | Not needed |

## Workflows

### Standup

When the user asks for a standup, daily summary, or "what did I do" (e.g. `/chronicle standup`):

**Step 1: Gather the last 24h of activity**

Use `copilot_sessionStoreSql` with `action: "query"` and follow the SQL dialect shown in the tool description (SQLite locally, DuckDB on cloud — see the **Database Schema** and **Query Guidelines** sections below).

Query the `sessions` table for rows where `updated_at` falls within the last 24 hours, ordered by `updated_at` descending. Recent-window predicate by backend:

- **Local SQLite**: `WHERE updated_at >= datetime('now', '-1 day')`
- **Cloud DuckDB**: `WHERE updated_at >= now() - INTERVAL '1 day'`

Then, for those session ids, pull related references from `session_refs` (PRs, issues, commits). If you need more detail on a particular session, query `turns` (and `session_files`, or `checkpoints` on cloud) further — don't dump every turn for every session up front.

If no sessions are found in the last 24 hours, tell the user there's no recent activity to report, suggest a longer window or `/chronicle reindex`, and stop. Do not fabricate a standup.

**Step 2: Include PR-less work**

Treat every recent session as a candidate work item, even when it has no PR, issue, or commit reference. PRs are supporting evidence, not the source of truth. Do not omit a session or branch solely because it has no PR — use session summaries and turn content to decide what to include.

**Step 3: Check PR status and format**

For any PR references found, use the GitHub CLI or MCP tools to check current status (open, merged, draft, closed). For each work item, include either a PR status line or a "No PR found" line — never invent a PR.

Format the result grouped by work stream (branch/feature). Use exactly this structure:

```
Standup for <date>:

**✅ Done**

**Feature name** (`branch-name` branch, `repo-name`)
  - 3-7 words describing the status
  - Key files: 2-3 most important files changed
  - Merged: [#123](https://github.com/owner/repo/pull/123) or No PR found
  - Session: `full-session-id`

**🚧 In Progress**

**Feature name** (`branch-name` branch, `repo-name`)
  - 3-7 words describing the current state of work
  - Key files: 2-3 most important files being worked on
  - Draft: [#789](https://github.com/owner/repo/pull/789) or No PR found
  - Session: `full-session-id`
```

Rules:
- Keep it concise and succinct — the user can always ask follow-up questions
- Use turn data (user messages AND assistant responses) to understand WHAT was done
- Use file paths from `session_files` to identify which components/areas were affected
- Group related sessions on the same branch into one entry
- For sessions, only show the most recent session per feature/branch
- Link PRs and issues using markdown link syntax
- Classify as Done if work appears complete, In Progress otherwise
- If a session has no branch or repo, include it under an "Other" section

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

When recommending custom skills, agents, or instructions as a tip, consult the **agent-customization** skill for proper file creation patterns — don't give vague "create a custom skill" advice without actionable file structure guidance.

### Cost Tips

When the user asks for cost tips, ways to reduce token usage, or how to lower Copilot spend (e.g. `/chronicle cost-tips`):

The goal is **personalized, data-grounded recommendations** for reducing token usage — not a generic checklist. Every tip must point to a specific pattern you observed in their data.

**Scope: focus on VS Code chat sessions**

Other agent surfaces (Copilot CLI, Copilot Coding Agent, Copilot Code Review, custom agents/subagents) have very different cost profiles and would skew the analysis. By default, **filter every query to the interactive VS Code chat surface** so findings reflect that usage only. Only widen the scope if the user explicitly asks about CLI, Coding Agent, or custom agents — and when you do, run separate queries per agent type rather than mixing them.

The stored `agent_name` differs by backend — match the active backend's value **exactly** (case and spacing matter):

- **Cloud (DuckDB)**: `sessions.agent_name = 'VS Code Chat'`
- **Local (SQLite)**: `sessions.agent_name = 'GitHub Copilot Chat'`. Local also records subagent invocations (e.g. `Explore`, `summarizeConversationHistory`) as their own session rows; the default filter correctly excludes them.

Briefly check the agent mix once so you know what's being excluded (e.g. `SELECT agent_name, COUNT(*) AS n FROM sessions WHERE updated_at > <30-day cutoff> GROUP BY 1 ORDER BY n DESC`). If the interactive chat value is a small minority of the user's sessions, mention that in the summary so they know the tips are scoped to a slice of their activity, and **offer to run a separate pass on another agent type** — name the candidates you saw in the mix check (e.g. "want a separate pass on `Copilot CLI` or `Copilot Coding Agent`?") so the user knows widening is possible.

If the user asks to widen scope to a specific surface (e.g. "now do CLI", "cost tips for my Coding Agent sessions", "include my `Explore` subagent"), swap the default `agent_name` filter for the requested value and run the analysis against that slice **only** — do not mix surfaces in one pass. Use the exact `agent_name` strings shown by the mix-check above; common values across backends include `Copilot CLI` / `copilotcli`, `Copilot Coding Agent`, and any custom agent / subagent name (e.g. `Explore`, `summarizeConversationHistory`). Note in the summary that the tips are now scoped to that surface and call out anything you can't analyze on the active backend (e.g. cloud-only token columns when the user is on local).

**Cost-relevant schema (in addition to the Database Schema section below)**

- **Cloud DuckDB only** — the local SQLite store does **not** record per-event token usage and has no `events` table. If the active backend is local, gate all token queries and tell the user that real token-level analysis requires enabling cloud sync (`chat.sessionSync.enabled`).
- **events** (cloud): per-event billing — rows where `type = 'assistant.usage'` carry `usage_input_tokens`, `usage_output_tokens`, `usage_model`. JOIN `events e` to `sessions s ON s.id = e.session_id` and filter `WHERE s.agent_name = 'VS Code Chat'` to keep the scope tight.
- **sessions.agent_name** / **agent_description** (both backends): the interactive VS Code chat surface is stored as `'VS Code Chat'` on cloud and `'GitHub Copilot Chat'` on local. Other values include `Copilot CLI` / `copilotcli`, `Copilot Coding Agent`, subagents (`Explore`, `summarizeConversationHistory`, `panel/editAgent`, …), and custom agents.
- Use `LENGTH(user_message)` on `turns` (or `LENGTH(user_content)` on `events` where `type = 'user.message'`) to find oversized pastes.

**Step 1: Investigate cost and token patterns (interactive VS Code chat only)**

Use `copilot_sessionStoreSql` with `action: "query"`. Every query in this step must filter `sessions.agent_name` to the interactive VS Code chat value for the active backend — `'VS Code Chat'` on cloud, `'GitHub Copilot Chat'` on local. What to investigate depends on the active backend.

*Cloud (DuckDB) — drill into cost patterns* (filter `events` rows by `type = 'assistant.usage'` for billable rows, and join `sessions` to keep `agent_name = 'VS Code Chat'`):

- **Token-heavy sessions and turns** — sum `usage_input_tokens` and `usage_output_tokens` per session and per model from `events` where `type = 'assistant.usage'`. Which sessions burned the most tokens? Which models?
- **Input-to-output ratios** — when input tokens dwarf output tokens, the user is paying to re-send a bloated context every turn. Strongest signal that compaction, smaller working sets, or fresh sessions would help.
- **Model mix** — break down spend by `usage_model`. Are premium models being used for routine work (renames, simple edits, status checks) that a cheaper model could handle?
- **Per-turn growth** — within long sessions, does `usage_input_tokens` keep climbing turn-over-turn? Strong signal that compaction wasn't used.
- **Oversized pastes** — `LENGTH(user_content)` on `events` where `type = 'user.message'` to find user messages that should have been file references (also visible in `session_files` as repeated reads of the same path within one session).

*Local (SQLite) — no token data; use proxies* (filter `sessions.agent_name = 'GitHub Copilot Chat'` on every query):

- **Long sessions without compaction** — sessions with many turns and no rows in `checkpoints` (each `checkpoints` row is a successful compaction). `LEFT JOIN checkpoints c ON c.session_id = s.id WHERE c.session_id IS NULL` + a turn-count threshold gives prime candidates.
- **Late compaction** — for sessions that *do* have checkpoints, compare `checkpoints.checkpoint_number` and `created_at` against the session's turn count. A first compaction at turn 60 of an 80-turn session is far less helpful than one at turn 25.
- **Repeated large file reads** — in `session_files`, look for the same file read many times within one session, or across sessions.
- **Tool-call thrash** — sessions with many turns and repeated tool calls often indicate the agent rediscovered the same context multiple times.
- **Oversized pastes** — use `LENGTH(user_message)` on `turns` to find very long user messages that should have been file references.

*Both backends:*

- **Long-running sessions** — sessions with many turns or that span many hours drag a growing context window across every turn.
- **Repeated work** — the same file/topic showing up in many sessions, or the same agent stumbling block recurring (suggesting a custom skill, agent, or `copilot-instructions.md` entry would let the model do the work in one shot).
- **Subagent usage** — are heavyweight investigations being run in the main session (paying for their tokens to live in main context) when they could be delegated to a subagent that returns only a summary?

Drill into a few of the most expensive sessions and read the actual conversation turns to understand *why* they were expensive. Don't just report aggregates — explain the cause.

**Step 2: Map findings to features and habits**

If the current workspace has a `.github/` folder, check `.github/copilot-instructions.md`, `.github/skills/`, and `.github/agents/` to see what custom configuration already exists. Do NOT look outside the workspace. Cost-relevant capabilities to keep in mind:

- Mid-session compaction (e.g. `/compact`) to shrink the context window; for users who never compact, this is often the single biggest win.
- Model picker — switch to a cheaper model for routine work; check whether premium models are being used for simple tasks.
- Starting a fresh chat instead of continuing a bloated session.
- Subagents/delegation for offloading heavy research into a sub-context whose tokens don't accrete into the main session.
- Custom skills (`.github/skills/`) and custom agents (`.github/agents/`) so repeated workflows don't re-derive context each time.
- `.github/copilot-instructions.md` to encode project conventions the model otherwise has to be told every session.
- For cloud-enabled users, the Copilot usage view to inspect current premium-request spend.

**Step 3: Provide tips**

Give the user 3-5 specific, actionable tips. Each tip should:

- **Be grounded in their data** — reference a specific session, file, model, or pattern you observed (with rough numbers when you have them: turn counts, token totals, file-read counts, etc.).
- **Be non-obvious** — skip basics any returning user already knows. Assume they know compaction and fresh chats exist; help them notice they're not *using* them where it would matter.
- **Quantify the win when possible** — "compacting around turn 30 of that 80-turn session would have shaved ~X input tokens off every subsequent turn" is far better than "consider compacting".
- **Be concrete** — name the workflow change, command, or config file edit. If the suggestion is a custom skill or agent, sketch what it would cover.
- **Stay within VS Code chat scope** — tips should target interactive VS Code chat usage (compaction, model picker, fresh chats, `.github/copilot-instructions.md`, custom skills/agents, subagent delegation). Do not propose CLI- or Coding-Agent–specific changes unless the user has explicitly broadened scope.

If the session store has little data (e.g., cloud store is empty, or only a handful of local interactive chat sessions), say so plainly and offer 2-3 non-obvious cost-saving habits anchored in available features rather than fabricating findings. If the user is on local-only storage, end by noting that enabling `chat.sessionSync.enabled` unlocks per-event token analysis for sharper future tips.

### Improve

When the user asks to improve their agent instructions based on session history (e.g. `/chronicle improve`):

**Step 1: Read the current instructions file**

Read whichever instructions file the project uses (`.github/copilot-instructions.md` or `AGENTS.md`) to understand what already exists.

If the file does **not** exist, you will create it. In that case, also analyze the codebase first — consult the **init** skill and follow its codebase exploration approach. Combine that analysis with the session history findings from Step 2 to produce a comprehensive instructions file.

**Step 2: Investigate session history**

Use `copilot_sessionStoreSql` to explore. Scope all queries to sessions from the current repository or working directory.

Start by getting an overview of recent sessions for this repo, then dig deeper. You're looking for **friction** — signals that the agent misunderstood something or the user had to course-correct:

- **User messages that correct or redirect** — read the actual conversation turns of suspicious sessions. Look for areas where the user got frustrated.
- **Dev loop struggles** — did the agent have trouble with tests, linting, building, or type checking? Look for repeated failed commands, test retries, or build errors that required multiple attempts.
- **Patterns across sessions** — does the same kind of mistake recur?

Use your judgment on what queries to run. Drill into specific sessions when something looks interesting — read the actual turn-by-turn conversation to understand what went wrong.

**Step 3: Present recommendations**

Before presenting, consult the **agent-customization** skill for proper file conventions, content principles (link don't embed, minimal, concise), and anti-patterns — this frames how recommendations should be written.

Based on what you find, succinctly present 3-5 recommendations. Explain both the issue you found and what custom instructions can address it.

Focus on project-specific patterns, not generic advice. Only suggest instructions that address real problems found in the data that happened more than once.

After presenting all recommendations, ask the user which ones they'd like to apply. Then make only the approved edits to the single existing instructions file (or create `AGENTS.md` if none exists).

### Search

When the user asks to search, find, or look up past sessions by keyword (e.g. `/chronicle search <query>`):

**Search strategy**

1. Search across session summaries, conversation turns (user messages AND assistant responses), and any other indexed content (checkpoints, file paths, refs like PR/issue/commit). The user's query may match a topic, a file path, or a PR/issue number — cover all three.
2. For each matching session, gather enough metadata to label it: `s.id`, `s.repository`, `s.branch`, `s.summary`, `s.updated_at`, plus a short snippet that shows *why* it matched (e.g. `substr(user_message, 1, 160)` on cloud, or the matched `file_path` / `ref_value`).
3. Present results grouped by repository, ordered by most recently updated.

**Writing the query**

Call `copilot_sessionStoreSql` with `action: "query"` and `description: "Search sessions for <query>"`. Follow the SQL dialect shown in the tool description (SQLite vs DuckDB).

Schema essentials (full schema is in the **Database Schema** section below — re-read it before writing the query):

- The `sessions` table primary key is `id` (NOT `session_id`). Every other table uses `session_id` as the FK back to `sessions.id`. Always project `s.id` from `sessions`.
- Don't invent names: there is no `started_at` (use `created_at`/`updated_at`), no `workspace` (use `cwd` locally; cloud has none), no `title` (use `summary`), no `content`/`messages` (use `turns.user_message`/`turns.assistant_response`, or on cloud `events.user_content`/`events.assistant_content`).
- **Local SQLite**: prefer the FTS5 `search_index` table (`WHERE search_index MATCH '<query>'`) for body content — `search_index` already has a `session_id` column, so select it directly (`SELECT session_id, content FROM search_index WHERE search_index MATCH ...`). Do **not** join `search_index.rowid` to `turns.rowid`; they are unrelated and you will pull in unrelated sessions. File paths and refs aren't in the FTS index — combine with `LIKE` on `session_files.file_path` and `session_refs.ref_value`.
- **Cloud DuckDB**: no FTS5 — use `ILIKE '%<query>%'` across the text columns of `sessions`, `turns`, `checkpoints`, `session_files`, `session_refs`.

Escape single quotes in the user's query by doubling them (`it's` → `it''s`). For multi-word FTS5 queries, quote the whole phrase: `MATCH '"apply patch"'`.

**Performance — avoid cloud timeouts**

`ILIKE '%X%'` on `turns` is a full table scan. Cloud queries that run too long return `context deadline exceeded`. To stay under the budget:

- Collect matching session IDs into a single CTE (`WITH hits AS (...)`) and then **`JOIN`** back to `sessions` once. Don't use correlated subqueries in the SELECT list — they re-scan the CTE per row.
- Aggregate match info per session with `GROUP BY session_id` and `any_value()` / `MIN()` / `array_agg()` rather than scalar subqueries.
- On cloud, default to a **90-day window** on the heavy tables (`WHERE timestamp >= now() - INTERVAL '90 days'` on `turns`, same on `checkpoints` via `created_at`). Mention the window in your summary line so the user knows it's bounded; widen it if the user asks for "all time" or no results come back.
- Keep `LIMIT 50` on the final SELECT.
- If a query times out, retry with a tighter window (30 days) or drop the heaviest table (usually `turns`) and tell the user what you trimmed.

**Output format**

For each session, build a one-line label from `summary` if present, else from the returned `snippet` (truncate to ~80 chars). Never emit `(no summary)`, `(no metadata)`, or bare session-id lists.

If you applied a time window (e.g. the cloud 90-day default), include it in the header so the user knows the scope; otherwise omit the scope phrase or say "all time". Example:

```
**Search results for "<query>"** (<n> sessions, <scope: e.g. "last 90 days" / "all time">)

_owner/repo_
- `session-id` — **<summary or snippet>**
  `branch` · updated <relative time> · matched in <match_kind>
- `session-id` — **<summary or snippet>**
  `branch` · updated <relative time> · matched in <match_kind>

_other-owner/other-repo_
- ...
```

Rules:
- Always render one session per line — never join multiple session ids with commas.
- The label is `summary` if non-null; otherwise the snippet; otherwise a usable fallback like the matched file path. If even those are empty, skip the session rather than show "no summary".
- Include `· matched in <match_kind>` (turn / file / ref / checkpoint / meta) when you can — helps the user see why each session matched.
- Group by repository. Sessions whose `repository` is NULL go under an _Other_ heading, formatted the same way (one per line, with a usable label).
- Cap visible results per repository at ~10; if there are more, append `…and N more (refine your query)`.

**No results**

If no rows are returned, tell the user and suggest:
- Trying different keywords or a broader search term (single word, or a substring instead of a phrase)
- Widening the time window ("search all time", "include older sessions")
- Running `/chronicle reindex` if they haven't indexed their sessions yet
- Running `/chronicle standup` to see recent activity

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
- Only `SELECT` and `WITH` (CTE) are allowed. `DESCRIBE`, `SHOW`, `PRAGMA`, and any mutating statements are blocked — re-read the **Database Schema** section below instead of trying to introspect
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
- **search_index**: FTS5 virtual table (local only). Columns: `content`, `session_id`, `source_type` (`turn`/`assistant`/`checkpoint`/etc.), `source_id`. Use `WHERE search_index MATCH 'query'` for full-text search and project `session_id` directly — **do NOT** join `search_index.rowid` to `turns.rowid` (the rowids are independent and the join will match the wrong rows). Use `snippet(search_index, 0, '[', ']', '…', 12)` or `substr(content, 1, 160)` for a snippet.

### Cloud-only tables

- **events**: Raw event table (~90 columns). Key columns: session_id, timestamp, type, user_content, assistant_content, tool_start_name, tool_complete_success, tool_complete_result_content, usage_model, usage_input_tokens, usage_output_tokens
- **tool_requests**: session_id, tool_call_id, name, arguments_json

Date math (SQLite): `datetime('now', '-1 day')`, `datetime('now', '-7 days')`
Date math (Cloud/DuckDB): `now() - INTERVAL '1 day'`, `now() - INTERVAL '7 days'`. Use `ILIKE` for text search (no FTS5/MATCH), `date_diff('minute', start, end)` for durations.
