# Codex Phase 7 — Streaming + tool calls ✅

Map the codex SDK's `ThreadEvent` stream into protocol actions so the
workbench renders text/reasoning incrementally and tool calls show up
as proper tool widgets (terminal, file edits, MCP, web search,
plan/todo).

## What landed

[`codexMapSessionEvents.ts`](../codexMapSessionEvents.ts) is the codex
analogue of [`claudeMapSessionEvents.ts`](../claude/claudeMapSessionEvents.ts).
Caller pattern matches Claude's:

```ts
const turnState = createCodexTurnState();
for await (const event of events) {
    for (const signal of mapCodexEvent(uri, turnId, event, turnState)) {
        this._onDidSessionProgress.fire(signal);
    }
}
```

`mapCodexEvent` is pure (no I/O, no agent reference); `turnState` is a
mutable bag of per-turn `Set`s and `Map`s used to dedupe and compute
deltas.

## Item-shape coverage

The codex SDK's [`ThreadItem`](../../../../../../node_modules/@openai/codex-sdk/dist/index.d.ts)
is a union of 8 shapes. Mapping:

| ThreadItem.type     | Protocol mapping                                         |
| ------------------- | -------------------------------------------------------- |
| `agent_message`     | `SessionResponsePart{Markdown}` + `SessionDelta`         |
| `reasoning`         | `SessionResponsePart{Reasoning}` + `SessionReasoning`    |
| `command_execution` | `SessionToolCallStart{shell}` + `Ready` + `ContentChanged` (live aggregated_output) + `Complete` |
| `file_change`       | `SessionToolCallStart{apply_patch}` + `Ready` + `Complete` |
| `mcp_tool_call`     | `SessionToolCallStart{mcp:<server>/<tool>}` + `Ready` + `Complete` |
| `web_search`        | `SessionToolCallStart{web_search}` + `Ready` + `Complete` |
| `todo_list`         | `SessionToolCallStart{todo_list}` + `Ready` + `Complete` |
| `error`             | `SessionError`                                           |

## Streaming text + reasoning

The codex SDK emits items with **full-snapshot text** on every
`item.updated` (text fields grow monotonically across updates within a
turn). The reducer expects **incremental deltas** via `SessionDelta` /
`SessionReasoning`, not snapshots.

So per item-id we remember `textByItemId.get(itemId)`, and on each
update emit only `currentText.slice(previousLength)`. If the snapshot
doesn't start with the previous text (extremely rare — would require
the model to issue a correction), we skip the delta and reset the
baseline to avoid duplicated content.

The opening `SessionResponsePart` (with empty content) is emitted
exactly once per item via the `responsePartEmitted` set so a late
`item.started` for an item we already opened from `item.updated`
doesn't re-open the part.

## Tool-call lifecycle

For every tool item we emit, in order:

1. `SessionToolCallStart{toolCallId, toolName, displayName}`
2. `SessionToolCallReady{invocationMessage, toolInput, confirmed: NotNeeded}`
3. (for `command_execution`) `SessionToolCallContentChanged{content: [{Text, aggregated_output}]}` on each update
4. `SessionToolCallComplete{result: {success, pastTenseMessage, content, error?}}`

`confirmed: NotNeeded` is critical: codex's `approval_policy` is
global, so there is no per-call gate — the reducer would otherwise
leave the tool in `Streaming` and drop the subsequent `Complete`
(mirrors Claude's `claudeMapSessionEvents.ts` comment on the same
issue).

`toolCallStarted` / `toolCallReady` / `toolCallCompleted` sets in
`ICodexTurnState` make every transition idempotent so duplicate
events (e.g. an `item.started` arriving after we already opened from
an out-of-order `item.updated`) don't blow up the reducer.

## Tool result content

- `command_execution.Complete.result.content` = the
  `aggregated_output` as a `Text` block. `success = exit_code === 0`
  (or undefined). Failed exits set `error.message = 'Exit code N'`.
- `file_change.Complete.result.content` = a Text block listing each
  change as `<kind>: <path>`. We don't emit `ToolResultFileEditContent`
  (with before/after diffs) because the codex SDK doesn't expose diff
  content in the JSONL stream.
- `mcp_tool_call.Complete.result.content` = best-effort flatten of
  the MCP `ContentBlock[]` into Text. Structured MCP content blocks
  (image, audio, embedded resources) are dropped.
- `web_search.Complete.result.content` is empty — codex only emits
  the query, not the search results, on the JSONL stream.
- `todo_list.Complete.result.content` = a Markdown-style checklist.

## Why no `SessionToolCallDelta`

`SessionToolCallDelta` is for streaming tool-call **parameters** (the
LM is still emitting the JSON arguments). Codex's `item.started`
arrives with full arguments already (`command`, `arguments`,
`changes`, etc.) so we go straight to `Ready` without a streaming
phase. If a future codex SDK version starts emitting partial argument
deltas, add a `SessionToolCallDelta` emission in `mapItemUpdated`'s
tool branches.
