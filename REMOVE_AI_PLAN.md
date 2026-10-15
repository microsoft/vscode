# Removing Copilot and AI features from this fork

This fork removes GitHub Copilot and every built-in AI capability from VS Code. The work is split into two phases so each pull request stays reviewable and the fork can keep merging from upstream.

| Phase | Branch | What it does | Status |
|---|---|---|---|
| 1 | `remove-ai/phase-1-unwire` | Delete the bundled Copilot extension and its build/CI wiring. Unregister every AI user-facing contribution. Disable the Agents window and agent host. Default AI off. | This PR |
| 2 | `remove-ai/phase-2-delete` (next) | Delete the now-dead AI source trees, decouple core code from AI services, and remove the AI dependencies and build steps. | Planned below |

Decisions taken up front:

- **Phased.** Phase 1 unwires and strips. Phase 2 deletes the dead source once phase 1 is merged and building.
- **Extension APIs stay, but inert.** `vscode.lm`, chat participants, language-model tools and MCP providers keep their API shape, so marketplace extensions that touch them still activate. No models, chat UI or agents are registered behind them.

---

## Phase 1 — unwire and strip (this PR)

One commit per area, so the PR can be reviewed commit by commit.

### 1. Remove the built-in Copilot extension and its build/CI wiring

- Delete `extensions/copilot` (about 62 MB, roughly 4,200 files) and `extensions/prompt-basics`, which was language support for Copilot prompt files.
- **`package.json`:** drop the `compile-copilot`, `watch-copilot*` and `copilot:*` scripts.
- **gulp:** drop `compileCopilotExtensionBuildTask` and the Copilot ripgrep-shim packaging step from the desktop and server builds. That step would throw once the extension is gone.
- **hygiene:** drop the Copilot `engines.vscode` check.
- **ESLint:** drop the Copilot plugin import and config blocks, plus the Copilot entries in `.eslint-ignore`, the bracket-notation and JS allowlists, and CodeQL paths.
- **GitHub workflows:** drop the Copilot jobs and steps, and delete `chat-perf.yml`, `chat-lib-package.yml` and `copilot-setup-steps.yml`.
- **Azure pipelines:** drop the Copilot stage, the Copilot VSIX download, the Copilot test IDs and the `build/azure-pipelines/copilot/` templates.

### 2. Neutralize Copilot service endpoints in `product.json`

- Blank the Copilot entitlement, token, MCP registry/connectors and managed-settings URLs. The default-account service skips empty URLs, so nothing calls `api.github.com/copilot_internal/*`.
- Drop Copilot Chat from `trustedExtensionAuthAccess` and `builtInExtensionsEnabledWithAutoUpdates`, and remove the voice realtime endpoint.
- `defaultChatAgent` itself stays. About 20 non-AI services read it as a required field; making it optional is phase 2.

### 3. Unwire AI UI contributions from the workbench

**Entry points no longer load:**
- the chat view
- agent-host and remote agent-host session contributions
- chat sessions and chat context contributions
- Copilot voice
- the MCP view
- the agent-sessions welcome page
- the model-picker tryout
- remote coding agents
- the electron chat and tunnel-host contributions
- notebook chat

**Files that mix services with UI** keep their `registerSingleton()` calls and lose everything user-facing. Each edited file carries an `// AI removed:` comment saying what went and why the rest stays.

| File | Removed | Kept |
|---|---|---|
| `chat.shared.contribution.ts` | setup/sign-in, status-bar entries, promos and notifications, telemetry, built-in agent tools, URL handlers, agent-plugin discovery/recommendations/auto-update, chat editors and serializers, accessibility help, paste providers, all chat actions and keybindings | services, the three extension-point handlers, settings schema |
| `chat.contribution.ts` | fork-conversation, continue-in-Copilot and export-logs actions | 2 services |
| `inlineChat.contribution.ts` | inline chat controller (Ctrl+I), actions, contributions | 2 session services |
| `agentHost.contribution.ts` | all agent-host workbench contributions | BYOK handler service |
| `mcp/*/mcp.contribution.ts` | discovery (so no MCP server autostart), chat tool bridge, gateway tool broker, commands, server editor, quick access | services, `mcp.json` schema, settings migration |
| `terminal.chat.contribution.ts` | terminal inline chat controller, accessibility views | 2 services |
| `terminal.chatAgentTools.contribution.ts` | run-in-terminal agent tool, sandbox forwarder, add-selection-to-chat | sandbox service, settings migrations |

**Why services stay in phase 1.** 36 AI services are injected by core features, so unregistering them would crash those features at runtime:
- tasks, terminal, notebooks, SCM, search, accessibility, debug, markers
- authentication, the issue reporter, the browser view, update
- the extension API (`mainThread*` customers are created eagerly with every extension host)

With no chat agent or model provider installed, these services are inert. Phase 2 removes the injections and then the services.

### 4. Disable the Agents window and agent host; default AI off

- **Agents window.** `windowsMainService.openAgentsWindow` opens a regular window instead, so `--agents`, agent protocol links and commands never leave the app windowless. The former Agents workspace is skipped on restore, and `isSessionsWindow` is always `false`, so the Agents workbench never loads.
- **Agent host.** `AgentHostEnablementService.enabled` is constant `false`. Every path that starts or prewarms the agent-host process is gated on it: the desktop prewarmer and the remote editor client. The main and server processes only spawn the host lazily, on a renderer request.
- **`chat.disableAIFeatures` defaults to `true`.** This is upstream's own kill switch. It hides the AI affordances still owned by core code: the Getting Started Copilot steps, the help menu and editor watermark entries, the SCM sparkle actions, the extension-page AI actions and AI settings search.

### Verification done for phase 1

| Check | Result |
|---|---|
| Build scripts type-check (`build/`, with its own deps) | Same 20 environmental errors as `main`; nothing new |
| Workbench, extension host, main process and server type-check (`scripts/remove-ai/typecheck-diff.sh main`) | Identical error set to `main` (263 environmental errors, e.g. Electron typings unavailable without a full postinstall); **0 new** |
| DI safety (`scripts/remove-ai/di_check.py . main <entries>`) | For desktop, web and electron-main: no loaded file injects a service that lost its registration. Desktop: 5,078 → 4,755 files loaded, 433 → 419 services. |
| `build/next/build-fast` unit tests (Copilot lane removed) | 18/18 pass |
| ESLint config loads; all workflow YAML parses | OK |

**Not yet verified, so do this before merging:** a real build and launch. I couldn't run Electron in the environment that produced this branch. Run `npm install`, then `npm run compile`, then `./scripts/code.sh`, and smoke-test:
- open a folder, edit, run a task, use the terminal, a notebook and SCM, and install an extension
- confirm no Chat view, no Copilot status-bar item, no Ctrl+I inline chat, no title-bar chat button and no Copilot walkthrough
- `code --agents` opens a normal window

The upstream unit and integration tests for the chat, inline-chat and MCP UI will fail or be irrelevant now; phase 2 deletes them along with the code.

---

## Phase 2 — delete the dead source (next branch)

Phase 2 is easiest as three PRs, in this order. After each step, run `typecheck-diff.sh` and `di_check.py` (both in `scripts/remove-ai/`) against the previous step.

### 2a. Decouple core code from AI services

Remove each AI injection from core features. The goal is that no non-AI file imports from an AI directory. Current core → AI dependencies:

| Area | AI services it injects | Change |
|---|---|---|
| Tasks (`abstractTaskService`, `taskService`) | `IChatService`, `IChatAgentService` | drop agent-aware task-problem handling |
| Terminal (tabs view, decorations, initial hint, voice) | `ITerminalChatService`, `IChatWidgetService`, `IChatContextPickService`, `IChatAgentService`, `ISpeechService` | remove chat entries, hints and terminal dictation |
| Notebooks (cell view models, editor hint, diagnostics, navigation) | `IInlineChatSessionService`, `IChatAgentService`, `InlineChatController` lookups | remove inline-chat hooks |
| Editor (empty-editor hint, dictation, `inlineCompletionsModel`, `completionsEnablement`) | `IInlineChatSessionService`, `IChatSpeechToTextService`, `defaultChatAgent` | remove the AI hint and dictation; keep the generic inline-completions API |
| SCM (`quickDiffModel`, `scmInput`, history chat context) | `IChatEditingService`, `IChatContextPickService`, `defaultChatAgent` | remove chat-editing quick diff and the commit-message sparkle |
| Search, quick access, markers, debug | `IChatWidgetService`, `IQuickChatService`, `IChatContextPickService`, `IChatAgentService` | remove "ask in chat" and context-pick integrations |
| Accessibility | `IChatCodeBlockContextProviderService`, `ISpeechService` | remove chat code-block navigation and speech settings |
| Authentication | `IMcpRegistry`, `IMcpService` | remove the MCP account-management actions |
| Extensions view and service, gallery | `ILanguageModelToolsService`, `IPluginInstallService`, `defaultChatAgent` | remove "Disable AI features" actions and Copilot special-cases |
| Issue reporter, update title bar, canvases, browser view, testing | `ILanguageModelsService`, `IChatUtilityModelService`, `IChatService`, `IChatWidgetService`, `IChatPetService`, `IAgentNetworkFilterService`, `ILanguageModelToolsService` | remove AI features |
| Welcome onboarding, Getting Started, help actions, watermark | `IChatMicrosoftSignInProbeService`, `chatSetupHidden` | remove Copilot steps and entries |
| Accounts / default account (`defaultAccount.ts`), `chatEntitlementService` | `defaultChatAgent` | drop entitlement, token and MCP-registry fetching |
| `IProductConfiguration` | — | make `defaultChatAgent` optional, then remove it from `product.json` |

**Extension API — keep it inert.** Replace the AI `mainThread*` customers with small null implementations in `src/vs/workbench/api/browser/`:
- the language-model registry returns no models and rejects requests
- chat participants and tools register into nothing
- MCP providers are accepted and ignored

The ext-host side (`extHostLanguageModels`, `extHostChatAgents2`, `extHostLanguageModelTools`, `extHostMcp`, `extHostChatSessions`, `extHostChatContext`, `extHostCodeMapper`, `extHost.api.impl`) keeps its API shape. Affected files:
- `browser/mainThread{LanguageModels,LanguageModelTools,ChatAgents2,ChatSessions,ChatContext,ChatCodeMapper,ChatDebug,ChatStatus,ChatInputNotification,ChatOutputRenderer,Mcp,Speech}.ts`
- `mainThreadAuthentication.ts`, `mainThreadEditorTabs.ts`, `common/extHost.protocol.ts`, `common/extHostTypeConverters.ts`, `node/extHostMcpNode.ts`

### 2b. Delete the AI source trees

Once 2a leaves them with no importers outside themselves:

- **workbench/contrib:** `chat`, `inlineChat`, `mcp`, `agentsVoice`, `speech`, `remoteCodingAgents`, `welcomeAgentSessions`, `terminalContrib/{chat,chatAgentTools,voice}`, and `codeEditor/browser/dictation`
- **workbench/services:** `agentHost`, `agentEditorComments`, `aiEmbeddingVector`, `aiRelatedInformation`, `aiSettingsSearch`, `chat`, `mcp`
  - Proposed APIs backed by the `ai*` services go too: decide per API whether to keep a null provider.
- **platform:** `agentHost`, `agentPlugins`, `chat`, `copilotConnectors`, `mcp`, `policy/common/copilotManagedSettings`
- **The Agents window:** `src/vs/sessions` (all of it), the `agentsWindow.ts` helpers, the `openAgentsWindow` plumbing (native host, launch, CLI `--agents`, URL handlers) and `isSessionsWindow`
- **Tests** for all of the above, plus `test/integration/agentHost`
- **Proposed API definitions:** keep the `vscode.proposed.*` files for the inert APIs; delete the rest

### 2c. Dependencies, build and CI

- **`package.json` and `remote/package.json`:** remove `@github/copilot-sdk`, `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex`, `@vscode/copilot-api`, `copilotRuntimeVersion`, and the `codex:*` and `agent-host:*` scripts. Refresh the lockfiles.
- **build:**
  - drop the Agents entry points from `build/next/index.ts`, the sessions files from `gulpfile.vscode.ts`, and `build/vite/mobile-multi-diff*`
  - remove `build/lib/copilot.ts` and the `copilotVersions` product stamping
  - remove `build/agentHost/`, `build/codex/`, `build/agent-sdk/`, and the Copilot handling in `build/darwin/{create-universal-app,verify-macho}.ts`
  - clean up the Copilot entries in `build/.moduleignore*`
- **CI:** remove the SDK canary pipeline (`apply-sdk-canary*`), `mixin-vscode-capi.yml`, the Claude SDK musl workaround in `pr-linux-test.yml`, and the Copilot test-checkpoint IDs.
- **Optional:** the AI-agent contributor docs (`AGENTS.md`, `.github/copilot-instructions.md`, `.github/skills/`). These only guide AI coding agents working *on* the repo and don't ship in the product. Keep or remove to taste.

### Phase 2 risks

- **Merge conflicts with upstream.** These grow with each step. 2a is the most conflict-prone because it touches many core files; landing it in small per-area commits keeps rebases manageable.
- **Missed runtime-only dependencies.** Command IDs invoked by string (`executeCommand('workbench.action.chat.*')`) and context keys don't show up in the type check or the DI check. After 2b, grep for `chat.`, `copilot`, `mcp.` and `inlineChat.` command IDs and context keys in the remaining code, then smoke-test as in phase 1.

---

## Verification tools (`scripts/remove-ai/`)

- **`typecheck-diff.sh [ref]`** — type-checks everything reachable from the desktop, web, extension-host, main-process, server and Agents entry points with native TypeScript 7 (fits in about 7 GB). Prints only errors absent from `ref`.
- **`di_check.py <repo> <ref> <entry.ts>…`** — compares the import closure of each entry point with `ref`. Reports any still-loaded file that injects (`@IFoo` or `accessor.get(IFoo)`) a service whose `registerSingleton` is no longer loaded.
- **`prune_imports.py <files>`** — removes the unused imports that `tsc` reports after unregistering contributions. Pipe `tsc` output into it.

Delete this file and `scripts/remove-ai/` once phase 2 is merged.
