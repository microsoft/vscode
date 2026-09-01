# AI customizations architecture

> **Specification change gate:** Do not update this document for UI changes, migrations, discovery fixes, or race handling. Update it only when shared ownership, an interface, the item pipeline, or harness semantics changes.

## Scope

The AI customizations experience discovers and manages agents, skills, instructions, prompts, hooks, MCP servers, tools, and plugins across workspace, user, extension, built-in, and external sources.

This specification defines stable ownership and extension contracts shared by the editor workbench and Agents Window. Individual controls, migration flows, copy, styling, and bug behavior belong in code, component fixtures, and focused tests.

## Ownership

The shared management editor and contracts live under:

- `vs/workbench/contrib/chat/browser/aiCustomization/`;
- `vs/workbench/contrib/chat/common/`.

The Agents Window contributes:

- the customizations tree and overview under `vs/sessions/contrib/aiCustomizationTreeView/`;
- Sessions-specific workspace and harness adapters under `vs/sessions/contrib/chat/`;
- Sessions sidebar entry points under `vs/sessions/contrib/sessions/`.

Shared workbench code owns reusable discovery and management behavior. Sessions code adapts active-session context and provider-backed harnesses without adding Sessions dependencies to `vs/workbench`.

## Service boundary

### `IAICustomizationWorkspaceService`

This service supplies per-window policy to the shared editor:

- available management sections;
- whether the surface is in the Agents Window;
- the active project root;
- welcome-page capabilities.

The editor workbench resolves project context from its workspace. The Agents Window resolves it from the scoped active session.

### `ICustomizationHarnessService`

A harness represents the execution environment that consumes customizations. Storage answers where an item came from; a harness answers which runtime can use it.

The service owns:

- registered harness descriptors;
- the active harness;
- dynamic external harness registration;
- harness-specific item and enablement providers.

Core workbench registrations may expose Local, Copilot CLI, and Claude harnesses when their backing agents are available. The Agents Window exposes harnesses backed by registered session content providers and does not assume a Local fallback.

### `ICustomizationMigrationService`

This shared workbench service computes customization migrations for an explicit chat session. File migrations include source URIs and migratable-configuration metadata for flows that need source type and storage; MCP migrations report known servers' binary harness compatibility together with discovery and policy-coverage state. The service also produces a localized, harness-specific hint summarizing available file migrations for UI consumers.

### `IHarnessDescriptor`

Descriptors declare presentation and discovery policy. Widgets consume the descriptor rather than branching on a harness identifier.

A descriptor may define:

- visible management sections;
- per-section creation behavior;
- hidden or renamed item types;
- MCP collection exclusions that do not hide host-published servers;
- required agent availability;
- external items, enablement, and plugin actions.

When a new descriptor field is added, update every descriptor factory and both workbench registrations.

### Customization sources

`AICustomizationSource` distinguishes local, user, extension, plugin, and built-in items. Source providers and workspace services apply their applicable discovery policy before view-model grouping. Filtering changes presentation only; it does not mutate the underlying customization.

## Item pipeline

Customization sources adapt their data into the shared item contract. The management model aggregates those items, applies harness and storage filters, and projects list items for the active section.

```text
source providers
    -> customization item contract
    -> harness and storage filtering
    -> management model and section counts
    -> list/tree presentation
```

Section counts and rendered rows consume the same filtered model so hidden or disabled sources cannot appear in one surface but not the other.

Prompt-based items use the prompts service adapter. MCP servers, tools, plugins, and external harness items use their owning providers directly when their data does not fit the prompt-file contract.

## Active-session context

In the Agents Window, the customization harness and project root track `ISessionsService.activeSession`. Opening the editor synchronizes it with the currently active session, and switching the active session can update the editor's harness and project context. A transient project-root override takes precedence while it is set.

The management-editor command may select a section, target a session type, and reveal a URI-addressable customization. Operations that migrate files bind destination resolution and confirmation to their initiating session and stop if the active session changes.

Provider-backed items retain provider identity through the shared contract. Shared widgets must not import or branch on provider implementations.

## External customization providers

Extensions may contribute customization items through the proposed `chatSessionCustomizationProvider` API. Its internal contract is `ICustomizationItemProvider` and `ICustomizationItem`.

Changes to that item shape must remain aligned across:

1. the proposed extension API;
2. extension-host protocol DTOs;
3. extension-host mapping;
4. main-thread mapping;
5. the internal customization item.

New fields should be optional unless the proposal explicitly introduces a breaking version.

## Feature gating

Customization surfaces are hidden when AI features are disabled. Contributions use `ChatContextKeys.enabled` for declarative visibility and the applicable entitlement state for programmatic hiding.

Optional sections and migrations remain behind their owning configuration or capability. A disabled feature must not perform background discovery solely to populate hidden UI.

## Testing

Use focused unit tests for filtering, grouping, counts, and service contracts. Use component fixtures for layout, section presentation, narrow viewports, and theme coverage. Cross-window descriptor changes must validate both the editor workbench and Agents Window registrations.

The executable customization test plan lives in [test/ai-customizations.test.md](test/ai-customizations.test.md).

## Change policy

Update this specification only when ownership, a shared service/interface, the item pipeline, or harness semantics change. Do not append UI walkthroughs, migration algorithms, race analyses, file inventories, or regression narratives. Keep those in tests, short code comments, issues, and pull requests.

The external Copilot runtime discovery snapshot is maintained separately in [copilot-customizations-spec.md](copilot-customizations-spec.md).
