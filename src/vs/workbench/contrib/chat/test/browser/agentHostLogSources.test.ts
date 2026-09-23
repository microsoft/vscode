/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IStat } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { TestPathService } from '../../../../test/browser/workbenchTestServices.js';
import { AgentHostLogSourceKind, enumerateAgentHostLogSources, findRelevantCopilotLogs, IAgentHostLogSourceServices, MAX_COPILOT_LOG_SCAN_FILE_SIZE } from '../../browser/chatDebug/agentHostLogSources.js';
import { COPILOT_CLI_LOCAL_AH_SCHEME } from '../../browser/copilotCliEventsUri.js';

class TestLogFileSystemProvider extends InMemoryFileSystemProvider {
	readonly oversizedResources = new Set<string>();

	override async stat(resource: URI): Promise<IStat> {
		const stat = await super.stat(resource);
		return this.oversizedResources.has(resource.toString())
			? { ...stat, size: MAX_COPILOT_LOG_SCAN_FILE_SIZE + 1 }
			: stat;
	}
}

suite('AgentHostLogSources', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const logsDir = URI.from({ scheme: Schemas.inMemory, path: '/logs' });
	let fileService: FileService;
	let fileSystemProvider: TestLogFileSystemProvider;

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		fileSystemProvider = disposables.add(new TestLogFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, fileSystemProvider));
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

	test('applies the scan size limit within the 10 most recent process logs', async () => {
		await writeLog('oldest.log', 'session-1');
		for (let index = 0; index < 9; index++) {
			await writeLog(`recent-${index}.log`, 'another session');
		}
		await writeLog('oversized.log', 'another session');
		fileSystemProvider.oversizedResources.add(URI.joinPath(logsDir, 'oversized.log').toString());

		const logs = await findRelevantCopilotLogs(logsDir, 'session-1', fileService, new NullLogService());

		assert.deepStrictEqual(logs.map(log => log.path), ['copilot-logs/oversized.log']);
	});

	test('enumerates matching historical AHP logs when logging is disabled', async () => {
		const logId = 'local-client';
		const matchingLoggers = [
			disposables.add(new AhpJsonlLogger({ logsHome: logsDir, logId, connectionId: 'connection-1', transport: 'ipc' }, fileService, new NullLogService())),
			disposables.add(new AhpJsonlLogger({ logsHome: logsDir, logId, connectionId: 'connection-2', transport: 'ipc' }, fileService, new NullLogService())),
		];
		const unrelatedLogger = disposables.add(new AhpJsonlLogger({ logsHome: logsDir, logId: 'another-client', connectionId: 'connection-3', transport: 'ipc' }, fileService, new NullLogService()));
		for (const logger of [...matchingLoggers, unrelatedLogger]) {
			logger.log({ jsonrpc: '2.0', method: 'test' }, 'c2s');
			await logger.flush();
		}

		const services = new class extends mock<IAgentHostLogSourceServices>() {
			override readonly pathService = new TestPathService(URI.from({ scheme: Schemas.inMemory, path: '/home' }));
			override readonly agentHostService = new class extends mock<IAgentHostService>() {
				override readonly clientId = logId;
			}();
			override readonly remoteAgentHostService = new class extends mock<IRemoteAgentHostService>() {
				override readonly connections = [];
			}();
			override readonly outputService = new class extends mock<IOutputService>() {
				override getChannelDescriptor(_id: string): undefined {
					return undefined;
				}
			}();
			override readonly fileService = fileService;
			override readonly configurationService = new TestConfigurationService({ [AgentHostAhpJsonlLoggingSettingId]: false });
			override readonly environmentService = new class extends mock<IEnvironmentService>() {
				override logsHome = logsDir;
			}();
		}();

		const sources = await enumerateAgentHostLogSources(
			services,
			URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/session-1' }),
		);

		assert.deepStrictEqual(
			sources
				.filter(source => source.kind === AgentHostLogSourceKind.WireLog)
				.map(source => source.resource?.toString())
				.sort(),
			matchingLoggers.map(logger => logger.resource.toString()).sort(),
		);
	});
});
