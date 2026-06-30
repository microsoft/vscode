---
name: integrated-browser
description: Architectural documentation for the VS Code integrated browser ("browserView") — use this when planning or executing work related to the integrated browser, before reading or changing code under platform/browserView or workbench/contrib/browserView.
---

# Integrated Browser Architecture

The integrated browser ("browserView") embeds a real Chromium browser inside VS Code: it renders live web pages, presents each as an editor tab, and lets AI agents drive those pages through language-model tools. A real browser is a heavyweight, security-sensitive, multi-process primitive, and **almost every design decision in this feature is a consequence of that one fact.** If you understand the consequences, the code will feel inevitable rather than arbitrary.

This document describes the load-bearing ideas — the ones that rarely change and that you must hold in your head before writing code. It deliberately does *not* enumerate the current features, tools, commands, or settings: those churn, and the live folders (`features/`, `tools/`) are the source of truth for them. Your job when reading this is to build the right mental model, then go find the current shape of the specific thing you're changing.

## The one idea everything follows from

**A web page is a native `WebContentsView` that only the main process may create, own, and position. Nothing else in VS Code can touch it directly.** Everything else in the architecture exists to work around that constraint:

- The **renderer** (where the editor UI and the agent tools live) cannot hold the page. It holds a *proxy* and talks to the main process over IPC.
- **Playwright** (the automation engine) is large and long-lived, so it does not live in the renderer or the main process — it runs in the **shared process** and reaches the page over IPC as well.
- The page **paints on top of the renderer's DOM**, not inside it, so the workbench has to choreograph alignment, z-order, focus, and screenshots by hand.

Hold those three consequences in mind and most of the file layout, the IPC channels, and the "weird" overlay code become obvious.

## Three processes, and why

| Process | What lives here | Why |
|---------|-----------------|-----|
| **Main** (`platform/browserView/electron-main`) | The `WebContentsView`, the Electron sessions, CDP, screenshots — the authoritative page state | Only the main process can create native views and place them on a window |
| **Shared** (`platform/browserView/node`) | The Playwright runtime, one automation connection per agent session | Keeps a heavy, long-lived dependency out of the main process (stability) and the renderer (memory/lifecycle) |
| **Renderer** (`workbench/contrib/browserView` + `platform/browserView/electron-browser`) | The editor pane, UI feature contributions, agent tools, and the page *preload* script | This is just VS Code's UI; it only ever holds lightweight proxies |

The layer rule still applies on top of this: **platform code must not import workbench code**, and the renderer reaches main/shared services only through IPC channels (`ProxyChannel`), never by importing their implementations. The three channels are registered in `electron-main/app.ts` (main) and `sharedProcessMain.ts` (shared). When you need to know exactly which channel carries which service, read those two files plus `common/browserView.ts` / `common/browserViewGroup.ts` — but the conceptual split is: **page operations and state go to main; agent automation goes to shared; CDP plumbing is its own channel that both the renderer and the shared process use to reach main.**

## The renderer holds a mirror, not the truth

The renderer's view-model is a **read replica** of page state that lives authoritatively in the main process. State flows *out* from main as event-carried snapshots; operations flow *in* to main as proxied calls. This is the pattern you will touch most often, so internalize the direction of flow:

- **New page state** (a new property like url/title/loading/zoom/…): make it authoritative in the main-process `BrowserView`, emit a change event there, then add the mirrored field + event to the renderer model and forward the event across the channel. The renderer must never try to *compute* page state locally — it has no access to the web contents.
- **New page operation** (navigate/reload/focus/zoom/…): define it where the web contents actually lives (main), then expose a thin proxy method on the renderer model that just round-trips through the channel.

If you ever find yourself wanting the renderer to "just read" something off the page, stop: that is the signal you actually need a new piece of mirrored state plus an event from main.

## The native view floats above the DOM (the overlay problem)

This is the single most error-prone area, and the cause of nearly every "the page won't move / is misaligned / shows through a menu / won't take focus" bug. Because the page is painted by the main process in **screen coordinates on top of** the renderer, the workbench has to fake the illusion that it's a normal DOM element:

- **Alignment.** The editor renders an empty DOM stub as a placeholder, measures its screen rectangle, and ships those bounds to main to position the native view. CSS zoom and screen-pixel positioning don't agree by default, so the rectangle is pixel-snapped. Any new layout that changes where the page sits has to participate in this bounds computation, not just move a DOM box.
- **Z-order.** The native view paints *above* all workbench UI, so anything meant to appear over the page (menus, popups, hovers, dialogs, notifications) would be hidden. The workbench detects when such UI overlaps the page and **hides the native view**, swapping in a placeholder so the workbench UI wins. New UI that must sit over the page has to be detectable by that overlap machinery — it can't just have a high CSS z-index.
- **Flicker masking.** Hiding/repositioning a native view is visually jarring, so a periodic screenshot of the page is shown as a placeholder while it's hidden. Screenshots are *also* the only way page imagery legitimately reaches the renderer and agents — nobody reads native pixels directly.
- **Focus & keyboard.** The native view is outside DOM focus, so focus is bridged explicitly, and a small **preload script** (injected into every page in an isolated world) decides which keystrokes the page keeps versus forwards to VS Code's keybinding system. That preload is a security boundary across the contextBridge — keep it minimal and side-effect-free, and respect the warnings written in the file.

The practical rule: **treat the page's on-screen rectangle, its visibility, its focus, and its imagery as things the workbench coordinates, never as DOM facts.**

## A browser tab is a real editor, extended by contributions

A page is a normal editor: a read-only, serializable `EditorInput` paired with an `EditorPane`, registered through the standard editor-pane registry, resolving lazily to the renderer view-model (which can be unloaded without closing the tab). This is intentional — it inherits tabs, splitting, persistence, and focus for free.

The pane itself is deliberately thin. Behavior is added through a **local contribution model that is separate from workbench contributions**: small classes that attach to the editor, receive dependency injection, and hook a fixed set of lifecycle/layout/focus points (model attach/detach, layout overrides, container/resize/visibility, focus, and UI insertion points). Even the native-view rendering is just one of these contributions, which is what keeps the editor itself agnostic of the platform view.

The durable guidance: **to add browser behavior, write a new contribution; do not grow the editor or the main-process view.** Contributions that affect the page's rectangle compose through *prioritized* layout overrides, so when several of them participate, order matters.

## Identity and isolation: sessions, groups, CDP

Three identity concepts, each unlikely to change, that you need to keep distinct:

- **A session is storage identity.** Each Electron session maps 1:1 to a `BrowserSession`, and its id doubles as the CDP *browser context* id — that's how cookies/storage isolation lines up with CDP. Sessions are scoped **global**, **per-workspace**, or **ephemeral**, and multiple page views can share one session. When you reason about "what storage/cookies does this page see," you're reasoning about its session.
- **A group is automation visibility.** A "group" assembles an arbitrary, dynamic set of page views and exposes them as a single logical CDP "browser." Groups *reference* views without owning them, and a view can be in several groups. They exist so that different clients (a chat session, DevTools, an extension) each see only their own subset of pages.
- **CDP is the wire, and it's proxied, never raw.** A protocol-aware proxy implements the browser/target-level CDP domains itself (discovery, auto-attach, flattened sessions, contexts) and forwards the rest to the right per-target session. This is what lets one logical browser be stitched together from views that come and go, and what lets Playwright connect without ever talking to Chromium directly.

If a task involves cookies/login/storage, think **sessions**. If it involves "which pages can this agent/devtools client see," think **groups**. If it involves the automation protocol itself, think **the proxy**, not raw CDP.

## Agents share the user's page — under a privacy gate

Two ideas govern all agent interaction, and both matter for correctness *and* trust:

- **It's the same page, shared cooperatively.** Playwright does not spin up a separate headless browser — it drives the *same* `WebContentsView` the user sees, via CDP, with one connection per chat session. So agent actions and human actions can collide, and the system resolves collisions in the user's favor (a human prompt/dialog can interrupt automation). The workbench, not Playwright, owns device emulation, so Playwright's automatic emulation traffic is suppressed except during an active agent action. Whenever you add agent capability, assume a human may be interacting with the same page at the same time.
- **Pages are private to the user until shared.** Page contents are not visible to agents by default. A page's *sharing state* gates access; a separate availability gate (chat enabled, agent mode, relevant settings) decides whether the full tool set is even registered, and when it isn't, only a reduced "open a URL without granting content access" capability exists. URLs are additionally screened by the network-filter service and masked when blocked. **Any new agent-facing surface must honor this boundary** and the standard chat gating — exposing page content or capability to a model without checking these is a bug, not just a policy miss.

## Remote pages

When a page must load as though from a remote machine (e.g. a forwarded `localhost` in a remote workspace, container, or Codespace), the page's session has a tunnel proxy applied to it; tunnel credentials are pushed in from the extension host, and navigation can be deferred until the proxy is actually live. The thing to remember is that "open localhost" is not always local — remote URLs are rewritten to their forwarded form before opening, and the proxy is managed on the session, so remote behavior is a property of the session, not of an individual call.

## How to approach a task here

1. **Locate the change on the process map first.** Touching the actual web contents → main. Driving automation → shared. UI, editor, tools → renderer. Picking the wrong process is the most expensive early mistake.
2. **If it's page state or a page operation, plumb it end-to-end** following the mirror pattern (authoritative in main, mirrored/proxied in the renderer). Don't shortcut it in the renderer.
3. **If it's UI or behavior, add a contribution; if it's agent capability, add a tool.** Keep the editor and the main-process view thin.
4. **If it draws over the page or moves it, respect the overlay/native-view contract** — be detectable by the overlap machinery, and route rectangle changes through the layout-override path.
5. **If it exposes anything to an agent, pass it through the sharing/availability/network gates.**
6. **Then go read the current code** for the specific feature/tool/command you're modifying — this document gives you the frame, not the inventory.

## Validating changes

- Type-check renderer/`src` changes with `npm run typecheck-client`; for built-in-extension changes use the extensions compile path.
- Exercise the existing tests under `platform/browserView/test/**` and `workbench/contrib/browserView/test/**`, and add to them when you change behavior with test coverage.
- Because so much of this feature is cross-process and visual (alignment, overlays, focus, sharing), prefer to actually run the browser and watch the page rather than trusting types alone — many regressions here only show up at the seams between processes.
