# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

<!-- agent-ninja-START -->
## Agent Skills

> **IMPORTANT**: Prefer skill-led reasoning over pre-training-led reasoning.
> Read the relevant SKILL.md before working on tasks covered by these skills.

### Skills

| Skill | Description |
|-------|-------------|
| [accessibility](.github/skills/accessibility/SKILL.md) | Primary accessibility skill for VS Code. |
| [agent-host-e2e-tests](.github/skills/agent-host-e2e-tests/SKILL.md) | Use when writing, recording, updating, or troubleshooting the agent host end-to-end tests under s... \| These tests run the whole agent host end-to-end (real server, real bundled provider SDK/CLI, real... |
| [agent-host-logs](.github/skills/agent-host-logs/SKILL.md) | Analyze Agent Host debug log exports. \| Use this skill to orient to bundles produced by `Developer: Export Agent Host Debug Logs...`. These are different from the normal timestamped Code OSS log di... |
| [author-contributions](.github/skills/author-contributions/SKILL.md) | Identify all files a specific author contributed to on a branch vs its upstream, tracing code thr... \| commits = subprocess.check_output( ['git', 'log', f'--author={AUTHOR}', '--format=%H', f'{UPSTREA... |
| [auto-perf-optimize](.github/skills/auto-perf-optimize/SKILL.md) | Run agent-driven VS Code performance or memory investigations. \| User describes a VS Code workflow and asks whether it leaks or grows memory; User asks the agent to launch VS Code, drive a scenario... |
| [azure-pipelines](.github/skills/azure-pipelines/SKILL.md) | Use when validating Azure DevOps pipeline changes for the VS Code build. \| When modifying Azure DevOps pipeline files (YAML files in `build/azure-pipelines/`), you can validate changes locally usin... |
| [chat-customizations-editor](.github/skills/chat-customizations-editor/SKILL.md) | Use when working on the Chat Customizations editor — the management UI for agents, skills, instru... \| Split-view management pane for AI customization items across workspace, user, extension, and plug... |
| [chat-perf](.github/skills/chat-perf/SKILL.md) | Run chat perf benchmarks and memory leak checks against the local dev build or any published VS C... \| Before/after modifying chat rendering code (`chatListRenderer.ts`, `chatInputPart.ts`, markdown r... |
| [chat-pet-sprite-creation](.github/skills/chat-pet-sprite-creation/SKILL.md) | Use when creating or changing VS Code chat pet sprite art, sprite sheets, state animations, eye t... \| Create pet sprites that feel like one continuous character rather than separate drawings. Start f... |
| [code-oss-logs](.github/skills/code-oss-logs/SKILL.md) | Find and read timestamped process logs from Code OSS dev builds, including main.log, renderer.log, extension host logs, ... \| Find and display logs from the most recent Code OSS or Agents app dev run. |
| [component-fixtures](.github/skills/component-fixtures/SKILL.md) | Use when creating or updating component fixtures for screenshot testing, or when designing UI com... \| Component fixtures render isolated UI components for visual screenshot testing via the component ... |
| [cpu-profile-analysis](.github/skills/cpu-profile-analysis/SKILL.md) | Analyze V8/Chrome CPU profiles (.cpuprofile) and DevTools trace files (Trace-*.json). \| User provides a `.cpuprofile` or `Trace-*.json` file and wants to understand performance; Investigating why o... |
| [customizations-in-the-agent-host](.github/skills/customizations-in-the-agent-host/SKILL.md) | Architecture and hard-won debugging lessons for customization enablement (plugins, MCP servers, a... \| Customizations are the plugins, MCP servers, agents, skills and instructions that an agent-host s... |
| [design-philosophy](.github/skills/design-philosophy/SKILL.md) | The VS Code design philosophy — a shared Values→Principles→Moves vocabulary for reasoning about U... \| This skill is the **canonical VS Code design philosophy** — the single source of truth for how we... |
| [feedback-learning](.github/skills/feedback-learning/SKILL.md) | Classify and record explicit corrective feedback without turning skills or instructions into appe... \| Use this skill when a user explicitly corrects an implementation or design approach, rejects a pa... |
| [fix-ci-failures](.github/skills/fix-ci-failures/SKILL.md) | Investigate and fix CI failures on a pull request. \| This skill guides you through diagnosing and fixing CI failures on a PR using the `gh` CLI. The user has the PR branch checked out locally. |
| [fix-errors](.github/skills/fix-errors/SKILL.md) | Guidelines for fixing unhandled errors from the VS Code error telemetry dashboard. |
| [flaky-smoke-tests](.github/skills/flaky-smoke-tests/SKILL.md) | Diagnose intermittent VS Code Electron smoke-test failures from the Azure DevOps Flaky Smoke Tests pipeline (defi... \| Use this skill for failures from the Azure DevOps **Flaky Smoke Tests** pipeline: |
| [heap-snapshot-analysis](.github/skills/heap-snapshot-analysis/SKILL.md) | Analyze V8 heap snapshots to investigate memory leaks and retention issues. \| User provides `.heapsnapshot` files (before/after a workflow); User has heap snapshots captured by another skill or scr... |
| [integrated-browser](.github/skills/integrated-browser/SKILL.md) | Use this when working on the VS Code integrated browser ("browserView") to understand its archite... \| The integrated browser ("browserView") embeds a **real Chromium browser** in VS Code, backed by a... |
| [integration-tests](.github/skills/integration-tests/SKILL.md) | Use when running integration tests in the VS Code repo. \| Integration tests in VS Code are split into two categories: |
| [memory-leak-audit](.github/skills/memory-leak-audit/SKILL.md) | Audit code for memory leaks and disposable issues. \| Reviewing code that registers event listeners or DOM handlers; Fixing reported memory leaks (listener counts growing over time); Creating object... |
| [otel](.github/skills/otel/SKILL.md) | OpenTelemetry instrumentation for the Copilot Chat extension — covers the four agent execution pa... \| When adding, changing, or reviewing OTel telemetry in the Copilot Chat extension, **always read t... |
| [policy-and-managed-settings](.github/skills/policy-and-managed-settings/SKILL.md) | Use whenever adding, modifying, or reviewing any Copilot, agent, LLM, AI, tool, permission, sandb... \| Choose the policy destination by **where the governed behavior is implemented**, not by which tea... |
| [sessions](.github/skills/sessions/SKILL.md) | Core principles and workflow router for changes to the Agents Window under src/vs/sessions. \| Use this skill for implementation, review, or design work under `src/vs/sessions/**`. |
| [smoke-tests](.github/skills/smoke-tests/SKILL.md) | Use when running VS Code smoke tests or working on smoke-test CI steps. \| Smoke tests live in `test/smoke/` and drive a full VS Code instance (Electron, web, or remote) through end-to-end user flows. |
| [sweeper-fix](.github/skills/sweeper-fix/SKILL.md) | Fix a microsoft/vscode issue that the VS Code Sweeper reviewed as agent-fixable. \| You are implementing a **narrow, localized fix** for a single microsoft/vscode issue, on behalf of the maintainer ... |
| [symbolicate-crash-dump](.github/skills/symbolicate-crash-dump/SKILL.md) | Symbolicate a native VS Code crash dump (.dmp) using electron-minidump. \| Turn a native VS Code crash dump (`.dmp`) into a readable backtrace with method names using [electron-minidump](https://www... |
| [tool-rename-deprecation](.github/skills/tool-rename-deprecation/SKILL.md) | Ensure renamed built-in tool references preserve backward compatibility. \| Run this skill on **any change to built-in tool or tool set registration code** to catch regressions:; Renaming a tool's `... |
| [ui-scenario-validation](.github/skills/ui-scenario-validation/SKILL.md) | Use when reproducing a UI bug or verifying a fix by driving a real VS Code window end to end and capturing evi... \| Drives a real VS Code instance through a scenario and records reproducible evidence. |
| [unit-tests](.github/skills/unit-tests/SKILL.md) | Use when running unit tests in the VS Code repo. |
| [update-screenshots](.github/skills/update-screenshots/SKILL.md) | Download screenshot baselines from the latest CI run and commit them. \| Screenshot baselines are **no longer stored in the repository**. They are managed by an external screenshot service (`hediet-... |
| [ux-css-layout](.github/skills/ux-css-layout/SKILL.md) | VS Code CSS conventions, file organization, class naming, standard sizes, SplitView/Grid layout, scrollable content, responsive layout, and text overflow/ellipsis patterns. |
| [ux-theming](.github/skills/ux-theming/SKILL.md) | VS Code theming, color tokens, widget styles, focus indicators, and high-contrast theme support. Use when registering colors, styling widgets with theme tokens, or ensuring HC/focus compliance. |
| [vscode-dev-workbench](.github/skills/vscode-dev-workbench/SKILL.md) | Use when the user wants to run the vscode.dev server locally and exercise the VS Code workbench o... \| The `vscode-dev` repo is the `vscode.dev` server. When run locally with `?vscode-quality=dev`, it... |

<!-- agent-ninja-END -->
