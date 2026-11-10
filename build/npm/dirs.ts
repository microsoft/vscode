/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';

/**
 * Members of the main pnpm workspace (`pnpm-workspace.yaml` at the repository root), in a fixed
 * order. `''` is the repository root. They share the root `pnpm-lock.yaml` and are installed by a
 * single `pnpm install` at the root. They include the built-in extensions, which the product build
 * bundles, the Copilot extension and `chat-lib`, which is extracted from its sources and published as
 * an npm package (see `extract-chat-lib`), and the sanity tests. Their native modules build for
 * Electron, with the `nativeBuild` field of the root `package.json`.
 */
export const workspaceMembers = [
	'',
	'.eslint-plugin-local',
	'.vscode/extensions/vscode-selfhost-import-aid',
	'.vscode/extensions/vscode-selfhost-test-provider',
	'.vscode/extensions/vscode-pr-pinger',
	'extensions',
	'extensions/configuration-editing',
	'extensions/copilot',
	'extensions/copilot/chat-lib',
	'extensions/css-language-features',
	'extensions/css-language-features/server',
	'extensions/debug-auto-launch',
	'extensions/debug-server-ready',
	'extensions/emmet',
	'extensions/extension-editing',
	'extensions/git',
	'extensions/git-base',
	'extensions/github',
	'extensions/github-authentication',
	'extensions/grunt',
	'extensions/gulp',
	'extensions/html-language-features',
	'extensions/html-language-features/server',
	'extensions/ipynb',
	'extensions/jake',
	'extensions/json-language-features',
	'extensions/json-language-features/server',
	'extensions/markdown-language-features',
	'extensions/markdown-language-features/test-workspace/checkbox-count-extension',
	'extensions/markdown-math',
	'extensions/merge-conflict',
	'extensions/mermaid-markdown-features',
	'extensions/microsoft-authentication',
	'extensions/notebook-renderers',
	'extensions/npm',
	'extensions/php-language-features',
	'extensions/references-view',
	'extensions/search-result',
	'extensions/simple-browser',
	'extensions/terminal-suggest',
	'extensions/tunnel-forwarding',
	'extensions/typescript-language-features',
	'extensions/vscode-api-tests',
	'extensions/vscode-colorize-perf-tests',
	'extensions/vscode-colorize-tests',
	'extensions/vscode-test-resolver',
	'scripts',
	'src/vs/sessions/test/e2e',
	'test/automation',
	'test/componentFixtures/playwright',
	'test/integration/browser',
	'test/monaco',
	'test/sanity',
	'test/scenario',
	'test/smoke',
	'test/unit',
];

/**
 * Folders of the main workspace whose projects get the `node_modules` layout of a separate install
 * of the folder in the product: the build lays out their production dependencies the way pnpm's
 * hoisted linker would install the workspace members in the folder, without the rest of the
 * workspace (see `build/lib/dependencies.ts`). A member belongs to the deepest one that contains it;
 * the others belong to the repository root. So the product's `extensions/node_modules` (the
 * dependencies that the built-in extensions share), `extensions/copilot/node_modules` and root
 * `node_modules` don't depend on each other's dependencies.
 */
export const layoutRoots = [
	'extensions',
	'extensions/copilot',
];

/**
 * Separate pnpm install roots (each with its own `pnpm-workspace.yaml` and `pnpm-lock.yaml`) that
 * the root postinstall installs after the workspace, in this order. They build native modules for a
 * different runtime than the workspace (see the `nativeBuild` field of their `package.json`, and
 * their `.pnpmfile.mjs`): `build` for the Node.js that runs the build scripts, `remote` for the
 * Node.js of the server.
 */
export const separateRoots = [
	'build',
	'remote',
];

/**
 * Members of the workspaces of separate roots, by root: they share the root's `pnpm-lock.yaml` and
 * are installed by its `pnpm install`. pnpm uses the nearest `pnpm-workspace.yaml` above a folder,
 * so folders inside a separate root can't be members of the main workspace. `remote/web` holds the
 * dependencies of the web build, which packages them flat (see `getFlatProductionDependencies`).
 */
export const separateRootMembers: Readonly<Record<string, readonly string[]>> = {
	'build': ['build/rspack', 'build/vite'],
	'remote': ['remote/web'],
};

/**
 * Distro folders, present only when the distro is checked out in `.build/distro`. Each one is a
 * separate pnpm install root, never a workspace member.
 */
export const distroRoots = existsSync(`${import.meta.dirname}/../../.build/distro/npm`) ? [
	'.build/distro/npm',
	'.build/distro/npm/remote',
	'.build/distro/npm/remote/web',
] : [];

/**
 * Complete list of directories whose dependencies are installed by `pnpm install` at the root:
 * the workspace members, then the separate roots, each followed by its members, then the distro
 * roots.
 */
export const dirs = [
	...workspaceMembers,
	...separateRoots.flatMap(folder => [folder, ...separateRootMembers[folder] ?? []]),
	...distroRoots,
];
