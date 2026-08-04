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

function findNodeModulesFiles(location: string, inNodeModules: boolean, result: string[]) {
	const entries = fs.readdirSync(path.join(ROOT, location));
	for (const entry of entries) {
		const entryPath = `${location}/${entry}`;

		if (/(^\/out)|(^\/src$)|(^\/.git$)|(^\/.build$)/.test(entryPath)) {
			continue;
		}

		let stat: fs.Stats;
		try {
			stat = fs.statSync(path.join(ROOT, entryPath));
		} catch (err) {
			// A dangling symlink cannot be stat'ed and is safe to skip. Any
			// other failure would silently drop files from the cache manifest,
			// producing an incomplete node_modules archive that later fails in
			// confusing ways, so surface it instead.
			if (isDanglingSymbolicLink(entryPath)) {
				continue;
			}
			throw new Error(`Failed to stat '${entryPath}' while listing node_modules`, { cause: err });
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

function isDanglingSymbolicLink(entryPath: string): boolean {
	try {
		return fs.lstatSync(path.join(ROOT, entryPath)).isSymbolicLink();
	} catch {
		return false;
	}
}

const result: string[] = [];
findNodeModulesFiles('', false, result);
fs.writeFileSync(process.argv[2], result.join('\n') + '\n');
