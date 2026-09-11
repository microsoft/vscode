/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { createRequire } from 'module';
import { availableParallelism, freemem } from 'os';
import { dirname, join } from 'path';

//
// Type checks the sources of every target environment against the lib and type
// definitions that environment actually provides. A file that reaches out to an
// API of another layer fails to compile here.
//
// NOTE: The type based layer checks live in build/checker/layersChecker.ts.
//

const PROJECTS = [
	'browser',
	'worker',
	'node',
	'electron-browser',
	'electron-main',
	'electron-utility',
];

/**
 * Memory to budget for a single type check. The largest of the projects peaks at
 * around 3.5GB, so this leaves a little room on top of that.
 */
const MEMORY_PER_CHECK = 4 * 1024 * 1024 * 1024;

/** Share of the free memory to leave untouched so the machine does not start swapping. */
const MEMORY_HEADROOM = 0.25;

/**
 * Absolute path to the TypeScript 7 (native) compiler entrypoint. It is installed
 * under the `@typescript/native` alias, so resolving it explicitly and invoking it
 * via `node` guarantees we run TS7 rather than the `typescript` (<= 6.x) install.
 */
const tscPath = join(dirname(createRequire(import.meta.url).resolve('@typescript/native/package.json')), 'bin', 'tsc');

/**
 * The projects overlap heavily but are independent, so they can be checked in
 * parallel. Each check is memory hungry enough that running all of them at once
 * can push a smaller machine into swapping, which costs far more than checking
 * the projects one after another, so free memory is what decides how many run
 * at a time.
 */
function getConcurrency(): number {
	const affordableChecks = Math.floor(freemem() * (1 - MEMORY_HEADROOM) / MEMORY_PER_CHECK);

	return Math.max(1, Math.min(PROJECTS.length, availableParallelism(), affordableChecks));
}

function typeCheck(project: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn(process.execPath, [tscPath, '--project', join(import.meta.dirname, `tsconfig.${project}.json`), '--pretty', 'false'], { stdio: ['ignore', 'pipe', 'pipe'] });

		let output = '';
		child.stdout.on('data', data => output += data.toString());
		child.stderr.on('data', data => output += data.toString());

		child.on('error', reject);
		// `close` rather than `exit`, so the captured output is complete before it is inspected.
		child.on('close', code => resolve(code === 0 ? '' : output.trim() || `tsc exited with code ${code ?? 'unknown'}.`));
	});
}

async function typeCheckAll(projects: readonly string[], concurrency: number): Promise<string[]> {
	const results: string[] = [];
	let next = 0;

	async function runNext(): Promise<void> {
		while (next < projects.length) {
			const index = next++;
			results[index] = await typeCheck(projects[index]);
		}
	}

	await Promise.all(Array.from({ length: concurrency }, runNext));

	return results;
}

// Report the output in a stable order once all checks are done.
const results = await typeCheckAll(PROJECTS, getConcurrency());

for (const result of results) {
	if (result) {
		console.log(result);
	}
}

process.exitCode = results.some(result => result) ? 1 : 0;
