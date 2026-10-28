---
name: policy-and-managed-settings
description: Use whenever adding, modifying, or reviewing any Copilot, agent, LLM, AI, tool, permission, sandbox, MCP, model, telemetry, feature-gate, setting, configuration, or enterprise control—especially anything an organization or administrator may need to manage. Start here to decide whether it belongs in runtime managed settings, a typed SDK contract, VS Code configuration policy, extension policy, or a split implementation. Run on every new Copilot/agent/LLM control and ANY change that adds a `policy:` field.
---

# Enterprise Policy and Managed Settings

Route a control by **where the governed behavior is implemented**, not by who requested it. Most Copilot agent controls belong in the runtime, not VS Code.

| Governed behavior | Destination | Guide |
|---|---|---|
| Copilot runtime: tools, shell, files, URLs, MCP, plugins, subagents, permissions, sandbox, runtime model/telemetry | Runtime managed setting (SDK type only if the host owns the value) | [sdk-runtime-policy.md](./sdk-runtime-policy.md) |
| VS Code editor/workbench | VS Code configuration `policy:` | [vscode-policy.md](./vscode-policy.md) |
| Extension-contributed setting | `extensionConfigurationPolicy` in vscode-distro | [extension-policy.md](./extension-policy.md) |
| Independent runtime **and** editor behavior | Split: runtime setting for agent behavior, VS Code policy for editor behavior only | both of the above |
| Existing permission policy introduced before 1.133 | Bounded migration only | [legacy-permission-policy.md](./legacy-permission-policy.md) |

Supporting references:

- [github-managed-settings.md](./github-managed-settings.md): projecting managed settings into VS Code policy (channels, precedence, key declaration).
- [policy-support-maintenance.md](./policy-support-maintenance.md): Agent Host support inventory and Policy Diagnostics readiness.
- [local-testing.md](./local-testing.md): mock policy server.

## Rules

- Runtime enforcement is authoritative. Do not duplicate runtime parsing, matching, or security decisions in VS Code, and never substitute editor UI suppression for runtime enforcement.
- New Copilot controls go directly in the shared managed-settings schema/SDK contract. Do not add a VS Code setting to mirror or bridge one.
- Closed to new properties (existing entries stay for compatibility): GitHub token/account `IPolicyData` fields consumed by `AccountPolicyService`, the legacy VS Code setting bridge, and pre-1.133 permission translation.
- Split controls: add the runtime capability first and keep existing editor behavior until it ships. Keep both projections semantically aligned; keep permission authorization separate from sandbox containment; make create/resume/removal/peer/subagent/cloud behavior explicit.
- Every VS Code or extension policy change needs an `agentHostPolicySupport` entry and `npm run export-policy-data`. Never hand-edit `build/lib/policies/policyData.jsonc`.
- Never log raw enterprise rules/values or add telemetry containing them.
- Trust source and tests over these docs. Document decisions and invariants; link to source instead of copying it.

## Policy-disabled UI

Prefer an option that stays visible but disabled, with the briefcase managed-policy indicator, a localized reason, and an accessible next step, over silently hiding it ([design guidance](../design-philosophy/SKILL.md#make-unavailable-features-understandable)). Use policy provenance to distinguish prohibition from unsupported, feature-gated, or pending states. Presentation never changes authorization: a disabled option must not re-enter the runtime's allowed set or bypass create/resume/write validation. Test policy refresh/removal, keyboard and pointer activation, and stale menus; preserve AI-hiding behavior.
