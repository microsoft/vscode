# Experimental Tunnel Terminal

Open a **new shell on a remote machine** from Windows Terminal while desktop VS Code
keeps its Remote Tunnels connection open. No SSH server, proposed extension APIs,
VS Code core changes, or separate tunnel credentials are needed.

This is a development experiment, not a published or supported VS Code feature.
It does **not** attach to existing integrated terminals.

One reusable connection URL supports **up to 10 independent terminal sessions**.
Every connection starts a new shell after its own matching-code approval.

```text
Windows Terminal -> bundled Node client -> local companion (127.0.0.1)
                 -> VS Code's authenticated command RPC
                 -> remote extension -> isolated PTY helper -> shell
```

## Requirements

- Desktop VS Code 1.95 or newer, connected to a trusted remote workspace.
- Node.js 22 or newer for building and running the local client.
- A supported remote host for `node-pty`: Windows, Linux, or macOS.
- Keep the remote VS Code window connected throughout the session.

There are **two extensions**: a workspace extension running on the tunnel's remote
VS Code Server and a UI companion running in your local desktop VS Code. The
standalone client also runs on your local Windows machine. VS Code in a browser is
not supported.

## Build and install

This folder is an independent npm package. It is not part of VS Code's main build.
Build/package on the **remote host's OS and architecture**, so native dependencies
and executable permissions match where the extension will run. Run these commands
**from this folder**, not from the repository root. This example targets a Windows
x64 remote host:

```powershell
Set-Location D:\code\vscode\experimental\tunnel-terminal
npm ci
npm test
npm run package
```

The outputs are:

- `experimental-tunnel-terminal-win32-x64-0.0.3.vsix`: remote extension package
  for this Windows x64 example (other targets appear in their package filenames).
- `local/experimental-tunnel-terminal-local-0.0.3.vsix`: local companion,
  with no native dependencies.
- `dist/client.cjs`: standalone local client, with its JavaScript dependencies and
  license notices bundled. Copy just this file to your local machine if you built
  the extension remotely. No local `npm install` or native PTY library is needed
  to run it.

On your local PC, connect **desktop VS Code** to the tunnel. In **that connected
window**, run **Extensions: Install from VSIX...** for **both** packages:

| Package | Where it must appear in the Extensions view |
| --- | --- |
| Experimental Tunnel Terminal | Under the remote tunnel host's installed extensions |
| Tunnel Terminal (Experimental Local Companion) | Under **Local - Installed** |

The packages declare their workspace/UI roles so VS Code can select the correct
extension host. Reload the connected window after installing or upgrading both.
Do not install the remote package only in the remote machine's separate desktop
VS Code: that is a different extension installation from the tunnel's VS Code
Server. Copy the VSIX files to your local PC first if necessary.

The main extension's commands still appear in the local window's Command Palette
even though that extension executes remotely. The companion does not add a second
set of Start/Copy/Stop commands. It supplies the local listener behind those commands.

Packaging automatically selects the current OS and architecture, such as
`win32-x64`, `linux-x64`, or `darwin-arm64`. Your local Windows client is
still the same portable `dist/client.cjs` file.

The package includes `node-pty` and its native prebuilds. For an architecture without
a usable prebuild, build/package on the target host with the native build prerequisites
described in [node-pty's documentation](https://github.com/microsoft/node-pty#dependencies).
Installing a VSIX does not compile missing native modules.

## Connect

1. In the remote VS Code window, run **Tunnel Terminal (Experimental): Start Bridge**.
2. Select a workspace folder if prompted. Choose a shell executable on the
   **remote** machine, such as `powershell.exe`, `pwsh.exe`, or `/bin/bash`.
   Enter only the executable name or path, not arguments or a shell command.
3. In **local Windows Terminal**, run:

   ```powershell
   node D:\code\vscode\experimental\tunnel-terminal\dist\client.cjs
   ```

4. Run **Tunnel Terminal (Experimental): Copy Connection URL** in VS Code and paste
   it at the client's URL prompt. It must be `http://127.0.0.1:<port>/terminal`.
   This port is on your **local PC**, not the remote host.
5. The client displays a pairing code such as `A1B2-C3D4-E5F6`. VS Code displays an
   **Allow Remote Terminal Connection?** dialog with a code.
6. **Compare the entire code in both places.** Choose **Allow** in VS Code only
   if they match and you initiated this connection. Otherwise cancel. No token
   copying is needed, and the shell is not created until you approve.
7. Use the remote shell normally. Terminal dimensions and keystrokes, including
   Ctrl+C during a session, are forwarded to the remote PTY.

To open another shell, run the client in another Windows Terminal tab using
**the same URL**. Approve its new pairing code. Up to ten sessions can run
concurrently, with independent input, output, dimensions, environment and exit
status. Approve or dismiss one pairing request before opening the next connection.
You do not need to run **Start Bridge** or copy a new URL for each terminal.

The new shell starts in the selected remote workspace directory, or the remote
home directory if no folder is open. It inherits the remote extension host's
environment, minus VS Code terminal/IPC integration and Node/Electron startup
variables. It does not inherit another terminal's manually set variables,
activated virtual environment, or running programs.

All extension actions are available through the keyboard-accessible Command Palette.
The local client also provides `--help`.

## Stop and session lifetime

- Type `exit` to exit **that shell only**. Its exit code is returned by that client.
  Other sessions and the shared URL remain usable.
- Run **Tunnel Terminal (Experimental): Stop Bridge** to terminate **all sessions**
  and close the shared listener. Restarting creates a new URL.
- Closing a client or losing its connection terminates only its session. A
  heartbeat detects broken local connections, and a remote shell is terminated
  if its relay is not polled for **45 seconds**.
- The reusable URL has **no idle expiry**. It remains available until Stop Bridge,
  extension shutdown/reload, or loss of the owning VS Code window.
- At most **10 connections** are admitted, including sessions still starting or
  closing. Close one before opening an eleventh.
- There is **one pending approval at a time**. Approval expires after **one minute**.
  Denial, timeout, or disconnection never starts a shell. Dismiss any stale approval
  dialog before attempting another connection; approving it cannot revive the
  abandoned session.
- After denial, timeout, exit, or disconnect, reuse the same URL for a **new shell**.
  You cannot reconnect to the previous shell or recover its process state.
- There is no session persistence or simultaneous access from an integrated
  terminal. Deliberately detached/background services are not a
  supported lifecycle feature; do not rely on this experiment to supervise them.

## Security and transport

Approving a connection grants shell access with your remote user account's
permissions. **Never approve merely because a dialog appeared:** compare its
entire code with your local client first. Codes are randomly generated per
connection and approval authorizes only that particular WebSocket. There is no
automatic approval, remembered-client trust, bearer token, or stored credential.

Both relay listeners bind only to `127.0.0.1`. They require approval before
creating a PTY and reject browser-originated WebSocket upgrades.
The extensions never request port forwarding or publish a web endpoint.
The client accepts plaintext connections only to loopback and uses normal
certificate verification for TLS. It does not follow authentication redirects.
An unapproved client can request pairing but cannot send shell input or obtain
shell output. At most one approval dialog is pending at a time. Someone who can
reach the local port can still consume connection capacity or request approval;
never approve an unexpected request, and stop the bridge when it is not needed.

Version 0.0.1 used `vscode.env.asExternalUri`. On Remote Tunnels this returned a
`*.devtunnels.ms` web URL protected by an additional gateway login. A standalone
WebSocket client did not inherit VS Code's login and received HTTP 302/401.
Version 0.0.2 removes that web-forwarding path: the local companion uses stable
VS Code commands to relay bounded input/output batches through the already
authenticated VS Code remote connection.
Version 0.0.3 retains that transport and adds independent, session-scoped relays
behind one reusable local URL.

No browser cookies, Dev Tunnels tokens, public-port settings, or redirect-following
workarounds are needed. The internal relay commands, like other extension commands,
are callable by installed extensions; only install extensions you trust. Session
IDs prevent stale requests from operating on another session, but are not a
security boundary against other code running as your user.

Stopping a bridge closes its listeners. Old URLs cannot resume it. Remove any
Ports-view entry left from testing version 0.0.1; the new version does not need it.

Only connect to a host you trust: as with SSH, remote programs control the terminal
output and escape sequences displayed locally.

## Troubleshooting

- **Commands not visible:** use desktop VS Code with a remote workspace, trust the
  workspace, and install the remote package through that connected window.
- **Local companion unavailable:** install the companion VSIX under **Local -
  Installed** in the same connected window. Upgrade both packages to 0.0.3 and
  run **Developer: Reload Window**.
- **Native module load/spawn failure:** inspect the **Tunnel Terminal (Experimental)**
  output channel in VS Code. Check the remote architecture, PTY dependency, shell
  executable, and working directory.
- **302/401 or a `*.devtunnels.ms` URL:** this is the old web-forwarding path.
  Upgrade both extensions, stop the old bridge, start a new one, and copy its
  `127.0.0.1` URL. Do not make the old forwarded port public.
- **403 on localhost:** browser-originated requests and old clients that send
  bearer tokens are rejected. Use the bundled Node client.
- **Connection limit reached:** close one of the ten sessions, then retry the same URL.
- **Another terminal awaiting approval:** approve or dismiss the current dialog,
  then retry. Existing approved sessions are unaffected.
- **Approval denied/timed out:** dismiss any old dialog, reconnect to the same URL,
  and compare both codes before approving within one minute.
- **Connection refused/closed:** check that VS Code is still connected and that the
  bridge is still running. If the window was reloaded, run Start Bridge and use
  the new URL. Sessions are not automatically resumed.

## Development and validation

```powershell
npm run check
npm test
```

The tests cover protocol validation, explicit pairing approval, denial and expiry,
late-approval rejection, origin rejection, per-session ownership, the exact
ten-session limit, URL reuse and cross-session isolation,
output acknowledgements/backpressure, resizing, process failure,
relay batch limits and lease expiry, disconnect cleanup, and real native PTY
subprocesses. The PTY lives in a short-lived
Node helper so native errors and retained ConPTY worker handles do not accumulate
in the remote extension host.

Local relay tests do not replace testing two actual extension hosts through
Remote Tunnels. Before relying on the experiment, verify a real tunnel connection with:
shell input/output, a resize, Unicode paste, Ctrl+C, a nonzero exit status, closing
one client while another stays active, URL reuse, and **Stop Bridge** closing all
clients. Verify that cancelling approval leaves no shell,
and cancel any request whose code does not match. Test each desired remote OS separately.
