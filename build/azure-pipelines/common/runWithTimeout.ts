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
const ON_TIMEOUT_DEADLINE_MS = Number(process.env.RUN_WITH_TIMEOUT_CLEANUP_MS) || 60_000;

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

/** Runs a shell command, killing its process tree if it runs longer than the deadline. */
function runCleanup(command: string, deadlineMs: number): Promise<string | undefined> {
	return new Promise(resolve => {
		const child = spawn(command, { stdio: 'inherit', shell: true, detached: process.platform !== 'win32' });
		const timer = setTimeout(() => {
			if (child.pid !== undefined) {
				killTree(child.pid);
			}
			resolve(`no exit within ${deadlineMs / 1000} s`);
		}, deadlineMs);
		child.on('error', err => {
			clearTimeout(timer);
			resolve(err.message);
		});
		child.on('exit', code => {
			clearTimeout(timer);
			resolve(code === 0 ? undefined : `exit code ${code}`);
		});
	});
}

export function runWithTimeout(options: Options, onTimeoutDeadlineMs = ON_TIMEOUT_DEADLINE_MS): Promise<number> {
	return new Promise(resolve => {
		const child = spawn(options.command, options.args, {
			stdio: 'inherit',
			detached: process.platform !== 'win32',
		});
		// The child runs in its own process group on POSIX, so a signal that cancels this
		// script (for example a cancelled pipeline step) would not reach it. Stop the child's
		// process tree first, then exit the way the signal would have.
		const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
		const onSignal = (signal: NodeJS.Signals) => {
			if (child.pid !== undefined) {
				killTree(child.pid);
			}
			process.exit(128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1));
		};
		for (const signal of signals) {
			process.on(signal, onSignal);
		}
		const removeSignalHandlers = () => {
			for (const signal of signals) {
				process.off(signal, onSignal);
			}
		};
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
			removeSignalHandlers();
			console.error(err);
			resolve(1);
		});
		child.on('exit', async (code, signal) => {
			clearTimeout(timer);
			removeSignalHandlers();
			if (timedOut) {
				if (options.onTimeout) {
					const failure = await runCleanup(options.onTimeout, onTimeoutDeadlineMs);
					if (failure) {
						console.log(`##vso[task.logissue type=warning]'${options.onTimeout}' did not complete: ${failure}`);
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
