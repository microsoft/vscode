/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { dirs } from '../../npm/dirs.ts';

/**
 * Top-level folders of the repository that are not searched for `node_modules` folders. pnpm
 * projects inside them are listed through their folder in `build/npm/dirs.ts` instead.
 */
const skippedTopLevelFolders = /(^\/out)|(^\/src$)|(^\/.git$)|(^\/.build$)/;

/**
 * Whether a link target (a real path) is a folder inside a `node_modules` folder of the repository.
 */
function isInNodeModules(realRoot: string, realPath: string): boolean {
	const relative = path.relative(realRoot, realPath);
	return !relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep).includes('node_modules');
}

function findNodeModulesFiles(root: string, realRoot: string, location: string, inNodeModules: boolean, result: string[]): void {
	const entries = fs.readdirSync(path.join(root, location));
	for (const entry of entries) {
		const entryPath = `${location}/${entry}`;

		if (skippedTopLevelFolders.test(entryPath)) {
			continue;
		}

		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(path.join(root, entryPath));
			if (stat.isSymbolicLink()) {
				stat = fs.statSync(path.join(root, entryPath));
				if (inNodeModules && stat.isDirectory()) {
					// pnpm links the workspace members into the root node_modules (as junctions on
					// Windows, which lstat also reports as links). Following them would archive the
					// members' folders, and through `vscode-extensions` (the extensions folder) every
					// extension's node_modules, a second time. Nothing loads a member through them.
					// pnpm's hoisted linker also links a package to the same version in another
					// project's node_modules, for example extensions/npm/node_modules/which to
					// extensions/git/node_modules/which. Projects load their dependencies through
					// those links, so they are listed (the archive keeps them as links, and their
					// targets are listed too).
					if (isInNodeModules(realRoot, fs.realpathSync(path.join(root, entryPath)))) {
						result.push(entryPath.substr(1));
					}
					continue;
				}
			}
		} catch (err) {
			continue;
		}

		if (stat.isDirectory()) {
			findNodeModulesFiles(root, realRoot, entryPath, inNodeModules || (entry === 'node_modules'), result);
		} else {
			if (inNodeModules) {
				result.push(entryPath.substr(1));
			}
		}
	}
}

/**
 * Returns the files, and the links to folders, of every `node_modules` folder of the repository at
 * `root`, relative to it with `/` separators: the ones found by searching the repository outside
 * the skipped top-level folders, and those of the pnpm projects in `projectFolders` (folders
 * relative to `root`) inside a skipped folder, for example `src/vs/sessions/test/e2e`.
 */
export function listNodeModules(root: string, projectFolders: readonly string[] = dirs): string[] {
	const realRoot = fs.realpathSync(root);
	const result: string[] = [];
	findNodeModulesFiles(root, realRoot, '', false, result);
	for (const folder of projectFolders) {
		const nodeModules = `/${folder}/node_modules`;
		if (skippedTopLevelFolders.test(`/${folder.split('/')[0]}`) && fs.existsSync(path.join(root, nodeModules))) {
			findNodeModulesFiles(root, realRoot, nodeModules, true, result);
		}
	}
	return result;
}

if (import.meta.main) {
	if (process.argv.length !== 3) {
		console.error('Usage: node listNodeModules.ts OUTPUT_FILE');
		process.exit(-1);
	}
	const result = listNodeModules(path.join(import.meta.dirname, '../../../'));
	fs.writeFileSync(process.argv[2], result.join('\n') + '\n');
}
