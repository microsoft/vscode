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
- the active project display label;
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

This shared workbench service computes customization migrations for an explicit chat session. File migrations include source URIs and migratable-configuration metadata for flows that need source type and storage. MCP migrations report known servers' binary harness compatibility, discovery and policy-coverage state, and eligible source-to-target candidates using the current Agent Host delivery projection. MCP execution revalidates candidates and ordered session working-directory roots before guarded writes and returns structured per-server results. The service also produces a localized, harness-specific hint with navigation metadata so UI consumers can open the relevant file migration or MCP server surface.

### `IHarnessDescriptor`

Descriptors declare presentation and discovery policy. Widgets consume the descriptor rather than branching on a harness identifier.

A descriptor may define:

- visible management sections;
- per-section creation behavior;
- hidden or renamed item types;
- MCP collection exclusions that do not hide host-published servers;
- an optional, session-scoped MCP compatibility provider;
- required agent availability;
- external items, enablement, and plugin actions.

Harness compatibility is distinct from MCP runtime and enablement state. Providers acquire a ref-counted scope for the active session and publish resolved state plus generic per-server compatibility and localized details, allowing shared widgets to present support without importing provider-specific assessment logic.

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

The overview owns a unified Discover surface. It normalizes installed item-bearing sections from their existing owners and uses the platform `ICustomizationMarketplaceService` as its available catalog source. Catalog results are not installed customizations, do not contribute to customization counts, and do not imply compatibility with the active harness or permission to install. The UI and installation consumers depend on source-neutral contracts, not individual catalog backends.

Marketplace composition supplies `ICustomizationMarketplaceSource`s with unique, stable IDs and cheap source metadata declaring each source's enablement setting. The requesting window selects enabled source IDs and forwards them with each query, including over shared-process IPC. Only selected sources are instantiated and queried. Each source owns transport, response validation, metadata normalization, and validation of any installation provenance. Resource identity includes the source ID, opaque identifier, and version, including for deduplication and pending installation state.

Marketplace page size bounds the combined result list, not each source's contribution. Search sources return a descending sequence of optional 0–100 relevance scores across their native pages; a score is an adapter-assigned ranking signal, not a trust or quality rating. The service merges those sequences by score, treating absent scores as zero and breaking ties by source-registration order. Browsing preserves source-registration order and each source's native order. It queries sources concurrently, backfills short pages, preserves stable native fetch sizes, and buffers undisplayed entries without re-querying exhausted sources. A failed source rejects the page rather than silently returning partial results.

Marketplace continuations are opaque, short-lived references scoped to the issuing service, query, type, page size, and selected sources. Buffered entries and native cursors remain in a bounded service-owned cache rather than travelling through caller-controlled continuations as installation provenance. Failed or cancelled continuations do not consume their prior buffered state. Expired or evicted continuations require starting a new search.

The AgentFinder public feed is enabled through the default-off `chat.customizations.marketplace.sources.agentFinderPublicFeed.enabled` experiment. Desktop windows query it in the shared process; web windows use the workbench request service and its remote fallback. Its source adapter routes queryless browsing and text search to independently supplied providers. Both operations use the bounded, cancellable REST provider, which preserves validated search relevance scores and owns REST metadata-to-installation provenance validation. Replacing search does not imply replacing browse or translating runtime candidate handles into repository or registry installation provenance.

The independent `chat.customizations.copilotConnectors.enabled` experiment adds an authenticated Copilot connectors source. The workbench composes it with `IAgentFinderMarketplaceService`, whose transport exposes only the public feed; connector queries and GitHub credentials never cross that shared-process channel. Connectors use the current default GitHub account without widening the shared scope bundle, validate catalog metadata and HTTPS MCP endpoints, and route installation through the Copilot connector consent flow. The MCP page presents connector status and lifecycle actions in a Connectors section, includes connected connector MCP servers under Installed, and uses connector-managed detail rather than an editable local definition. Agent Host independently consumes the connected-server endpoint and is gated by the same experiment through forwarded root configuration.

Connector search ranks the cached catalog locally using VS Code fuzzy matching, without additional search API or model requests. Its field-weighted relevance is heuristic, not calibrated to AgentFinder semantic scores despite sharing the 0–100 interval. Queryless connector browsing remains unscored and retains native catalog order.

Marketplace has no global experiment gate: available discovery is enabled when any source is enabled. When none are enabled, Discover remains available for installed search, sources remain lazy, and installation observers are stopped. Changing the enabled source set cancels and resets available discovery. Source enablement also gates installation of that source's resources; disabling a source cancels its pending operations and invalidates its cached skill installation state without cancelling another source's installs. Enabling a source does not bypass AI-disable, registry, or installation policy gates; disabling it does not remove previously installed resources.

The shared workbench `ICustomizationMarketplaceInstallService` routes explicit install actions using the source-validated installation descriptor, never by interpreting an identifier or a pagination token. MCP servers resolve by name against the configured registry, Copilot connectors use their source-owned connector name for consent, plugins retain the existing trust and managed-marketplace gates, and skills are imported as complete packages into a selected harness-provided workspace or user location. Unsupported installation formats remain available for discovery without an install action.

Contributed management sections can declare `enablementSettings` to gate visibility and instantiation on any listed setting being enabled, and implement `setVisible` to scope work to the selected section in a visible editor. Without that property the section is ungated; an empty list never enables it. Disabling the last setting disposes its widget and restores the overview. Sections that perform remote discovery must cancel discovery requests when hidden or disposed and must not start discovery while AI features are disabled. Confirmed installs belong to their services rather than the section widget; skill imports revalidate their initiating context and source-enablement lifetime before committing files.

## Active-session context

In the Agents Window, the customization harness and project root track `ISessionsService.activeSession`. Opening the editor synchronizes it with the currently active session, and switching the active session can update the editor's harness and project context. A transient project-root override takes precedence while it is set.

The management-editor command may select a section, target a session type, reveal a URI-addressable customization, and open migration mode for a targeted migration category. Operations that migrate files bind destination resolution and confirmation to their initiating session and stop if the active session changes.

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
