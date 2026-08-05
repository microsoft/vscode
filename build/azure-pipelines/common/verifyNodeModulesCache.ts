/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

/**
 * Verifies that a `node_modules` tree restored from the pipeline cache is
 * complete enough to build and test with.
 *
 * The cache is a plain tarball of every file under `node_modules`. When it is
 * restored, `npm ci` is skipped entirely, so a truncated or partially written
 * archive is never repaired: the build proceeds against an incomplete
 * dependency tree. That failure mode is silent and extremely hard to diagnose
 * downstream — a missing tree-sitter grammar, for example, surfaces only as
 * dozens of unrelated-looking unit-test assertion mismatches.
 *
 * When verification fails this clears the pipeline's cache-hit variable (passed
 * as the first argument) so the subsequent steps treat the run as a cache miss
 * and reinstall from scratch.
 */

const ROOT = path.join(import.meta.dirname, '../../../');

const cacheHitVariable = process.argv[2] ?? 'NODE_MODULES_RESTORED';

/**
 * Files that must exist and be non-empty. These are load-bearing assets that
 * are consumed at runtime rather than imported as JS, so a missing one is not
 * caught by module resolution.
 */
const REQUIRED_FILES = [
	'node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm',
	'node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-bash.wasm',
	'node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-powershell.wasm',
];

function verify(): string[] {
	const problems: string[] = [];

	for (const relativePath of REQUIRED_FILES) {
		const fullPath = path.join(ROOT, relativePath);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch (err) {
			problems.push(`missing: ${relativePath}`);
			continue;
		}
		if (!stat.isFile() || stat.size === 0) {
			problems.push(`empty or not a file: ${relativePath}`);
		}
	}

	return problems;
}

function main(): void {
	const problems = verify();

	if (problems.length === 0) {
		console.log(`node_modules cache verified (${REQUIRED_FILES.length} required files present)`);
		return;
	}

	for (const problem of problems) {
		console.error(`  ${problem}`);
	}
	console.error('node_modules cache is incomplete, falling back to a clean install');
	// Signal a cache miss so the install steps, which are gated on the
	// cache-hit variable, run and repair the tree.
	console.log(`##vso[task.setvariable variable=${cacheHitVariable}]false`);
}

main();
