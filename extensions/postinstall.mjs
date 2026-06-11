/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules', 'typescript');

// Under pnpm, `extensions/node_modules/typescript` is a symlink into the shared
// content-addressed store, which is the very same physical copy the repo root
// (and every other workspace package) resolves `typescript` to. Trimming files
// out of it would corrupt that shared copy and break the root build. With npm
// each directory had its own private physical copy that was safe to trim. So we
// only trim when the typescript directory is a real, non-symlinked directory.
function isPrivatePhysicalCopy() {
	try {
		return !fs.lstatSync(root).isSymbolicLink();
	} catch {
		return false;
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

if (isPrivatePhysicalCopy()) {
	processRoot();
	processLib();
} else {
	console.log(`Skipping typescript trim: '${root}' is a shared (symlinked) copy that must not be mutated.`);
}