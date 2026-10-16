/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { IFileService } from '../../../../files/common/files.js';
import { NullLogService } from '../../../../log/common/log.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ResponsePartKind } from '../../../common/state/sessionState.js';
import type { IAgentHostSavedChatReadContext } from '../../../node/agentHostSavedChatService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { encodeCodexChat } from '../../../node/codex/codexChatBacking.js';
import { CodexSavedChatReader } from '../../../node/codex/codexSavedChatReader.js';
import type { Thread } from '../../../node/codex/protocol/generated/v2/Thread.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';

function savedThread(id: string): Thread {
	return {
		id, sessionId: id, environments: null, extra: null, forkedFromId: null, parentThreadId: null,
		preview: 'Earlier question', ephemeral: false, section: null, sectionEnteredAt: null, projectId: null,
		historyMode: 'legacy', modelProvider: 'openai', model: null, reasoningEffort: null,
		createdAt: 1, updatedAt: 2, recencyAt: null, status: { type: 'notLoaded' }, path: null,
		cwd: '/workspace', cliVersion: '0.157.0', originator: 'vscode_agent_host', source: 'vscode',
		canAcceptDirectInput: null, threadSource: null, agentNickname: null, agentRole: null, gitInfo: null,
		name: null, daybreakEnabled: null,
		turns: [{
			id: 'turn-1', status: 'completed', itemsView: 'full', error: null,
			startedAt: null, completedAt: null, durationMs: null,
			items: [
				{ type: 'userMessage', id: 'message-1', clientId: null, content: [{ type: 'text', text: 'Earlier question', text_elements: [] }] },
				{ type: 'agentMessage', id: 'message-2', text: 'Saved answer', phase: 'final_answer', memoryCitation: null, delivery: null, questions: null },
			],
		}],
	};
}

class TestCodexSavedChatReader extends CodexSavedChatReader {
	readonly readThreads: string[] = [];
	beforeRead: (() => Promise<void>) | undefined;
	protected override async _readThread(threadId: string, _token: CancellationToken): Promise<Thread> {
		this.readThreads.push(threadId);
		await this.beforeRead?.();
		return savedThread(threadId);
	}
}

suite('CodexSavedChatReader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const context: IAgentHostSavedChatReadContext = {
		session: URI.parse('ahp-session:/owner'), chat: URI.parse('ahp-chat:/owner/peer'),
		storageResource: URI.parse('ahp-chat:/owner/peer'),
		providerData: encodeCodexChat({ sessionId: 'runtime-peer' }), origin: undefined, workingDirectories: [],
	};

	function createReader(service: ISessionDataService): TestCodexSavedChatReader {
		return new TestCodexSavedChatReader(service, new class extends mock<IFileService>() { }, new NullLogService(),
			new class extends mock<IAgentSdkDownloader>() { }, new class extends mock<INativeEnvironmentService>() { });
	}

	test('resolves the exact runtime overlay and maps its saved conversation', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.threadId', 'native-peer');
		const service = createSessionDataService(database);
		const opened: string[] = [];
		const open = service.tryOpenDatabase;
		service.tryOpenDatabase = async resource => { opened.push(resource.toString()); return open(resource); };
		const reader = createReader(service);
		const turns = await reader.read(context, CancellationToken.None);
		assert.deepStrictEqual({
			opened, native: reader.readThreads,
			messages: turns.map(turn => ({ user: turn.message.text, answer: turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content) })),
		}, {
			opened: ['codex:/runtime-peer'], native: ['native-peer'],
			messages: [{ user: 'Earlier question', answer: ['Saved answer'] }],
		});
	});

	test('does not guess a native thread from a standard chat identity without an overlay', async () => {
		const reader = createReader(createSessionDataService());
		await assert.rejects(reader.read(context, CancellationToken.None), /backing|thread/i);
		assert.deepStrictEqual(reader.readThreads, []);
	});

	test('does not fall back from invalid persisted backing to the owner', async () => {
		const reader = createReader(createSessionDataService());
		await assert.rejects(reader.read({ ...context, providerData: '{broken' }, CancellationToken.None), /backing/i);
		assert.deepStrictEqual(reader.readThreads, []);
	});

	test('accepts an explicit legacy default chat identity', async () => {
		const reader = createReader(createSessionDataService());
		const legacy = URI.parse('codex:/legacy-thread');
		await reader.read({ ...context, session: legacy, storageResource: legacy, providerData: undefined }, CancellationToken.None);
		assert.deepStrictEqual(reader.readThreads, ['legacy-thread']);
	});

	test('accepts the matching canonical native backing persisted when a legacy chat was opened', async () => {
		const reader = createReader(createSessionDataService());
		const legacy = URI.parse('codex:/legacy-thread');
		await reader.read({ ...context, session: legacy, storageResource: legacy, providerData: encodeCodexChat({ sessionId: 'legacy-thread' }) }, CancellationToken.None);
		assert.deepStrictEqual(reader.readThreads, ['legacy-thread']);
	});

	test('does not guess a legacy owner thread for a different runtime backing', async () => {
		const reader = createReader(createSessionDataService());
		const legacy = URI.parse('codex:/legacy-thread');
		await assert.rejects(reader.read({ ...context, session: legacy, storageResource: legacy }, CancellationToken.None), /thread/);
		assert.deepStrictEqual(reader.readThreads, []);
	});

	test('preserves metadata errors instead of substituting an empty history', async () => {
		const service = createSessionDataService();
		service.tryOpenDatabase = async () => { throw new Error('Saved metadata failed'); };
		await assert.rejects(createReader(service).read(context, CancellationToken.None), /Saved metadata failed/);
	});

	test('does not download an unavailable decoder for a disabled provider', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.threadId', 'native-peer');
		let downloads = 0;
		const downloader = new class extends mock<IAgentSdkDownloader>() {
			override isAvailable(): boolean { return true; }
			override async resolveInstalledSdkRoot(): Promise<string | undefined> { return undefined; }
			override async loadSdkRoot(): Promise<string> { downloads++; throw new Error('Unexpected SDK download'); }
		};
		const reader = new CodexSavedChatReader(createSessionDataService(database), new class extends mock<IFileService>() { },
			new NullLogService(), downloader, new class extends mock<INativeEnvironmentService>() { });
		await assert.rejects(reader.read(context, CancellationToken.None), /history reader is not available/);
		assert.strictEqual(downloads, 0);
	});

	test('cancellation prevents reading the source', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		cancellation.cancel();
		const reader = createReader(createSessionDataService());
		await assert.rejects(reader.read(context, cancellation.token), CancellationError);
		assert.deepStrictEqual(reader.readThreads, []);
	});

	test('serializes native readers so multiple cold opens cannot duplicate heavy snapshots', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.threadId', 'native-peer');
		const reader = createReader(createSessionDataService(database));
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		reader.beforeRead = async () => {
			await started.complete();
			await finish.p;
		};
		const first = reader.read(context, CancellationToken.None);
		await started.p;
		const second = reader.read(context, CancellationToken.None);
		await timeout(0);
		const concurrentReaders = reader.readThreads.length;
		await finish.complete();
		await Promise.all([first, second]);
		assert.strictEqual(concurrentReaders, 1);
	});
});
