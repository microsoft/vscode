# Son of Anton — Architecture

This document describes how the chat-surface pieces in
`extensions/son-of-anton` fit together: how a request travels from the
webview through the agent stack to a model, how tools execute, and where
state is persisted.

For the higher-level fork policy (Tier 1/2/3 modifications, services-first
philosophy) see the repo root `CLAUDE.md`. For agent-by-agent details see
`docs/agents.md`.

## Layers

```
+--------------------------------------------------------------+
|  Webview (browser sandbox)                                   |
|  - Chat composer, message renderer, tool cards, cost meter   |
|  - Slash-command popup, @-mention popup, approval cards      |
+--------------------------------------------------------------+
                     |  postMessage (typed)
                     v
+--------------------------------------------------------------+
|  Extension host (Node)                                       |
|  - ChatSession, ChatPanel, ChatViewProvider                  |
|  - AgentBridge -> AgentStack (Orchestrator + Specialists)    |
|  - LlmClient, ToolRegistry, McpClient                        |
|  - WorkspaceContextProvider, CostReporter, CredentialBroker  |
+--------------------------------------------------------------+
        |                              |
        |  HTTPS (streaming)           |  child_process stdio (JSON-RPC)
        v                              v
+----------------------+      +-------------------------------+
|  LLM providers       |      |  MCP servers (user configured)|
|  Anthropic / OpenAI  |      |  Each spawned per             |
|  Foundry / Bedrock   |      |  sota.mcp.servers entry       |
|  Google Gemini       |      |                               |
+----------------------+      +-------------------------------+
```

The webview is sandboxed by VS Code's webview API. It never touches secrets,
the filesystem, or child processes — every privileged call is a
`postMessage` to the extension host, which validates and dispatches.

## Chat surface architecture

```
   Webview
     |
     |  user message + model + specialist + mentions
     v
+----------------+
|  ChatSession   |  shared between ChatPanel (panel) and ChatViewProvider (sidebar)
+----------------+
     |
     | hasAgent(specialistId) ?
     v
+----------------+        no       +-----------------------+
|  AgentBridge   |---------------> | LlmClient (legacy     |
|                |                 | direct path used for  |
|                |  yes            | specialists not in    |
|                |                 | the agent stack)      |
|                v                 +-----------------------+
| AgentStackFactory                                  |
|  - OrchestratorAgent                               |
|  - 8 BaseAgent specialists (in stack)              |
|  - ReviewAgent                                     |
|  - MetricsTracker, ProjectMemory                   |
+----------------+                                   |
     |                                               |
     | runOrchestrator / runSpecialist               |
     |                                               |
     v                                               v
+--------------------------------------------------------+
|  AgentEvent stream                                     |
|  plan-proposed | subtask-started | subtask-token |     |
|  subtask-completed | subtask-failed | token | final    |
+--------------------------------------------------------+
     |
     v
   Webview (renders plan, subtasks, tokens, tool cards)
```

The `AgentStack` is built **once per extension activation** and shared
between the chat-participant registrar and the webview. This keeps
`MetricsTracker` and `ProjectMemory` consistent regardless of which surface
the user invokes an agent through.

`AgentBridge` adapts the orchestrator's `vscode.ChatResponseStream`
contract — it was authored against the native chat-participant API — into
streamed `AgentEvent`s the webview can render. A minimal in-memory
`ShimResponseStream` routes every `markdown` / `progress` call into a
`token` event. Plans and subtasks bypass the markdown shim and ride the
dedicated `structuredEmit` channel.

### Specialists in vs out of the agent stack

- **In stack** (eight specialists with full `BaseAgent` lifecycle): code,
  test, e2e, security, docs, ci, pr, moderniser.
- **Registered for chat-participant routing only** (`anton-spec`): the
  spec pipeline is driven by `SpecPipelineManager` rather than a
  long-lived agent, so it surfaces through the chat sidebar via
  `specialistRegistry` but isn't a member of `AgentStack.specialists`.
- The orchestrator (`anton`) is always the entry agent.

## Tool execution path

```
LLM (provider stream)
    |
    | tool_use event (id, name, input)
    v
+----------------------+
|  ChatSession         |
|  - dispatch loop     |
+----------------------+
    |
    | look up tool definition
    v
+----------------------+
|  ToolRegistry        |
|  - BUILTIN_TOOLS     |---- read_file, list_directory, search_workspace
|  - MCP-bridged tools |     write_file, run_command (riskLevel: requiresApproval)
|                      |---- mcp__<server>__<tool>
+----------------------+
    |                                |
    | riskLevel === 'requiresApproval'?
    |                                |
    | yes                            | no
    v                                v
+--------------+              +------------------+
| Approval     |              | Execute now      |
| card emitted |              | (auto-approved   |
| Webview waits|              |  pill if         |
| 5 min max    |              |  autoApprove on) |
+--------------+              +------------------+
    |                                |
    v                                v
+--------------------------------------------+
|  Tool.execute(input, ToolExecutionContext) |
|  returns ToolExecutionResult               |
|  { content, isError?, metadata? }          |
+--------------------------------------------+
    |
    v
LLM (next turn includes tool_result)
```

Built-in tools live in `extensions/son-of-anton/src/tools/builtin.ts`.
MCP-bridged tools are registered into the same `ToolRegistry` by
`McpToolBridge` so the LLM cannot tell the difference: every tool is just
a `Tool` with a `definition` and an `execute` method.

The approval gate sits between dispatch and execute. Tools mark themselves
with `riskLevel: 'requiresApproval'` in their `ToolDefinition`; today that
covers `write_file` and `run_command`. The chat surface posts an
`approvalRequest` to the webview, awaits an `approvalResponse` (with a
five-minute timeout that auto-rejects), and feeds the result back into the
loop.

When `sota.chat.autoApproveSafeOperations` is enabled, the gate still emits
an approval event for traceability — it just resolves immediately as
`{ action: 'approve', autoApproved: true }` instead of waiting for the
user.

## Persistence

Conversations and tool surfaces persist through the extension host.

- **Message persistence with sentinels** — when a message is rendered to
  the webview, every tool card, terminal block, and approval card is
  encoded as a base64 payload inside a unique sentinel comment in the
  persisted markdown. Three families exist:
  - `<<<sota:tool>>>` — tool card (decoded back into a card on reload).
  - `<<<sota:terminal>>>` — structured shell metadata (`stdout`,
    `stderr`, `exitCode`). Always immediately follows a `sota:tool`
    sentinel; the renderer pairs them.
  - `<<<sota:approval>>>` — persisted approval state so reloads show the
    same Approve/Reject decision the user made originally.
- The base64 wrapper is the fix for triple backticks in tool output:
  embedding tool output verbatim into a markdown fence breaks the fence
  on any nested triple-backtick block, so the body is encoded once at
  persist time and decoded once at render time.

### Conversation persistence

`ConversationStore` (`extensions/son-of-anton/src/chat/ConversationStore.ts`)
manages multi-conversation history backed by `vscode.ExtensionContext.globalState`.

```
+----------------------------------------------------------+
|  globalState                                             |
|                                                          |
|   sota.conversations.index    -> ReadonlyArray<{id,      |
|                                  title, updatedAt, ...}> |
|   sota.conversations.<id>     -> ReadonlyArray<ChatMessage>
|   sota.conversations.migrated -> boolean (one-shot)      |
+----------------------------------------------------------+
                  ^                                ^
                  |                                |
         list / rename / delete            load / save messages
                  |                                |
+-------------------------------+   +--------------------------+
|  ConversationListProvider     |   |  ChatPanel /             |
|  (Tree view in the chat       |   |  ChatViewProvider        |
|  activity bar; renders the    |   |  (load/save the active   |
|  index)                       |   |  conversation through    |
|                               |   |  a generation-counted    |
|                               |   |  load token)             |
+-------------------------------+   +--------------------------+
```

**Capping policies.** The index is capped at **50 conversations** — when a
51st is added the oldest by `updatedAt` is dropped along with its
per-conversation key. Each conversation's message array is capped at
**500 messages** — older messages are dropped first. Both caps are pure
functions over the existing array so a single index write is enough to
prune.

**Index / message split.** The two-key shape (one index key plus N
per-conversation keys) means rendering the History tree view doesn't have
to read every message of every conversation — only the index. The trade-off
is two writes when a message lands (index `updatedAt` plus the conversation
body) but those writes are cheap and asynchronous.

**Legacy migration.** A single legacy `sota.chatHistory` workspace-state
key from before Phase 47 is imported as a single conversation on first
activation. The migration is gated by a `sota.conversations.migrated` flag
in `globalState` so it runs exactly once even if the user has multiple
workspaces open.

**Race-safe switching.** When the user clicks a different conversation in
the tree view while one is still streaming or loading, `ChatPanel` mints a
generation token before issuing the read. Any in-flight render that
finishes after the token has been bumped is discarded — so messages from
the previous conversation never leak into the new one.

### Checkpoint architecture

`CheckpointManager` (`extensions/son-of-anton/src/checkpoint/CheckpointManager.ts`)
captures a snapshot of the workspace's working tree on every user turn and
lets the user restore it without a manual `git stash` dance.

```
   ChatPanel (user sends message)
       |
       | capture(conversationId, turnIndex, userMessage)
       v
+--------------------------------------+
|  CheckpointManager.capture           |
|  - workspace root is a git repo?     |
|  - `git stash create` (mints a       |
|     stash commit; HEAD untouched,    |
|     working tree untouched)          |
|  - record { id, conversationId,      |
|     turnIndex, gitSha, baseRef,      |
|     userMessage, kind: 'git' }       |
|  - prune index to maxCount           |
+--------------------------------------+
       |
       v
+----------------------------------------+
|  globalState                           |
|   sota.checkpoints.index               |
|     -> ReadonlyArray<Checkpoint>       |
+----------------------------------------+
       |
       |  list() / get(id) / restore(id, options)
       v
   Quick-pick UI / palette commands
       |
       | restore(id, { conversationToo: true|false })
       v
+--------------------------------------+
|  CheckpointManager.restore           |
|  - modal warning ("destructive")     |
|  - `git stash apply <sha>`           |
|  - if conversationToo: rewind        |
|     ConversationStore by dropping    |
|     every message after this turn    |
+--------------------------------------+
```

**Why `git stash create` (not `git stash push`).** `stash create` mints a
stash commit object in the object database without touching the working
tree, the index, or the stash list. From the user's perspective nothing
happens — but we now have a stable SHA we can later replay. `stash push`
would clear the working tree, which is exactly what we don't want at
capture time.

**Index storage.** The store is a flat array under
`sota.checkpoints.index` in `globalState`. Each entry is small (no file
content, just a SHA + metadata) so a flat array scales to the
`DEFAULT_MAX_CHECKPOINTS = 100` cap configured by `sota.checkpoints.maxCount`
(hard ceiling 1000). Past the cap, oldest entries are pruned by
`capturedAt`.

**Garbage collection.** Pruning an index entry leaves the underlying stash
commit dangling in the git object database. Git's reachability GC reaps
unreferenced objects after 30 days by default — acceptable for a feature
that's only ever expected to roll back the last few turns.

**Restore flow.** `restore(id, { conversationToo })` shows a modal warning
(restore is destructive by definition), runs `git stash apply <sha>` to
reapply the captured working tree on top of `HEAD`, then optionally walks
`ConversationStore` to drop every message after `turnIndex`. Callers are
expected to have aborted any in-flight LLM stream before invoking this
method — the chat surface does so before calling.

**Settings.**
- `sota.checkpoints.enabled` (default `true`) — gate the per-turn capture
  entirely. Existing checkpoints remain restorable when disabled.
- `sota.checkpoints.maxCount` (default `100`, max `1000`) — cap on total
  retained checkpoints across all conversations.

**Fallback stub.** A non-git working tree is supported only as a stub
today — `capture()` returns `undefined` cleanly so the chat surface
degrades gracefully (no checkpoints offered) rather than throwing. The
file-backed strategy is reserved for a follow-up phase.

## Settings and secrets

```
+--------------------------+      +--------------------------+
|  Settings (settings.json)|      |  SecretStorage           |
|  Non-secret config       |      |  Provider API keys       |
|  - sota.defaultModel     |      |  - sota.secrets.*        |
|  - sota.foundryEndpoint  |      |    (managed by wizard)   |
|  - sota.mcp.servers      |      +--------------------------+
|  - sota.bedrockProfile   |              |
|  - sota.personality.*    |              |
|  - sota.chat.*           |              |
|  - (apiKey settings as   |              |
|     legacy fallback)     |              |
+--------------------------+              |
              \                          /
               \                        /
                v                      v
              +-----------------------------+
              |  LlmClient.resolveCredential|
              |  1. SecretStorage           |
              |  2. Settings (sota.*)       |
              |  3. Environment variable    |
              +-----------------------------+
```

The setup wizard writes API keys to **both** SecretStorage (canonical) and
the matching `sota.*` setting (so the LLM client sees them without further
changes). `LlmClient` always reads SecretStorage first, so once the wizard
has been used the legacy setting can be cleared safely.

OAuth flows route through `CredentialBroker` (Anthropic, ChatGPT today;
Foundry, Bedrock, and Google reserved for future integrations). The
broker exposes a narrow `ICredentialResolver` interface so the LLM client
can pull a bearer token without knowing how the broker stores it.
