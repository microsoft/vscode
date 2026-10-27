/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

if (process.argv.length !== 3) {
	console.error('Usage: node listNodeModules.ts OUTPUT_FILE');
	process.exit(-1);
}

const ROOT = path.join(import.meta.dirname, '../../../');
const REAL_ROOT = fs.realpathSync(ROOT);

/**
 * Whether a link target (a real path) is a folder inside a `node_modules` folder of the repository.
 */
function isInNodeModules(realPath: string): boolean {
	const relative = path.relative(REAL_ROOT, realPath);
	return !relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep).includes('node_modules');
}

function findNodeModulesFiles(location: string, inNodeModules: boolean, result: string[]) {
	const entries = fs.readdirSync(path.join(ROOT, location));
	for (const entry of entries) {
		const entryPath = `${location}/${entry}`;

		if (/(^\/out)|(^\/src$)|(^\/.git$)|(^\/.build$)/.test(entryPath)) {
			continue;
		}

		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(path.join(ROOT, entryPath));
			if (stat.isSymbolicLink()) {
				stat = fs.statSync(path.join(ROOT, entryPath));
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
					if (isInNodeModules(fs.realpathSync(path.join(ROOT, entryPath)))) {
						result.push(entryPath.substr(1));
					}
					continue;
				}
			}
		} catch (err) {
			continue;
		}

		if (stat.isDirectory()) {
			findNodeModulesFiles(entryPath, inNodeModules || (entry === 'node_modules'), result);
		} else {
			if (inNodeModules) {
				result.push(entryPath.substr(1));
			}
		}
	}
}

const result: string[] = [];
findNodeModulesFiles('', false, result);
fs.writeFileSync(process.argv[2], result.join('\n') + '\n');
