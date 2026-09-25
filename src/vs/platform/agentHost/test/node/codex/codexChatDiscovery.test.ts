/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { FileService } from '../../../../files/common/fileService.js';
import { FileChangeType, IFileChange, IFileService, IWatchOptions } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { IProductService } from '../../../../product/common/productService.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { AgentSession, IAgentDiscoveredChat } from '../../../common/agent.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from '../../../node/agentHostCustomizationEnablementService.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexAppServerClient, ClientRequestMethod, ClientRequestParams } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyHandle, ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { Thread } from '../../../node/codex/protocol/generated/v2/Thread.js';
import type { Turn as CodexTurn } from '../../../node/codex/protocol/generated/v2/Turn.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../../node/shared/worktreeIsolation.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';
import { RecordingAgentSdkDownloader } from '../testAgentSdkDownloader.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

const codexHome = URI.file('/codex-discovery/custom-home');

interface ITestCodexAgent {
	_activated: boolean;
	_probeAccountAtStartup(): Promise<void>;
	_restartChatDiscovery(): void;
	_connectionGeneration: number;
	_connection: {
		kind: 'ready';
		client: ICodexAppServerClient;
		codexHome: URI;
		proxyHandle: ICodexProxyHandle;
		child: ChildProcessWithoutNullStreams;
	};
}


function thread(id: string, updatedAt = 1, name = id): Thread {
	return {
		id, sessionId: id, extra: null, forkedFromId: null, parentThreadId: null,
		preview: id, ephemeral: false, section: null, sectionEnteredAt: null,
		projectId: null, historyMode: 'paginated', modelProvider: 'openai', model: null,
		reasoningEffort: null, createdAt: 1, updatedAt, recencyAt: null,
		status: { type: 'notLoaded' }, path: URI.joinPath(codexHome, 'sessions/2026/09/22', `${id}.jsonl`).fsPath,
		cwd: '/project', cliVersion: '0.153.0', source: 'appServer', canAcceptDirectInput: null,
		threadSource: null, agentNickname: null, agentRole: null, gitInfo: null, name, turns: [],
	};
}

class CatalogClient extends mock<ICodexAppServerClient>() {
	threads: Thread[] = [thread('first')];
	turns: CodexTurn[] = [];
	readonly historyRequests: string[] = [];
	nextHistory: (() => Promise<CodexTurn[]>) | undefined;
	activeHistoryReads = 0;
	maxActiveHistoryReads = 0;
	listCalls = 0;
	activeLists = 0;
	maxActiveLists = 0;
	nextList: (() => Promise<Thread[]>) | undefined;
	readonly requests: (ClientRequestParams<ClientRequestMethod>)[] = [];
	override async request<M extends ClientRequestMethod, R>(method: M, _params: ClientRequestParams<M>): Promise<R> {
		if (method === 'thread/read') {
			this.historyRequests.push(method);
			return { thread: { ...this.threads[0], turns: this.turns } } as R;
		}
		if (method === 'thread/turns/list') {
			this.historyRequests.push(method);
			const params = _params as ClientRequestParams<'thread/turns/list'>;
			const next = this.nextHistory;
			this.nextHistory = undefined;
			this.maxActiveHistoryReads = Math.max(this.maxActiveHistoryReads, ++this.activeHistoryReads);
			try {
				const turns = next ? await next() : this.turns;
				return { data: params.sortDirection === 'desc' ? [...turns].reverse() : turns, nextCursor: null } as R;
			} finally {
				this.activeHistoryReads--;
			}
		}
		assert.strictEqual(method, 'thread/list');
		this.listCalls++;
		this.requests.push(_params);
		this.maxActiveLists = Math.max(this.maxActiveLists, ++this.activeLists);
		const next = this.nextList;
		this.nextList = undefined;
		try {
			return { data: next ? await next() : this.threads, nextCursor: null } as R;
		} finally {
			this.activeLists--;
		}
	}
	override dispose(): void { }
}

/** Like the disk provider, delivers correlated home watches separately. */
class DiscoveryFileSystem extends InMemoryFileSystemProvider {
	readonly watches = new Map<string, IWatchOptions>();

	override watch(resource: URI, options: IWatchOptions) {
		this.watches.set(resource.toString(), options);
		return toDisposable(() => this.watches.delete(resource.toString()));
	}

	changeHomeFile(name: string, type = FileChangeType.UPDATED): void {
		(this as unknown as { _onDidChangeFile: Emitter<readonly IFileChange[]> })._onDidChangeFile.fire([{
			resource: URI.joinPath(codexHome, name), type,
			cId: this.watches.get(codexHome.toString())?.correlationId,
		}]);
	}
}

function createHarness(store: DisposableStore, sessionData = createSessionDataService()) {
	const instantiation = store.add(new TestInstantiationService());
	const log = new NullLogService();
	const files = store.add(new FileService(log));
	const filesystem = store.add(new DiscoveryFileSystem());
	store.add(files.registerProvider(Schemas.file, filesystem));
	const state = store.add(new AgentHostStateManager(log));
	const config = store.add(new AgentConfigurationService(state, log));
	const downloader = new RecordingAgentSdkDownloader();
	instantiation.stub(ILogService, log);
	instantiation.stub(IFileService, files);
	instantiation.stub(IAgentConfigurationService, config);
	instantiation.stub(ISessionDataService, sessionData);
	instantiation.stub(ICopilotApiService, { models: async () => [] });
	instantiation.stub(ICodexProxyService, {});
	instantiation.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiation.stub(IAgentSdkDownloader, downloader);
	instantiation.stub(IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation());
	instantiation.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
	instantiation.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiation.stub(IAgentHostProxyResolver, createTestAgentHostProxyResolver());
	instantiation.stub(IAgentHostOTelService, { getNativeSdkTelemetryConfig: async () => undefined });
	instantiation.stub(IAgentHostSessionTitleSignal, { onDidChangeSessionTitle: Event.None });
	instantiation.stub(INativeEnvironmentService, { userHome: URI.file('/codex-discovery/user') });
	instantiation.stub(IProductService, { version: '1.0.0-test' });
	instantiation.stub(ITelemetryService, NullTelemetryService);
	const agent = store.add(instantiation.createInstance(CodexAgent));
	const internal = agent as unknown as ITestCodexAgent;
	// Stub the native process boundary while retaining real discovery, metadata mapping and file services.
	internal._probeAccountAtStartup = async () => { };
	const client = new CatalogClient();
	internal._activated = true;
	internal._connection = {
		kind: 'ready', client,
		codexHome,
		proxyHandle: new class extends mock<ICodexProxyHandle>() { override dispose(): void { } },
		child: new class extends mock<ChildProcessWithoutNullStreams>() { override kill(): boolean { return true; } },
	};
	const events: (readonly IAgentDiscoveredChat[])[] = [];
	store.add(agent.onDidDiscoverChats(chats => events.push(chats)));
	return { agent, internal, client, files, filesystem, events, downloader };
}

suite('Codex chat discovery', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes external creation and title/recency updates after the initial catalog without another start', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, files, events } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			client.threads = [thread('first'), thread('second')];
			await files.writeFile(URI.file(client.threads[1].path!), VSBuffer.fromString('new rollout'));
			await timeout(6000);
			client.threads = [thread('first', 2, 'Updated title'), thread('second')];
			await files.writeFile(URI.file(client.threads[0].path!), VSBuffer.fromString('updated rollout'));
			await timeout(6000);
			assert.deepStrictEqual(events.map(chats => chats.map(chat => [chat.summary, chat.modifiedTime, chat.external])), [
				[['first', 1000, true]],
				[['second', 1000, true]],
				[['Updated title', 2000, true]],
			]);
		} finally {
			store.dispose();
		}
	}));

	test('serves the latest discovery metadata without materializing the external thread', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, files } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			const session = AgentSession.uri('codex', 'first');
			const chat = URI.parse(buildDefaultChatUri(session));
			const before = await agent.getChatMetadata(chat, session);
			client.threads = [thread('first', 2, 'Updated title')];
			await files.writeFile(URI.file(client.threads[0].path!), VSBuffer.fromString('update'));
			await timeout(6000);
			const after = await agent.getChatMetadata(chat, session);
			assert.deepStrictEqual([before?.summary, after?.summary, after?.modifiedTime], ['first', 'Updated title', 2000]);
		} finally {
			store.dispose();
		}
	}));

	test('coalesces streaming writes, serializes scans, and retains a trailing invalidation', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, files, events } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			const blocked = new DeferredPromise<Thread[]>();
			client.nextList = () => blocked.p;
			const rollout = URI.file(client.threads[0].path!);
			// A steady stream must still refresh before writes stop.
			for (let i = 0; i < 7; i++) {
				await files.writeFile(rollout, VSBuffer.fromString(`stream ${i}`));
				await timeout(1000);
			}
			const duringStreaming = client.listCalls;
			client.threads = [thread('first', 3, 'Trailing title')];
			await files.writeFile(rollout, VSBuffer.fromString('trailing'));
			await timeout(6000);
			await blocked.complete([thread('first', 2, 'Intermediate title')]);
			await timeout(6000);
			assert.deepStrictEqual({
				duringStreaming, lists: client.listCalls, maxActive: client.maxActiveLists,
				titles: events.flatMap(chats => chats.map(chat => chat.summary)),
			}, {
				duringStreaming: 2, lists: 3, maxActive: 1,
				titles: ['first', 'Intermediate title', 'Trailing title'],
			});
		} finally {
			store.dispose();
		}
	}));

	test('retries failed scans without another filesystem change and suppresses unchanged catalogs', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, filesystem, events } = createHarness(store);
		try {
			client.nextList = async () => { throw new Error('temporary failure'); };
			await agent.startChatDiscovery();
			const failedEvents = events.length;
			await timeout(6000);
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(6000);
			assert.deepStrictEqual({ failedEvents, lists: client.listCalls, events: events.length }, { failedEvents: 0, lists: 3, events: 1 });
		} finally {
			store.dispose();
		}
	}));

	test('tracks nested directory replacement and title-only catalog changes in the configured home', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, files, filesystem, events } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			const sessions = URI.joinPath(codexHome, 'sessions');
			const rollout = URI.joinPath(sessions, '2026/09/23/replacement.jsonl');
			client.threads = [thread('replacement')];
			await files.writeFile(rollout, VSBuffer.fromString('create missing directories'));
			await timeout(6000);
			await files.move(sessions, URI.joinPath(codexHome, 'old-sessions'));
			client.threads = [thread('recreated')];
			await files.writeFile(rollout, VSBuffer.fromString('recreate directories'));
			await timeout(6000);
			client.threads = [thread('recreated', 1, 'Renamed without a turn')];
			filesystem.changeHomeFile('session_index.jsonl', FileChangeType.ADDED);
			await timeout(6000);
			const titles = events.flatMap(chats => chats.map(chat => chat.summary));
			assert.deepStrictEqual({ titles, recursive: filesystem.watches.get(sessions.toString())?.recursive }, {
				titles: ['first', 'replacement', 'recreated', 'Renamed without a turn'], recursive: true,
			});
		} finally {
			store.dispose();
		}
	}));

	test('ambient discovery stays cold and unavailable SDKs wait for explicit readiness', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, internal, client, downloader, filesystem, events } = createHarness(store);
		try {
			internal._activated = false;
			await agent.startChatDiscovery();
			await timeout(120_000);
			const cold = { lists: client.listCalls, watches: filesystem.watches.size };
			internal._activated = true;
			downloader.resolvableWithoutDownload = false;
			await agent.startChatDiscovery();
			await timeout(120_000);
			const unavailable = { lists: client.listCalls, watches: filesystem.watches.size };
			downloader.resolvableWithoutDownload = true;
			// The SDK setup channel invokes this after an explicit download.
			internal._restartChatDiscovery();
			await timeout(6000);
			assert.deepStrictEqual({ cold, unavailable, events: events.length, downloads: downloader.progressInterests }, {
				cold: { lists: 0, watches: 0 }, unavailable: { lists: 0, watches: 0 }, events: 1, downloads: [],
			});
		} finally {
			store.dispose();
		}
	}));

	test('does not reclassify known Agent Host backings as external after a refresh', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const known = new TestSessionDatabase();
		await known.setMetadata('codex.threadId', 'internal');
		const knownData = createSessionDataService(known);
		const { agent, client, filesystem, events } = createHarness(store, {
			...knownData,
			tryOpenDatabase: async session => AgentSession.id(session) === 'internal' ? knownData.tryOpenDatabase(session) : undefined,
		});
		try {
			client.threads = [thread('internal'), thread('external')];
			await agent.startChatDiscovery();
			client.threads = [thread('internal', 2), thread('external', 2)];
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(6000);
			assert.deepStrictEqual(events.map(chats => chats.map(chat => [chat.summary, chat.external])), [
				[['internal', false], ['external', true]], [['internal', false], ['external', true]],
			]);
		} finally {
			store.dispose();
		}
	}));

	test('migration and continuous discovery share catalog work', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client } = createHarness(store);
		try {
			const pending = new DeferredPromise<Thread[]>();
			client.nextList = () => pending.p;
			const migration = agent.listChatsToMigrate();
			const discovery = agent.startChatDiscovery();
			await timeout(0);
			await pending.complete(client.threads);
			await Promise.all([migration, discovery]);
			assert.deepStrictEqual({ lists: client.listCalls, maxActive: client.maxActiveLists }, { lists: 1, maxActive: 1 });
		} finally {
			store.dispose();
		}
	}));

	test('a failed ownership check retries instead of announcing an internal thread as external', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const known = new TestSessionDatabase();
		await known.setMetadata('codex.threadId', 'first');
		const sessionData = createSessionDataService(known);
		let failed = false;
		const { agent, events } = createHarness(store, {
			...sessionData,
			tryOpenDatabase: session => {
				if (!failed) {
					failed = true;
					throw new Error('metadata temporarily unavailable');
				}
				return sessionData.tryOpenDatabase(session);
			},
		});
		try {
			await agent.startChatDiscovery();
			await timeout(6000);
			assert.deepStrictEqual(events.map(chats => chats.map(chat => chat.external)), [[false]]);
		} finally {
			store.dispose();
		}
	}));

	test('excludes native subagents even when the catalog returns them', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, events } = createHarness(store);
		try {
			client.threads = [thread('parent'), { ...thread('child'), parentThreadId: 'parent' }, { ...thread('review'), source: { subAgent: 'review' } }];
			await agent.startChatDiscovery();
			assert.deepStrictEqual(events.flatMap(chats => chats.map(chat => chat.summary)), ['parent']);
		} finally {
			store.dispose();
		}
	}));

	test('a restored idle thread reports updated native metadata after rediscovery', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, filesystem } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			const session = AgentSession.uri('codex', 'first');
			const chat = URI.parse(buildDefaultChatUri(session));
			await agent.materializeChat(chat, { resource: session, configurationResource: session }, undefined);
			client.threads = [thread('first', 2, 'Renamed after opening')];
			filesystem.changeHomeFile('session_index.jsonl');
			await timeout(6000);
			const metadata = await agent.getChatMetadata(chat, session);
			assert.deepStrictEqual({ title: metadata?.summary, modifiedTime: metadata?.modifiedTime }, { title: 'Renamed after opening', modifiedTime: 2000 });
		} finally {
			store.dispose();
		}
	}));

	test('observed external history refreshes during writes without resuming the native writer', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, filesystem } = createHarness(store);
		const turn = (id: string, text: string): CodexTurn => ({
			id, status: 'completed', error: null, startedAt: 1, completedAt: 2, durationMs: 1000, itemsView: 'full',
			items: [{ type: 'userMessage', id: `${id}-user`, clientId: null, content: [{ type: 'text', text, text_elements: [] }] }],
		});
		try {
			await agent.startChatDiscovery();
			const session = AgentSession.uri('codex', 'first');
			const chat = URI.parse(buildDefaultChatUri(session));
			await agent.materializeChat(chat, { resource: session, configurationResource: session }, undefined);
			client.turns = [turn('one', 'First message')];
			await agent.chats.getMessages(chat, session);
			const observed = agent as import('../../../common/agent.js').IAgent;
			const histories: string[][] = [];
			if (observed.onDidChangeChatHistory) {
				store.add(observed.onDidChangeChatHistory(event => histories.push(event.turns.map(turn => turn.message.text))));
			}
			const watch = observed.watchChatHistory && store.add(observed.watchChatHistory(chat));
			client.turns = [...client.turns, turn('two', 'Sent later in ChatGPT')];
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(1500);
			const afterCreation = histories.at(-1);
			const release = new DeferredPromise<CodexTurn[]>();
			client.nextHistory = () => release.p;
			for (let i = 0; i < 12; i++) {
				filesystem.changeHomeFile('state_5.sqlite-wal');
				await timeout(100);
			}
			client.turns = [...client.turns, turn('three', 'Trailing external turn')];
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await release.complete(client.turns.slice(0, 2));
			await timeout(1500);
			const afterBurst = histories.at(-1);
			client.nextHistory = async () => { throw new Error('transient native read failure'); };
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(1500);
			const count = histories.length;
			await timeout(6000);
			const afterUnchanged = histories.length;
			watch?.dispose();
			const requestsAtDispose = client.historyRequests.length;
			await timeout(6000);
			assert.deepStrictEqual({ afterCreation, afterBurst, unchanged: count === afterUnchanged, maxConcurrent: client.maxActiveHistoryReads, stopped: requestsAtDispose === client.historyRequests.length }, {
				afterCreation: ['First message', 'Sent later in ChatGPT'], afterBurst: ['First message', 'Sent later in ChatGPT', 'Trailing external turn'],
				unchanged: true, maxConcurrent: 1, stopped: true,
			});
		} finally {
			store.dispose();
		}
	}));

	test('unchanged catalogs do not repeatedly inspect rollout files or Agent Host databases', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		let databaseReads = 0;
		const sessionData = createSessionDataService();
		const { agent, client, files, filesystem } = createHarness(store, {
			...sessionData,
			tryOpenDatabase: async session => { databaseReads++; return sessionData.tryOpenDatabase(session); },
		});
		try {
			client.threads = [{ ...thread('desktop'), source: 'vscode' }];
			const rollout = URI.file(client.threads[0].path!);
			await files.writeFile(rollout, VSBuffer.fromString('{"type":"session_meta","payload":{"originator":"Codex Desktop"}}\n'));
			let rolloutReads = 0;
			const readFile = files.readFile;
			files.readFile = async (resource, options) => { rolloutReads++; return readFile.call(files, resource, options); };
			await agent.startChatDiscovery();
			const initial = { rolloutReads, databaseReads };
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(6000);
			assert.deepStrictEqual({ initial, after: { rolloutReads, databaseReads } }, {
				initial: { rolloutReads: 1, databaseReads: 1 }, after: { rolloutReads: 1, databaseReads: 1 },
			});
		} finally {
			store.dispose();
		}
	}));

	test('rejects a replaced connection snapshot and retries on the replacement home', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, internal, client, filesystem, events } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			const pending = new DeferredPromise<Thread[]>();
			client.nextList = () => pending.p;
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(6000);
			const previous = internal._connection;
			assert.strictEqual(previous.kind, 'ready');
			if (previous.kind !== 'ready') {
				return;
			}
			const replacement = new CatalogClient();
			replacement.threads = [thread('replacement')];
			const replacementHome = URI.file('/replacement-codex-home');
			internal._connection = { ...previous, client: replacement, codexHome: replacementHome };
			internal._connectionGeneration++;
			await pending.complete([thread('stale')]);
			await timeout(6000);
			assert.deepStrictEqual({
				titles: events.flatMap(chats => chats.map(chat => chat.summary)),
				oldWatch: filesystem.watches.has(codexHome.toString()),
				newWatch: filesystem.watches.has(replacementHome.toString()),
			}, { titles: ['first', 'replacement'], oldWatch: false, newWatch: true });
		} finally {
			store.dispose();
		}
	}));

	test('periodically recovers missed events and releases watchers and retries on shutdown', () => runWithFakedTimers({}, async () => {
		const store = disposables.add(new DisposableStore());
		const { agent, client, filesystem, events } = createHarness(store);
		try {
			await agent.startChatDiscovery();
			client.threads = [thread('unobserved')];
			await timeout(66_000);
			const pending = new DeferredPromise<Thread[]>();
			client.nextList = () => pending.p;
			filesystem.changeHomeFile('state_5.sqlite-wal');
			await timeout(6000);
			await agent.shutdown();
			const callsAtShutdown = client.listCalls;
			await pending.complete([thread('after-shutdown')]);
			await timeout(120_000);
			assert.deepStrictEqual({
				titles: events.flatMap(chats => chats.map(chat => chat.summary)),
				watches: filesystem.watches.size, subsequentLists: client.listCalls - callsAtShutdown,
			}, { titles: ['first', 'unobserved'], watches: 0, subsequentLists: 0 });
		} finally {
			store.dispose();
		}
	}));
});
