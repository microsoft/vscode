/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { isNativeDir } from '../../npm/dirs.ts';

const part = process.argv[3];
if (process.argv.length < 3 || process.argv.length > 4 || (part !== undefined && part !== 'native' && part !== 'js')) {
	console.error('Usage: node listNodeModules.ts OUTPUT_FILE [native|js]');
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

/** The directory whose install created a node_modules file, e.g. `remote/web` for `remote/web/node_modules/x/y.js`. */
function installDir(file: string): string {
	const segments = file.split('/');
	const index = segments.indexOf('node_modules');
	if (index === -1) {
		throw new Error(`Not a node_modules file: ${file}`);
	}
	return segments.slice(0, index).join('/');
}

const result: string[] = [];
findNodeModulesFiles('', false, result);
const files = part === undefined ? result : result.filter(file => isNativeDir(installDir(file)) === (part === 'native'));
fs.writeFileSync(process.argv[2], files.join('\n') + '\n');
