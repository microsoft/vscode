/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Stops the Code OSS instance of a launch and removes its run directory; reused run directories
// are kept unless --remove is passed. Prints one JSON line to stdout. Run it with Node.js.
// `--gc <root>` instead removes abandoned run directories below a run root, which
// the launcher runs in the background.

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { collectGarbage, isInRunRoot, isRunDirInUse, readState, removeRunDir, stopCodeProcesses } from '../lib/runDirs.ts';
import { writeStderr, writeStdout } from '../lib/output.ts';

const STOP_TIMEOUT_MS = 15_000;

interface ICleanupOptions {
	readonly kind: 'cleanup';
	readonly runDir: string;
	readonly remove: boolean;
}

interface IGarbageCollectionOptions {
	readonly kind: 'gc';
	readonly root: string;
}

class UsageError extends Error { }

function parseArguments(args: readonly string[]): ICleanupOptions | IGarbageCollectionOptions {
	let runDir: string | undefined;
	let remove = false;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		const value = () => {
			if (index + 1 >= args.length) {
				throw new UsageError(`Missing value for ${argument}.`);
			}
			return args[++index];
		};
		switch (argument) {
			case '--gc': return { kind: 'gc', root: value() };
			case '--run-dir': runDir = value(); break;
			case '--remove': remove = true; break;
			default:
				if (argument.startsWith('--') || runDir !== undefined) {
					throw new UsageError(`Unknown arg: ${argument}`);
				}
				runDir = argument;
		}
	}
	if (!runDir) {
		throw new UsageError('Usage: cleanup.ts <run-dir> [--remove]');
	}
	return { kind: 'cleanup', runDir: path.resolve(runDir), remove };
}

async function cleanup(options: ICleanupOptions): Promise<void> {
	const { runDir } = options;
	if (!existsSync(runDir)) {
		throw new UsageError(`Run directory does not exist: ${runDir}`);
	}
	if (!isInRunRoot(runDir)) {
		throw new UsageError(`Refusing to clean a directory outside the launch run roots: ${runDir}`);
	}
	const state = await readState(runDir);
	if (!state) {
		throw new UsageError(`Refusing to clean a directory without launcher state: ${runDir}`);
	}
	const stopped = stopCodeProcesses(runDir, state?.codePid);

	// Stopped processes release their files a moment later
	const keep = path.basename(runDir).startsWith('reuse-') && !options.remove;
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	for (; ;) {
		try {
			if (!await isRunDirInUse(runDir)) {
				if (!keep) {
					await removeRunDir(runDir);
				}
				break;
			}
		} catch {
			// Not yet removable
		}
		if (Date.now() > deadline) {
			throw new Error(`Code OSS processes still use the run directory: ${runDir}`);
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	writeStdout(JSON.stringify({ runDir, stopped, removed: !keep }) + '\n');
}

try {
	// The PowerShell wrapper passes arguments as JSON, which survives Windows PowerShell's native argument quoting
	const json = process.env.CODE_OSS_DEV_SCRIPT_ARGS;
	delete process.env.CODE_OSS_DEV_SCRIPT_ARGS;
	const options = parseArguments(json ? JSON.parse(json) : process.argv.slice(2));
	if (options.kind === 'gc') {
		if (!isInRunRoot(path.join(path.resolve(options.root), 'run'))) {
			throw new UsageError(`Refusing to collect outside the launch run roots: ${options.root}`);
		}
		await collectGarbage(path.resolve(options.root));
	} else {
		await cleanup(options);
	}
} catch (error) {
	writeStderr(`[cleanup] ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = error instanceof UsageError ? 2 : 1;
}
