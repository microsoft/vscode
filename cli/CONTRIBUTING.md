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
