# Standalone Tunnel Terminal (Experimental)

Open a **new remote shell in Windows Terminal**, without running local VS Code,
installing extensions, or copying a relay URL. This is an
independent Node.js application, not an extension and not part of VS Code's build.

```text
Windows Terminal -> this Node client -> authenticated Dev Tunnels SDK stream
                 -> remote tunnel gateway -> agent host's PTY -> default shell
```

This uses the agent host's **terminal API only**. It does not create a chat, call
an AI model, or supply a Copilot token. The remote host still applies its own
runtime controls. Access to the tunnel grants access as the remote host's user:
only connect to machines you trust.

## Compatibility boundary

This is **not** a general replacement for the VS Code Remote Tunnels extension.
A tunnel that serves the remote editor does not necessarily expose an agent host.

- Local: **Node.js 22.x or 24.x** (use the latest maintenance release), an interactive
  terminal (Windows Terminal recommended). This prototype currently does not
  support other Node majors; `--help` still works on unsupported runtimes.
- Remote: a VS Code CLI/build with agent-host tunnel support:
  **launcher protocol 5 or later**, forwarded agent-host port **31546**, and
  **Agent Host Protocol 0.9.0**.
- Launcher protocol 6 supports selecting an editor-owned or standalone host,
  or explicitly starting a dedicated host. Protocol 5 uses its legacy default
  host, without host selection.
- The remote agent host must have working PTY support for its OS/architecture.
- Older/incompatible hosts are reported, not silently replaced with an extension
  relay or a different protocol. Matching only the advertised launcher version
  is insufficient; the AHP version is checked during initialization too.

Protocol references in this checkout:
[tunnel gateway](../../src/vs/platform/agentHost/common/tunnelAgentHost.ts),
[terminal commands](../../src/vs/platform/agentHost/common/state/protocol/channels-terminal/commands.ts),
[terminal state](../../src/vs/platform/agentHost/common/state/protocol/channels-terminal/state.ts),
[protocol versions](../../src/vs/platform/agentHost/common/state/protocol/version/registry.ts).
The terminal URI scheme is VS Code's `agenthost-terminal:`.

## Build

Run in this folder, **not the repository root**:

```powershell
Set-Location D:\code\vscode\experimental\tunnel-terminal-client
npm ci
npm test
```

When updating an existing copy, copy the **whole project**, including
`package.json`, `package-lock.json`, `patches/`, and `scripts/`, then run `npm.cmd ci` and
`npm.cmd run build`. Copying only `out/` or rebuilding against old dependencies
does not install the Node 24 fix.

The install step checks that the required patch is present, then runs
`patch-package --error-on-fail` to apply the pinned
[SDK compatibility patch](patches/@microsoft+dev-tunnels-ssh+3.12.42.patch).
Do not skip install scripts. If organizational policy requires
`npm ci --ignore-scripts`, have the patch reviewed and applied explicitly with
`npm.cmd run postinstall` under that policy before using the client.

`npm test` compiles the app and runs deterministic protocol tests, including a
real local PTY behind a WebSocket test server. `node-pty` is a **development/test
dependency only**: the application does not create a local PTY or require a
local native PTY library.

## Install the command on PATH

After installing dependencies and building, run this **once from the project
folder**:

```powershell
npm.cmd link
```

This registers the `tunnel` command in npm's global command directory,
linked to this project. It does not copy the application or bundle Node.js:
keep this folder and its installed dependencies in place. Node.js 22.x or 24.x
must remain available on PATH. Rebuild after changing source files; you do not
need to link again unless the project folder moves.

From any directory you can then run:

```powershell
tunnel
tunnel --tunnel my-machine
tunnel --list
tunnel --help
```

With no arguments, the command opens the same interactive tunnel picker as
`npm start`. All existing options are supported unchanged, including `--cluster`,
`--instance`, `--new-host`, `--cwd`, `--provider`, and `--client-id`. It runs the
same entry point in the foreground, preserving terminal input/output and exit
codes.

On Windows, npm also creates **`tunnel.cmd`**. Use that name if
PowerShell blocks npm's generated `.ps1` wrapper:

```powershell
tunnel.cmd --tunnel my-machine
```

If the command is not found, run `npm.cmd config get prefix` and ensure that
directory is on your **user PATH**, then open a new terminal. On Linux/macOS,
use `npm link` and put the `bin` subdirectory of `npm prefix -g` on PATH instead.
No application startup command changes PATH automatically.

To remove the command later, without deleting the project:

```powershell
npm.cmd uninstall --global experimental-tunnel-terminal-client
```

## Host setup

On a remote machine with a compatible CLI, inspect `code agent host --help`.
For builds supporting these options, a foreground dedicated host can be exposed
as a tunnel with:

```powershell
code agent host --new-instance --foreground --tunnel --name my-machine
```

Sign in to the host's tunnel when requested. Keep it running. The local client
must use an account/provider authorized to connect to that tunnel. An existing
compatible tunnel can also be used; no extension needs to be installed remotely.
The client never changes tunnel ACLs, publishes ports, or enables anonymous access.
It does not automatically terminate an editor or a shared agent-host process.

Merely having an older, ordinary `code tunnel` running is not sufficient if
that build does not publish port 31546. Recent builds publish the agent-host
gateway from an ordinary tunnel too, but the dedicated command above is the
least ambiguous way to validate this prototype. If `code agent host` is not
recognized on the remote machine, update that machine's VS Code CLI/build.

## Local authentication

The prototype intentionally does not borrow VS Code's OAuth application identity
or read VS Code's credential storage. There are three options:

### Existing GitHub CLI login

If GitHub CLI is installed, sign in once:

```powershell
gh auth login --hostname github.com --web
npm start
```

The app obtains the token from `gh auth token --hostname github.com`; GitHub CLI
owns credential storage. This is the most convenient repeat-launch path.
GitHub CLI is an optional **prototype dependency**, not a VS Code extension.
Missing credentials fail explicitly with setup instructions.

### Device sign-in with your own GitHub OAuth app

Register a GitHub OAuth app with device flow enabled, then use its public client
ID (not its client secret):

```powershell
node .\out\src\main.js --client-id YOUR_OAUTH_APP_CLIENT_ID
```

The app prints the verification page and one-time user code. Complete sign-in
in your browser with the account that owns the tunnel. The token is held only in
memory, so this mode signs in again on the next launch. A distributable app would
need its own registered identity and OS-backed credential cache.

### Supplied account token

Automation/testing can supply `TUNNEL_ACCESS_TOKEN` through a secure environment.
This is a **user/account token**, not a tunnel connect token or relay URL.
For Microsoft accounts use `--provider microsoft` and a token issued for the
Dev Tunnels service. Interactive Microsoft login is not included in this prototype.
Never put tokens in command-line arguments, source files, profiles, or issue reports.

## Connect

```powershell
npm start
```

1. Choose a machine from the authenticated discovery list.
2. On a protocol-6 tunnel, select a host, or explicitly choose to start a
   dedicated host. Creating a dedicated host may download/start server components.
3. The client creates a **new default shell** in the remote home directory.
   You are not attaching to any existing integrated terminal.

Useful commands:

```powershell
node .\out\src\main.js --help
node .\out\src\main.js --list
node .\out\src\main.js --tunnel my-machine
node .\out\src\main.js --tunnel my-machine --new-host --cwd file:///C:/work
node .\out\src\main.js --tunnel my-machine --instance EXISTING_INSTANCE_ID
```

For a Linux/macOS working directory use a URI such as `file:///home/me/work`.
The examples invoke Node directly when passing options, avoiding PowerShell's
argument forwarding through `npm.ps1`. On Linux/macOS use `node ./out/src/main.js`.
Shell executable selection is not exposed by the current public `createTerminal`
request: this client uses the agent host's default shell. Its environment is the
agent host's environment, not the environment of an existing integrated terminal.

Machine names are not assumed to be unique. Use `--tunnel ID --cluster ID` from
`--list` to disambiguate. A Windows Terminal profile can invoke
`tunnel.cmd --tunnel my-machine` after linking the command,
or `node D:\code\vscode\experimental\tunnel-terminal-client\out\src\main.js --tunnel my-machine`
to avoid selecting the same machine on every launch. No URL is needed.

## Input, accessibility, and lifetime

- Pickers and all commands work from the keyboard and use ordinary terminal text.
  `--help` documents the controls without signing in or making network requests.
- Terminal output is a raw VT stream rendered by Windows Terminal. Screen reader
  behavior comes from that terminal and the remote application; this is not a
  VS Code workbench UI and does not install workbench accessibility contributions.
- Keystrokes, Unicode, Ctrl+C, and window dimensions are forwarded to the PTY.
- **Ctrl+]** closes the local session and requests remote terminal disposal.
  That key is reserved and is not sent to remote programs.
- `exit` returns the remote shell's exit status. Local raw input mode and event
  listeners are restored on exit, cancellation, and errors.
- Windows shells can enable Win32 keyboard-event encoding through their VT
  output. The client disables that encoding before local pickers and flushes a
  reset after remote output on exit/disconnect, before restoring local input.
- Graceful exit sends `disposeTerminal`; it does not kill a shared agent host.
- **No automatic reconnect, input replay, or durable session management.**
  After a broken connection, forced process termination, or cleanup timeout,
  the remote shell **may still be running**. The client reports uncertain cleanup
  with its terminal URI. Inspect the terminal on the remote host or stop a
  dedicated host you started yourself. Do not kill a shared editor/host merely
  to clean up this experiment.
- A heartbeat detects an unresponsive WebSocket. Incoming messages, pending
  terminal output, and outgoing data have bounded buffers; overload fails visibly.

## Validation and limitations

```powershell
npm run check
npm test
```

### Digits appear as `50;1;0;1_` in the picker

These are Win32 keyboard-event records from a mode enabled by a previous remote
Windows shell, not damaged tunnel names or account information. Older clients
restored Node's raw input state without disabling that terminal encoding.

Update the complete client source and run `npm.cmd run build`. Both the machine
picker and host picker now reset the encoding, and session cleanup resets it on
normal exit, local cancellation, and disconnection. Start a fresh terminal tab
once if an older running process has already left the current tab unresponsive.
No login changes or dependency reinstall are needed for this fix.

### Relay connection failures

**`WebSocketStream disposed` on an older Node 24 client install:** the original
SDK (`3.12.42`) imports RSA public keys in PKCS#1 form and re-exports them in the
same form to verify host identity. On Node 24.21.0/OpenSSL 3.5.8, this export
fails with `Failed to encode public key`, even with valid DER produced by Node
itself. A subsequent stream disposal hides the original error. It is not evidence
of a wrong GitHub account.

The checked-in patch normalizes both SDK public-key import paths through SPKI
using Node's native `createPublicKey`/`export` APIs. Key material, RSA-SHA256/512
signatures, and the SDK's comparison against published host keys are unchanged.
There is no crypto monkey-patch, authentication bypass, TLS relaxation, or hidden
Node 22 subprocess. The normal client runs on Node 24.

Run `npm.cmd ci` after copying the complete updated project to install the patch,
then rebuild. Node 22 remains supported. When upgrading the SDK, re-evaluate or
remove the patch and run the RSA identity/signature regression tests and opt-in
real relay test under **both Node 22 and 24**. The SDK versions are pinned so an
unreviewed dependency upgrade cannot silently change the patch target.

Discovery, tunnel port metadata, relay connection, and agent-host protocol
initialization are separate stages. Successful GitHub login/discovery does not
prove a relay failure is an account mismatch. The client now preserves the SDK's
relay error reason and Node version, recognizes structured HTTP 401/403 errors,
and distinguishes certificate, DNS, and timeout failures.

Known account/tunnel credentials, authorization headers, URLs, and recognizable
token strings are redacted from the error message. Raw SDK traces, HTTP bodies,
and stacks are not printed. Review diagnostics before sharing them; do not
include credentials. Do not turn off TLS certificate verification to work around
a certificate error.

On the failing machine, update the source and rebuild before reproducing:

```powershell
npm.cmd ci
npm.cmd run build
node .\out\src\main.js --tunnel my-machine
```

Tests cover gateway inventory/selection, malformed frames, RPC errors/timeouts,
early output versus snapshots, Unicode input, resize, Ctrl+C, local escape,
cleanup and listener removal, and a real local shell with exit-code propagation.
The local protocol server is a test double, **not a real Dev Tunnels connection**.
These tests do not establish that any particular published VS Code build supports
this experimental protocol.

An additional opt-in test targets a **real local agent host**, without the tunnel
service. Start a throwaway foreground host with a separate `--user-data-dir`,
then point `TUNNEL_TERMINAL_TEST_ENDPOINT` at that host's published JSON endpoint
entry in `agent-host/local-endpoint/entries` under that directory. Run
`node --test out/test/live.test.js`. The test accepts only loopback TCP endpoints,
creates its own terminal, runs an echo command, resizes it, and exits with code 7.
It never prints the endpoint's connection token. Stop the throwaway host afterward.
This test passed against the locally installed VS Code **1.138.0** host during
development; that does not verify the Dev Tunnels relay or other published builds.

Live acceptance requires an authorized account and a compatible remote host:
discover its machine, select the intended host, run `hostname`, resize the
terminal, interrupt a command with Ctrl+C, then `exit`. Also disconnect the network
and verify the cleanup warning and local terminal restoration. Real-service
authentication and cross-machine connectivity are not asserted by the offline tests.

The initial dependency install reports two moderate audit entries from the Dev
Tunnels connection SDK's transitive `uuid` dependency (GHSA-w5hq-g745-h8pq).
The package pins the SDK versions used by the compatibility patch; no incompatible
`uuid` override is applied. Recheck `npm audit --omit=dev` before distributing this
prototype. There is no standalone installer, credential cache, or extension fallback.

### Opt-in real relay regression test

With the local GitHub CLI signed in to an account authorized for a running tunnel:

```powershell
$env:TUNNEL_TERMINAL_TEST_TUNNEL = 'my-machine'
node --test .\out\test\relayLive.test.js
Remove-Item Env:\TUNNEL_TERMINAL_TEST_TUNNEL
```

This connects through the real Dev Tunnels SDK and waits for port 31546. It then
makes a separate attempt with a deliberately incorrect **client-side expected
host key** and requires host verification to reject it. It does not modify the
tunnel's published key/ACLs, start an agent session, or create a shell. Run it on
both supported Node majors when changing the SDK patch.
