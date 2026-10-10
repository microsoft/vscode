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

This shared workbench service computes customization migrations for an explicit chat session. File migrations include source URIs and migratable-configuration metadata for flows that need source type and storage. MCP migrations report known servers' binary harness compatibility, discovery and policy-coverage state, eligible source-to-target candidates, and excluded servers with localized details explaining why they cannot be migrated. MCP candidates and failures identify user or workspace storage so consumers can scope hints, checklist entries, and activity consistently. MCP execution revalidates candidates and ordered session working-directory roots before guarded writes and returns structured per-server results. The service also produces a localized, harness-specific hint with navigation metadata so UI consumers can open the relevant file migration or MCP server surface.
The service exposes migration-relevant customization changes so consumers can recompute without depending directly on the underlying prompt, Agent Host, or MCP services.
Harness-specific MCP migration planning and execution are supplied by the active harness descriptor so the shared service does not depend on a provider implementation.
MCP candidates may carry raw snapshots of properties that migration removes. Consumers must explain those removals before confirmation; providers and execution revalidate the snapshots so the approved changes cannot silently expand.

### `IHarnessDescriptor`

Descriptors declare presentation and discovery policy. Widgets consume the descriptor rather than branching on a harness identifier.

A descriptor may define:

- visible management sections;
- per-section creation behavior;
- hidden or renamed item types;
- MCP collection exclusions that do not hide host-published servers;
- an optional, session-scoped MCP compatibility provider;
- an optional MCP migration provider;
- required agent availability;
- external items, enablement, and plugin actions.

Harness compatibility is distinct from MCP runtime and enablement state. Providers acquire a ref-counted scope for the active session and publish resolved state plus generic per-server compatibility and localized details, allowing shared widgets to present support without importing provider-specific assessment logic.

When a new descriptor field is added, update every descriptor factory and both workbench registrations.

### Customization sources

`IMcpWorkspaceInstallTargetService` supplies supported workspace MCP install destinations to both the shared pickers and installation validation. The editor implementation offers project folders and the workspace configuration when present; the Sessions implementation offers only project folders, excluding its synthetic window-settings workspace. Configuration-format feature gates remain separate from destination eligibility.

Customization source-folder providers may assign an opaque workspace group identity to creation folders and discovered migration candidates. Migration uses that identity to keep each workspace customization in its originating root without inferring provenance from URI path similarity.

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

Host-published MCP items retain the runtime-reported configuration source through typed metadata and the shared item contract, independently of lifecycle state or the availability of a local configuration definition.

The home page shows the original Overview until the default-off marketplace visibility flag and at least one marketplace source are enabled; it then shows unified Discover. With Marketplace visibility off, the legacy MCP and Plugin Available sections remain available. Switching surfaces disposes the previous surface and restores the current visible sections and harness context. Discover normalizes installed item-bearing sections from their existing owners and uses the platform `ICustomizationMarketplaceService` as its available catalog source. Catalog results are not installed customizations, do not contribute to customization counts, and do not imply compatibility with the active harness or permission to install. The UI and installation consumers depend on source-neutral contracts, not individual catalog backends. Marketplace-backed installation state and reversible install, repair, or uninstall operations remain owned by `ICustomizationMarketplaceInstallService`.

Marketplace composition supplies `ICustomizationMarketplaceProvider`s with unique provider IDs and user-visible source IDs. Multiple internal providers can belong to one contributed source; selecting that source queries all of its applicable providers while results and errors retain the contributed source ID. Per-source enablement and the query service remain independent for legacy management lists; only Discover presentation and Marketplace installation apply the separate visibility setting on top of enabled sources. The platform service contributes only existing platform registries such as MCP Gallery. The workbench composes configured Plugin marketplaces and Connectors, and an active harness may contribute the GitHub Feed through its SDK search provider. Only selected providers are instantiated and queried. Each provider owns transport, response validation, metadata normalization, and validation of any installation provenance. Resource identity includes the source ID, opaque identifier, and version, including for deduplication and pending installation state. Optional resource icons accept either one theme-independent URI or a `{ light, dark }` URI bundle; consumers resolve bundles against the active VS Code theme.

Harnesses may supply an `ICustomizationMarketplaceInstallProvider`. Its SDK or runtime inventory is authoritative for installation identity, ownership, recovery, and removal; the workbench does not create a second durable installation record. The install service removes legacy machine-profile installation records without reading or migrating them. It projects provider inventory through the same immutable snapshot used by Skills, MCP, Discover, and management actions, and keeps only a bounded, in-memory association between a provider installation and catalog presentation metadata seen in the current window. That association can enrich installed rows with icons and descriptions but cannot make a resource installed. Provider inventory remains usable when the catalog is offline or no longer returns an entry, with fallback type icons and retained SDK catalog metadata.

A harness may contribute the GitHub Feed through `ICustomizationMarketplaceSearchProvider`; there is no platform REST compatibility transport. A harness without that provider, including Local, does not advertise or query the GitHub Feed even when its setting is enabled. For queryless Browse, the Copilot provider mirrors GitHub App's bounded static editorial list of Azure, WorkIQ, and Security Best Practices after one SDK marketplace-list call confirms each owning marketplace is registered and available. Installation uses the runtime's plugin owner. Non-empty queries use bound SDK catalog search. An authentication refusal becomes a neutral source status with an explicit Sign In action; successful sign-in retries the same query, while cancellation leaves it stopped. Persistent authentication, unsupported-runtime, or unavailable-session refusals become source errors rather than successful empty results. SDK search and installation do not require a visible chat: when either needs a policy session and no materialized chat is available, Agent Host lazily creates a hidden session with no tools, instructions, memory, session store, or enabled MCP servers. That session is never published in session discovery, is reused while current, and is deleted on client restart, authentication change, or after ten minutes idle. SDK search projects only candidates the runtime marks installable and whose source VS Code can pass to the owning install operation; it omits discovery-only Skills, policy-blocked or embedded-source candidates, and direct catalog plugins until exact-revision plugin installation exists. Native pagination remains retained so the workbench can backfill later actionable pages. SDK candidate handles and pagination tokens remain inside Agent Host behind bounded, expiring workbench selection and cursor IDs; installing an SDK search result consumes the exact retained candidate instead of repeating a text search. Harness or session changes invalidate marketplace continuations. SDK catalog and receipt rows use a validated GitHub publisher avatar when available. MCP rows without one join their trusted GitHub MCP Registry card URL to the same curated owner-avatar snapshot used by GitHub App; unknown or non-GitHub identities retain the type-icon fallback. Icons remain presentation data and never establish ownership.

Marketplace page size bounds the combined result list, not each source's contribution. Search sources return a descending sequence of optional 0–100 relevance scores across their native pages; a score is an adapter-assigned ranking signal, not a trust or quality rating. The service merges those sequences by score, treating absent scores as zero. Adapter-assigned entry priority breaks equal relevance scores and orders queryless browsing into tiers: custom entries precede defaults, and entries at the same tier interleave round-robin. Neither priority nor relevance is displayed as a quality or trust rating. The service preserves each source's native order and browse rotation across page boundaries. It queries sources concurrently, backfills short pages, preserves stable native fetch sizes, and buffers undisplayed entries without re-querying exhausted sources.

Native fetch failures suspend only the affected sources. Pages retain validated results, report per-source errors, and leave the combined total unknown; those errors persist through healthy-source pagination and IPC. A native page can report a terminal failure after a valid prefix, or a non-terminal warning when one underlying marketplace failed but its other pages remain available. Consumers show source-specific warnings and retry actions, including when every source fails, rather than presenting failures as successful empty results. A workbench source can provide a user-initiated recovery action, such as authorization, before restarting the query; recovery callbacks are renderer-owned and never cross catalog IPC. Sources can classify recovery as sign-in-required rather than a transport failure; consumers preserve that distinction in source status and empty states. Caller/source cancellation and invalid query, page, or continuation contracts still reject the request.

Marketplace continuations are opaque, short-lived references scoped to the issuing service, query, type, page size, and selected sources. Buffered entries, suspended-source errors, and native cursors remain in a bounded service-owned cache rather than travelling through caller-controlled continuations as installation provenance. Partial failures and cancellation do not consume the prior continuation's buffered state or browse rotation. Source retry restarts the combined query, replacing rather than appending recovered results so ranking stays valid. Expired or evicted continuations require starting a new search.

Context-bound sources can supply an in-process `cacheToken` whose lifetime is independent of request cancellation. The aggregator validates it before using buffered entries and after native fetches; invalidating a source's context requires a new query even when the next page would not otherwise fetch that source. Validity tokens never cross marketplace IPC.

The GitHub Feed's `chat.customizations.marketplace.sources.publicFeed.enabled` setting defaults on, but the feed is usable only while Marketplace visibility is enabled and the active harness supplies SDK search. A disabled feed is not initialized or queried; changing the setting, harness, or active session cancels its pending queries and installations. Sources with legacy management surfaces remain independently available. Removing the REST compatibility path avoids duplicate catalog requests, candidate validation, and installation planning in VS Code, at the cost that Local and SDK versions without catalog search have no GitHub Feed.

The existing MCP Gallery feed participates whenever Marketplace is visible; it has no separate marketplace feature flag. Its renderer-local adapter reads the configured MCP registry, maps display metadata without executable configuration, and carries the registry's opaque cursor without assigning a relevance or quality score. A custom source is advertised only when its configured URL differs from the product registry. When the product does not declare a default gallery, the default provider reuses the active manifest that powers the legacy MCP feed. Its installation descriptor preserves the validated registry URL; installation and uninstall reject stale or same-name entries from another registry before applying the existing MCP eligibility and installation policy. Registry changes cancel and reset discovery. When Marketplace is visible, MCP management keeps installed-server controls but routes gallery discovery to Discover; otherwise its original Available section and gallery search remain.

Configured Plugin marketplaces are also an existing feature with no additional marketplace flag. The Plugin source composes custom and default native providers behind one logical source ID, matching MCP Gallery composition. `IPluginMarketplaceService` owns effective references, policy filtering, opaque pagination, and partial native-marketplace errors; thin adapters select custom or default references and map display metadata. Plugin providers remain in the renderer and are independent of the SDK GitHub Feed. Custom Plugin entries precede defaults at equal relevance. Configured Plugin marketplaces filter unsupported formats before paging so totals count only supported plugins.

The default-off `chat.customizations.marketplace.enabled` experiment controls marketplace visibility. When it is off, Overview and the legacy Plugin Available marketplace (default, custom, and workspace marketplaces) remain visible; Discover performs no catalog or installation work. When it is on, configured Plugin marketplaces move from Plugin Available to Discover even if the GitHub Feed is off. Changing Marketplace visibility or the independently enabled GitHub Feed cancels and resets discovery. Source availability also gates installation and repair of its resources; disabling a source cancels its pending work without deleting provider inventory or owner state and without cancelling another source's installs. Marketplace visibility does not bypass AI-disable, MCP installation policy, or plugin trust and managed-marketplace restrictions, and disabling it does not remove previously installed resources.

The independent `chat.customizations.copilotConnectors.enabled` experiment adds an authenticated Copilot connectors source. The workbench composes it with the SDK GitHub Feed and MCP Gallery while connector account selection and catalog state remain in the renderer. On desktop, a separate scoped shared-process transport owns bounded HTTP requests to the product-defined connector endpoint; it accepts only catalog, connect, and disconnect operations with a per-request credential. Web uses the workbench request service. Neither connector credentials nor recovery actions cross the other catalog channels.

The connector experiment never changes the scopes requested by normal default-account sign-in. Existing sessions are checked silently; browsing cannot prompt for consent. An ordinary GitHub OAuth session may browse the eligible `/plugins` catalog without connector scope, but client-visible connection status and connection metadata remain unknown until an explicitly requested connector authorization. An HTTP 403 on a narrow-scope catalog request is reported as a catalog/access limitation and never converted into permission to request the Connector scope. GitHub Feed sign-in recovery uses this same default account and prefers an already-authorized Connector-scoped session for it, rather than selecting another signed-in GitHub account. When both sources need only the default account, Discover coalesces their recovery into one Sign In invitation and one query restart. The additional Connector permission is requested only from an explicit Connect, Reconnect, Disconnect, or connection-check action. Authorization preserves the active account, reuses already-authorized sessions, uses the authentication provider's normal consent flow rather than storing or manufacturing credentials, and is unavailable for GitHub Enterprise. Lacking the optional Connector permission must not prevent ordinary Copilot authentication or catalog browsing. Connectors validate catalog metadata and HTTPS MCP endpoints and route installation through the connector consent flow. The MCP page includes only connected connector MCP servers in its Installed tree and routes their rows to connector-managed details and lifecycle controls; available connectors remain in Discover. Before a Copilot agent session becomes available, Agent Host enables the Copilot runtime's Connector and managed-MCP feature flags, resolves the runtime's opaque account selection for the session credential, and invokes the runtime Connector reconciliation API. After an authoritative scoped catalog refresh establishes or changes connected membership, the local Agent Host marks every live Copilot backing stale behind its active turn. The next turn transparently resumes the same chat and history through the normal launch path, which reconciles the runtime-owned Connector projection before sending; a session initializing across the change is marked stale before registration, and unscoped catalog results never change live tool availability. The runtime owns connector service requests, catalog validation, collision-safe managed MCP projection, credential refresh, and endpoint-bound credential delivery; Agent Host does not fetch or parse connector MCP definitions itself.

Connector search ranks the cached catalog locally using VS Code fuzzy matching, without additional search API or model requests. Its field-weighted relevance is heuristic, not calibrated to SDK catalog relevance despite sharing the 0–100 interval. Queryless connector browsing remains unscored and retains native catalog order. Connector continuations pin a bounded source-owned snapshot, so ordinary catalog refreshes affect new searches rather than reorder existing pages. The catalog service supplies snapshots bound to its source/default-account/authentication-session lifetime and invalidates them when that context changes.

The shared workbench `ICustomizationMarketplaceInstallService` routes explicit install actions using the source-validated installation descriptor, never by interpreting an identifier or pagination token. When the active harness supplies an install provider, provider inventory and mutations take precedence. Copilot SDK Skills and MCP servers use receipt-owned list, plan, confirmation, apply, recovery, and uninstall operations; SDK plugins use their canonical plugin install identity. The workbench presents the exact SDK review before allowing apply, and the Agent Host accepts confirmation only for the still-pending operation and matching review. A provider restart or expired plan requires a fresh review.

Harnesses without an install provider can install only resources from existing owning services: configured Plugin marketplaces, MCP Gallery, and Connectors. Skill, direct MCP, direct plugin, and other SDK catalog installation kinds require the harness provider and never fall back to a VS Code-owned installer. Local associations are window-local and derived from exact configured-plugin identity, MCP registry identity, or connector account state; they are not restored as independent installation truth. Connector connection state remains remotely authoritative, and configured Plugin or MCP Gallery discovery can reconstruct exact associations after restart. Catalog presentation metadata is best effort: installed resources always retain fallback type icons, while custom icons appear after the matching catalog entry has been observed in the current window.

Contributed management sections can declare `enablementSettings` to gate visibility and instantiation on any listed setting being enabled, and implement `setVisible` to scope work to the selected section in a visible editor. Without that property the section is ungated; an empty list never enables it. Disabling the last setting disposes its widget and returns to the active home surface. Sections that perform remote discovery must cancel discovery requests when hidden or disposed and must not start discovery while AI features are disabled. Confirmed installs belong to their services rather than the section widget; skill imports revalidate their initiating context and source-enablement lifetime before and after the final move, removing their new target if cancellation occurs during it.

## Active-session context

In the Agents Window, the customization harness and project root track `ISessionsService.activeSession`. Opening the editor synchronizes it with the currently active session, and switching the active session can update the editor's harness and project context. A transient project-root override takes precedence while it is set.

The management-editor command may select a section, target a session type, reveal a URI-addressable customization, and open migration mode for a targeted migration category. Operations that migrate files bind destination resolution and confirmation to their initiating session and stop if the active session changes.

Provider-backed items retain provider identity through the shared contract. Shared widgets must not import or branch on provider implementations.

Host-reported MCP provenance distinguishes user, workspace, plugin, built-in, managed-catalog, and signed-in-account sources. Account-contributed servers retain that source through protocol metadata and display a signed-in-account explanation when the runtime does not expose an editable definition. Tool telemetry reports only the bounded source kind, never the account identity.

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
