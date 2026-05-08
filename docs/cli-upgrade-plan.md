# Son of Anton CLI — Full Upgrade Plan

A multi-phase plan to bring `sota` to feature parity with Claude Code (`claude`), OpenAI's Codex CLI, GitHub Copilot CLI (`gh copilot`), and Gemini CLI — and a step beyond, since the CLI is a native sibling of the IDE rather than a separate product.

## Goals

1. **Polished interactive TUI.** Streaming markdown, syntax highlighting, tool-call cards, diff previews, approval prompts. Should feel as good as `claude` in a terminal.
2. **Conversation persistence.** Every chat survives across sessions. `sota resume` picks up where you left off. The IDE and CLI share the same conversation store.
3. **OAuth subscription flows.** `sota auth login` for Anthropic Claude / OpenAI Codex / Google subscription auth. No env vars required.
4. **Native IDE integration.** The IDE ships the CLI binary, exposes it on PATH inside the integrated terminal, and shows status (`◇ sota`) in the status bar. Conversations cross from chat panel → terminal seamlessly.
5. **Headless / CI ready.** `--output json` produces NDJSON so CI scripts can drive `sota` programmatically. Exit codes are meaningful.
6. **Hooks + lifecycle.** `.son-of-anton/hooks.json` to run scripts on events (pre-prompt, post-tool-call, etc.) — like Claude Code's hooks.
7. **Workspace bootstrap.** `sota init` writes a sensible `.son-of-anton/AGENTS.md`, recommended config, optional MCP servers.
8. **Self-update.** `sota update` checks for new versions and pulls the right platform binary.

## Reference implementations to learn from

| Tool | Source | Notable patterns to lift |
|---|---|---|
| **Claude Code** (`claude`) | Closed source | TUI feel; slash commands; memory; subagents; hooks; ACP; conversation resume |
| **OpenAI Codex CLI** | [github.com/openai/codex](https://github.com/openai/codex) | Rust + Ratatui TUI; approval modes; sandbox execution; diff preview; clean architecture |
| **GitHub Copilot CLI** (`gh copilot`) | Built on the `gh` CLI plugin model | Plugin-friendly architecture; tight integration with the parent tool's auth |
| **Gemini CLI** | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | TypeScript + Ink (React for CLIs); MCP integration; memory; subagents; recent additions on hooks |
| **OpenCode** | [github.com/sst/opencode](https://github.com/sst/opencode) | Multi-provider agent CLI; clean session model |
| **Aider** | [github.com/Aider-AI/aider](https://github.com/Aider-AI/aider) | Diff workflow; commit integration; the conversation-as-edit-history pattern |
| **Continue CLI** | [github.com/continuedev/continue](https://github.com/continuedev/continue) | Configuration model; tool registry pattern |

## Architectural choice — TypeScript or Rust?

The current CLI is TypeScript with `commander`. Two paths forward:

| Path | Pros | Cons |
|---|---|---|
| **Stay TypeScript + adopt Ink** (React for CLIs) | Same language as everything else in the repo. Fast iteration. Hot-reload during dev. Massive ecosystem. Ink is mature (Gemini CLI uses it, Cline's CLI uses it, GitHub's `gh` uses similar). | Distribution: requires bundling Node — either a tarball with `node` + the JS, or a single binary via `pkg`/`nexe`/`bun --compile`. ~30–60 MB binary. Cold-start ~150ms. |
| **Rewrite in Rust + Ratatui** | Single static binary, ~5–15 MB. Cold-start <30ms. Ties into the Rust code-graph crate (Phase R7's `sota-codegraph-napi` could be reused as a regular Rust dep). Codex CLI's architecture is a good blueprint. | Big rewrite. Doubles the languages contributors need to know. The TUI ecosystem in Rust is good but smaller than React's. |

**Recommended path: TypeScript + Ink for v1, optional Rust port later.**

- The Rust codegraph crate (Phase R8) already provides the perf-critical bits (parsing, indexing, embedding) as an npm package (`@son-of-anton/codegraph`). The CLI consumes it like any other npm dep — same speed as a native binary for the heavy lifting.
- Ink + TypeScript means we can move fast on UX work, the part where this plan gets most of its value.
- A future Rust port becomes optional polish — the crates are already there if we want to consolidate.
- Distribution: ship as `npm i -g @son-of-anton/cli` for power users, and a single-file binary built with `bun --compile` for users who want zero Node dep. Both work. Codex CLI does the latter.

If you specifically want the "single Rust binary" feel later, that's Phase CLI13 in this plan — additive, not a prerequisite.

## High-level architecture (after this plan)

```
son-of-anton-cli/                          ← TypeScript package, npm-distributable
├── src/
│   ├── tui/                               ← Ink components
│   │   ├── App.tsx                        ← root, wires <Provider> + screens
│   │   ├── screens/
│   │   │   ├── ChatScreen.tsx             ← REPL: input + transcript + status bar
│   │   │   ├── ResumeScreen.tsx           ← pick a previous conversation
│   │   │   ├── AuthScreen.tsx             ← OAuth flow
│   │   │   └── SettingsScreen.tsx         ← interactive `sota config`
│   │   ├── components/
│   │   │   ├── ToolCard.tsx               ← rendered inline in transcript
│   │   │   ├── DiffPreview.tsx            ← write_file diff before approval
│   │   │   ├── ApprovalPrompt.tsx         ← y/n/edit/skip flow
│   │   │   ├── PlanCard.tsx               ← orchestrator plan rendering
│   │   │   ├── StatusBar.tsx              ← model · cost · branch · cwd
│   │   │   └── MarkdownRenderer.tsx       ← syntax-highlighted code blocks
│   │   └── hooks/
│   │       ├── useAgentStream.ts          ← bridges core → Ink state
│   │       ├── useKeybindings.ts          ← Esc / Cmd+. / Ctrl+R
│   │       └── usePersistentSession.ts    ← snapshot conversation to disk
│   ├── commands/                          ← top-level commander commands (ALREADY PARTIALLY EXIST)
│   │   ├── chat.ts                        ← upgraded to Ink TUI
│   │   ├── run.ts                         ← one-shot, may also use TUI for streaming
│   │   ├── plan.ts
│   │   ├── resume.ts                      ← NEW — list + restore conversations
│   │   ├── auth/                          ← NEW — login/logout/status
│   │   ├── tools.ts
│   │   ├── mcp.ts                         ← extended with discovery
│   │   ├── config.ts
│   │   ├── init.ts                        ← NEW — bootstrap workspace
│   │   ├── update.ts                      ← NEW — self-update
│   │   ├── acp.ts                         ← unchanged
│   │   └── hooks.ts                       ← NEW — manage hooks
│   ├── auth/
│   │   ├── bootstrap.ts                   ← extends existing env+secrets sweep
│   │   └── oauth/                         ← NEW
│   │       ├── claude.ts
│   │       ├── codex.ts
│   │       └── google.ts
│   ├── persistence/                       ← NEW
│   │   ├── ConversationStore.ts           ← shared shape with the IDE
│   │   ├── SessionState.ts
│   │   └── HookRunner.ts
│   ├── runtime/                           ← already exists (CLI host adapter)
│   │   └── cliHost.ts                     ← extended with project context provider
│   └── cli.ts                             ← entry, wires everything
├── bin/
│   └── sota                               ← the .vsix-bundled launcher script (Phase CLI7)
└── package.json
```

## Phase plan

Each phase ships an independently testable artifact. Estimated agent run time + your hands-on time given as a guideline — each phase can land in a single session.

---

### Phase CLI1 — Ink TUI scaffold + ChatScreen

**Outcome:** `sota chat` opens an Ink-rendered TUI with a styled transcript, an input area with multiline support, and a status bar at the bottom. Text streams from the LLM into the transcript with token-by-token rendering.

**Agent ships:**
- New deps: `ink`, `react`, `@types/react`, `ink-text-input`, `ink-spinner`, `ink-syntax-highlight`
- `src/tui/App.tsx` mounting a screen router
- `src/tui/screens/ChatScreen.tsx` — input + transcript + status bar layout
- `src/tui/components/StatusBar.tsx` showing model, cost, working directory
- `src/tui/components/MarkdownRenderer.tsx` using `ink-syntax-highlight` for fenced code blocks
- `src/tui/hooks/useAgentStream.ts` translating `LlmStreamEvent` → React state
- The existing `chat.ts` command swaps from readline to mounting `<App />` with `chatScreen` route
- `--no-tui` flag falls back to the current readline mode for environments that can't render Ink (CI, pipes, narrow terminals)

**Estimated time:** Agent 1 hr · You 2-3 hr (tweaking layout, choosing colors, smoke-testing on a real terminal)

**Acceptance criteria:**
- `sota chat` opens the TUI; typing and submitting flows through the existing `LlmClient`
- Tokens stream visibly into the transcript; spinner replaces the cursor while waiting
- Status bar updates each turn (model, cumulative cost, branch detection from `.git/HEAD`)
- `Cmd+C` / `Ctrl+C` aborts the in-flight stream; pressing it again exits cleanly
- `--no-tui` still works for `| less` and CI

---

### Phase CLI2 — Slash commands + REPL ergonomics

**Outcome:** Slash commands work inside the TUI. Up-arrow recalls history. `Shift+Enter` inserts a newline; `Enter` submits. Pasting multi-line code is detected and handled gracefully.

**Slash commands shipped:**
- `/clear` — wipe transcript, keep session
- `/new` — start a fresh conversation (resets specialist + memory scope)
- `/model <id>` — switch model mid-conversation
- `/specialist @anton-code` — switch specialist
- `/plan` — toggle plan mode
- `/tools` — list available tools
- `/save [<name>]` — explicit conversation snapshot
- `/resume` — list snapshots, pick one
- `/help` — show all slash commands
- `/quit` or `/exit` — exit cleanly
- `/config get <key>` / `/config set <key> <value>` — inline config

**Agent ships:**
- `SlashCommandRegistry` with handlers
- Tab-completion of `/...` partial commands
- History buffer: 100 entries, persisted in `~/.son-of-anton/data/repl-history.txt`
- Multi-line paste detection (>1 newline within 50ms = paste, render as a single block)
- Visual feedback: typing `/` opens an inline command palette with descriptions

**Estimated time:** Agent 1 hr · You 2-3 hr

**Acceptance criteria:**
- Each slash command works as documented
- Tab completion narrows correctly
- Up-arrow recall pulls only valid prompts (not slash commands)
- Pasting a 100-line code block doesn't fragment

---

### Phase CLI3 — Conversation persistence + resume

**Outcome:** Every conversation auto-saves to `~/.son-of-anton/data/conversations/cli-<id>.json` after each turn. `sota resume` lists conversations sorted by recency, with the first user prompt as the title. The IDE reads from the same directory so conversations cross between surfaces.

**Agent ships:**
- `src/persistence/ConversationStore.ts` — JSON file per conversation, `{ id, title, turns: [...], createdAt, updatedAt, model, specialist }`
- Schema mirrors `extensions/son-of-anton/src/chat/ConversationStore.ts` so the IDE can read CLI conversations and vice versa (see Phase CLI7 for the bridging)
- `sota resume` command + `<ResumeScreen>` Ink component listing recent conversations
- `sota resume <id>` directly restores a specific conversation
- Atomic writes (temp file + rename) so crashes don't corrupt
- Auto-cleanup of conversations older than 90 days (configurable)
- `/save` and `/resume` slash commands wire into the same store

**Estimated time:** Agent 30 min · You 1-2 hr

**Acceptance criteria:**
- Restart the CLI, `sota resume` shows the previous chat
- Pick one, the transcript reloads and the next turn continues correctly
- Schema matches the IDE's conversation format byte-for-byte (Phase CLI7 will exercise this)
- Concurrent CLI sessions don't corrupt each other's files

---

### Phase CLI4 — Streaming UX: tool cards, diff previews, approval prompts

**Outcome:** When the agent calls a tool, a card renders inline in the transcript showing tool name + args + (if not auto-approved) approval prompt. `write_file` calls show a syntax-highlighted diff before approval. Approvals follow the granular auto-approval policy from the IDE (read / write / shell / mcp).

**Agent ships:**
- `<ToolCard>` Ink component per tool category
- `<DiffPreview>` — uses `diff` lib to render unified diff with green/red highlighting
- `<ApprovalPrompt>` — Y / N / E (edit) / A (allow always for this tool) / D (deny denylist this command)
- Bridges the existing `sota.autoApprove.*` settings (already shared via the file-backed `cliHost.config`) so CLI auto-approval matches the IDE
- The 100KB-cap edit-before-feedback flow from IDE Phase 60 ported to the CLI
- Spend-cap warning: when running cost approaches `sota.spendLimit.session` or `.task`, show a banner; honors the same kill-switch the IDE has

**Estimated time:** Agent 1.5 hr · You 3-4 hr

**Acceptance criteria:**
- `write_file` tool call shows a diff before applying; approve → applies, reject → discards
- Auto-approval categories (`read` on by default, others off) match IDE behaviour
- Spend cap blocks the next turn with a clear modal-equivalent prompt
- "A" (allow always) writes to the user's auto-approval config, persists for future sessions

---

### Phase CLI5 — Auth flows + OAuth subscription login

**Outcome:** `sota auth login` opens a browser and walks the user through OAuth for Anthropic Claude (subscription), OpenAI Codex (subscription), and Google. Tokens land in `~/.son-of-anton/data/secrets.json` (already-shared with the IDE). `sota auth status` shows which providers are configured.

**Agent ships:**
- `src/auth/oauth/claude.ts` — implements the Anthropic Claude Code subscription OAuth flow (mirrors the existing `claudeCodeRunner` but does its own fresh auth rather than relying on `claude` CLI)
- `src/auth/oauth/codex.ts` — same for OpenAI Codex
- `src/auth/oauth/google.ts` — same for Google
- `sota auth login [provider]` — launches the flow; if no provider given, shows a picker
- `sota auth logout [provider]` — clears the credential
- `sota auth status` — table of provider × configured? × scope × expires-at
- Local callback server using a random port; uses `open` package to launch the browser

**Estimated time:** Agent 2 hr · You 4-5 hr (these flows have a lot of edge cases — token refresh, scope validation, network failure handling)

**Acceptance criteria:**
- Each provider's OAuth flow completes and writes the token where the LlmClient expects it
- Refresh tokens are stored and used; expired access tokens trigger a transparent refresh
- `sota auth status` matches what `sota chat` actually uses
- Cancelling mid-flow doesn't leave half-saved credentials

---

### Phase CLI6 — Subagents + memory in the REPL

**Outcome:** Typing `@anton-code` mid-conversation switches the active specialist for subsequent turns. `/memory` shows what the current specialist has remembered about the project. Memory writes happen automatically as specialists run — same pathway the IDE uses.

**Agent ships:**
- Tab-completion of `@<handle>` from the loaded specialist registry
- Mid-conversation specialist switch wires through `BaseAgent.runChatTurn` (already accepts `modelOverride` and `workspaceContextSnapshot`)
- `/memory list` — show entries for the current specialist
- `/memory clear` — clear with confirmation
- `/memory write <key> <value>` — manual memory write (mirrors what the agent does autonomously)
- Status bar shows the active specialist's glyph + accent

**Estimated time:** Agent 30 min · You 1-2 hr

**Acceptance criteria:**
- `@anton-code` switches the active specialist; the response uses anton-code's voice and defaults
- `/memory list` shows real entries written by the specialist's last turn
- Specialist memory persists across sessions (already true via the shared file store; this phase just exposes it)

---

### Phase CLI7 — Native IDE integration (the bonus)

**Outcome:** Installing the IDE installs the CLI. Opening the IDE's integrated terminal exposes `sota` on PATH. Conversations cross between IDE and CLI seamlessly. A status bar item shows `◇ sota` and links to docs / common commands.

**Agent ships:**
- The IDE bundles the CLI binary inside `extensions/son-of-anton/bin/sota` (one binary per platform via napi-rs-style sub-packages, OR a single Bun-compiled binary per platform)
- On extension activation, the binary is symlinked to a per-user dir on PATH (`~/.local/bin/sota` on Unix, `~/AppData/Local/sota/bin` on Windows). User opt-in via a one-time toast: "Install `sota` CLI on your PATH? [Yes] [No, I'll do it later]"
- The CLI and IDE share `~/.son-of-anton/data/conversations/` — IDE's `ConversationStore` reads CLI conversations and lists them in the History tab; CLI's `sota resume` shows IDE conversations
- New status bar item `◇ sota` (priority 95): tooltip shows version + last-used time. Click → quick-pick: Open `sota chat` here, Show docs, Update, Uninstall PATH symlink
- New palette command `sota.openCliHere` opens the IDE's integrated terminal in the current workspace and runs `sota chat`
- New palette command `sota.installCliOnPath` for users who skipped the first-run prompt

**Estimated time:** Agent 2-3 hr · You 4-6 hr (testing across macOS / Linux / Windows is the time sink here)

**Acceptance criteria:**
- Install the IDE on a fresh machine → open integrated terminal → `sota --version` works without any manual setup
- Open a conversation in the IDE → switch to terminal → `sota resume` lists it → continue the chat → switch back to the IDE → the new turns appear in the History tab on next refresh
- The path-symlink prompt appears once; clicking "No" remembers and doesn't re-prompt
- Status bar item updates when the CLI's last-used time changes

---

### Phase CLI8 — `sota init` workspace bootstrap

**Outcome:** `sota init` interactively walks the user through setting up `.son-of-anton/AGENTS.md`, recommended config, and an opt-in choice of MCP servers. After it runs, the user has a workspace ready for productive `sota chat` use.

**Agent ships:**
- Interactive Ink wizard:
  1. Detect the project type (TypeScript / Python / Rust / Go / mixed) — from package files
  2. Ask for a one-line project description
  3. Generate a starter `AGENTS.md` with sections: Project / Architecture / Coding Standards / Forbidden Patterns / Testing
  4. Ask which MCP servers to wire (current candidates: `code-graph` from this repo, GitHub MCP, filesystem MCP)
  5. Detect existing `.cursor/rules`, `CLAUDE.md`, `.clinerules`, etc. and offer to import their content
  6. Write everything atomically; show a summary before applying
- `--non-interactive` flag for CI: takes a JSON config, writes deterministically

**Estimated time:** Agent 1 hr · You 2-3 hr

**Acceptance criteria:**
- Run in an empty dir → produces a working `.son-of-anton/AGENTS.md` and a `.son-of-anton/config.json` (workspace-scoped overrides of the global `~/.son-of-anton/config.json`)
- Run in a dir with existing `CLAUDE.md` → offers to import its content into the new `AGENTS.md`, with diff preview
- `sota chat` after init has the AGENTS.md content visible in the orchestrator's system prompt (Phase 67's loader already handles this)

---

### Phase CLI9 — Hooks system

**Outcome:** `.son-of-anton/hooks.json` lets users run shell scripts on lifecycle events. Mirrors Claude Code's hooks architecture; tighter than what we'd want to build from scratch.

**Lifecycle events:**
- `pre-prompt` — before sending the user's prompt; can mutate the prompt by writing to stdout
- `post-response` — after the assistant finishes
- `pre-tool-call` — before any tool runs; can deny by exiting non-zero
- `post-tool-call` — after a tool runs; useful for telemetry
- `pre-write-file` — specifically for `write_file` tool calls; ideal place for formatters / linters
- `pre-shell-command` — for `run_command`; ideal place for command audit logging
- `session-start` / `session-end` — REPL lifecycle

**Agent ships:**
- `src/persistence/HookRunner.ts` — spawns hook scripts with the relevant event payload as JSON on stdin, reads JSON response on stdout
- `sota hooks list` / `sota hooks add <event> <script>` / `sota hooks remove <event>` — management commands
- Hook scripts are gated by workspace trust (already wired via Phase 65) so you can't get hijacked by opening a malicious project
- A 5-second hook timeout — slow hooks log a warning and proceed without the hook's output

**Estimated time:** Agent 1.5 hr · You 3-4 hr

**Acceptance criteria:**
- A pre-write-file hook running `prettier --write -` can rewrite the proposed file content before it's applied
- A pre-shell-command hook that returns exit 1 prevents the command from running
- Hook timeouts don't deadlock the agent
- Hooks run only in trusted workspaces

---

### Phase CLI10 — Self-update mechanism

**Outcome:** `sota update` checks the npm registry (or our GitHub releases) for a new version and pulls the right platform binary. `sota --version` shows current + latest if outdated.

**Agent ships:**
- `sota update` — checks the latest version, downloads, replaces in-place
- `sota --check-update` — non-destructive check; useful for CI banners
- Update channel config: `stable` / `prerelease`, default `stable`
- Signature verification of the downloaded binary (we sign releases)
- Graceful fallback: if running from `npm i -g`, advise `npm i -g @son-of-anton/cli@latest` rather than self-replacing
- Quiet daily check on `sota chat` startup; nags once per release at most

**Estimated time:** Agent 1 hr · You 1-2 hr

**Acceptance criteria:**
- Outdated install → `sota update` pulls the new version, restarts cleanly
- Up-to-date install → no-op with friendly confirmation
- The daily check doesn't slow `sota chat` startup by more than 50ms (use a background promise; never block)

---

### Phase CLI11 — Headless / CI mode

**Outcome:** `sota` is scriptable. `--output json` produces NDJSON. Exit codes encode success / partial failure / hard failure. A test script in CI can drive `sota run` to perform a code review on a PR diff and post the result.

**Agent ships:**
- `--output json` flag on `chat`, `run`, `plan`, `tools list`, `auth status`, `mcp list` — produces NDJSON streams
- `--quiet` suppresses everything except the last assistant message (good for `$(sota run …)` substitution)
- Exit code conventions:
  - 0: success, agent completed
  - 1: hard failure (auth missing, model unavailable)
  - 2: agent declined (refused for safety / scope)
  - 3: cancelled by the user
  - 4: timeout
- `sota run @anton-pr "Review the staged diff" < <(git diff --staged)` works — `stdin` is concatenated to the prompt when present
- `--max-turns N` for orchestrator runs to bound the agent loop

**Estimated time:** Agent 1 hr · You 2-3 hr

**Acceptance criteria:**
- A 10-line bash script can pipe a git diff into `sota run`, get back a review, and exit non-zero on a hard failure
- `--output json` parses cleanly with `jq`
- Backwards compatible: existing `sota chat` (no `--output`) keeps its TUI

---

### Phase CLI12 — MCP discovery + one-line server adds

**Outcome:** `sota mcp` is friendlier. `sota mcp claude-add --transport http <url>` adds an HTTP MCP server using the same shorthand Claude Code uses. `sota mcp marketplace` browses a curated list. `sota mcp doctor` validates current configuration.

**Agent ships:**
- `sota mcp claude-add` (and `add-stdio`, `add-http`) — shortcut commands matching Claude Code's syntax for ergonomic copy-paste
- `sota mcp marketplace` — fetches a static manifest from `https://son-of-anton.dev/mcp-marketplace.json` listing community-vetted servers; user picks; we add the server
- `sota mcp doctor` — for each configured server: ping it, list its tools, surface schema mismatches
- `sota mcp logs <name>` — tail the recent stderr from a stdio MCP server (we already capture this)

**Estimated time:** Agent 1 hr · You 1-2 hr

**Acceptance criteria:**
- A user copies a Claude Code `claude mcp add` command, replaces `claude` with `sota`, and the server registers with no other changes
- `sota mcp doctor` correctly diagnoses a misconfigured server (wrong path, missing args, server crashes on init)

---

### Phase CLI13 — Optional Rust port (deferred)

**Outcome:** A Rust CLI binary that's a single static executable, ~5–15 MB, sub-30ms cold start. Reuses the `sota-codegraph-core` crate from the Rust codegraph plan.

This is opt-in cleanup, not required. Only worth doing if:
- The Bun-compiled TS binary is too large for our taste (likely will be ~30–60 MB)
- We're shipping the Rust codegraph crate already and want to consolidate
- We want to match Codex CLI's "single binary, fast as hell" feel exactly

If we do it, the architecture is:
- `crates/sota-cli/` — Rust crate, depends on `sota-codegraph-core`
- TUI via `ratatui`
- HTTP via `reqwest`
- The agent stack stays in the Node port for the IDE; the Rust CLI re-implements just enough of the agent stack to drive the same MCP / LLM surface

Estimated effort: 4-6 weeks (it's a real rewrite). I would NOT do this unless the TypeScript version genuinely doesn't meet the bar.

**Status:** Planned but not started. Deferred until the TypeScript path proves insufficient.

---

## Estimated total

- **Phases CLI1 – CLI12:** ~14-18 hours of agent compute, ~30-40 hours of your hands-on / smoke testing.
- **Phase CLI13:** another 4-6 weeks, only if you decide to go Rust.
- **Result:** a CLI that holds its own next to Claude Code and Codex, plus genuine native IDE integration (which neither of those have to the same degree — `gh copilot` is the closest analog, and it's just shell-command suggestions).

## Suggested cadence

Each phase is independently shippable; nothing forces you to do them in order or all at once. A reasonable cadence:

| Sprint | Phases | What you'll have at the end |
|---|---|---|
| Weekend 1 | CLI1, CLI2 | Polished interactive REPL with slash commands |
| Weekend 2 | CLI3, CLI4 | Conversation persistence + tool cards with approvals |
| Weekend 3 | CLI5 | OAuth login flows for Claude / Codex / Google |
| Weekend 4 | CLI6, CLI8 | Subagents in the REPL + `sota init` workspace bootstrap |
| Weekend 5 | CLI7 | Native IDE integration — the killer feature |
| Weekend 6 | CLI9, CLI10, CLI11, CLI12 | Hooks + self-update + headless mode + MCP polish |
| Later | CLI13 | Rust port if TypeScript proves insufficient |

CLI7 (native IDE integration) is the highest-value phase because it's the differentiator — that's something Claude Code and Codex don't have. Do CLI1-CLI4 first to get the basic UX up to par, then CLI7 for the bonus.

## Working pattern per phase

For each phase:

1. **Agent runs first** — generates scaffolding, dependencies, type stubs, smoke tests, basic Ink components.
2. **You take the polish lap** — tweak colors, layout, copy, edge cases. Ink is fast to iterate; hot-reload is your friend.
3. **Agent runs again** to land tests, docs, CI checks once you're happy.

Ink-specific tip: run `node --watch dist/cli.js chat` during dev. The TUI re-mounts on file changes and you see your edits in seconds.

## Dependency manifest (CLI1)

Pinning likely versions for the new TUI dependencies. Update at start of each phase if newer versions are available.

```json
{
    "dependencies": {
        "ink": "^5.0.1",
        "react": "^18.3.1",
        "ink-text-input": "^6.0.0",
        "ink-spinner": "^5.0.0",
        "ink-syntax-highlight": "^2.0.2",
        "diff": "^7.0.0",
        "open": "^10.1.0"
    },
    "devDependencies": {
        "@types/react": "^18.3.0",
        "@types/diff": "^5.2.3"
    }
}
```

`bun --compile` for the single-binary distribution path. Add it as an optional dev dep.

## Risks and open questions

- **Ink + Node 22 stability** — Ink 5 supports Node 18+, our pinned 22 is well-trodden. Low risk.
- **Bun-compiled TS binary size** — likely 30-60 MB. If this is a deal-breaker, that pushes us toward Phase CLI13 sooner.
- **OAuth flows are fiddly** — each provider has its own quirks (PKCE, refresh tokens, scope validation). Phase CLI5 is the riskiest phase; budget extra time.
- **Cross-platform PATH symlinking** in CLI7 — Windows is the awkward case. macOS / Linux are easy with `~/.local/bin/sota`; Windows wants either a `cmd` shim or a registry edit. Pick the simpler path.
- **Conversation schema compatibility with the IDE** — has to be lockstep. If the IDE's `ConversationStore` schema drifts during this work, the bridging in CLI7 breaks. Pin a single version + a migration path early.

---

**Status:** Plan only. Spawn Phase CLI1 when ready.
