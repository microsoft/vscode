# Son of Anton — Agent Harness Review

**Date:** 2026-05-08
**Reviewer:** Architectural read-through against best-in-class CLI agent harnesses (Claude Code, OpenAI Codex CLI, Aider, Cline, Continue.dev).
**Scope:** `son-of-anton-core/src/agents/`, `son-of-anton-core/src/tools/`, `son-of-anton-core/src/llm/`, `son-of-anton-core/src/personality/`. Cross-referenced with the IDE extension's chat panel and the CLI's runtime adapter.

The premise that started this review — *the best coding-CLI tools win on harness, not just on model* — is correct. Claude Code's strength is roughly 70% harness (system prompts, tool design, context routing, planning loops, retry strategy, error recovery, prompt caching) and 30% model. This review reads the harness against that bar.

## Executive summary

The harness is **architecturally ambitious and structurally healthy** — multi-agent orchestration with dependency-aware fan-out, native tool support across five LLM providers, prompt-cache-friendly system prompt assembly, and a real review-and-retry loop. There are also **three load-bearing gaps** that, if closed, would lift the harness from "good" to "best-in-class":

| # | Gap | Severity | Estimated effort |
|---|---|---|---|
| 1 | **Specialists run text-only LLM calls** — they parse diffs out of markdown instead of using the native tool-use loop the `LlmClient` already supports | **High** — primary differentiator vs. Claude Code/Codex | 1-2 weeks |
| 2 | **No agent-level tool-loop** — every specialist is single-shot. Real agentic work requires a `while not done: model_call → tool_call → tool_result → model_call` loop. | **High** | 1-2 weeks (depends on #1) |
| 3 | **Review feedback is freeform string concatenation** rather than a structured protocol with explicit "what failed / why / next try" fields | **Medium** | 3-5 days |

Everything else is polish around those three.

The rest of this document goes through the harness one layer at a time, calls out what's good, and gives a concrete punch list at the end.

---

## 1. Control flow inventory

### Two distinct paths land in the same `LlmClient`

```
                                                ┌─────────────────────────┐
IDE chat composer  →  extension.ts:675 ────────►│  LlmClient.streamRequest │
                       (passes `tools`)         │  (Anthropic / OpenAI /   │
                                                │   Foundry / Bedrock /    │
CLI sota chat  →  ChatApp →  LlmClient    ─────►│   Gemini / Ollama)       │
                       (no `tools`)             └─────────────────────────┘
                                                            ▲
sota run @handle  →  BaseAgent.runChatTurn  ───────────────┘
                       (no `tools`)
                            │
                            ▼
Orchestrator  ──►  handleChatRequest  ──►  handlePlanCommand  ──►  callLlm  ──►  text
                                                                      │
                                                                      ▼
                                                              parsePlan(JSON)
                                                                      │
                                                                      ▼
                                                              executeSubtask
                                                                      │
                                                                      ▼
                                                              specialist.execute
                                                                      │
                                                                      ▼
                                                              callLlm → text
                                                                      │
                                                                      ▼
                                                              parseFileChanges(diff)
```

Two architecturally meaningful asymmetries fall out of this diagram:

**(a) The IDE chat panel is the only surface that actually exercises the native tool surface.**
`son-of-anton-core/src/llm/LlmClient.ts:485` accepts a `tools` array, and lines 1552 (Anthropic), 1786 (OpenAI), 2035 (Foundry), 2245 (Bedrock), 2495 (Gemini) all map it correctly into provider-specific `tool_use` blocks with input-schema serialisation. The streaming generator yields `tool-call` events with parsed JSON inputs. **But only `extensions/son-of-anton/src/extension.ts:675` actually passes a non-empty tools array.** Everywhere else — `BaseAgent.callLlm`, `BaseAgent.runChatTurn`, `OrchestratorAgent.handlePlanCommand`, every specialist in `son-of-anton-core/src/agents/*.ts` — calls `streamRequest` without tools.

**(b) Specialists generate file changes via markdown diffs, then the host parses them with regex.**
`BaseAgent.parseFileChanges` (lines 328-396) walks the LLM output looking for ```` ```diff ```` / ```` ```patch ```` blocks and `<!-- CREATE: path -->` markers. This is exactly the Aider approach circa 2023, and it's solid for that pattern. But it's not what Claude Code and Codex do — they let the model emit `tool_use` blocks with `apply_patch` / `write_file` parameters, the harness validates and applies them, and the result is fed back as a `tool_result` for the model to react to. The native path is more robust against malformed diffs, supports approval gates trivially, and is what the underlying frontier models are actually trained on.

This isn't a bug — it works — but it means specialists are essentially **single-shot prompt → text → regex extraction → apply** today. The native tool-use loop the IDE chat surface uses is the right path to bring across.

### Orchestrator control flow

`OrchestratorAgent.handleChatRequest` is well-structured:

1. `handlePlanCommand` queries the code-graph (gatherGraphContext), calls Opus by default with the orchestrator's role-description as system prompt, parses the JSON plan out of fenced code, scope-locks files, and emits `plan-proposed`.
2. `handleApproveCommand` runs the **dependency-aware fan-out loop** (lines 360-460). This is genuinely good — it picks the ready set every cycle, dispatches in parallel without `await`, captures results into a `Map`, and uses an event-driven `inFlightDoneResolvers` queue to avoid busy-polling. Cycle detection is correct (no ready + nothing in-flight + remaining → flush as blocked). Cancellation gracefully drains.
3. `handleConversationalTurn` is the right fix for "Hello took 2 minutes" — for trivial prompts, skip plan generation and code-graph entirely. The system prompt gets a Mode appendix telling the LLM to respond conversationally.

### BaseAgent run-turn

`BaseAgent.runChatTurn` (lines 410-465) is the per-specialist entry point. It:

- Builds the system prompt via `buildSystemPrompt` (8 sections, prompt-cache-ordered)
- Streams the LLM call with no tools and no multi-turn loop
- Captures the full text
- Optionally appends a `pickSignOffQuote` quote with a 25% probability gate
- Records a span

A single LLM call, no tool loop, no retry, no reflection. Compare with what Claude Code does:

```
while True:
  call_model(messages, tools)
  if response.has_tool_calls:
    for tc in response.tool_calls:
      result = execute_tool(tc)  # gated by approval policy
      messages.append(tool_result(tc.id, result))
    continue
  if response.text and we_are_done:
    return response.text
```

The harness has `LlmClient.streamRequest` returning tool-call events but no specialist consumes them. Closing this loop is the single biggest harness win available.

---

## 2. System prompt assembly

`BaseAgent.buildSystemPrompt` is **the most refined part of the harness**. It composes 8 sections with `\n\n---\n\n` delimiters as cache boundaries:

```
1. Voice (Phase 78 — character paragraph)
2. Role description (per-agent)
3. Project context (AGENTS.md / CLAUDE.md from host.projectContext)
4. Workspace context snapshot (tree + active files)
5. Project memory (.son-of-anton/memory/ entries)
6. Specialist memory (per-handle KV store)
7. Task instructions  (in user message)
8. Conversation history (in user message)
```

The order is right: most-static at the top → most-dynamic at the bottom, which maximises Anthropic prompt-cache prefix matching. The `---` delimiters give the cache logical break points. **This is a deliberately designed harness, not a thrown-together one.**

The voice / role split is also good architecture. Voice (Phase 78 personas) sets *how* the agent talks before the role sets *what* it does. Role descriptions are pulled from `getRoleDescription()` per agent class — not from `.prompt` files in a separate directory (the Explore agent's inventory was wrong about that). Inlining role descriptions in TypeScript means they version with the code and can be unit-tested.

### Cache health is actively monitored

`son-of-anton-core/src/llm/PromptCacheOptimizer.ts` is an unusually mature piece of infrastructure for a fork-VS-Code project. It:

- Records `cache_creation_input_tokens` and `cache_read_input_tokens` per request
- Computes per-agent cache hit rates and warns below 90%
- Audits prompt structure for cache-busting patterns (timestamps, embedded dynamic content, hash drift across invocations)
- Estimates dollar savings vs. uncached
- Persists metrics to `<workspaceRoot>/.son-of-anton/metrics/cache-metrics-*.json`

The cache audit (lines 128-207) is genuinely clever — it catches the four most common cache-busting patterns automatically:
- Timestamp regexes in the system prompt
- Dynamic content embedded mid-prompt
- System prompt hash changing between same-agent invocations
- Conversation history appearing inside the system prompt

**There's nothing to improve here. This is best-in-class harness infrastructure.**

### One missing piece — `cache_control` is on the system prompt only

At LlmClient.ts:1537 the system prompt gets `cache_control: { type: 'ephemeral' }`, which is correct. But the project context, project memory, and specialist memory blocks are concatenated into that single `text` block. Anthropic supports up to 4 cache breakpoints — splitting into separate `text` parts would let the role description cache independently of the (more dynamic) memory sections, raising hit rates further. That's a 30-minute change worth making.

---

## 3. Tool surface

`son-of-anton-core/src/tools/builtin.ts:390` registers 7 built-in tools:

| Tool | Category | Risk | Notes |
|---|---|---|---|
| `read_file` | read | safe | Up to 50k chars, path validation, no traversal |
| `list_directory` | read | safe | Up to 1000 entries, workspace-relative |
| `search_workspace` | read | safe | Plain-text search, max 50 matches |
| `write_file` | write | requiresApproval | The one most missed by specialists today |
| `run_command` | shell | requiresApproval | |
| `fetch_url` | read | safe | Bounded HTTP fetch |
| `emit_ui_block` | read | safe | Generative-UI primitive (Tier 1) |

**The category × risk matrix is correct** and matches what users expect from approval gates: read tools fire silently, write/shell require approval. The IDE auto-approval policy keys off these categories, and the CLI just shipped the same surface in `cliHost.config.autoApprove.*`.

**Missing tools that best-in-class harnesses ship:**

| Tool | What it does | Why it matters |
|---|---|---|
| `edit_file` (apply-patch flavour) | Take a precise unified diff and apply it surgically, with conflict detection | Aider, Claude Code, and Codex all have this. Avoids whole-file rewrites + diff-parsing fragility. |
| `glob` | Globbing search separate from text-content search | Faster than search_workspace for "find all .ts files in src/" — every harness has a fast-path for this |
| `multi_edit` | Apply N localised edits in one call | Lower per-tool-call latency for sweeping refactors |
| `bash` (with sandbox) | Already exists as `run_command` but Codex CLI's sandboxing approach (read-only-first by default) is worth lifting | Lets agents execute test runs / linting without approval prompts |
| `task` | Spawn a sub-agent | Claude Code's `Task` tool — for delegating side quests so the main agent doesn't pollute its own context |
| `todo_write` / `todo_read` | Persistent focus chain | Claude Code uses this for the visible "I'm working on X" UI; lifts the orchestrator's plan into a tool the model can update mid-flight |

Adding `edit_file` + `glob` first would have the highest impact-per-effort.

### Native tool wiring — the big finding

The harness has the *infrastructure* for tool calls — every provider in `LlmClient` correctly maps the tools array, parses `tool_use` deltas, and yields them as `tool-call` stream events. But the *consumers* aren't wired:

- `BaseAgent.callLlm` and `BaseAgent.runChatTurn` don't accept a `tools` parameter
- `BaseAgent.streamToChat` doesn't either
- The orchestrator's `handlePlanCommand` doesn't pass tools when generating the plan
- Every specialist (`AntonCodeAgent`, `TestWriterAgent`, `ImportAgent`, `CodeGeneratorAgent`, etc.) calls `callLlm` and parses the resulting text for diff blocks

This means the harness is using frontier models in the *least-capable* mode for them. Sonnet 4.7 is trained heavily on tool use; making it write diffs in markdown wastes that training. **The single highest-impact harness change is wiring native tools through `BaseAgent`.**

A skeleton would look like:

```typescript
// in BaseAgent
protected async runToolLoop(args: {
    taskId: string;
    model: ModelId;
    systemPrompt: string;
    initialMessages: LlmMessage[];
    tools: ReadonlyArray<ToolDefinition>;
    maxIterations: number;
    onToken?: (t: string) => void;
    onToolCall?: (call: { name: string; input: unknown; id: string }) => Promise<{ result: string; isError?: boolean }>;
}): Promise<{ text: string; iterations: number; tokenUsage: TokenUsage }> {
    const messages = [...args.initialMessages];
    for (let i = 0; i < args.maxIterations; i++) {
        let text = '';
        const toolCalls: Array<{ name: string; input: unknown; id: string }> = [];
        for await (const event of this.llmClient.streamRequest({
            model: args.model,
            systemPrompt: args.systemPrompt,
            messages,
            tools: args.tools,
            agentHandle: this.handle,
        })) {
            if (event.type === 'token') {
                text += event.token;
                args.onToken?.(event.token);
            } else if (event.type === 'tool-call') {
                toolCalls.push({ name: event.name, input: event.input, id: event.id });
            } else if (event.type === 'complete' && event.stopReason !== 'tool_use') {
                return { text, iterations: i + 1, tokenUsage: this.llmClient.getTokenUsage() };
            }
        }
        if (toolCalls.length === 0) {
            return { text, iterations: i + 1, tokenUsage: this.llmClient.getTokenUsage() };
        }
        messages.push({ role: 'assistant', content: assemble(text, toolCalls) });
        for (const tc of toolCalls) {
            const result = await args.onToolCall?.({ name: tc.name, input: tc.input, id: tc.id }) ?? { result: 'tool not implemented', isError: true };
            messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tc.id, content: result.result, is_error: result.isError }] });
        }
    }
    throw new Error(`Tool loop exceeded ${args.maxIterations} iterations`);
}
```

Specialists then become consumers: `AntonCodeAgent.execute` calls `runToolLoop` with `tools: [READ_FILE_TOOL, EDIT_FILE_TOOL, RUN_COMMAND_TOOL]` and a `onToolCall` that gates each call through the workspace-trust + auto-approval policies the IDE / CLI already enforce.

---

## 4. Memory architecture

The harness has **two complementary memory layers** which is the right shape:

### Project memory (read-mostly, workspace-scoped)

`son-of-anton-core/src/agents/ProjectMemory.ts` loads:
- `<workspace>/CLAUDE.md` (or `.claude/CLAUDE.md`)
- All `.md` files under `<workspace>/.son-of-anton/memory/`

Concatenated into a single "Project Memory" section in the system prompt. Static across a session — the right cache shape.

### Specialist memory (read-write, session-bound, per-handle)

`son-of-anton-core/src/agents/SpecialistMemory.ts` is a per-handle KV store, capped at 30 entries × 500 chars. New entries displace oldest by `updatedAt`. Sorted newest-first when formatted into the system prompt.

**What's good:**
- Explicit cap prevents runaway growth
- Per-handle scoping means `@anton-code`'s preferences don't bleed into `@anton-test`
- Memory writes happen autonomously during normal turns (not gated behind a manual `/memory write`)

**What's missing vs. best-in-class:**
- **No conversation-scoped memory.** SpecialistMemory entries persist across all conversations for that handle. Claude Code's `/memory` is workspace-scoped *and* session-scoped — a memory written during one task doesn't leak into an unrelated task. Today, asking `@anton-code` to write Python in conversation A may leave a memory like "user prefers snake_case" that pollutes a TypeScript task in conversation B.
- **No memory hierarchy.** Project > workspace > specialist > conversation is the right hierarchy; today there are only two levels. Adding "conversation memory" with the same KV shape would close this.
- **No memory sieve.** Specialists write memories but nothing decays / dedupes / rewrites them. After enough sessions a specialist's memory is 30 stale entries. Best-in-class harnesses run a periodic memory-compaction pass (Haiku call: "given these 30 entries and the recent conversations, what 10 are still load-bearing?").
- **No explicit "what should I remember" scaffolding.** Today the system prompt contains specialist memory but doesn't tell the model when to write to it. Aider's harness has explicit `!memorize <text>` / `!forget <key>` directives.

### Memory write protocol — undocumented today

I couldn't find the code path that actually writes specialist memory after a turn. There's `SpecialistMemory.set(handle, key, value, conversationId)` but `BaseAgent.runChatTurn` doesn't call it. So either (a) writes happen in a specialist's `execute()` overrides that I didn't sample, or (b) writes happen via a tool the specialist calls. Worth tracing — if (b), and the tool is a builtin not yet wired, that's another reason to land the native tool loop.

---

## 5. Model routing

`son-of-anton-core/src/llm/ModelRouter.ts` is more sophisticated than most CLI harnesses ship. It defines 13 task categories (planning, code-generation, code-refactoring, test-writing, security-scanning, documentation, exploration, import-changes, simple-completion, lint-suggestion, ci-analysis, pr-generation, review) and supports A/B trial enrolment — comparing modelA vs modelB on success rate, latency, and cost, with a winner emitted once trial quota is satisfied.

**What's good:**
- Category-driven routing matches the Claude routing table (Opus for planning, Sonnet for code, Haiku for exploration)
- A/B trials are how you actually figure out whether Sonnet 4.7 outperforms Opus 4.7 on code-generation for *your* codebase
- Per-trial cost tracking via the cost sink

**What I'd add:**
- **Confidence-driven escalation.** Route a task to Haiku first; if the response is short / uncertain / contains "I'm not sure", retry with Sonnet. This is what Cline's auto-router does. Saves money and gets better answers when the cheap model can handle it.
- **User-overridable, surfaced to the user.** Today the picker in the chat composer overrides at request level; the user has no visibility into which category the orchestrator chose for a given subtask. Logging the routing decision in the trace would help.
- **Budget-aware routing.** When session cost crosses a configurable threshold, downgrade the next request from Opus to Sonnet automatically with a warning banner.

---

## 6. Error handling, retries, timeouts

| Concern | Current state | Best-in-class |
|---|---|---|
| LLM API errors | Caught in `callLlm`, re-thrown, caught in `handleChatRequest`, emitted as error event | ✓ Same |
| Rate-limit retry with backoff | Not at harness level — relies on Anthropic SDK defaults | Cline / Claude Code do exponential-backoff at the harness level with budget awareness |
| Tool execution errors | Tool registry wraps in try/catch and returns `{ isError: true }` | ✓ Same |
| Subtask retry on review failure | Yes — orchestrator appends review feedback as plain text and re-invokes specialist | Best-in-class uses structured feedback (see §7) |
| Circuit breaker | None | Optional but useful — kill switch when N consecutive turns fail |
| Per-turn timeout | None at orchestrator level; provider SDKs enforce their own (~60s) | Codex CLI has a configurable `request_timeout_seconds` |
| Tool execution timeout | Yes for `run_command` (configurable) | ✓ Same |
| Workspace-trust gate | Yes (Phase 65) — separate concern, but worth noting it works | ✓ |

**Gaps to close:**

1. **Add harness-level retry with backoff for 429 / 500 / 503.** Today an Anthropic 529 ("Overloaded") bubbles straight to the user. The harness should retry up to 3× with exponential backoff (1s, 2s, 4s) before giving up.
2. **Add a "consecutive failure" circuit breaker.** If the same specialist fails 3 turns in a row, escalate to the orchestrator with a "this specialist is stuck" event rather than retrying indefinitely.
3. **Add a per-orchestrator-turn timeout.** A user who fires `@anton "refactor everything"` and then loses interest currently has no graceful-shutdown path; cancellation works but a wall-clock 10-minute kill would protect against runaway agents.

---

## 7. Review and feedback

`OrchestratorAgent` runs subtasks through `ReviewAgent` and, on failure, retries the subtask with feedback appended as plain text to the instruction. **This is the single most-improvable piece of the harness.**

**What it does today:**
```
specialist.execute(instruction) → result
if !result.success and retries < max:
  newInstruction = instruction + "\n\nReview feedback:\n" + reviewText
  specialist.execute(newInstruction) → result
```

**What best-in-class does:** structured feedback with explicit fields the model can act on:

```typescript
interface ReviewFeedback {
    overall: 'pass' | 'fail' | 'partial';
    issues: Array<{
        severity: 'blocker' | 'warning' | 'suggestion';
        location?: { file: string; line?: number };
        category: 'correctness' | 'tests' | 'style' | 'performance' | 'security' | 'integration';
        description: string;
        proposedFix?: string;
    }>;
    suggestedNextStep?: string;
    confidenceInRetrySuccess: number;  // 0..1
}
```

When this is structured rather than freeform:
- The agent can target specific issues rather than re-attempting the whole task
- The harness can decide whether to retry at all based on `confidenceInRetrySuccess`
- The user sees a clear "fix these N things" list rather than a wall of review prose
- Specialists can cite the issue id back to the reviewer ("addressing issue #2") for traceability

This is one of the bigger wins available — it's not a model-quality problem, it's a protocol problem.

---

## 8. Token budget management

The harness records token usage in spans (BaseAgent.callLlm, lines 218-228) and PromptCacheOptimizer keeps aggregates. **It does not surface usage to the user during a session, nor does it trim context proactively.**

The summary risk is that a long session (or a `@anton "big refactor"` that explodes into 20 subtasks) can drift into context-window overflow without warning, and the first signal the user sees is a generic Anthropic API error. Three small additions would close this:

1. **Status-bar / TUI status-line cost meter.** Live tick of `$0.42 used · 24% of session budget`. The CLI's status bar already has the slot — this is a 2-hour change.
2. **Pre-call context size check.** Estimate prompt size before sending; if > 150k tokens for Opus, warn user / trim history.
3. **Per-session spend cap with hard kill.** This already exists for the IDE (`sota.spendLimit.session`). The CLI mirror should honour the same cap.

---

## 9. Personality

`son-of-anton-core/src/personality/` and the per-handle `pickSignOffQuote` are unusually polished. The 25%-probability gate (BaseAgent.SIGN_OFF_PROBABILITY) and 50%-probability gate at orchestrator quote-injection points (QUOTE_PROBABILITY) are tuned to land character without becoming tiresome.

**This is a feature, not a flaw.** It's also the harness equivalent of a brand voice — most of the open-source harnesses I cross-referenced have nothing equivalent. Worth keeping.

---

## 10. Specific anti-patterns and dead ends I'd clean up

### 10a. `parseFileChanges` regex is fragile

`BaseAgent.parseFileChanges` (lines 328-396) handles three diff header conventions: `+++ b/path`, `diff --git a/x b/y`, and `--- a/path`. Plus a separate `<!-- CREATE: path -->` marker. This works, but:

- Models don't always emit `+++ b/`; they sometimes emit just `+++ src/foo.ts` without the `b/` prefix
- Models occasionally wrap fences inside fences, breaking the regex
- A subtle path-traversal in the parsed `filePath` is possible (no `../` rejection here; the registry's `read_file` rejects but `parseFileChanges` doesn't)

Once native tools land, this whole function becomes vestigial. Until then, harden the regex against the missing-`b/` case.

### 10b. `Math.random()` for sign-off / quote gates

It's intentional and fine for UX flavour, but mark it with an `// eslint-disable-next-line` and a comment that the intent is non-cryptographic randomness. Easy for a future reviewer to flag as a "should be crypto.getRandomValues" and break the joke.

### 10c. The orchestrator's role description is hardcoded TypeScript

`OrchestratorAgent.getRoleDescription` builds the role prompt with `[].join('\n')`. Fine for now, but as the harness scales this style will be hard to keep diff-friendly. Move to a single `role.prompt` file per agent, loaded at construction time, with the available-specialists list stitched in. Means non-engineers (PMs, designers) can co-author prompts without touching TypeScript.

### 10d. `MetricsTracker` / span system is undocumented

Spans are recorded for every LLM and MCP call, but I couldn't find where they're surfaced. There's a trace pane referenced in BaseAgent comments — verify it's actually wired to a UI or remove the recording overhead.

### 10e. Orchestrator's "presented in full" personality quote fires even on cancellation

Look at `OrchestratorAgent.handlePlanCommand` — `appendQuote(...{ tone: 'dry' })` runs unconditionally at the end. The cancellation paths above return early so this doesn't actually fire on cancel, but the logic is fragile to future edits. Move the quote behind an explicit "did we reach the natural end" gate.

### 10f. No retry budget separate from review-retry budget

The orchestrator's max-retries config is shared between "retry the whole subtask after review failure" and any future "retry a tool call after a transient error". They should be separate budgets — a 3-retry cap on review failures shouldn't burn through the same budget as 3 retries on Anthropic 529s.

---

## 11. Comparison to Claude Code / Codex / Cline / Aider

| Capability | Son of Anton today | Claude Code | OpenAI Codex CLI | Aider | Cline |
|---|---|---|---|---|---|
| Multi-agent orchestration | ✓ Strong | Implicit (Task tool) | ✗ Single agent | ✗ Single agent | ✓ Some (sub-agents) |
| Native tool-use loop | Plumbed but unused by specialists | ✓ Core | ✓ Core | ✗ Diff-parse | ✓ Core |
| Dependency-aware fan-out | ✓ Real | ✗ | ✗ | ✗ | ✗ |
| Prompt-cache infrastructure | ✓ Best-in-class auditing | ✓ Implicit | ✓ Implicit | Partial | Partial |
| System prompt cache ordering | ✓ Deliberately structured | ✓ Same | ✓ Same | ✓ | ✓ |
| Project memory loader | ✓ AGENTS.md + .son-of-anton/memory/ | ✓ CLAUDE.md hierarchy | ✓ AGENTS.md | ✓ .aider.conf | ✓ .clinerules |
| Specialist (per-handle) memory | ✓ Cap'd KV store | ✗ | ✗ | ✗ | ✓ |
| Conversation-scoped memory | ✗ | ✓ | ✓ | ✓ | ✓ |
| Memory compaction / sieve | ✗ | ✓ (semi-automatic) | ✗ | ✗ | ✗ |
| Structured review feedback | ✗ — freeform string | ✓ | ✓ | ✗ | ✓ |
| Model A/B routing trials | ✓ | ✗ | ✗ | ✗ | ✗ |
| Confidence-driven escalation | ✗ | Partial (extended thinking gate) | ✗ | ✗ | ✓ (auto-router) |
| Workspace-trust gate | ✓ | ✓ | ✓ (sandbox modes) | ✗ | ✗ |
| Tool risk × auto-approval matrix | ✓ | ✓ | ✓ | Partial | ✓ |
| Hooks / lifecycle scripts | ✗ | ✓ | ✗ | ✗ | ✗ |
| MCP integration | ✓ | ✓ | ✗ | ✗ | ✓ |
| Per-turn budget / timeout | Partial | ✓ | ✓ | ✗ | ✓ |
| Personality / voice | ✓ | Subtle | ✗ | ✗ | ✗ |

**Summary:** the harness is ahead on multi-agent orchestration, A/B routing, prompt-cache auditing, and personality — and behind on the tool-use loop, structured review, conversation-scoped memory, and confidence-driven escalation. The "ahead" items are differentiators worth defending; the "behind" items are catch-up work that materially improves results on every turn.

---

## 12. Recommended punch list

Ordered by impact-per-effort, ready to be turned into phases:

### Tier 1 — high impact, well-bounded

| # | Phase | Effort | Why it matters |
|---|---|---|---|
| **H1** | Wire `runToolLoop` into `BaseAgent` and migrate `AntonCodeAgent` first | 1 week | Closes the single biggest harness gap. Specialists go from text-parse to native tool calls. |
| **H2** | Add `edit_file` (apply-patch) and `glob` to the builtin tool registry | 2-3 days | Better-than-write_file fidelity for surgical edits; complements H1 |
| **H3** | Replace freeform review feedback with structured `ReviewFeedback` schema | 3-5 days | Lifts retry quality + makes reviews user-readable |
| **H4** | Add structured `<<sota:suggestions>>` emit to system prompts so the TUI's follow-up suggestions are LLM-driven | 1 day | Already wired on the TUI side; closes the loop |
| **H5** | Split system prompt into 3 cache breakpoints (role / project / memory) for a step up in cache hit rates | 0.5 days | Cheap win on Anthropic spend |

### Tier 2 — medium impact, slightly bigger

| # | Phase | Effort | Why it matters |
|---|---|---|---|
| H6 | Conversation-scoped memory layer | 3-4 days | Stops cross-conversation memory bleed |
| H7 | Confidence-driven model escalation (Haiku → Sonnet on uncertainty) | 1 week | Material cost reduction without quality loss |
| H8 | Harness-level retry-with-backoff for 429/5xx | 2 days | Fixes "Anthropic 529" user-visible failures |
| H9 | Per-turn timeout + circuit breaker for stuck specialists | 2 days | Bounded blast radius |
| H10 | Move agent role descriptions to `role.prompt.md` files | 1-2 days | Non-engineers can iterate prompts |
| H11 | Live cost meter in TUI status bar + IDE chat header | 1 day | Visible cost == better user trust |

### Tier 3 — polish

| # | Phase | Effort | Why it matters |
|---|---|---|---|
| H12 | Memory compaction (Haiku-driven sieve every N turns) | 2-3 days | Keeps specialist memory fresh |
| H13 | Add `task` (sub-agent), `todo_write`, `todo_read` builtin tools | 2-3 days | Unlocks Claude-Code-style focus chain |
| H14 | Hooks system (`.son-of-anton/hooks.json` lifecycle scripts) | 3-4 days | Already in CLI plan as Phase CLI9 |
| H15 | Sandbox modes for `run_command` (read-only / approved-paths-only / full) | 3-4 days | Codex CLI parity |
| H16 | Trace pane showing routing decisions + cache stats | 2-3 days | Shipping the data we already collect |

### Tier 4 — strategic

| # | Phase | Effort | Why it matters |
|---|---|---|---|
| H17 | Replace MCP code-graph dependency with the planned Rust embedded graph (docs/rust-codegraph-plan.md) | 4-6 weeks | Removes a single point of failure + unlocks much faster context routing |
| H18 | Multi-modal context (images, PDFs, screenshots) in the harness | 2-3 weeks | Frontier models support it; harness doesn't surface it |

---

## 13. What to do first

If I had to pick the **one** change to land first, it would be **H1 + H2 + H3 as a single batch** — call it Phase H1.

Together they:

- Migrate at least `AntonCodeAgent` (the biggest specialist) to native tool use
- Give it a real `edit_file` instead of the diff-parse fallback
- Replace freeform review feedback with structured fields the agent can target directly

Estimated effort: 1.5-2 weeks. Estimated impact: noticeable improvement in success rate per turn, fewer review-retry cycles, lower token spend per task. **Every other improvement on this list compounds with this one.**

After H1 ships, the harness is genuinely competitive with Claude Code and Codex on the dimensions that matter, and the rest of the punch list is incremental polish.

---

*This review is grounded in direct reads of `BaseAgent.ts` (561 lines), `OrchestratorAgent.ts` (987 lines), `LlmClient.ts` (3448 lines, skimmed for tool wiring + cache control), `ModelRouter.ts` (619 lines), `PromptCacheOptimizer.ts` (344 lines), `tools/builtin.ts` (390 lines), `ProjectMemory.ts` (150 lines), `SpecialistMemory.ts` (211 lines). Cross-referenced with extension.ts:675 (the only caller passing native tools today), the CLI agent stack builder, and architecture commentary in CLAUDE.md.*

---

## Post-implementation status (Updated: 2026-05-10)

The original sections 1-13 above remain architecturally accurate as a description of the codebase before the H-phase work began. Most of the punch list has now landed; this appendix tracks where each item ended up and what abstractions came out of the work.

### What landed

| Phase | Status | Notes |
|---|---|---|
| H1 Native tool-use loop in BaseAgent | ✅ landed | `BaseAgent.runToolLoop` + `CodeGeneratorAgent` migration; IDE activation via `createWorkspaceToolContext` supplied to `AgentStack`. |
| H2 `edit_file` + `glob` | ✅ landed | Surgical anchor-based edit; glob with `*` `**` `?` `{a,b}` `[abc]` syntax. |
| H3 Structured `ReviewFeedback` | ✅ landed | `issues[]` with severity / category / proposedFix; orchestrator skips low-confidence retries. |
| H4 Follow-up suggestions sentinel | ✅ landed | System-prompt instruction + TUI strip + IDE webview chips. |
| H5 System prompt cache breakpoints | ✅ landed | 3-part `SystemPromptPart` with per-part `cache_control`; Anthropic only. |
| H6 Conversation-scoped memory | ✅ landed | `SpecialistMemory.list/get/format` accept `conversationId`; `ChatRequestLike.conversationId` plumbed through the agent bridge. |
| H7 Confidence-driven escalation | ✅ landed | Enabled on `ReviewAgent` + `CiRetryAgent` classifier. |
| H8 Retry-backoff for 429 / 5xx | ✅ landed | `retryableFetch` wrapping Anthropic / OpenAI / Foundry / Gemini streams. |
| H9 Per-turn timeout + circuit breaker | ✅ landed | 5-min default, 3-failure breaker per handle. |
| H10 Role descriptions in `.prompt.md` files | ✅ landed | All 10 specialists migrated; orchestrator's `{{SPECIALISTS}}` and moderniser's `{{CURRENT_PHASE}}` substitutions preserved. |
| H11 Live cost meter | ✅ landed | CLI TUI status bar + IDE chat panel session pill, both with shared formatting. |
| H12 Specialist memory compaction | ✅ landed | Haiku-driven sieve when entries cross `COMPACTION_THRESHOLD = 25`. |
| H13 Todo focus chain | ✅ landed | `todo_write` / `todo_read` tools + TUI checklist + IDE chat checklist. |
| H14 Hooks lifecycle | ✅ landed | Tool-loop scope (`pre-write-file` / `pre-shell-command` / `post-tool-call`); chat-loop hooks (`pre-prompt` / `post-response` / etc.) is a tracked follow-up. |
| H15 `run_command` sandbox modes | ✅ landed | `safe` / `workspace-write` / `unrestricted` with allowlist + git subcommand allowlist. |
| H16 Trace pane | ✅ landed | `sota traces` CLI command + `sota.showHarnessStats` palette command. |
| H17 Rust embedded code-graph | 🚧 user working on | Implementing per `docs/rust-codegraph-plan.md`. |
| H18 Multi-modal context | ⏸️ deferred | `LlmContentPart.image` already plumbed for Anthropic / OpenAI / Gemini; host file-attach UX deferred until specialists actually need image input. |
| IDE H1 activation | ✅ landed | Orchestrator-dispatched specialists fire the native tool path. |
| Direct specialist tool loop | ✅ landed | `@anton-code "fix this"` is now genuinely agentic with inline tool cards. |
| Webview-card approval unification | ✅ landed | Chat panel registers a `requestApproval` handler; agent stack consults the registry, falls back to `defaultModalApproval`. |
| Centralised `cacheOptimizer` + `ModelRouter` | ✅ landed | `LlmClient.setCacheOptimizer` fires per-completion stats; trace panes show real numbers. |
| Direct subscription sign-in (Codex / Claude) | ✅ landed | Palette commands now offer terminal-based CLI login when the `codex` / `claude` binary is detected on `PATH`. |

### Post-implementation architecture (a quick survey)

**Native tool-use spine.** The new shape is `runToolLoop` driving a `ToolExecutionContext` (now with an optional `getConfigValue` accessor for sandbox + hook config), wrapped by `instrumentToolExecutionContext` for hook firing, with `ApprovalRequest` / `ApprovalDecision` carrying enough metadata to unify webview cards and modal prompts. `todo_write` and `todo_read` are factory-bound builtins so each conversation gets its own scratchpad. Composition is deliberately straight: the agent stack supplies the context; the decorator wraps it; the agent calls `runToolLoop`; the loop dispatches via the supplied `executeTool` callback; `BUILTIN_TOOLS` run and call back into the context; the sandbox check intercepts via `getConfigValue`; the relevant hook fires before any side effect. No layer reaches across.

**System prompt assembly.** Prompts are now a `SystemPromptPart` array with optional `cache: 'ephemeral'` markers. `buildSystemPromptParts` splits into three cache-aware blocks: voice + role + project (cacheable), workspace + project memory (cacheable), specialist memory + sentinel instructions (uncached). `LlmClient.streamRequest` threads `systemPromptParts` down to `streamAnthropic`, which emits one `cache_control` block per part. `ChatRequestLike` gained `conversationId` (for scoping specialist memory) and `emitFollowupSuggestions` (for the H4 sentinel). The non-Anthropic providers receive the parts flattened — same semantics, no cache markers.

**Telemetry + escalation.** `PromptCacheOptimizer` and `ModelRouter` are now first-class on `AgentStack` and wired into `LlmClient` via `setCacheOptimizer`, so every completion records cache stats regardless of which agent issued it. Confidence escalation lives in `BaseAgent.callLlm` (`detectUncertainty` + `selectEscalationModel`) and is opt-in per call via `{ escalateOnUncertainty: true }`. `AgentEvent` gained `tool-call` (for the direct specialist tool loop) alongside the existing `ui-block` variant. The new `sota traces` CLI command and `sota.showHarnessStats` palette command surface routing decisions, cache hit rate, and per-handle escalation counts.

### What's next

- **H17** is the only big-shape item remaining — see `docs/rust-codegraph-plan.md`.
- **H18** when an actual specialist needs image input.
- **CLI5** (CLI-side OAuth) once the team is willing to test per-provider OAuth callbacks.
- **CLI7** (binary bundling) once cross-platform CI is set up.
- Smallest next win for someone joining: enable confidence escalation on more specialists (`DocumentationAgent`, `SecurityScannerAgent`) — 2-line change each, immediate cost lift.
- Or: refresh the comparison table in section 11 to mark previously-gap items as parity (the original table was the gap analysis; most rows have closed).
