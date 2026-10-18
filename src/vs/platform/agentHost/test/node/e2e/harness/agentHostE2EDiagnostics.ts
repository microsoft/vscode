/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, cpSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { getErrorCode } from '../../../../../../base/common/errors.js';
import { basename, join } from '../../../../../../base/common/path.js';

/** Retains normalized snapshot comparisons in uploaded logs without changing the assertion's outcome. */
export async function withAgentHostE2ESnapshotDiagnostics(
	assertion: () => Promise<void>,
	destination = join(process.cwd(), '.build', 'logs', 'integration-tests', `agent-host-e2e-snapshots-${process.pid}`),
): Promise<void> {
	try {
		await assertion();
	} catch (error) {
		if (error instanceof Error) {
			const snapshot: Error & { snapshotPath?: unknown; expected?: unknown; actual?: unknown } = error;
			if (typeof snapshot.snapshotPath === 'string' && typeof snapshot.expected === 'string' && typeof snapshot.actual === 'string') {
				try {
					mkdirSync(destination, { recursive: true });
					const name = basename(snapshot.snapshotPath);
					writeFileSync(join(destination, `${name}.expected`), snapshot.expected);
					writeFileSync(join(destination, `${name}.actual`), snapshot.actual);
				} catch (preservationError) {
					throw new AggregateError([error, preservationError], 'Failed to preserve Agent Host E2E snapshot comparison');
				}
			}
		}
		throw error;
	}
}

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
