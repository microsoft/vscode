# Local canvases in the Agents Window

The desktop Agents Window exposes **Canvases** in the owning session's toolbar and header menu when the local MessagePort connection negotiates the canvas capability, the preview is enabled, and AI features are enabled. The qualified macOS arm64 source-build preview uses the matching development SDK/runtime and explicitly approved packages. Opening an approved package can materialize a retained backing without a preparatory message; approving a package after an existing turn does not require another message either. Built releases, remote providers, other providers, and the web workbench do not expose this preview.

See the [development SDK launch guide](../../../../../scripts/local-canvas-sdk.md) for immutable package preparation, exact-workspace approval and isolated launch profiles. The separate reviewed-fixture [proof of concept](../../../../../scripts/local-canvas-poc.md) uses `VSCODE_LOCAL_CANVAS_POC_ROOT` and a dedicated workspace. In either route, the backend is a Node process with the user's permissions, **not a sandbox**. Browser origin confinement does not restrict backend filesystem or network access.

## Using a canvas

- **Canvases** lists the catalog and all logical instances, including instances whose editor tabs are hidden.
- Opening a catalog entry creates a new instance. Selecting an existing instance offers reveal, a declared action, and explicit close.
- Canvas and action inputs are **JSON**, not JavaScript object literals. Quote property names and string values, and satisfy the schema shown in the input prompt. Runtime errors are surfaced without replaying the operation. Canceling the prompt does not open or invoke anything.
- Closing an editor tab only hides the canvas. **Close Canvas** closes the logical instance through its owning chat.
- **Refresh Canvases** reads current state and retries visible unavailable editors. **Restart Canvas Provider** uses the guarded local reload RPC; acknowledgment can precede page readiness. An already-visible unavailable editor gets one automatic rebind attempt when its current endpoint becomes ready. A failed attempt remains explicitly retryable. Neither command reopens hidden tabs or replays SDK open calls.
- New instances in the active chat reveal once their endpoint is ready, without taking focus. A newer navigation prevents a late reveal. **Open Canvas** notifications and **Reveal Canvas** remain available for background or hidden instances. Restored identities and endpoint updates do not reopen hidden tabs.

## Command arguments

All commands use the `workbench.action.sessions.canvas.` prefix:

| Suffix | Additional arguments | Result |
| --- | --- | --- |
| `manage` | None | Standard picker |
| `getState` | None | Current catalog and instances |
| `open` | `extensionId`, `canvasId`, optional `instanceId`, `input` | Stable source URI |
| `reveal` | `instanceId` | Stable source URI |
| `invokeAction` | `instanceId`, `actionName`, optional `input` | Provider JSON result, including its envelope |
| `close` | `instanceId` | None |
| `refresh` | None | None |
| `reload` | None | None |

Programmatic calls must include **both** `sessionResource` and `chatResource` as URI strings. The chat must belong to that session. IDs are validated against the current catalog/instances; a supplied `instanceId` that already exists is revealed without another SDK open. Programmatic calls use the same service and provider path as the UI and propagate failures.

Toolbar calls forward their scoped session; command-palette calls use the session context. No operation silently substitutes the window's active chat for an explicitly supplied target.

## Source lifetime

Browser editors use `vscode-session-canvas` source URIs containing only host, provider, session, owning chat, extension, canvas, and instance identities. Initial navigation resolves the current live loopback endpoint into an isolated ephemeral browser session with no automatic agent sharing. Browser serialization does not store endpoints, tokens, inputs, or page-provided titles. Resolving a source never opens an SDK canvas.

The existing session layout owns editor working sets across session switches. Endpoint loss invalidates native content without closing the logical instance. Visible editors recover on a later ready endpoint; hidden editors are not resolved in the background. Hiding or disposing an editor cancels its pending automatic rebind. An authoritative supported snapshot that removes a logical instance also closes its matching source editors, without another SDK close. Unsupported states, failed reads, and retained unavailable instances do not close those editors.
