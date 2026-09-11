# Local custom canvas SDK fixture

This is an original test extension, not a VS Code extension or a native browser,
editor, or terminal canvas provider. The [integration suite](../../copilotCanvases.integrationTest.ts)
copies it into a temporary Copilot home and runs only that explicitly created code.
It never uses a model, personal credentials, or installed user extensions.

The same original fixture is used by the
[isolated Agents Window PoC launcher](../../../../../../../../../scripts/local-canvas-poc.md).
That interactive developer flow can use a real Copilot conversation; the SDK
regression suites described here still run without model calls. The page displays
separate button-click and declared-action counts so each path can be verified.

The fixture joins the owning session with `createCanvas`/`joinSession`, starts one
loopback HTTP server, and declares a `counter` canvas with an `increment` action.
The HTML button uses HTTP; document snapshots arrive over SSE. Multiple instance
IDs share data through the open input's stable `documentId`. A process-generation
nonce makes restarted endpoints distinct even if the OS reuses a port.

`documents/<documentId>.json` holds the document. `audit.jsonl` records actual
provider callbacks, the raw `action.result` before returning to the SDK, and
process cleanup. Its fixture-owned `started` marker is
written before `joinSession`, independently of tool or canvas advertisement.
Tests count those markers across create, enable/disable, reload and cold resume,
and verify that both enable and disable decisions persist. A separate safe copy
demonstrates that disabling one known ID does not prevent a newly discovered
backend from starting, even with no tools advertised.

Explicit canvas close releases its SSE subscriptions without deleting the document
or stopping other instances' server.
Process shutdown closes the server and transport. A joining extension must not
call `session.disconnect()` to leave: that API destroys the shared session, which
belongs to the owning SDK client.

## Running the proof

From the repository root, generate current output once:

```sh
npm run transpile-client
```

Use the repository integration runner when Electron test assets are available:

```sh
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvases.integrationTest.ts
```

The same node-only suite also runs with the existing Node Mocha entrypoint, without
downloading Electron:

```sh
npm run test-node -- --run src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvases.integrationTest.ts
```

The suite rejects any outbound model request. It gives each provider process a
temporary `HOME`, `COPILOT_HOME`, working directory and configuration directory,
checks fixture shutdown markers, stops the SDK-owned runtime, and removes the
temporary home. Do not install this fixture into a personal Copilot home.

### Comparing the actual VS Code client mode

The separate [startup boundary suite](../../copilotCanvasStartupModes.integrationTest.ts)
uses the same platform CLI `index.js` entrypoint selected by `CopilotAgent`, with
`mode` genuinely omitted or explicitly `empty`. Its entrypoint matrix also
includes `@github/copilot/npm-loader.js` in empty mode, strictly as an isolated
compatibility case, not a proposed production launch change. Both use stdio, but
are distinct host entrypoints. The matrix prints each exact path, mode and
extension/renderer options. It does not override the CLI's bundled extension SDK.

This opt-in macOS proof must run inside an OS sandbox that blocks all outbound
network access except loopback. The environment flag only opts into the tests;
it is not an enforcement mechanism. Do not set it without the sandbox wrapper.

```sh
env VSCODE_CANVAS_MODE_PROBE_NETWORK_ISOLATED=1 \
	/usr/bin/sandbox-exec \
	-p '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))' \
	node node_modules/mocha/bin/mocha.js test/unit/node/index.js \
	--delay --ui=tdd --timeout=5000 --exit \
	--run src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvasStartupModes.integrationTest.ts
```

This is the existing Node test runner, without npm user configuration or an
Electron download. The provider has an isolated home, OS keychain access disabled,
no credentials, a non-serving loopback BYOK placeholder, and rejecting model and
approval handlers. Configuration discovery and file hooks are enabled as in the
production launcher, but only the original fixture is present in the isolated
directories. Remote sessions, MCP connections and telemetry are disabled for the
comparison. It does not qualify authenticated production bootstrap or other OSes.

Both modes load the fixture on the production entrypoint when extensions are
requested; neither loads it when extensions are off. A PID-bearing startup marker
appears before introspection, with no approval callback. Renderer off/on changes
the canvas tool list, not whether that backend starts.

The selective-start test deliberately separates three fixture identities. A
bootstrap copy creates retained history through real open/action/open/close RPCs
and is stopped before the measured phases. The subject and a control copy are
installed disabled before their first possible start. Subject markers stay at
zero through a new session's create/reload and a cold resume/reload of the saved
session. Explicit enable starts only the subject; the control never starts and
the bootstrap never restarts. The later subject disable is recorded separately
as one start followed by one stop, not mistaken for pre-start prevention.

New-discovery cases use the production entrypoint with mode omitted. A new safe
copy starts without an explicit enable or approval on both reload and cold
resume, even while no tools are advertised. Inert discovery metadata is recorded
separately from these execution markers. Thus the tested public configuration
does not provide the required default-deny startup authorization.

The suite separately asserts the fixture's raw action result and the SDK RPC
envelope `{ result: <provider JSON> }`. Callback fields are compared without
inventing `host`; event projections remove only IDs, parent IDs and timestamps,
preserving all other optional fields. No `reopen` intent is inferred from an
`opened` event.

## Adapter invariants from the measured contract

- `recorded` and `removed` determine durable logical instance identity when the
  session history is retained. Presentation and provider availability are separate.
- `unavailable` must immediately retire the current endpoint reference without
  declaring the logical instance closed.
- Empty live `listOpen` is not evidence of logical closure: unavailable instances
  are omitted. The SDK's cached `openCanvases` can retain a stale URL and is not
  evidence of a valid endpoint.
- Reconcile durable records, live lifecycle events, and the current snapshots
  according to those semantics. Never invent an endpoint lease from a URL or
  navigate from a stale cache. The fixture URL's generation nonce only makes
  process restarts observable; it is not a production authorization mechanism.
- Runtime Read/Edit/Shell permissions do not sandbox arbitrary extension Node
  code or direct canvas actions. Management-tool exclusion controls the surface,
  not startup or execution authorization; a VS Code-side matcher cannot replace
  the required runtime enforcement.

## Scope of the decisions and the release blocker

The tested IDs are user-scope extensions in one isolated `COPILOT_HOME`.
Enablement persists beyond the initiating chat and SDK process:
`session.extensions.enable` is not a one-chat execution grant. These tests do not
establish transactional isolation for concurrent chats or a content-bound approval.
All preference mutations target explicitly named fixtures in throwaway servers.
Do not turn this setup into a production disable-everything/reenable-around-create
sequence; shared server state and concurrent chats make that unsafe.

Pre-disable is therefore not a sufficient production trust boundary. It prevents
the known disabled candidate from starting, but new discoveries remain
default-enabled and are observed starting on reload and resume. No VS Code-side
policy matcher, blanket approval shim or manual process launcher is supplied.
General arbitrary-extension startup remains out of scope pending an agreed
authorization model. The explicit local developer PoC can run this reviewed
fixture in its isolated home without claiming that stronger boundary. Normal
sessions retain disabled runtime-extension startup.

No-turn retention and canvas restoration are separate assertions. The minimal
named single-open and unnamed histories in the compatibility empty-mode tests
are not retained at shutdown; there is no valid cold canvas restore to claim for
those histories. The successful restore tests use history actually retained by
the runtime after public named open/action/open/close operations. They neither
fabricate event logs nor replay actions to manufacture success. No model call
or local mock model is needed for that separate retained-history proof, and it
does not imply that arbitrary no-turn sessions will persist.

## Pinned compatibility and intentional limitation tests

The initial proof targets SDK `1.0.13-preview.4` and CLI `1.0.83-2`. Revisit the
documented limitation assertions when updating those dependencies:

- The SDK's default standalone wrapper rejects extension startup without a
  registered extension launch provider. This is not the path currently used by
  `CopilotAgent`: the production code explicitly selects the platform CLI's
  `index.js` and omits `mode`. The mode comparison verifies fixture loading on
  that path in both omitted and empty modes. Do not attribute the standalone
  wrapper's error to the deployed VS Code entrypoint.
- `requestExtensions: true` auto-starts discovered, default-enabled extensions.
  Inert discovery and per-ID disable are available, but neither is a default-deny,
  content-bound execution grant. Session enable also updates persistent enablement.
- `requestCanvasRenderer` gates model tools, not direct canvas RPC authorization.
  Excluding `extensions_manage` and `extensions_reload` removes management tools.
  Managed read/edit/shell permissions do not sandbox an extension's Node backend.
- Live `opened`, `closed`, `registry_changed` and `unavailable` events are separate
  from durable `recorded`/`removed` events. There is no `reopen` or availability
  discriminator in an `opened` payload.
- Repeated open calls the provider again. Changing its input updates live state
  but does not replace the first durable open record. Do not use open as a generic
  replay-safe focus operation or change a document's identity through repeated open.
- An unavailable provider disappears from `canvas.listOpen()`, while the SDK's
  `session.openCanvases` cache retains its old URL until reconnect. Neither snapshot
  is a complete availability model; consume lifecycle events and invalidate endpoints.
- The cold-resume proof uses a named open/action/open/close workflow recorded by
  the runtime, not a synthesized transcript or a supplied journal. It restores
  without an LLM, recovers a fresh endpoint, and does not repeat actions or revive
  closed instances. Naming alone is not sufficient: named single-open canvases
  can lose their history on shutdown even with explicit workspace persistence.
  Unnamed canvas-only sessions are also not retained in the tested scenario.
- A throwing `onClose` does not reject the caller's close. Provider disconnect,
  reload and runtime shutdown do not replace per-process cleanup with `onClose`.

These tests are not approval to enable production extensions. Selective trusted
startup remains a shipping requirement. A public SDK launch-provider integration
would additionally be required if switching to the standalone wrapper; that
separate gap does not prevent loading on the existing VS Code entrypoint.
The tests do not qualify Integrated Browser rendering or any
remote, web/mobile, sharing, office, native canvas, or other-provider parity.
