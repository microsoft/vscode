/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..');
// The root of the vscode repository, whose pnpm workspace Copilot and chat-lib are members of
const WORKSPACE_ROOT = path.join(REPO_ROOT, '..', '..');

/**
 * Removes the packages from the `node_modules` folders between Copilot and the root of the pnpm
 * workspace (`extensions/node_modules` and the root `node_modules`), so that chat-lib, which the
 * pipelines build, test and publish from `chat-lib`, only resolves its own dependencies and
 * Copilot's. Every pnpm install, also a filtered one, installs the dependencies of the root
 * project, which could hide a dependency that chat-lib's `package.json` is missing. Run it after
 * the last install: the other projects of the workspace lose their dependencies.
 *
 * The packages are links into `node_modules/.pnpm`, which holds the packages of every project of
 * the workspace. `fs.rmSync` removes the links, not what they point to, and the dot folders stay.
 */
function main(): void {
	for (const folder of [path.join(WORKSPACE_ROOT, 'extensions'), WORKSPACE_ROOT]) {
		const nodeModules = path.join(folder, 'node_modules');
		if (!fs.existsSync(nodeModules)) {
			continue;
		}
		for (const entry of fs.readdirSync(nodeModules)) {
			if (!entry.startsWith('.')) {
				fs.rmSync(path.join(nodeModules, entry), { recursive: true, force: true });
			}
		}
	}
}

main();
