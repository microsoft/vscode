/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentChatKind, AgentSession, type AgentSignal, type IAgentMaterializeSessionEvent } from '../../../common/agentService.js';
import { buildChatUri, buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import type { IAgentServerToolHost } from '../../../common/agentServerTools.js';
import { ISessionDataService, type ISessionDatabase } from '../../../common/sessionDataService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

const COPILOT_TEST_MODEL = toCodexModelSelectionId('vscode-proxy', 'gpt-test');

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
		readonly numTurns?: number;
	};
}

interface ITestPeer {
	readonly transport: ICodexAppServerTransport;
	readonly outbound: PassThrough;
	push(message: object): void;
	dispose(): void;
}

function createTestPeer(): ITestPeer {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const onExit = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	const transport: ICodexAppServerTransport = {
		stdin,
		stdout,
		kill: () => true,
		onExit: onExit.event,
		onExitOnce: () => { },
	};
	return {
		transport,
		outbound: stdin,
		push: message => stdout.write(JSON.stringify(message) + '\n'),
		dispose: () => {
			onExit.dispose();
			stdin.destroy();
			stdout.destroy();
		},
	};
}

function readNextRequest(stream: PassThrough): Promise<ITestWireRequest> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('Timed out waiting for Codex request'));
		}, 1_000);
		const onData = (chunk: Buffer | string) => {
			cleanup();
			try {
				resolve(JSON.parse(typeof chunk === 'string' ? chunk : chunk.toString('utf8')));
			} catch (err) {
				reject(err);
			}
		};
		const cleanup = () => {
			clearTimeout(timeout);
			stream.off('data', onData);
		};
		stream.once('data', onData);
	});
}

interface ICreateAgentOptions {
	/**
	 * Whether prewarm may proceed to a real `thread/start`. Defaults to
	 * `false` so fresh/import tests don't need a live connection; fork tests
	 * (which always need a connection for `thread/fork`) opt in.
	 */
	readonly sdkResolvableWithoutDownload?: boolean;
	/**
	 * Durable per-session storage shared across "processes". Supply the same
	 * store to two agents to model a host restart.
	 */
	readonly sessionStore?: ITestSessionStore;
}

/**
 * Per-session durable storage, keyed by session URI exactly like the real
 * service. Restore tests depend on this: a runtime's metadata overlay (its
 * codex thread id) is stored under the session URI it was persisted with, so a
 * blob that names the wrong id must not accidentally find someone else's
 * overlay.
 */
interface ITestSessionStore {
	readonly service: ISessionDataService;
	databaseFor(session: URI): TestSessionDatabase;
}

function createTestSessionStore(): ITestSessionStore {
	const databases = new Map<string, TestSessionDatabase>();
	const databaseFor = (session: URI): TestSessionDatabase => {
		const key = session.toString();
		let database = databases.get(key);
		if (!database) {
			database = new TestSessionDatabase();
			databases.set(key, database);
		}
		return database;
	};
	const base = createSessionDataService();
	return {
		databaseFor,
		service: {
			...base,
			openDatabase: session => createSessionDatabaseReference(databaseFor(session)),
			tryOpenDatabase: async session => createSessionDatabaseReference(databaseFor(session)),
		},
	};
}

function createSessionDatabaseReference(database: ISessionDatabase) {
	return { object: database, dispose: () => { } };
}

async function createAgent(disposables: Pick<DisposableStore, 'add'>, options: ICreateAgentOptions = {}): Promise<CodexAgent> {
	const models = [{ id: 'gpt-test', name: 'GPT Test', supported_endpoints: ['/responses'] }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
	instantiationService.stub(ISessionDataService, options.sessionStore?.service ?? { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined, isSdkResolvableWithoutDownload: async () => options.sdkResolvableWithoutDownload ?? false });
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getNativeSdkTelemetryConfig: async () => undefined,
		getSessionTraceContext: () => undefined,
		releaseSessionTraceContext: () => { },
	});
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(IFileService, fileService);
	instantiationService.stub(ILogService, logService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	agent['_refreshSkillHookCustomizations'] = async () => { };
	agent['_refreshSkillExtraRoots'] = async () => { };
	await agent.authenticate(agent.getProtectedResources()[0].resource, 'test-token');
	await agent.refreshModels();
	return agent;
}

function connectPeer(agent: CodexAgent, peer: ITestPeer): void {
	agent['_connection'] = {
		kind: 'ready',
		client: new CodexAppServerClient(peer.transport),
		usageSource: 'github',
		child: { kill: () => true },
	} as never;
}

/**
 * Records which sessions the agent advertises the host's server tools on. Every
 * other member is inert: only {@link IAgentServerToolHost.advertise} is under
 * test.
 */
function createRecordingServerToolHost(advertised: string[]): IAgentServerToolHost {
	return {
		definitions: [],
		toolNames: [],
		advertise: session => advertised.push(session.toString()),
		canRequireConfirmation: () => false,
		requiresConfirmation: () => false,
		executeTool: () => '',
	};
}

suite('CodexAgent createSessionChat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh: binds the exact target chat during creation, never leaving the runtime unbound', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-fresh');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const folder = URI.file('/repo/fresh');

		const created = await agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat }, {
			session: sessionUri,
			workingDirectories: [folder],
			model: { id: COPILOT_TEST_MODEL },
		});

		assert.deepStrictEqual({
			session: created.session.toString(),
			provisional: created.provisional,
			resolvedWorkingDirectory: created.resolvedWorkingDirectory?.toString(),
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('session-fresh')?.chatChannel?.toString(),
		}, {
			session: sessionUri.toString(),
			provisional: true,
			resolvedWorkingDirectory: folder.toString(),
			boundSessionId: 'session-fresh',
			chatChannel: chat.toString(),
		});
	});

	test('legacy default restore recovers and returns the historical session-id backing', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'legacy-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		await agent.chats.createSessionChat(chat, { session, resource: chat, kind: AgentChatKind.Session }, {
			session,
			workingDirectories: [URI.file('/repo/legacy')],
			model: { id: COPILOT_TEST_MODEL },
		});
		agent['_sessionIdByChatUri'].delete(chat.toString());
		agent['_sessions'].get('legacy-session')!.chatChannel = undefined;

		const recovered = await agent.recoverLegacyChat(chat, { session, resource: chat, kind: AgentChatKind.Session });

		assert.deepStrictEqual({
			providerData: recovered?.providerData ? JSON.parse(recovered.providerData) : undefined,
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('legacy-session')?.chatChannel?.toString(),
		}, {
			providerData: { sessionId: 'legacy-session' },
			boundSessionId: 'legacy-session',
			chatChannel: chat.toString(),
		});
	});

	test('fresh: a rebind (same session id, new createSessionChat call) binds directly as part of creation', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-rebind');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));
		const folder = URI.file('/repo/rebind');

		await agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat }, {
			session: sessionUri,
			workingDirectories: [folder],
		});

		// Workbench rebind: a second createSessionChat for the same session id,
		// e.g. after a chip-selection change re-mints the request. Model
		// changes here, so the reconnect ("existing") branch runs.
		const rebound = await agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat }, {
			session: sessionUri,
			workingDirectories: [folder],
			model: { id: COPILOT_TEST_MODEL },
		});

		assert.deepStrictEqual({
			provisional: rebound.provisional,
			boundSessionId: agent['_sessionIdByChatUri'].get(chat.toString()),
			chatChannel: agent['_sessions'].get('session-rebind')?.chatChannel?.toString(),
		}, {
			provisional: true,
			boundSessionId: 'session-rebind',
			chatChannel: chat.toString(),
		});
	});

	test('importConversation: explicitly rejects instead of silently creating an empty fresh session', async () => {
		const agent = await createAgent(disposables);
		const sessionUri = AgentSession.uri('codex', 'session-import');
		const chat = URI.parse(buildDefaultChatUri(sessionUri));

		await assert.rejects(
			agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat }, {
				session: sessionUri,
				workingDirectories: [URI.file('/repo/import')],
				importConversation: { turns: [] },
			}),
			/does not support importing/,
		);

		assert.deepStrictEqual({
			hasSession: agent['_sessions'].has('session-import'),
			hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
		}, {
			hasSession: false,
			hasBinding: false,
		});
	});

	test('fork: preserves the exact source thread and binds the forked session directly to the target chat', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sourceSessionUri = AgentSession.uri('codex', 'session-source');
			const sourceChat = URI.parse(buildDefaultChatUri(sourceSessionUri));
			const folder = URI.file('/repo/source');
			await agent.chats.createSessionChat(sourceChat, { session: sourceSessionUri, resource: sourceChat }, {
				session: sourceSessionUri,
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sourceEntry = agent['_sessions'].get('session-source')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'source-thread', cwd: folder.fsPath } } });
			await sourceEntry.materializePromise;

			const forkSessionUri = AgentSession.uri('codex', 'session-fork-target');
			const forkChat = URI.parse(buildDefaultChatUri(forkSessionUri));
			const forking = agent.chats.createSessionChat(forkChat, { session: forkSessionUri, resource: forkChat }, {
				session: forkSessionUri,
				fork: { session: sourceSessionUri, chat: sourceChat, turnId: 'turn-1', turnIndex: 0 },
			});

			const read = await readNextRequest(peer.outbound);
			assert.strictEqual(read.method, 'thread/read');
			assert.strictEqual(read.params.threadId, 'source-thread');
			peer.push({
				id: read.id,
				result: { thread: { id: 'source-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }] } },
			});

			const fork = await readNextRequest(peer.outbound);
			assert.strictEqual(fork.method, 'thread/fork');
			assert.strictEqual(fork.params.threadId, 'source-thread');
			peer.push({
				id: fork.id,
				result: { thread: { id: 'forked-thread', cwd: folder.fsPath }, cwd: folder.fsPath },
			});

			const forked = await forking;
			const newThreadId = 'forked-thread';

			assert.deepStrictEqual({
				provisional: forked.provisional,
				forkedSessionMatchesThread: forked.session.toString() === AgentSession.uri('codex', newThreadId).toString(),
				// The exact-chat binding must already be in place by the time the
				// caller observes the result — creation is the only binding seam.
				boundSessionId: agent['_sessionIdByChatUri'].get(forkChat.toString()),
				chatChannel: agent['_sessions'].get(newThreadId)?.chatChannel?.toString(),
			}, {
				provisional: false,
				forkedSessionMatchesThread: true,
				boundSessionId: newThreadId,
				chatChannel: forkChat.toString(),
			});

			// Exact chat binding is directly usable: sending on the forked chat
			// resolves through the binding creation recorded.
			const sending = agent.chats.sendMessage(forkChat, 'hello', undefined, undefined, 'turn-2');
			const resume = await readNextRequest(peer.outbound);
			assert.strictEqual(resume.method, 'thread/resume');
			assert.strictEqual(resume.params.threadId, newThreadId);
			peer.push({ id: resume.id, result: { thread: { id: newThreadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
		} finally {
			peer.dispose();
		}
	});

	test('fresh: prewarm and the exact chat binding cooperate so a first send never needs a separate bind', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-prewarm');
			const chat = URI.parse(buildDefaultChatUri(sessionUri));
			const folder = URI.file('/repo/prewarm');
			const created = await agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat }, {
				session: sessionUri,
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			assert.strictEqual(created.provisional, true);
			// The binding lands as part of creation, not as a follow-up: check it
			// before the prewarmed thread/start round trip below even completes.
			assert.strictEqual(agent['_sessionIdByChatUri'].get(chat.toString()), 'session-prewarm');

			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'prewarmed-thread', cwd: folder.fsPath } } });
			const entry = agent['_sessions'].get('session-prewarm')!;
			await entry.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			assert.strictEqual(turn.method, 'turn/start');
			assert.strictEqual(turn.params.threadId, 'prewarmed-thread');
			peer.push({ id: turn.id, result: {} });
			await sending;
		} finally {
			peer.dispose();
		}
	});
});

suite('CodexAgent exact chat routing', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function sessionChatWithPeerShape(session: URI): URI {
		return URI.parse(buildChatUri(session, 'not-the-default-id'));
	}

	test('routes the exact chat without retaining a session or peer classification', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const folder = URI.file('/repo/intent');
			const materialized: string[] = [];
			disposables.add(agent.onDidMaterializeSession(e => materialized.push(e.resource.toString())));

			await agent.chats.createSessionChat(chat, { session: sessionUri, resource: chat, kind: AgentChatKind.Peer }, {
				session: sessionUri,
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
				activeClient: { clientId: 'client-1', tools: [{ name: 'client_tool', description: 'client tool', inputSchema: { type: 'object' } }] },
			});
			const entry = agent['_sessions'].get('session-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'intent-thread', cwd: folder.fsPath } } });
			await entry.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, undefined, { session: sessionUri, resource: chat, kind: AgentChatKind.Peer });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;

			assert.deepStrictEqual({
				advertised,
				materialized,
				// The eager active client is seeded over the exact chat the call
				// binds, so its tools land on this runtime without any
				// default-chat URI being synthesized to find it.
				clientTools: entry.clientToolSet.merged().map(tool => tool.name),
			}, {
				advertised: [sessionUri.toString()],
				materialized: [chat.toString()],
				clientTools: ['client_tool'],
			});
		} finally {
			peer.dispose();
		}
	});

	test('disposeChat tears down the runtime of the addressed chat and forgets its binding', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-dispose-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const context = { session: sessionUri, resource: chat, kind: AgentChatKind.Session };

			await agent.chats.createSessionChat(chat, context, {
				session: sessionUri,
				workingDirectories: [URI.file('/repo/dispose')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-dispose-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'dispose-thread', cwd: '/repo/dispose' } } });
			await entry.materializePromise;
			assert.strictEqual(agent['_sessionIdByChatUri'].get(chat.toString()), 'session-dispose-intent');

			// Agent Host's teardown order: dispose every chat, then finalize the
			// session's remaining scope.
			const disposing = agent.chats.disposeChat(chat, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await disposing;
			await agent.finalizeSession(sessionUri);

			assert.deepStrictEqual({
				unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				hasRuntime: agent['_sessions'].has('session-dispose-intent'),
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			}, {
				unsubscribed: { method: 'thread/unsubscribe', threadId: 'dispose-thread' },
				hasRuntime: false,
				hasBinding: false,
			});
		} finally {
			peer.dispose();
		}
	});

	test('releaseChat releases the runtime of the addressed chat but keeps it resumable', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-release-intent');
			const chat = sessionChatWithPeerShape(sessionUri);
			const context = { session: sessionUri, resource: chat, kind: AgentChatKind.Session };

			await agent.chats.createSessionChat(chat, context, {
				session: sessionUri,
				workingDirectories: [URI.file('/repo/release')],
				model: { id: COPILOT_TEST_MODEL },
			});
			const entry = agent['_sessions'].get('session-release-intent')!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'release-thread', cwd: '/repo/release' } } });
			await entry.materializePromise;

			const releasing = agent.chats.releaseChat(chat, context);
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			await releasing;

			assert.deepStrictEqual({
				unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				hasRuntime: agent['_sessions'].has('session-release-intent'),
				// A release is non-destructive: the chat binding survives so the
				// session resumes transparently on the next access.
				hasBinding: agent['_sessionIdByChatUri'].has(chat.toString()),
			}, {
				unsubscribed: { method: 'thread/unsubscribe', threadId: 'release-thread' },
				hasRuntime: false,
				hasBinding: true,
			});
		} finally {
			peer.dispose();
		}
	});

	test('truncateSession rolls back the thread of the addressed chat, not the owning session', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
		const peer = disposables.add(createTestPeer());
		connectPeer(agent, peer);

		try {
			const sessionUri = AgentSession.uri('codex', 'session-truncate');
			const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
			const peerChat = URI.parse(buildChatUri(sessionUri, 'peer-chat'));
			const folder = URI.file('/repo/truncate');

			await agent.chats.createSessionChat(sessionChat, { session: sessionUri, resource: sessionChat, kind: AgentChatKind.Session }, {
				session: sessionUri,
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const sessionEntry = agent['_sessions'].get('session-truncate')!;
			const sessionStart = await readNextRequest(peer.outbound);
			peer.push({ id: sessionStart.id, result: { thread: { id: 'session-thread', cwd: folder.fsPath } } });
			await sessionEntry.materializePromise;

			const creatingPeer = agent.chats.createChat(peerChat, { session: sessionUri, resource: peerChat, kind: AgentChatKind.Peer }, {
				model: { id: COPILOT_TEST_MODEL },
				inheritedContext: { workingDirectories: [folder], config: {} },
			});
			const peerStart = await readNextRequest(peer.outbound);
			peer.push({ id: peerStart.id, result: { thread: { id: 'peer-thread', cwd: folder.fsPath } } });
			await creatingPeer;

			const truncating = agent.truncateSession(sessionUri, 'turn-2', peerChat, { session: sessionUri, resource: peerChat, kind: AgentChatKind.Peer });
			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: { thread: { id: 'peer-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }, { id: 'turn-2' }, { id: 'turn-3' }] } },
			});
			const rollback = await readNextRequest(peer.outbound);
			peer.push({ id: rollback.id, result: {} });
			await truncating;

			assert.deepStrictEqual([
				{ method: read.method, threadId: read.params.threadId },
				{ method: rollback.method, threadId: rollback.params.threadId, numTurns: rollback.params.numTurns },
			], [
				{ method: 'thread/read', threadId: 'peer-thread' },
				{ method: 'thread/rollback', threadId: 'peer-thread', numTurns: 1 },
			]);
		} finally {
			peer.dispose();
		}
	});
});

suite('CodexAgent chat backing durability', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function connect(agent: CodexAgent, peer: ITestPeer): void {
		connectPeer(agent, peer);
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
	}

	/**
	 * Provision a session, let its prewarmed `thread/start` land on
	 * `threadId`, and drive the first send so the session-scoped materialize
	 * receipt — the one carrying the refreshed chat backing — is emitted.
	 */
	async function materializeSession(agent: CodexAgent, peer: ITestPeer, session: URI, chat: URI, folder: URI, threadId: string): Promise<IAgentMaterializeSessionEvent> {
		const receipts: IAgentMaterializeSessionEvent[] = [];
		const listener = agent.onDidMaterializeSession(e => receipts.push(e));
		try {
			await agent.chats.createSessionChat(chat, { session, resource: chat, kind: AgentChatKind.Session }, {
				session,
				workingDirectories: [folder],
				model: { id: COPILOT_TEST_MODEL },
			});
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: threadId, cwd: folder.fsPath } } });
			await agent['_sessions'].get(AgentSession.id(session))!.materializePromise;

			const sending = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1', undefined, undefined, { session, resource: chat, kind: AgentChatKind.Session });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
			// The overlay write that records the thread id is fire-and-forget.
			await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(receipts.length, 1);
			return receipts[0];
		} finally {
			listener.dispose();
		}
	}

	test('the materialize receipt re-keys the chat backing onto the runtime, so a restored session stays addressable', async () => {
		const sessionStore = createTestSessionStore();
		const session = AgentSession.uri('codex', 'host-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/durable');
		const first = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const firstPeer = disposables.add(createTestPeer());
		connect(first, firstPeer);
		let secondPeer: ITestPeer | undefined;

		try {
			const receipt = await materializeSession(first, firstPeer, session, chat, folder, 'codex-thread');

			// A host restart: a brand-new agent is offered nothing but the
			// persisted backing blob and the URIs Agent Host owns.
			const second = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
			secondPeer = disposables.add(createTestPeer());
			connect(second, secondPeer);
			const signals: AgentSignal[] = [];
			disposables.add(second.onDidSessionProgress(signal => signals.push(signal)));

			const restoring = second.getSessionMetadata(session, receipt.chat?.providerData);
			const read = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: read.id, result: { thread: { id: 'codex-thread', cwd: folder.fsPath, modelProvider: 'vscode-proxy', turns: [] } } });
			await restoring;
			await second.materializeChat(chat, { session, resource: chat, kind: AgentChatKind.Session }, receipt.chat?.providerData);

			// Drive a turn on the restored chat and fail it at `turn/start`, so
			// the runtime has to route a chat action back to the chat it is
			// bound to. A runtime restored under an id nothing addresses it by
			// cannot find its own binding and drops the turn instead.
			const resending = second.chats.sendMessage(chat, 'again', [folder], undefined, 'turn-2', undefined, undefined, { session, resource: chat, kind: AgentChatKind.Session });
			const resume = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: resume.id, result: { thread: { id: 'codex-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const turn = await readNextRequest(secondPeer.outbound);
			secondPeer.push({ id: turn.id, error: { code: -32000, message: 'turn rejected' } });
			await resending;

			const restored = second['_sessions'].get('host-session');
			assert.deepStrictEqual({
				backingSessionId: JSON.parse(receipt.chat!.providerData!).sessionId,
				backingSession: receipt.chat?.backingSession?.toString(),
				restoredThreadId: restored?.threadId,
				restoredSessionUri: restored?.sessionUri.toString(),
				restoredChatChannel: restored?.chatChannel?.toString(),
				resume: { method: resume.method, threadId: resume.params.threadId },
				turnActions: signals.flatMap(signal => signal.kind === 'action'
					? [{ resource: signal.resource.toString(), type: signal.action.type }]
					: []),
			}, {
				// The runtime's own durable id — not the app-server thread id,
				// which the metadata overlay owns and a rematerialization
				// replaces.
				backingSessionId: 'host-session',
				backingSession: AgentSession.uri('codex', 'codex-thread').toString(),
				restoredThreadId: 'codex-thread',
				restoredSessionUri: session.toString(),
				restoredChatChannel: chat.toString(),
				resume: { method: 'thread/resume', threadId: 'codex-thread' },
				turnActions: [
					{ resource: chat.toString(), type: ActionType.ChatError },
					{ resource: chat.toString(), type: ActionType.ChatTurnComplete },
				],
			});
		} finally {
			firstPeer.dispose();
			secondPeer?.dispose();
		}
	});

	test('a restored runtime is addressed by the id its backing names, never by the session that asked for it', async () => {
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);
		const advertised: string[] = [];
		agent.setServerToolHost(createRecordingServerToolHost(advertised));

		try {
			// A backing that names a different runtime than the addressed
			// session — what a peer chat's blob looks like, and what any
			// re-keyed backing would look like after a restart.
			const addressed = AgentSession.uri('codex', 'addressed-session');
			const restoring = agent.getSessionMetadata(addressed, JSON.stringify({ sessionId: 'backing-runtime' }));
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: 'backing-thread', cwd: '/repo/addressed', turns: [] } } });
			const metadata = await restoring;

			const restored = agent['_sessions'].get('backing-runtime');
			assert.deepStrictEqual({
				metadataSession: metadata?.session.toString(),
				// The entry's own URI must round-trip to the key it is stored
				// under; stamping it with the addressed session would leave
				// every entry→map lookup pointing at a runtime that does not
				// exist.
				restoredSessionUri: restored?.sessionUri.toString(),
				restoredThreadId: restored?.threadId,
				addressedRuntimeExists: agent['_sessions'].has('addressed-session'),
				// Server tools are session-scoped, so they are advertised on
				// the session Agent Host addressed — the only URI it knows.
				advertised,
			}, {
				metadataSession: addressed.toString(),
				restoredSessionUri: AgentSession.uri('codex', 'backing-runtime').toString(),
				restoredThreadId: 'backing-thread',
				addressedRuntimeExists: false,
				advertised: [addressed.toString()],
			});
		} finally {
			peer.dispose();
		}
	});

	test('a live runtime answers metadata from memory with real timestamps instead of a 1970 placeholder', async () => {
		const sessionStore = createTestSessionStore();
		const session = AgentSession.uri('codex', 'live-session');
		const chat = URI.parse(buildDefaultChatUri(session));
		const folder = URI.file('/repo/live');
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			const before = Date.now();
			await materializeSession(agent, peer, session, chat, folder, 'live-thread');

			// No app-server traffic: the codex app-server cannot answer
			// `thread/read` for a thread of its own that is blocked waiting on a
			// dynamic tool call, which is exactly the state a session server
			// tool runs in.
			const metadata = await agent.getSessionMetadata(session, JSON.stringify({ sessionId: 'live-session' }));

			assert.deepStrictEqual({
				session: metadata?.session.toString(),
				workingDirectories: metadata?.workingDirectories?.map(directory => directory.fsPath),
				// Real clock values: `0` would date the session to 1970 and
				// invert the host's created-before / created-after filters.
				startedInThisRun: (metadata?.startTime ?? 0) >= before,
				modifiedAtOrAfterStart: (metadata?.modifiedTime ?? 0) >= (metadata?.startTime ?? 0),
			}, {
				session: session.toString(),
				workingDirectories: [folder.fsPath],
				startedInThisRun: true,
				modifiedAtOrAfterStart: true,
			});
		} finally {
			peer.dispose();
		}
	});

	test('a forked session hands back its backing on creation, since it never emits a first-send materialize receipt', async () => {
		const sessionStore = createTestSessionStore();
		const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
		const peer = disposables.add(createTestPeer());
		connect(agent, peer);

		try {
			const source = AgentSession.uri('codex', 'fork-source');
			const sourceChat = URI.parse(buildDefaultChatUri(source));
			const folder = URI.file('/repo/fork-backing');
			await materializeSession(agent, peer, source, sourceChat, folder, 'source-thread');

			const forkSession = AgentSession.uri('codex', 'fork-target');
			const forkChat = URI.parse(buildDefaultChatUri(forkSession));
			const forking = agent.chats.createSessionChat(forkChat, { session: forkSession, resource: forkChat, kind: AgentChatKind.Session }, {
				session: forkSession,
				fork: { session: source, chat: sourceChat, turnId: 'turn-1', turnIndex: 0 },
			});
			const read = await readNextRequest(peer.outbound);
			peer.push({ id: read.id, result: { thread: { id: 'source-thread', cwd: folder.fsPath, turns: [{ id: 'turn-1' }] } } });
			const fork = await readNextRequest(peer.outbound);
			peer.push({ id: fork.id, result: { thread: { id: 'forked-thread', cwd: folder.fsPath }, cwd: folder.fsPath } });
			const forked = await forking;

			assert.deepStrictEqual({
				session: forked.session.toString(),
				// The fork is materialized on return, so `onDidMaterializeSession`
				// never fires for it — the create result is the host's only
				// chance to persist a backing it can restore from.
				backingSessionId: forked.chat?.providerData ? JSON.parse(forked.chat.providerData).sessionId : undefined,
				// A session-backing runtime must not be reported as an internal
				// chat backing: that marker hides a session from `listSessions`.
				backingSession: forked.chat?.backingSession?.toString(),
				runtimeSessionUri: agent['_sessions'].get('forked-thread')?.sessionUri.toString(),
			}, {
				session: AgentSession.uri('codex', 'forked-thread').toString(),
				backingSessionId: 'forked-thread',
				backingSession: undefined,
				runtimeSessionUri: AgentSession.uri('codex', 'forked-thread').toString(),
			});
		} finally {
			peer.dispose();
		}
	});
});
