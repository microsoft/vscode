---
name: integrated-browser
description: Architectural documentation for the VS Code integrated browser ("browserView") — Use this when planning or executing work related to the integrated browser.
---

# Integrated Browser Architecture

The integrated browser ("browserView") is a Chromium-backed web browser embedded inside VS Code. It renders real web pages with a native Electron `WebContentsView`, presents them as editor tabs, and exposes them to AI agents as a set of language-model tools driven by Playwright.

Because a real browser is a heavyweight, security-sensitive, multi-process primitive, the feature is deliberately spread across **three OS processes** and two source layers. Understanding that split is the key to working on it effectively — almost every design decision flows from "which process is allowed to touch the `WebContentsView`, and how does everyone else talk to it?".

This document describes the parts that rarely change: the process topology, the IPC contracts, and the core design decisions. It intentionally avoids enumerating individual features, tools, or commands, which churn frequently — read the `features/` and `tools/` folders for the current set.

## Source Layout

| Folder | Layer | Runs in |
|--------|-------|---------|
| `src/vs/platform/browserView/electron-main/` | platform | **Main process** — owns the actual `WebContentsView`, Electron sessions, CDP, screenshots |
| `src/vs/platform/browserView/node/` | platform | **Shared process** — the Playwright runtime and the per-window remote group service client |
| `src/vs/platform/browserView/electron-browser/` | platform | **Renderer** — the page `preload` script (isolated world injected into loaded sites) |
| `src/vs/platform/browserView/common/` | platform | shared interfaces, CDP types, the renderer-side `BrowserViewModel`, telemetry, URIs |
| `src/vs/workbench/contrib/browserView/` | workbench | **Renderer** — the editor pane, feature contributions, widgets, and agent tools |

**Layer rule reminder:** platform code must not import workbench code. The renderer reaches the main/shared process services only through IPC channels (`ProxyChannel`), never by importing their implementations.

## Process Topology & IPC Flow

There are three processes and three primary IPC channels. Get this picture right before changing anything:

```
┌──────────────────────────── RENDERER (workbench) ────────────────────────────┐
│  BrowserEditor + feature contributions                                       │
│  BrowserViewModel  ── proxies to main via 'browserView' channel ────────┐    │
│  BrowserViewWorkbenchService (IBrowserViewWorkbenchService)             │    │
│  browser tools (Playwright) ── 'playwright' channel ───────────────┐    │    │
│  BrowserViewCDPService ── 'browserViewGroup' channel ───────────┐  │    │    │
└─────────────────────────────────────────────────────────────────┼──┼────┼────┘
                                                                  │  │    │
        ┌──────────────────── SHARED PROCESS ─────────────────────┼──┼────┘
        │  PlaywrightChannel → PlaywrightService (one per window) │  │
        │  connectOverCDP(transport) ── CDP over IPC ─────────────┘  │
        │  BrowserViewGroupRemoteService (client of main)            │
        └────────────────────────────────────────────────────────────┘
                                                                  │  │
┌──────────────────────────────── MAIN PROCESS ───────────────────▼──▼─────────────┐
│  BrowserViewMainService     ('browserView')      → BrowserView (WebContentsView) │
│  BrowserViewGroupMainService('browserViewGroup') → BrowserViewGroup              │
│  BrowserSession (1:1 with an Electron.Session, == CDP browserContextId)          │
│  CDPBrowserProxy ← BrowserViewCDPTarget ← BrowserView.debugger                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Channels (names live in `common/browserView.ts` and `common/browserViewGroup.ts`, registered in `electron-main/app.ts` and `electron-utility/sharedProcess/sharedProcessMain.ts`):

- **`browserView`** — `IBrowserViewService` (main). The renderer's `BrowserViewModel` is a thin client over this. Every page operation (navigate, layout, screenshot, find, zoom, focus…) is an IPC round-trip to the main process where the `WebContentsView` lives.
- **`browserViewGroup`** — `IBrowserViewGroupService` (main). Used by both the renderer's `BrowserViewCDPService` and the shared process's `BrowserViewGroupRemoteService`. This is the CDP plumbing channel.
- **`playwright`** — `IPlaywrightService` (shared process). The agent tools talk to Playwright here; Playwright in turn reaches back into the main process over the `browserViewGroup` channel.

**Why three processes?** The `WebContentsView` *must* live in the main process (only the main process can create native views and position them on a window). Playwright is a large dependency and drives long-lived automation, so it lives in the shared process to keep it out of both the main process (stability) and the renderer (memory/lifecycle). The renderer only ever holds lightweight proxies.

### The renderer model is a mirror, not the source of truth

`BrowserViewModel` (`common/browserView.ts`) holds a local copy of page state (url, title, loading, zoom, sharing state, …) and exposes change events. It is **populated from `IBrowserViewState` snapshots and kept in sync by events streamed over the `browserView` channel** from the authoritative `BrowserView` in the main process. When you add a new piece of page state:

1. add it to `IBrowserViewState` and emit a change event from `BrowserView` (main),
2. add the mirror field + event to `IBrowserViewModel` / `BrowserViewModel` (renderer),
3. wire the channel event through so the renderer mirror updates.

Never assume the renderer can compute page state locally — it has no access to the web contents.

The same main↔renderer split applies in the other direction, to **operations**. A page operation (reload, stop, navigate, zoom, focus…) is added by: defining the method on `IBrowserViewService` + `BrowserView` (main, which touches the web contents), then mirroring it on `IBrowserViewModel` / `BrowserViewModel` (renderer) as a thin `ProxyChannel` call (`this.browserViewService.<op>(this.id, …)`). The renderer never touches web contents directly — it always round-trips through the `browserView` channel.

## The Native View & the Overlay Problem

This is the single most important design constraint. The page is a native `WebContentsView` that the **main process paints directly onto the window in screen coordinates**. It is *not* part of the renderer DOM — it floats on top of it. Most "works in the DOM but the page doesn't move / is misaligned / disappears behind a menu" bugs trace back to one of the consequences below. The bridging logic lives in `WebContentsViewRendererFeature` (renderer) and `BrowserOverlayManager` (`electron-browser/overlayManager.ts`).

- **Alignment.** The editor renders a placeholder `.browser-container` DOM stub; the renderer computes its screen rectangle and sends it via `model.layout(bounds)`. The DOM box and the native view are kept aligned by hand, including a pixel-snap layout override so CSS-zoomed DOM and screen-pixel-positioned native view don't drift.
- **Z-order / overlays.** The native view paints *above* the DOM, so any workbench UI meant to sit over the page (menus, quick input, hovers, dialogs, notifications) would be hidden. `BrowserOverlayManager` watches the document and shadow roots for known overlay class names and hit-tests overlap; when something overlaps, the native view is hidden and a placeholder shown so the workbench UI wins. The overlay class list and hit-testing (context-view blocker skip, shadow-DOM piercing) are load-bearing — new UI over the page needs a recognizable overlay class.
- **Flicker masking.** Hiding/repositioning the native view is janky, so a periodic JPEG screenshot of the page is shown as a CSS background while it's hidden. Screenshots are also how page imagery reaches the renderer and agents (the renderer never reads native pixels directly).
- **Focus & keyboard.** The native view can't participate in DOM focus, so focus is bridged manually (`model.focus()` + an external focus checker). The `preload-browserView.ts` script (Electron *isolated world*, runs on every page) decides which Ctrl/Cmd keystrokes the page handles vs. forwards to the workbench keybinding system. That preload is also the contextBridge boundary — keep it minimal and side-effect-free (heed the in-file warning about getter/setter properties).

## Editor Pane & Feature Contributions

A browser tab is a normal editor: `BrowserEditorInput` (extends `EditorInput`, read-only, serializable) + `BrowserEditor` (extends `EditorPane`), registered through the standard editor-pane registry. The input is resolved lazily into an `IBrowserViewModel`; the model can be unloaded/disposed without closing the editor tab.

The editor itself is intentionally thin. Almost all behavior is added through a **local contribution model** (do not confuse with workbench contributions):

- `BrowserEditorContribution` is the abstract base. Features extend it and call `BrowserEditor.registerContribution(MyFeature)` at module load.
- Contributions are instantiated per editor via the instantiation service, so they get DI.
- The base class exposes lifecycle hooks (`onModelAttached`/`onModelDetached`/`prerenderInput`), layout hooks (`beforeContainerLayout` returning an `IContainerLayoutOverride`, `onContainerCreated`, `afterContainerLayout`, `onPaneResized`, `onPaneVisibilityChanged`), focus (`tryFocus`), and UI extension points (`widgets`, plus URL-bar renderers / suggestion providers / picker action providers).
- `widgets` are placed by `BrowserWidgetLocation` (toolbar, pre/post-URL, content area) and ordered within a location.

To add browser behavior, **write a new feature contribution** rather than growing `BrowserEditor`. Features that render native-view-affecting layout (emulation, pixel-snap) compose through prioritized `beforeContainerLayout` overrides — order matters (emulation runs early, pixel-snap runs last).

The native rendering itself is just another contribution (`WebContentsViewRendererFeature`), which keeps the editor agnostic of the platform view.

### Anatomy of a toolbar command / UI action

Most user-facing browser operations follow one shape. The pieces that are browser-specific (rather than generic VS Code `Action2`/menu wiring):

- Actions live in `features/*.ts` and take their id from the shared command-id enum in `platform/browserView/common/browserView.ts`. They are surfaced through the browser toolbar `MenuId`s.
- Conditional behavior keys off browser context keys that a `BrowserEditorContribution` owns — it binds them and keeps them current from model events, resetting them when the model detaches. So when an action needs new state to gate on, that state is plumbed as page state (see the renderer-mirror section) and exposed as a context key by a contribution.
- The action body resolves the active `BrowserEditor` and acts on the page through its model (`editor.model?.<op>()`), which proxies to the main process (see the operations-plumbing note above) — it never touches web contents directly.

So a new toolbar feature is mostly: a command id, an action in `features/*.ts`, optionally a context key driven from model state, and the model/service operation the action calls.

## Playwright Integration & the Sharing Model

Agents drive pages through Playwright running in the shared process (`node/playwrightService.ts`, `playwrightTab.ts`), reached via the `playwright` IPC channel.

Key design points:

- **One Playwright connection per chat session.** `PlaywrightService` keys browser instances by `sessionId` (the chat session resource). Each session gets its own `IBrowserViewGroup` and a Playwright `Browser` obtained via `chromium.connectOverCDP(transport)`, where `transport` tunnels CDP messages over IPC to that group. Idle sessions are torn down on a timer.
- **The page is genuinely shared.** Playwright and the user drive the *same* `WebContentsView`; Playwright is not a separate headless browser. The user's interactions go through the native renderer; agent actions arrive as CDP. Collisions are handled cooperatively — e.g. `PlaywrightTab.safeRunAgainstPage` races an agent action against dialog/file-chooser events so a human prompt can interrupt automation.
- **Emulation ownership.** The workbench owns device emulation. Playwright's automatic `Emulation.*` commands are suppressed unless an agent action is actively running, so automation doesn't clobber the user's responsive-design state.
- **Tools serialize functions.** Tools (`workbench/.../tools/`) call `IPlaywrightService.invokeFunction`/`invokeFunctionRaw`, which serialize a function to a string and execute it against the matched `Page`. Element targeting uses Playwright selectors, with `aria-ref=<ref>` refs coming from the accessibility snapshot returned by `getSummary`. Snapshots, screenshots, and interactions all flow through this service.
- **Page ↔ view matching** is done with bidirectional FIFO queues inside a `PlaywrightSession`: a view added to the group and a Playwright `Page` that appears are matched up in order. Globally tracked pages are replayed into sessions created later.

### Sharing with agents (privacy boundary)

Pages are **not** automatically visible to agents. `IBrowserViewModel.sharingState` / `setSharedWithAgent` gate access, and `BrowserViewWorkbenchService.isSharingAvailable` (gated on chat being enabled, agent mode, and the relevant settings — including extra conditions in the Sessions window) decides whether the full agentic tool set is even registered. When sharing is unavailable, only a reduced non-agentic "open page" tool is exposed that opens a URL **without** granting content access. URLs are additionally checked against `IAgentNetworkFilterService`, and blocked URLs are masked before being surfaced to a model. Any new agent-facing surface must respect this boundary and the standard chat gating (`ChatContextKeys.enabled`).

## CDP Proxying & Browser View Groups

CDP is the protocol that connects Playwright (and DevTools, extensions) to the pages. It is not exposed raw — it goes through a protocol-aware proxy so that one logical "browser" can be assembled out of an arbitrary, dynamic set of views.

- A **`BrowserViewGroup`** (main process) is a set of `BrowserView`s exposed as a single CDP "browser" endpoint. A group **references** views; it does not own them, and the same view can belong to multiple groups. Groups exist so different clients (a chat session, DevTools, an extension) each see only their own subset of targets.
- **`CDPBrowserProxy`** (`common/cdp/proxy.ts`) implements the `Browser.*` and `Target.*` domains itself (version, target discovery, auto-attach, flattened sessions, browser contexts) and forwards everything else to the right per-target session by `sessionId`. Each view is wrapped as a `BrowserViewCDPTarget` over `BrowserView.debugger`; sub-targets (iframes, workers) are registered as they're discovered.
- A **`BrowserSession`** is 1:1 with an `Electron.Session` and its `id` doubles as the CDP `browserContextId`, which is how storage isolation (cookies, localStorage) maps onto CDP browser contexts. Sessions are scoped global / per-workspace / ephemeral.
- The renderer's `BrowserViewCDPService` and the shared process's `BrowserViewGroupRemoteService` are both just `ProxyChannel` clients of `IBrowserViewGroupService` — neither speaks CDP to Chromium directly.

## Remote Sessions

When a page must be loaded as if from a remote machine (e.g. forwarded `localhost`), `BrowserSessionRemote` applies a tunnel proxy to the Electron session. It is **refcounted by view id**: acquiring/releasing references applies/clears the proxy, and `whenReady` lets callers defer navigation until requests will actually flow through the proxy. Tunnel-proxy credentials are pushed in from the local extension host. Agent tools rewrite remote `localhost` URLs to the forwarded address before opening.

## Development Guidelines & Gotchas

- **Pick the right process.** Anything touching the actual web contents (navigation, screenshots, find, zoom, CDP, sessions) belongs in `electron-main`. Playwright automation belongs in the shared process (`node`). UI, editor, and tools belong in the renderer (`workbench`). The renderer reaches the others only via the three channels above.
- **Extend via contributions/tools, not the core.** Add a `BrowserEditorContribution` for UI/behavior and a tool in `tools/` for agent capability. Keep `BrowserEditor` and `BrowserView` thin.
- **New page state** must be plumbed end-to-end: authoritative state/event on `BrowserView` (main) → channel → mirror field/event on `BrowserViewModel` (renderer). **New page operations** are the mirror image: method on `IBrowserViewService`/`BrowserView` (main) → thin `ProxyChannel` call on `IBrowserViewModel`/`BrowserViewModel` (renderer).
- **New toolbar commands** live in `features/*.ts`, keyed by the shared command-id enum and surfaced via the browser toolbar `MenuId`s; gate them on browser context keys that a contribution drives from model state. See "Anatomy of a toolbar command / UI action".
- **Respect the overlay/native-view contract.** New workbench UI that should sit above the page needs a recognizable overlay class so `BrowserOverlayManager` can detect it; otherwise it will be hidden behind the native view. New layout that affects the native view's rectangle goes through `beforeContainerLayout` overrides with the correct priority.
- **Keep the preload minimal and side-effect-free** (it runs in an isolated world on every page across the contextBridge). Heed the in-file warning about getter/setter properties.
- **Gate agent features.** Honor `isSharingAvailable`, `sharingState`, `IAgentNetworkFilterService`, and `ChatContextKeys.enabled` for anything that exposes page contents or capability to a model.
- **Validate** with `npm run typecheck-client` (renderer/`src` changes) and the existing tests under `platform/browserView/test/**` and `workbench/contrib/browserView/test/**`.
