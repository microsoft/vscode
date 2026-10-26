/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Runs a command and fails it, with a non-zero exit code, when it runs longer
// than a deadline.
//
//   node runWithTimeout.ts <seconds> [--on-timeout <command>] -- <command> [args...]
//
// A step's `timeoutInMinutes` cancels the step, and a cancelled step is never
// retried by `retryCountOnTaskFailure`. Failing from inside the script lets the
// step's retry run instead. `--on-timeout` runs a shell command after the
// command's process tree is killed, for example to reset a stuck daemon before
// the retry. It gets at most a minute, and its result doesn't change the exit
// code.

import { spawn, spawnSync } from 'node:child_process';

export const TIMEOUT_EXIT_CODE = 124;

/** How long the `--on-timeout` command may run, since it may talk to the stuck process. */
const ON_TIMEOUT_DEADLINE_MS = 60_000;

interface Options {
	readonly seconds: number;
	readonly onTimeout: string | undefined;
	readonly command: string;
	readonly args: string[];
}

export function parseArgs(argv: readonly string[]): Options {
	const separator = argv.indexOf('--');
	if (separator === -1 || separator === argv.length - 1) {
		throw new Error('usage: runWithTimeout.ts <seconds> [--on-timeout <command>] -- <command> [args...]');
	}
	const head = argv.slice(0, separator);
	const seconds = Number(head[0]);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		throw new Error(`invalid timeout '${head[0]}'`);
	}
	let onTimeout: string | undefined;
	for (let i = 1; i < head.length; i++) {
		if (head[i] === '--on-timeout' && i + 1 < head.length) {
			onTimeout = head[++i];
		} else {
			throw new Error(`unexpected argument '${head[i]}'`);
		}
	}
	const [command, ...args] = argv.slice(separator + 1);
	return { seconds, onTimeout, command, args };
}

function killTree(pid: number): void {
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
	} else {
		try {
			// The child leads its own process group (detached), so this reaches its descendants.
			process.kill(-pid, 'SIGKILL');
		} catch {
			// already exited
		}
	}
}

export function runWithTimeout(options: Options): Promise<number> {
	return new Promise(resolve => {
		const child = spawn(options.command, options.args, {
			stdio: 'inherit',
			detached: process.platform !== 'win32',
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			console.log(`##vso[task.logissue type=error]'${options.command}' did not finish within ${options.seconds} s and was stopped.`);
			if (child.pid !== undefined) {
				killTree(child.pid);
			}
		}, options.seconds * 1000);
		child.on('error', err => {
			clearTimeout(timer);
			console.error(err);
			resolve(1);
		});
		child.on('exit', (code, signal) => {
			clearTimeout(timer);
			if (timedOut) {
				if (options.onTimeout) {
					const cleanup = spawnSync(options.onTimeout, { stdio: 'inherit', shell: true, timeout: ON_TIMEOUT_DEADLINE_MS, killSignal: 'SIGKILL' });
					if (cleanup.error || cleanup.status !== 0) {
						console.log(`##vso[task.logissue type=warning]'${options.onTimeout}' did not complete: ${cleanup.error?.message ?? `exit code ${cleanup.status}`}`);
					}
				}
				resolve(TIMEOUT_EXIT_CODE);
			} else {
				resolve(code ?? (signal ? 1 : 0));
			}
		});
	});
}

if (import.meta.main) {
	runWithTimeout(parseArgs(process.argv.slice(2))).then(code => process.exit(code), err => {
		console.error(err);
		process.exit(1);
	});
}
