# Setup

0. Clone, and then run `git submodule update --init --recursive`
1. Get the extensions: [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) and [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb)
2. Ensure your workspace is set to the `launcher` folder being the root.

## Building the CLI on Windows

For the moment, we require OpenSSL on Windows, where it is not usually installed by default. To install it:

1. Follow steps 1 and 2 of [Set up vcpkg](https://learn.microsoft.com/en-us/vcpkg/get_started/get-started-msbuild?pivots=shell-powershell#1---set-up-vcpkg) to obtain the executable.
1. Add the location of the `vcpkg` directory to your system or user PATH.
1. Run`vcpkg install openssl:x64-windows-static-md` (after restarting your terminal for PATH changes to apply)
1. You should be able to then `cargo build` successfully

OpenSSL is needed for the key exchange we do when forwarding Basis tunnels. When all interested Basis clients support ED25519, we would be able to solely use libsodium. At the time of writing however, there is [no active development](https://chromestatus.com/feature/4913922408710144) on this in Chromium.

# Debug

1. You can use the Debug tasks already configured to run the launcher.

## Agent host tunnels

Use `code tunnel` to expose both remote editor access and agent hosts. `code agent --tunnel`
and `code agent host --tunnel` are aliases for this command, not agent-host-only tunnels.
Tunnel naming, existing-tunnel credentials, server data, and user data options are forwarded
to the tunnel command. Local-only options such as `--host`, `--port`, connection tokens,
`--replace`, `--new-instance`, `--foreground`, and `--idle-timeout` cannot be combined
with `--tunnel`. Use `--accept-server-license-terms` to accept the server license without
an interactive prompt.

Without `--tunnel`, `code agent` and `code agent host` still start or reuse a local
agent host supervisor.

## Headless sandbox certificate management

Run these commands on the computer hosting the agent, as the same operating-system account and with the same `COPILOT_HOME` as that agent host. If unset, the home defaults to the account's `.copilot` directory. Desktop VS Code and a separate Copilot CLI installation are not required.

```powershell
code-insiders agent sandbox ca create
code-insiders agent sandbox ca trust
code-insiders agent sandbox ca status
code-insiders agent sandbox ca remove
```

`create` creates the CA only if missing and prints the public certificate path; it does not establish OS trust. `trust` confirms the change and trusts that account's existing CA, without creating or rotating it. `trust --yes` skips only the CLI confirmation, not OS authorization. Windows can show an administrator prompt; macOS can require login-Keychain authorization. An SSH session without access to OS prompts can still fail. Do not run the whole agent host as Administrator or SYSTEM to work around this.

`remove` confirms the change and removes OS trust for that account's CA. It keeps the stored CA and private key; it does not create or rotate the CA. Tools that require the proxy CA can lose connectivity. `remove --yes` skips only the CLI confirmation, not OS authorization. Restart affected tools after removal.

The command provisions the matching VS Code Server if needed, then runs a one-shot certificate entry point and its bundled Copilot runtime over stdio. It opens no server port, creates no chat, does not enable sandboxing, and stops the runtime after the operation. It does not connect to an existing host or accept a remote address or another user's certificate path. Use `--accept-server-license-terms` when server-license consent must be supplied noninteractively.

For development, build the CLI with `VSCODE_CLI_OVERRIDE_SERVER_PATH` pointing to the matching development server launcher. This skips downloading a server. An unversioned CLI without this override fails rather than using a published server that might not support certificate commands.

Status exit codes are `0` (trusted), `3` (missing trust), `4` (unsupported platform), `5` (rotation needed), and `1` (error). Other commands return `0` only on success. The runtime owns certificate validation and OS trust integration. Linux currently uses a per-process CA bundle rather than OS root installation.

VS Code does not create or check a cross-process certificate lock file. A leftover lock file from an earlier development build does not block certificate commands. Existing operations within one agent host remain queued without lock-error messages. Changes from separate processes are not serialized by VS Code; the runtime and OS determine their outcome, with no guaranteed last-writer-wins ordering. Ctrl+C stops the command's process tree; OS trust may already have changed, so check status before retrying. After a successful trust change, restart affected tools.

In a connected remote chat, select **Refresh** in the certificate notice to check the host again after installing trust through the CLI. This read-only action bypasses the host's cached observations and updates certificate diagnostics for its live chats. A failed check reports an error and permits retry; confirmed trust clears the notice. The button requires refresh support from the host. There is no automatic cross-process notification: if no notice is visible, or the host is older, restart the remote agent host and reconnect to discard cached observations. Reloading only the client does not reliably clear a persistent host's cache.

## Tunnel request correlation

Management requests and relay WebSocket handshakes carry the
`X-Tunnels-VSCode-Session-Id`, `X-Tunnels-VSCode-Client-Operation-Id`, and
`X-Tunnels-VSCode-Client-Request-Id` headers. Each request has a fresh request ID.
VS Code passes its telemetry session and operation IDs through
`VSCODE_TUNNEL_SESSION_ID` and `VSCODE_TUNNEL_OPERATION_ID` when launching the CLI.
These IDs are preserved verbatim; telemetry session IDs are not necessarily UUIDs.
Standalone commands use a process-local session ID and a new operation ID for each
management client. Correlation IDs are sent in service headers, not written to CLI logs.
Local CLI status, login, and service-management invocations retain correlation IDs but
do not emit host-operation telemetry.
Attaching to an already-running tunnel does not replace that process's correlation IDs;
its service requests retain the IDs of the original host process.
