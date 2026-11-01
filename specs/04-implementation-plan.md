# 04 — Implementation and validation plan

This plan is intentionally staged. Do not begin by deleting source directories: first establish boundaries and a reproducible profile, then remove contributions through build-time gates.

## Phase 1: repository inventory

For each candidate feature, collect:

- direct imports from common, desktop, web, server, and CLI entry points;
- transitive imports and CSS/assets;
- registered services, commands, views, menus, context keys, and extension points;
- references from other features and extension API contracts;
- build/package tasks and product metadata that include related assets or extensions.

Record each dependency as core, optional UI, optional provider, or extension platform. Resolve the Source Control and agent-host decisions in `00-index.md` before declaring independence.

## Phase 2: build profile foundation

Implement a validated profile schema and resolver. Preserve `default` behavior exactly. Generate literal compile-time constants and a profile manifest. Thread the same resolved configuration through development Vite builds and production gulp/package flows. Fail early for invalid options.

## Phase 3: feature gating

Start with high-confidence, low-coupling groups such as welcome/onboarding. Then gate grouped contributions in common and platform-specific entry points. Keep shared services in core until all consumers are accounted for. Separate Git from generic SCM and chat UI from generic agent support when their real import graphs permit it.

## Phase 4: package pruning

After bundle gates work, use profile metadata to omit unused built-in extensions and package assets. Keep dependency manifests deterministic. Do not edit lockfiles for feature switches unless dependency declarations themselves change. Never install dependencies as part of profile resolution.

## Phase 5: validation

Validation will require builds when implementation is authorized; it is not performed as part of this specification work. Required checks should include:

1. Profile schema tests: defaults, overrides, unknown key/profile rejection, invariant enforcement, and dependency errors.
2. Default parity: resolved flags and bundle entry points match existing behavior.
3. Minimal desktop and web builds: both complete and retain editor, language, diagnostics, file, terminal, and selected agent capabilities.
4. Bundle inspection: disabled feature modules and assets are absent from output, not just unreachable at runtime.
5. Extension compatibility checks: explicitly declared formatter/linter/language extensions work; SCM provider behavior matches the selected SCM policy.
6. Smoke checks for startup, file editing, terminal, search, formatting, lint diagnostics, and each selected agent provider.

## Completion criteria

- All known build lanes resolve the same named profile or explicitly state why they do not.
- Default profile is behaviorally unchanged.
- Minimal profile keeps mandatory capabilities and excludes selected optional bundles.
- Output metadata reports the profile and resolved feature list.
- Documentation lists supported combinations and extension install declarations.
- No automatic dependency or extension installation is introduced.

