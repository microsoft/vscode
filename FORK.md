# Fork customizations

This document describes how [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode) differs from upstream [microsoft/vscode](https://github.com/microsoft/vscode).

## Upstream tracking

| Branch | Role |
| --- | --- |
| `main` | Tracks upstream Microsoft VS Code (Code - OSS) |
| `feat/forward-reasoning` | Active feature work: BYOK model pipeline + DIAL provider integration |
| `feat/forward-reasoning-lm-provider` | Related LM provider work |
| `feat/317187-lm-usage` | Language model usage reporting |

To refresh this document after merging feature branches:

```bash
git diff main...HEAD --stat
git log main..HEAD --oneline
```

**Current delta vs `main` (committed on `feat/forward-reasoning`):** 55 files changed, ~3,081 insertions, ~195 deletions.

---

## 1. Bundled DIAL Chat Model Provider

The fork ships the DIAL language-model provider as a built-in extension instead of requiring a separate VSIX install.

| Item | Location |
| --- | --- |
| Extension source | [`extensions/dial-chat-model-provider/`](extensions/dial-chat-model-provider/) |
| User guide | [`extensions/dial-chat-model-provider/README.md`](extensions/dial-chat-model-provider/README.md) |
| Architecture | [`extensions/dial-chat-model-provider/ARCHITECTURE.md`](extensions/dial-chat-model-provider/ARCHITECTURE.md) |
| Upstream extension repo | [sergey-zinchenko/DialChatModelProvider](https://github.com/sergey-zinchenko/DialChatModelProvider) |
| Build hooks | [`package.json`](package.json) (`compile-dial`, `watch-dial`), [`build/npm/dirs.ts`](build/npm/dirs.ts) |

**What it does:**

- Registers a `LanguageModelChatProvider` with vendor `dial`
- Authenticates to DIAL Core via OIDC (Keycloak + PKCE) or API key
- Exposes DIAL deployments in the Copilot model picker and other `vscode.lm.*` clients
- Contributes embedding models for BYOK semantic search (see section 2)

**Build the extension alone:**

```bash
npm run compile-dial
npm run watch-dial
```

Required before production packaging — see [build/custom/PRODUCTION-BUILD.md](build/custom/PRODUCTION-BUILD.md).

**License:** Apache 2.0 — see [`extensions/dial-chat-model-provider/LICENSE`](extensions/dial-chat-model-provider/LICENSE) and [`NOTICE`](extensions/dial-chat-model-provider/NOTICE).

---

## 2. BYOK / non-Copilot model pipeline

These changes let signed-in users work with extension-provided language models (e.g. DIAL) without a GitHub Copilot subscription, and route chat, embeddings, utility, and risk-assessment workloads through BYOK endpoints.

### Workbench gating

| File | Change |
| --- | --- |
| [`src/vs/workbench/contrib/chat/browser/hasByokModelsContribution.ts`](src/vs/workbench/contrib/chat/browser/hasByokModelsContribution.ts) | Owns `github.copilot.hasByokModels` context key; true when non-Copilot vendors or extension-provided models are available |
| [`src/vs/workbench/contrib/chat/browser/embeddingModelContribution.ts`](src/vs/workbench/contrib/chat/browser/embeddingModelContribution.ts) | Wires extension-contributed embedding models into workbench |
| [`src/vs/workbench/contrib/chat/browser/utilityModelContribution.ts`](src/vs/workbench/contrib/chat/browser/utilityModelContribution.ts) | Configurable utility models via BYOK |
| [`src/vs/workbench/contrib/chat/browser/tools/chatToolRiskAssessmentService.ts`](src/vs/workbench/contrib/chat/browser/tools/chatToolRiskAssessmentService.ts) | Configurable risk-assessment model |
| [`src/vs/workbench/contrib/chat/common/languageModels.ts`](src/vs/workbench/contrib/chat/common/languageModels.ts) | Language model service updates for BYOK vendors |
| [`src/vs/workbench/contrib/chat/common/model/chatModel.ts`](src/vs/workbench/contrib/chat/common/model/chatModel.ts) | `promptTokens` handling in chat responses |

### Copilot extension integration

| File | Change |
| --- | --- |
| [`extensions/copilot/src/extension/byok/common/byokProvider.ts`](extensions/copilot/src/extension/byok/common/byokProvider.ts) | BYOK provider routing |
| [`extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts`](extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts) | Chat requests to non-Copilot vendors; forwards model capabilities |
| [`extensions/copilot/src/platform/endpoint/vscode-node/extEmbeddingEndpoint.ts`](extensions/copilot/src/platform/endpoint/vscode-node/extEmbeddingEndpoint.ts) | Extension-contributed embedding endpoint |
| [`extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkEmbeddingsIndex.ts`](extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkEmbeddingsIndex.ts) | BYOK embedding index (major expansion) |
| [`extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkSearchService.ts`](extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkSearchService.ts) | Workspace search with BYOK embeddings and remote fallback |
| [`extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkAndEmbeddingCache.ts`](extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceChunkAndEmbeddingCache.ts) | Multi-process embedding cache |
| [`extensions/copilot/src/platform/workspaceChunkSearch/common/byokEmbeddingModel.ts`](extensions/copilot/src/platform/workspaceChunkSearch/common/byokEmbeddingModel.ts) | BYOK embedding model type |
| [`extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts`](extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts) | Language model access for BYOK |
| [`extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts`](extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts) | Endpoint provider for BYOK chat |

### Sessions UI

| File | Change |
| --- | --- |
| [`src/vs/sessions/browser/sessionsSetUpService.ts`](src/vs/sessions/browser/sessionsSetUpService.ts) | BYOK-aware session setup |
| [`src/vs/sessions/contrib/chat/browser/sessionTypePicker.ts`](src/vs/sessions/contrib/chat/browser/sessionTypePicker.ts) | Model picker with BYOK support |
| [`src/vs/sessions/contrib/chat/browser/newChatWidget.ts`](src/vs/sessions/contrib/chat/browser/newChatWidget.ts) | New chat widget BYOK integration |
| [`src/vs/sessions/contrib/providers/localChatSessions/browser/localChatSessionsProvider.ts`](src/vs/sessions/contrib/providers/localChatSessions/browser/localChatSessionsProvider.ts) | Local sessions provider updates |

### API surface

| File | Change |
| --- | --- |
| [`src/vscode-dts/vscode.d.ts`](src/vscode-dts/vscode.d.ts) | Embeddings API additions |
| [`src/vscode-dts/vscode.proposed.chatProvider.d.ts`](src/vscode-dts/vscode.proposed.chatProvider.d.ts) | Chat provider proposal tweaks |
| [`src/vs/workbench/api/common/extHostLanguageModels.ts`](src/vs/workbench/api/common/extHostLanguageModels.ts) | Extension host language model bridge |
| [`src/vs/workbench/api/common/extHostTypes.ts`](src/vs/workbench/api/common/extHostTypes.ts) | Token normalization in usage reporting |

---

## 3. Merging upstream

When pulling changes from [microsoft/vscode](https://github.com/microsoft/vscode):

1. Merge or rebase `main` from upstream into this fork's `main`.
2. Resolve conflicts in the areas listed above — especially:
   - `src/vs/workbench/contrib/chat/`
   - `src/vs/sessions/`
   - `extensions/copilot/src/platform/workspaceChunkSearch/`
   - `extensions/copilot/src/platform/endpoint/`
   - `src/vscode-dts/`
3. Re-run `npm run compile` and extension tests.
4. Update this file if the diff scope changes (`git diff main...HEAD --stat`).

---

## 4. Security

| Component | Reporting |
| --- | --- |
| VS Code core / fork patches | [GitHub Security Advisories](https://github.com/sergey-zinchenko/vscode/security/advisories/new) on this repo |
| DIAL extension (credentials, OAuth) | [`extensions/dial-chat-model-provider/SECURITY.md`](extensions/dial-chat-model-provider/SECURITY.md) |

---

## 6. Production installer

Build an unsigned Windows x64 installer with DIAL and BYOK from this fork:

| Document | Purpose |
| --- | --- |
| [build/custom/PRODUCTION-BUILD.md](build/custom/PRODUCTION-BUILD.md) | Full guide: prerequisites, CI map stripping, gulp sequence, verification |
| [.github/instructions/production-build.instructions.md](.github/instructions/production-build.instructions.md) | Agent quick reference |

**Fork-specific notes vs upstream Microsoft docs:**

- DIAL is bundled from `extensions/dial-chat-model-provider/` — run `npm run compile-dial` before packaging (no VSIX in `build/custom/`).
- Set `CI=true` when running `vscode-win32-x64-min-ci` to exclude `.js.map` files from the installer.
- Keep `@github/copilot/sdk/index.js` out of `build/.moduleignore`.
- `patchWin32DependenciesTask` skips non-Windows `.node` binaries from Copilot SDK vendor trees.

Output: `.build/win32-x64/user-setup/VSCodeSetup.exe`

---

## 7. Licenses

| Component | License |
| --- | --- |
| VS Code core (this repo, excluding DIAL extension) | MIT — [`LICENSE.txt`](LICENSE.txt) |
| DIAL Chat Model Provider extension | Apache 2.0 — [`extensions/dial-chat-model-provider/LICENSE`](extensions/dial-chat-model-provider/LICENSE) |
