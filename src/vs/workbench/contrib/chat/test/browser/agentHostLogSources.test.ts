/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { findRelevantCopilotLogs } from '../../browser/chatDebug/agentHostLogSources.js';

suite('AgentHostLogSources', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const logsDir = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
	let fileService: FileService;

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(logsDir);
	});

	async function writeLog(name: string, contents: string): Promise<void> {
		await fileService.writeFile(URI.joinPath(logsDir, name), VSBuffer.fromString(contents));
		await timeout(1);
	}

	test('returns session-matching logs instead of the latest unrelated log', async () => {
		await writeLog('matching.log', 'session-1');
		await writeLog('latest.log', 'another session');

		const logs = await findRelevantCopilotLogs(logsDir, 'session-1', fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/matching.log']);
	});

	test('falls back to the latest process log when no session id matches', async () => {
		await writeLog('older.log', 'another session');
		await writeLog('latest.log', 'also another session');

		const logs = await findRelevantCopilotLogs(logsDir, 'session-1', fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/latest.log']);
	});

	test('falls back to the latest process log without a session id', async () => {
		await writeLog('older.log', 'older');
		await writeLog('latest.log', 'latest');

		const logs = await findRelevantCopilotLogs(logsDir, undefined, fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/latest.log']);
	});

	test('searches process logs larger than 10 MiB', async () => {
		await writeLog('large.log', `${'x'.repeat(10 * 1024 * 1024)}session-1`);

		const logs = await findRelevantCopilotLogs(logsDir, 'session-1', fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/large.log']);
	});

	test('searches only the 10 most recent process logs', async () => {
		await writeLog('oldest.log', 'session-1');
		for (let index = 0; index < 10; index++) {
			await writeLog(`recent-${index}.log`, 'another session');
		}

		const logs = await findRelevantCopilotLogs(logsDir, 'session-1', fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/recent-9.log']);
	});
});
