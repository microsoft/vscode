# Focused Code OSS build specifications

These specifications describe a build profile for a coding IDE focused on editing, code navigation, diagnostics, linting, formatting, an integrated terminal, and explicitly selected Codex or Claude agents. They are analysis and design documents; they do not imply that features have already been removed.

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

The original broad analysis remains in [minimal-build-features.md](minimal-build-features.md) as background. The numbered specs are the maintained, reviewable design set.

## Decisions already captured

- Integrated terminal is mandatory in every profile.
- Keep the generic Chat/Agents session UI needed by selected Codex and Claude integrations; disable Copilot-specific chat, sign-in, and services independently.
- Extension installation must be explicitly declared; recommendations alone are not authorization to install.
- Do not install dependencies or run builds unless explicitly requested.
- Keep the repository's existing default build behavior until a custom profile is selected.
- Codex/Claude integrations must be selectable independently of Copilot Chat.

## Open product decisions

1. Does “remove Source Control” mean remove built-in Git while preserving the SCM API for third-party providers, or remove the SCM framework itself?
2. Should the minimal build retain marketplace installation of explicitly declared extensions?
3. Should Codex/Claude use a built-in agent session UI, or integrate through separately installed extensions/CLI tools?

