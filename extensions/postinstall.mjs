/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const extensionsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(extensionsDir, 'node_modules', 'typescript');

/**
 * Only the TypeScript copy of extensions/ may be trimmed. With pnpm's hoisted layout it is in
 * extensions/node_modules only while the repository root uses another TypeScript; with the same
 * version, pnpm installs it once in the root node_modules, which the build needs complete.
 */
function assertOwnCopy() {
	const stat = fs.lstatSync(root, { throwIfNoEntry: false });
	const isOwnCopy = stat?.isDirectory() && fs.realpathSync(root) === path.join(fs.realpathSync(extensionsDir), 'node_modules', 'typescript');
	if (!isOwnCopy) {
		throw new Error(`${root} is not a folder of its own (pnpm installed the TypeScript of extensions/package.json elsewhere, for example once in the root node_modules because the root uses the same version). Not trimming TypeScript: the built-in extensions need their own copy, so keep the versions apart.`);
	}
}

function processRoot() {
	const toKeep = new Set([
		'lib',
		'package.json',
	]);
	for (const name of fs.readdirSync(root)) {
		if (!toKeep.has(name)) {
			const filePath = path.join(root, name);
			console.log(`Removed ${filePath}`);
			fs.rmSync(filePath, { recursive: true });
		}
	}
}

function processLib() {
	const toDelete = new Set([
		'tsc.js',
		'_tsc.js',
		'tsc6.js',
		'_tsc6.js',

		'typescriptServices.js',
		'_typescriptServices.js',
	]);

	const libRoot = path.join(root, 'lib');

	for (const name of fs.readdirSync(libRoot)) {
		if (name === 'lib.d.ts' || name.match(/^lib\..*\.d\.ts$/) || name === 'protocol.d.ts') {
			continue;
		}
		if (name === 'typescript.js' || name === 'typescript.d.ts') {
			// used by html and extension editing
			continue;
		}

		if (toDelete.has(name) || name.match(/\.d\.ts$/)) {
			try {
				fs.unlinkSync(path.join(libRoot, name));
				console.log(`removed '${path.join(libRoot, name)}'`);
			} catch (e) {
				console.warn(e);
			}
		}
	}
}

assertOwnCopy();
processRoot();
processLib();
