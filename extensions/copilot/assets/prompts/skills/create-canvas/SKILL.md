---
name: create-canvas
description: 'Create a Copilot extension canvas at user, workspace, or plugin scope.'
argument-hint: What should the canvas show or let users do?
user-invocable: true
---

Create a working canvas extension at the user's chosen scope. Do the implementation rather than only returning a sample.

Any Copilot host may load the extension. Build only on the Copilot SDK contract described here; do not depend on environment variables, paths, APIs, or UI behavior specific to one host.

## Choose the scope

Before writing any files, use `ask_user` to offer all three scopes unless the user already specified a scope. Do not infer workspace scope merely because a workspace is open.

| Scope | Entry point | Availability |
| --- | --- | --- |
| User | `<copilot-home>/extensions/<name>/extension.mjs` | Personal canvas available across the user's workspaces. |
| Workspace | `<workspace-root>/.github/extensions/<name>/extension.mjs` | Repository-owned canvas shared with users of that workspace when checked in. |
| Plugin | `<plugin-root>/extensions/<name>/extension.mjs` | Canvas bundled in an installable plugin that can be shared with teammates across workspaces. |

Resolve `<copilot-home>` using `process.env.COPILOT_HOME` exactly as given whenever it is non-empty, otherwise `path.join(os.homedir(), '.copilot')`.

For plugin scope, ask whether to use an existing plugin or create a new one, and where its source lives, unless already specified. Work in the plugin source, not an installed cache. For a new plugin, create `.plugin/plugin.json` with `name`, `version`, `description`, and `"extensions": "extensions/"`. For an existing plugin, preserve its metadata and components, honor its configured extension directory, or add the `extensions` field if missing.

Use the selected extension directory as `<extension-dir>` throughout implementation and validation. Do not create copies at other scopes.

## Clarify only when needed

If the requested canvas purpose is unclear, ask what it should display or let the user do. If durable state is required but its identity or lifetime is ambiguous, ask whether the state belongs in a workspace artifact or private extension storage.

## Inspect first

Before writing:

1. Check the selected location for existing extension conventions and reusable UI/server helpers, including the manifest for plugin scope. Do not copy host-specific dependencies from them.
2. Choose a short kebab-case extension folder name and a stable kebab-case canvas ID. The canvas ID also names the extension's private data folder, which every repository on the machine shares, so make it distinctive: qualify generic names with the project or domain, for example `contoso-release-board` rather than `board`.
3. Identify the domain identity for durable state, such as a file path, document ID, or record ID. `instanceId` identifies a panel, not its data.

## Implement

Create `<extension-dir>/extension.mjs`.

- Use ES modules and import `createCanvas`, `CanvasError`, and `joinSession` from `@github/copilot-sdk/extension`.
- Do not create a `package.json` or install `@github/copilot-sdk`; the runtime resolves it automatically.
- Never write to stdout with `console.log`. Use `session.log()` for diagnostics.
- Bind embedded HTTP servers to `127.0.0.1` on an ephemeral port.
- Return an HTTP URL from `open()`. Do not place credentials or private state in the URL.
- Treat `open()` as idempotent. Reopening the same `instanceId` must reuse or safely replace its live server and reload state from the stable domain identity.
- For user and plugin scopes, do not hard-code the current workspace's path. Accept workspace-specific resources through canvas inputs or actions.
- Store repo-owned artifacts at a sensible workspace path when the user expects them to be versioned or directly editable.
- Store private durable data outside the repository, in `extension-data/<canvas-id>/` under the resolved Copilot home that every Copilot host shares, regardless of extension scope. Create directories on first use.
- Several sessions, workspaces, and hosts may run the extension at the same time, so:
  - key records by their domain identity so workspaces do not overwrite each other's state;
  - write each file atomically: write a uniquely named temporary file in the same directory, then rename it over the target;
  - store a format marker and version with the data, validate them and the data's shape on every read, and report unrecognized or corrupt data instead of overwriting it;
  - report storage failures from `open()` or actions with `CanvasError` instead of failing to load.
- Use semantic HTML, keyboard-accessible controls, visible focus, labels, and ARIA status text. The page is ordinary web content with no privileged host bridge; use same-origin HTTP endpoints or server-sent events.
- Escape untrusted values before inserting them into HTML and validate every HTTP and action input.

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
- Do not rely on `onClose` when the user closes a canvas view; hosts may hide a presentation without closing its instance. Preserve the live instance so a later agent reopen can show the same state.

Keep `extension.mjs` focused on wiring. Put substantial HTML, CSS, client JavaScript, schemas, storage, and domain logic in sibling modules or asset files.

## Validate

1. Run `node --check "<extension-dir>/extension.mjs"` and the smallest relevant extension tests. For plugin scope, also validate the manifest and its extension directory.
2. For plugin scope, ensure the plugin is installed or loaded from its source using the host's supported plugin workflow, with the user's approval as needed. Creating plugin files alone does not make the canvas discoverable.
3. Call `extensions_reload` after creating or modifying the extension. This stops and restarts all extension providers; previously open canvases are rehydrated after their providers reconnect.
4. After reload, do not claim success until the runtime confirms the canvas:
   - call `list_canvas_capabilities` for the canvas ID;
   - call `open_canvas` with a stable `instanceId` and schema-valid input;
   - call at least one `invoke_canvas_action` when actions exist.
5. Call `open_canvas` again with the same `instanceId` and confirm the canvas shows the preserved state instead of starting over.

Summarize the selected scope and location, files created, the canvas and action IDs, where state is stored, any plugin installation or loading steps, and the reload and runtime verification results.
