# Local canvas PoC

This development-only vertical slice uses the pinned Copilot SDK/runtime and an
[original custom extension](../src/vs/platform/agentHost/test/node/providerIntegration/fixtures/localCanvas).
It is not a static HTML artifact or an MCP App. The runtime loads the extension,
owns its declared canvas instances and actions, and serves a live page in the
Agents Window's native Integrated Browser.

## Start

Use a compiled Code OSS checkout with its existing dependencies, built-in
extensions and Electron available. The source profile must already be signed
in to GitHub Copilot. The standard development launcher copies it; it never
modifies the original profile.

```sh
node scripts/launch-local-canvas-poc.mts
```

If the source profile is elsewhere:

```sh
node scripts/launch-local-canvas-poc.mts --source-user-data-dir /absolute/path/to/profile
```

The launcher prints the dedicated demo root, Code OSS PID, profile and debugging
ports. `--skip-prelaunch` is appropriate only after the development output is
current. To relaunch with the same document data:

```sh
node scripts/launch-local-canvas-poc.mts --root /absolute/path/to/previous/demo-root
```

An alternative for manually preparing the environment is
`node scripts/prepare-local-canvas-poc.mts /new/absolute/directory`.
It refuses to overwrite an existing directory.

## Try it

1. The launcher selects the printed demo root's `workspace` folder in a new
   **local Copilot** session. If prompted, review the folder and choose
   **Trust Folder & Continue**. Use the folder directly, not Git-worktree
   isolation or a remote host.
   Select **Manual permissions** for ordinary tool confirmations; the launcher
   does not change permission preferences retained in the authentication clone.
2. Ask: **Open the Local Counter canvas for document demo.**
3. Reveal it from the canvas control if it is not already visible.
4. Click **Increment**. The counter increases by one and the button-click count
   increases.
5. Ask: **Use the canvas increment action to add 3.**
   The same document updates live and its declared-action count increases.
6. Use the canvas menu to invoke an action directly, reload the provider, reveal
   an existing canvas, or close it. For generic JSON prompts, open input is
   `{"documentId":"demo"}` and action input is `{"amount":3}`.

The extension identity is `user:local-canvas-demo`, its canvas type is `counter`,
and its action is `increment`.

The pinned SDK's model tools are `list_canvas_capabilities`, `open_canvas`, and
`invoke_canvas_action`. It does not advertise a `close_canvas` model tool.
Close logical instances with **Canvases > Close Canvas**; do not invent a
`close_canvas` action on the counter.

With Manual/Default permissions, inspect each requested tool's arguments and use
**Allow Once**. The PoC uses the normal tool approval flow; it does not install an
automatic approval handler.

Browser clicks use the extension's HTTP API; updates arrive over SSE. Agent
actions use the runtime's canvas tools and the extension's declared action.
There is no privileged JavaScript bridge to VS Code.

## Recover from a different workspace

If you select a different folder in the demo window, the chat input shows the
expected and current paths with **New Session in Demo Workspace**. That action
opens a fresh local Copilot draft in the prepared folder; it does not change an
existing conversation or resubmit a failed request.

An unsent new-session draft takes precedence over automatic folder selection
and recovery. Finish or clear that draft before using the recovery action.
Typing or navigating elsewhere while recovery is waiting also cancels it.
Normal workspace-trust prompts still apply. The host continues to reject
execution outside the dedicated folder, including additional roots.

## Lifecycle

- Closing a browser tab hides its view; explicit canvas close removes the runtime
  instance. Neither operation deletes the underlying document.
- Revealing/restoring a view resolves the current live endpoint. It does not
  replay `open` or any mutation action.
- Provider reload temporarily invalidates the page, starts a fresh endpoint and
  preserves document data. Retained sessions can restore logical instances.
- A named canvas-only session is not guaranteed to survive SDK shutdown. Use a
  normal session containing a real conversation turn for cold-restore testing.
- The demo's data is under `copilot-home/extensions/local-canvas-demo/documents`.
  The adjacent `audit.jsonl` records callbacks and provider process starts/stops.

The convenience launcher normally clones a profile for each run. For a full
window-state cold-restore test, quit the printed PID and relaunch the **same**
printed user-data, extensions, shared-data and agent-plugins directories using
`scripts/code.sh --agents`, with `VSCODE_LOCAL_CANVAS_POC_ROOT` still set. Reusing
only `--root` preserves the extension's document data, not the previous window's
editor working set.

## Scope and trust

`VSCODE_LOCAL_CANVAS_POC_ROOT` is an explicit non-built, local-development opt-in.
The PoC isolates the Copilot runtime home, workspace, extensions and VS Code
profile. Electron itself retains the real OS home for supported Keychain access;
the canvas backend does not inherit that home. Without the opt-in,
normal-session extension startup is unchanged.
Only the reviewed fixture is installed in this runtime home.
Copied settings, keybindings, MCP configuration, prompts/plugins and persisted
Agent Host state are omitted. Opaque authentication storage can still contain cached UI metadata and permission
preferences; the launcher is not a general authentication-only export.
The copied profile has scheduled Automations and cloud agents disabled before
startup so cloned application metadata cannot schedule unrelated work. The source
profile's settings are not modified.

**This is not a sandbox or an arbitrary-extension installation/consent system.**
Node extension backends execute trusted code. Tool approval callbacks, browser
isolation and a hidden management tool do not contain that code. Do not install
unreviewed extensions into the demo home.

Generalized trusted startup, distribution, other agents, remote hosts, web/mobile,
native editor/terminal canvas providers and full semantic theme forwarding remain
separate work. The launcher is provided for macOS/Linux; other operating systems
are not qualified by this PoC.

Quit the isolated Code OSS instance when finished. Keep the printed demo root to
retain the counter or remove that specific directory after all its processes
have stopped. Do not remove or modify your original profile or Copilot home.
