# Local canvas SDK development

This is a **qualified local macOS arm64 source-build preview**, separate from the reviewed-fixture
PoC. It uses ordinary workspace-scoped package approvals. It never installs or
approves a package automatically.

## Prerequisites

- A prepared Code OSS development build with current host/client output.
- macOS arm64. Windows, Linux and macOS x64 are not yet qualified. The host
  ignores development SDK selection on these platforms, even when all three
  artifact variables and the preview setting are supplied. The preparer refuses
  before creating a profile. Ordinary VS Code and the separate PoC are unchanged;
  inert package preparation/review does not establish execution support.
- A built public Node SDK exporting `ExtensionLaunchProvider` and
  `session.rpc.retain()`. Its `start()` must validate the live runtime
  `registerExtensionLaunchProvider` acknowledgement as `contractVersion === 1`.
- The matching **Node CLI** entry, not a standalone runtime embedding without a
  default Node bootstrap profile.

These SDK/runtime changes are **unreleased**. A working local checkout or npm
tarball is not evidence of registry availability. Release requires the SDK's
public launch option, v1 negotiation, generated retention API and event, and the
matching runtime implementation to ship together. No registry version is assumed.

Before widening the platform gate, qualify each native platform/architecture
with the real public SDK/runtime: prepare/review/exact-workspace consent,
canvas-first retention and delayed draft transfer, user/action shared data,
context/removal, native origin/frame/popup/download/clipboard policy, source
close/restart/cold restore, themes/focus/accessibility, and preview/AI-disable
recovery. In particular, test user-gesture same-origin new-tab and popup denial,
not just script popups. Record native evidence and process/profile cleanup.
Source tests alone do not qualify a platform. There is no bypass setting.
Real screen-reader qualification and publication/rollout approval remain
separate external gates; no package publication is authorized by this preview.

## Prepare and launch

Run from this VS Code worktree:

```sh
node scripts/prepare-local-canvas-sdk.mts \
  --sdk-entry file:///absolute/path/to/sdk/nodejs/dist/index.js \
  --runtime-cli /absolute/path/to/runtime/dist-cli/index.js \
  --workspace /absolute/path/to/an/ordinary/workspace \
  --root .c0
```

The command checks the bridge against **both SDK declaration sets**, using the
existing TypeScript compiler and all VS Code ambient declarations. It builds
only `canvas-sdk-bridge.mjs`, then writes `canvas-sdk-launch.json` under the
chosen root. Nothing is installed or changed in `node_modules`.

Add `--launch` to start the prepared development build. The root contains isolated
user-data, extensions, shared-data, agent-plugin and Copilot directories. No
system temporary directory is used. Short directory names preserve enough space
for native Unix sockets even in this deep worktree; overlong roots are rejected
rather than falling back outside it. `.gitignore` excludes the private root's
contents. Use different short roots for concurrent instances.
Electron keeps the caller's real `HOME`/`USERPROFILE` so the main/UI processes
can use the operating system Keychain normally. The generated bridge applies
its isolated home only through the public SDK child-process `env` option;
`runtimeEnvironment` in the manifest records those overrides. The Agent Host
retains the private Copilot, plugin, profile, and temporary paths. No mock
Keychain or workspace-trust bypass is enabled.
`--cdp-port` and `--agent-host-port` accept
available ports for a browser/debugging worker. CDP defaults to port `0` for
automatic allocation; read `cdpEndpointFile` from the manifest after launching.

For authentication, optionally pass `--source-user-data-dir /path/to/closed-profile`.
Only the authentication-bearing profile files are copied, not settings, plugins,
MCP configuration or Agent Host data. A nonempty SQLite WAL is rejected; close
and checkpoint that profile first. The source profile is never modified.

The preview setting is enabled in the isolated profile. Its effective
preview/AI-disable decision reaches the **first** native initialization handshake,
before runtime capability negotiation, so no initial message or extra window
reload is needed. Use the canvas package manager to prepare a package, inspect
its revision and approve it for the selected workspace. Then explicitly open
its declared canvas. Browsing and history restoration do not execute it.

New canvases opened by an agent in the active chat are revealed once their
endpoint is ready, without focusing the page. If navigation changes while the
endpoint is loading, or the owning chat is in the background, use the canvas
notification or **Canvases > Reveal Canvas**. Restored instances, provider
recovery and refreshes do not reopen a tab you hid. Explicit **Open Canvas** and
**Reveal Canvas** commands still focus their result.

Canvas backends may submit a request through their joined public SDK session.
The Copilot adapter projects the actual root user-message event into the owning
chat before tool progress and permission requests arrive; it does not resend
the prompt or approve tools. These requests appear in chat and use the normal
approval and cancellation controls. Synthetic skill/subagent messages remain
separate, and normal host-sent echoes keep their existing turn identity.

Canvas UI and execution honor the **global** preview and `chat.disableAIFeatures`
values, including when the Agents Window has a different workspace-level AI
setting. Disabling either gate stops owned canvas backings, not saved documents.
When switching between the development and bundled SDK paths, use **Developer:
Restart Local Agent Host**, reopen the retained chat, and explicitly restart its
canvas provider if its catalog is dormant. No preparatory message is required.
Canvas-first startup retains an extension-free backing, waits for its disconnect
reply, then resumes the same SDK session with extensions enabled. Later turns
that need a new tool/plugin configuration use the same completion boundary.
An early shutdown event is not proof that teardown finished; a rejected
disconnect aborts the handoff rather than enabling extensions or sending the
next turn. Ordinary shutdown notification handling is unchanged.

Package removal unregisters the package and revokes its grants. Inert cached
snapshots and saved document data remain; removal is not a secure-erasure operation.

### Known development-runtime limitation

Approving a package after a chat has completed a turn can fail on the next
same-session resume with `Hook processor is not configured`. This was reproduced
using only the public SDK: an awaited model change followed by disconnect and
same-ID resume can race runtime hook initialization. The integration regression
for this sequence remains failing with the current development artifacts.

For the validated initial workflow, approve the package before creating a new
chat. This avoids the affected sequence; it is not a repair for an existing
conversation. The host does not silently skip model changes, retry an
indeterminate operation or replace the conversation to hide the error. An
upstream lifecycle fix and requalification are required before this limitation
can be removed.

The environment selects three matching artifacts:

- `VSCODE_LOCAL_CANVAS_SDK_ENTRY`: the public SDK ESM file URL.
- `VSCODE_LOCAL_CANVAS_SDK_BRIDGE`: the bridge compiled for exactly that SDK entry.
- `VSCODE_LOCAL_CANVAS_RUNTIME_CLI`: the runtime Node CLI path.

The host ignores this route in built and non-desktop hosts. With preview off it
uses the unchanged bundled SDK path. With preview on but no development artifacts
it cannot advertise normal canvas execution. Partial configuration, a different
SDK bridge, or failed v1 startup rejects the development path without retrying
without a launch provider. Unset `VSCODE_LOCAL_CANVAS_POC_ROOT` for this route;
the PoC retains its separate launcher and behavior.

## Contract and scope

The bridge uses only public SDK operations and structural host interfaces.
SDK-owned instances such as tool sets, canvas objects and request handlers do not
cross SDK module copies. The development adapter projects newer event/task DTOs
onto the bundled host's supported surface; newer-only diagnostic events, SDK
skills and client-task variants are not surfaced. Runtime permission enforcement
and managed settings are still authoritative and are never reimplemented here.
Typed event subscriptions retain the SDK's event-type index, so streamed deltas
do not pass through unrelated handlers. Unsubscribing immediately detaches the
backing SDK listener. Bridge preparation typechecks both public SDK declaration
sets and runs `scripts/local-canvas-sdk-bridge.test.mts` with the existing Mocha
runner, covering streaming delivery, permission diagnostics and teardown.

Every launch needs the exact chat/backing lease, current snapshot fingerprint,
exact-workspace or shared-local-host approval and effective customization
enablement. Both grant scopes span profiles sharing the Agent Host and its
user-data directory; approval is not profile-isolated. Exact-workspace approval
is the default. Existing grants for the same revision accumulate, so narrowing
an existing host-wide grant requires explicit revocation first. The lease
remains closed until public SDK retention completes. The resolver preserves the
approved runtime `defaultLaunch`, adding only `VSCODE_CANVAS_DATA_DIR`. Mutable
documents remain outside installed code. Revocation stops owned backings.
Unreadable or invalid saved package approvals make package management and
execution unavailable without preventing ordinary host/provider construction.
The saved records are preserved for recovery; the service does not replace
them with an empty registry or allow management to overwrite them.

Canvas-first creation uses an extension-free backing, retains it without a turn,
disconnects, then resumes **the same SDK ID** with the full configuration and
extensions enabled. Cold history reads stay extension-free; explicit open,
restart or a genuine turn admits canvas initialization. Cold reopening can call
the extension's open handler again; this is not exactly-once execution.

The offline integration test is
`src/vs/platform/agentHost/test/node/providerIntegration/copilotCanvasSdk.integrationTest.ts`.
It runs the real host graph, AHP adapter, public SDK and runtime in Node through
the existing integration runner. Disk I/O is real; file watching is excluded from
this fixture. It uses a local mock-model response only after proving no-turn
retention and cold restoration. Native UI and Windows/Linux qualification remain
separate. The live test also verifies a failed first open, unknown runtime
backings, refusal of the bundled SDK as a development bridge, rejection of an
older runtime acknowledgement, and an ordinary mock-model turn through the
unchanged bundled SDK after disabling preview.
