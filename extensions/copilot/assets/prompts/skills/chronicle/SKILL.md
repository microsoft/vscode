---
name: chronicle
description: Analyze Copilot session history for standup reports, usage tips, budget-saving recommendations, and session reindexing. Use when the user asks for a standup, daily summary, usage tips, cost savings, workflow recommendations, wants to reindex their session store, or asks about deleting session data.
---

# Chronicle

Analyze the user's Copilot session history using the `copilot_sessionStoreSql` tool. This skill handles standup reports, usage analysis, budget-saving recommendations, and session store maintenance.

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
### Budget

When the user asks for budget-saving, cost reduction, token efficiency, cost optimization, or session log analysis for cost improvements:

**Do not ask for confirmation to start.** The user invoking this workflow is their confirmation. Begin analysis immediately.

**Scope note.** This workflow analyzes _one user's_ session history from the session store. It is not an org-wide rollup. Cost figures derived from token counts are **pre-discount**: any promotional credits, included-usage blocks, or volume discounts that apply to the user's plan are billing-side concerns and are not reflected in raw token totals from the session store. Flag this caveat explicitly in the final report so the user does not confuse "tokens consumed" with "dollars billed". Do **not** make claims about specific pricing, multipliers, or which models are exempt from billing — those policies change over time and are outside what the session store can verify.

#### Step 1: Detect Available Data

The session store has two backends: **cloud DuckDB** (has `events` and `tool_requests` tables with per-turn token data) and **local SQLite** (only has `sessions`, `turns`, `session_files`, `session_refs`, and `search_index` — no per-event token data).

Probe which backend is available by running a cheap query. Avoid `COUNT(*)` — it ignores `LIMIT` and scans the full table:

```sql
SELECT 1 FROM events LIMIT 1
```

Three possible outcomes — handle each explicitly:

- **Query succeeds** → you have the **cloud DuckDB** backend. Proceed with the full query set below.
- **Query fails with a SQL/table error** (e.g. "table events does not exist") → you have the tool but no events data; fall through to the **local SQLite** queries.
- **Tool itself is unavailable** → tell the user to enable `github.copilot.chat.localIndex.enabled` in VS Code Settings.

#### Step 2: Gather Token Usage Data

##### Cloud DuckDB Queries (full analysis)

Use `copilot_sessionStoreSql` with `action: "query"`. Follow the SQL syntax shown in the tool description (DuckDB syntax for cloud).

**Important:** Filter by usage time, not session creation time. Sessions started before the window may still be actively used inside it. Always filter on `e.timestamp` (for `events`) or `s.updated_at` (for sessions) — never on `s.created_at` alone, which silently drops live sessions.

**2a. Per-session token totals (last 14 days)**

```sql
SELECT
    s.id AS session_id,
    s.summary,
    s.created_at,
    s.updated_at,
    COUNT(*) AS api_calls,
    SUM(COALESCE(e.usage_input_tokens, 0)) AS total_input_tokens,
    SUM(COALESCE(e.usage_output_tokens, 0)) AS total_output_tokens,
    SUM(COALESCE(e.usage_input_tokens, 0) + COALESCE(e.usage_output_tokens, 0)) AS total_tokens
FROM sessions s
JOIN events e ON e.session_id = s.id
WHERE e.type = 'assistant.usage'
  AND e.timestamp >= now() - INTERVAL '14 days'
GROUP BY s.id, s.summary, s.created_at, s.updated_at
ORDER BY total_tokens DESC
LIMIT 20
```

**2b. Per-model cost breakdown**

```sql
SELECT
    COALESCE(e.usage_model, 'unknown') AS model,
    COUNT(*) AS api_calls,
    SUM(COALESCE(e.usage_input_tokens, 0)) AS input_tokens,
    SUM(COALESCE(e.usage_output_tokens, 0)) AS output_tokens,
    SUM(COALESCE(e.usage_input_tokens, 0) + COALESCE(e.usage_output_tokens, 0)) AS total_tokens
FROM events e
WHERE e.type = 'assistant.usage'
  AND e.timestamp >= now() - INTERVAL '14 days'
GROUP BY e.usage_model
ORDER BY total_tokens DESC
```

**2c. Tool call frequency and failure rates**

```sql
SELECT
    tr.name AS tool_name,
    COUNT(*) AS call_count,
    SUM(CASE WHEN e.tool_complete_success = false THEN 1 ELSE 0 END) AS failures,
    ROUND(SUM(CASE WHEN e.tool_complete_success = false THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS failure_rate_pct
FROM tool_requests tr
JOIN events e ON e.tool_complete_call_id = tr.tool_call_id AND e.session_id = tr.session_id
WHERE e.timestamp >= now() - INTERVAL '14 days'
GROUP BY tr.name
ORDER BY call_count DESC
```

**2d. Highest-token turns (find bloated conversations)**

`assistant.usage` events do not carry `user_content`. Join each usage event to the most recent preceding `turns.user_message` for the same session:

```sql
WITH usage AS (
    SELECT
        e.session_id,
        e.timestamp,
        COALESCE(e.usage_input_tokens, 0) AS input_tokens,
        COALESCE(e.usage_output_tokens, 0) AS output_tokens,
        COALESCE(e.usage_model, 'unknown') AS model
    FROM events e
    WHERE e.type = 'assistant.usage'
      AND e.timestamp >= now() - INTERVAL '14 days'
      AND COALESCE(e.usage_input_tokens, 0) > 0
    ORDER BY input_tokens DESC
    LIMIT 15
)
SELECT
    u.session_id,
    u.input_tokens,
    u.output_tokens,
    u.model,
    substr(COALESCE((
        SELECT t.user_message
        FROM turns t
        WHERE t.session_id = u.session_id
          AND t.timestamp <= u.timestamp
        ORDER BY t.timestamp DESC
        LIMIT 1
    ), ''), 1, 200) AS user_prompt_preview
FROM usage u
ORDER BY u.input_tokens DESC
```

**2e. Session length vs. task complexity**

Aggregate turns and usage in **separate CTEs** before joining. A direct join of `turns` and `events` on `session_id` alone produces a Cartesian fanout that inflates `tokens_per_turn`:

```sql
WITH turn_counts AS (
    SELECT t.session_id, COUNT(DISTINCT t.turn_index) AS turn_count
    FROM turns t
    JOIN sessions s ON s.id = t.session_id
    WHERE s.updated_at >= now() - INTERVAL '14 days'
    GROUP BY t.session_id
),
usage_totals AS (
    SELECT
        e.session_id,
        SUM(COALESCE(e.usage_input_tokens, 0) + COALESCE(e.usage_output_tokens, 0)) AS total_tokens
    FROM events e
    WHERE e.type = 'assistant.usage'
      AND e.timestamp >= now() - INTERVAL '14 days'
    GROUP BY e.session_id
)
SELECT
    s.id,
    s.summary,
    tc.turn_count,
    COALESCE(ut.total_tokens, 0) AS total_tokens,
    CASE
        WHEN tc.turn_count > 0
        THEN COALESCE(ut.total_tokens, 0) / tc.turn_count
        ELSE 0
    END AS tokens_per_turn
FROM turn_counts tc
JOIN sessions s ON s.id = tc.session_id
LEFT JOIN usage_totals ut ON ut.session_id = tc.session_id
WHERE tc.turn_count > 3
ORDER BY tokens_per_turn DESC
LIMIT 10
```

**2f. Runaway tool loops**

Tight loops of the same tool firing repeatedly inside a single session are one of the most expensive failure modes — each iteration re-sends the full context:

```sql
WITH tool_calls AS (
    SELECT
        e.session_id,
        tr.name AS tool_name,
        e.timestamp
    FROM events e
    JOIN tool_requests tr
        ON tr.tool_call_id = e.tool_complete_call_id
        AND tr.session_id = e.session_id
    WHERE e.type = 'tool.execution_complete'
      AND e.timestamp >= now() - INTERVAL '14 days'
),
per_session_tool AS (
    SELECT
        session_id,
        tool_name,
        COUNT(*) AS calls,
        date_diff('minute', MIN(timestamp), MAX(timestamp)) AS span_minutes
    FROM tool_calls
    GROUP BY session_id, tool_name
)
SELECT
    session_id,
    tool_name,
    calls,
    span_minutes,
    ROUND(calls * 1.0 / NULLIF(span_minutes, 0), 2) AS calls_per_minute
FROM per_session_tool
WHERE calls >= 20
  AND (span_minutes <= 30 OR calls_per_minute >= 1.0)
ORDER BY calls DESC
LIMIT 15
```

**2g. Long sessions that never compacted**

Sessions whose input tokens grow linearly because compaction never ran. The session store records compaction outcomes as `session.compaction_complete` events. The `success` and `summaryContent` fields live inside the event payload, so do not filter on `tool_complete_success` for compaction events — that column is for `tool.execution_complete` events.

The safer cross-backend check is "did this session emit any compaction event at all". If you need to distinguish successful compactions from no-op completions, inspect a few example rows first to discover which columns the cloud backend exposes the `data.success` / `data.summaryContent` payload through — schema varies, and applying the wrong filter silently returns zero rows:

```sql
WITH long_sessions AS (
    SELECT
        e.session_id,
        SUM(COALESCE(e.usage_input_tokens, 0) + COALESCE(e.usage_output_tokens, 0)) AS total_tokens,
        COUNT(*) AS usage_events
    FROM events e
    WHERE e.type = 'assistant.usage'
      AND e.timestamp >= now() - INTERVAL '14 days'
    GROUP BY e.session_id
    HAVING SUM(COALESCE(e.usage_input_tokens, 0) + COALESCE(e.usage_output_tokens, 0)) > 200000
),
compactions AS (
    SELECT session_id, COUNT(*) AS compaction_events
    FROM events
    WHERE type = 'session.compaction_complete'
    GROUP BY session_id
)
SELECT
    ls.session_id,
    ls.total_tokens,
    ls.usage_events,
    COALESCE(c.compaction_events, 0) AS compaction_events
FROM long_sessions ls
LEFT JOIN compactions c ON c.session_id = ls.session_id
WHERE COALESCE(c.compaction_events, 0) = 0
ORDER BY ls.total_tokens DESC
LIMIT 10
```

##### Local SQLite Fallback Queries

If the cloud backend is unavailable, the local store lacks per-event token data. Focus on session-level and turn-level patterns:

**Sessions overview (last 14 days)**

```sql
SELECT id, summary, branch, repository, created_at, updated_at
FROM sessions
WHERE updated_at >= datetime('now', '-14 days')
ORDER BY updated_at DESC
LIMIT 20
```

**Turn count per session (proxy for cost — more turns = more tokens)**

```sql
SELECT s.id, s.summary, COUNT(t.turn_index) AS turn_count
FROM sessions s
JOIN turns t ON t.session_id = s.id
WHERE s.updated_at >= datetime('now', '-14 days')
GROUP BY s.id, s.summary
ORDER BY turn_count DESC
LIMIT 15
```

**Tool usage patterns (from session_files)**

```sql
SELECT tool_name, COUNT(*) AS usage_count
FROM session_files sf
JOIN sessions s ON sf.session_id = s.id
WHERE s.updated_at >= datetime('now', '-14 days')
GROUP BY tool_name
ORDER BY usage_count DESC
```

**Read actual user messages to find correction patterns**

```sql
SELECT session_id, turn_index, substr(user_message, 1, 300) AS prompt_preview
FROM turns t
JOIN sessions s ON t.session_id = s.id
WHERE s.updated_at >= datetime('now', '-14 days')
ORDER BY s.updated_at DESC, t.turn_index ASC
LIMIT 50
```

With SQLite data, focus analysis on:
- Session length (turn count) as a proxy for token spend
- User message patterns (corrections, retries, vague prompts)
- Tool usage patterns from session_files
- Reading actual conversation turns to find friction and waste

Acknowledge the data limitation clearly in your report.

If queries return no data, fall back to a 30-day window. If still empty, acknowledge limited data and skip to Step 3 with general best practices.

**Adapt queries as needed.** These are starting points — drill into specific sessions, read actual turn content, and follow interesting signals. The goal is to understand _where tokens are being burned_.

#### Step 3: Identify Inefficiency Patterns

From the data, look for these specific cost drivers (in priority order):

**High-Impact Patterns (biggest savings)**

1. **Premium model overuse** — Higher-tier models cost more per token. Calculate what % of tokens go to higher-tier models and report it as a share of total token spend, with concrete examples of the work those tokens funded. Do **not** invent specific multipliers or dollar figures. If a meaningful share of higher-tier traffic is on low-stakes tasks (formatting, simple file edits, exploratory reads), recommend switching those workflows to a lighter model via the model picker in the Chat input.

2. **Runaway tool loops ("Ralph loops")** — A single tool firing many times in a tight window inside one session, often because the agent is retrying against the same error. Each iteration re-sends the full context, so 50 retries on a 50k-token context burns ~2.5M input tokens. Use query 2f to surface these and quote the worst offenders by `calls_per_minute` in the report. A session with the terminal tool firing 80 times in 12 minutes is almost certainly a retry loop, not productive work.

3. **Ballooning context windows** — Sessions where input tokens grow dramatically turn-over-turn indicate the context window is filling up without compaction. Look for sessions with >100k input tokens in later turns. Cross-reference with query 2g.

4. **Tool call retry loops** — High failure rates on terminal, build, or test tools mean the agent is burning tokens retrying. Identify which tools fail most and why.

5. **Verbose tool outputs** — Large tool results (especially terminal output, grep results, file reads) inflate the context. Look for patterns where the user could pipe to `head`, use `--quiet`, or narrow searches.

6. **Redundant exploration** — Multiple search/file-read calls for the same information across turns. The agent is re-discovering things it already found.

**Medium-Impact Patterns**

7. **Long sessions without compaction** — Sessions with many turns that never compacted, causing input tokens to grow linearly. Query 2g identifies these directly.

8. **Missing custom instructions** — Repeated corrections or redirections from the user that could be codified as instructions. This overlaps with the Tips workflow; prefer recommending the user ask for tips rather than codifying corrections directly here, unless the correction is specifically about token waste.

9. **Sub-agent underuse** — Complex multi-step tasks done in the main agent that could use sub-agents (which have separate, smaller contexts).

10. **Overly broad prompts** — User messages that are vague or multi-part, causing the agent to explore unnecessarily or produce verbose responses.

**Lower-Impact Patterns**

11. **Model switching overhead** — Frequent model changes mid-session add context re-processing costs.

12. **Large file reads** — Reading entire files when only a section was needed.

13. **Missing search filters** — grep/search without file type or path filters, returning too many results.

#### Step 4: Read Current Custom Instructions

VS Code custom instructions live in two scopes:

- **User-scope instructions** — `.instructions.md` files in the user prompts folder (created via the `Chat: New Instructions File` command and saved to user data). This is the default destination for optimizations derived from the user's personal session history so you don't duplicate or conflict with existing personal guidance.
- **Repository-scope instructions** — `.github/copilot-instructions.md` in the current workspace. Treat this as shared, repository-wide context.

Read whichever files exist before proposing additions. Only consider repo-scope changes if a recommendation is clearly repository-wide, applicable to most contributors, and can be phrased generically rather than as a reflection of this user's personal habits or session history.

**Coordinate with the Tips workflow.** Tips writes to the same files by codifying user corrections as instructions. If a recommendation is purely a "user keeps correcting the agent" pattern (not specifically about token waste), prefer suggesting the user ask for tips instead of duplicating that work here. This workflow's unique value is **token and cost quantification** — keep additions focused on cost-driven guidance.

#### Step 5: Present Findings & Update Instructions

Apply personal cost and token-efficiency optimizations to user-scope instructions by default. Only propose updates to `.github/copilot-instructions.md` when they are genuinely repository-wide and written in neutral, generic language. If a finding is user-specific or based on one person's workflow preferences, keep it out of the repository-scoped file.

**5a. Token Efficiency Report**

Present a concise report with these sections:

**📊 Usage Summary (last 14 days)**
- Total tokens consumed (input + output)
- Breakdown by model (with relative cost indicators)
- Average tokens per session
- Top 3 most expensive sessions (with summaries)

**🔥 Top Inefficiencies Found**

For each pattern found (rank by estimated token savings):
- What the pattern is
- Evidence from the data (specific sessions, numbers)
- Estimated waste (tokens or % of total)
- Concrete fix

**💡 Actionable Tips**

3-5 specific, data-driven tips. Each must:
- Reference actual usage data you found
- Include a concrete "do this instead" action
- Estimate the impact (e.g., "could reduce input tokens by ~20%")

Examples of good tips:
- "Your terminal tool has a 34% failure rate — mostly from test commands. Add your test command to custom instructions so the agent gets it right first try. This would save ~15k tokens/session in retries."
- "3 of your top 5 sessions used a premium model for simple file edits. Use the model picker in the Chat input to switch to a lighter model for routine tasks."
- "Your average session runs 12 turns before compaction. Start a fresh chat (`Chat: New Chat`) once a task is done and use sub-agents for exploration to keep the main context lean."

**5b. Custom Instructions Updates**

Based on the inefficiencies found, propose specific additions to the user's custom instructions that will **prevent recurring waste**. Categorize each recommendation:

**User-scope instructions** (`.instructions.md` in the user prompts folder, created via `Chat: New Instructions File`) — default destination for:
- User-specific workflow preferences and prompting habits
- Model selection guidance based on personal usage patterns
- Personal token-efficiency reminders

**Repository instructions** (`.github/copilot-instructions.md`) — only for:
- Build/test/lint commands the agent keeps getting wrong (tool retry loops) — these are repo-wide facts
- Project-specific conventions the agent keeps re-discovering
- Preferred tools or approaches for common tasks in this codebase

**Guard against cross-repo bleed.** Personal sessions span every repo the user has worked in. Before proposing any change to `.github/copilot-instructions.md`, **re-run a repo-scoped query** to confirm the pattern is present in _this_ repository's sessions, not just the user's broader history.

First derive the current repository identifier from the workspace (e.g., run `git remote get-url origin` and extract the `owner/repo` slug; the `sessions.repository` column typically stores it in that form). Then filter the query on that exact value:

```sql
SELECT COUNT(*) AS sessions_in_repo
FROM sessions
WHERE repository = '<owner/repo>'
  AND updated_at >= now() - INTERVAL '14 days'
```

If the exact match returns nothing but you expect data, fall back to `repository ILIKE '%<repo-name>%'` and inspect the distinct `repository` values to find the right form.

If the inefficiency does not show up in this repo's sessions, keep the recommendation in user-scope instructions only — do not write friction from unrelated repos into this repo's `.github/copilot-instructions.md`. When in doubt, default to user scope or delegate corrections-style edits to the Tips workflow.

Present each proposed instruction change, specify which file it targets, and explain which inefficiency it addresses. Then ask the user which changes to apply. Apply only the approved changes (create the file if it doesn't exist).

**Important guidelines:**
- **Be quantitative.** Use actual numbers from the data, not vague claims.
- **Prioritize by impact.** A 20% reduction in a pattern that accounts for 50% of tokens matters more than eliminating a minor pattern entirely.
- **Be honest about data limitations.** If the session store has sparse data, say so. Do not fabricate patterns.
- **Don't recommend obvious things.** Skip advice like "write shorter prompts" — focus on non-obvious, data-driven insights.

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
