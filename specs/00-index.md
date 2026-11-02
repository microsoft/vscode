# Focused Code OSS build specifications

These specifications describe the focused Code OSS build profile and its Trinoris integrations. The build profile is implemented in source; build and runtime validation remain tracked separately in [04-implementation-plan.md](04-implementation-plan.md).

## Spec list

| ID | Document | Purpose |
| --- | --- | --- |
| 01 | [Feature alignment matrix](01-feature-alignment.md) | Classifies workbench areas against the target IDE and proposes minimal-profile defaults. |
| 02 | [Build profile and flag model](02-build-profile.md) | Defines how builds select, validate, and propagate feature flags. |
| 03 | [Feature boundaries and dependency rules](03-feature-boundaries.md) | Records cross-feature constraints for SCM, chat, terminal, extensions, and core editor services. |
| 04 | [Implementation and validation plan](04-implementation-plan.md) | Sequences repository analysis, implementation, and verification. |
| 05 | [Trinoris coordination panel](05-trinoris-coordination-panel.md) | Designs the in-editor coordination screens, metrics, data sources, CLI adapter, refresh model, and safety boundaries. |
| 06 | [Trinoris platform device login](06-trinoris-platform-device-login.md) | Specifies a Trinoris authentication provider and device flow for product-owned sign-in surfaces while preserving unrelated VS Code providers. |
| 07 | [Trinoris Code OSS branding](07-trinoris-branding.md) | Records the source artwork, replaced app/title-bar asset paths, and maintenance requirements. |
| 08 | [Trinoris voice control](08-trinoris-voice-control.md) | Specifies safe, push-to-talk voice commands for the coordination panel, reusing generic speech/UI components without enabling Copilot Voice. |
| 09 | [Trinoris CLI panel contract](09-trinoris-cli-panel-contract.md) | Defines CLI discovery, capability negotiation, missing-data behavior, and the JSON APIs needed by the coordination panel. |

The original broad analysis remains in [minimal-build-features.md](minimal-build-features.md) as background. The numbered specs are the maintained, reviewable design set.

## Decisions already captured

- Integrated terminal is mandatory in every profile.
- Keep the generic Chat/Agents session UI needed by selected Codex and Claude integrations; disable Copilot-specific chat, sign-in, and services independently.
- Extension installation must be explicitly declared; recommendations alone are not authorization to install.
- Do not install dependencies or run builds unless explicitly requested.
- Keep the repository's existing default build behavior until a custom profile is selected.
- Codex/Claude integrations must be selectable independently of Copilot Chat.

## Resolved product decisions

1. Minimal disables built-in Git and Source Control UI while retaining the generic SCM service for remaining workbench consumers and third-party providers.
2. Minimal keeps the Extensions UI for deliberate marketplace installs. The built-in extension set is declared through `bundledExtensions`; no extension is installed automatically.
3. Codex and Claude are selected through explicit provider flags and use the shared agent session UI. Copilot Chat remains independently disabled.

