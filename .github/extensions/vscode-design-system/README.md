# VS Code design system

Storybook is the documentation host for this workspace-scoped Copilot canvas. It owns navigation, search, docs pages, story selection, preview controls, and deep links. There is no separate custom site shell.

Local development reads saved files directly from the current checkout, including uncommitted changes. No publishing or static export is required.

## Run locally

Use Node.js 24 or newer on `PATH`. Canvas providers hosted in Electron launch the standalone Node executable for Storybook and fixture discovery rather than loading native dependencies into Electron.

Install this standalone tool's dependencies using the configured internal VS Code npm feed:

```sh
npm install --prefix .github/extensions/vscode-design-system
```

The package and lockfile are isolated from the product's dependencies. The repository's existing dependencies supply the Component Explorer CLI, MCP client, and Codicon font.

Start the repository's **Component Explorer Server** task for real interactive fixtures. Then either open canvas ID `vscode-design-system`, or run:

```sh
npm --prefix .github/extensions/vscode-design-system run dev
```

Open the printed Storybook URL in a normal browser. The canvas opens that same kind of local Storybook instance, not a separately published webview snapshot. Canvas-owned servers stop when their canvas closes; stop the terminal command with Ctrl+C. Neither entry point starts a cloud agent session or takes ownership of an existing Component Explorer daemon.

Docs still work when Component Explorer is unavailable. Component pages explain the missing prerequisite and provide **Reconnect Component Explorer** after its server is started.

## Data flow

```text
Current checkout ── source readers and file watchers ── live source API
                                                             │
Component Explorer ── live catalog and embedded renderer ── Storybook
                                                             │
                                                   Canvas or browser
```

- [system.mjs](./system.mjs) and its source readers extract registered sizes, typography, theme declarations and includes, ANSI defaults, Codicons, guidance, and selected TypeScript APIs. Existing content renderers remain responsible for specimens and reference content, not host navigation.
- [storybook-host.mjs](./storybook-host.mjs) generates ordinary MDX pages and CSF stories into the ignored `stories-generated/` directory. Generated files are disposable integration artifacts, not a separately authored content catalog. They live outside the hidden Storybook config directory so native story-file watching can update the sidebar. Fixture story identities derive from actual fixture IDs and stay stable when catalog order changes.
- [server.mjs](./server.mjs) exposes the read-only source inventory, allowlisted source links, view actions, and live catalog. Storybook proxies those routes on its own origin; source writes and arbitrary filesystem reads are not exposed.
- Source-directory watches handle saved edits and atomic file replacement. Source events refresh mounted docs through server-sent events. Theme additions are discovered under the built-in theme extensions. Invalid source data produces a visible problem rather than silently retaining a successful snapshot.
- Fixture-file edits invalidate the catalog and regenerate Storybook's native sidebar entries. Component Explorer remains responsible for rendering and hot reloading the actual widgets, styles, services, and fixture state.
- [reference.jsx](./reference.jsx) is a small React mount adapter for Storybook MDX. Widgets remain imperative VS Code controls; they are not rewritten in React.

The existing curated reusable controls remain the scope of the Components section. Feature composites stay in Component Explorer. Actual theme variants appear as native Storybook stories; the docs page shows a live example plus usage, accessibility, and source-backed API details.

## Canvas actions

`inspect_system` reports the active checkout, indexed content, themes, control gaps, source limitations, and live panels. `set_view` selects a section, control, fixture, theme, search query, or content anchor. Storybook handles the visible navigation. The old `expandedNodes` field is accepted for action compatibility but does not manage Storybook's sidebar.

Source identity reports the actual local branch, worktree, commit, and modified status. A local `main` checkout is not labeled as a verified deployment. Source links open allowlisted checkout files with line anchors.

## Scope and limitations

- Live means saved checkout files, not unsaved editor buffers.
- UI colors remain explicit theme declarations and includes, with source-registered defaults for all 16 ANSI colors. This is not a full runtime color-registry resolver.
- Typography retains source-derived roles, native font stacks, legacy aliases, and workbench line-height. Font availability depends on the machine.
- Theme shell illustrations are schematic, not live workbench renders. Fixture themes are owned by Component Explorer, independently of the token-reference theme selector.
- Motion remains an outline and finite illustrative previews, not a centralized product motion system. Interaction patterns, accessibility, content, and layout guidance retain their labeled audit gaps.
- Public static publishing is not implemented here. A future exporter must snapshot the source data and provide a standalone fixture runtime instead of depending on a local Component Explorer daemon.

## Validation

```sh
npm --prefix .github/extensions/vscode-design-system test
```

Validate the running site in a browser: browse docs and actual light, dark, and high-contrast fixture stories; change a saved source token and verify its specimen updates without publication; restore the edit; and verify sidebar navigation, source links, filtering, and keyboard interaction.
