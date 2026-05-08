# Son of Anton — Uplift Plan

Prioritized recommendations for chat-sidebar UI uplift, a CLI "organ"
that shares the IDE's brain, and AI embodiment for the ten specialists.
Grounded in internal research notes and the current Son of Anton
codebase.

> **Status:** strategy / planning. No code in this document. Phase
> numbers continue from where Phase 57 left off.

## 1. Executive Summary

The reference architecture for an AI editor is, structurally, the
same kind of beast as Son of Anton: a single agent core (Controller
/ specialists / hooks / MCP) that is re-hosted across surfaces — a
VS Code extension, a headless CLI, the Agent Client Protocol, and
other host shells. We are currently single-host (the `son-of-anton`
extension) and the agents are abstract handles (`@anton-code`,
`@anton-test`, …) with no visual presence beyond a markdown name on
a streaming reply. Three moves close the gap:

1. **UI uplift on the existing chat sidebar** — pull in the most
   load-bearing affordances established by other AI editors (visual
   checkpoint markers in the transcript, plan/act mode toggle,
   `@problems`/`@url`-style mentions, focus-chain checklists,
   conversation export, trusted-folder UX, agent-driven welcome)
   without rewriting `ChatPanel.ts`.
2. **A CLI as an organ, not a peer** — a `son-of-anton-cli/` package
   that loads the **same** orchestrator, agent stack, conversation
   store, and checkpoint manager as the extension by sharing them
   through a file-backed `~/.son-of-anton/data/` store. Same brain,
   different body. The CLI is what an agent "feels like" outside VS
   Code; it is also the substrate for CI, scripting, and a future
   ACP / BYO-agent path.
3. **AI embodiment** — give each specialist a colour, an avatar, a
   short-form character voice, a "where they live" surface (a
   roster panel that breathes), and visible handoff animations when
   `@anton` dispatches to `@anton-code`. The specialists stop being
   prompt strings and start being *characters in the IDE*.

Together these are 17 phases (58 → 74). The CLI work is the largest
single bet; the embodiment work has the highest user-perceived ROI.

---

## 2. UI Uplift Recommendations

Phase numbers are sequential so they can be `/loop`ed. Effort is
S = ≤1 day, M = 2–4 days, L = 5–10 days. "Where" lists the primary
files; tier (per `CLAUDE.md`) is mostly Tier 1 because the chat
extension is a Son-of-Anton-owned module.

### P0 — Foundational chat surface upgrades

**P0 · Plan / Act mode toggle in the composer (Phase 58)**
- *What:* Add a two-state pill (`Plan` / `Act`) above the composer.
  Plan mode forces the orchestrator into "plan only, no tool calls"
  using a system-prompt variant; Act mode is today's behaviour. An
  established pattern is to treat this as a first-class affordance
  (a `Controller.togglePlanActMode`-style method) with plan vs act
  modes as a dual-mode API config.
- *Why:* Today the orchestrator always commits to a plan + dispatch
  in one turn. Users who want a cheap design conversation are paying
  for the full agent loop. A Plan toggle is also the right surface
  for a "different model in plan vs act" feature later (a
  `getModeSpecificFields`-style hook).
- *Where:* `extensions/son-of-anton/src/chat/ChatPanel.ts` composer
  HTML (~line 2202 `getHtmlContent`) and message handler
  (`startStreamingMessage`); new `planMode` flag on `ChatSession`;
  branch in `OrchestratorAgent.handleChatRequest`.
- *Effort:* M. *Tier:* 1.

**P0 · Visual checkpoint markers in the transcript (Phase 59)**
- *What:* Today checkpoints are emitted as `checkpointsLoaded` pills
  attached to user messages but they're easy to miss. Add a slim
  horizontal "checkpoint stripe" rendered between turns, with a
  hover popover showing the captured user message, the diff summary,
  and inline `Compare` / `Restore workspace` / `Restore all`
  buttons (already wired through `handleCheckpointCompare` /
  `handleCheckpointRestore` in `ChatPanel.ts:1146-1191`).
- *Why:* Checkpoints are user-visible turning points — git-backed
  snapshots to compare/restore. Ours are already captured every turn
  via `CheckpointManager.capture` — the value is wasted because the
  surface is a small pill. Make turning points feel like turning
  points.
- *Where:* `extensions/son-of-anton/src/chat/ChatPanel.ts` (renderer
  + `checkpointsLoaded` handler around line 670, sentinel dispatch
  at lines 2776+); `extensions/son-of-anton/media/chat.css` (new
  `.checkpoint-stripe` rules).
- *Effort:* M. *Tier:* 1.

**P0 · Inline tool-result review with edit-before-feedback (Phase 60)**
- *What:* When a tool result arrives, the user can click "Edit
  result" on the tool card and amend the JSON / text before the next
  LLM turn reads it. This is a natural extension of the
  approval-card pattern combined with human-in-the-loop tools
  positioning — file writes, terminal commands, browser actions, MCP
  calls all flowing through approval flows.
- *Why:* Once a bad tool output enters context, the rest of the
  conversation rationalises around it. Letting the user redact /
  truncate / annotate before the next turn cheaply prevents a
  multi-turn slide.
- *Where:* `ChatPanel.ts` tool-card render path
  (`tool-card` HTML around line 3076–3086), tool sentinel decode
  block (line 2776+), new `toolResultEdited` postMessage; touch
  `ChatSession`'s tool dispatch loop so the *edited* result, not the
  original, is what feeds the next LLM turn.
- *Effort:* M. *Tier:* 1.

**P0 · `@problems`, `@url`, `@terminal` mentions in the composer (Phase 61)**
- *What:* Extend our existing `@file` / `@folder` mention popup to
  include three new sources: current diagnostics (`@problems`), an
  arbitrary URL fetched server-side (`@url <link>`), and the active
  terminal's recent output (`@terminal`).
- *Why:* An industry-standard set of `@` mentions (`@file`,
  `@folder`, `@url`, `@problems`, etc.) lets users steer context
  without burning turns on implicit searches. These are the highest-
  ROI keystrokes the user can type — every `@problems` is a search
  tool call we don't have to spend.
- *Where:* `ChatPanel.ts` composer popup (search by string
  `getCommandList()` and the `@` mention handler — same plumbing as
  files), `WorkspaceContextProvider.ts` extended with `getProblems()`
  / `getTerminalCapture()`; new minimal `UrlFetchTool` in
  `src/tools/builtin.ts` (gated by allowlist).
- *Effort:* M. *Tier:* 1.

### P1 — Discoverability and trust

**P1 · Focus-chain progress checklist (Phase 62)**
- *What:* When the orchestrator emits a plan, render an interactive
  checklist at the top of the assistant message that ticks subtasks
  off as `subtask-completed` events arrive. On click, scroll to that
  subtask card; on right-click, "Re-run from here".
- *Why:* A `FocusChainSettings`-style affordance and task progress
  checklists in tool outputs are the visible proof that the agent
  has a plan it's actually executing. Our `plan-proposed` +
  `subtask-started` events already carry the data; we just don't
  render a master view of them.
- *Where:* `ChatPanel.ts` plan/subtask card renderer (search for
  `plan-card` / `subtask-card`); webview JS state machine that
  consumes `AgentEvent`s.
- *Effort:* M. *Tier:* 1.

**P1 · Side-by-side diff for tool writes (Phase 63)**
- *What:* When a `write_file` tool card resolves, replace the inline
  unified diff with a "View diff" button that opens VS Code's
  native diff editor (left: pre-write, right: post-write). On
  reject, the diff editor stays open as a scratch.
- *Why:* Diff-based edits with a linter/diagnostic feedback loop so
  the model can repair mistakes is a quality-of-life win. Our
  existing `handleCheckpointCompare` already proves the plumbing (it
  calls `vscode.diff` with a `git:` URI); the new path is the same
  idea on a single tool call.
- *Where:* `ChatPanel.ts` (new `openWriteDiff` postMessage handler);
  `src/tools/builtin.ts` `write_file` impl exports the pre-image as a
  `git:`-style URI for the diff editor.
- *Effort:* S. *Tier:* 1.

**P1 · Conversation export / share (Phase 64)**
- *What:* "Export conversation" command in the chat header overflow
  menu. Outputs a single Markdown file with: full transcript,
  decoded tool cards, the plan/subtask tree, cost meter snapshot,
  and a manifest of file paths the agents touched.
- *Why:* Task history with reconstruction (a
  `reconstructTaskHistory`-style command) is established practice,
  but a clean "send to a colleague" surface is rare. We can leapfrog.
  Useful for bug reports, post-mortems, design docs.
- *Where:* New file `extensions/son-of-anton/src/chat/ConversationExporter.ts`
  (read from `ConversationStore`, decode sentinels per the format
  documented in `docs/architecture.md`), command registration in
  `extension.ts`.
- *Effort:* S. *Tier:* 1.

**P1 · Trusted-folder gate (Phase 65)**
- *What:* On first open of any new workspace folder, prompt the user:
  "Allow Son of Anton agents to read and edit files in
  `<workspace>`? You can scope to subdirectories." The decision
  persists per-folder. Untrusted = chat works but `write_file` /
  `run_command` are hard-disabled.
- *Why:* A "trusted folders" narrative is sharper than a
  project-local deny-file (which is a deny-list pattern). Trust and
  sandboxing — trusted folders plus sandbox docs — complements a
  deny-file plus approvals and tells a stronger enterprise story.
  Worth the small UX tax for the security posture and the
  enterprise-readiness story.
- *Where:* New `extensions/son-of-anton/src/security/TrustedFolders.ts`,
  hook into `extension.ts` activation, gate in `ToolRegistry` for
  `requiresApproval` + write tools.
- *Effort:* M. *Tier:* 1.

**P1 · "Task" header for the active turn (Phase 66)**
- *What:* While the orchestrator is running, render a sticky header
  at the top of the chat: agent avatar, task name (first line of
  the user message), elapsed time, token count so far, "Stop"
  button. Hide when idle.
- *Why:* The `Task` is a first-class concept in modern agent
  architectures; the UI makes the in-progress task feel "in flight".
  Today our running indicator is buried in the cost meter pill.
- *Where:* `ChatPanel.ts` (new `.active-task-header` block in HTML
  template, driven by `streamingMessageStarted` / `streamingMessageEnded`
  postMessages).
- *Effort:* S. *Tier:* 1.

### P2 — Polish

**P2 · `.son-of-anton/AGENTS.md` project-context file (Phase 67)**
- *What:* On first activation in a workspace that has no
  `CLAUDE.md` / `AGENTS.md`, offer to scaffold one with sections for
  "How this codebase wants to be edited", "Forbidden patterns",
  "Specialist hints". Read on every turn and spliced into the system
  prompt budget (after CLAUDE.md, before workspace context).
- *Why:* `AGENTS.md` is becoming an industry-standard convention
  for project context. Single-file simplicity wins for adoption
  versus a directory of rule fragments.
- *Where:* `WorkspaceContextProvider.ts`; new
  `extensions/son-of-anton/src/agents/AgentsMdLoader.ts`.
- *Effort:* S. *Tier:* 1.

**P2 · Per-message hover details (Phase 68)**
- *What:* Hovering over an assistant message shows: which model
  served it, latency, input/output/cache tokens for that turn, and
  the specialist handle that produced it. Click → "Re-run with
  different model".
- *Why:* Usage and cost tracking for API tasks is typically
  per-task; per-message attribution is a debugging superpower. We
  already track this in `CostReporter` / `MetricsTracker` but only
  surface aggregates.
- *Where:* `ChatPanel.ts` (`buildAssistantMeta` around line 3255 —
  attach `data-token-*` attrs); new hover popover in `chat.css`.
- *Effort:* S. *Tier:* 1.

**P2 · Animated handoffs between specialists (Phase 69)**
- *What:* When the orchestrator dispatches a subtask to
  `@anton-code`, render a brief animated banner ("Anton → Anton
  Code: refactor the auth module") in the transcript before the
  specialist's stream begins. Coloured by both agents' palette.
- *Why:* Today specialist handoffs are visually identical to a fresh
  message — the user can't see *why* a different name suddenly
  appears mid-conversation. Embodies the orchestrator-as-conductor
  story.
- *Where:* `ChatPanel.ts` `subtask-started` handler; new HTML
  template `.handoff-banner` keyed by from/to specialist ids.
- *Effort:* S. *Tier:* 1.

**P2 · Welcome hero animation refresh (Phase 70)**
- *What:* The Pied Piper banner is great. Add a subtle compress-
  decompress shimmer keyed off the daily quote, and surface "Recent
  conversations" + "Active agents" as live cards in the hero (not
  just static CTAs).
- *Why:* The empty-state is the most common surface for new users;
  current static CTAs miss the chance to advertise that the agents
  *exist as characters*.
- *Where:* `ChatPanel.ts` empty-state block (search `Pied Piper`),
  `siliconValleyQuotes.ts` already has tone tags we can use.
- *Effort:* S. *Tier:* 1.

---

## 3. CLI Architecture Proposal

### Goal — what the CLI is and isn't

The Son of Anton CLI is **not** a standalone replacement for the
extension. It is *the same agent core, hosted in a terminal*. Anything
the extension can do (orchestrator, all ten specialists, tool calls,
MCP servers, checkpoints, conversation store, cost meter) the CLI can
do — using the same configuration, the same conversations, and the
same secrets. The shell is just a different "body" for the same
"brain".

Concretely this means: a user can start a task in the IDE, close VS
Code, run `anton --continue` in their terminal, and the agent picks
up exactly where it stopped — same conversation id, same checkpoint
chain, same MCP server connections.

This is the established pattern for shared-core CLIs: the CLI is not
a separate agent rewrite; it is a different host for the shared
agent core.

### Topology

A new top-level package `son-of-anton-cli/` (sibling of
`extensions/son-of-anton/`). Distributed as:

- `npm i -g @sota/cli` → installs `anton` (and `sota` alias) on PATH.
- An optional bundled binary via `pkg` for CI environments without
  Node, lower priority.

Why a sibling package, not under `extensions/`: the CLI must run
without VS Code at all. Extensions only run inside an extension
host. The shared brain has to be lifted into a third package
(`son-of-anton-core/`) that both consume.

```
+-------------------------------+   +-------------------------------+
| extensions/son-of-anton/      |   | son-of-anton-cli/             |
|  (VS Code host: webview,      |   |  (terminal host: ink TUI,     |
|   chat sidebar, palette)      |   |   plain-text mode, JSON mode) |
+--------------+----------------+   +---------------+---------------+
               |                                    |
               |    both depend on (workspace pkg)  |
               +-----------------+------------------+
                                 |
                                 v
                  +-------------------------------+
                  | son-of-anton-core/            |
                  |  AgentStack, Orchestrator,    |
                  |  specialists, ToolRegistry,   |
                  |  ConversationStore,           |
                  |  CheckpointManager, McpClient,|
                  |  LlmClient, CostReporter      |
                  +-------------------------------+
                                 |
                                 v
                       ~/.son-of-anton/data/
                        conversations/<id>.json
                        checkpoints/index.json
                        secrets/*.enc
                        mcp-settings.json
```

This refactor — pulling `AgentStack` and friends out of
`extensions/son-of-anton/src/agents/` into a shared package — is the
biggest one-time cost in the CLI work and lands as Phase 71 (see
phasing).

### Process model — three options, one recommendation

All three options have been evaluated in the wider AI-editor
ecosystem; we should learn from the consensus answer.

**Option (a): CLI attaches to a running IDE instance via IPC.**
- *Pros:* Same in-memory state, no double-spend on workspace
  indexing, instant cost-meter sync.
- *Cons:* CLI is unusable when VS Code isn't running (which is
  the most common CLI use case — quick `git diff | anton review`
  in a tmux pane). Tight coupling to upstream extension-host
  lifecycles.
- *Verdict:* No. This is exactly the design rejected by mature
  shared-core implementations, which instead use the same
  `Controller` core directly — sharing `Controller`,
  `StateManager`, `Task`, API handlers, hooks, and most
  integration code.

**Option (b): Headless extension host.**
- *Pros:* Reuses every extension contribution unchanged.
- *Cons:* Heavyweight startup (≥2 s), pulls in every other
  built-in extension, and crucially requires the upstream VS Code
  extension-host bootstrap which is Tier 3 territory. Also, the
  webview-based chat panel doesn't render in a terminal.
- *Verdict:* No.

**Option (c): Direct Node process loading the same modules
(RECOMMENDED).**
- *Pros:* Fast startup, no upstream coupling, same behaviour
  everywhere because it's literally the same TypeScript modules
  imported. Matches the established pattern verbatim — wire a
  `CliWebviewProvider`, `FileEditProvider`,
  `StandaloneTerminalManager` via `HostProvider.initialize` and
  reuse the rest.
- *Cons:* Requires the `son-of-anton-core/` extraction first;
  certain VS Code APIs (`vscode.window.showInformationMessage`,
  `vscode.env`) need shim implementations for terminal contexts.
- *Verdict:* Yes. The shims are 200-ish LoC of glue
  (`SecretStorage` via OS keychain, `WorkspaceFolders` from
  `process.cwd()`, `window.showQuickPick` via Ink) — exactly the
  pattern a `cli/src/vscode-shim.ts` file would implement.

### Authentication

**Reuse the same credential surface as the extension, but read it
from a file-backed location both can see.**

- Extension today: secrets live in `vscode.SecretStorage`. That's
  process-scoped to the extension host — the CLI can't read it.
- Move canonical credential storage into `~/.son-of-anton/data/secrets/`,
  encrypted at rest using the OS keychain (Keytar on macOS / Linux,
  Credential Manager on Windows) for the symmetric key. The
  extension's existing `CredentialBroker` reads / writes here; a
  thin shim continues to expose `SecretStorage`-shaped reads inside
  the extension so existing call sites don't change.
- For environments without a keychain (Docker, CI), fall back to a
  plaintext file with `chmod 600` and a startup warning.
- For subscription / OAuth provider paths (Phase 33 already
  prototypes Anthropic OAuth and ChatGPT/Codex OAuth), the OAuth
  callback port is fixed (we should pick a number deliberately to
  avoid collisions and document it). The CLI can complete an OAuth
  flow standalone — it just opens the browser via the `open`
  package, runs a tiny localhost server, collects the code,
  exchanges for tokens, persists.

### Command surface

```
anton                       # interactive Ink TUI: same chat surface, same
                            # specialists, same MCP, in the terminal.

anton chat                  # explicit alias.

anton run @anton-code "fix the bug in src/foo.ts"
                            # one-shot specialist invocation. Streams to
                            # stdout. Exit code 0/1 for success/error.

anton plan "refactor the auth module"
                            # orchestrator runs in plan-only mode (Phase 58
                            # plan/act toggle), prints a JSON or markdown
                            # plan and exits without dispatch.

anton --continue            # resume the last conversation in this cwd.

anton --task <id>           # resume a specific conversation by id.

anton history               # paginated conversation list (Ink), same
                            # data as the IDE History sidebar.

anton checkpoints           # list/restore checkpoints (same
                            # CheckpointManager backing).

anton tools list            # show built-in tools + MCP-bridged tools.
anton tools call <name> --json '{...}'
                            # invoke a tool directly (tests, scripts).

anton mcp add <name> --command '<cmd> [args...]'
anton mcp list / remove <name> / restart <name>
                            # mirror the Phase 55 MCP UI in the terminal.

anton config                # interactive Ink settings view, same fields
                            # as the in-chat Settings panel.

anton auth                  # interactive provider wizard: API keys, OAuth
                            # for Anthropic / ChatGPT, validation smoke
                            # test (mirrors SetupWizardPanel.ts).
anton auth -p anthropic -k sk-ant-... -m sonnet
                            # quick non-interactive auth pattern.

anton --json                # streaming JSON line output (one event per
                            # line: token / tool-call / plan-proposed /
                            # subtask-started / cost / final). Required
                            # for piping into other tools.

anton --acp                 # Agent Client Protocol mode (stdio JSON-RPC,
                            # ndjson). Future-proofing for ACP-compatible
                            # editor and harness integrations.

anton --yolo                # auto-approve everything, plain-text mode.
                            # For CI. Counts mistakes and bails after
                            # max-consecutive-mistakes (an established
                            # pattern).
```

Note on flag style: `--plan` / `--act` mode flags plug into the same
Phase 58 toggle in the IDE — the *same* state, different surface.

### Streaming output

The CLI has three output modes, selected automatically (overridable):

1. **Ink TUI (`anton` with TTY stdout):** Streaming tokens render
   into a moving message block; tool cards render as collapsible
   boxes; plan and subtask cards render as tree-shaped hierarchies;
   cost meter pinned to the footer line. Specialist avatars (see
   §4) become foreground colour + ASCII glyph (`◆` code, `◊` test,
   `▲` security, …).
2. **Plain text (`anton run` / non-TTY / piped stdout):** Strip
   markdown to plaintext. Final assistant text → stdout. Tool calls,
   plan, progress → stderr (so a pipe sees only the answer). Mirrors
   a `runPlainTextTask`-style implementation.
3. **JSON Lines (`--json`):** Every `AgentEvent` emitted is a single
   line with `type`, payload, and a millisecond timestamp. Schema
   documented in `docs/cli-json-protocol.md` (to be written in
   Phase 73). Parallel to a man-page reference (e.g. `man/anton.1.md`).

### Cross-process state sharing

The single source of truth is `~/.son-of-anton/data/`. Both extension
and CLI use the same `ConversationStore` /
`CheckpointManager` / `McpServerRegistry` modules from
`son-of-anton-core/`, just pointed at this directory.

Concurrency rules:
- **Conversations:** advisory file lock per conversation
  (`<id>.lock`). Last writer wins on contention; both surfaces emit
  a `conversationConflict` event so the UI can show a "Reload — the
  CLI modified this conversation" banner.
- **Checkpoints:** append-only index. Cheap; rare contention.
- **Cost meter:** per-process counter that *also* persists to
  `~/.son-of-anton/data/cost-ledger.json` on every flush. UI reads
  the persisted aggregate, not just its in-process counter.
- **MCP servers:** the CLI does *not* attach to MCP servers spawned
  by the extension. Each surface spawns its own — same config, same
  binaries, parallel processes. Cheap. Rationale: stdio is single-
  consumer, and shared MCP state would require an extra IPC layer.

This is the established pattern: export native storage to a shared
file-backed data directory so VS Code, CLI, and other host shells
share state.

### Phasing

- **Phase 71 — `son-of-anton-core/` package extraction.** Lift
  `agents/`, `chat/AgentBridge.ts`, `chat/ConversationStore.ts`,
  `checkpoint/CheckpointManager.ts`, `tools/`, `mcp/`, `llm/`,
  `auth/CredentialBroker.ts` into a new workspace package. Replace
  every `import * as vscode` in those files with a thin
  `host` interface (`HostBridge`) that the extension implements
  one way and the CLI implements another. Effort: L. Tier: 2 (touches
  many extension files but the changes are mechanical import
  rewrites).
- **Phase 72 — `son-of-anton-cli/` skeleton.** New package; Commander
  command tree; Ink TUI shell; `HostBridge` implementation for the
  terminal (`SecretStorage` over keychain, `showQuickPick` over Ink,
  `WorkspaceFolder` over cwd). Just enough to run `anton run @anton-code
  "hello"` end-to-end. Effort: L. Tier: 1.
- **Phase 73 — Streaming parity (TUI / plain-text / JSON).** Plain-text
  mode and `--json` mode exhaustively. Document the JSON Lines protocol.
  Add `--plan` / `--act` / `--yolo` / `--max-consecutive-mistakes` /
  `--continue` / `--task <id>`. Effort: M. Tier: 1.
- **Phase 74 — ACP mode (`--acp`).** Stdio JSON-RPC against the Agent
  Client Protocol so editors and harnesses that expose ACP can host us
  as a BYO agent. Lower priority but cheap once the JSON Lines
  protocol exists. Effort: M. Tier: 1.

CI integration (a GitHub Action template that runs `anton run
@anton-pr` on `pull_request`) is a follow-on, not a phase.

---

## 4. AI Embodiment for Specialists

The specialists today are strings: `@anton-code`, `@anton-test`, …
Each has a role description in `chat/specialistRegistry.ts` and a
default model in `agents/AgentStackFactory.ts`. There's no visual
identity, no persisted state per specialist, no "where they live"
surface. This section makes them feel present.

### Phase 75 — Visual identity per specialist (S, Tier 1)

Define a `SpecialistPersona` type alongside `SpecialistRole`:

| Specialist | Glyph | Hex | Vibe |
| --- | --- | --- | --- |
| `anton` | `◇` | `#a78bfa` | conductor — purple, calm |
| `anton-code` | `◆` | `#60a5fa` | builder — blue, focused |
| `anton-test` | `◊` | `#34d399` | guardian — green, methodical |
| `anton-e2e` | `▣` | `#10b981` | scout — green-teal, exploratory |
| `anton-security` | `▲` | `#ef4444` | watcher — red, suspicious |
| `anton-docs` | `❡` | `#94a3b8` | scribe — slate, patient |
| `anton-ci` | `⌬` | `#f59e0b` | mechanic — amber, brisk |
| `anton-pr` | `❖` | `#22d3ee` | diplomat — cyan, formal |
| `anton-moderniser` | `⌖` | `#a3a3a3` | archaeologist — warm grey |
| `anton-spec` | `§` | `#c084fc` | architect — violet, deliberate |

Where applied: assistant message header glyph + name colour
(`buildAssistantMeta` in `ChatPanel.ts:3255`); specialist switcher
chip; History sidebar tree-item icon; CLI Ink output; chat-css.
Source of truth: a new `extensions/son-of-anton/src/agents/personas.ts`
imported by both `specialistRegistry.ts` (for the chat surface) and
the CLI core. *Effort: S.*

### Phase 76 — Per-specialist state and history (M, Tier 1)

Each specialist gets its own conversation thread distinct from the
main `@anton` conversation. When you `@anton-test` from the
composer, you're talking to that specialist's running thread, not
the orchestrator's. The thread persists across sessions in
`~/.son-of-anton/data/conversations/specialist-<id>.json`.

Why: subagent patterns in the wider ecosystem (e.g. a
`UseSubagentsToolHandler` / `SubagentRunner` pair) typically treat
subagents as ephemeral; we go further. A specialist that
remembers what it did in this codebase last week becomes vastly
more useful — `@anton-moderniser` should remember which phase of
the modernisation pipeline it was in. Pairs with project memory
(`agents/ProjectMemory.ts`) which is shared across specialists,
versus per-specialist memory which is isolated.

Where: extend `ConversationStore` to scope by specialist id;
`AgentBridge.runSpecialist` reads/writes the specialist's own thread
when invoked directly (not through the orchestrator). Add a
"Specialist threads" submenu in the History sidebar.

### Phase 77 — Specialist roster panel (M, Tier 1)

A new TreeView in the chat activity bar — `Anton Roster` — listing
all ten specialists. Each row:

- Glyph + name + colour stripe (Phase 75).
- Status chip: `idle` / `thinking` / `running tool` / `completed`
  / `failed` (driven by the existing `subtask-*` event stream).
- Last active timestamp.
- Right-click: "Start a thread", "View memory", "Clear thread",
  "Show last trace".

This makes specialists *places* the user can visit, not just
prompts. A typical `MetricsTracker` per agent gives raw numbers but
no visual "who is who" — we leapfrog by giving them a roster they
live in.

Where: new `src/sidebar/AgentRosterProvider.ts` (mirror
`ConversationListProvider.ts`); contribute as a view in
`package.json`. Bind to the existing `MetricsTracker` and the new
specialist threads from Phase 76.

### Phase 78 — Voice / character per specialist (S, Tier 1)

Differentiate specialists in *tone*, not just role description.
Today every specialist's prompt is a "Rules / Output Format"
template (`specialistRegistry.ts`); the orchestrator is the only
one with a voice ("competent, direct, slightly dry, doesn't waste
words, no exclamation marks unless something is genuinely on
fire"). Add a `voice` block to each specialist:

- `anton-security` — "terse, paranoid, surfaces the worst case
  first; never reassures; never says 'should be fine'"
- `anton-docs` — "patient, complete sentences, lists trade-offs,
  uses Oxford commas"
- `anton-moderniser` — "archaeologist's tone: 'this dates from
  when…', explains the *reason* the legacy code looks that way
  before changing it"
- `anton-pr` — "formal, structured, references the modification
  tier and the spec by id"

Plus a personality opt-in via `sota.personality.enabled` — when
enabled, each specialist sometimes signs off with a Silicon Valley
quote that fits its tone (`siliconValleyQuotes.ts` already tags
quotes by `tone`, so we filter by overlap with each specialist's
voice). Three quotes apiece in a curated map.

*Where:* `specialistRegistry.ts` add `voice: string` field; pipe
into `BaseAgent.buildSystemPrompt`; new
`src/personality/specialistQuotes.ts` mapping from tone to quote
ids.

### Phase 79 — Visible handoffs (covered by Phase 69, but reinforced here)

Phase 69 above adds the handoff banner. The embodiment lens
adds: when `@anton` dispatches to `@anton-code`, the handoff
banner uses *both* personas' colours and a short character beat
("Anton (passing the torch) → Anton Code (rolling up sleeves)").
This is one or two extra lines in the Phase 69 implementation; the
phase number is shared.

### Phase 80 — Persona-driven UX accents (S, Tier 1)

When a specialist is the *current* speaker in the panel:

- The composer placeholder text changes to that specialist's
  "voice" prompt ("Anton Security is listening — what would
  you like scanned?").
- A 1-pixel coloured stripe appears down the left side of the
  composer in that specialist's hex.
- For `anton-security`, the activity-bar icon gets a subtle red
  pulse while it's running. (Resist the temptation to take this
  further; one accent per persona is enough — more becomes
  carnival.)

*Where:* `ChatPanel.ts` composer block; small CSS additions in
`media/chat.css`.

### Phase 81 — Inter-agent visibility in the transcript (M, Tier 1)

When the orchestrator dispatches to a specialist, the transcript
shows:

```
◇ Anton: I'll have Anton Code refactor the auth module while Anton Test
   builds a regression suite in parallel.
   ├─ ◆ Anton Code [running] — src/auth/*.ts
   └─ ◊ Anton Test [waiting] — tests/auth/*.test.ts
```

Tree-shaped subtask cards already exist (Phase 28's `subtask-started`
events). The embodiment ask is: render them with the persona glyph,
indented under the orchestrator's message, with a live status chip
that updates from `subtask-token` / `subtask-completed` / `subtask-failed`
events. Today these events fire but the specialist identity is
not visually attached.

*Where:* `ChatPanel.ts` `subtask-started` handler; new
`.subtask-tree` CSS.

---

## 5. Patterns We Should NOT Copy

1. **Kanban as a default UX.** Some AI editors ship a "Kanban"
   companion that can be the default in their CLI (controlled by a
   `shouldLaunchKanbanByDefault`-style flag). It's a separate
   process, separate package manager install, separate UI
   vocabulary. Son of Anton is opinionated: one chat, one roster,
   one CLI. Adding a fleet board would dilute that and pull us
   toward a project-management product we don't have a thesis for.

2. **A `vscode-lm`-style first-party-IDE-LLM provider.** Some tools
   support it in the extension but explicitly exclude it on the CLI
   (a `CLI_EXCLUDED_PROVIDERS` list). Asymmetric provider
   availability across surfaces is the exact bug the "same brain in
   different bodies" thesis is meant to prevent. Skip this kind of
   IDE-bundled-LLM-as-a-provider entirely.

3. **A project-local `.son-of-antonignore` deny-list pattern.**
   We already have the better story: `WorkspaceContextProvider`'s
   built-in sensitive-path exclusions (documented in `README.md`)
   plus the proposed Phase 65 trusted-folders gate. A
   project-local deny-file is a developer-burden surface that
   most users will get wrong. Better to ship a strong default and
   a single trust boundary.

4. **A webview gRPC bridge for our use case.** Some implementations
   use a protobuf service definition (e.g. a `proto/`-based service
   contract) for the webview ↔ core IPC because they need
   cross-host stability across multiple IDE shells. We don't have a
   second IDE host and we're not planning one. Our existing typed
   `postMessage` boundary in `ChatPanel.ts` is fine; introducing
   protobufs would be infrastructure for a problem we don't have.

5. **PostHog telemetry by default.** Some AI editors ship PostHog +
   OpenTelemetry with a "bypass user opt-out for org mandate"
   feature flag (OTEL can bypass user opt-out when env/org
   mandates). Our `CLAUDE.md` is explicit: "No telemetry without
   explicit opt-in." Don't bring this near our codebase even as an
   off-by-default.

---

## 6. Phase Order Recommendation

Phases 58 → 81 (24 in total). Suggested execution order, grouped
by what can run in parallel.

### Wave A — composer & transcript foundations (parallel-safe)

Most touch `ChatPanel.ts` so they will rebase against each other,
but all are additive HTML / CSS / handler additions. Land them in
separate small PRs.

- **Phase 58** Plan / Act mode toggle
- **Phase 61** `@problems`, `@url`, `@terminal` mentions
- **Phase 66** Active-task header
- **Phase 67** `AGENTS.md` project context loader
- **Phase 68** Per-message hover details

### Wave B — checkpoint & tool-result surfaces (serial within ChatPanel)

These all amend the tool/checkpoint render paths in `ChatPanel.ts`;
serialize on a single feature branch.

- **Phase 59** Visual checkpoint markers
- **Phase 60** Inline tool-result review
- **Phase 63** Side-by-side diff for writes
- **Phase 64** Conversation export
- **Phase 65** Trusted-folder gate

### Wave C — agent embodiment in the IDE (parallel-safe with Wave A/B once Phase 75 lands)

- **Phase 75** Visual identity per specialist *(blocker for the rest of Wave C)*
- **Phase 76** Per-specialist state and history
- **Phase 77** Specialist roster panel
- **Phase 78** Voice / character per specialist
- **Phase 80** Persona-driven UX accents
- **Phase 69 / 79** Visible handoffs (single phase, two lenses)
- **Phase 81** Inter-agent visibility in the transcript
- **Phase 62** Focus-chain checklist
- **Phase 70** Welcome hero refresh

### Wave D — CLI organ (largest single bet, mostly serial)

- **Phase 71** `son-of-anton-core/` package extraction *(blocker)*
- **Phase 72** `son-of-anton-cli/` skeleton
- **Phase 73** Streaming parity (TUI / plain-text / JSON)
- **Phase 74** ACP mode

### Recommended execution order

1. **Phase 75** first — small, unblocks every other embodiment phase
   and dramatically improves chat readability for everything that
   follows.
2. **Phase 58** (Plan/Act) and **Phase 61** (mentions) in parallel
   — these are the two highest-ROI composer changes.
3. **Phase 71** kicks off in parallel — long-running, mechanical,
   doesn't block UI work.
4. **Phase 59 / 60 / 63** serialize on the tool-card path.
5. **Phase 76 / 77 / 78** in parallel — different files.
6. **Phase 72 → 73 → 74** finish the CLI in sequence.
7. **Phase 65** (trusted folders) as a security gate before the CLI
   ships externally — the CLI auto-approves more aggressively
   than the IDE; trusted folders are the floor.
8. **Phase 62, 64, 66, 67, 68, 69, 70, 80, 81** mop up; small,
   parallel-safe.

The single highest-leverage starting phase is **Phase 75 (visual
identity per specialist)**. It is small (a few hundred lines), it
unblocks every embodiment phase, and the moment it lands, every
existing transcript looks better — the existing agents *visibly*
become characters without any other change.

---

## Source notes

The patterns referenced above are sourced from internal research
notes covering:

- Checkpoints, plan/act, focus chain, hooks, telemetry, deny-file
  patterns, mentions, multi-root, file-backed shared data
  directories.
- CLI process model (a `HostProvider` + `CliWebviewProvider` +
  `vscode-shim.ts` shape), command surface, plain-text vs JSON
  streaming, Ink TUI, ACP mode, IDE-bundled-LLM-provider exclusion,
  quick-auth, `mcp add`.
- Subscription / OAuth provider integration patterns (Claude
  subprocess pattern informs our future `CredentialBroker`
  evolution; ChatGPT/Codex OAuth pattern, for which we already have
  skeletons).
- Trusted-folder narrative (Phase 65), single-file project context
  via `AGENTS.md` (Phase 67), and ACP / BYO-agent positioning
  (Phase 74).

Son of Anton anchors:

- `extensions/son-of-anton/README.md` — feature inventory.
- `docs/architecture.md` — chat / tool / persistence layout.
- `docs/agents.md` — specialist roster.
- `extensions/son-of-anton/src/chat/ChatPanel.ts` — primary surface
  for Wave A, Wave B, Wave C UI work.
- `extensions/son-of-anton/src/chat/AgentBridge.ts` — bridge between
  webview events and `AgentStack`; the seam where the CLI also
  attaches.
- `extensions/son-of-anton/src/chat/specialistRegistry.ts` —
  source of truth for specialist roles, extended in Phase 75 / 78.
- `extensions/son-of-anton/src/checkpoint/CheckpointManager.ts` —
  Phase 52 substrate consumed by Phase 59.
- `extensions/son-of-anton/src/personality/siliconValleyQuotes.ts` —
  tone-tagged quote library reused by Phase 78.
- `extensions/son-of-anton/src/onboarding/SetupWizardPanel.ts` —
  template for the `anton auth` interactive Ink flow.

There is no Son-of-Anton-specific CLI today: the existing `cli/`
directory at the repo root is upstream VS Code's Rust `code` binary
(see `cli/Cargo.toml`, `package.name = "code-cli"`), and it has no
relationship to our agents. The proposed `son-of-anton-cli/`
package lives elsewhere and does not collide with it.
