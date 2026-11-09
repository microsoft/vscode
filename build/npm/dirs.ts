/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';

/**
 * Members of the main pnpm workspace (`pnpm-workspace.yaml` at the repository root), in a fixed
 * order. `''` is the repository root. They share the root `pnpm-lock.yaml` and are installed by a
 * single `pnpm install` at the root.
 */
export const workspaceMembers = [
	'',
	'.eslint-plugin-local',
	'.vscode/extensions/vscode-selfhost-import-aid',
	'.vscode/extensions/vscode-selfhost-test-provider',
	'.vscode/extensions/vscode-pr-pinger',
	'scripts',
	'src/vs/sessions/test/e2e',
	'test/automation',
	'test/componentFixtures/playwright',
	'test/integration/browser',
	'test/monaco',
	'test/scenario',
	'test/smoke',
	'test/unit',
];

/**
 * Separate pnpm install roots (each with its own `pnpm-workspace.yaml` and `pnpm-lock.yaml`) that
 * the root postinstall installs after the workspace, in this order. `build` and `remote` build
 * native modules for a different runtime than the workspace (see the `nativeBuild` field of their
 * `package.json`, and their `.pnpmfile.mjs`). `extensions` holds the built-in extensions, which the
 * product build bundles, so the layout of their `node_modules` doesn't ship; its `.pnpmfile.mjs`
 * builds native modules for Electron like the workspace. `extensions/copilot` keeps its own
 * `node_modules` because its build scripts and runtime code use paths inside it; it builds native
 * modules for Electron like the workspace.
 */
export const separateRoots = [
	'build',
	'remote',
	'extensions',
	'extensions/copilot',
];

/**
 * Members of the workspaces of separate roots, by root: they share the root's `pnpm-lock.yaml` and
 * are installed by its `pnpm install`. pnpm uses the nearest `pnpm-workspace.yaml` above a folder,
 * so folders inside a separate root can't be members of the main workspace. `chat-lib` is extracted
 * from the Copilot extension's sources and published as an npm package; its dependencies are
 * Copilot's (see `extract-chat-lib`). `remote/web` holds the dependencies of the web build: the
 * hoisted layout installs them in `remote/node_modules`, and the web build packages them flat (see
 * `getFlatProductionDependencies`).
 */
export const separateRootMembers: Readonly<Record<string, readonly string[]>> = {
	'build': ['build/rspack', 'build/vite'],
	'remote': ['remote/web'],
	'extensions': [
		'extensions/configuration-editing',
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
		'extensions/tunnel-forwarding',
		'extensions/terminal-suggest',
		'extensions/typescript-language-features',
		'extensions/vscode-api-tests',
		'extensions/vscode-colorize-tests',
		'extensions/vscode-colorize-perf-tests',
		'extensions/vscode-test-resolver',
	],
	'extensions/copilot': ['extensions/copilot/chat-lib'],
};

/**
 * Separate pnpm install roots that are installed on demand, not by the root postinstall, by the
 * scripts or CI jobs that use them.
 */
export const standaloneRoots = [
	'test/sanity',
];

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
