# Agent Loop Spec

## Architecture

### Core Loop

The agent loop is a stateless function. You give it a conversation, tools, and a model configuration, and it runs the model-call / tool-execution / re-sample cycle until the model produces a final response with no tool calls. It yields events as it goes. That's the entire contract.

```
(conversation, tools, model config) -> AsyncGenerator<Event>
```

The loop itself does not own the conversation history, the session state, or the tool implementations. It receives them and produces a stream of events describing what happened. The caller decides what to persist, what to show the user, and when to stop.

This is the key architectural decision: **the loop is a pure function over a conversation, not a stateful session manager.** Session management, persistence, permissions, and UI are concerns of the caller.

### Event Stream

Everything that happens inside the loop is communicated via a typed event stream. The caller iterates this stream and reacts. Events include:

- Model call started / completed (with usage info)
- Assistant message (text content, tool requests)
- Assistant message deltas (streaming text chunks)
- Reasoning / thinking content (if the model supports it)
- Tool execution started / completed (with results)
- Errors (retryable and fatal)
- Turn boundaries

Events carry enough information for the caller to reconstruct the full conversation state, render a UI, compute costs, or write a transcript to disk. The loop does not decide what gets persisted -- it just emits facts.

### Conversation Format

The conversation is a flat ordered list of messages. Each message has a role (system, user, assistant, tool-result) and typed content. Assistant messages may contain tool-call requests. Tool-result messages carry the output for a specific call.

The conversation format is **provider-neutral** -- it doesn't use any specific provider's types. It's our own format. Translation to/from wire formats happens at the model-provider boundary, not in the core.

Each message carries two important pieces of metadata:
1. **Model identity** -- which model (provider + model ID) produced this message. Always present on assistant messages for provenance (you can trace every response to its source model). Optional on user messages (indicates which model the message targets, useful when model switching is involved). Makes model switching mid-conversation natural (the conversation is inherently heterogeneous) and is essential for debugging.
2. **Provider metadata** -- an opaque bag per message. The provider layer populates this on responses (e.g., encrypted reasoning state, cache tokens, annotations) and replays it on subsequent requests. The core loop passes it through without inspecting it. This is how model-specific data survives round-trips without the core needing to understand it.

The format must support **lossless round-trip translation** to and from each provider's wire format. This means the internal format needs to be rich enough that translating from provider format to internal format and back produces an identical wire payload. The `providerMetadata` bag is the escape hatch -- anything that doesn't map to a core concept lives there, and the provider knows how to serialize/deserialize it.

When the model changes mid-conversation, the new provider's translator is responsible for handling stale metadata from the previous provider. The core doesn't participate in this -- it just passes messages through. The provider decides whether to strip, transform, or ignore foreign metadata.

### Model Provider

A model provider is a pluggable adapter that speaks the loop's internal conversation format and translates to a specific wire API. The provider interface:

- Takes: system prompt, messages (in internal format), tool definitions, config
- Returns: an async iterator of response chunks (text deltas, tool calls, usage info, reasoning content, provider metadata)

Providers are responsible for all wire-format serialization, auth, retry with backoff, and streaming. The loop doesn't know which API it's talking to.

We must support at minimum:
- **OpenAI Responses API** -- the primary target for GPT models
- **Anthropic Messages API** -- the primary target for Claude models
- Additional providers can be added as needed

Provider-specific options (reasoning effort, thinking budget, cache control) are passed via a typed config that the provider interprets. The loop passes them through opaquely. A "variant" or "quality tier" concept maps high-level intent (e.g., "high effort", "low cost") to each provider's specific knobs, so callers don't need to know the provider-specific configuration details.

The provider layer also handles:
- **Model discovery** -- enumerating available models and their capabilities
- **Model selection** -- exposing which models are available for a given configuration
- **Request execution** -- actually making the HTTP requests with appropriate auth

### Tools

A tool has a name, a description, a schema (for the model), and an execute function. The execute function takes validated input and a context object, and returns an output string (plus optional metadata and attachments).

Tools do not know about the loop, the conversation, or the model. They receive input and return output. The loop orchestrates calling them.

The tool context provides: an abort signal, a session-scoped scratchpad for tools that need to coordinate (e.g., a shell tool maintaining a persistent process), and a callback for permission checks.

The tool set is **dynamic**. The caller provides the initial set of tools at invocation time, but the set can change during the loop's execution:
- Tools can be **enabled or disabled** at any point. The caller signals that the available tool set has changed, and the loop picks up the new set on the next model call.
- New tools can be **added mid-turn** (e.g., when an MCP server connects or a plugin is installed). Removed tools stop being offered to the model on the next iteration.
- **External tools** are supported via a callback-based interface. An external tool has the same schema and description as a built-in tool, but its execute function delegates to an external callback provided by the caller. This is how tools that live outside the loop's process (MCP tools, IDE-provided tools, plugin tools) are integrated -- they look identical to the model, but execution is dispatched externally.

The loop does not have a global tool registry -- the caller assembles and manages the tool set. This keeps the loop decoupled from any specific tool implementation.

### Middleware

The core loop is deliberately minimal. Higher-level features are built using a **middleware** system -- composable units that intercept the loop at defined points and can observe or transform the data flowing through.

Middleware points:

- **Pre-request**: runs before each model call. Can modify the messages (e.g., for compaction, truncation, injecting context). Receives the current messages and tool definitions.
- **Post-response**: runs after each model response. Can inspect the response, emit additional events, or signal that a retry is needed.
- **Pre-tool-execution**: runs before each tool call. Can modify tool arguments, skip execution (returning a canned result), or deny the call.
- **Post-tool-execution**: runs after each tool call. Can modify the result before it's fed back to the model.

Middleware is how you implement cross-cutting concerns without polluting the core loop: context compaction, permission enforcement, telemetry, content filtering, secret scanning, streaming UI updates, cost tracking.

This is the key to keeping the inner loop simple while supporting complex behavior. The loop itself is ~100 lines of straightforward orchestration. Everything else is middleware. Middleware units don't know about each other and can be developed, tested, and composed independently.

**Public-facing hooks** (the kind that external consumers or plugins use to extend behavior) are themselves built on top of the middleware system. An "external hooks" middleware delegates to registered external hook handlers at the appropriate points. This means internal features and external extensibility share the same mechanism -- there's no separate extension system to maintain.

### Session (Caller's Responsibility)

The loop is invoked by a session layer that the caller owns. The session layer is responsible for:

- Building the conversation (loading from storage, appending user messages)
- Choosing the model and assembling tools
- Configuring custom instructions (the caller provides instruction content; the loop includes it)
- Iterating the event stream and updating state
- Persisting events and conversation state
- Handling user interaction (permission prompts, abort signals)
- Managing snapshots and undo

The spec does not prescribe the session layer's implementation. It could be an in-memory object, a SQLite-backed store, or a server-side session service. The loop doesn't care.

### Storage Model

Persistence is based on an **append-only JSONL file**. Each line is a self-contained event record. The current state of a session is derived by replaying the event log from the beginning.

This has several implications:

- **History is immutable.** Nothing is ever deleted or overwritten in the file. Operations that logically modify history (compaction, undo, model switching that strips stale metadata) are represented as new events appended to the log. For example, compaction appends a "compaction" event that contains the summarized history; the loop knows to use the compacted version when building messages for the model. The original messages remain in the log for auditability.
- **State is derived, not stored.** There is no separate "current state" that needs to be kept in sync with the log. Loading a session means replaying its event log. In-memory state is a materialized view of the log.
- **Events must be self-describing.** Each event contains enough context to be interpreted without reading other events. This enables streaming, tailing, and partial replay.
- **The format is the API.** External consumers (UI, debuggers, analytics) can read the JSONL file directly. It is the source of truth, not an internal implementation detail.

This model is simple, crash-safe (partial writes lose at most one event), and makes the session trivially serializable and transferable.

### Telemetry

The loop emits telemetry events alongside its functional events. Telemetry is a concern that will be implemented via middleware, but the loop's event stream should carry structured telemetry data from the start: model call durations, token usage, tool execution times, error rates, retry counts. The specifics of telemetry collection, aggregation, and export are not specified here but should be designed from day one so we don't retrofit it later.

---

## Feature List

### P0 -- Core Loop Mechanics

These are required for the loop to function at all.

- **Model call / tool execution / re-sample cycle.** The fundamental loop: call the model, execute any requested tool calls, feed results back, repeat until the model produces a final response.
- **Streaming response support.** The model provider returns chunks; the loop emits delta events as they arrive. Non-streaming mode is a degenerate case (single chunk).
- **Parallel tool execution.** When the model requests multiple tool calls in one response, execute them concurrently (subject to safety constraints -- see P1).
- **Typed event stream.** Every loop action produces a typed event. Events are the only output channel.
- **Abort / cancellation.** The caller can signal abort via an AbortSignal. The loop cancels in-flight model calls and tool executions, emits a final event, and terminates.
- **Error handling and retries.** Transient model errors (rate limits, network errors) are retried with exponential backoff. Fatal errors are emitted as error events and terminate the loop.
- **Provider-neutral conversation format with per-message model identity.** Internal message types that don't leak provider-specific concepts. Each message records which model produced or targets it. Translation happens at the provider boundary.
- **Provider metadata passthrough.** Opaque per-message metadata bags that flow through the loop untouched -- the provider populates them, the loop preserves them, and the provider reads them back on the next request. Enables lossless round-trip fidelity for provider-specific data.
- **Multi-provider model support.** Built-in support for OpenAI Responses API and Anthropic Messages API. The provider abstraction supports additional providers.
- **Model switching mid-conversation.** The model can change between turns. The conversation format supports heterogeneous model provenance. The incoming provider handles stale metadata from the outgoing provider.
- **Model discovery.** The provider layer can enumerate available models and capabilities, and expose this to callers.
- **Middleware system.** Composable interception points (pre-request, post-response, pre-tool, post-tool) that allow features to observe and transform loop data without modifying the core.

### P1 -- Essential Infrastructure

Required for a useful agent, but layered on top of the core loop via middleware and caller-side infrastructure.

- **Context window management.** A pre-request middleware that monitors token usage and triggers compaction or truncation when the context window fills. Strategy: first prune large tool outputs (keep recent output verbatim, replace older output with short summaries), then if still over budget, summarize the older portion of the conversation via a side LLM call. Compaction preserves recent messages verbatim.
- **Permission system.** A pre-tool-execution middleware that checks tool calls against a permission policy. Policies specify allow/deny/ask per tool and argument pattern. "Ask" suspends the loop and waits for user approval via a callback. The loop itself is not aware of permissions -- it just executes whatever the middleware allows through.
- **Tool output truncation.** Large tool outputs are automatically truncated before being fed back to the model, with a note indicating truncation.
- **Sub-agent invocation.** A tool that spawns a nested invocation of the loop with its own conversation, tools, and model config. Returns the sub-agent's final output to the parent. The simplest form of multi-agent: synchronous subroutine calls with isolation.
- **Custom instructions.** The caller provides custom instruction content which is injected into the system prompt. The instructions themselves are loaded and assembled externally (from repo files, user preferences, organization policies, etc.); the loop just includes what it's given. Skills and custom agent definitions are similarly configured from outside -- the caller resolves them and provides the relevant content.
- **Dynamic tool management.** The caller can enable, disable, add, or remove tools during the loop's execution. The loop picks up changes on the next model call. External tools (backed by a caller-provided callback) are supported as first-class tool definitions.
- **Turn tracking.** Events carry turn numbers so the caller can segment the conversation into user-initiated turns.
- **Usage metrics.** Token counts (input, output, reasoning, cached) emitted per model call for cost tracking.
- **Reasoning / thinking support.** The event stream has first-class events for reasoning content (deltas, summaries). The conversation format can represent reasoning parts. Provider metadata preserves reasoning continuity state across turns.
- **Tool call validation.** The loop validates tool call arguments against the tool's schema before executing. Malformed calls get a structured error fed back to the model rather than crashing.
- **Configurable tool parallelism.** Tools declare whether they're safe to run concurrently. Mutating tools (file writes, shell commands) serialize by default; read-only tools (grep, glob, file read) run in parallel. A simple "read-safe vs exclusive" model is sufficient.

### P2 -- Production-Grade Features

Important for real-world usage. Can be added incrementally.

- **Workspace snapshots.** Caller-side infrastructure that captures workspace state at defined boundaries (per model-call step for maximum precision). Enables undo/revert to any snapshot point. A shadow git approach (separate git directory, lightweight tree objects, diff between tree hashes) avoids polluting the user's repo history.
- **Edit tracking.** Capture file baselines before modifications and compute diffs after. Store diffs with events for UI display and undo.
- **Rate limit awareness.** Track rate limit headers, emit events when limits are approached, and back off proactively. Share rate limit state across concurrent sub-agent invocations.
- **Streaming intent extraction.** A post-response middleware that extracts the assistant's intent from streaming text (what it's about to do and why) for real-time UI display.
- **Public-facing hooks.** An external extension point built on top of the middleware system. External consumers register hook handlers that fire at defined points (post-tool, post-turn, etc.). Hooks can observe but may have more limited transformation capabilities than internal middleware.

### P3 -- Advanced / Future

Valuable but not on the critical path. Implement when needed.

- **Concurrent sub-agents.** Extend sub-agent support from synchronous to concurrent: spawn multiple agents, send them messages, wait for any/all to complete. Full lifecycle management (spawn, send, wait, close, resume).
- **Agent roles / specializations.** Named agent configurations (tools, permissions, instructions, model) that can be applied to sub-agents. E.g., a read-only "explorer" role, a "coder" role with edit access, a "reviewer" role.
- **Context forking.** When spawning a sub-agent, optionally copy the parent's conversation history so the child starts with full context.
- **Agent resume.** Serialize a sub-agent's conversation state to disk. Resume it later with new instructions. Enables long-lived agent pools.
- **Sandbox enforcement.** OS-level sandboxing for tool execution. The permission system provides application-level guardrails; sandboxing provides kernel-level enforcement.
- **Server-side session support.** When the API supports server-managed conversation state, delegate history management to the server. The loop sends turn deltas instead of full history.

---

## Notes & Ideas

### The conversation format is the hardest problem

This is the single most consequential design decision. There are three approaches seen in existing agents:

1. Use one provider's wire format as the internal format (maximum fidelity for that provider, zero translation, but locked to one API)
2. Use one provider's format as a universal format with translation layers to/from others (maximum compatibility, but lossy -- and the projects that took this approach are actively trying to migrate away from it)
3. Delegate to an SDK that owns the abstraction (no format ownership, but tied to the SDK's update cycle and design decisions)

The recommended approach: **own a provider-neutral format, but make it rich enough that translation is lossless.** The `providerMetadata` bag is the key mechanism -- rather than trying to model every provider's unique fields, let providers attach opaque data that round-trips through the system. The core never inspects it; the provider serializes/deserializes it. This gives fidelity without coupling.

This is a non-trivial design challenge. The internal format needs to represent: text content, tool calls and results, reasoning/thinking blocks, images and files, and system instructions -- all in a way that translates cleanly to both the OpenAI Responses API input format and the Anthropic Messages API format. Getting this right early prevents painful migrations later.

### Middleware is the key architectural insight

The pattern of composable interception points that can both observe and transform data flowing through the loop is more powerful than either minimal post-hoc hooks or a pub/sub event bus. Interception points can modify the data flow (transform messages before they hit the model, deny tool calls, alter tool results). An event bus can only notify.

This model also separates concerns cleanly. Compaction is a pre-request middleware. Permissions are a pre-tool middleware. Telemetry is a post-response middleware. They don't know about each other and can be developed independently.

Most importantly, the middleware system means the core loop stays trivially simple. The loop is just: call model, execute tools, repeat. All sophistication lives in composable middleware units that wrap it.

### Per-message model identity

Storing the model identity on each message costs almost nothing and provides valuable provenance -- you can always see which model produced each response. It also makes model switching natural: the conversation is inherently heterogeneous, not tied to a single model. This should be a first-class part of the data model, not an afterthought.

### Step-level snapshots for undo

The finest useful granularity for workspace snapshots is per model-call step -- snapshot before and after each API call within a turn. Coarser granularity (per-turn or per-user-message) groups too many changes together, making it impossible to undo a single bad edit without losing subsequent good ones.

A shadow-git pattern (separate git directory, lightweight tree objects via write-tree, diff between tree hashes) is the right approach -- it avoids polluting the user's repo history and tree operations are very fast.

### Tool state is not loop state

Persistent tool state (e.g., a shell process that lives across multiple tool calls) is the tool's concern, not the loop's. The loop provides a session-scoped context scratchpad, and tools use it to manage their own state. This keeps the loop clean and tools portable.

### Compaction strategy

Two-phase compaction works well:

1. **Prune tool outputs.** Walk backwards through tool results. Keep the most recent output verbatim; replace older tool outputs with a short summary. This is cheap (no LLM call needed) and handles the biggest context consumers.
2. **Summarize conversation.** If pruning isn't enough, make a side LLM call to summarize the older portion of the conversation, preserving recent messages verbatim.

Compaction should be middleware, not built into the loop. Different deployments may want different strategies.

### Start simple with multi-agent

Start with the simplest useful form of multi-agent: a sub-agent tool that makes a synchronous nested call to the loop. This gives most of the benefit (delegation, specialized roles, context isolation) with minimal complexity.

The transition from synchronous sub-agent calls to full concurrent lifecycle management (spawn, send, wait, close, resume) is an additive change -- you add a manager on top, not refactor the core. Don't build the concurrent model until you need it.

### Named quality tiers for reasoning

Every provider handles reasoning/thinking differently -- different parameter names, different value spaces, different semantics. Rather than exposing provider-specific knobs, define named quality tiers (e.g., "low", "medium", "high") that map to each provider's specific configuration. Callers pick a tier; the provider translates it. This keeps provider-specific knowledge out of the calling code.
