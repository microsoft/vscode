# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

**Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

- **DIAL provider:** `extensions/dial-chat-model-provider/` — bundled language-model chat provider for DIAL Core
- **BYOK pipeline:** `src/vs/workbench/contrib/chat/` (e.g. `hasByokModelsContribution.ts`, `embeddingModelContribution.ts`) and `extensions/copilot/src/platform/workspaceChunkSearch/`, `extensions/copilot/src/platform/endpoint/`

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Production installer (fork)

To build an unsigned, size-optimized Windows x64 installer with DIAL + BYOK:

- **Full guide:** [build/custom/PRODUCTION-BUILD.md](build/custom/PRODUCTION-BUILD.md)
- **Agent quick reference:** [.github/instructions/production-build.instructions.md](.github/instructions/production-build.instructions.md)

Key steps: `npm run compile-dial` → extension gulp tasks → esbuild bundle → `$env:CI='true'` → `vscode-win32-x64-min-ci` → Inno Setup tasks.
