/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, cpSync, mkdirSync, statSync } from 'fs';
import { getErrorCode } from '../../../../../../base/common/errors.js';
import { join } from '../../../../../../base/common/path.js';

/** Retains all host incarnations and provider logs before failed-test cleanup removes the isolated home. */
export function preserveAgentHostE2ELogs(userDataDir: string, homeDir: string, destination: string, label: string): void {
	mkdirSync(destination, { recursive: true });
	appendFileSync(join(destination, 'failures.log'), `${label}\n`);
	for (const [source, name] of [
		[join(userDataDir, 'logs'), 'host'],
		[join(homeDir, '.copilot', 'logs'), 'copilot'],
	]) {
		try {
			statSync(source);
		} catch (error) {
			if (getErrorCode(error) === 'ENOENT') {
				continue;
			}
			throw error;
		}
		cpSync(source, join(destination, name), { recursive: true });
	}
}
