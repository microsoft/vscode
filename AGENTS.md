# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

## Minimal coding IDE scope

- Keep the product focused on code editing, navigation, diagnostics, linting, formatting, and support for Codex or Claude agents. Do not add unrelated features, services, or extensions.
- Do not install dependencies, download tools, start watchers, or run builds unless the user explicitly requests that action. Prefer read-only inspection and checks using tools already available. Report validation that cannot run without installation or a build.
- Every extension installation must be explicitly declared by its full extension ID, purpose, and required dependencies, and explicitly requested by the user before installation. Recommendations are not permission to install. Do not install extension packs or automatically install their dependencies.
- Prefer built-in language features and formatters. Add a linter or formatter extension only when explicitly requested. Codex and Claude extensions follow the same declaration and installation rules.
- Preserve existing user changes and avoid modifying dependency manifests or lockfiles unless required by an explicitly requested dependency change.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).
