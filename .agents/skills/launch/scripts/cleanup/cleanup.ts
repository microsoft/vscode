#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Stops the Code OSS instance of a launch and removes its run directory; reused run directories
// are kept unless --remove is passed. Prints one JSON line to stdout. Run it through cleanup.ps1
// or cleanup.sh. `--gc <root>` instead removes abandoned run directories below a run root, which
// the launcher runs in the background.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { collectGarbage, findCodeProcesses, isCodeProcessOf, isInRunRoot, isRunDirInUse, readState, removeRunDir } from '../lib/runDirs.ts';
import { writeStderr, writeStdout } from '../lib/output.ts';

const STOP_TIMEOUT_MS = 15_000;

interface ICleanupOptions {
	readonly kind: 'cleanup';
	readonly runDir: string;
	readonly playwrightSession: string | undefined;
	readonly remove: boolean;
}

interface IGarbageCollectionOptions {
	readonly kind: 'gc';
	readonly root: string;
}

class UsageError extends Error { }

function parseArguments(args: readonly string[]): ICleanupOptions | IGarbageCollectionOptions {
	let runDir: string | undefined;
	let playwrightSession: string | undefined;
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
			case '--playwright-session': playwrightSession = value(); break;
			case '--remove': remove = true; break;
			default:
				if (argument.startsWith('--') || runDir !== undefined) {
					throw new UsageError(`Unknown arg: ${argument}`);
				}
				runDir = argument;
		}
	}
	if (!runDir) {
		throw new UsageError('Usage: cleanup.ts <run-dir> [--playwright-session <name>] [--remove]');
	}
	return { kind: 'cleanup', runDir: path.resolve(runDir), playwrightSession, remove };
}

async function cleanup(options: ICleanupOptions): Promise<void> {
	const { runDir } = options;
	if (!existsSync(runDir)) {
		throw new UsageError(`Run directory does not exist: ${runDir}`);
	}
	if (!isInRunRoot(runDir)) {
		throw new UsageError(`Refusing to clean a directory outside the launch run roots: ${runDir}`);
	}
	if (options.playwrightSession) {
		closePlaywrightSession(options.playwrightSession);
	}

	const state = await readState(runDir);
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

/**
 * Stops the processes of a launch in `runDir`. They are found by their exact `--user-data-dir`
 * argument, never by a recorded PID alone, which an unrelated process may have reused since.
 */
function stopCodeProcesses(runDir: string, codePid: number | undefined): boolean {
	if (process.platform === 'win32') {
		// Also finds the processes of run directories without a recorded PID, such as those of
		// earlier launcher versions
		const pids = findCodeProcesses(runDir);
		for (const pid of pids) {
			spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
		}
		return pids.length > 0;
	}
	if (codePid === undefined || !isCodeProcessOf(runDir, codePid)) {
		return false;
	}
	try {
		// The launcher starts Code detached, in its own process group
		process.kill(-codePid, 'SIGTERM');
		return true;
	} catch {
		try {
			process.kill(codePid, 'SIGTERM');
			return true;
		} catch {
			return false;
		}
	}
}

function closePlaywrightSession(session: string): void {
	if (!/^[\w.-]+$/.test(session)) {
		throw new UsageError(`Invalid Playwright session name: ${session}`);
	}
	// npx is a batch file on Windows, which requires a shell; the session name is validated above
	const result = spawnSync('npx', ['@playwright/cli', `-s=${session}`, 'close'], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
	if (result.status !== 0) {
		writeStderr(`[cleanup] WARNING: failed to close Playwright session ${session}; continuing cleanup.\n`);
	}
}

try {
	// The PowerShell wrapper passes arguments as JSON, which survives Windows PowerShell's native argument quoting
	const json = process.env.CODE_OSS_DEV_SCRIPT_ARGS;
	delete process.env.CODE_OSS_DEV_SCRIPT_ARGS;
	const options = parseArguments(json ? JSON.parse(json) : process.argv.slice(2));
	if (options.kind === 'gc') {
		await collectGarbage(path.resolve(options.root));
	} else {
		await cleanup(options);
	}
} catch (error) {
	writeStderr(`[cleanup] ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = error instanceof UsageError ? 2 : 1;
}
