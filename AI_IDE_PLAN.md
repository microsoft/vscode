# Building an AI-Native IDE from Code-OSS: Research Report & Implementation Plan
*Generated: 2026-06-10 | Revised (v2): 2026-06-11 | Sources: 15 | Confidence: High*

> **v2 STRATEGY REVISION — Extension-first, not core-hacking.**
> Two findings changed the plan:
> 1. VS Code (≥1.104, your clone is 1.125) ships an official **Language Model Chat
>    Provider API**: any extension can plug its own models into built-in chat,
>    agent mode, and inline edit — including local models via Ollama, fully
>    offline ([VS Code BYOK](https://code.visualstudio.com/blogs/2025/10/22/bring-your-own-key),
>    [GitHub changelog](https://github.blog/changelog/2026-04-22-bring-your-own-language-model-key-in-vs-code-now-available/),
>    [docs](https://code.visualstudio.com/docs/agent-customization/language-models)).
> 2. Deep core modification is the #1 fork-killer — upstream merges become
>    unmanageable ([EclipseSource](https://eclipsesource.com/blogs/2024/12/17/is-it-a-good-idea-to-fork-vs-code/),
>    [Pullflow](https://www.pullflow.com/blog/cursor-vs-code-fragmentation/)).
>
> **Revised architecture — four boxes:**
> 1. **Shell (the fork)**: branding via `product.json`, Open VSX gallery, and
>    granting proposed-API access to your extension. Core stays pristine.
> 2. **Brain Adapter (your `kin-ai` extension)**: chat model provider (official
>    API), inline completion provider (Tab), agent tools. ALL AI logic lives here.
> 3. **Gateway (small server you own)**: holds API keys, routes per task —
>    fast code model for Tab, frontier model for chat/agent, apply-specialist
>    (e.g. Morph) for edits. Local-only mode = route to Ollama.
> 4. **Memory (context engine)**: local Merkle-tree indexer → tree-sitter
>    chunking → local vector DB → retrieve/rerank → priority-packed prompts.
>
> One-sentence strategy: *the fork is packaging, the extension is the product,
> the gateway is the control point, the index is the differentiator — rent
> models until usage data justifies owning them.*
>
> Phase order is unchanged (rebrand → chat → Tab → context → agent), but
> Phases 1–4 should be implemented in the extension + gateway, NOT by editing
> `src/vs/workbench/contrib/*` as the v1 text below suggests. Read v1's
> Part 2 table as a map of *which built-in surfaces you attach to via API*,
> not as files to modify.

## Executive Summary

You have VS Code OSS **1.125.0** cloned at `/Users/nandu/Documents/Kin`. This is a
*recent* checkout that already ships (a) the open-sourced `extensions/copilot`
("GitHub Copilot Chat") extension, and (b) native workbench contributions for
`chat`, `inlineChat`, and `inlineCompletions`. **You are not starting from a blank
editor — the AI surface area already exists.** The smart move is therefore NOT to
rebuild chat/autocomplete UI, but to (1) rebrand the fork, (2) plug *your own model
backend* into the existing extension-API seams, and (3) progressively replace the
generic providers with Cursor-style purpose-built models (Tab, Fast Apply, Context
engine, Agent).

Cursor's moat is not the fork itself — forking Code-OSS is legal and common
(Cursor, Windsurf, Antigravity all do it). The moat is **four custom-trained,
latency-optimized models + a retrieval/prompt-compilation pipeline**, all of which
require editor-level access that a plain extension can't get. This plan maps each of
those pieces onto concrete VS Code internals and a 5-phase build order.

---

## Part 1 — How Cursor Actually Works

Cursor is a three-layer system that runs on every keystroke
([Data Science Collective](https://medium.com/data-science-collective/how-cursor-actually-works-c0702d5d91a9),
[MMNTM deep dive](https://www.mmntm.net/articles/cursor-deep-dive)):

**Layer 1 — The Fork.** Building on Code-OSS gives control over rendering, the file
system, and the extension host. Every flagship feature (speculative Tab, Shadow
Workspace, Background Agents) needs editor-level access *no plugin API provides* —
that's *why* it's a fork and not an extension
([lowcode.agency](https://www.lowcode.agency/blog/is-cursor-ai-vs-code-fork)).

**Layer 2 — The Models (the real moat).** Four distinct purpose-built models:

| Model | Job | Technique |
|---|---|---|
| **Tab / autocomplete** | Predict your *next edit* (not just next token), often across lines/files | Custom sparse model + speculative decoding that reuses your existing source as draft tokens; an RL loop retrains ~every 90 min on accept/reject signal |
| **Fast Apply** | Take a model's suggested diff and *apply it to the real file* reliably | A fine-tuned ~70B model doing "speculative edits" at ~1000 tok/s (~3500 char/s) — ~13× faster than vanilla inference. Trained from "fast-apply" prompts + GPT-4 generated data ([Cursor blog](https://cursor.com/blog/instant-apply), [Fireworks](https://fireworks.ai/blog/cursor)) |
| **Chat / Composer (Agent)** | Reason, plan, multi-file edits | Routes to frontier models (Claude, GPT, Gemini) per task type |
| **Embedding** | Semantic codebase search | Powers `@codebase` retrieval |

**Layer 3 — Context & Prompt Engine.**
- **Indexing**: On open, Cursor builds a **Merkle tree** of file hashes. Every ~5 min
  it diffs the tree against the server and re-uploads *only changed branches*.
  Files are chunked with **tree-sitter at function/class boundaries** (not fixed
  line counts), embedded, and stored in a vector DB (Turbopuffer/S3). Paths are
  obfuscated; the server stores embeddings + line ranges, the *client* reads the
  actual code locally — so no plaintext source is persisted server-side
  ([Cursor: secure indexing](https://cursor.com/blog/secure-codebase-indexing),
  [Towards Data Science](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/)).
- **Retrieval**: a query is embedded → vector similarity search → rerank → returns
  obfuscated path + line range → client fetches local code.
- **Prompt compilation**: **Priompt** compiles prompts as JSX where every element
  has a *priority*. When context exceeds the token budget, low-priority elements are
  dropped via binary search — so the most relevant context always survives.

**Shadow Workspace** = a hidden, mirrored copy of your project where the AI can make
edits and get *real* language-server/lint feedback (errors, types) before showing
you anything — an iterative self-correction loop invisible to the user
([Inside Cursor 3](https://medium.com/@ayush.s0410/inside-cursor-3-the-architecture-of-an-agent-first-ide-in-2026-60c681a8df1d)).

---

## Part 2 — Mapping Cursor's Pieces onto YOUR Repo

Your checkout already has the seams. Use them instead of inventing UI:

| Cursor feature | Existing hook in your repo | What you build |
|---|---|---|
| Tab autocomplete | `src/vs/workbench/contrib/inlineCompletions/` + `InlineCompletionItemProvider` API | A provider that calls *your* Tab model; later, next-edit (multi-line/cross-file) ghost text |
| Inline edit (Cmd-K) | `src/vs/workbench/contrib/inlineChat/` | Wire to your edit model + Fast Apply |
| Chat / Agent panel | `src/vs/workbench/contrib/chat/` + `extensions/copilot` (copilot-chat) + `ChatParticipant`/`LanguageModel` proposed APIs | Replace Copilot's backend auth/model with your provider; add agent tools |
| Apply diff | Chat "apply in editor" flow | Your Fast Apply model + a streaming diff applier |
| `@codebase` retrieval | (none — build it) | Indexer service + embeddings + retrieval, exposed as a chat variable/tool |
| Model routing | `extensions/copilot/chat-lib`, `LanguageModelChatProvider` | A router that picks model per task |

Note: `package.json` already has `compile-copilot`, `watch-copilot`, and
`codex:gen-protocol` scripts, and `build/codex/` exists — Microsoft's recent OSS
drop wired a lot of this for you.

---

## Part 3 — Phased Implementation Plan

### Phase 0 — Build, Run, Rebrand (Week 1)
1. Toolchain: Node ≥22.14 (`.nvmrc`), Python, native build tools. `npm install`.
2. `npm run watch` (runs `watch-client` + `watch-extensions` + `watch-copilot`), then
   `./scripts/code.sh` (macOS/Linux) to launch the dev build.
3. **Rebrand** `product.json`: `nameShort`, `nameLong`, `applicationName`,
   `dataFolderName`, `urlProtocol`, bundle identifiers, and icons in `resources/`.
   Pick a name (your dir is "Kin" — good candidate).
4. **Legal/marketplace**: you *cannot* ship Microsoft's marketplace or proprietary
   built-in extensions. Point `extensionsGallery` in `product.json` to
   **Open VSX** (`https://open-vsx.org`). The MIT-licensed Code-OSS base is fine to
   fork and rebrand.

**Milestone**: your branded editor launches from source.

### Phase 1 — Wire Your Model Backend (Weeks 2–3)
1. Stand up a thin backend gateway (Node/Python) that proxies to model providers
   (Anthropic/OpenAI/local via Ollama or vLLM) — keeps API keys server-side and lets
   you swap models without shipping a new build.
2. Implement a `LanguageModelChatProvider` (or repurpose `extensions/copilot`'s
   `chat-lib`) that talks to your gateway. Get the **Chat panel answering** with your
   own model first — it's the fastest visible win.
3. Strip/replace Copilot auth so users sign into *your* service.

**Milestone**: chat works end-to-end on your infra.

### Phase 2 — Tab Autocomplete (Weeks 3–5)
1. Register an `InlineCompletionItemProvider` that sends a **prefix/suffix (FIM)
   window** + a few related open files to your gateway.
2. Start with a hosted code model (DeepSeek-Coder, Qwen-Coder, Codestral) behind the
   gateway; optimize latency (cancel-on-keystroke, debounce, caching, streaming).
3. *Later moat*: train/fine-tune a **next-edit** model and a speculative-decoding
   serving path (vLLM/TensorRT-LLM) to hit Cursor-like latency.

**Milestone**: ghost-text completions from your model.

### Phase 3 — Context Engine / `@codebase` (Weeks 5–8)
1. **Indexer**: walk the workspace, build a **Merkle tree** of file hashes for cheap
   change detection.
2. **Chunk** with **tree-sitter** at function/class boundaries.
3. **Embed** chunks → store in a vector DB (Qdrant/LanceDB/pgvector locally;
   Turbopuffer-style serverless later). Cache by chunk-content hash.
4. **Retrieve**: embed query → ANN search → rerank → inject top chunks into the
   prompt. Expose as a chat variable/agent tool.
5. **Prompt budgeter**: adopt a priority-based compiler (Microsoft open-sourced
   **Priompt**) so context degrades gracefully under the token limit.

**Milestone**: `@codebase` answers questions grounded in the repo.

### Phase 4 — Apply & Agent (Weeks 8–12)
1. **Fast Apply**: stream the model's edit and apply it as a diff to the real file
   with a visible diff preview + accept/reject. Start with a normal model + a robust
   diff/merge applier; upgrade to a fine-tuned apply model for speed/reliability later.
2. **Agent / Composer**: a tool-using loop (read file, search, edit, run terminal,
   read diagnostics) over multi-file tasks. VS Code's terminal + LSP diagnostics give
   you the feedback channel.
3. **Shadow Workspace**: mirror the project (separate folder or hidden window) so the
   agent edits and reads *real* lint/type errors before surfacing changes.

**Milestone**: multi-file agentic edits with self-correction.

---

## Part 4 — Better Ideas (How to Differentiate, Not Just Clone)

1. **Local-first / BYO-model.** Cursor is cloud-locked. Ship a first-class
   Ollama/vLLM path so privacy-sensitive devs run fully offline. Real wedge against
   Cursor & Copilot.
2. **Don't rebuild the model moat on day 1.** Rent it: start on hosted open models
   (DeepSeek/Qwen/Codestral) + a Fast-Apply service like **Morph**
   ([morphllm.com](https://www.morphllm.com/cursor-fast-apply)). Train custom models
   *only* once you have usage data — that's also what makes the RL accept/reject loop
   possible.
3. **Open, inspectable context.** Cursor's index is a black box. Show users exactly
   what files/chunks were retrieved and let them pin/exclude — trust as a feature.
4. **Spec-first agent.** Lean into plan-then-execute with a visible task graph and
   checkpoints rather than racing on raw autocomplete latency.
5. **Avoid the fragmentation tax.** Forking Code-OSS means you inherit a *huge* merge
   burden tracking upstream VS Code + Open VSX's smaller extension ecosystem
   ([DEV: hidden cost of fragmentation](https://dev.to/pullflow/forked-by-cursor-the-hidden-cost-of-vs-code-fragmentation-4p1)).
   Keep your changes in clearly-isolated `contrib` folders + your extension; rebase
   often.

---

## Key Takeaways
- **Don't build UI from scratch** — your 1.125.0 checkout already has chat,
  inlineChat, inlineCompletions, and the copilot-chat extension. Plug models into the
  existing API seams.
- **The order that ships value fastest**: rebrand → chat on your backend → Tab →
  context engine → apply/agent.
- **The moat is models + retrieval, not the fork.** Rent those capabilities first
  (hosted open models + Morph-style apply), collect data, then train your own.
- **Differentiate** on local-first/BYO-model, transparent retrieval, and spec-first
  agents — areas where Cursor is weak.

## Sources
1. [How Cursor Actually Works — Data Science Collective](https://medium.com/data-science-collective/how-cursor-actually-works-c0702d5d91a9)
2. [Cursor Deep Dive: $29B by Forking VS Code — MMNTM](https://www.mmntm.net/articles/cursor-deep-dive)
3. [Is Cursor AI a VS Code Fork? — lowcode.agency](https://www.lowcode.agency/blog/is-cursor-ai-vs-code-fork)
4. [Securely indexing large codebases — Cursor](https://cursor.com/blog/secure-codebase-indexing)
5. [How Cursor Actually Indexes Your Codebase — Towards Data Science](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/)
6. [Editing Files at 1000 Tokens/sec (Instant Apply) — Cursor](https://cursor.com/blog/instant-apply)
7. [How Cursor built Fast Apply with Speculative Decoding — Fireworks](https://fireworks.ai/blog/cursor)
8. [Fast Apply Architectures — Morph](https://www.morphllm.com/cursor-fast-apply)
9. [Inside Cursor 3: Agent-First IDE — Medium](https://medium.com/@ayush.s0410/inside-cursor-3-the-architecture-of-an-agent-first-ide-in-2026-60c681a8df1d)
10. [Real-world engineering challenges: building Cursor — Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/cursor)
11. [Forked by Cursor: hidden cost of fragmentation — DEV](https://dev.to/pullflow/forked-by-cursor-the-hidden-cost-of-vs-code-fragmentation-4p1)
12. [What a Difference a VS Code Fork Makes — Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/01/26/what-a-difference-a-vs-code-fork-makes-antigravity-cursor-and-windsurf-compared.aspx)

## Methodology
3 web searches across architecture, indexing, and Fast-Apply topics; cross-referenced
12 sources (Cursor's own engineering blog, Fireworks, Pragmatic Engineer, Towards
Data Science, trade press). Inspected the local repo: `product.json`, `package.json`,
`extensions/copilot/`, and `src/vs/workbench/contrib/` to ground the plan in your
actual code. Confidence High on architecture; serving-stack latency numbers are
Cursor's self-reported figures.
