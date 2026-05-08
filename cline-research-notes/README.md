# Cline research notes

This folder holds **agent-authored reference documents** created while exploring the [Cline](https://github.com/cline/cline) repository. They are **not** official project documentation; they summarize architecture, integrations, and comparisons for internal study or onboarding.

## Contents

| Document | What it covers | When to read it |
|----------|----------------|-----------------|
| [**CLINE_HIGHLIGHTS.md**](./CLINE_HIGHLIGHTS.md) | Broad codebase scan: subscription/OAuth paths (Cline account, Claude Code, ChatGPT/Codex, Copilot, Qwen), evals/CI, gRPC webview bridge, hooks, plan/act, remote config, networking/self-host, notebooks, `.clineignore`, etc. Five “passes” over different areas of the tree. | **Start here** for a feature map and entrypoint index. |
| [**CLINE_SUBSCRIPTION_PROVIDERS_MERGED.md**](./CLINE_SUBSCRIPTION_PROVIDERS_MERGED.md) | Deep dive on **Claude Code** (CLI subprocess, `--disallowedTools`, `apiKeySource`, no `ANTHROPIC_API_KEY` in child env) and **OpenAI Codex** (OAuth, `chatgpt.com/backend-api/codex`), unified into a single report with verified source paths. Includes a short appendix pointing back to highlights. | When you care specifically about **subscriptions without platform API keys** or replicating similar integrations. |
| [**CLINE_CLI_REVIEW.md**](./CLINE_CLI_REVIEW.md) | The **`cli/`** package: Commander commands, Ink TUI vs **plain text / `--json`**, **`runAcpMode`** (ACP), auth quick-setup, **`vscode-lm` excluded** on CLI, MCP `add`, Kanban, shutdown, **`ClineAgent` npm exports**. | When you work on or automate the **`cline`** binary / library, not only the VS Code extension. |
| [**CLINE_COMPLEMENTARY_IDE_CLI_SYNTHESIS.md**](./CLINE_COMPLEMENTARY_IDE_CLI_SYNTHESIS.md) | Compares **Warp**, **Zed**, and **Gemini CLI** to Cline: complementary ideas (BYO agents, collab, auth/quota docs, stream-json, GitHub Actions) and a “best of combined” synthesis. | When you want **product/strategy** context beyond this repo’s code. |

## How the pieces fit together

```text
                    ┌─────────────────────────────┐
                    │   CLINE_HIGHLIGHTS.md       │
                    │   (panorama of the codebase) │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────────┐
│ SUBSCRIPTION_      │  │ CLINE_CLI_REVIEW   │  │ COMPLEMENTARY_IDE_CLI_   │
│ PROVIDERS_MERGED   │  │ (cli/ package)     │  │ SYNTHESIS               │
│ (auth + Claude +   │  │                    │  │ (Warp / Zed / Gemini)   │
│  Codex detail)     │  └────────────────────┘  └──────────────────────────┘
└────────────────────┘
```

- **Highlights** is the hub: breadth-first map and links to real paths under `src/`, `proto/`, `evals/`, etc.
- **Subscription merged** zooms into two providers called out in Highlights; it is the right follow-on for “how does BYO subscription actually work in code?”
- **CLI review** is the host-specific counterpart to the extension—same `Controller`/core, different `HostProvider` and UX (ACP, pipes, `--yolo`).
- **Complementary synthesis** sits outside the repo: it does not describe Cline source line-by-line; it explains what peers in the market do and what could inspire Cline or hybrid setups (e.g. `cline` as a Warp BYO agent).

## Official docs

For user-facing, maintained documentation, use **[https://docs.cline.bot](https://docs.cline.bot)** and the repository’s own `docs/` tree. This bundle is supplementary.

## Maintenance

Regenerate or edit these files when major architecture or provider flows change. Cross-references between documents in this folder use **relative filenames** only (same directory).
