# Decisions

Decisions with lasting consequences, and the reasoning behind them. Newest
first. A decision recorded here should not be relitigated without new
information — add a superseding entry instead of editing an old one.

---

## D-003 — Governance gate lives in `platform/`, agent features live above it

**Status:** proposed, pending sign-off
**Date:** 2026-09-13
**Gates:** Phase 1 (governance gate MVP) cannot start until this is accepted.

### Context

`ARCHITECTURE.md` described the agent orchestrator as "not yet started" and
placed the MCP client in Tier 2. Both are out of date. This fork is based on
VS Code 1.139, which already ships:

| Inherited | Location | Scale |
|---|---|---|
| Agent/chat UI and tool-calling loop | `contrib/chat` | 1,138 `.ts` files (770 non-test) |
| MCP client | `contrib/mcp` | 86 `.ts` files |
| Vendor-agnostic model registry | `ILanguageModelsService` | `registerLanguageModelProvider(vendor, provider)` |
| Policy-backed tool approval | `languageModelToolsConfirmationService`, `agentHostConfigPolicy` | — |
| Agent sessions workbench layer | `src/vs/sessions/` | — |

So the real question is not "how do we build an orchestrator" but "how do we
route the one we inherited through a Kente governance gate."

### Findings from the spike

**1. Two genuine chokepoints exist, and both are in the renderer, not the
extension host.**

- All tool execution funnels through
  `ILanguageModelToolsService.invokeTool` —
  `contrib/chat/browser/tools/languageModelToolsService.ts:489`. There are
  exactly three non-test callers, and the extension-facing one
  (`mainThreadLanguageModelTools.ts:64`) routes into the same service.
- All model calls funnel through `ILanguageModelsService.sendChatRequest` —
  `contrib/chat/common/languageModels.ts:1447`. The extension-facing path
  (`mainThreadLanguageModels.ts:230`) also routes into it.

Extension code reaches both only across the `mainThread*` RPC bridge, so a
check inside these two methods cannot be bypassed by extension code calling
the LM or tools APIs.

**2. Upstream already implements policy-over-project precedence.**

`configurationModels.ts:1034-1039` applies policy values *last*, overwriting
default, user, workspace, and folder configuration. A policy-backed setting
therefore cannot be overridden by a user or by a project file. This is
exactly the `ARCHITECTURE.md` requirement that governance policy sit above
`.ide-config.json`, already built and battle-tested — we should use it rather
than invent a parallel precedence system.

**3. Copilot coupling is real but mostly shallow.** 184 of 770 non-test files
in `contrib/chat` mention Copilot, concentrated in settings keys, error
strings, and CLI/agent-host glue rather than in the orchestration core.

### Options considered

**A. Fork core.** Build the gate and the agent directly into `contrib/chat`.
Best UX integration and fastest to something working, but it patches the
highest-churn area of upstream. This is the failure mode that `D-001` forked
directly to avoid.

**B. Bundled extension.** Ship the agent as an extension over the LM API,
tools API, and MCP. Near-zero merge cost — but **it cannot satisfy our hard
rule.** Extensions are peers, not a chokepoint: an extension can call a model
API over plain `fetch` and spawn processes directly, never touching
`sendChatRequest` or `invokeTool`. A gate implemented at this layer is
advisory, and an advisory governance gate is not a governance gate.

**C. Hybrid — chosen.** Gate service in `src/vs/platform/governance/`, new
code in a new directory, owned entirely by us. `contrib/chat` is lower-layer-
dependent on `platform/`, so the two chokepoints above call *into* the gate.
Agent features and UI ride on top as a bundled extension.

### Decision

Option **C**.

The upstream patch surface is two call sites — `invokeTool:489` and
`sendChatRequest:1447` — on the order of ten lines in two files, in methods
whose signatures are stable because the whole extension API depends on them.
Everything substantial lives in `platform/governance/`, which upstream will
never touch. That buys a non-bypassable chokepoint for roughly the merge cost
of option B.

### Consequences and limits

- **Scope of the gate is the Kente agent and anything using the LM/tools
  APIs — not arbitrary extension code.** A third-party extension can still
  open its own socket. Constraining that is an extension-permissions problem,
  a separate and much larger piece of work. We must not describe the gate as
  sandboxing arbitrary extensions; it does not.
- Every upstream merge must re-verify those two call sites still exist. This
  belongs in the merge runbook in `SETUP.md`, and ideally as a test that
  fails loudly if a gated path stops being gated.
- The audit log must record model calls, not only tool calls — `sendChatRequest`
  is a chokepoint precisely so that cost and prompt content are auditable.
- Re-tier: MCP client moves from Tier 2 to inherited. "Agent orchestrator
  scaffold" moves from build to adopt. Diff/edit UI and checkpointing are
  inherited and only survive under options A/C; under B they would have been
  rebuilt.

---

## D-002 — Extension gallery is Open VSX

**Status:** accepted
**Date:** 2026-09-13

Microsoft's marketplace terms do not permit use by third-party forks, so
`product.json` points `extensionsGallery` at `https://open-vsx.org`.

Consequence: extensions published only to Microsoft's marketplace are
unavailable, including Microsoft's Remote-SSH. The Tier 0 "SSH remote dev"
item therefore needs an open-source substitute (`open-remote-ssh`) or our
own implementation — it is not a matter of installing the usual extension.

Upstream's `build/hygiene.ts` rejected any `product.json` containing
`extensionsGallery`, which is correct for Code - OSS (Microsoft injects its
gallery at build time) but blocks a fork that must ship its own. The check is
inverted in this fork to forbid Microsoft's marketplace instead, so it now
enforces our endpoint rule rather than fighting it.

---

## D-001 — Fork `microsoft/vscode` directly, not Cursor or Void

**Status:** accepted

Forking upstream directly keeps merges tractable. Cursor and Void have
patched core internals in ways that make tracking upstream painful; the extra
initial setup work is worth avoiding that inheritance.

This decision is the reason several other rules exist: `product.json` is kept
byte-identical to upstream's `JSON.stringify(obj, null, '\t')` formatting so
its diff stays at ~27 lines instead of ~497, and D-003 chose its architecture
primarily on merge surface.

---

## D-000 — The name "Kente Workbench" is provisional

**Status:** open — must be settled before Phase 0.2 ships an installable build

Changed from "Kente Studio". Still not final.

`dataFolderName`, `darwinBundleIdentifier`, `urlProtocol`, and the win32
AppId GUIDs are written into user machines the moment an installable build
ships. Renaming after that point means a profile-migration path, not a
find-and-replace. Settle the name before Phase 0.2 produces artifacts.
