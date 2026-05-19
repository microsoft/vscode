---
name: chronicle:search
description: Search recent chat sessions by keyword
---
Search my Copilot session history for the keywords I provide and list the matching sessions. Use the **chronicle** skill — it documents the `copilot_sessionStoreSql` tool, the session-store schema (the `sessions` table primary key is `id`; conversation content lives in `turns`, not on `sessions`; on local SQLite use the FTS5 `search_index` table and select `session_id` directly — never join `search_index.rowid` to `turns.rowid`), and the Search workflow including the cloud perf rules (aggregate-once via `WITH hits ... JOIN sessions`, default 90-day window on `turns`).
