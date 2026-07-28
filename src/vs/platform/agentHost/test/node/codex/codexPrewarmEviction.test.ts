/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSession } from '../../../common/agentService.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
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

async function createAgent(disposables: Pick<DisposableStore, 'add'>): Promise<CodexAgent> {
	const models = [{ id: 'gpt-test', name: 'GPT Test', supported_endpoints: ['/responses'] }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, {
		_serviceBrand: undefined,
		onDidRootConfigChange: Event.None,
		getRootValue: () => undefined,
		getSessionConfigValues: () => undefined,
		isWorkingDirectoryPending: () => false,
		updateRootConfig: () => { },
	});
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined, isSdkResolvableWithoutDownload: async () => true });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, new NullLogService());
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
});
