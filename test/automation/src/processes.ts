/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as treekill from 'tree-kill';
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
