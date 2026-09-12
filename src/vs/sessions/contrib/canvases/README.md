# Session canvases

Canvases are provider-owned application instances, not session artifacts or ordinary browser editors. The Sessions contribution owns their **presentation**, while the provider owns membership, application execution, source admission, and recovery.

## Availability and ownership

The desktop preview is opt-in through `sessions.experimental.canvases.enabled`, which defaults to `false`. This is a presentation preference, not an execution permission or a replacement for managed runtime settings. AI hiding, the represented session's observable `supportsCanvases` capability, and actual connection negotiation still apply. Workbench-only providers, other agent types, remote execution, and Web are not enabled by this contribution.

`ISessionsProvider.getSessionCanvases(sessionId, chat)` is an optional, provider-neutral facet. `ISessionsManagementService.getSessionCanvases(session, chat)` verifies the supplied chat belongs to that exact session and routes through its provider; it never substitutes the main chat. `ISessionCanvases` exposes:

- observable live type declarations, logical entries, membership hydration, availability, and read errors;
- separately negotiated executable-registry initialization and its outstanding-operation state;
- a full-state subscription for a selected member;
- read-only catalog refresh and source resolution;
- explicit registry initialization, open, action, logical close, and provider restart operations.

Backend resource translation stays in the provider. Mutable catalog and full-state data are observable, not mirrored through a second UI event protocol. A connection replacement invalidates subscriptions and pending reads even if its local service object is reused.

## Logical editors and native leases

`SessionCanvasInput` persists only a `vscode-session-canvas` reference containing the provider identifier, session resource, chat resource, and canvas resource. Its serializer never retains source URLs, credentials, native view identifiers, executable input, or effect requests. Restoration resolves that reference and reads a **fresh** source; it does not open a provider or replay an action.

`SessionCanvasMount` holds a presentation lease only while its editor is visible and its exact session/chat is the represented owner. The lease is independent of working-set timing, including workspace transitions and multi-session layouts. Source pulls are fenced by connection generation, incarnation, revision, and per-pull ordering; a late credential refresh cannot replace a newer source for the same state. Native creation is serialized across mounting lifetimes, and superseded creations are disposed.

The shared native host receives only the editor's assigned content bounds. It must not take the allocation belonging to Details or change the layout controller's visibility rules.

| User operation | Meaning |
| --- | --- |
| **Initialize Canvas Providers** | Explicitly initialize the exact chat's registry through normal source/permission admission. No type identity or conversation turn is required. |
| Tab **X**, Hide Editor, working-set swap, or whole-side-pane hiding | Detach and release native presentation resources. Do not change provider membership or domain files. |
| Show an existing canvas | Reattach from current state and a fresh source pull. |
| **Reload View** | Reread state/source, including retrying a failed state subscription. Do not start/restart providers or replay effects. |
| **Close Canvas** | One revision-guarded logical close through the owning provider. |
| **Restart Canvas Provider** | Explicit incarnation-guarded provider/chat recovery; may replace every instance sharing that provider. Broader owned-runtime recovery requires separate approval of its resident-chat impact. |

Editor group/window transfers are rejected. Main-process creation also rejects a second concurrent external view for the same logical resource. Native handles and storage authority must never be cloned as a way to move an editor.

## Entry points and targeting

`Canvases…` appears in the represented session toolbar and the supported Add Tab menu. It displays live types and current members and accepts structured JSON open input, with provider-side schema validation. An empty live catalog is not a provider-start operation.

When the host separately advertises explicit initialization, a cold catalog offers **Initialize Canvas Providers**. Selecting it closes the picker before execution approval can appear, then uses cancellable progress for the captured chat. Success rereads the live catalog and returns to the picker only if that same chat is still represented. Cancellation, connection replacement, and owner disposal invalidate the pending operation; an indeterminate result is surfaced rather than retried. Browsing, refreshing, and reconnecting never initialize providers.

The Agent Host projection uses the negotiated `vscode/initializeCanvasChat` extension operation and its matching cancellation route. This is an explicit VS Code initialization effect, not a change to the six canonical AHP canvas routes or an execution-permission override. The facade's `initialized` property describes membership hydration; it must not be interpreted as provider startup or approval.

Command identifiers:

- `workbench.action.sessions.canvas.manage`
- `workbench.action.sessions.canvas.reloadView`
- `workbench.action.sessions.canvas.close`
- `workbench.action.sessions.canvas.restartProvider`
- `workbench.action.sessions.canvas.accessibleView`

Session controls capture `ISessionContext` or an explicit session/chat pair before asynchronous work. Editor controls capture their logical input. Restart confirmation retains the entry observed before the dialog. Native tool publication can reveal new members for the current visible owner with conversation focus preserved; publication for background owners does not switch sessions. Their members remain available for an explicit later reveal.

### Canvas-first owners

The ordinary `ISessionsService.openNewSession` route creates and presents a real provider draft. `ISessionCanvasService.getTarget` captures that session and its exact chat; `open` accepts canonical `SessionCanvasOpenOptions`, including a known source/type identity when the live catalog is cold. This is the same six-route transport used by the picker, not a synthetic-owner command or a model turn. Pure catalog refresh does not initialize missing providers.

Open and explicit provider initialization wait for eager AHP owner creation. A ready backend session with authoritative canvas membership or retained execution intent and an actual published session summary graduates through the normal session-replacement lifecycle. Explicit initialization can retain an owner without opening a member; dismissing the picker or navigating away must not discard that owner. The same logical references and collection survive, the pending-draft pointer is released without discarding the owner, and subsequent navigation uses real session working sets. Pending or selected Dev Container execution remains unsupported and does not retain a local canvas-opening capability.

A previously untitled peer chat also adopts its backend status once ready state publishes its own canvas membership. It is no longer an empty composer that can be reused for a different conversation.

## Native isolation and guest behavior

The native view has external presentation metadata `{ type: 'external', resource }`, user-only ownership, no automation audiences, and authority-qualified in-memory storage. It does not create a `BrowserEditorInput`, extension browser API object, or model/CDP target. Ordinary browser enumeration and browser editors remain independent.

The guest receives the extension theme contract as main-frame-only, value-only defaults: semantic CSS variables, the `rampa` stylesheet, root/body theme attributes, and pointer-hover treatment. VS Code colors, syntax metadata, high-contrast outlines, and typography feed the mapping. Default styles precede application styles; explicit application CSS and changed attributes retain precedence. This does not expose a privileged guest bridge, Node, ambient browser cookies, or automatic model sharing.

HTTP, HTTPS, and file sources are admitted by the presentation parser; it does not impose a loopback-only subset. Native network policy still applies. The first-release file contract is **trusted file resources**, including relative assets inside the existing browser trusted-folder allowlist and explicitly trusted folders outside the current workspace. It is not arbitrary filesystem access. External presentation waits for Workspace Trust initialization and native configuration acknowledgement before allocating the page.

An untrusted file is a failed native navigation, not a successfully loaded denial page. The shared native host offers **Trust Folder...** through the existing Workspace Trust resource dialog, **Manage Workspace Trust**, and an explicit **Reload**. A folder grant applies to Workspace Trust throughout VS Code; execution-source approval does **not** grant file access or set `trustAllFiles`. Native presentation identity, user-only ownership, empty automation audiences, isolated storage, and the existing behavior when Workspace Trust is disabled remain independent.

Removing folder trust blocks subsequent requests and responses still awaiting admission, hides affected native content, and forces a denied reload without showing stale screenshots. Other trusted views are unaffected. A later grant alone does not replay navigation or provider effects: recovery reloads only the captured native page. Missing trusted files remain load failures rather than trust prompts. Revocation cannot erase data already read by an application or revoke its separate extension Node execution authority.

Eligible user-initiated HTTP/HTTPS/mail links can open externally, but external canvas popups never create native browser children. There is no click interception that overrides application `preventDefault`.

Accessible View and Help use the existing accessibility providers and verbosity controls. Semantic reading is user-requested, bounded, main-frame HTML inspection; it is not an agent tool or an inferred description of graphical content. Focus returns only to the still-represented input, and owner/navigation changes invalidate stale semantic snapshots. Native page sandboxing does not sandbox extension Node execution.

## Validation boundary

Focused tests cover provider-neutral routing, connection and source races, command target capture, native isolation, and real layout-controller working-set/Hide Editor/side-pane lifecycles. They do not certify arbitrary extension compatibility, universal screen-reader behavior, graphical content accessibility, or a Chromium process/memory budget. Live runtime admission, cold initialization, disconnected shared-runtime recovery, and native guest behavior require the corresponding integrated runtime/native qualification.
