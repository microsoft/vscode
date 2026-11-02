# 04 — Implementation and validation plan

This plan tracks implementation and validation of the focused Code OSS profile. Feature boundaries and build-time gates are in place; package and runtime compatibility checks remain open.

## Current status

- **Inventory:** feature alignment and dependency boundaries are documented in specs 01 and 03.
- **Profile and gates:** `build/features.json` defines default and minimal profiles. Vite, Next, gulp packaging, built-in extension packaging, desktop/server product filtering, and top-level Copilot compile/watch tasks consume the profile. Packaged product metadata records `buildProfile` and resolved `buildFeatures`. The TypeScript watch/dev fallback defaults to minimal and can select default through `VSCODE_BUILD_PROFILE`.
- **Package pruning:** the minimal built-in extension allowlist is applied to extension compile/package paths. Copilot runtime assets and shims are omitted when Copilot Chat is disabled. No dependency installation is run during profile resolution.
- **Typecheck:** `npm run typecheck-client` and `npm run typecheck` in `build/` pass. `git diff --check` passes.
- **Bundle validation:** minimal desktop and web bundles pass. Desktop output inspection confirms disabled chat, notebook, comments, SCM, and debug contribution bundles are absent; disabled feature CSS sources are pruned. Web output does not contain the Dev Tunnels provider bundle.
- **Watch transpilation:** minimal profile skips self-contained disabled Copilot Voice, welcome landing/walkthrough, and review-comment sources, plus test sources. A one-off minimal transpile emitted 7,574 TypeScript files instead of 10,839 and copied 1,021 resource files instead of 2,363. Terminal, generic chat/agent, and session entry sources remained; disabled comments, voice, welcome and test outputs were absent. The regular watch typecheck still checks the full source project.
- **Runtime/package validation:** startup, editor, terminal, search, formatting, lint, selected agent, extension compatibility, and full packaging smoke checks remain open.

## Phase 1: repository inventory (implemented)

For each candidate feature, collect:

- direct imports from common, desktop, web, server, and CLI entry points;
- transitive imports and CSS/assets;
- registered services, commands, views, menus, context keys, and extension points;
- references from other features and extension API contracts;
- build/package tasks and product metadata that include related assets or extensions.

Record each dependency as core, optional UI, optional provider, or extension platform. Resolve the Source Control and agent-host decisions in `00-index.md` before declaring independence.

## Phase 2: build profile foundation (implemented; see limitations above)

The validated schema and resolver are implemented. Vite and Next receive literal build feature values, gulp/package tasks use the resolver, and package product metadata includes the selected profile and resolved values. The TypeScript watch/dev path selects a minimal or default fallback from `VSCODE_BUILD_PROFILE`.

## Phase 3: feature gating (implemented for the listed profile groups)

Start with high-confidence, low-coupling groups such as welcome/onboarding. Then gate grouped contributions in common and platform-specific entry points. Keep shared services in core until all consumers are accounted for. Separate Git from generic SCM and chat UI from generic agent support when their real import graphs permit it.

## Phase 4: package pruning (implemented for declared built-in extension and Copilot assets)

After bundle gates work, use profile metadata to omit unused built-in extensions and package assets. Keep dependency manifests deterministic. Do not edit lockfiles for feature switches unless dependency declarations themselves change. Never install dependencies as part of profile resolution.

## Phase 5: validation

Remaining validation includes:

1. Profile schema tests: defaults, overrides, unknown key/profile rejection, invariant enforcement, and dependency errors.
2. Default parity: resolved flags and bundle entry points match existing behavior.
3. Minimal desktop and web runtime smoke checks: confirm editor, language, diagnostics, file, terminal, and selected agent capabilities.
4. Broader bundle inspection for all disabled feature modules and package assets, including full packaging output.
5. Extension compatibility checks: explicitly declared formatter/linter/language extensions work; SCM provider behavior matches the selected SCM policy.
6. Smoke checks for startup, file editing, terminal, search, formatting, lint diagnostics, and each selected agent provider.

## Completion criteria

- All known build lanes resolve the same named profile or explicitly state why they do not.
- Default profile is behaviorally unchanged.
- Minimal profile keeps mandatory capabilities and excludes selected optional bundles.
- Output metadata reports the profile and resolved feature list.
- Documentation lists supported combinations and extension install declarations.
- No automatic dependency or extension installation is introduced.

