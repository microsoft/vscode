/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { createRequire } from 'module';
import { availableParallelism } from 'os';
import { dirname, join } from 'path';
import { gigabytes, runWithinMemory, type IMemoryBoundJob } from '../lib/memory.ts';

//
// Type checks the sources of every target environment against the lib and type
// definitions that environment actually provides. A file that reaches out to an
// API of another layer fails to compile here.
//
// It also runs the type based layer checks of build/checker/layersChecker.ts, so
// that they share the memory budget of the type checks.
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
const MEMORY_PER_CHECK = gigabytes(4);

/** Memory to budget for layersChecker.ts and its TypeScript server, which peak at around 4.6GB. */
const MEMORY_FOR_LAYERS_CHECKER = gigabytes(5);

/**
 * Absolute path to the TypeScript 7 (native) compiler entrypoint. It is installed
 * under the `@typescript/native` alias, so resolving it explicitly and invoking it
 * via `node` guarantees we run TS7 rather than the `typescript` (<= 6.x) install.
 */
const tscPath = join(dirname(createRequire(import.meta.url).resolve('@typescript/native/package.json')), 'bin', 'tsc');

/**
 * Runs a Node.js script, and resolves to its output when it fails, or to an empty string.
 */
function runScript(args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

		let output = '';
		child.stdout.on('data', data => output += data.toString());
		child.stderr.on('data', data => output += data.toString());

		child.on('error', reject);
		// `close` rather than `exit`, so the captured output is complete before it is inspected.
		child.on('close', code => resolve(code === 0 ? '' : output.trim() || `${args[0]} exited with code ${code ?? 'unknown'}.`));
	});
}

// The checks overlap heavily but are independent, so they run in parallel. Each is
// memory hungry enough that running all of them at once can push a smaller machine
// into swapping, which costs far more than running them one after another, so the
// available memory decides how many run at a time.
const jobs: IMemoryBoundJob<string>[] = [
	{ memory: MEMORY_FOR_LAYERS_CHECKER, run: () => runScript([join(import.meta.dirname, 'layersChecker.ts')]) },
	...PROJECTS.map(project => ({ memory: MEMORY_PER_CHECK, run: () => runScript([tscPath, '--project', join(import.meta.dirname, `tsconfig.${project}.json`), '--pretty', 'false']) })),
];

// Report the output in a stable order once all checks are done.
const results = await runWithinMemory('valid-layers-check', jobs, { maxConcurrency: availableParallelism() });

for (const result of results) {
	if (result) {
		console.log(result);
	}
}

process.exitCode = results.some(result => result) ? 1 : 0;
