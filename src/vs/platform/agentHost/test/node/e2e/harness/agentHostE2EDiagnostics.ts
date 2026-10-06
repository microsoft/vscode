/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
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

/** Retains compact phase timings from successful as well as failed hosts, including rotated logs. */
export function preserveAgentHostOperationLogs(userDataDir: string, destination: string): void {
	const logs = join(userDataDir, 'logs');
	let runs;
	try {
		runs = readdirSync(logs, { withFileTypes: true });
	} catch (error) {
		if (getErrorCode(error) === 'ENOENT') {
			return;
		}
		throw error;
	}
	for (const run of runs.filter(entry => entry.isDirectory())) {
		const directory = join(logs, run.name);
		for (const file of readdirSync(directory).filter(name => /^agenthost-server(?:\.\d+)?\.log$/.test(name))) {
			const phases = readFileSync(join(directory, file), 'utf8').split(/\r?\n/).filter(line => line.includes('[AgentHostOperation]'));
			if (phases.length > 0) {
				const retained = join(destination, 'operations', run.name);
				mkdirSync(retained, { recursive: true });
				writeFileSync(join(retained, file), phases.join('\n') + '\n');
			}
		}
	}
}
