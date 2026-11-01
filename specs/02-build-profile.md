# 02 — Build profile and flag model

## Goals

- Provide a reproducible minimal build without changing default Code OSS behavior.
- Remove disabled feature modules from generated outputs, not merely hide their UI.
- Use one feature resolution across desktop, web, and any server/package lanes that consume the affected modules.
- Reject unknown options and unsupported dependency combinations early.
- Make the resolved profile visible in build logs and package metadata.

## Proposed interface

Use the checked-in `build/features.json` to define named profiles and defaults. The initial profile schema is now present. Proposed profiles:

- `default`: equivalent to today's build; all current features enabled.
- `minimal`: editor-focused build with terminal enabled, optional feature groups disabled, and agent providers opt-in.

For the Trinoris-focused minimal profile, keep the generic Chat/Agents session surface if Codex or Claude use it. Exclude Copilot-specific harness and product services through a separate `copilotChat` capability. A single `chat` boolean would be too coarse and could remove the selected agents' in-editor panel.

The first implementation slice selects a profile with `VSCODE_BUILD_PROFILE=default|minimal`; absent means `default`. Example: `VSCODE_BUILD_PROFILE=minimal npm run gulp -- vscode-linux-x64-min`. Individual overrides are deferred until profile behavior is implemented consistently across every lane. The build must print the selected profile before compilation.

Profile schema sketch (not yet implemented):

```json
{
  "profiles": {
    "default": { "features": { "chat": true, "terminal": true } },
    "minimal": { "features": { "chat": false, "terminal": true } }
  }
}
```

The schema enumerates candidate features and encodes the `terminal: true` invariant. Agent providers use explicit provider declarations (`agents.codex` and `agents.claude`) rather than a generic `agents: true` switch. The profile resolver strictly validates profile names, feature keys, types, provider keys, and the terminal invariant, and supplies compile-time constants to Vite and esbuild. Workbench entry points gate Git/SCM, debugging, tasks, notebooks, testing, remote entry contributions, welcome surfaces, review comments, extension UI, Settings Sync UI, product surveys/updates, and Copilot Voice. Extension packaging filters built-in debug and Git extensions; packaged product metadata omits Copilot-specific configuration. Agent host registration respects the Codex and Claude build flags. Shared Chat/Agents sessions and terminal remain available in the minimal profile.

## Resolution and compile-time injection

Resolve the profile once in build tooling. Validate the schema and feature dependency graph before starting compilation. Generate a TypeScript module with literal booleans and a JSON manifest containing profile name, enabled features, and source revision. Import the generated module at entry-point boundaries.

Use statically analyzable feature gates around grouped imports so the bundler can remove the disabled branch. Confirm current Vite and gulp bundling behavior before choosing the exact source pattern. Dynamic imports alone do not guarantee exclusion from output chunks. Avoid broad text replacement and runtime settings: they risk inconsistent desktop/web behavior and retain unnecessary code.

## Build lanes to cover

The investigation has identified common, desktop, and web workbench entry points, Vite client bundling, and gulp packaging lanes. The implementation inventory must also inspect server/remote packaging, extension compilation/packaging, CLI, and development launch tasks. A profile is complete only when each lane either consumes it or clearly documents that it does not include the feature.

## Compatibility behavior

- No profile argument means `default` and must preserve current behavior.
- `minimal` must be explicit until its bundle has passed parity and smoke checks.
- Unknown profiles, feature keys, malformed values, and invalid dependencies fail before compilation.
- Runtime user settings cannot turn on a feature compiled out of the build.
- A feature compiled in may still have its normal runtime enablement policy.

