# Mobile Agents Window architecture

> **Specification change gate:** Do not update this document for responsive bug fixes, control behavior, styling, or unfinished work. Update it only when mobile composition, navigation ownership, or the adaptation contract changes.

## Scope

The phone layout adapts the Agents Window to a narrow, touch-first viewport without creating a separate session, provider, or command model.

This specification defines stable mobile composition and ownership. Exact dimensions, touch targets, styling, picker contents, and individual feature availability belong in code, design tokens, component fixtures, and tests.

## Core principle

Mobile components are presentation adapters over shared Sessions services. They may replace a desktop part, picker, or editor presentation, but must preserve provider-neutral session identity, scoped context, and command semantics.

## Viewport classification

The Agents Window derives phone layout from the current viewport and platform environment. Mobile context keys are declarative inputs for menus, view registration, and presentation selection; they are not the source of truth for model or provider behavior.

`IAgentWorkbenchLayoutService.viewportClass` exposes the active layout policy to layout controllers, pickers, and `IsPhoneLayoutContext`. An entry may also provide `initialViewportClass` to select its parts before layout begins. The full workbench keeps its existing width-based initial part selection when that override is absent.

Part factories select their mobile or desktop implementation once during construction, based on the initial viewport class. They do not replace part instances when the viewport later crosses the phone breakpoint.

## Mobile workbench and bundle

The experimental phone workbench has its own web entry point, `sessions.web.mobile.main.ts`. Its [MobileWorkbench](browser/mobile/mobileWorkbench.ts) extends the shared mobile workbench, retaining `AgentWorkbenchLayout.Mobile` while adding experimental presentation. The entry point fixes the viewport class to `phone` for the lifetime of the window; the host page selects the entry point, so no runtime viewport or user-agent check decides the presentation.

The experimental entry is available through explicit local-source selection or an independently built local preview. It is not an entry in the standard web build or a separate production translation resource. The normal CDN file inventory also drives legacy background preloading, so mobile output must never be added to that distribution.

`npm run bundle-mobile-preview` writes only to `out-mobile-preview/`. Its `out/` contains the mobile workbench, support workers, resources and an independent NLS table; its `node_modules/` contains explicitly selected browser libraries. Its `extensions/` contains the selected authentication, theme and static-language extensions, built and packaged without relying on developer output. The bundle's builtin metadata is read from those packaged manifests. The build never writes its localization indices into `out-build/`. An ownership marker prevents overwriting another directory, and a build lock prevents concurrent writers.

The version-2 `mobile-preview.json`, written only after all checks succeed, binds the entry, stylesheet, English messages, quality, extension descriptors and asset inventory to their content hashes. Rebuilding invalidates that manifest first. It is not a legacy `files.txt` preload list. Older local packages must be rebuilt.

The sibling development host selects this package for `/agents?vscode-quality=dev&mobile=preview`. Its asset base URL includes the manifest's content digest, including worker, library and extension URLs. An older page cannot load a newer build's JavaScript with its old localization table: stale generations require a reload, and missing or incomplete packages fail explicitly instead of falling back to full Agents. A relocated package remains self-contained; there is no developer-extension fallback.

Hosted mobile releases use a separate content-addressed CDN directory. The website pins the exact manifest digest, verifies it before selecting the mobile entry, and loads the release's own NLS and extension assets. It does not infer the mobile release from the latest full-workbench build or a visitor's query parameters. Publication validates all declared assets, uses immutable writes and publishes the manifest last. Normal web publication and its preload inventory remain independent.

Raw `mobile=1` and existing full-workbench routes retain their behavior. Dedicated app hosts select the mobile profile once, before loading a workbench, and retain their own browser-storage and PWA scope. Publishing the artifact does not itself activate a hostname, change authentication registrations or provide offline agent sessions.

The build checks emitted dependency graphs and gzip byte limits against `build/next/mobilePreviewPolicy.json`. Full workbench entries, native/test modules and unlisted contribution registrations fail the build. Core and packaged extensions have separate byte budgets. The contribution list records the current transitive dependencies, including desktop registrations pulled through shared services; it is a guard against growth, not a claim that all desktop code is gone. Removing those dependencies should shrink the list. New contributions, extensions or larger size limits require an explicit policy change.

The runtime library list also covers string-based AMD loads, which do not appear as esbuild imports. In particular, stored shell-tool output uses the shared read-only terminal renderer, so its xterm library and addons remain packaged even though the phone does not create agent-host terminals.

The mobile entry point is an allow-list. Its service composition files (`sessions.core.main.ts`, `sessions.core.web.main.ts`) select existing shared services, followed by only the contributions the phone needs. Full entries retain their own import and singleton-registration order; they do not import the experimental service composition. This deliberately duplicates a small registration list, not the service implementations. Contribution files that mix shared and desktop-only registrations are split so the phone can import the shared part (see `chat.contribution.ts` and `chat.desktop.contribution.ts`).

Host-picker presentations have separate contribution entries. The full web entry loads `hostFilter.contribution.ts`, including its original responsive title-bar picker and `hostPickerSheet.css`. The experimental mobile entry instead loads `mobileHostFilter.contribution.ts`, which owns the drawer and new-session pickers and their `mobileHostPickerSheet.css`. Both use `IAgentHostFilterService`; neither presentation entry imports the other.

The Configure Session sheet follows the same entry-owned boundary. Full web retains `mobileChatPhoneInputPresenter.ts` for its original responsive presentation; the experimental mobile entry loads `experimentalMobileChatPhoneInputPresenter.ts`. Both implement `IChatPhoneInputPresenter` without importing each other's implementation. The experimental implementation opts into unified configuration routing: separate mode, model, model-details and permission controls open the same sheet using their originating input's provider, session and chat identity, including creation providers without a connected agent host. Model changes continue through the input's selection controller; permission confirmation and managed restrictions remain owned by the existing permission delegate and provider. Optional picker presentation, input metrics, clipboard behavior and action-item factories fall back to the full workbench's existing behavior. The experimental implementation installs before restoration because inputs capture their metrics during construction.

`ISessionsPresentation` owns entry-specific additions to the new-session header, sessions list and name prompts, plus optional diff-resource reading. Its default implementation adds no DOM, gestures or overrides. The experimental implementation supplies those additions without making the shared views import mobile components. The same boundary applies to the title bar: `Workbench` creates its original title bar by default, while `MobileWorkbench` selects an experimental subclass.

Phone presentations of shared services (`contrib/mobile/browser/mobile.contribution.ts`) are registered last so they override the implementations registered by the core. A shared service that has no phone presentation, and whose feature does not exist on the phone, is given a null implementation there rather than a hidden desktop widget. The current presentations are:

| Service | Phone presentation |
|---|---|
| `IContextMenuService` | bottom action sheet |
| `IQuickInputService` | one-shot `pick` and `input` render as bottom sheets; quick access and multi-step pickers keep the shared controller |
| `IKeybindingService` | shortcuts still dispatch for a paired keyboard, but labels stop advertising them |
| `IAgentHostTerminalService` | no terminal is ever created; the read-only output stream that feeds a command card in the transcript is kept |
| `IActionWidgetService` | the desktop action list (mode, model, approvals pickers) renders as a bottom sheet; `hide()` dismisses it |
| `IAquariumService` | null |
| `ISessionsPresentation` | new-session and drawer headers, list gestures and prompts, snapshot-backed diff reading |

Shared chat content parts that need a phone presentation expose a seam the phone fills in: a decorator plus a no-op default with `enabled: IObservable<boolean>` and `setImpl()` in the workbench layer, and a sessions contribution that installs the phone implementation. `IChatPhoneInputPresenter` (session configuration) and `IChatEditPhonePresenter` (edit rows and diff opening) follow this pattern. Edit comparison stays in the shared editing services; the experimental renderer owns the row and any model references it requests. The default edit path does not instantiate the experimental renderer.

Entry-specific defaults are registered through `registerDefaultConfigurations` in `contrib/mobile/browser/mobileConfigurationDefaults.ts`, without changing shared setting declarations or caching the experimental defaults. Only the default moves; explicit configuration and policy remain authoritative.

The phone design language lives in `browser/mobile/media/` and is loaded last by `mobile.contribution.ts`, so a phone rule wins on source order at equal specificity. It re-ramps the shared design tokens on `.monaco-workbench.mobile-workbench` (16px body text, 44px touch targets, larger radii) instead of overriding individual components, so shared chat UI picks it up without phone-specific rules. Controls that must stay visually compact (status chips, the changes pill) keep their size and extend an invisible 44px hit area instead.

The desktop-web bundle keeps its runtime phone classification for the transition period. The shared `Workbench` therefore still contains the phone composition; `MobileWorkbench` owns what only the phone needs.

## Composition

Phone layouts prioritize one primary surface:

```text
Mobile title bar
Active session or custom view
Mobile navigation and transient overlays
```

Desktop side parts do not remain as permanently visible columns. Their content is presented through mobile navigation, drawers, sheets, or full-screen overlays as appropriate.

The active session and chat remain owned by `ISessionsService`. Mobile navigation must not create a second active-session store.

The Sessions Part projects only the active session onto the phone surface while retaining the desktop split topology, sash allocations, and live views. Crossing the breakpoint in either direction adapts the existing part, regardless of which subclass was selected at startup. Phone dimensions do not overwrite desktop geometry; returning to a non-phone viewport restores that arrangement at the available size. Structural session changes made on phone still update the canonical grid.

## Mobile part pattern

When a factory selects a mobile subclass, that instance remains alive for the part's lifetime. It checks the current viewport and delegates to desktop behavior after rotating or resizing out of phone layout. A mobile subclass:

- reuses the shared service and contribution contract;
- changes only composition, interaction, or presentation;
- gates mobile behavior on the current viewport without recreating the part;
- preserves scoped session context for commands and menus.

Desktop-only behavior must be gated before presentation rather than hidden with CSS after instantiation when the underlying component is unsuitable for phone layout.

## Navigation

The workbench-owned `MobileNavigationStack` tracks nested mobile layers such as drawers, custom views, pickers, and full-screen editors. Platform back navigation dismisses the top layer before leaving the current session surface; it does not control part-instance lifetime.

Opening another session resets or replaces transient navigation layers through the owning service. Components do not coordinate navigation by reading another component's storage keys.

## Pickers and actions

Mobile pickers adapt the same underlying selection controllers used by desktop. Provider selection, model selection, configuration, and workspace resolution remain owned by their shared services.

Actions use shared commands and menu IDs with mobile context-key gating. Presentation-specific action view items may differ, but invoking an action must resolve the same scoped session and operation.

## Where sessions run

The phone presents the agent host filter as a question with two kinds of answer — the product's own place (Cloud, the `githubsandbox` group: label "Cloud", description "GitHub Sandboxes", `connectable: false`) and the user's own computers (dev tunnels, pasted addresses). Cloud is the automatic default wherever it is available (`isImplicitlyConnectedHost` ranks first in `AgentHostFilterService`), carries no connection state, and is never described with connection vocabulary; computers show their state in words (Connected, Connecting…, Offline).

One selection, two faces. The header row of the sessions drawer (`Menus.MobileSessionsDrawerHeader`, rendered by `MobileHostDrawerHeaderViewItem`) scopes the list and is reachable from every screen, including an open session whose title bar belongs to the session. On Home, a chip on its own row above the workspace and agent chips (`Menus.NewSessionPlace`, rendered by `MobileHostPlaceChipViewItem` into the row `NewChatWidget` inserts ahead of its chip row) is where a new session's place is decided without leaving Home: *where*, then *what (workspace)* and *who (agent)*. The chip follows the chip grammar exactly — icon · label · chevron in the row's quiet color, no accent, no connection state; that state is shown in the sheet and the drawer header. Both open `MobileHostPickerSheet`: the Cloud row, then "Your computers" with Refresh, each computer with its state (an offline computer reconnects on tap), and always "Add a computer…", which leads to a Dev Tunnels sheet listing the account's tunnels (sharing sign-in, listing and connect with the desktop command) or to the address prompt. All of it reuses `showMobileContentSheet`, so the sheets look like every other phone sheet.

The title bar never names the place: Home reads "Agents", the drawer reads "Sessions", a session reads its title.

## Editors and changes

Mobile file and diff review use phone-native editor presentations. The design for mobile diff surfaces is documented in [MOBILE_DIFF_EDITORS.md](browser/parts/mobile/contributions/MOBILE_DIFF_EDITORS.md).

Editor inputs still open through `IEditorService`. Mobile overlays and navigation wrappers must preserve editor lifecycle and disposal behavior.

## Custom views

Custom views use the same `ICustomViewService` state as desktop. Phone presentation pushes the custom view onto mobile navigation and dismisses it through the normal back-navigation path.

## Feature gating

Features that do not have a usable phone presentation are excluded through their registration or enablement conditions. Mobile-specific gating must remain orthogonal to AI entitlement and provider capabilities.

In the mobile bundle the first gate is the entry point: a contribution the phone does not import cannot appear. `IsPhoneLayoutContext` remains the gate for individual items inside contributions that both presentations share.

The extension host instantiates every `MainThread*` customer and requires all of them to exist, so the mobile bundle must register the services those customers depend on even when the corresponding feature is not shipped. It registers service implementations only, never the feature's editors, views, or actions.

Do not infer feature support from provider IDs. Shared capabilities determine whether an operation exists; mobile context determines whether its presentation is available.

## Testing

Use focused tests for viewport selection, navigation-stack behavior, command scope, and mobile part factories. Use component fixtures or live workbench validation for layout, touch interaction, virtual keyboard behavior, and narrow viewports.

## Change policy

Update this specification only when viewport ownership, mobile composition, the part-subclass pattern, or navigation contracts change. Do not append file maps, CSS values, unfinished work, individual control behavior, or regression narratives.

## Related specifications

- [Layout](LAYOUT.md)
- [Layout controllers](LAYOUT_CONTROLLER.md)
- [Sessions architecture](SESSIONS.md)
