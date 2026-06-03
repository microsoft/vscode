/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const extensionsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(extensionsDir, 'node_modules', 'typescript');

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

/**
 * Fail if any consumer extension declares a different version range for a
 * shared dep than `extensions/package.json`. If they diverge, npm will install
 * a private copy under the consumer and esbuild's externalization will
 * silently load the wrong version at runtime.
 */
function validateSharedDepVersions() {
	const sharedPkg = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'package.json'), 'utf8'));
	const sharedDeps = sharedPkg.dependencies ?? {};

	const problems = [];
	for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === 'node_modules') {
			continue;
		}
		const consumerPkgPath = path.join(extensionsDir, entry.name, 'package.json');
		if (!fs.existsSync(consumerPkgPath)) {
			continue;
		}
		const consumerPkg = JSON.parse(fs.readFileSync(consumerPkgPath, 'utf8'));
		const consumerDeps = consumerPkg.dependencies ?? {};
		for (const [name, range] of Object.entries(consumerDeps)) {
			const sharedRange = sharedDeps[name];
			if (sharedRange && range !== sharedRange) {
				problems.push({ extension: entry.name, name, consumerRange: range, sharedRange });
			}
		}
	}

	if (problems.length > 0) {
		console.error('Shared dependency version drift detected (see extensions/CONTRIBUTING.md):');
		for (const p of problems) {
			console.error(`  - extensions/${p.extension}: "${p.name}": "${p.consumerRange}" — shared is "${p.sharedRange}"`);
		}
		process.exit(1);
	}
}

processRoot();
processLib();
validateSharedDepVersions();
