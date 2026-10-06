---
name: create-canvas
description: 'Create a project Copilot extension canvas for the current workspace.'
argument-hint: What should the canvas show or let users do?
user-invocable: true
---

Create a working canvas extension in the current workspace. Do the implementation rather than only returning a sample.

## Clarify only when needed

The extension scope is fixed: create a project extension under `.github/extensions/<name>/`.

If the requested canvas purpose is unclear, ask what it should display or let the user do. If durable state is required but its identity or lifetime is ambiguous, ask whether the state belongs in a workspace artifact, session-private storage, or private storage across sessions.

## Inspect first

Before writing:

1. Check for existing `.github/extensions/` conventions and reusable UI/server helpers.
2. Choose a short kebab-case extension folder name and a stable canvas ID.
3. Identify the domain identity for durable state, such as a file path, document ID, or record ID. `instanceId` identifies a panel, not its data.

## Implement

Create `.github/extensions/<name>/extension.mjs`.

- Use ES modules and import `createCanvas`, `CanvasError`, and `joinSession` from `@github/copilot-sdk/extension`.
- Do not create a `package.json` or install `@github/copilot-sdk`; the runtime resolves it automatically.
- Never write to stdout with `console.log`. Use `session.log()` for diagnostics.
- Bind embedded HTTP servers to `127.0.0.1` on an ephemeral port.
- Return an HTTP URL from `open()`. Do not place credentials or private state in the URL.
- Treat `open()` as idempotent. Reopening the same `instanceId` must reuse or safely replace its live server and reload state from the stable domain identity.
- Choose storage by ownership and lifetime using the portable storage rules below. Do not require a VS Code-specific environment variable.
- Use semantic HTML, keyboard-accessible controls, visible focus, labels, and ARIA status text. The page has no privileged VS Code bridge; use ordinary same-origin HTTP endpoints or server-sent events.
- Escape untrusted values before inserting them into HTML and validate every HTTP and action input.

### Portable storage

Choose ownership and lifetime deliberately; a request to persist state does not by itself select cross-session private storage. Keep these storage lifetimes distinct:

- **Workspace artifacts**: Store user-owned documents at an explicit path in the current repository or workspace when they should be versioned or directly editable. Do not use `session.workspacePath` as the repository root.
- **Session-private state**: After `joinSession()` resolves, use `session.workspacePath` with a child path such as `files/canvases/<name>/`. This is the SDK's session-state directory, not the code workspace. It may be `undefined`; fail explicitly if session-private storage is required but unavailable. State lasts only as long as that session's stored data, not indefinitely across new sessions.
- **Private state across sessions**: Prefer `process.env.VSCODE_CANVAS_DATA_DIR` when supplied, treating it as an opaque, host-provided extension data root and retaining the extension's existing child directory layout. Its absence is normal in other hosts, including the GitHub Copilot app. Otherwise use `process.env.COPILOT_HOME`, or `path.join(os.homedir(), '.copilot')` when `COPILOT_HOME` is unset, with a child path `extensions/<name>/artifacts/<extension-identity>/`. Use Node's `node:path` and `node:os` APIs, not shell expansion or hardcoded path separators.

For new portable private storage, derive `<extension-identity>` from a stable hash of the canonical absolute path of the extension's `extension.mjs` entry point. This isolates same-named extensions installed at different locations; moving or copying the extension changes that identity. Within any storage root, key records by stable domain identity, not `instanceId`. Validate or hash user-provided record IDs so they cannot escape the chosen directory.

Validate the selected storage root as an absolute path before creating directories. A selected environment variable that is present but empty or relative is an error, not a reason to try another root. Surface directory creation, read, parse, and write errors; do not silently fall back to the repository, a temporary directory, or empty state. Resolve storage once per extension session and reuse it for opens and actions.

Do not switch from unavailable session-private storage to cross-session private storage. Only use the Copilot-home fallback when the user has chosen private storage across sessions.

When updating an existing extension, preserve its storage location, identity algorithm, and record layout unless the user explicitly requests a migration. Do not move or merge existing VS Code private data into the portable fallback. Private data is local to the selected host and extension identity; running the same extension in another host does not automatically transfer it. Use workspace artifacts or an explicit export/import when users need to share data.

### Canvas contract

Declare the canvas with:

- a short single-sentence `description`;
- an optional `inputSchema`;
- agent-facing `actions[]`;
- an `open` handler;
- an `onClose` handler that stops instance-owned servers.

Rules:

- If the canvas takes no input, omit `inputSchema`. If it declares an object schema, callers must open it with an object such as `{}`, not `null`.
- Action names must not start with `canvas.`.
- Every action must have a handler and its own JSON Schema when it accepts input.
- Return raw action results. Throw `new CanvasError(code, message)` for expected failures.
- Do not rely on closing the VS Code canvas tab to call `onClose`; tab closure hides presentation only. Preserve the live instance so a later agent reopen can show the same state.

Keep `extension.mjs` focused on wiring. Put substantial HTML, CSS, client JavaScript, schemas, storage, and domain logic in sibling modules or asset files.

## Validate

1. Run `node --check .github/extensions/<name>/extension.mjs` and the smallest relevant extension tests. For private state across sessions, cover both the host-provided root and the fallback with `VSCODE_CANVAS_DATA_DIR` unset, reopening the same domain record with a different `instanceId`, and explicit errors for invalid paths or inaccessible storage. For session-private state, also cover an unavailable `session.workspacePath`.
2. Call `extensions_reload` after creating or modifying the extension. This stops and restarts all extension providers; previously open canvases are rehydrated after their providers reconnect.
3. After reload, do not claim success until the runtime confirms the canvas:
   - call `list_canvas_capabilities` for the canvas ID;
   - call `open_canvas` with a stable `instanceId` and schema-valid input;
   - call at least one `invoke_canvas_action` when actions exist.
4. Close the canvas tab, ask the agent to reopen the same instance, and confirm the state is preserved.

Summarize the files created, the canvas and action IDs, where state is stored, and the reload and runtime verification results.
