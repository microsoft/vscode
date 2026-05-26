# Process State Protocol (PSP)

A prototype protocol that lets long-running CLIs publish live state to VS Code while they run in an integrated terminal. The editor can then surface that state in the UI and let the user open it as a live document.

## Concept

A long-running CLI (build watcher, dev server, test runner, …) often has more to say than what it prints to stdout: a status (idle / working / error), a structured list of errors, progress, last result. PSP gives that CLI a side channel back to VS Code:

- VS Code allocates a unique token per terminal at creation time.
- The terminal process inherits two env vars: `PROCESS_STATE_PROTOCOL_ENDPOINT` and `PROCESS_STATE_PROTOCOL_TOKEN`.
- The CLI connects to the endpoint, claims its token, then publishes a JSON "watch document" whenever its state changes.
- The watch document is exposed in the editor as `psp:/sessions/<sessionId>.json` — a read-only file that updates live — and a child row appears under the terminal in the tabs tree.

## Wire protocol

Newline-delimited JSON-RPC 2.0 over a named pipe (Windows) or Unix domain socket.

Methods:

- `initialize(token, client?)` — handshake, claims the token allocated to the terminal.
- `session/update(doc)` — publishes a new watch document. The doc is `{ status: string, … }` with arbitrary additional fields.
- `session/close()` — clean shutdown.

Env vars handed to every terminal:

- `PROCESS_STATE_PROTOCOL_ENDPOINT` — pipe path or socket path.
- `PROCESS_STATE_PROTOCOL_TOKEN` — opaque, one-shot. Revoked after `initialize`.

Constants live in `src/vs/platform/processStateProtocol/common/protocol.ts`:

- `ENV_VAR_ENDPOINT`, `ENV_VAR_TOKEN`
- `PSP_URI_SCHEME = 'psp'`
- `PSP_MAIN_CHANNEL_NAME = 'processStateProtocol'`
- `PROTOCOL_VERSION = 0`

## Watch document

```ts
interface IWatchDoc {
    readonly status: string;
    readonly [key: string]: unknown;
}
```

The only required field is `status`. Publishers are free to attach anything else — e.g. the build watcher attaches:

```jsonc
{
    "status": "error",
    "lastBuild": {
        "filesTranspiled": 1234,
        "filesCopied": 56,
        "durationMs": 4210,
        "errors": [
            { "file": "src/a.ts", "line": 10, "column": 5, "message": "…" }
        ],
        "finishedAt": "2026-05-15T12:34:56.000Z"
    }
}
```

## Components

### Main process
- `src/vs/platform/processStateProtocol/common/protocol.ts` — types, decorator, constants.
- `src/vs/platform/processStateProtocol/electron-main/processStateProtocolMainService.ts` — owns the listening server, dispatches JSON-RPC, fires `onDidChangeSessions`.
- Registered in `src/vs/code/electron-main/app.ts` and exposed to the renderer via `ProxyChannel.fromService(...)` on `PSP_MAIN_CHANNEL_NAME`.

### Renderer (workbench, electron-browser)
- `processStateProtocol.contribution.ts` — registers the remote service, the workbench service, the file system provider, and the commands. A `BlockStartup` workbench contribution forces eager instantiation.
- `processStateProtocolService.ts` — observable sessions; allocates tokens per terminal, mutates `shellLaunchConfig.env` to inject the env vars, mutates `shellLaunchConfig.tabActions` to add a clickable info button on the terminal tab.
- `pspFileSystemProvider.ts` — exposes `psp:/sessions/<id>.json` as a live read-only file.
- `pspCommands.ts` — command IDs:
  - `workbench.action.processStateProtocol.openSession` — open by sessionId.
  - `workbench.action.processStateProtocol.openSessionForTerminal` — open by terminal instance.

### Terminal tabs UI
- `terminalTabsList.ts` was converted from `WorkbenchList<ITerminalInstance>` to `WorkbenchObjectTree<TerminalTabsElement, void>` so a PSP doc appears as a child row beneath its terminal. Clicking the child row opens the `psp:/sessions/<id>.json` editor.

### Build-side publisher
- `build/next/pspPublisher.ts` — small helper around `net.connect`, dedupes via `JSON.stringify` comparison, returns a no-op publisher if the env vars are missing or the handshake fails.
- `build/next/index.ts` — the esbuild watcher uses it: it publishes `{ status, lastBuild: { filesTranspiled, filesCopied, durationMs, errors[], finishedAt } }` on every transition.

### Demo
- `build/next/pspDemo.js` — standalone ESM Node script. Reads the env vars, connects, cycles through statuses. Useful to verify the wire path without the full build.

## How to use it from a publisher

1. Read `PROCESS_STATE_PROTOCOL_ENDPOINT` and `PROCESS_STATE_PROTOCOL_TOKEN` from the environment. If either is missing, do nothing — you're not running inside VS Code or the feature is off.
2. Open a socket / pipe to the endpoint.
3. Send `initialize` with the token and an optional `client = { name, version }`.
4. Whenever your state changes, send `session/update` with the new doc.
5. On clean shutdown, send `session/close`.

## Status

Prototype. The protocol version is `0` and may break. The renderer service and UI surface are still gated to the desktop (electron-browser) target.
