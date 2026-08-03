/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import { Emitter } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { sep } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSession } from '../../../common/agentService.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import type { SandboxPolicy } from '../../../node/codex/protocol/generated/v2/SandboxPolicy.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
		readonly runtimeWorkspaceRoots?: readonly string[];
		readonly sandboxPolicy?: SandboxPolicy;
	};
}

interface ITestPeer {
	readonly transport: ICodexAppServerTransport;
	readonly outbound: PassThrough;
	push(message: object): void;
	exit(): void;
	dispose(): void;
}

function createTestPeer(): ITestPeer {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const onExit = new Emitter<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>();
	const onceExitListeners: ((event: { readonly code: number | null; readonly signal: NodeJS.Signals | null }) => void)[] = [];
	const fireExit = () => {
		const event = { code: 0, signal: null };
		onExit.fire(event);
		for (const listener of onceExitListeners.splice(0)) {
			listener(event);
		}
	};
	const transport: ICodexAppServerTransport = {
		stdin,
		stdout,
		kill: () => true,
		onExit: onExit.event,
		onExitOnce: listener => onceExitListeners.push(listener),
	};
	return {
		transport,
		outbound: stdin,
		push: message => stdout.write(JSON.stringify(message) + '\n'),
		exit: fireExit,
		dispose: () => {
			onceExitListeners.length = 0;
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
	readonly multiRootEnabled?: boolean;
	readonly sessionConfig?: Readonly<Record<string, boolean | string | readonly string[]>>;
	readonly database?: TestSessionDatabase;
}

class TestCodexConfigurationService extends AgentConfigurationService {
	constructor(
		stateManager: AgentHostStateManager,
		logService: NullLogService,
		private sessionConfig: Readonly<Record<string, boolean | string | readonly string[]>> | undefined,
	) {
		super(stateManager, logService);
	}

	setSessionConfig(sessionConfig: Readonly<Record<string, boolean | string | readonly string[]>>): void {
		this.sessionConfig = sessionConfig;
	}

	override getSessionConfigValues(): Record<string, unknown> | undefined {
		return this.sessionConfig ? { ...this.sessionConfig } : undefined;
	}
}

async function createAgent(disposables: Pick<DisposableStore, 'add'>, options: ICreateAgentOptions = {}): Promise<CodexAgent> {
	const models = [{ id: 'gpt-test', name: 'GPT Test', supported_endpoints: ['/responses'] }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new TestCodexConfigurationService(stateManager, logService, options.sessionConfig));
	configurationService.updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: options.multiRootEnabled });
	instantiationService.stub(ISessionDataService, createSessionDataService(options.database));
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined, isSdkResolvableWithoutDownload: async () => true });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, logService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	await agent.authenticate(agent.getProtectedResources()[0].resource, 'test-token');
	await agent.refreshModels();
	return agent;
}

async function assertPrewarmEvictedOnSend(disposables: Pick<DisposableStore, 'add'>, completePrewarmBeforeSend: boolean): Promise<void> {
	const agent = await createAgent(disposables);
	const peer = disposables.add(createTestPeer());
	const client = new CodexAppServerClient(peer.transport);
	agent['_connection'] = {
		kind: 'ready',
		client,
		usageSource: 'github',
		child: { kill: () => true },
	} as never;
	agent['_refreshSkillHookCustomizations'] = async () => { };
	agent['_refreshSkillExtraRoots'] = async () => { };

	const folder = URI.file('/repo/folder');
	const worktree = URI.file('/repo/worktree');
	const { session } = await agent.createSession({ workingDirectories: [folder], model: { id: 'gpt-test' } });
	const entry = agent['_sessions'].get(AgentSession.id(session))!;
	const folderStart = await readNextRequest(peer.outbound);

	try {
		if (completePrewarmBeforeSend) {
			peer.push({ id: folderStart.id, result: { thread: { id: 'thread-folder' } } });
			await entry.materializePromise;
		}

		const send = agent.chats.sendMessage(
			URI.parse(buildDefaultChatUri(session)),
			'hello',
			[worktree],
			undefined,
			'turn-1',
		);

		if (!completePrewarmBeforeSend) {
			peer.push({ id: folderStart.id, result: { thread: { id: 'thread-folder' } } });
		}
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const worktreeStart = await readNextRequest(peer.outbound);
		peer.push({ id: worktreeStart.id, result: { thread: { id: 'thread-worktree' } } });
		const turnStart = await readNextRequest(peer.outbound);
		peer.push({ id: turnStart.id, result: {} });
		await send;

		assert.deepStrictEqual({
			requests: [
				{ method: folderStart.method, cwd: folderStart.params.cwd },
				{ method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				{ method: worktreeStart.method, cwd: worktreeStart.params.cwd },
				{ method: turnStart.method, threadId: turnStart.params.threadId },
			],
			threadId: entry.threadId,
			workingDirectory: entry.workingDirectory?.fsPath,
			folderThreadRouted: agent['_sessionIdByThreadId'].has('thread-folder'),
			worktreeThreadRouted: agent['_sessionIdByThreadId'].has('thread-worktree'),
		}, {
			requests: [
				{ method: 'thread/start', cwd: folder.fsPath },
				{ method: 'thread/unsubscribe', threadId: 'thread-folder' },
				{ method: 'thread/start', cwd: worktree.fsPath },
				{ method: 'turn/start', threadId: 'thread-worktree' },
			],
			threadId: 'thread-worktree',
			workingDirectory: worktree.fsPath,
			folderThreadRouted: false,
			worktreeThreadRouted: true,
		});
	} finally {
		peer.exit();
	}
}

suite('CodexAgent prewarm eviction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('evicts a completed folder prewarm when the first send resolves to a worktree', async () => {
		await assertPrewarmEvictedOnSend(disposables, true);
	});

	test('waits for and evicts an in-flight folder prewarm when the first send resolves to a worktree', async () => {
		await assertPrewarmEvictedOnSend(disposables, false);
	});

	test('multi-root start and turn separate workspace roots from additional writable directories', async () => {
		const additionalDirectory = URI.file('/manual-write').fsPath;
		const sessionUri = AgentSession.uri('codex', 'multi-root');
		const agent = await createAgent(disposables, {
			multiRootEnabled: true,
			sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory, `${additionalDirectory}${sep}`] },
		});
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const duplicateRepoA = URI.file(`${repoA.fsPath}${sep}`);
		const caseVariantRepoA = URI.file(repoA.fsPath.toUpperCase());

		try {
			const workingDirectories = [repoA, duplicateRepoA, ...(isWindows ? [caseVariantRepoA] : []), repoB];
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories, model: { id: 'gpt-test' } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' }, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
			await entry.materializePromise;

			const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', workingDirectories, undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;
			const configurationService = agent['_configurationService'];
			assert.ok(configurationService instanceof TestCodexConfigurationService);
			configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: 'full-access' });
			const fullAccess = agent['_turnStartOptions'](entry, 'gpt-test');
			configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: 'read-only' });
			const readOnly = agent['_turnStartOptions'](entry, 'gpt-test');

			assert.deepStrictEqual({
				start: { cwd: start.params.cwd, runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots },
				turn: {
					runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
					sandboxPolicy: turn.params.sandboxPolicy,
				},
				fullAccess: {
					runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
					sandboxPolicy: fullAccess.sandboxPolicy,
				},
				readOnly: {
					runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
					sandboxPolicy: readOnly.sandboxPolicy,
				},
			}, {
				start: { cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] },
				turn: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					sandboxPolicy: {
						type: 'workspaceWrite',
						writableRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
						networkAccess: false,
						excludeTmpdirEnvVar: false,
						excludeSlashTmp: false,
					},
				},
				fullAccess: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					sandboxPolicy: { type: 'dangerFullAccess' },
				},
				readOnly: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					sandboxPolicy: { type: 'readOnly', networkAccess: false },
				},
			});
		} finally {
			peer.exit();
		}
	});

	test('disabled multi-root preserves the existing additional-directory payload', async () => {
		const additionalDirectory = URI.file('/manual-write').fsPath;
		const sessionUri = AgentSession.uri('codex', 'single-root');
		const agent = await createAgent(disposables, {
			sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] },
		});
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');

		try {
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repoA, repoB], model: { id: 'gpt-test' } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' } } });
			await entry.materializePromise;

			const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', [repoA], undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;

			assert.deepStrictEqual({
				startRuntimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
				turnRuntimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
				writableRoots: turn.params.sandboxPolicy?.type === 'workspaceWrite' ? turn.params.sandboxPolicy.writableRoots : undefined,
			}, {
				startRuntimeWorkspaceRoots: undefined,
				turnRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
				writableRoots: [repoA.fsPath, additionalDirectory],
			});
		} finally {
			peer.exit();
		}
	});

	test('enabled multi-root preserves single-folder protocol and sandbox behavior', async () => {
		const additionalDirectory = `${URI.file('/manual-write').fsPath}${sep}`;
		const sessionUri = AgentSession.uri('codex', 'enabled-single-root');
		const agent = await createAgent(disposables, {
			multiRootEnabled: true,
			sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] },
		});
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repo = URI.file('/repo');

		try {
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repo], model: { id: 'gpt-test' } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' } } });
			await entry.materializePromise;

			const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', [repo], undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;
			const configurationService = agent['_configurationService'];
			assert.ok(configurationService instanceof TestCodexConfigurationService);
			configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: 'full-access' });
			const fullAccess = agent['_turnStartOptions'](entry, 'gpt-test');
			configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: 'read-only' });
			const readOnly = agent['_turnStartOptions'](entry, 'gpt-test');

			assert.deepStrictEqual({
				start: {
					cwd: start.params.cwd,
					runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
				},
				turn: {
					runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
					sandboxPolicy: turn.params.sandboxPolicy,
				},
				fullAccess: {
					runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
					sandboxPolicy: fullAccess.sandboxPolicy,
				},
				readOnly: {
					runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
					sandboxPolicy: readOnly.sandboxPolicy,
				},
			}, {
				start: {
					cwd: repo.fsPath,
					runtimeWorkspaceRoots: undefined,
				},
				turn: {
					runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
					sandboxPolicy: {
						type: 'workspaceWrite',
						writableRoots: [repo.fsPath, additionalDirectory],
						networkAccess: false,
						excludeTmpdirEnvVar: false,
						excludeSlashTmp: false,
					},
				},
				fullAccess: {
					runtimeWorkspaceRoots: undefined,
					sandboxPolicy: { type: 'dangerFullAccess' },
				},
				readOnly: {
					runtimeWorkspaceRoots: undefined,
					sandboxPolicy: { type: 'readOnly', networkAccess: false },
				},
			});
		} finally {
			peer.exit();
		}
	});

	test('fork inherits the source workspace roots instead of requested replacements', async () => {
		const agent = await createAgent(disposables, { multiRootEnabled: true });
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const requestedA = URI.file('/requested-a');
		const requestedB = URI.file('/requested-b');

		try {
			const source = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: 'gpt-test' } });
			const sourceEntry = agent['_sessions'].get(AgentSession.id(source.session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'source-thread' }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
			await sourceEntry.materializePromise;

			const forkPromise = agent.createSession({
				workingDirectories: [requestedA, requestedB],
				fork: { session: source.session, turnId: 'turn-1', turnIndex: 0 },
			});
			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: {
					thread: {
						id: 'source-thread',
						cwd: repoA.fsPath,
						turns: [{ id: 'turn-1' }],
					},
				},
			});
			const fork = await readNextRequest(peer.outbound);
			peer.push({
				id: fork.id,
				result: {
					thread: { id: 'fork-thread', cwd: repoA.fsPath },
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				},
			});
			const forked = await forkPromise;
			const forkedEntry = agent['_sessions'].get(AgentSession.id(forked.session))!;

			assert.deepStrictEqual({
				request: {
					method: fork.method,
					cwd: fork.params.cwd,
					runtimeWorkspaceRoots: fork.params.runtimeWorkspaceRoots,
				},
				workingDirectories: forkedEntry.workingDirectories?.map(directory => directory.fsPath),
			}, {
				request: {
					method: 'thread/fork',
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				},
				workingDirectories: [repoA.fsPath, repoB.fsPath],
			});
		} finally {
			peer.exit();
		}
	});

	test('cold resume restores persisted workspace roots', async () => {
		const database = new TestSessionDatabase();
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const agentA = await createAgent(disposables, { multiRootEnabled: true, database });
		const peerA = disposables.add(createTestPeer());
		agentA['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peerA.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agentA['_refreshSkillHookCustomizations'] = async () => { };
		agentA['_refreshSkillExtraRoots'] = async () => { };
		let peerB: ITestPeer | undefined;

		try {
			const created = await agentA.createSession({ workingDirectories: [repoA, repoB], model: { id: 'gpt-test' } });
			const entry = agentA['_sessions'].get(AgentSession.id(created.session))!;
			const start = await readNextRequest(peerA.outbound);
			peerA.push({ id: start.id, result: { thread: { id: 'thread' }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
			await entry.materializePromise;
			const firstSend = agentA.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), 'hello', [repoA, repoB], undefined, 'turn-1');
			const firstTurn = await readNextRequest(peerA.outbound);
			peerA.push({ id: firstTurn.id, result: {} });
			await firstSend;
			await new Promise(resolve => setImmediate(resolve));
			const canonicalOverlay = await agentA['_metadataStore'].read(AgentSession.uri('codex', 'thread'));

			const agentB = await createAgent(disposables, { multiRootEnabled: true, database });
			peerB = disposables.add(createTestPeer());
			agentB['_connection'] = {
				kind: 'ready',
				client: new CodexAppServerClient(peerB.transport),
				usageSource: 'github',
				child: { kill: () => true },
			} as never;
			agentB['_refreshSkillHookCustomizations'] = async () => { };
			agentB['_refreshSkillExtraRoots'] = async () => { };

			const metadataPromise = agentB.getSessionMetadata(created.session);
			const read = await readNextRequest(peerB.outbound);
			peerB.push({
				id: read.id,
				result: {
					thread: {
						id: 'thread',
						cwd: repoA.fsPath,
						modelProvider: 'vscode-proxy',
						turns: [],
					},
				},
			});
			const metadata = await metadataPromise;

			const resumedSend = agentB.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), 'again', undefined, undefined, 'turn-2');
			const resume = await readNextRequest(peerB.outbound);
			peerB.push({
				id: resume.id,
				result: {
					thread: { id: 'thread', cwd: repoA.fsPath },
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				},
			});
			const resumedTurn = await readNextRequest(peerB.outbound);
			peerB.push({ id: resumedTurn.id, result: {} });
			await resumedSend;

			assert.deepStrictEqual({
				canonicalOverlay: canonicalOverlay.workingDirectories?.map(directory => directory.fsPath),
				metadata: metadata?.workingDirectories?.map(directory => directory.fsPath),
				resume: {
					cwd: resume.params.cwd,
					runtimeWorkspaceRoots: resume.params.runtimeWorkspaceRoots,
				},
				turnRuntimeWorkspaceRoots: resumedTurn.params.runtimeWorkspaceRoots,
			}, {
				canonicalOverlay: [repoA.fsPath, repoB.fsPath],
				metadata: [repoA.fsPath, repoB.fsPath],
				resume: {
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				},
				turnRuntimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
			});
		} finally {
			peerB?.exit();
			peerA.exit();
		}
	});
});
