<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Direct desktop remote connections

External launchers can connect the desktop editor to a compatible VS Code server without a resolver extension:

```sh
code --remote 127.0.0.1:PORT --remote-token-file /absolute/path/to/token /remote/project
```

The launcher owns server installation and version matching, server authentication, transport security (for example, an SSH tunnel), and the local token file. Configure the server to require the same token. Protect the local file from other users. VS Code neither creates nor deletes it.

The option requires an absolute local file path and a direct `host:port` authority, including bracketed IPv6 addresses. The token must be non-empty and contain only `0-9`, `a-z`, `A-Z`, `_`, or `-`, with at most one trailing LF or CRLF, matching the server's token-file format. Spaces, a byte-order mark, additional lines, and an empty file are rejected. Missing, unreadable, or invalid files fail the CLI’s initial validation or, when encountered during authority resolution, produce a connection error in the target window. VS Code does not retry without authentication.

Resolver-extension authorities (such as `ssh-remote+host`), URI arguments, add/remove-folder operations, extension development, chat, and command-line-only operations cannot be combined with this option. Existing non-loopback host confirmation and remote-host security checks still apply. Authentication does not encrypt the direct connection; the launcher must provide any required secure transport.

## Credential lifetime

The CLI validates the file locally. When a launch is forwarded to a running editor process, only the file path is forwarded. The target window reads and validates the file during authority resolution. Keep the protected file available for initial authority resolution and any window reloads. A late read failure is reported as a connection error in the target window; it does not abort application startup or close unrelated windows. The normal detached CLI exit does not acknowledge that the window has connected.

The main process retains the file path in memory, scoped to the target window and remote authority (using the same case-insensitive authority comparison as window lookup). It reads the current token during authority resolution, including on window reload. Ordinary network reconnections reuse the resolved token for the session. Reopening a target with the same file path does not force a reload if no file-resolution failure was recorded. A different file path, a missing binding, or recovery from a file-resolution failure loads the target again, subject to the usual unload veto. Replacing the contents of the file takes effect the next time the authority is resolved, such as on window reload. After repairing a server authentication failure, reload the window to retry. Reusing the window for a different remote destination or a local workspace drops the credential. Other windows do not inherit it. A token-bearing launch opens only its requested targets; it does not also restore unrelated session windows. Without a project path it opens a new empty remote window unless `--reuse-window` is explicitly requested.

Session state stores only a non-secret indication that a window requires a token. After exiting and starting without the option, such a restored window refuses to connect and asks for another launch with the token file. Reusing that address and workspace for a server without authentication does not automatically clear this requirement; an explicit reset policy remains a maintainer decision. Neither the token nor the file path is stored in workspace settings, recent history, or window session state. A built-in application relaunch removes the original token-file and remote-address options, remote project paths, and launch-only window flags, allowing normal session restoration. Remaining arguments are rebuilt from the desktop CLI’s declared options; unknown Chromium switches are not retained. Relaunches that rewrite these arguments bypass pending-update handlers that cannot honor the changed arguments. Restored authenticated windows require a new launch with the token file; unrelated windows restore according to the existing settings. Launches forwarded to an existing process are not added to its original command line. External launchers should always pass both options when restarting their environment.

The direct connection supplies the token through the existing remote authentication handshake. It is not embedded in the remote authority or workspace URI. Wrong-token rejection comes from the server's existing authentication mechanism. When the option is absent, connections that have no saved authentication requirement and resolver extensions retain their existing behavior.

## Tests

Token-file parsing, window credential bindings, restart arguments, and direct authority resolution are covered by the existing unit runners:

```sh
npm run test-node -- --run src/vs/platform/remote/test/node/remoteConnectionToken.test.ts --run src/vs/platform/remote/test/common/connectionToken.test.ts --run src/vs/platform/environment/test/node/argv.test.ts --run src/vs/server/test/node/serverConnectionToken.test.ts --run src/vs/workbench/services/extensions/test/common/directRemoteAuthority.test.ts
scripts/test.sh --run src/vs/platform/windows/test/electron-main/windowsStateHandler.test.ts
```

These helper tests do not exercise the complete desktop launch, IPC, window-reuse, or application-restart flow. Those flows still need manual integration validation.

On headless Linux, run the Electron tests under `xvfb-run -a`. If `ELECTRON_RUN_AS_NODE` is set in the shell, unset it for the test runner. Containers with limited shared memory may also need `--disable-dev-shm-usage`.
