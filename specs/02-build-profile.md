# 02 — Build profile and flag model

## Goals

- Provide a reproducible minimal build without changing default Code OSS behavior.
- Remove disabled feature modules from generated outputs, not merely hide their UI.
- Use one feature resolution across desktop, web, and any server/package lanes that consume the affected modules.
- Reject unknown options and unsupported dependency combinations early.
- Make the resolved profile visible in build logs and apply it to product metadata and bundled assets.

## Implemented interface

Use the checked-in `build/features.json` to define named profiles and defaults:

- `default`: preserves the repository's full feature and extension set.
- `minimal`: editor-focused build with terminal enabled, selected optional groups disabled, and Codex/Claude providers explicitly declared.

The optional `chatPanel` flag controls the Chat sidebar view. The minimal profile sets it to false while retaining the shared agent session UI required by the selected Codex/Claude providers.

For the Trinoris-focused minimal profile, keep the generic Chat/Agents session surface if Codex or Claude use it. Exclude Copilot-specific harness and product services through a separate `copilotChat` capability. A single `chat` boolean would be too coarse and could remove the selected agents' in-editor panel.

`build/features.json` defines `default` and `minimal`. Select one with `VSCODE_BUILD_PROFILE=default|minimal`; absent means `default` for build tasks. Example: `VSCODE_BUILD_PROFILE=minimal npm run gulp -- vscode-linux-x64-min`. Build tooling validates the schema, logs the selected profile, and injects literal feature values into Vite and the Next build lane. In the TypeScript watch/dev path, `VSCODE_BUILD_PROFILE` selects the runtime development fallback; absent means `minimal`. The top-level Copilot watcher uses that same minimal fallback and skips compiling Copilot unless the default profile is explicitly selected. Profiles are currently named presets; arbitrary per-flag command-line overrides are not implemented.

The schema enumerates 16 optional boolean controls, explicit `agents.codex` and `agents.claude` provider declarations, a separate `bundledExtensions` package allowlist, and the `terminal: true` invariant. The resolver strictly validates profile names, feature keys, types, provider keys, the extension list, and terminal invariant. Vite and Next receive compile-time constants; the gulp packaging lanes consume profile values for product metadata, extension compilation, and extension packaging. Workbench entry points gate Git, Source Control UI, Debug UI, task execution and UI, notebook editors/renderers, Interactive and REPL, notebook extension bridges, testing, remote entry contributions, welcome surfaces, review comments, extension UI, Settings Sync UI, product services, and Copilot Chat. The minimal profile retains SCM and Debug service APIs for remaining workbench consumers while omitting their visible UI, the Source Control view, built-in Git, and built-in JavaScript debugger. Task and notebook API consumers receive disabled service contracts while their UIs and tools are omitted. Agent host registration respects Codex and Claude profile values. Shared agent sessions and terminal remain available in the minimal profile.

The build profile also declares `bundledExtensions`, a package allowlist separate from the 16 runtime feature controls. `"*"` preserves all extensions in the default profile; minimal enumerates the exact language and workbench extensions to compile and bundle. The Extensions UI remains available for deliberate marketplace installs.

## Resolution and compile-time injection

Resolve the profile in build tooling. Validate the schema before starting compilation. Inject literal profile values at Vite/Next bundling boundaries and use the same resolver for gulp packaging.

Use statically analyzable feature gates around grouped imports so the bundler can remove the disabled branch. Dynamic imports alone do not guarantee exclusion from output chunks. Avoid broad text replacement and runtime settings: they risk inconsistent desktop/web behavior and retain unnecessary code.

## Build lanes to cover

The implementation covers common, desktop, and web workbench entry points, Vite and Next feature injection, built-in extension filtering/packaging, top-level Copilot compile/watch tasks, and desktop/server product metadata and runtime packaging. The Rust CLI does not bundle workbench code or built-in extensions, so it does not consume this profile. The TypeScript watch/dev fallback is the minimal profile; it does not currently select a different profile from `VSCODE_BUILD_PROFILE`. A profile is complete only when each lane either consumes it or clearly documents that it does not include the feature.

## Compatibility behavior

- No profile argument means `default` and must preserve current behavior.
- `minimal` must be explicit until its bundle has passed parity and smoke checks.
- Unknown profiles, feature keys, malformed values, and invalid dependencies fail before compilation.
- Runtime user settings cannot turn on a feature compiled out of the build.
- A feature compiled in may still have its normal runtime enablement policy.

