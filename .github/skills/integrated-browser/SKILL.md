---
name: integrated-browser
description: Use this when working on the VS Code integrated browser ("browserView") to understand its architecture and mental model. Covers the embedded Chromium browser, its editor tab, navigation, overlay/layout, sessions, and agent browser tools under `src/vs/platform/browserView` and `src/vs/workbench/contrib/browserView`.
---

# Integrated Browser Architecture

The integrated browser ("browserView") embeds a **real Chromium browser** in VS Code, backed by an Electron `WebContentsView`. It renders live pages, presents each as an editor tab, and lets agents drive those pages through tools. It powers the in-product browser tab and the agent "browser" tools. It is **not** the old `extensions/simple-browser` (an iframe-in-a-webview), which now delegates to this on desktop.

It's a heavyweight, security-sensitive, multi-process primitive, and **almost every design decision follows from that.** This file describes the load-bearing ideas that rarely change. It deliberately does **not** enumerate current features/tools/commands/settings — those churn; the live `features/` and `tools/` folders are the source of truth. Build the mental model here, then go read the specific code you're changing.

## The one idea everything follows from

**A page is a native `WebContentsView` that only the main process may create, own, and position. Nothing else can touch it directly.** It's owned by the main process and painted by the OS compositor *on top of* the workbench DOM — not inside it. Everything else works around this:

- The **renderer** (editor UI + agent tools) can't hold the page; it holds a model/proxy and talks to main over IPC.
- **Playwright** is heavy and long-lived, so it runs in the **shared process**, reaching the page over IPC too.
- The page **paints over the DOM**, so the workbench choreographs alignment, z-order, focus, and screenshots by hand.

## Three processes, and why

| Process | Location | What lives here |
|---------|----------|-----------------|
| **Main** | `platform/browserView/electron-main` | The `WebContentsView`, sessions, trust, permissions, history, CDP, screenshots — authoritative page state. Only main can create native views. |
| **Shared** | `platform/browserView/node` | Playwright + remote/group automation services. Keeps a heavy dependency out of main (stability) and renderer (lifecycle). |
| **Renderer** | `workbench/contrib/browserView` + `platform/browserView/electron-browser` | Editor pane, UI feature contributions, agent tools, page preload script. Holds only lightweight proxies. |

**Layer rule:** `platform` must not import `workbench`; the agent host can't import `workbench`; shared types belong in `platform/common`. The renderer reaches main/shared only through `ProxyChannel` IPC, never by importing implementations. Channels are registered in `electron-main/app.ts` and `electron-utility/sharedProcess/sharedProcessMain.ts`. Split: **page ops/state → main; agent automation → shared; CDP plumbing is its own channel both renderer and shared use to reach main.**

## The renderer holds a mirror, not the truth

The renderer model is a **read replica** of state owned by the main-process view. Flow is one-directional:

```
renderer feature ──command──▶ model ──IPC──▶ main BrowserView ──▶ Chromium
       ▲                                              │
       └──────────── event (state changed) ◀──────────┘
```

To *do* something, call a method (round-trips to main); to *react*, listen to a model event. Never **compute** page state in the renderer — it has no access to the web contents.

- **New state** (url/title/loading/zoom/…): make it authoritative in the main `BrowserView`, emit a change event, then mirror the field + event on the renderer model and forward it over the channel.
- **New operation** (navigate/reload/focus/…): define it in main, expose a thin proxy method on the renderer model that round-trips the channel.

Wanting the renderer to "just read" something off the page is the signal you need new mirrored state + an event from main.

## The native view floats above the DOM (the overlay problem)

The single most error-prone area — the cause of nearly every "won't move / misaligned / shows through a menu / won't focus" bug. The page is painted by main in **screen coordinates on top of** the renderer, so the workbench fakes a normal DOM element. Treat the page's rectangle, visibility, focus, and imagery as things the workbench **coordinates**, never DOM facts:

- **Alignment.** The editor renders an empty DOM stub, measures its screen rect, and ships bounds to main. CSS zoom and screen pixels disagree, so bounds are **pixel-snapped**. New layout that moves the page must feed this bounds computation, not just move a DOM box.
- **Z-order.** The native view paints *above* all workbench UI, so menus/popups/hovers/dialogs that should sit over the page would be hidden. The workbench detects overlap and **hides the native view**, swapping in a placeholder. New floating UI over the page must be detectable by that machinery — a high CSS z-index won't do it.
- **Flicker masking.** While hidden/repositioning, a periodic screenshot stands in. Screenshots are also the only legit way page imagery reaches the renderer/agents — nobody reads native pixels.
- **Focus & keyboard.** Focus is bridged explicitly. A **preload script** (injected into every page in an isolated world) decides which keystrokes the page keeps vs forwards to VS Code keybindings. Treat it as a **trust boundary**: assume a hostile page, keep it minimal and side-effect-free.

## A browser tab is a real editor, extended by contributions

A page is a normal editor — a read-only, serializable `EditorInput` + `EditorPane` on the standard registry, resolving lazily to a view-model (unloadable without closing the tab). This inherits tabs, splitting, persistence, focus, and keybinding scoping for free.

The pane is thin. Behavior is added via a **local contribution model (separate from workbench contributions)**: small classes that attach to the editor, get DI, and hook a fixed lifecycle (model attach/detach, layout overrides, resize/visibility, focus, UI insertion). Each gets a lifetime **scoped to the attached model**, so per-page disposables clean up on navigate/close. Even native-view rendering is just one contribution.

**To add behavior, write a new contribution modeled on a sibling — don't grow the editor or the main view.** Contributions affecting the page rect compose through **prioritized layout overrides** (lower runs first; e.g. emulation sizes the viewport, pixel-snap runs last), so **order matters** — never hard-code pixels.

## Identity and isolation: sessions, groups, CDP

Keep these three distinct:

- **Session = storage identity.** Each Electron session maps 1:1 to a `BrowserSession` (cookies, cache, storage), and its id **doubles as the CDP browser-context id**. Scoped **global**, **per-workspace**, or **ephemeral**; multiple tabs can share one. Security is enforced here: `file://`, certificate trust, and permissions are all gated at the session (e.g. local files need workspace trust). New capabilities that expand a page's reach belong here, not on a feature.
- **Group = automation visibility.** A group assembles a dynamic set of views and exposes them as one logical CDP "browser." Groups *reference* views without owning them; a view can be in several. This is how different clients (chat session, DevTools, an extension) each see only their subset.
- **CDP is proxied, never raw.** A protocol-aware proxy implements browser/target-level domains (discovery, auto-attach, flattened sessions, contexts) and forwards the rest per-target. This lets one logical browser be stitched from views that come and go, and lets Playwright connect without touching Chromium directly.

Cookies/login/storage → **sessions**. "Which pages can this client see" → **groups**. The protocol itself → **the proxy**.

## Agents share the user's page — under a privacy gate

- **Same page, shared cooperatively.** Playwright drives the *same* `WebContentsView` the user sees, via CDP, one connection per chat session. Human and agent actions can collide; conflicts resolve in the user's favor (a human prompt/dialog can interrupt automation). The workbench (not Playwright) owns device emulation, so Playwright's auto-emulation is suppressed except during an agent action. Assume a human may interact with the same page concurrently.
- **Pages are private until shared.** Content isn't visible to agents by default. A page's *sharing state* gates content; a separate **availability gate** (chat enabled, agent mode, settings) decides whether the full tool set is registered — when it isn't, only a reduced "open a URL without content access" capability exists. URLs are screened by the network-filter and masked when blocked. Treat page content as **untrusted model input** (prompt injection). Any new agent surface must honor these gates. (Tool *names* live in `platform` so the agent host, which can't depend on `workbench`, can reference them.)

## Remote pages

When a page must load as if from a remote machine (forwarded `localhost` in a remote workspace, container, or Codespace), a **tunnel proxy is applied to the page's session**; credentials come from the extension host, and navigation can defer until the proxy is live. "Open localhost" isn't always local — remote URLs are rewritten to their forwarded form, and the proxy lives on the **session**, not an individual call.

## Practical guidance

- **Desktop-only.** Nothing runs in web; add to `electron-*` / `node` and let the `browser/` stubs throw "not available in web".
- **Match existing patterns.** New capability → a new feature contribution and/or tool, modeled on a sibling. Cross-process state → a model method + event from main, not local renderer state. Layout change → a prioritized override, not pixels.
- **Mind the trust boundaries:** the preload (hostile page), the session (storage / permissions / file access), agent gating (sharing + availability + network filter), and chat attachment (prompt injection).
