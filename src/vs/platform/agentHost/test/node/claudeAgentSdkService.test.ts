/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DeferredPromise } from '../../../../base/common/async.js';
import { FileAccess } from '../../../../base/common/network.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { ClaudeAgentSdkService, IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import { RecordingAgentSdkDownloader } from './testAgentSdkDownloader.js';

class TestClaudeSdkBindings extends mock<IClaudeSdkBindings>() {
	sessions: SDKSessionInfo[] = [];
	listCalls = 0;
	listResult: DeferredPromise<SDKSessionInfo[]> | undefined;
	readonly listStarted = new DeferredPromise<void>();

	override async listSessions(): Promise<SDKSessionInfo[]> {
		this.listCalls++;
		this.listStarted.complete();
		return this.listResult ? this.listResult.p : this.sessions;
	}

	override async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		return this.sessions.find(session => session.sessionId === sessionId);
	}
}

suite('ClaudeAgentSdkService metadata', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(bindings: IClaudeSdkBindings): ClaudeAgentSdkService {
		class TestClaudeAgentSdkService extends ClaudeAgentSdkService {
			protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
				return bindings;
			}
		}
		const services = new ServiceCollection(
			[ILogService, disposables.add(new NullLogService())],
			[IAgentSdkDownloader, new RecordingAgentSdkDownloader(false)],
		);
		return disposables.add(new InstantiationService(services)).createInstance(TestClaudeAgentSdkService);
	}

	test('detaches all metadata fields without changing their values', async () => {
		const bindings = new TestClaudeSdkBindings();
		const entry: SDKSessionInfo = {
			sessionId: 'session-1',
			summary: 'summary \uD83D\uDE80 \uD800',
			lastModified: 2000,
			fileSize: 1234,
			customTitle: undefined,
			firstPrompt: 'first prompt',
			gitBranch: 'feature/metadata',
			cwd: 'C:\\workspace',
			tag: 'tag',
			createdAt: 1000,
		};
		bindings.sessions = [entry];
		const service = createService(bindings);
		const listed = await service.listSessions();
		const found = await service.getSessionInfo(entry.sessionId);
		const missing = await service.getSessionInfo('missing');

		assert.deepStrictEqual({
			listed,
			found,
			missing,
			sharesArray: listed === bindings.sessions,
			sharesListedEntry: listed[0] === entry,
			sharesFoundEntry: found === entry,
		}, {
			listed: [entry],
			found: entry,
			missing: undefined,
			sharesArray: false,
			sharesListedEntry: false,
			sharesFoundEntry: false,
		});
	});

	test('coalesces concurrent scans but refreshes after completion', async () => {
		const bindings = new TestClaudeSdkBindings();
		bindings.listResult = new DeferredPromise<SDKSessionInfo[]>();
		const service = createService(bindings);
		const first = service.listSessions();
		const second = service.listSessions();
		await bindings.listStarted.p;
		const callsWhilePending = bindings.listCalls;
		const entry = { sessionId: 'session-1', summary: 'original', lastModified: 1 };
		bindings.listResult.complete([entry]);
		const concurrent = await Promise.all([first, second]);
		bindings.listResult = undefined;
		bindings.sessions = [{ ...entry, summary: 'updated' }];
		const refreshed = await service.listSessions();

		assert.deepStrictEqual({
			callsWhilePending,
			callsAfterRefresh: bindings.listCalls,
			concurrent,
			refreshed,
		}, {
			callsWhilePending: 1,
			callsAfterRefresh: 2,
			concurrent: [[entry], [entry]],
			refreshed: [{ ...entry, summary: 'updated' }],
		});
	});

	test('propagates scan failures and allows the next scan to retry', async () => {
		const bindings = new TestClaudeSdkBindings();
		bindings.listResult = new DeferredPromise<SDKSessionInfo[]>();
		const service = createService(bindings);
		const failure = new Error('scan failed');
		const first = assert.rejects(service.listSessions(), error => error === failure);
		const second = assert.rejects(service.listSessions(), error => error === failure);
		await bindings.listStarted.p;
		bindings.listResult.error(failure);
		await Promise.all([first, second]);
		bindings.listResult = undefined;

		assert.deepStrictEqual({ result: await service.listSessions(), calls: bindings.listCalls }, { result: [], calls: 2 });
	});

	test('does not retain transcript buffers through metadata strings', async function () {
		this.timeout(30_000);
		await promisify(execFile)(process.execPath, [
			'--expose-gc',
			FileAccess.asFileUri('vs/platform/agentHost/test/node/fixtures/claudeSessionMetadataMemory.js').fsPath,
		], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			timeout: 25_000,
		});
	});
});
