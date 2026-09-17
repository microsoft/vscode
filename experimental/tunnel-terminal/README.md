# Experimental Tunnel Terminal

Open a **new shell on a remote machine** from Windows Terminal while desktop VS Code
keeps its Remote Tunnels connection open. No SSH server, proposed extension APIs,
VS Code core changes, or separate tunnel credentials are needed.

This is a development experiment, not a published or supported VS Code feature.
It does **not** attach to existing integrated terminals.

```text
Windows Terminal -> bundled Node client -> VS Code port forwarding
                 -> authenticated remote bridge -> isolated PTY helper -> shell
```

## Requirements

- Desktop VS Code 1.95 or newer, connected to a trusted remote workspace.
- Node.js 22 or newer for building and running the local client.
- A supported remote host for `node-pty`: Windows, Linux, or macOS.
- Keep the remote VS Code window connected throughout the session.

The extension runs on the **remote workspace extension host**. The client runs on
your **local Windows machine**. VS Code in a browser is intentionally not supported
in this first version.

## Build and install

This folder is an independent npm package. It is not part of VS Code's main build.
Run these commands **from this folder**, not from the repository root:

```powershell
Set-Location D:\code\vscode\experimental\tunnel-terminal
npm ci
npm test
npm run package
```

The outputs are:

- `experimental-tunnel-terminal-0.0.1.vsix`: remote extension package.
- `dist/client.cjs`: standalone local client, with its JavaScript dependencies and
  license notices bundled. Copy just this file to your local machine if you built
  the extension remotely. No local `npm install` or native PTY library is needed
  to run it.

In the **remote-connected VS Code window**, run **Extensions: Install from VSIX...**
and select the generated VSIX. Check that the extension is installed on the remote
host, not just locally, and reload that remote window if prompted.

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
   it at the client's URL prompt.
5. Run **Tunnel Terminal (Experimental): Copy Connection Token** and paste it at the
   client's hidden token prompt. Press Enter. The token is not echoed or placed
   in command history or process arguments.
6. Use the remote shell normally. Terminal dimensions and keystrokes, including
   Ctrl+C during a session, are forwarded to the remote PTY.

The new shell starts in the selected remote workspace directory, or the remote
home directory if no folder is open. It inherits the remote extension host's
environment, minus VS Code terminal/IPC integration and Node/Electron startup
variables. It does not inherit another terminal's manually set variables,
activated virtual environment, or running programs.

All extension actions are available through the keyboard-accessible Command Palette.
The local client also provides `--help`.

## Stop and session lifetime

- Type `exit` to exit the remote shell normally. Its exit code is returned by the client.
- Run **Tunnel Terminal (Experimental): Stop Bridge** to terminate the active
  shell and invalidate the connection.
- Closing the local client, losing its connection, or unloading the extension
  terminates the session. A heartbeat detects broken connections.
- An unused bridge expires after **five minutes**.
- Each bridge accepts **one authenticated client**. After exit or disconnect,
  run **Start Bridge** again to obtain fresh connection details.
- There is no reconnect, session persistence, or simultaneous access from an
  integrated terminal. Deliberately detached/background services are not a
  supported lifecycle feature; do not rely on this experiment to supervise them.

## Security and forwarding

The connection token grants shell access with your remote user account's
permissions. Treat it as a password. It is random, held in memory, and expires
with the bridge. Do not put it in a URL, command argument, log, or checked-in file.
Clear it from your clipboard when finished.

The bridge listens only on remote `127.0.0.1`, authenticates before creating a PTY,
rejects browser-originated WebSocket upgrades, and never intentionally publishes
a public port. Keep the forwarded port **private** and bound to local loopback.
The client accepts plaintext connections only to loopback and uses normal
certificate verification for TLS. It does not follow authentication redirects.

`vscode.env.asExternalUri` controls the actual forwarding. Desktop Remote Tunnels
normally provides a locally reachable endpoint; other remote providers can return
an HTTPS endpoint with additional authentication requirements. This client does
not automate provider browser login/cookies. If the resolved URL redirects to a
login page or rejects the WebSocket upgrade:

1. Inspect the port in VS Code's **Ports** view.
2. Use private, local forwarding for that remote port and its local address,
   keeping the `/terminal` path.
3. Do not make the port public or disable TLS verification to work around it.

Stopping the bridge closes its listener. The Ports view entry itself may remain:
the stable `asExternalUri` API does not return a disposable forwarding handle.
Remove that entry manually if desired. Old connection URLs/tokens will not restore
an expired session.

Only connect to a host you trust: as with SSH, remote programs control the terminal
output and escape sequences displayed locally.

## Troubleshooting

- **Commands not visible:** use desktop VS Code with a remote workspace, trust the
  workspace, and install the extension remotely.
- **Native module load/spawn failure:** inspect the **Tunnel Terminal (Experimental)**
  output channel in VS Code. Check the remote architecture, PTY dependency, shell
  executable, and working directory.
- **401:** use the current bridge's token. A provider-level authentication failure
  can also reject the upgrade; check the forwarding notes above.
- **409:** this bridge has already accepted a client. Stop/start it for a new session.
- **Connection refused/closed:** check that VS Code is still connected and that the
  bridge has not expired. Sessions are not automatically resumed.

## Development and validation

```powershell
npm run check
npm test
```

The tests cover protocol validation, authentication, origin rejection, one-client
ownership, output acknowledgements/backpressure, resizing, process failure, expiry,
disconnect cleanup, and real native PTY subprocesses. The PTY lives in a short-lived
Node helper so native errors and retained ConPTY worker handles do not accumulate
in the remote extension host.

Local loopback tests do not replace testing through the actual Remote Tunnels
provider. Before relying on the experiment, verify a real tunnel connection with:
shell input/output, a resize, Unicode paste, Ctrl+C, a nonzero exit status, closing
the client, and **Stop Bridge**. Test each desired remote OS separately.
