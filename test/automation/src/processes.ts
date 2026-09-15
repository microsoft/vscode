/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { promisify } from 'util';
import treekill from 'tree-kill';
import { Logger } from './logger';

export async function teardown(p: ChildProcess, logger: Logger, retryCount = 3): Promise<void> {
	const pid = p.pid;
	if (typeof pid !== 'number') {
		return;
	}

	let retries = 0;
	while (retries < retryCount) {
		retries++;

		try {
			return await promisify(treekill)(pid);
		} catch (error) {
			try {
				process.kill(pid, 0); // throws an exception if the process doesn't exist anymore
				logger.log(`Error tearing down process (pid: ${pid}, attempt: ${retries}): ${error}`);
			} catch (error) {
				return; // Expected when process is gone
			}
		}
	}

	logger.log(`Gave up tearing down process client after ${retries} attempts...`);
}

export async function teardownAndWait(p: ChildProcess, logger: Logger, timeoutMs: number): Promise<void> {
	const pid = p.pid;
	if (typeof pid !== 'number' || !isProcessAlive(pid)) {
		return;
	}

	try {
		await promisify(treekill)(pid);
	} catch (error) {
		if (!isProcessAlive(pid)) {
			return;
		}
		throw error;
	}
	let handle: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			waitForProcessExit(p, pid),
			new Promise<never>((_, reject) => {
				handle = setTimeout(() => reject(new Error(`Process tree ${pid} did not terminate within ${timeoutMs}ms.`)), timeoutMs);
			})
		]);
	} finally {
		if (handle) {
			clearTimeout(handle);
		}
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function waitForProcessExit(p: ChildProcess, pid: number): Promise<void> {
	if (!isProcessAlive(pid)) {
		return Promise.resolve();
	}

	return new Promise<void>(resolve => p.once('exit', () => resolve()));
}
