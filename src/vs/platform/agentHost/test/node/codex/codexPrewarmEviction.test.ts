/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { join, sep } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService, type ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { PluginFormat, type IParsedPlugin } from '../../../../agentPlugins/common/pluginParsers.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { AgentSession, type AgentSignal, type IAgentChatContext, type IAgentCreateChatOptions, type IAgentCreateChatResult } from '../../../common/agent.js';
import { IAgentPluginManager } from '../../../common/agentPluginManager.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, parseChatUri, readSessionWorkspaceless, ResponsePartKind, type StringOrMarkdown } from '../../../common/state/sessionState.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, type Customization } from '../../../common/state/protocol/channels-session/state.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { SessionServerToolName } from '../../../common/serverToolNames.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../../node/shared/worktreeIsolation.js';
import { IAgentHostCustomizationEnablementService, type CustomizationEnablementResolution } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { CODEX_FILE_LINK_INSTRUCTIONS, type ICodexClientPlugin } from '../../../node/codex/codexClientCustomizations.js';
import { codexSkillsToContainers } from '../../../node/codex/codexCustomizations.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { buildMcpChannel } from '../../../node/shared/mcpCustomizationController.js';
import { AGENT_HOST_WORKSPACELESS_INSTRUCTIONS } from '../../../node/shared/workspacelessInstructions.js';
import { sessionServerToolDefinitions, sessionToolRequiresConfirmation } from '../../../node/shared/sessionServerTools.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import type { SelectedCapabilityRoot } from '../../../node/codex/protocol/generated/v2/SelectedCapabilityRoot.js';
import type { ConfigEdit } from '../../../node/codex/protocol/generated/v2/ConfigEdit.js';
import { createSessionDataService, RecordingCheckpointService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';
import { RecordingAgentSdkDownloader } from '../testAgentSdkDownloader.js';

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
		readonly includeTurns?: boolean;
		readonly cursor?: string | null;
		readonly limit?: number;
		readonly sortDirection?: 'asc' | 'desc';
		readonly itemsView?: 'notLoaded' | 'summary' | 'full';
		readonly runtimeWorkspaceRoots?: readonly string[];
		readonly model?: string;
		readonly modelProvider?: string;
		readonly approvalPolicy?: string;
		readonly approvalsReviewer?: string;
		readonly selectedCapabilityRoots?: readonly SelectedCapabilityRoot[];
		readonly extraRoots?: readonly string[];
		readonly permissions?: string;
		readonly config?: Record<string, unknown>;
		readonly effort?: string;
		readonly developerInstructions?: string;
		readonly edits?: readonly ConfigEdit[];
		readonly expectedVersion?: string;
		readonly reloadUserConfig?: boolean;
		readonly collaborationMode?: { readonly settings: { readonly developer_instructions: string | null; readonly reasoning_effort?: string | null } };
	};
}

const COPILOT_TEST_MODEL = toCodexModelSelectionId('vscode-proxy', 'gpt-test');
const OPENAI_TEST_MODEL = toCodexModelSelectionId('openai', 'gpt-5.6-sol');
const PLUGIN_SKILLS_ROOT = URI.file('/plugin/skills').fsPath;

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
	readonly telemetryService?: ITelemetryService;
	readonly multiRootEnabled?: boolean;
	readonly sessionConfig?: Readonly<Record<string, boolean | string | readonly string[]>>;
	readonly database?: TestSessionDatabase;
	readonly checkpointService?: IAgentHostCheckpointService;
	readonly customizationEnablementService?: IAgentHostCustomizationEnablementService;
}

class TestCodexLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
	}
}

class TestCodexTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];

	override publicLog2(name?: string, data?: ITelemetryData): void {
		this.events.push({ name, data });
	}
}

class TestCodexFileService extends FileService {
	private readonly statFailures = new Set<string>();

	failStat(resource: URI): void {
		this.statFailures.add(resource.toString());
	}

	override stat(resource: URI): ReturnType<FileService['stat']> {
		if (this.statFailures.has(resource.toString())) {
			return Promise.reject(new Error(`sensitive path: ${resource.fsPath}`));
		}
		return super.stat(resource);
	}
}

class TestCodexConfigurationService extends AgentConfigurationService {
	constructor(
		stateManager: AgentHostStateManager,
		logService: TestCodexLogService,
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
	const models = [{ id: 'gpt-test', name: 'GPT Test', model_picker_enabled: true, supported_endpoints: ['/responses'], vendor: 'OpenAI' }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	const logService = new TestCodexLogService();
	const fileService = disposables.add(new TestCodexFileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new TestCodexConfigurationService(stateManager, logService, options.sessionConfig));
	configurationService.updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: options.multiRootEnabled });
	instantiationService.stub(ISessionDataService, createSessionDataService(options.database));
	instantiationService.stub(IAgentPluginManager, {
		_serviceBrand: undefined,
		basePath: URI.file('/plugins'),
		syncCustomizations: async (_clientId, customizations) => customizations.map(customization => ({ customization })),
	});
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation());
	instantiationService.stub(IAgentHostStateManager, stateManager);
	instantiationService.stub(IAgentHostCustomizationEnablementService, options.customizationEnablementService ?? createNoopCustomizationEnablementService());
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentHostProxyResolver, createTestAgentHostProxyResolver());
	instantiationService.stub(IAgentSdkDownloader, new RecordingAgentSdkDownloader());
	instantiationService.stub(IAgentHostCheckpointService, options.checkpointService ?? NULL_CHECKPOINT_SERVICE);
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
	instantiationService.stub(ITelemetryService, options.telemetryService ?? NullTelemetryService);
	const agent = disposables.add(instantiationService.createInstance(CodexAgent));
	agent['_probeAccountAtStartup'] = async () => { };
	agent['_activated'] = true;
	await agent.authenticate(agent.getProtectedResources()[0].resource, 'test-token');
	await agent.refreshModels();
	return agent;
}

/** The deterministic session-backed chat URI Agent Host mints for `session`. */
function defaultChatOf(session: URI): URI {
	return URI.parse(buildDefaultChatUri(session));
}

function chatOf(session: URI, chatId: string): URI {
	return URI.parse(buildChatUri(session, chatId));
}

function chatContext(session: URI, chat: URI): IAgentChatContext {
	return { configurationResource: session, resource: chat };
}

/**
 * Provision a session by creating its first chat through the single
 * {@link IAgentChats.createChat} seam, already addressed by the exact chat URI
 * Agent Host minted. The provider result never echoes a session identity back,
 * so the `session` field returned here is this helper's own synthesized value.
 */
async function createSession(agent: CodexAgent, options: IAgentCreateChatOptions & { readonly session?: URI } = {}): Promise<IAgentCreateChatResult & { readonly session: URI }> {
	const { session: requestedSession, ...chatOptions } = options;
	const session = requestedSession ?? AgentSession.uri(agent.id, generateUuid());
	const chat = defaultChatOf(session);
	const result = await agent.chats.createChat(chat, { configurationResource: session, resource: chat }, { deferBacking: !chatOptions.fork && !chatOptions.importConversation, ...chatOptions });
	return { ...result, session };
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
	const { session } = await createSession(agent, { workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
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

	test('prewarm expiry reapplies the global MCP inventory', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')], model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		entry.threadId = 'prewarm-thread';
		agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);
		const controller = agent['_getOrCreateMcpController'](entry);
		assert.ok(controller);
		agent['_mcpInventory'].setState(null, 'global', { kind: McpServerStatus.Ready });
		agent['_mcpInventory'].setState(entry.threadId, 'workspace', { kind: McpServerStatus.Ready });
		agent['_applyMcpInventoryToSession'](entry);
		const before = controller.topLevelCustomizations().map(customization => customization.name).sort();

		const expiring = agent['_expirePrewarm'](entry);
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		await expiring;

		assert.deepStrictEqual({
			before,
			unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
			after: controller.topLevelCustomizations().map(customization => customization.name).sort(),
		}, {
			before: ['global', 'workspace'],
			unsubscribe: { method: 'thread/unsubscribe', threadId: 'prewarm-thread' },
			after: ['global'],
		});
		peer.exit();
	});

	test('MCP invalidation during customization launch restarts before the first turn', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')], model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const customizationLaunchStarted = new DeferredPromise<void>();
		const releaseCustomizationLaunch = new DeferredPromise<void>();
		let sendError: string | undefined;
		const readRequest = async (label: string) => {
			try {
				return await readNextRequest(peer.outbound);
			} catch (error) {
				throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}; sendError=${sendError ?? '(none)'}; threadId=${entry.threadId ?? '(none)'}`);
			}
		};
		const sending = agent.chats.sendMessage(defaultChatOf(session), 'hello', undefined, undefined, 'turn-1');
		void sending.catch(error => { sendError = error instanceof Error ? error.message : String(error); });
		const initialStart = await readRequest('initial thread/start');
		agent['_buildCustomizationLaunch'] = async () => {
			if (!customizationLaunchStarted.isSettled) {
				customizationLaunchStarted.complete();
			}
			await releaseCustomizationLaunch.p;
			return {
				config: {},
				developerInstructions: 'Use current instructions.',
				selectedCapabilityRoots: [],
				signature: entry.materializedCustomizationsSig ?? '',
			};
		};
		peer.push({ id: initialStart.id, result: { thread: { id: 'stale-thread' } } });
		await customizationLaunchStarted.p;
		entry.materializedMcpSig = undefined;
		releaseCustomizationLaunch.complete();

		const unsubscribe = await readRequest('stale thread/unsubscribe');
		assert.deepStrictEqual({ method: unsubscribe.method, threadId: unsubscribe.params.threadId }, { method: 'thread/unsubscribe', threadId: 'stale-thread' });
		peer.push({ id: unsubscribe.id, result: {} });
		const replacementStart = await readRequest('replacement thread/start');
		peer.push({ id: replacementStart.id, result: { thread: { id: 'current-thread' } } });
		const turn = await readRequest('turn/start');
		peer.push({ id: turn.id, result: {} });
		await sending;

		assert.deepStrictEqual([
			{ method: initialStart.method },
			{ method: unsubscribe.method, threadId: unsubscribe.params.threadId },
			{ method: replacementStart.method },
			{ method: turn.method, threadId: turn.params.threadId, developerInstructions: turn.params.collaborationMode?.settings.developer_instructions },
		], [
			{ method: 'thread/start' },
			{ method: 'thread/unsubscribe', threadId: 'stale-thread' },
			{ method: 'thread/start' },
			{ method: 'turn/start', threadId: 'current-thread', developerInstructions: 'Use current instructions.' },
		]);
		peer.exit();
	});

	test('lists Codex Desktop chats without a chosen folder as workspace-less', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const userHome = agent['_environmentService'].userHome;
		const generatedWorkspace = URI.joinPath(userHome, 'Documents', 'Codex', '2026-08-11', 'this');
		const selectedWorkspace = URI.file(join(sep, 'repo', 'codex'));
		const sessionsDirectory = URI.joinPath(userHome, '.codex', 'sessions', '2026', '08', '11');
		await agent['_fileService'].createFolder(sessionsDirectory);

		const desktopGeneratedRollout = URI.joinPath(sessionsDirectory, 'desktop-generated.jsonl');
		const desktopSelectedRollout = URI.joinPath(sessionsDirectory, 'desktop-selected.jsonl');
		const vscodeGeneratedRollout = URI.joinPath(sessionsDirectory, 'vscode-generated.jsonl');
		await Promise.all([
			agent['_fileService'].createFile(desktopGeneratedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{"originator":"Codex Desktop"}}\n')),
			agent['_fileService'].createFile(desktopSelectedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{"originator":"Codex Desktop"}}\n')),
			agent['_fileService'].createFile(vscodeGeneratedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{}}\n')),
		]);

		const listing = agent['_listCodexChats']();
		const request = await readNextRequest(peer.outbound);
		peer.push({
			id: request.id,
			result: {
				data: [
					{ id: 'desktop-generated', cwd: generatedWorkspace.fsPath, path: desktopGeneratedRollout.fsPath, source: 'vscode', modelProvider: 'openai', createdAt: 1, updatedAt: 2, name: 'Desktop generated' },
					{ id: 'desktop-selected', cwd: selectedWorkspace.fsPath, path: desktopSelectedRollout.fsPath, source: 'vscode', modelProvider: 'openai', createdAt: 3, updatedAt: 4, name: 'Desktop selected' },
					{ id: 'vscode-generated', cwd: generatedWorkspace.fsPath, path: vscodeGeneratedRollout.fsPath, source: 'vscode', modelProvider: 'openai', createdAt: 5, updatedAt: 6, name: 'VS Code generated' },
				],
				nextCursor: null,
			}
		});

		const chats = await listing;
		assert.ok(chats);
		assert.deepStrictEqual(chats.map(chat => ({
			id: AgentSession.id(parseChatUri(chat.chat)!.session),
			workspaceless: readSessionWorkspaceless(chat._meta),
			workingDirectories: chat.workingDirectories?.map(directory => directory.fsPath),
		})), [
			{ id: 'desktop-generated', workspaceless: true, workingDirectories: [generatedWorkspace.fsPath] },
			{ id: 'desktop-selected', workspaceless: false, workingDirectories: [selectedWorkspace.fsPath] },
			{ id: 'vscode-generated', workspaceless: false, workingDirectories: [generatedWorkspace.fsPath] },
		]);
		peer.exit();
	});

	test('bounds concurrent Codex Desktop rollout inspections while listing chats', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const release = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		let active = 0;
		let maximum = 0;
		agent['_readCodexDesktopRolloutPrefix'] = async () => {
			active++;
			maximum = Math.max(maximum, active);
			if (active === 8) {
				saturated.complete();
			}
			await release.p;
			active--;
			return null;
		};

		const listing = agent['_listCodexChats']();
		const request = await readNextRequest(peer.outbound);
		peer.push({
			id: request.id,
			result: {
				data: Array.from({ length: 32 }, (_, index) => ({
					id: `desktop-${index}`,
					cwd: `/workspace/${index}`,
					path: `/rollout/${index}.jsonl`,
					source: 'vscode',
					modelProvider: 'openai',
					createdAt: index,
					updatedAt: index,
				})),
				nextCursor: null,
			},
		});

		await saturated.p;
		assert.strictEqual(active, 8);
		release.complete();
		const chats = await listing;
		assert.deepStrictEqual({ maximum, count: chats?.length }, { maximum: 8, count: 32 });
		peer.exit();
	});

	test('bounds concurrent cold session reads', async () => {
		const agent = await createAgent(disposables);
		const release = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		let active = 0;
		let maximum = 0;
		agent['_doReadSession'] = async () => {
			active++;
			maximum = Math.max(maximum, active);
			if (active === 8) {
				saturated.complete();
			}
			await release.p;
			active--;
			return undefined;
		};

		const reads = Promise.all(Array.from({ length: 32 }, (_, index) =>
			agent['_readSession'](AgentSession.uri(agent.id, `session-${index}`))));
		await saturated.p;
		assert.strictEqual(active, 8);
		release.complete();
		await reads;
		assert.strictEqual(maximum, 8);
	});

	test('session actions target the owning session after the chat is bound', async () => {
		const agent = await createAgent(disposables);
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')] });

		agent['_fire'](session, { type: ActionType.SessionActivityChanged, activity: 'Working' });

		assert.deepStrictEqual(signals.map(signal => signal.kind === 'action' ? {
			resource: signal.resource.toString(),
			type: signal.action.type,
		} : undefined), [{
			resource: session.toString(),
			type: ActionType.SessionActivityChanged,
		}]);
	});

	test('shutdown clears retained runtime lookup state', async () => {
		const agent = await createAgent(disposables);
		const configurationResource = AgentSession.uri('codex', 'cleanup');
		const chat = defaultChatOf(configurationResource);
		const configurationKey = configurationResource.toString();
		const created = await createSession(agent, { session: configurationResource });
		const runtime = agent['_sessions'].get(AgentSession.id(created.session))!;
		runtime.threadId = 'shutdown-prewarm';
		runtime.prewarmClaimed = false;
		let postShutdownConnections = 0;
		agent['_ensureConnection'] = async () => {
			postShutdownConnections++;
			return { client: { request: async () => ({}) } } as never;
		};
		runtime.prewarmTimer = setTimeout(() => { void agent['_expirePrewarm'](runtime); }, 0);
		agent['_desktopThreadIds'].add('desktop-thread');
		agent['_sessionIdByChatUri'].set(chat.toString(), 'runtime');
		agent['_sessionIdByThreadId'].set('thread', 'runtime');
		agent['_releasedManagedWorkingDirectories'].set('runtime', URI.file('/managed'));
		agent['_configScopeChats'].set(configurationKey, new Set([chat.toString()]));
		agent['_configScopeByChat'].set(chat.toString(), configurationKey);
		agent['_mcpPublisherSessionIdByConfiguration'].set(configurationKey, 'runtime');
		agent['_publishedMcpTopLevelIdsByConfiguration'].set(configurationKey, new Set(['mcp']));
		agent['_pendingMcpStartupStatuses'].set('thread', []);
		agent['_mcpAuthTokens'].set('https://example.com/mcp', 'token');
		agent['_mcpAuthServerUrlsByResource'].set('https://example.com/', new Set(['https://example.com/mcp']));
		agent.getOrCreateActiveClient(chat, { configurationResource, resource: chat }, { clientId: 'client' });

		await agent.shutdown();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			runtimeDisposed: runtime.disposed,
			prewarmTimer: runtime.prewarmTimer,
			postShutdownConnections,
			desktopThreads: agent['_desktopThreadIds'].size,
			activeClients: agent['_activeClientHandles'].size,
			chatBindings: agent['_sessionIdByChatUri'].size,
			threadBindings: agent['_sessionIdByThreadId'].size,
			releasedDirectories: agent['_releasedManagedWorkingDirectories'].size,
			configurationScopes: agent['_configScopeChats'].size,
			chatScopes: agent['_configScopeByChat'].size,
			mcpPublishers: agent['_mcpPublisherSessionIdByConfiguration'].size,
			publishedMcpServers: agent['_publishedMcpTopLevelIdsByConfiguration'].size,
			pendingMcpStatuses: agent['_pendingMcpStartupStatuses'].size,
			mcpAuthTokens: agent['_mcpAuthTokens'].size,
			mcpAuthResources: agent['_mcpAuthServerUrlsByResource'].size,
		}, {
			runtimeDisposed: true,
			prewarmTimer: undefined,
			postShutdownConnections: 0,
			desktopThreads: 0,
			activeClients: 0,
			chatBindings: 0,
			threadBindings: 0,
			releasedDirectories: 0,
			configurationScopes: 0,
			chatScopes: 0,
			mcpPublishers: 0,
			publishedMcpServers: 0,
			pendingMcpStatuses: 0,
			mcpAuthTokens: 0,
			mcpAuthResources: 0,
		});
	});

	test('shutdown rejects an exact-chat lifecycle operation that was still queued', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'queued-after-shutdown');
		const chat = defaultChatOf(session);
		const blockerStarted = new DeferredPromise<void>();
		const releaseBlocker = new DeferredPromise<void>();
		const blocker = agent['_chatLifecycleSequencer'].queue(chat.toString(), async () => {
			blockerStarted.complete();
			await releaseBlocker.p;
		});
		await blockerStarted.p;
		const queuedCreate = agent.chats.createChat(chat, chatContext(session, chat), { deferBacking: true });

		await agent.shutdown();
		releaseBlocker.complete();
		await blocker;
		await assert.rejects(queuedCreate);

		assert.deepStrictEqual({
			sessions: agent['_sessions'].size,
			chatBindings: agent['_sessionIdByChatUri'].size,
			connection: agent['_connection'].kind,
		}, {
			sessions: 0,
			chatBindings: 0,
			connection: 'idle',
		});
	});

	test('peer client customization publication and removal target the owning session and reload MCP state', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		let skillRootRefreshes = 0;
		agent['_refreshSkillExtraRoots'] = async () => { skillRootRefreshes++; };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = chatOf(parent.session, 'customizations');
		const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'thread-customizations' } } });
		await creating;
		const entry = agent['_sessions'].get('thread-customizations')!;
		const parentEntry = agent['_sessions'].get(AgentSession.id(parent.session))!;
		const pluginDir = URI.file('/plugin');
		const clientPlugin = {
			synced: { customization: { type: CustomizationType.Plugin, id: 'plugin', uri: pluginDir.toString(), name: 'plugin' }, pluginDir },
			parsed: {
				format: PluginFormat.OpenPlugin,
				hooks: [],
				agents: [],
				instructions: [],
				skills: [],
				mcpServers: [{
					name: 'local',
					uri: URI.file('/plugin/.mcp.json'),
					configuration: { type: McpServerType.LOCAL, command: 'node' },
					customization: { type: CustomizationType.McpServer, id: 'mcp', uri: 'file:///plugin/.mcp.json', name: 'local', state: { kind: McpServerStatus.Starting } },
				}],
			},
		} satisfies ICodexClientPlugin;
		entry.clientCustomizations.setClient('client-1', [clientPlugin]);
		parentEntry.clientCustomizations.setClient('client-1', [{
			...clientPlugin,
			synced: {
				...clientPlugin.synced,
				customization: { ...clientPlugin.synced.customization, name: 'owner-plugin' },
			},
		}]);
		entry.firstTurnSent = true;
		entry.materializedMcpSig = 'materialized-with-plugin';
		entry.materializedCustomizationsSig = (await agent['_buildCustomizationLaunch'](entry)).signature;
		agent.getOrCreateActiveClient(chat, { configurationResource: parent.session, resource: chat }, { clientId: 'client-1' });
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		agent['_publishClientCustomizationsForConfiguration'](entry.configurationResource);
		agent.removeActiveClient(chat, { configurationResource: parent.session, resource: chat }, 'client-1');
		await agent['_reconcileMaterializedCustomizations'](entry);
		const removedWhileSiblingContributed = signals.some(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationRemoved);
		await agent['_removeClientCustomizations'](parentEntry, 'client-1', []);

		const customizationActions = signals.filter(signal => signal.kind === 'action'
			&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved));
		assert.deepStrictEqual({
			actions: customizationActions.map(signal => signal.kind === 'action' ? {
				resource: signal.resource.toString(),
				type: signal.action.type,
				name: signal.action.type === ActionType.SessionCustomizationUpdated ? signal.action.customization.name : undefined,
			} : undefined),
			removedWhileSiblingContributed,
			customizationsEmpty: entry.clientCustomizations.isEmpty() && parentEntry.clientCustomizations.isEmpty(),
			needsResume: entry.needsResume,
			unsubscribeBeforeResume: entry.unsubscribeBeforeResume,
			skillRootRefreshes,
		}, {
			actions: [
				{ resource: parent.session.toString(), type: ActionType.SessionCustomizationUpdated, name: 'owner-plugin' },
				{ resource: parent.session.toString(), type: ActionType.SessionCustomizationUpdated, name: 'owner-plugin' },
				{ resource: parent.session.toString(), type: ActionType.SessionCustomizationRemoved, name: undefined },
			],
			removedWhileSiblingContributed: false,
			customizationsEmpty: true,
			needsResume: true,
			unsubscribeBeforeResume: true,
			skillRootRefreshes: 2,
		});
	});

	test('replacing a client customization snapshot removes plugins absent from the replacement', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const { session } = await createSession(agent);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));
		const customization = {
			type: CustomizationType.Plugin,
			id: 'plugin-a',
			uri: 'https://plugin-a',
			name: 'Plugin A',
		} as const;

		await agent['_syncClientCustomizations'](entry.sessionUri, 'client-1', [customization]);
		await agent['_syncClientCustomizations'](entry.sessionUri, 'client-1', []);

		assert.deepStrictEqual(signals.flatMap(signal => signal.kind === 'action'
			&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved)
			? [{
				resource: signal.resource.toString(),
				type: signal.action.type,
				id: signal.action.type === ActionType.SessionCustomizationUpdated ? signal.action.customization.id : signal.action.id,
			}]
			: []), [
			{ resource: session.toString(), type: ActionType.SessionCustomizationUpdated, id: customization.id },
			{ resource: session.toString(), type: ActionType.SessionCustomizationRemoved, id: customization.id },
		]);
	});

	test('owning runtime MCP state takes precedence over peer state in the shared session', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = chatOf(parent.session, 'mcp-owner');
		const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'thread-mcp-peer' } } });
		await creating;
		const ownerEntry = agent['_sessions'].get(AgentSession.id(parent.session))!;
		const peerEntry = agent['_sessions'].get('thread-mcp-peer')!;
		agent['_getOrCreateMcpController'](peerEntry);
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		agent['_mcpInventory'].setState(peerEntry.threadId!, 'shared', {
			kind: McpServerStatus.Error,
			error: { errorType: 'peer-error', message: 'peer failed' },
		});
		agent['_applyMcpInventoryToSession'](peerEntry);
		const ownerController = agent['_getOrCreateMcpController'](ownerEntry);
		assert.ok(ownerController);
		assert.ok(ownerEntry.chatChannel);
		const ownerMcpChannel = buildMcpChannel(ownerEntry.chatChannel, 'shared');
		ownerController.applyAll([{ name: 'shared', state: { kind: McpServerStatus.Ready } }]);
		ownerEntry.disposed = true;
		agent['_sessions'].delete(ownerEntry.sessionId);
		agent['_releaseMcpPublisher'](ownerEntry);
		ownerController.dispose();

		const actions = signals.flatMap(signal => signal.kind === 'action'
			&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved)
			? [{
				resource: signal.resource.toString(),
				type: signal.action.type,
				customization: signal.action.type === ActionType.SessionCustomizationUpdated ? {
					name: signal.action.customization.name,
					state: signal.action.customization.type === CustomizationType.McpServer ? signal.action.customization.state.kind : undefined,
					channel: signal.action.customization.type === CustomizationType.McpServer ? signal.action.customization.channel : undefined,
				} : undefined,
			}]
			: []);
		assert.deepStrictEqual({
			actions,
			publisherSessionId: agent['_sessionForMcpControl'](parent.session)?.sessionId,
		}, {
			actions: [
				{
					resource: parent.session.toString(),
					type: ActionType.SessionCustomizationUpdated,
					customization: {
						name: 'shared',
						state: McpServerStatus.Error,
						channel: undefined,
					},
				},
				{
					resource: parent.session.toString(),
					type: ActionType.SessionCustomizationRemoved,
					customization: undefined,
				},
				{
					resource: parent.session.toString(),
					type: ActionType.SessionCustomizationUpdated,
					customization: {
						name: 'shared',
						state: McpServerStatus.Ready,
						channel: ownerMcpChannel,
					},
				},
				{
					resource: parent.session.toString(),
					type: ActionType.SessionCustomizationRemoved,
					customization: undefined,
				},
				{
					resource: parent.session.toString(),
					type: ActionType.SessionCustomizationUpdated,
					customization: {
						name: 'shared',
						state: McpServerStatus.Error,
						channel: undefined,
					},
				},
			],
			publisherSessionId: peerEntry.sessionId,
		});
	});

	test('customization reconciliation is serialized per runtime', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const { session } = await createSession(agent);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		let active = 0;
		let calls = 0;
		let maximumActive = 0;
		agent['_doReconcileMaterializedCustomizations'] = async () => {
			calls++;
			active++;
			maximumActive = Math.max(maximumActive, active);
			if (calls === 1) {
				firstStarted.complete();
				await releaseFirst.p;
			}
			active--;
		};

		const first = agent['_reconcileMaterializedCustomizations'](entry);
		await firstStarted.p;
		const second = agent['_reconcileMaterializedCustomizations'](entry);
		await new Promise(resolve => setImmediate(resolve));
		const callsWhileFirstActive = calls;
		releaseFirst.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({ callsWhileFirstActive, calls, maximumActive }, {
			callsWhileFirstActive: 1,
			calls: 2,
			maximumActive: 1,
		});
	});

	test('immediately releases, restores, and sends a workspace-less peer before metadata flushes', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const metadataWrite = new DeferredPromise<void>();
		agent['_metadataStore'].write = async () => metadataWrite.p;
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = chatOf(parent.session, 'workspace-less');
		const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'thread-peer' } } });
		const created = await creating;
		assert.ok(created);
		const peerEntry = agent['_sessions'].get('thread-peer')!;
		const managedDirectory = peerEntry.managedWorkingDirectory;
		assert.ok(managedDirectory);
		const backingSession = created.backingSession;
		assert.ok(backingSession);

		const releasing = agent.chats.releaseChat?.(chat, chatContext(parent.session, chat));
		const releaseUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: releaseUnsubscribe.id, result: {} });
		await releasing;
		assert.strictEqual(fs.existsSync(managedDirectory.fsPath), true);

		await agent.materializeChat(chat, parent.session, created.providerData);
		const restoredEntry = agent['_sessions'].get('thread-peer')!;
		const sending = agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-peer');
		const read = await readNextRequest(peer.outbound);
		peer.push({ id: read.id, result: { thread: { id: 'thread-peer', modelProvider: 'vscode-proxy' } } });
		const reloadUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: reloadUnsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		peer.push({
			id: resume.id,
			result: {
				thread: { id: 'thread-peer', cwd: managedDirectory.fsPath },
				cwd: managedDirectory.fsPath,
			},
		});
		const inventory = await readNextRequest(peer.outbound);
		peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await sending;

		assert.deepStrictEqual({
			start: { method: start.method, cwd: start.params.cwd },
			release: { method: releaseUnsubscribe.method, threadId: releaseUnsubscribe.params.threadId },
			read: { method: read.method, threadId: read.params.threadId },
			reload: { method: reloadUnsubscribe.method, threadId: reloadUnsubscribe.params.threadId },
			resume: { method: resume.method, threadId: resume.params.threadId },
			inventory: { method: inventory.method, threadId: inventory.params.threadId },
			turn: { method: turn.method, threadId: turn.params.threadId },
			parentMaterialized: agent['_sessions'].get(AgentSession.id(parent.session))?.threadId,
			parentOwnsManagedDirectory: agent['_sessions'].get(AgentSession.id(parent.session))?.managedWorkingDirectory?.fsPath,
			restoredPeerOwnsManagedDirectory: restoredEntry.managedWorkingDirectory?.fsPath,
			managedDirectoryExists: fs.existsSync(managedDirectory.fsPath),
		}, {
			start: { method: 'thread/start', cwd: managedDirectory.fsPath },
			release: { method: 'thread/unsubscribe', threadId: 'thread-peer' },
			read: { method: 'thread/read', threadId: 'thread-peer' },
			reload: { method: 'thread/unsubscribe', threadId: 'thread-peer' },
			resume: { method: 'thread/resume', threadId: 'thread-peer' },
			inventory: { method: 'mcpServerStatus/list', threadId: 'thread-peer' },
			turn: { method: 'turn/start', threadId: 'thread-peer' },
			parentMaterialized: undefined,
			parentOwnsManagedDirectory: undefined,
			restoredPeerOwnsManagedDirectory: managedDirectory.fsPath,
			managedDirectoryExists: true,
		});

		const disposing = agent.chats.disposeChat(chat, chatContext(parent.session, chat));
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		await disposing;
		assert.strictEqual(fs.existsSync(managedDirectory.fsPath), false);
		await metadataWrite.complete(undefined);
		peer.exit();
	});

	test('cold chat restore waits for model refresh before validating its provider-qualified model', async () => {
		const agent = await createAgent(disposables);
		const catalogModel = {
			...agent.models.get()[0],
			provider: 'chatgpt',
			id: toCodexModelSelectionId('openai', 'gpt-test'),
		};
		const selectedModel = { id: catalogModel.id, config: { reasoningEffort: 'high' } };
		const refresh = new DeferredPromise<void>();
		agent['_models'].set([], undefined);
		agent['_modelsRefreshPromise'] = refresh.p;
		const parent = AgentSession.uri('codex', 'parent');
		const chat = chatOf(parent, 'restored');

		const materializing = agent.materializeChat(chat, parent, JSON.stringify({
			sessionId: 'restored-peer',
			model: selectedModel,
		}));
		await Promise.resolve();
		assert.strictEqual(agent['_sessions'].has('restored-peer'), false);

		agent['_models'].set([catalogModel], undefined);
		agent['_modelsRefreshPromise'] = undefined;
		await refresh.complete(undefined);
		await materializing;

		assert.deepStrictEqual(agent['_sessions'].get('restored-peer')?.model, selectedModel);
	});

	test('cold chat restore refreshes an empty model catalog before validation', async () => {
		const agent = await createAgent(disposables);
		const selectedModel = { id: COPILOT_TEST_MODEL, config: { reasoningEffort: 'high' } };
		agent['_models'].set([], undefined);
		assert.strictEqual(agent['_modelsRefreshPromise'], undefined);

		await agent.materializeChat(
			chatOf(AgentSession.uri('codex', 'parent'), 'restored-empty-catalog'),
			AgentSession.uri('codex', 'parent'),
			JSON.stringify({ sessionId: 'restored-empty-catalog', model: selectedModel }),
		);

		assert.deepStrictEqual(agent['_sessions'].get('restored-empty-catalog')?.model, selectedModel);
	});

	test('cold chat restore prefers the latest persisted model over its creation backing', async () => {
		const database = new TestSessionDatabase();
		const agent = await createAgent(disposables, { database });
		const baseModel = agent.models.get()[0];
		const creationModel = { id: 'creation-model' };
		const persistedModel = { id: 'persisted-model' };
		agent['_models'].set([
			{ ...baseModel, id: creationModel.id },
			{ ...baseModel, id: persistedModel.id },
		], undefined);
		await database.setMetadata('codex.model', persistedModel.id);

		await agent.materializeChat(
			chatOf(AgentSession.uri('codex', 'parent'), 'restored-updated-model'),
			AgentSession.uri('codex', 'parent'),
			JSON.stringify({ sessionId: 'restored-updated-model', model: creationModel }),
		);

		assert.deepStrictEqual(agent['_sessions'].get('restored-updated-model')?.model, persistedModel);
	});

	for (const source of ['chat backing', 'session metadata']) {
		test(`cold chat restore preserves an unlisted model from ${source} when its provider is unavailable`, async () => {
			const database = new TestSessionDatabase();
			const agent = await createAgent(disposables, { database });
			const selectedModel = { id: OPENAI_TEST_MODEL, config: { reasoningEffort: 'high' } };
			const persisted = source === 'session metadata';
			if (persisted) {
				await database.setMetadata('codex.model', selectedModel.id);
			}
			const parent = AgentSession.uri('codex', 'parent');

			await agent.materializeChat(chatOf(parent, 'restored'), parent, JSON.stringify({
				sessionId: 'restored-unlisted-model',
				model: persisted ? { id: COPILOT_TEST_MODEL } : selectedModel,
			}));

			assert.deepStrictEqual(agent['_sessions'].get('restored-unlisted-model')?.model, persisted ? { id: selectedModel.id } : selectedModel);
		});

		test(`cold chat restore falls back within the provider of the unavailable model from ${source}`, async () => {
			const database = new TestSessionDatabase();
			const agent = await createAgent(disposables, { database });
			const selectedModel = { id: toCodexModelSelectionId('openai', 'desktop-only-model'), config: { thinkingLevel: 'ultra' } };
			const baseModel = agent.models.get()[0];
			agent['_models'].set([baseModel, { ...baseModel, id: OPENAI_TEST_MODEL }], undefined);
			const persisted = source === 'session metadata';
			if (persisted) {
				await database.setMetadata('codex.model', selectedModel.id);
			}
			const parent = AgentSession.uri('codex', 'parent');
			const chat = chatOf(parent, 'restored');
			const providerData = JSON.stringify({ sessionId: 'restored-fallback-model', model: persisted ? { id: COPILOT_TEST_MODEL } : selectedModel });

			await agent.materializeChat(chat, parent, providerData);
			const metadata = await agent.getChatMetadata(chat, parent, providerData);

			assert.deepStrictEqual({ runtimeModel: agent['_sessions'].get('restored-fallback-model')?.model, metadataModel: metadata?.model }, {
				runtimeModel: { id: OPENAI_TEST_MODEL },
				metadataModel: { id: OPENAI_TEST_MODEL },
			});
		});
	}

	test('unlisted models are still rejected for explicit creation and model changes', async () => {
		const agent = await createAgent(disposables);
		const unlistedModel = { id: OPENAI_TEST_MODEL };
		await assert.rejects(createSession(agent, { model: unlistedModel }), /is not available/);
		const { session } = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = defaultChatOf(session);

		await assert.rejects(agent.chats.changeModel(chat, unlistedModel, chatContext(session, chat)), /is not available/);
		assert.deepStrictEqual(agent['_sessions'].get(AgentSession.id(session))?.model, { id: COPILOT_TEST_MODEL });
	});

	test('cold chat history pages turns without resuming until the first send', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.threadId', 'restored-history-thread');
		const agent = await createAgent(disposables, { database });
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const parent = AgentSession.uri('codex', 'parent');
		const chat = chatOf(parent, 'restored-history');
		await agent.materializeChat(chat, parent, JSON.stringify({ sessionId: 'restored-history' }));

		const reading = agent.chats.getMessages(chat, { configurationResource: parent, resource: chat });
		const read = await readNextRequest(peer.outbound);
		assert.strictEqual(read.params.includeTurns, false);
		peer.push({
			id: read.id,
			result: {
				thread: {
					id: 'restored-history',
					historyMode: 'paginated',
					turns: [],
				},
			},
		});
		const firstPage = await readNextRequest(peer.outbound);
		assert.deepStrictEqual(firstPage.params, {
			threadId: 'restored-history-thread',
			cursor: null,
			limit: 100,
			sortDirection: 'asc',
			itemsView: 'full',
		});
		peer.push({
			id: firstPage.id,
			result: {
				data: [{
					id: 'turn-1',
					items: [
						{ type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'hello', text_elements: [] }] },
						{ type: 'agentMessage', id: 'agent-1', text: 'restored one', phase: null, memoryCitation: null },
					],
					itemsView: 'full',
					status: 'completed',
				}],
				nextCursor: 'page-2',
				backwardsCursor: null,
			},
		});
		const secondPage = await readNextRequest(peer.outbound);
		assert.strictEqual(secondPage.params.cursor, 'page-2');
		peer.push({
			id: secondPage.id,
			result: {
				data: [{
					id: 'turn-2',
					items: [
						{ type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'again', text_elements: [] }] },
						{ type: 'agentMessage', id: 'agent-2', text: 'restored two', phase: null, memoryCitation: null },
					],
					itemsView: 'full',
					status: 'completed',
				}],
				nextCursor: null,
				backwardsCursor: null,
			},
		});

		const turns = await reading;
		const needsResumeAfterRead = agent['_sessions'].get('restored-history')?.needsResume;
		const sending = agent.chats.sendMessage(chat, 'follow up', undefined, undefined, 'turn-2');
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		peer.push({ id: resume.id, result: { thread: { id: 'restored-history', turns: [] }, runtimeWorkspaceRoots: [] } });
		const inventory = await readNextRequest(peer.outbound);
		peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await sending;
		assert.deepStrictEqual({
			needsResumeAfterRead,
			requests: [
				{ method: read.method, threadId: read.params.threadId },
				{ method: firstPage.method, threadId: firstPage.params.threadId },
				{ method: secondPage.method, threadId: secondPage.params.threadId },
				{ method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				{ method: resume.method, threadId: resume.params.threadId },
				{ method: inventory.method, threadId: inventory.params.threadId },
				{ method: turn.method, threadId: turn.params.threadId },
			],
			turns: turns.map(turn => ({
				id: turn.id,
				prompt: turn.message.text,
				response: turn.responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : undefined),
			})),
		}, {
			needsResumeAfterRead: true,
			requests: [
				{ method: 'thread/read', threadId: 'restored-history-thread' },
				{ method: 'thread/turns/list', threadId: 'restored-history-thread' },
				{ method: 'thread/turns/list', threadId: 'restored-history-thread' },
				{ method: 'thread/unsubscribe', threadId: 'restored-history-thread' },
				{ method: 'thread/resume', threadId: 'restored-history-thread' },
				{ method: 'mcpServerStatus/list', threadId: 'restored-history-thread' },
				{ method: 'turn/start', threadId: 'restored-history-thread' },
			],
			turns: [{
				id: 'turn-1',
				prompt: 'hello',
				response: ['restored one'],
			}, {
				id: 'turn-2',
				prompt: 'again',
				response: ['restored two'],
			}],
		});
		peer.exit();
	});

	test('cold resume carries workspace and client MCP and consumes an in-flight MCP invalidation before sending', async () => {
		const database = new TestSessionDatabase();
		const repo = URI.file('/repo');
		await database.setMetadata('codex.threadId', 'restored-mcp-thread');
		await database.setMetadata('codex.cwd', repo.toString());
		const agent = await createAgent(disposables, { database });
		await agent['_fileService'].writeFile(URI.joinPath(repo, '.mcp.json'), VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				workspace: { command: 'node', args: ['workspace.js'] },
			},
		})));
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const parent = AgentSession.uri('codex', 'parent');
		const chat = chatOf(parent, 'restored-mcp');
		await agent.materializeChat(chat, parent, JSON.stringify({ sessionId: 'restored-mcp' }));
		const entry = agent['_sessions'].get('restored-mcp')!;
		const pluginDir = URI.file('/plugin');
		entry.clientCustomizations.setClient('test', [{
			synced: { customization: { type: CustomizationType.Plugin, id: 'plugin', uri: pluginDir.toString(), name: 'plugin' }, pluginDir },
			parsed: {
				format: PluginFormat.OpenPlugin,
				hooks: [],
				agents: [],
				instructions: [],
				skills: [],
				mcpServers: [{
					name: 'local',
					uri: URI.file('/plugin/.mcp.json'),
					configuration: { type: McpServerType.LOCAL, command: 'node', args: ['server.js'] },
					customization: { type: CustomizationType.McpServer, id: 'mcp', uri: 'file:///plugin/.mcp.json', name: 'local', state: { kind: McpServerStatus.Starting } },
				}],
			},
		}]);

		const sending = agent.chats.sendMessage(chat, 'follow up', undefined, undefined, 'turn-1');
		const read = await readNextRequest(peer.outbound);
		peer.push({ id: read.id, result: { thread: { id: 'restored-mcp-thread', modelProvider: 'vscode-proxy' } } });
		const initialUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: initialUnsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		assert.strictEqual(entry.needsResume, false);
		agent['_markSessionForReload'](entry);
		peer.push({ id: resume.id, result: { thread: { id: 'restored-mcp-thread', turns: [] }, runtimeWorkspaceRoots: [] } });
		const inventory = await readNextRequest(peer.outbound);
		peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const followUpResume = await readNextRequest(peer.outbound);
		peer.push({ id: followUpResume.id, result: { thread: { id: 'restored-mcp-thread', turns: [] }, runtimeWorkspaceRoots: [] } });
		const followUpInventory = await readNextRequest(peer.outbound);
		peer.push({ id: followUpInventory.id, result: { data: [], nextCursor: null } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await sending;

		assert.deepStrictEqual({
			initialUnsubscribe: { method: initialUnsubscribe.method, threadId: initialUnsubscribe.params.threadId },
			read: { method: read.method, threadId: read.params.threadId },
			resume: {
				method: resume.method,
				threadId: resume.params.threadId,
				mcp: resume.params.config?.['mcp_servers'],
			},
			followUp: {
				unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				resume: { method: followUpResume.method, threadId: followUpResume.params.threadId },
			},
			needsResume: entry.needsResume,
			unsubscribeBeforeResume: entry.unsubscribeBeforeResume,
			turn: { method: turn.method, threadId: turn.params.threadId },
		}, {
			initialUnsubscribe: { method: 'thread/unsubscribe', threadId: 'restored-mcp-thread' },
			read: { method: 'thread/read', threadId: 'restored-mcp-thread' },
			resume: {
				method: 'thread/resume',
				threadId: 'restored-mcp-thread',
				mcp: {
					workspace: { command: 'node', args: ['workspace.js'], cwd: repo.fsPath },
					local: { command: 'node', args: ['server.js'] },
				},
			},
			followUp: {
				unsubscribe: { method: 'thread/unsubscribe', threadId: 'restored-mcp-thread' },
				resume: { method: 'thread/resume', threadId: 'restored-mcp-thread' },
			},
			needsResume: false,
			unsubscribeBeforeResume: false,
			turn: { method: 'turn/start', threadId: 'restored-mcp-thread' },
		});
		peer.exit();
	});

	test('scoped enablement changes republish resolved plugin children and invalidate MCP launch state', async () => {
		const onDidChange = new Emitter<{ readonly sessions: readonly string[] }>();
		let enabled = true;
		const resolve = (): CustomizationEnablementResolution => ({
			kind: 'resolved',
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled }],
			enabled,
			workingDirectory: { kind: 'workspaceless' as const },
		});
		const customizationEnablementService: IAgentHostCustomizationEnablementService = {
			_serviceBrand: undefined,
			onDidChange: onDidChange.event,
			initializeSession: async () => { },
			getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
			resolve,
			applyClientGlobalEnablement: resolve,
			replaceEnablement: resolve,
			setEnablement: resolve,
			whenIdle: async () => { },
		};
		const agent = await createAgent(disposables, { customizationEnablementService });
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')] });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const pluginDir = URI.file('/plugin');
		entry.clientCustomizations.setClient('test', [{
			synced: { customization: { type: CustomizationType.Plugin, id: 'plugin', uri: pluginDir.toString(), name: 'plugin' }, pluginDir },
			parsed: {
				format: PluginFormat.OpenPlugin,
				hooks: [],
				agents: [],
				instructions: [],
				skills: [],
				mcpServers: [{
					name: 'local',
					uri: URI.file('/plugin/.mcp.json'),
					configuration: { type: McpServerType.LOCAL, command: 'node' },
					customization: { type: CustomizationType.McpServer, id: 'mcp', uri: 'file:///plugin/.mcp.json', name: 'local', state: { kind: McpServerStatus.Starting } },
				}],
			},
		}]);
		entry.firstTurnSent = true;
		entry.materializedMcpSig = 'before';
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		enabled = false;
		onDidChange.fire({ sessions: [session.toString()] });

		const pluginUpdate = signals
			.filter(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationUpdated)
			.map(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationUpdated ? signal.action.customization : undefined)
			.find(customization => customization?.id === 'plugin');
		const pluginCustomization = pluginUpdate?.type === CustomizationType.Plugin ? pluginUpdate : undefined;
		const mcpChild = pluginCustomization?.children?.find(child => child.type === CustomizationType.McpServer);
		assert.deepStrictEqual({
			pluginEnablement: pluginCustomization?.enablement,
			childEnablement: mcpChild?.type === CustomizationType.McpServer ? mcpChild.enablement : undefined,
			materializedMcpSig: entry.materializedMcpSig,
			needsResume: entry.needsResume,
			unsubscribeBeforeResume: entry.unsubscribeBeforeResume,
		}, {
			pluginEnablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			childEnablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			materializedMcpSig: undefined,
			needsResume: true,
			unsubscribeBeforeResume: true,
		});
	});

	test('workspace skills retain invocation metadata when the native catalog repeats them', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const workspace = URI.file('/repo');
		const skillUri = URI.joinPath(workspace, '.github', 'skills', 'website', 'SKILL.md');
		const nativeSkillUri = URI.joinPath(workspace, '.agents', 'skills', 'website', 'SKILL.md');
		await agent['_fileService'].writeFile(skillUri, VSBuffer.fromString('---\nname: website\ndescription: Workspace website\nuser-invocable: false\ndisable-model-invocation: true\n---\nInclude a footer.'));
		const { session } = await createSession(agent, { workingDirectories: [workspace] });
		const chat = defaultChatOf(session);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const nativeSkill = { name: 'website', description: 'Native website', path: skillUri.fsPath, scope: 'repo' as const, enabled: true };
		let catalog = codexSkillsToContainers({ data: [{ cwd: workspace.fsPath, skills: [nativeSkill, { ...nativeSkill, path: nativeSkillUri.fsPath }], errors: [] }] });
		const nativeContainerId = catalog[0].id;
		agent['_fetchSkillHookContainers'] = async () => catalog;
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));
		const summarize = (customizations: readonly Customization[]) => customizations
			.flatMap(customization => customization.type === CustomizationType.Directory ? customization.children ?? [] : [])
			.filter(child => child.type === CustomizationType.Skill)
			.map(skill => ({
				uri: skill.uri,
				description: skill.description,
				disableUserInvocation: skill.disableUserInvocation,
				disableModelInvocation: skill.disableModelInvocation,
			}));
		const refreshed = () => signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationUpdated ? [signal.action.customization] : []);
		const workspaceSkill = { uri: skillUri.toString(), description: 'Workspace website', disableUserInvocation: true, disableModelInvocation: true };
		const expected = [workspaceSkill, { uri: nativeSkillUri.toString(), description: 'Native website', disableUserInvocation: undefined, disableModelInvocation: undefined }];

		const snapshot = await agent.getChatCustomizations(chat, chatContext(session, chat));
		await agent['_refreshSkillHookCustomizations'](entry);
		const firstRefresh = summarize(refreshed());
		signals.length = 0;
		catalog = codexSkillsToContainers({ data: [{ cwd: workspace.fsPath, skills: [nativeSkill], errors: [] }] });
		await agent['_refreshSkillHookCustomizations'](entry);
		const finalSnapshot = await agent.getChatCustomizations(chat, chatContext(session, chat));

		assert.deepStrictEqual({
			snapshot: summarize(snapshot),
			firstRefresh,
			finalRefresh: summarize(refreshed()),
			finalSnapshot: summarize(finalSnapshot),
			removedIds: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationRemoved ? [signal.action.id] : []),
			publishedDirectoryIds: [...entry.publishedDirectoryCustomizationIds],
		}, {
			snapshot: expected,
			firstRefresh: expected,
			finalRefresh: [workspaceSkill],
			finalSnapshot: [workspaceSkill],
			removedIds: [nativeContainerId],
			publishedDirectoryIds: [snapshot[0].id],
		});
	});

	test('workspace skill catalog refresh removes deleted skills', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const workspace = URI.file('/repo');
		const skillUri = URI.joinPath(workspace, '.github', 'skills', 'website', 'SKILL.md');
		await agent['_fileService'].writeFile(skillUri, VSBuffer.fromString('---\nname: website\ndescription: Builds websites\n---\nInclude a footer.'));
		const { session } = await createSession(agent, { workingDirectories: [workspace] });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		await agent['_refreshSkillHookCustomizations'](entry);
		await agent['_fileService'].del(skillUri);
		await agent['_refreshSkillHookCustomizations'](entry);

		assert.deepStrictEqual({
			actions: signals.flatMap(signal => signal.kind === 'action'
				&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved)
				? [signal.action.type] : []),
			publishedDirectoryIds: [...entry.publishedDirectoryCustomizationIds],
		}, {
			actions: [ActionType.SessionCustomizationUpdated, ActionType.SessionCustomizationRemoved],
			publishedDirectoryIds: [],
		});
	});

	test('does not discover workspace customizations from managed scratch', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const created = await createSession(agent);
		const chat = defaultChatOf(created.session);
		const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
		const scratch = URI.file('/scratch/quick-chat');
		entry.workingDirectory = scratch;
		entry.managedWorkingDirectory = scratch;
		await Promise.all([
			agent['_fileService'].writeFile(URI.joinPath(scratch, 'AGENTS.md'), VSBuffer.fromString('Scratch instructions')),
			agent['_fileService'].writeFile(URI.joinPath(scratch, '.github', 'agents', 'scratch.agent.md'), VSBuffer.fromString('---\nname: Scratch\n---\nScratch agent')),
			agent['_fileService'].writeFile(URI.joinPath(scratch, '.github', 'skills', 'scratch', 'SKILL.md'), VSBuffer.fromString('---\nname: scratch\ndescription: Scratch\n---\nScratch skill')),
		]);

		const customizations = await agent.getChatCustomizations(chat, chatContext(created.session, chat));
		const launch = await agent['_buildCustomizationLaunch'](entry);

		assert.deepStrictEqual({
			customizations: customizations.map(customization => customization.uri),
			agents: launch.config.agents,
		}, {
			customizations: [],
			agents: undefined,
		});
	});

	test('workspace skill roots stay session-scoped rather than process-global', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const workspace = URI.file('/repo');
		const skillRoot = URI.joinPath(workspace, '.github', 'skills');
		await agent['_fileService'].writeFile(URI.joinPath(skillRoot, 'website', 'SKILL.md'), VSBuffer.fromString('---\nname: website\ndescription: Builds websites\n---\nInclude a footer.'));
		const owner = await createSession(agent, { workingDirectories: [workspace] });
		const unrelated = await createSession(agent, { workingDirectories: [URI.file('/other')] });
		const ownerLaunch = await agent['_buildCustomizationLaunch'](agent['_sessions'].get(AgentSession.id(owner.session))!);
		const unrelatedLaunch = await agent['_buildCustomizationLaunch'](agent['_sessions'].get(AgentSession.id(unrelated.session))!);
		const unrelatedChat = defaultChatOf(unrelated.session);
		const unrelatedCustomizations = await agent.getChatCustomizations(unrelatedChat, chatContext(unrelated.session, unrelatedChat));
		const peer = disposables.add(createTestPeer());
		const client = disposables.add(new CodexAppServerClient(peer.transport));

		try {
			const applying = agent['_applySkillExtraRoots'](client);
			const request = await readNextRequest(peer.outbound);
			peer.push({ id: request.id, result: {} });
			await applying;

			assert.deepStrictEqual({
				ownerRoots: ownerLaunch.selectedCapabilityRoots.map(root => root.location.path),
				unrelatedRoots: unrelatedLaunch.selectedCapabilityRoots,
				unrelatedCustomizations,
				method: request.method,
				processGlobalRoots: request.params.extraRoots,
			}, {
				ownerRoots: [skillRoot.fsPath],
				unrelatedRoots: [],
				unrelatedCustomizations: [],
				method: 'skills/extraRoots/set',
				processGlobalRoots: [],
			});
		} finally {
			peer.exit();
		}
	});

	test('skill catalog refresh publishes one update for a shared validation diagnostic', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const workspace = URI.file('/repo');
		const { session } = await createSession(agent, { workingDirectories: [workspace] });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const errors = Array.from({ length: 100 }, (_value, index) => ({
			path: URI.joinPath(workspace, '.codex', 'skills', `skill-${index}`, 'SKILL.md').fsPath,
			message: 'missing field `description`',
		}));
		let catalog = codexSkillsToContainers({ data: [{ cwd: workspace.fsPath, skills: [], errors }] });
		agent['_fetchSkillHookContainers'] = async () => catalog;
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));
		const summarize = () => ({
			updates: signals.flatMap(signal => signal.kind === 'action'
				&& signal.action.type === ActionType.SessionCustomizationUpdated
				&& signal.action.customization.type === CustomizationType.Directory
				? [{ id: signal.action.customization.id, childCount: signal.action.customization.children?.length }]
				: []),
			removals: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.SessionCustomizationRemoved ? [signal.action.id] : []),
		});

		await agent['_refreshSkillHookCustomizations'](entry);
		const firstRefresh = summarize();
		const containerId = catalog[0].id;
		signals.length = 0;
		catalog = codexSkillsToContainers({ data: [{ cwd: workspace.fsPath, skills: [], errors: errors.slice(1) }] });
		await agent['_refreshSkillHookCustomizations'](entry);

		assert.deepStrictEqual({ firstRefresh, secondRefresh: summarize() }, {
			firstRefresh: { updates: [{ id: containerId, childCount: 100 }], removals: [] },
			secondRefresh: { updates: [{ id: containerId, childCount: 99 }], removals: [] },
		});
	});

	test('skill catalog refresh removes directory customizations that disappeared', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')] });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const container = (id: string) => ({
			type: CustomizationType.Directory,
			id,
			uri: URI.file(`/repo/.agents/skills/${id}`),
			name: id,
			enabled: true,
			contents: CustomizationType.Skill,
			writable: false,
			children: [],
		}) as never;
		let catalog = [container('old-skill-container')];
		agent['_fetchSkillHookContainers'] = async () => catalog;
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		await agent['_refreshSkillHookCustomizations'](entry);
		catalog = [container('new-skill-container')];
		await agent['_refreshSkillHookCustomizations'](entry);

		assert.deepStrictEqual(signals.flatMap(signal => signal.kind === 'action'
			&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved)
			? [{
				type: signal.action.type,
				id: signal.action.type === ActionType.SessionCustomizationUpdated ? signal.action.customization.id : signal.action.id,
			}]
			: []), [
			{ type: ActionType.SessionCustomizationUpdated, id: 'old-skill-container' },
			{ type: ActionType.SessionCustomizationRemoved, id: 'old-skill-container' },
			{ type: ActionType.SessionCustomizationUpdated, id: 'new-skill-container' },
		]);
	});

	test('skill catalog refreshes are serialized so an older result cannot replace a newer one', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')] });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const container = (id: string) => ({
			type: CustomizationType.Directory,
			id,
			uri: URI.file(`/repo/.agents/skills/${id}`),
			name: id,
			enabled: true,
			contents: CustomizationType.Skill,
			writable: false,
			children: [],
		}) as never;
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		let calls = 0;
		agent['_fetchSkillHookContainers'] = async () => {
			calls++;
			if (calls === 1) {
				firstStarted.complete();
				await releaseFirst.p;
				return [container('old-skill-container')];
			}
			return [container('new-skill-container')];
		};
		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidChatProgress(signal => signals.push(signal)));

		const first = agent['_refreshSkillHookCustomizations'](entry);
		await firstStarted.p;
		const second = agent['_refreshSkillHookCustomizations'](entry);
		await new Promise(resolve => setImmediate(resolve));
		const callsWhileFirstPending = calls;
		releaseFirst.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			callsWhileFirstPending,
			published: [...entry.publishedDirectoryCustomizationIds],
			actions: signals.flatMap(signal => signal.kind === 'action'
				&& (signal.action.type === ActionType.SessionCustomizationUpdated || signal.action.type === ActionType.SessionCustomizationRemoved)
				? [{
					type: signal.action.type,
					id: signal.action.type === ActionType.SessionCustomizationUpdated ? signal.action.customization.id : signal.action.id,
				}]
				: []),
		}, {
			callsWhileFirstPending: 1,
			published: ['new-skill-container'],
			actions: [
				{ type: ActionType.SessionCustomizationUpdated, id: 'old-skill-container' },
				{ type: ActionType.SessionCustomizationRemoved, id: 'old-skill-container' },
				{ type: ActionType.SessionCustomizationUpdated, id: 'new-skill-container' },
			],
		});
	});

	test('initial customization snapshot discards skill and hook catalogs returned by a replaced app-server', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo')] });
		const chat = defaultChatOf(session);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const requestsStarted = new DeferredPromise<void>();
		const releaseRequests = new DeferredPromise<void>();
		let requestCount = 0;
		const staleClient = {
			request: async (method: string) => {
				requestCount++;
				if (requestCount === 2) {
					requestsStarted.complete();
				}
				await releaseRequests.p;
				return method === 'skills/list' ? {
					data: [{
						cwd: '/repo',
						skills: [{
							name: 'stale-skill',
							description: 'from the replaced process',
							path: '/repo/.agents/skills/stale-skill/SKILL.md',
							scope: 'repo',
							enabled: true,
						}],
						errors: [],
					}],
				} : { data: [] };
			},
		};
		agent['_connection'] = {
			kind: 'ready',
			client: staleClient,
			child: { kill: () => true },
		} as never;

		const snapshot = agent.getChatCustomizations(chat, chatContext(session, chat));
		await requestsStarted.p;
		agent['_connection'] = {
			kind: 'ready',
			client: { request: async () => ({ data: [] }) },
			child: { kill: () => true },
		} as never;
		releaseRequests.complete();
		const customizations = await snapshot;

		assert.deepStrictEqual({
			directoryNames: customizations
				.filter(customization => customization.type === CustomizationType.Directory)
				.map(customization => customization.name),
			publishedDirectoryIds: [...entry.publishedDirectoryCustomizationIds],
		}, {
			directoryNames: [],
			publishedDirectoryIds: [],
		});
	});

	test('skill extra-root updates are serialized and recompute the latest union before sending', async () => {
		const agent = await createAgent(disposables);
		const { session } = await createSession(agent);
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		let includeSkill = true;
		agent['_enabledClientPlugins'] = () => includeSkill ? [{
			parsed: { skills: [{ uri: URI.file('/plugin/skills/example/SKILL.md') }] },
		}] as never : [];
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		const requests: string[][] = [];
		agent['_connection'] = {
			kind: 'ready',
			client: {
				request: async (method: string, params: { readonly extraRoots: string[] }) => {
					assert.strictEqual(method, 'skills/extraRoots/set');
					requests.push(params.extraRoots);
					if (requests.length === 1) {
						firstStarted.complete();
						await releaseFirst.p;
					}
					return {};
				},
			},
			proxyHandle: { dispose() { } },
			child: { kill: () => true },
		} as never;

		const first = agent['_refreshSkillExtraRoots']();
		await firstStarted.p;
		includeSkill = false;
		const second = agent['_refreshSkillExtraRoots']();
		await new Promise(resolve => setImmediate(resolve));
		const requestsWhileFirstPending = requests.length;
		releaseFirst.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			requestsWhileFirstPending,
			requests,
			runtime: entry.sessionId,
		}, {
			requestsWhileFirstPending: 1,
			requests: [[PLUGIN_SKILLS_ROOT], []],
			runtime: AgentSession.id(session),
		});
	});

	test('every persistent app-server receives the current skill extra roots before it is returned', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		await createSession(agent);
		agent['_enabledClientPlugins'] = () => [{
			parsed: { skills: [{ uri: URI.file('/plugin/skills/example/SKILL.md') }] },
		}] as never;
		const rootsByConnection: string[][][] = [];
		agent['_startConnection'] = (async () => {
			const roots: string[][] = [];
			rootsByConnection.push(roots);
			return {
				client: {
					request: async (method: string, params: { readonly extraRoots?: string[] }) => {
						if (method === 'skills/extraRoots/set') {
							roots.push(params.extraRoots ?? []);
							return {};
						}
						if (method === 'account/read') {
							return { account: null, requiresOpenaiAuth: true };
						}
						if (method === 'mcpServerStatus/list') {
							return { data: [], nextCursor: null };
						}
						throw new Error(`Unexpected request: ${method}`);
					},
					dispose() { },
				},
				proxyHandle: { setToken() { }, dispose() { } },
				child: { kill: () => true },
			};
		}) as never;

		await agent['_ensureConnection']();
		agent['_disposeConnection']();
		await agent['_ensureConnection']();

		assert.deepStrictEqual(rootsByConnection, [
			[[PLUGIN_SKILLS_ROOT]],
			[[PLUGIN_SKILLS_ROOT]],
		]);
	});

	test('disposing a released workspace-less peer removes its managed directory', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = chatOf(parent.session, 'release-dispose');
		const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'released-peer' } } });
		const created = await creating;
		assert.ok(created?.backingSession);
		const managedDirectory = agent['_sessions'].get('released-peer')?.managedWorkingDirectory;
		assert.ok(managedDirectory);
		await agent['_metadataStore'].read(created.backingSession);

		const releasing = agent.chats.releaseChat?.(chat, chatContext(parent.session, chat));
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		await releasing;
		assert.strictEqual(fs.existsSync(managedDirectory.fsPath), true);

		await agent.chats.disposeChat(chat, chatContext(parent.session, chat));
		assert.deepStrictEqual({
			sessionExists: agent['_sessions'].has('released-peer'),
			releasedOwnershipExists: agent['_releasedManagedWorkingDirectories'].has('released-peer'),
			managedDirectoryExists: fs.existsSync(managedDirectory.fsPath),
		}, {
			sessionExists: false,
			releasedOwnershipExists: false,
			managedDirectoryExists: false,
		});
		peer.exit();
	});

	test('changing the model of an idle-released chat persists the new selection', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const alternateModel = toCodexModelSelectionId('vscode-proxy', 'gpt-alternate');
		agent['_models'].set([
			{ provider: 'copilot', id: COPILOT_TEST_MODEL, name: 'GPT Test', supportsVision: false },
			{ provider: 'copilot', id: alternateModel, name: 'GPT Alternate', supportsVision: false },
		], undefined);

		const created = await createSession(agent, { workingDirectories: [URI.file('/repo/released-model')], model: { id: COPILOT_TEST_MODEL } });
		const chat = defaultChatOf(created.session);
		const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
		const materializing = agent['_materializeIfNeeded'](entry, created.session, false);
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'released-model-thread' } } });
		await materializing;

		const releasing = agent.chats.releaseChat?.(chat, chatContext(created.session, chat));
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		await releasing;
		await agent.chats.changeModel(chat, { id: alternateModel }, chatContext(created.session, chat));

		const overlay = await agent['_metadataStore'].read(created.session);
		assert.deepStrictEqual({
			hasLiveRuntime: agent['_sessions'].has(AgentSession.id(created.session)),
			boundRuntime: agent['_sessionIdByChatUri'].get(chat.toString()),
			modelId: overlay.modelId,
		}, {
			hasLiveRuntime: false,
			boundRuntime: AgentSession.id(created.session),
			modelId: alternateModel,
		});
		peer.exit();
	});

	test('applies context size and thinking level for Copilot and ChatGPT models', async () => {
		const runScenario = async (source: 'copilot' | 'chatgpt', selectedModelId: string) => {
			const longContextSize = source === 'copilot' ? 1_000_000 : 872_000;
			const agent = await createAgent(disposables);
			agent['_schedulePrewarm'] = () => { };
			agent['_refreshSkillHookCustomizations'] = async () => { };
			agent['_refreshSkillExtraRoots'] = async () => { };
			const peer = disposables.add(createTestPeer());
			agent['_connection'] = {
				kind: 'ready',
				client: new CodexAppServerClient(peer.transport),
				usageSource: source === 'copilot' ? 'github' : 'openai',
				child: { kill: () => true },
			} as never;
			const baseModel = agent.models.get()[0];
			agent['_models'].set([{
				...baseModel,
				id: selectedModelId,
				configSchema: {
					type: 'object',
					properties: {
						thinkingLevel: { type: 'string', title: 'Thinking Level', enum: ['low', 'high'], default: 'low' },
						contextSize: { type: 'number', title: 'Context Size', enum: [272_000, longContextSize], default: 272_000 },
					},
				},
			}], undefined);

			const threadId = `${source}-context-size-thread`;
			const folder = URI.file(`/repo/context-size-${source}`);
			const longContextModel = { id: selectedModelId, config: { thinkingLevel: 'low', contextSize: longContextSize } };
			const created = await createSession(agent, { workingDirectories: [folder], model: longContextModel });
			const chat = defaultChatOf(created.session);
			const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
			const materializing = agent['_materializeIfNeeded'](entry, created.session, false);
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: threadId, cwd: folder.fsPath } } });
			await materializing;

			await agent.chats.changeModel(chat, { id: selectedModelId, config: { thinkingLevel: 'high', contextSize: 272_000 } }, chatContext(created.session, chat));
			const sending = agent.chats.sendMessage(chat, 'use the shorter window', [folder], undefined, 'turn-1', undefined, undefined, chatContext(created.session, chat));
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			const resume = await readNextRequest(peer.outbound);
			peer.push({ id: resume.id, result: { thread: { id: threadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
			const inventory = await readNextRequest(peer.outbound);
			peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await sending;
			peer.exit();

			return {
				source,
				start: {
					method: start.method,
					model: start.params.model,
					modelProvider: start.params.modelProvider,
					contextSize: start.params.config?.model_context_window,
				},
				unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
				resume: {
					method: resume.method,
					model: resume.params.model,
					modelProvider: resume.params.modelProvider,
					contextSize: resume.params.config?.model_context_window,
				},
				turn: {
					method: turn.method,
					thinkingLevel: turn.params.effort,
					collaborationThinkingLevel: turn.params.collaborationMode?.settings.reasoning_effort,
				},
			};
		};

		assert.deepStrictEqual([
			await runScenario('copilot', COPILOT_TEST_MODEL),
			await runScenario('chatgpt', OPENAI_TEST_MODEL),
		], [{
			source: 'copilot',
			start: { method: 'thread/start', model: 'gpt-test', modelProvider: 'vscode-proxy', contextSize: 1_000_000 },
			unsubscribe: { method: 'thread/unsubscribe', threadId: 'copilot-context-size-thread' },
			resume: { method: 'thread/resume', model: 'gpt-test', modelProvider: 'vscode-proxy', contextSize: 272_000 },
			turn: { method: 'turn/start', thinkingLevel: 'high', collaborationThinkingLevel: 'high' },
		}, {
			source: 'chatgpt',
			start: { method: 'thread/start', model: 'gpt-5.6-sol', modelProvider: 'openai', contextSize: 872_000 },
			unsubscribe: { method: 'thread/unsubscribe', threadId: 'chatgpt-context-size-thread' },
			resume: { method: 'thread/resume', model: 'gpt-5.6-sol', modelProvider: 'openai', contextSize: 272_000 },
			turn: { method: 'turn/start', thinkingLevel: 'high', collaborationThinkingLevel: 'high' },
		}]);
	});

	for (const restorePath of ['metadata', 'materialize'] as const) {
		test(`retains portable history after restoring a Copilot-selected native thread through ${restorePath}`, async () => {
			const agent = await createAgent(disposables);
			agent['_schedulePrewarm'] = () => { };
			agent['_readCodexRolloutMetadata'] = async () => ({
				isDesktop: true,
				originModelProvider: 'openai',
				selectedModel: { modelProvider: 'vscode-proxy', modelId: 'gpt-test' },
				modelsByTurnId: new Map(),
				threadCoordinationByTurnId: new Map(),
			});
			const peer = disposables.add(createTestPeer());
			agent['_connection'] = {
				kind: 'ready',
				client: new CodexAppServerClient(peer.transport),
				usageSource: 'github',
				child: { kill: () => true },
			} as never;
			const requests: ITestWireRequest[] = [];
			const respond = (chunk: Buffer) => {
				const request = JSON.parse(chunk.toString('utf8')) as ITestWireRequest;
				requests.push(request);
				queueMicrotask(() => peer.push({
					id: request.id,
					result: request.method === 'mcpServerStatus/list'
						? { data: [], nextCursor: null }
						: { thread: { id: 'portable-thread', modelProvider: 'vscode-proxy', cwd: '/repo/portable', turns: [] } },
				}));
			};
			peer.outbound.on('data', respond);
			const session = AgentSession.uri('codex', 'portable-thread');
			const chat = defaultChatOf(session);
			try {
				if (restorePath === 'metadata') {
					await agent.getChatMetadata(chat, chatContext(session, chat));
				} else {
					await agent.materializeChat(chat, chatContext(session, chat), JSON.stringify({ sessionId: 'portable-thread', model: { id: COPILOT_TEST_MODEL } }));
				}
				const entry = agent['_sessions'].get('portable-thread')!;
				await agent['_resumeSession'](entry);
				const resume = requests.find(request => request.method === 'thread/resume')!;
				assert.deepStrictEqual({
					hasNativeHistory: entry.hasNativeHistory,
					threadId: resume.params.threadId,
					provider: resume.params.modelProvider,
					portableHistory: (resume.params.config as Record<string, string>)['model_providers.vscode-proxy.http_headers.x-vscode-codex-portable-history'],
					configurationWrites: requests.filter(request => request.method === 'config/batchWrite').length,
				}, {
					hasNativeHistory: true,
					threadId: 'portable-thread',
					provider: 'vscode-proxy',
					portableHistory: 'true',
					configurationWrites: 0,
				});
			} finally {
				peer.outbound.off('data', respond);
				peer.exit();
			}
		});
	}

	test('restores a saved provider change without replacing or unsubscribing the native thread', async () => {
		const database = new TestSessionDatabase();
		const agent = await createAgent(disposables, { database });
		agent['_schedulePrewarm'] = () => { };
		await database.setMetadata('codex.threadId', 'native-chatgpt-thread');
		await database.setMetadata('codex.model', COPILOT_TEST_MODEL);
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const requests: string[] = [];
		const respond = (chunk: Buffer) => {
			const request = JSON.parse(chunk.toString('utf8')) as ITestWireRequest;
			requests.push(request.method);
			queueMicrotask(() => peer.push({
				id: request.id,
				result: { thread: { id: 'native-chatgpt-thread', modelProvider: 'openai', cwd: '/repo/restored-provider', source: 'cli', turns: [] } },
			}));
		};
		peer.outbound.on('data', respond);
		const session = AgentSession.uri('codex', 'native-chatgpt-thread');
		const chat = defaultChatOf(session);
		try {
			const metadata = await agent.getChatMetadata(chat, chatContext(session, chat));
			const entry = agent['_sessions'].get(AgentSession.id(session));
			assert.deepStrictEqual({
				requests,
				model: metadata?.model?.id,
				threadId: entry?.threadId,
				needsResume: entry?.needsResume,
				unsubscribeBeforeResume: entry?.unsubscribeBeforeResume,
				threadOwner: agent['_sessionIdByThreadId'].get('native-chatgpt-thread'),
			}, {
				requests: ['thread/read'],
				model: COPILOT_TEST_MODEL,
				threadId: 'native-chatgpt-thread',
				needsResume: true,
				unsubscribeBeforeResume: true,
				threadOwner: 'native-chatgpt-thread',
			});
		} finally {
			peer.outbound.off('data', respond);
			peer.exit();
		}
	});

	for (const initialConfiguration of ['missing', 'conflicting', 'unwritable']) {
		test(`protects a cold native thread with a saved Copilot selection and ${initialConfiguration} alias configuration`, async () => {
			const database = new TestSessionDatabase();
			const telemetryService = new TestCodexTelemetryService();
			const agent = await createAgent(disposables, { database, telemetryService });
			agent['_schedulePrewarm'] = () => { };
			agent['_refreshSkillHookCustomizations'] = async () => { };
			agent['_refreshSkillExtraRoots'] = async () => { };
			await database.setMetadata('codex.threadId', 'native-chatgpt-thread');
			await database.setMetadata('codex.model', COPILOT_TEST_MODEL);
			const peer = disposables.add(createTestPeer());
			agent['_connection'] = {
				kind: 'ready',
				client: new CodexAppServerClient(peer.transport),
				usageSource: 'github',
				child: { kill: () => true },
			} as never;
			const requests: string[] = [];
			let configurationRepaired = false;
			let failNextTurn = true;
			const respond = (chunk: Buffer) => {
				const request = JSON.parse(chunk.toString('utf8')) as ITestWireRequest;
				requests.push(request.method);
				if (request.method === 'turn/start' && failNextTurn) {
					failNextTurn = false;
					queueMicrotask(() => peer.push({ id: request.id, error: { code: -32600, message: 'Turn rejected' } }));
					return;
				}
				if (request.method === 'config/batchWrite' && initialConfiguration === 'unwritable' && !configurationRepaired) {
					queueMicrotask(() => peer.push({ id: request.id, error: { code: -32600, message: 'User configuration is read-only' } }));
					return;
				}
				const result = request.method === 'thread/read'
					? { thread: { id: 'native-chatgpt-thread', modelProvider: 'openai', cwd: '/repo/restored-provider', source: 'cli', turns: [] } }
					: request.method === 'config/read'
						? { layers: [{ name: { type: 'user', profile: null, file: '/custom-codex/config.toml' }, version: 'original-version', config: initialConfiguration === 'conflicting' && !configurationRepaired ? { model_providers: { 'vscode-proxy': { name: 'Existing provider' } } } : {} }] }
						: request.method === 'thread/resume'
							? { thread: { id: request.params.threadId }, modelProvider: request.params.modelProvider }
							: request.method === 'mcpServerStatus/list'
								? { data: [], nextCursor: null }
								: {};
				queueMicrotask(() => peer.push({ id: request.id, result }));
			};
			peer.outbound.on('data', respond);
			const session = AgentSession.uri('codex', 'native-chatgpt-thread');
			const chat = defaultChatOf(session);
			try {
				await agent.getChatMetadata(chat, chatContext(session, chat));
				assert.deepStrictEqual(telemetryService.events, []);
				const entry = agent['_sessions'].get(AgentSession.id(session))!;
				entry.hostTurnIdByAppTurnId.set('native-turn', 'host-turn');
				entry.codexTurnIdByHostTurnId.set('host-turn', 'native-turn');
				if (initialConfiguration !== 'missing') {
					await assert.rejects(agent['_resumeSession'](entry), /already defines an incompatible|User configuration is read-only/);
					assert.deepStrictEqual(telemetryService.events, []);
					assert.deepStrictEqual({
						requests,
						threadId: entry.threadId,
						provider: entry.materializedModelProvider,
						needsResume: entry.needsResume,
						unsubscribeBeforeResume: entry.unsubscribeBeforeResume,
					}, {
						requests: initialConfiguration === 'conflicting' ? ['thread/read', 'config/read'] : ['thread/read', 'config/read', 'config/batchWrite'],
						threadId: 'native-chatgpt-thread',
						provider: 'openai',
						needsResume: true,
						unsubscribeBeforeResume: true,
					});
					configurationRepaired = true;
					requests.length = 0;
				}
				await agent['_resumeSession'](entry);
				assert.deepStrictEqual({
					handoff: requests.filter(method => method !== 'thread/read' && method !== 'mcpServerStatus/list'),
					threadId: entry.threadId,
					provider: entry.materializedModelProvider,
					hostTurn: entry.hostTurnIdByAppTurnId.get('native-turn'),
					nativeTurn: entry.codexTurnIdByHostTurnId.get('host-turn'),
				}, {
					handoff: ['config/read', 'config/batchWrite', 'thread/unsubscribe', 'thread/resume'],
					threadId: 'native-chatgpt-thread',
					provider: 'vscode-proxy',
					hostTurn: 'host-turn',
					nativeTurn: 'native-turn',
				});
				assert.deepStrictEqual(telemetryService.events, []);
				await agent.materializeChat(chat, chatContext(session, chat), JSON.stringify({ sessionId: AgentSession.id(session) }));
				await agent.chats.sendMessage(chat, 'continue', undefined, undefined, 'failed-turn', undefined, undefined, chatContext(session, chat));
				assert.deepStrictEqual(telemetryService.events, []);
				await agent.chats.sendMessage(chat, 'retry', undefined, undefined, 'retry-turn', undefined, undefined, chatContext(session, chat));
				await agent.chats.sendMessage(chat, 'continue again', undefined, undefined, 'next-turn', undefined, undefined, chatContext(session, chat));
				assert.deepStrictEqual({
					turnAttempts: requests.filter(method => method === 'turn/start').length,
					events: telemetryService.events,
				}, {
					turnAttempts: 3,
					events: [{
						name: 'agentHost.codexProviderSwitch',
						data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false },
					}],
				});
			} finally {
				peer.outbound.off('data', respond);
				peer.exit();
			}
		});
	}

	test('preserves the native thread when switching from ChatGPT to Copilot', async () => {
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { telemetryService });
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = {
			kind: 'ready',
			client,
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const chatGPTModel = toCodexModelSelectionId('openai', 'gpt-chatgpt-test');
		agent['_models'].set([
			{ provider: 'copilot', id: COPILOT_TEST_MODEL, name: 'GPT Test', supportsVision: false },
			{ provider: 'codex', id: chatGPTModel, name: 'GPT Test', supportsVision: false },
		], undefined);
		const created = await createSession(agent, { workingDirectories: [URI.file('/repo/switch-provider')], model: { id: chatGPTModel } });
		const chat = defaultChatOf(created.session);
		const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
		const materializing = agent['_materializeIfNeeded'](entry, created.session, false);
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'chatgpt-thread' } } });
		await materializing;
		entry.firstTurnSent = true;
		entry.hostTurnIdByAppTurnId.set('previous-codex-turn', 'previous-host-turn');
		entry.codexTurnIdByHostTurnId.set('previous-host-turn', 'previous-codex-turn');
		const weeklyRateLimit = { usedPercent: 97.5, windowDurationMins: 7 * 24 * 60, resetsAt: Math.floor(Date.now() / 1000) + 3600 };
		agent['_setOpenAIAccountState']({ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: 'person@example.com' });
		const requests: ITestWireRequest[] = [];
		const respond = (chunk: Buffer) => {
			const request = JSON.parse(chunk.toString('utf8')) as ITestWireRequest;
			requests.push(request);
			if (request.method === 'account/rateLimits/read') {
				queueMicrotask(() => peer.push({ id: request.id, result: { rateLimits: { primary: null, secondary: weeklyRateLimit }, rateLimitsByLimitId: null, rateLimitResetCredits: null } }));
				return;
			}
			if (request.method === 'turn/start') {
				agent['_openAIAccountRateLimit'] = { ...weeklyRateLimit, usedPercent: 12 };
			}
			const result = request.method === 'config/read'
				? { layers: [{ name: { type: 'user', profile: null, file: '/custom-codex/config.toml' }, version: 'original-version', config: {} }] }
				: request.method === 'thread/start'
					? { thread: { id: 'replacement-thread' } }
					: request.method === 'thread/resume'
						? { thread: { id: request.params.threadId }, modelProvider: request.params.modelProvider }
						: request.method === 'mcpServerStatus/list'
							? { data: [], nextCursor: null }
							: {};
			queueMicrotask(() => peer.push({ id: request.id, result }));
		};
		peer.outbound.on('data', respond);
		try {
			await agent['_refreshAccountRateLimits'](client);
			await agent.chats.changeModel(chat, { id: COPILOT_TEST_MODEL }, chatContext(created.session, chat));
			assert.deepStrictEqual(telemetryService.events, []);
			await agent.chats.sendMessage(chat, 'continue through Copilot', [URI.file('/repo/switch-provider')], undefined, 'next-host-turn', undefined, undefined, chatContext(created.session, chat));
		} finally {
			peer.outbound.off('data', respond);
			peer.exit();
		}
		const continuation = requests.find(request => request.method === 'thread/start' || request.method === 'thread/resume')!;
		const turn = requests.find(request => request.method === 'turn/start')!;

		assert.deepStrictEqual({
			setup: requests.filter(request => request.method === 'config/batchWrite').map(request => request.params),
			handoff: requests.filter(request => ['config/batchWrite', 'thread/unsubscribe', 'thread/resume'].includes(request.method)).map(request => request.method),
			method: continuation.method,
			threadId: continuation.params.threadId,
			model: continuation.params.model,
			provider: continuation.params.modelProvider,
			currentThread: entry.threadId,
			turnThread: turn.params.threadId,
			materializedProvider: entry.materializedModelProvider,
			portableHistory: (continuation.params.config as Record<string, string>)['model_providers.vscode-proxy.http_headers.x-vscode-codex-portable-history'],
			previousHostTurn: entry.hostTurnIdByAppTurnId.get('previous-codex-turn'),
			previousCodexTurn: entry.codexTurnIdByHostTurnId.get('previous-host-turn'),
		}, {
			setup: [{
				edits: [{ keyPath: 'model_providers.vscode-proxy', value: { name: 'OpenAI', wire_api: 'responses', requires_openai_auth: true }, mergeStrategy: 'replace' }],
				expectedVersion: 'original-version',
				reloadUserConfig: false,
			}],
			handoff: ['config/batchWrite', 'thread/unsubscribe', 'thread/resume'],
			method: 'thread/resume',
			threadId: 'chatgpt-thread',
			model: 'gpt-test',
			provider: 'vscode-proxy',
			currentThread: 'chatgpt-thread',
			turnThread: 'chatgpt-thread',
			materializedProvider: 'vscode-proxy',
			portableHistory: 'true',
			previousHostTurn: 'previous-host-turn',
			previousCodexTurn: 'previous-codex-turn',
		});
		assert.deepStrictEqual({
			quotaReads: requests.filter(request => request.method === 'account/rateLimits/read').length,
			events: telemetryService.events,
		}, {
			quotaReads: 1,
			events: [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false, chatgptWeeklyUsedPercentBucket: 90 },
			}],
		});
	});

	test('does not report a pending switch for a different backing thread', async () => {
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { telemetryService });
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const { session } = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		entry.pendingModelProviderSwitch = { threadId: 'old-thread', fromProvider: 'openai' };
		const send = agent.chats.sendMessage(defaultChatOf(session), 'continue', [URI.file('/repo/replacement')], undefined, 'turn-1');
		try {
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'new-thread' } } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;
			assert.deepStrictEqual({
				method: turn.method,
				threadId: turn.params.threadId,
				pendingSwitch: entry.pendingModelProviderSwitch,
				events: telemetryService.events,
			}, { method: 'turn/start', threadId: 'new-thread', pendingSwitch: undefined, events: [] });
		} finally {
			peer.exit();
		}
	});

	test('does not attach another account\'s quota when sign-in changes before a switch turn is accepted', async () => {
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { telemetryService });
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		const { session } = await createSession(agent, { workingDirectories: [URI.file('/repo/quota')], model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const materializing = agent['_materializeIfNeeded'](entry, session, false);
		try {
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'quota-thread' } } });
			await materializing;
			entry.firstTurnSent = true;
			entry.pendingModelProviderSwitch = { threadId: 'quota-thread', fromProvider: 'openai' };
			agent['_setOpenAIAccountState']({ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: 'person@example.com' });
			agent['_openAIAccountRateLimit'] = { usedPercent: 97.5, windowDurationMins: 7 * 24 * 60 };
			agent['_openAIAccountRateLimitUpdatedAt'] = Date.now();
			const send = agent.chats.sendMessage(defaultChatOf(session), 'continue', undefined, undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			agent['_setOpenAIAccountState']({ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', email: 'another@example.com' });
			agent['_openAIAccountRateLimit'] = { usedPercent: 12, windowDurationMins: 7 * 24 * 60 };
			agent['_openAIAccountRateLimitUpdatedAt'] = Date.now();
			peer.push({ id: turn.id, result: {} });
			await send;
			assert.deepStrictEqual({ method: turn.method, events: telemetryService.events }, {
				method: 'turn/start',
				events: [{
					name: 'agentHost.codexProviderSwitch',
					data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false },
				}],
			});
		} finally {
			peer.exit();
		}
	});

	test('honors switching back to ChatGPT while the Copilot handoff is preparing', async () => {
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { telemetryService });
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_models'].set([
			{ provider: 'copilot', id: COPILOT_TEST_MODEL, name: 'GPT Test', supportsVision: false },
			{ provider: 'codex', id: OPENAI_TEST_MODEL, name: 'GPT Test', supportsVision: false },
		], undefined);
		const created = await createSession(agent, { workingDirectories: [URI.file('/repo/switch-provider')], model: { id: OPENAI_TEST_MODEL } });
		const chat = defaultChatOf(created.session);
		const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
		const materializing = agent['_materializeIfNeeded'](entry, created.session, false);
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'native-chatgpt-thread' } } });
		await materializing;
		entry.firstTurnSent = true;
		await agent.chats.changeModel(chat, { id: COPILOT_TEST_MODEL }, chatContext(created.session, chat));
		const resuming = agent['_resumeSession'](entry);
		const readConfig = await readNextRequest(peer.outbound);
		await agent.chats.changeModel(chat, { id: OPENAI_TEST_MODEL }, chatContext(created.session, chat));
		const resumedProviders: string[] = [];
		const respond = (chunk: Buffer) => {
			const request = JSON.parse(chunk.toString('utf8')) as ITestWireRequest;
			if (request.method === 'thread/resume') {
				resumedProviders.push(request.params.modelProvider!);
			}
			queueMicrotask(() => peer.push({
				id: request.id,
				result: request.method === 'thread/resume'
					? { thread: { id: request.params.threadId }, modelProvider: request.params.modelProvider }
					: request.method === 'mcpServerStatus/list' ? { data: [], nextCursor: null } : {},
			}));
		};
		peer.outbound.on('data', respond);
		peer.push({ id: readConfig.id, result: { layers: [{ name: { type: 'user', profile: null, file: '/custom-codex/config.toml' }, version: 'original-version', config: {} }] } });
		try {
			await resuming;
			assert.deepStrictEqual({ resumedProviders, selectedModel: entry.model?.id, provider: entry.materializedModelProvider, threadId: entry.threadId }, {
				resumedProviders: ['vscode-proxy', 'openai'],
				selectedModel: OPENAI_TEST_MODEL,
				provider: 'openai',
				threadId: 'native-chatgpt-thread',
			});
			await agent.chats.sendMessage(chat, 'continue through ChatGPT', undefined, undefined, 'native-turn', undefined, undefined, chatContext(created.session, chat));
			assert.deepStrictEqual(telemetryService.events, []);
		} finally {
			peer.outbound.off('data', respond);
			peer.exit();
		}
	});

	test('routes provider-qualified models independently and switches one session', async () => {
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { telemetryService });
		agent['_schedulePrewarm'] = () => { };
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

		const chatGPTModel = toCodexModelSelectionId('openai', 'gpt-test');
		agent['_models'].set([
			{ provider: 'copilot', id: COPILOT_TEST_MODEL, name: 'GPT Test', supportsVision: false },
			{ provider: 'codex', id: chatGPTModel, name: 'GPT Test', supportsVision: false },
		], undefined);

		const copilot = await createSession(agent, { workingDirectories: [URI.file('/repo/copilot')], model: { id: COPILOT_TEST_MODEL } });
		const chatGPT = await createSession(agent, { workingDirectories: [URI.file('/repo/chatgpt')], model: { id: chatGPTModel } });
		const copilotEntry = agent['_sessions'].get(AgentSession.id(copilot.session))!;
		const chatGPTEntry = agent['_sessions'].get(AgentSession.id(chatGPT.session))!;

		const materializeCopilot = agent['_materializeIfNeeded'](copilotEntry, copilotEntry.sessionUri, false);
		const copilotStart = await readNextRequest(peer.outbound);
		peer.push({ id: copilotStart.id, result: { thread: { id: 'thread-copilot' } } });
		await materializeCopilot;

		const materializeChatGPT = agent['_materializeIfNeeded'](chatGPTEntry, chatGPTEntry.sessionUri, false);
		const chatGPTStart = await readNextRequest(peer.outbound);
		peer.push({ id: chatGPTStart.id, result: { thread: { id: 'thread-chatgpt' } } });
		await materializeChatGPT;

		await agent.chats.changeModel(defaultChatOf(copilot.session), { id: chatGPTModel }, chatContext(copilot.session, defaultChatOf(copilot.session)));
		const persistedAfterSwitch = await agent['_metadataStore'].read(copilot.session);
		const resumeCopilot = agent['_resumeSession'](copilotEntry);
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const switchedResume = await readNextRequest(peer.outbound);
		const refreshingInventory = readNextRequest(peer.outbound);
		peer.push({ id: switchedResume.id, result: { thread: { id: 'thread-copilot' } } });
		await resumeCopilot;
		const inventory = await refreshingInventory;
		peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
		const firstSend = agent.chats.sendMessage(defaultChatOf(copilot.session), 'first turn after prewarm', undefined, undefined, 'first-turn');
		const firstTurn = await readNextRequest(peer.outbound);
		peer.push({ id: firstTurn.id, result: {} });
		await firstSend;
		assert.deepStrictEqual({ method: firstTurn.method, events: telemetryService.events }, { method: 'turn/start', events: [] });

		await agent.chats.changeModel(defaultChatOf(copilot.session), { id: COPILOT_TEST_MODEL }, chatContext(copilot.session, defaultChatOf(copilot.session)));
		const resumeOriginalProvider = agent['_resumeSession'](copilotEntry);
		const readConfig = await readNextRequest(peer.outbound);
		peer.push({ id: readConfig.id, result: { layers: [{ name: { type: 'user', profile: null, file: '/custom-codex/config.toml' }, version: 'original-version', config: { model_providers: { 'vscode-proxy': { name: 'OpenAI', wire_api: 'responses', requires_openai_auth: true } } } }] } });
		const unsubscribeAgain = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribeAgain.id, result: {} });
		const returnedResume = await readNextRequest(peer.outbound);
		const returnedInventoryPromise = readNextRequest(peer.outbound);
		peer.push({ id: returnedResume.id, result: { thread: { id: 'thread-copilot' } } });
		await resumeOriginalProvider;
		const returnedInventory = await returnedInventoryPromise;
		peer.push({ id: returnedInventory.id, result: { data: [], nextCursor: null } });
		assert.deepStrictEqual(telemetryService.events, []);
		const nextSend = agent.chats.sendMessage(defaultChatOf(copilot.session), 'second turn through Copilot', undefined, undefined, 'second-turn');
		const nextTurn = await readNextRequest(peer.outbound);
		peer.push({ id: nextTurn.id, result: {} });
		await nextSend;
		assert.deepStrictEqual({ method: nextTurn.method, events: telemetryService.events }, {
			method: 'turn/start',
			events: [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false },
			}],
		});

		assert.deepStrictEqual({
			copilotStart: { model: copilotStart.params.model, provider: copilotStart.params.modelProvider },
			chatGPTStart: { model: chatGPTStart.params.model, provider: chatGPTStart.params.modelProvider },
			switchedResume: { method: switchedResume.method, threadId: switchedResume.params.threadId, model: switchedResume.params.model, provider: switchedResume.params.modelProvider },
			returnedResume: { method: returnedResume.method, threadId: returnedResume.params.threadId, provider: returnedResume.params.modelProvider },
			copilotThread: copilotEntry.threadId,
			chatGPTThread: chatGPTEntry.threadId,
			persistedAfterSwitch: persistedAfterSwitch.modelId,
			unsubscribedThread: unsubscribe.params.threadId,
		}, {
			copilotStart: { model: 'gpt-test', provider: 'vscode-proxy' },
			chatGPTStart: { model: 'gpt-test', provider: 'openai' },
			switchedResume: { method: 'thread/resume', threadId: 'thread-copilot', model: 'gpt-test', provider: 'openai' },
			returnedResume: { method: 'thread/resume', threadId: 'thread-copilot', provider: 'vscode-proxy' },
			copilotThread: 'thread-copilot',
			chatGPTThread: 'thread-chatgpt',
			persistedAfterSwitch: chatGPTModel,
			unsubscribedThread: 'thread-copilot',
		});

		peer.exit();
	});

	test('evicts a completed folder prewarm when the first send resolves to a worktree', async () => {
		await assertPrewarmEvictedOnSend(disposables, true);
	});

	test('waits for and evicts an in-flight folder prewarm when the first send resolves to a worktree', async () => {
		await assertPrewarmEvictedOnSend(disposables, false);
	});

	test('/compact invokes thread/compact/start instead of starting a prompt turn', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const repo = URI.file('/repo');
		const { session } = await createSession(agent, { workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
		const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), '/compact', [repo], undefined, 'turn-compact');
		const threadStart = await readNextRequest(peer.outbound);
		peer.push({ id: threadStart.id, result: { thread: { id: 'thread-compact' } } });
		const compactStart = await readNextRequest(peer.outbound);
		peer.push({ id: compactStart.id, result: {} });
		await send;

		assert.deepStrictEqual({
			threadStart: { method: threadStart.method, cwd: threadStart.params.cwd },
			compactStart: { method: compactStart.method, threadId: compactStart.params.threadId },
			firstTurnSent: agent['_sessions'].get(AgentSession.id(session))?.firstTurnSent,
		}, {
			threadStart: { method: 'thread/start', cwd: repo.fsPath },
			compactStart: { method: 'thread/compact/start', threadId: 'thread-compact' },
			firstTurnSent: true,
		});
		peer.exit();
	});

	test('thread start discovers workspace skills without client plugins', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		const workspace = URI.file('/repo');
		const skillsDirectory = URI.joinPath(workspace, '.github', 'skills');
		const skillUri = URI.joinPath(skillsDirectory, 'standalone-html-website', 'SKILL.md');
		await agent['_fileService'].writeFile(skillUri, VSBuffer.fromString('---\nname: standalone-html-website\ndescription: Builds a self-contained website\n---\nAlways include a sticky Made with Copilot footer.'));
		const { session } = await createSession(agent, { workingDirectories: [workspace], model: { id: COPILOT_TEST_MODEL } });
		const chat = defaultChatOf(session);
		const customizations = await agent.getChatCustomizations(chat, chatContext(session, chat));
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };

		try {
			const send = agent.chats.sendMessage(chat, 'Create a Hello World website.', [workspace], undefined, 'turn-1');
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread-workspace-skill' } } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;

			assert.deepStrictEqual({
				startMethod: start.method,
				selectedPaths: start.params.selectedCapabilityRoots?.map(root => root.location.path),
				skills: customizations
					.flatMap(customization => customization.type === CustomizationType.Directory ? customization.children ?? [] : [])
					.filter(customization => customization.type === CustomizationType.Skill)
					.map(skill => ({ name: skill.name, uri: skill.uri })),
			}, {
				startMethod: 'thread/start',
				selectedPaths: [skillsDirectory.fsPath],
				skills: [{ name: 'standalone-html-website', uri: skillUri.toString() }],
			});
		} finally {
			peer.exit();
		}
	});

	test('thread start receives custom agents, instructions, skills, and MCP from client plugins', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const repo = URI.file('/repo');
		const pluginDir = URI.file('/plugin');
		const agentUri = URI.file('/plugin/agents/reviewer.agent.md');
		const instructionUri = URI.file('/plugin/rules/repo.instructions.md');
		const skillUri = URI.file('/plugin/skills/greet/SKILL.md');
		await agent['_fileService'].writeFile(agentUri, VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews changes\n---\nReview carefully.'));
		await agent['_fileService'].writeFile(instructionUri, VSBuffer.fromString('---\ndescription: Repo rules\n---\nRun focused tests.'));
		await agent['_fileService'].writeFile(skillUri, VSBuffer.fromString('---\nname: greet\ndescription: Greets\n---\nSay hello.'));
		const parsed: IParsedPlugin = {
			format: PluginFormat.OpenPlugin,
			hooks: [],
			agents: [{ uri: agentUri, name: 'Reviewer', description: 'Reviews changes', customization: { type: CustomizationType.Agent, id: 'agent', uri: agentUri.toString(), name: 'Reviewer' } }],
			instructions: [{ uri: instructionUri, name: 'repo', customization: { type: CustomizationType.Rule, id: 'rule', uri: instructionUri.toString(), name: 'repo' } }],
			skills: [{ uri: skillUri, name: 'greet', description: 'Greets', customization: { type: CustomizationType.Skill, id: 'skill', uri: skillUri.toString(), name: 'greet' } }],
			mcpServers: [{
				name: 'local',
				uri: URI.file('/plugin/.mcp.json'),
				configuration: { type: McpServerType.LOCAL, command: 'node', args: ['server.js'] },
				customization: { type: CustomizationType.McpServer, id: 'mcp', uri: 'file:///plugin/.mcp.json', name: 'local', state: { kind: McpServerStatus.Starting } },
			}],
		};
		const unsafeSession = URI.from({ scheme: 'codex', path: '/../../codex-customization-victim' });
		const { session } = await createSession(agent, { session: unsafeSession, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL }, agent: { uri: agentUri.toString() } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		entry.clientCustomizations.setClient('test', [{
			synced: { customization: { type: CustomizationType.Plugin, id: 'plugin', uri: pluginDir.toString(), name: 'plugin', }, pluginDir },
			parsed,
		}]);

		const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', [repo], undefined, 'turn-1');
		const start = await readNextRequest(peer.outbound);
		const agents = start.params.config?.['agents'] as Record<string, { description: string; config_file: string }>;
		const roleFile = await fs.promises.readFile(agents.Reviewer.config_file, 'utf8');
		peer.push({ id: start.id, result: { thread: { id: 'thread-custom' } } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await send;

		assert.deepStrictEqual({
			mcp: start.params.config?.['mcp_servers'],
			agentDescription: agents.Reviewer.description,
			developerInstructions: start.params.developerInstructions,
			turnDeveloperInstructions: turn.params.collaborationMode?.settings.developer_instructions,
			capabilityPaths: start.params.selectedCapabilityRoots?.map(root => root.location.path),
			roleFile,
			roleFileUsesHostGeneratedRoot: agents.Reviewer.config_file.startsWith(join(os.tmpdir(), 'vscode-agent-codex-customizations-')),
		}, {
			mcp: { local: { command: 'node', args: ['server.js'] } },
			agentDescription: 'Reviews changes',
			developerInstructions: `Run focused tests.\n\nReview carefully.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}`,
			turnDeveloperInstructions: `Run focused tests.\n\nReview carefully.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}`,
			capabilityPaths: [URI.file('/plugin/skills').fsPath],
			roleFile: 'name = "Reviewer"\ndescription = "Reviews changes"\ndeveloper_instructions = "Review carefully."\n',
			roleFileUsesHostGeneratedRoot: true,
		});
		peer.exit();
	});

	test('resumes an established thread when the selected workspace agent changes', async () => {
		const agent = await createAgent(disposables);
		agent['_schedulePrewarm'] = () => { };
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		const repo = URI.file('/repo-workspace-agent-edit');
		const agentUri = URI.joinPath(repo, '.github', 'agents', 'reviewer.agent.md');
		await agent['_fileService'].writeFile(agentUri, VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews changes\n---\nUse the original instructions.'));
		const { session } = await createSession(agent, {
			workingDirectories: [repo],
			model: { id: COPILOT_TEST_MODEL },
			agent: { uri: agentUri.toString() },
		});
		const chat = URI.parse(buildDefaultChatUri(session));

		const firstSend = agent.chats.sendMessage(chat, 'first', [repo], undefined, 'turn-1');
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'thread-workspace-agent' } } });
		const firstTurn = await readNextRequest(peer.outbound);
		peer.push({ id: firstTurn.id, result: {} });
		await firstSend;

		await agent['_fileService'].writeFile(agentUri, VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews changes\n---\nUse the updated instructions.'));
		const secondSend = agent.chats.sendMessage(chat, 'second', [repo], undefined, 'turn-2');
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		const resumedAgents = resume.params.config?.['agents'] as Record<string, { description: string; config_file: string }>;
		const resumedRoleFile = await fs.promises.readFile(resumedAgents.Reviewer.config_file, 'utf8');
		peer.push({ id: resume.id, result: { thread: { id: 'thread-workspace-agent', cwd: repo.fsPath }, cwd: repo.fsPath } });
		const inventory = await readNextRequest(peer.outbound);
		peer.push({ id: inventory.id, result: { data: [], nextCursor: null } });
		const secondTurn = await readNextRequest(peer.outbound);
		peer.push({ id: secondTurn.id, result: {} });
		await secondSend;

		assert.deepStrictEqual({
			start: { method: start.method, developerInstructions: start.params.developerInstructions },
			firstTurn: { method: firstTurn.method, developerInstructions: firstTurn.params.collaborationMode?.settings.developer_instructions },
			unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
			resume: { method: resume.method, developerInstructions: resume.params.developerInstructions },
			secondTurn: { method: secondTurn.method, developerInstructions: secondTurn.params.collaborationMode?.settings.developer_instructions },
			resumedRoleFile,
			needsResume: agent['_sessions'].get(AgentSession.id(session))?.needsResume,
		}, {
			start: { method: 'thread/start', developerInstructions: `Use the original instructions.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}` },
			firstTurn: { method: 'turn/start', developerInstructions: `Use the original instructions.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}` },
			unsubscribe: { method: 'thread/unsubscribe', threadId: 'thread-workspace-agent' },
			resume: { method: 'thread/resume', developerInstructions: `Use the updated instructions.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}` },
			secondTurn: { method: 'turn/start', developerInstructions: `Use the updated instructions.\n\n${CODEX_FILE_LINK_INSTRUCTIONS}` },
			resumedRoleFile: 'name = "Reviewer"\ndescription = "Reviews changes"\ndeveloper_instructions = "Use the updated instructions."\n',
			needsResume: false,
		});
		peer.exit();
	});

	test('fresh multi-root start selects only existing secondary skill directories', async () => {
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
		const repoC = URI.file('/repo-c');
		const primarySkills = URI.joinPath(repoA, '.agents', 'skills');
		const repoBAgentsSkills = URI.joinPath(repoB, '.agents', 'skills');
		const repoBCodexSkills = URI.joinPath(repoB, '.codex', 'skills');
		const repoCAgentsSkills = URI.joinPath(repoC, '.agents', 'skills');
		const repoCCodexSkills = URI.joinPath(repoC, '.codex', 'skills');
		const fileService = agent['_fileService'];
		await fileService.createFolder(primarySkills);
		await fileService.createFolder(repoBAgentsSkills);
		await fileService.createFolder(repoBCodexSkills);
		await fileService.createFolder(URI.joinPath(repoC, '.agents'));
		await fileService.createFile(repoCAgentsSkills);
		await fileService.createFolder(repoCCodexSkills);

		try {
			const { session } = await createSession(agent, { workingDirectories: [repoA, repoB, repoC], model: { id: COPILOT_TEST_MODEL } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' } } });
			await entry.materializePromise;

			await fileService.del(repoBAgentsSkills, { recursive: true });
			const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', [repoA, repoB, repoC], undefined, 'turn-1');
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;

			assert.deepStrictEqual({
				startMethod: start.method,
				selectedPaths: start.params.selectedCapabilityRoots?.map(root => root.location.path),
				nextMethodAfterSnapshotMutation: turn.method,
				turnSelectedCapabilityRoots: turn.params.selectedCapabilityRoots,
			}, {
				startMethod: 'thread/start',
				selectedPaths: [repoBAgentsSkills.fsPath, repoBCodexSkills.fsPath, repoCCodexSkills.fsPath],
				nextMethodAfterSnapshotMutation: 'turn/start',
				turnSelectedCapabilityRoots: undefined,
			});
		} finally {
			peer.exit();
		}
	});

	test('unexpected capability-root metadata failures warn without blocking start or exposing paths', async () => {
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
		const repoBAgentsSkills = URI.joinPath(repoB, '.agents', 'skills');
		const repoBCodexSkills = URI.joinPath(repoB, '.codex', 'skills');
		const fileService = agent['_fileService'];
		const logService = agent['_logService'];
		assert.ok(fileService instanceof TestCodexFileService);
		assert.ok(logService instanceof TestCodexLogService);
		await fileService.createFolder(repoBAgentsSkills);
		fileService.failStat(repoBCodexSkills);

		try {
			const { session } = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' } } });
			await entry.materializePromise;
			const capabilityRootWarnings = logService.warnings.filter(warning => warning.includes('selected capability root'));

			assert.deepStrictEqual({
				selectedPaths: start.params.selectedCapabilityRoots?.map(root => root.location.path),
				warningCount: capabilityRootWarnings.length,
				warningIncludesPath: capabilityRootWarnings.some(warning => warning.includes(repoB.fsPath)),
				warningIncludesRawError: capabilityRootWarnings.some(warning => warning.includes('sensitive path')),
			}, {
				selectedPaths: [repoBAgentsSkills.fsPath],
				warningCount: 1,
				warningIncludesPath: false,
				warningIncludesRawError: false,
			});
		} finally {
			peer.exit();
		}
	});

	test('pre-first-turn replacement reevaluates selected capability roots', async () => {
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
		const repoBAgentsSkills = URI.joinPath(repoB, '.agents', 'skills');
		const repoBCodexSkills = URI.joinPath(repoB, '.codex', 'skills');
		const fileService = agent['_fileService'];
		await fileService.createFolder(repoBAgentsSkills);

		try {
			const { session } = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			const firstStart = await readNextRequest(peer.outbound);
			peer.push({ id: firstStart.id, result: { thread: { id: 'thread-first' } } });
			await entry.materializePromise;

			await fileService.del(repoBAgentsSkills, { recursive: true });
			await fileService.createFolder(repoBCodexSkills);
			entry.clientToolSet.set('client', [{
				name: 'test_tool',
				description: 'Test tool',
				inputSchema: { type: 'object' },
			}]);

			const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), 'hello', [repoA, repoB], undefined, 'turn-1');
			const unsubscribe = await readNextRequest(peer.outbound);
			peer.push({ id: unsubscribe.id, result: {} });
			const secondStart = await readNextRequest(peer.outbound);
			peer.push({ id: secondStart.id, result: { thread: { id: 'thread-second' } } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await send;

			assert.deepStrictEqual({
				firstSelectedPaths: firstStart.params.selectedCapabilityRoots?.map(root => root.location.path),
				unsubscribeMethod: unsubscribe.method,
				secondSelectedPaths: secondStart.params.selectedCapabilityRoots?.map(root => root.location.path),
				turnMethod: turn.method,
			}, {
				firstSelectedPaths: [repoBAgentsSkills.fsPath],
				unsubscribeMethod: 'thread/unsubscribe',
				secondSelectedPaths: [repoBCodexSkills.fsPath],
				turnMethod: 'turn/start',
			});
		} finally {
			peer.exit();
		}
	});

	test('thread start maps each permissions preset to its native profile', async () => {
		const agent = await createAgent(disposables);
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const configurationService = agent['_configurationService'];
		assert.ok(configurationService instanceof TestCodexConfigurationService);
		const repo = URI.file('/repo');
		const starts: Record<string, ITestWireRequest> = {};

		try {
			for (const preset of ['default', 'auto-review', 'full-access'] as const) {
				configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: preset });
				const { session } = await createSession(agent, {
					session: AgentSession.uri('codex', `permissions-${preset}`),
					workingDirectories: [repo],
					model: { id: COPILOT_TEST_MODEL },
				});
				const entry = agent['_sessions'].get(AgentSession.id(session))!;
				const start = await readNextRequest(peer.outbound);
				starts[preset] = start;
				peer.push({ id: start.id, result: { thread: { id: `thread-${preset}` } } });
				await entry.materializePromise;
			}

			assert.deepStrictEqual(Object.fromEntries(Object.entries(starts).map(([preset, start]) => [preset, {
				approvalPolicy: start.params.approvalPolicy,
				approvalsReviewer: start.params.approvalsReviewer,
				permissions: start.params.permissions,
				runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
			}])), {
				default: {
					approvalPolicy: 'on-request',
					approvalsReviewer: 'user',
					permissions: 'vscode-workspace',
					runtimeWorkspaceRoots: [repo.fsPath],
				},
				'auto-review': {
					approvalPolicy: 'on-request',
					approvalsReviewer: 'auto_review',
					permissions: 'vscode-workspace',
					runtimeWorkspaceRoots: [repo.fsPath],
				},
				'full-access': {
					approvalPolicy: 'never',
					approvalsReviewer: 'user',
					permissions: ':danger-full-access',
					runtimeWorkspaceRoots: undefined,
				},
			});
		} finally {
			peer.exit();
		}
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
			const { session } = await createSession(agent, { session: sessionUri, workingDirectories, model: { id: COPILOT_TEST_MODEL } });
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
			configurationService.setSessionConfig({
				[CodexSessionConfigKey.PermissionsPreset]: 'auto-review',
				[CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory],
			});
			const autoReview = agent['_turnStartOptions'](entry, 'gpt-test');
			configurationService.setSessionConfig({
				[CodexSessionConfigKey.PermissionsPreset]: 'default',
				[CodexSessionConfigKey.NetworkAccessEnabled]: true,
				[CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory],
			});
			const networkAccess = agent['_turnStartOptions'](entry, 'gpt-test');
			configurationService.setSessionConfig({
				[CodexSessionConfigKey.PermissionsPreset]: 'full-access',
				[CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory],
			});
			const fullAccess = agent['_turnStartOptions'](entry, 'gpt-test');
			entry.agentMergeTurn = true;
			const agentMerge = agent['_turnStartOptions'](entry, 'gpt-test');
			entry.agentMergeTurn = false;
			configurationService.setSessionConfig({
				[CodexSessionConfigKey.SandboxMode]: 'read-only',
				[CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory],
			});
			const readOnly = agent['_turnStartOptions'](entry, 'gpt-test');

			assert.deepStrictEqual({
				start: {
					cwd: start.params.cwd,
					runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: start.params.selectedCapabilityRoots,
					approvalPolicy: start.params.approvalPolicy,
					approvalsReviewer: start.params.approvalsReviewer,
					permissions: start.params.permissions,
				},
				turn: {
					runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: turn.params.selectedCapabilityRoots,
					approvalPolicy: turn.params.approvalPolicy,
					approvalsReviewer: turn.params.approvalsReviewer,
					permissions: turn.params.permissions,
				},
				autoReview,
				networkAccess: {
					runtimeWorkspaceRoots: networkAccess.runtimeWorkspaceRoots,
					permissions: networkAccess.permissions,
				},
				fullAccess: {
					approvalPolicy: fullAccess.approvalPolicy,
					runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
					permissions: fullAccess.permissions,
				},
				agentMerge: {
					approvalPolicy: agentMerge.approvalPolicy,
					runtimeWorkspaceRoots: agentMerge.runtimeWorkspaceRoots,
					permissions: agentMerge.permissions,
				},
				readOnly: {
					runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
					permissions: readOnly.permissions,
				},
			}, {
				start: {
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
					selectedCapabilityRoots: undefined,
					approvalPolicy: 'on-request',
					approvalsReviewer: 'user',
					permissions: 'vscode-workspace',
				},
				turn: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
					selectedCapabilityRoots: undefined,
					approvalPolicy: 'on-request',
					approvalsReviewer: 'user',
					permissions: 'vscode-workspace',
				},
				autoReview: {
					approvalPolicy: 'on-request',
					permissions: 'vscode-workspace',
					approvalsReviewer: 'auto_review',
					effort: 'medium',
					personality: 'none',
					summary: 'auto',
					collaborationMode: {
						mode: 'default',
						settings: { model: 'gpt-test', reasoning_effort: 'medium', developer_instructions: null },
					},
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
				},
				networkAccess: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
					permissions: 'vscode-workspace-network',
				},
				fullAccess: {
					approvalPolicy: 'never',
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					permissions: ':danger-full-access',
				},
				agentMerge: {
					approvalPolicy: 'on-request',
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
					permissions: 'vscode-workspace',
				},
				readOnly: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					permissions: 'vscode-workspace-read-only',
				},
			});
		} finally {
			peer.exit();
		}
	});

	test('consecutive sends replace and remove workspace roots on the existing thread', async () => {
		const agent = await createAgent(disposables, { multiRootEnabled: true });
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repoA = URI.file('/repo-a');
		const repoB = URI.file('/repo-b');
		const repoC = URI.file('/repo-c');

		try {
			const created = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
			const entry = agent['_sessions'].get(AgentSession.id(created.session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'thread' } } });
			await entry.materializePromise;

			const firstSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), 'first', [repoA, repoB], undefined, 'turn-1');
			const firstTurn = await readNextRequest(peer.outbound);
			peer.push({ id: firstTurn.id, result: {} });
			await firstSend;

			const secondSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), 'second', [repoA, repoC], undefined, 'turn-2');
			const secondTurn = await readNextRequest(peer.outbound);
			peer.push({ id: secondTurn.id, result: {} });
			await secondSend;

			const thirdSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), 'third', [repoA], undefined, 'turn-3');
			const thirdTurn = await readNextRequest(peer.outbound);
			peer.push({ id: thirdTurn.id, result: {} });
			await thirdSend;

			assert.deepStrictEqual({
				second: {
					method: secondTurn.method,
					threadId: secondTurn.params.threadId,
					runtimeWorkspaceRoots: secondTurn.params.runtimeWorkspaceRoots,
					permissions: secondTurn.params.permissions,
				},
				third: {
					method: thirdTurn.method,
					threadId: thirdTurn.params.threadId,
					runtimeWorkspaceRoots: thirdTurn.params.runtimeWorkspaceRoots,
					permissions: thirdTurn.params.permissions,
				},
			}, {
				second: {
					method: 'turn/start',
					threadId: 'thread',
					runtimeWorkspaceRoots: [repoA.fsPath, repoC.fsPath],
					permissions: 'vscode-workspace',
				},
				third: {
					method: 'turn/start',
					threadId: 'thread',
					runtimeWorkspaceRoots: [repoA.fsPath],
					permissions: 'vscode-workspace',
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
			const { session } = await createSession(agent, { session: sessionUri, workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
				startSelectedCapabilityRoots: start.params.selectedCapabilityRoots,
				turnRuntimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
				turnSelectedCapabilityRoots: turn.params.selectedCapabilityRoots,
				permissions: turn.params.permissions,
			}, {
				startRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
				startSelectedCapabilityRoots: undefined,
				turnRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
				turnSelectedCapabilityRoots: undefined,
				permissions: 'vscode-workspace',
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
			const { session } = await createSession(agent, { session: sessionUri, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
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
					selectedCapabilityRoots: start.params.selectedCapabilityRoots,
				},
				turn: {
					runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: turn.params.selectedCapabilityRoots,
					permissions: turn.params.permissions,
				},
				fullAccess: {
					runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
					permissions: fullAccess.permissions,
				},
				readOnly: {
					runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
					permissions: readOnly.permissions,
				},
			}, {
				start: {
					cwd: repo.fsPath,
					runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
					selectedCapabilityRoots: undefined,
				},
				turn: {
					runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
					selectedCapabilityRoots: undefined,
					permissions: 'vscode-workspace',
				},
				fullAccess: {
					runtimeWorkspaceRoots: undefined,
					permissions: ':danger-full-access',
				},
				readOnly: {
					runtimeWorkspaceRoots: [repo.fsPath],
					permissions: 'vscode-workspace-read-only',
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
			const source = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
			const sourceEntry = agent['_sessions'].get(AgentSession.id(source.session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'source-thread' }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
			await sourceEntry.materializePromise;

			const forkPromise = createSession(agent, {
				workingDirectories: [requestedA, requestedB],
				fork: { source: defaultChatOf(source.session), turnId: 'turn-1', turnIndex: 0 },
				config: { [CodexSessionConfigKey.PermissionsPreset]: 'auto-review' },
			});

			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: {
					thread: {
						id: 'source-thread',
						cwd: repoA.fsPath,
						historyMode: 'paginated',
						turns: [],
					},
				},
			});
			const historyPage = await readNextRequest(peer.outbound);
			peer.push({ id: historyPage.id, result: { data: [{ id: 'turn-1' }], nextCursor: null, backwardsCursor: null } });
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
					model: fork.params.model,
					modelProvider: fork.params.modelProvider,
					selectedCapabilityRoots: fork.params.selectedCapabilityRoots,
					approvalPolicy: fork.params.approvalPolicy,
					approvalsReviewer: fork.params.approvalsReviewer,
					permissions: fork.params.permissions,
				},
				workingDirectories: forkedEntry.workingDirectories?.map(directory => directory.fsPath),
			}, {
				request: {
					method: 'thread/fork',
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					model: 'gpt-test',
					modelProvider: 'vscode-proxy',
					selectedCapabilityRoots: undefined,
					approvalPolicy: 'on-request',
					approvalsReviewer: 'auto_review',
					permissions: 'vscode-workspace',
				},
				workingDirectories: [repoA.fsPath, repoB.fsPath],
			});
		} finally {
			peer.exit();
		}
	});

	test('fork keeps additional writable directories out of workspace state', async () => {
		const additionalDirectory = URI.file('/manual-write').fsPath;
		const agent = await createAgent(disposables, {
			multiRootEnabled: true,
			sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] },
		});
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const repo = URI.file('/repo');
		const requested = URI.file('/requested');

		try {
			const source = await createSession(agent, { workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
			const sourceEntry = agent['_sessions'].get(AgentSession.id(source.session))!;
			const start = await readNextRequest(peer.outbound);
			peer.push({ id: start.id, result: { thread: { id: 'source-thread' }, cwd: repo.fsPath, runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory] } });
			await sourceEntry.materializePromise;

			const forkPromise = createSession(agent, {
				workingDirectories: [requested],
				fork: { source: defaultChatOf(source.session), turnId: 'turn-1', turnIndex: 0 },
			});
			const read = await readNextRequest(peer.outbound);
			peer.push({
				id: read.id,
				result: {
					thread: {
						id: 'source-thread',
						cwd: repo.fsPath,
						historyMode: 'paginated',
						turns: [],
					},
				},
			});
			const historyPage = await readNextRequest(peer.outbound);
			peer.push({ id: historyPage.id, result: { data: [{ id: 'turn-1' }], nextCursor: null, backwardsCursor: null } });
			const fork = await readNextRequest(peer.outbound);
			peer.push({
				id: fork.id,
				result: {
					thread: { id: 'fork-thread', cwd: repo.fsPath },
					cwd: repo.fsPath,
					runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
				},
			});
			const forked = await forkPromise;
			const forkedEntry = agent['_sessions'].get(AgentSession.id(forked.session))!;
			const configurationService = agent['_configurationService'];
			assert.ok(configurationService instanceof TestCodexConfigurationService);
			configurationService.setSessionConfig({ [CodexSessionConfigKey.AdditionalDirectories]: [] });
			const afterClear = agent['_turnStartOptions'](forkedEntry, 'gpt-test');

			assert.deepStrictEqual({
				startRuntimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
				forkRuntimeWorkspaceRoots: fork.params.runtimeWorkspaceRoots,
				forkedWorkingDirectories: forkedEntry.workingDirectories?.map(directory => directory.fsPath),
				afterClearRuntimeWorkspaceRoots: afterClear.runtimeWorkspaceRoots,
			}, {
				startRuntimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
				forkRuntimeWorkspaceRoots: undefined,
				forkedWorkingDirectories: [repo.fsPath],
				afterClearRuntimeWorkspaceRoots: [repo.fsPath],
			});
		} finally {
			peer.exit();
		}
	});

	test('fork from a workspace-less session owns an independent managed directory', async () => {
		const agent = await createAgent(disposables, {
			sessionConfig: {
				[CodexSessionConfigKey.PermissionsPreset]: 'default',
				[CodexSessionConfigKey.NetworkAccessEnabled]: true,
			},
		});
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };

		const source = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const sourceChat = defaultChatOf(source.session);
		const sourceEntry = agent['_sessions'].get(AgentSession.id(source.session))!;
		// A workspace-less session is not prewarmed (there is no directory to
		// start a thread in yet), so its first send materializes the thread in
		// the managed temp folder Codex creates for it.
		const sending = agent.chats.sendMessage(sourceChat, 'hello', undefined, undefined, 'turn-1');
		const start = await readNextRequest(peer.outbound);
		assert.strictEqual(start.params.config?.['features.default_mode_request_user_input'], true);
		assert.ok(start.params.developerInstructions?.includes(AGENT_HOST_WORKSPACELESS_INSTRUCTIONS));
		assert.deepStrictEqual({
			approvalPolicy: start.params.approvalPolicy,
			permissions: start.params.permissions,
		}, {
			approvalPolicy: 'on-request',
			permissions: 'vscode-workspace-network',
		});
		peer.push({ id: start.id, result: { thread: { id: 'managed-source', cwd: start.params.cwd } } });
		const sourceTurn = await readNextRequest(peer.outbound);
		assert.ok(sourceTurn.params.collaborationMode?.settings.developer_instructions?.includes(AGENT_HOST_WORKSPACELESS_INSTRUCTIONS));
		assert.deepStrictEqual({
			approvalPolicy: sourceTurn.params.approvalPolicy,
			permissions: sourceTurn.params.permissions,
			runtimeWorkspaceRoots: sourceTurn.params.runtimeWorkspaceRoots,
		}, {
			approvalPolicy: 'on-request',
			permissions: 'vscode-workspace-network',
			runtimeWorkspaceRoots: [start.params.cwd],
		});
		peer.push({ id: sourceTurn.id, result: {} });
		await sending;
		const sourceDirectory = sourceEntry.managedWorkingDirectory;
		assert.ok(sourceDirectory);
		await fs.promises.writeFile(join(sourceDirectory.fsPath, 'marker.txt'), 'fork me');

		// A fork is provisioned through the same exact-chat seam as a fresh
		// session, so the test mints the target chat the way the host does.
		const forkSession = AgentSession.uri(agent.id, generateUuid());
		const forkChat = defaultChatOf(forkSession);
		const forking = createSession(agent, {
			session: forkSession,
			fork: { source: sourceChat, turnId: 'turn-1', turnIndex: 0 },
		});
		const read = await readNextRequest(peer.outbound);
		peer.push({
			id: read.id,
			result: {
				thread: {
					id: 'managed-source',
					cwd: sourceDirectory.fsPath,
					historyMode: 'paginated',
					turns: [],
				},
			},
		});
		const historyPage = await readNextRequest(peer.outbound);
		peer.push({ id: historyPage.id, result: { data: [{ id: 'turn-1' }], nextCursor: null, backwardsCursor: null } });
		const fork = await readNextRequest(peer.outbound);
		const forkDirectory = fork.params.cwd;
		assert.ok(forkDirectory);
		assert.notStrictEqual(forkDirectory, sourceDirectory.fsPath);
		assert.deepStrictEqual({
			approvalPolicy: fork.params.approvalPolicy,
			permissions: fork.params.permissions,
			requestUserInput: fork.params.config?.['features.default_mode_request_user_input'],
		}, { approvalPolicy: 'on-request', permissions: 'vscode-workspace-network', requestUserInput: true });
		peer.push({
			id: fork.id,
			result: {
				thread: { id: 'managed-fork', cwd: forkDirectory },
				cwd: forkDirectory,
			},
		});
		const forked = await forking;
		const forkedEntry = agent['_sessions'].get(AgentSession.id(forked.session))!;
		const forkInventory = await readNextRequest(peer.outbound);
		peer.push({ id: forkInventory.id, result: { data: [], nextCursor: null } });

		// Teardown runs the way Agent Host runs it: dispose each session's own
		// chat. Configuration-scope ref tracking reclaims a managed working
		// directory automatically once a scope's last chat is disposed, keyed
		// by that scope's own configuration resource — so disposing the
		// source's chat here can never read or delete the fork's directory.
		const disposingSource = agent.chats.disposeChat(sourceChat, { configurationResource: source.session, resource: sourceChat });
		const sourceUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: sourceUnsubscribe.id, result: {} });
		await disposingSource;

		assert.deepStrictEqual({
			forkRequest: { method: fork.method, cwd: fork.params.cwd },
			forkInventory: { method: forkInventory.method, threadId: forkInventory.params.threadId },
			forkOwnsManagedDirectory: forkedEntry.managedWorkingDirectory?.fsPath,
			sourceDirectoryExists: fs.existsSync(sourceDirectory.fsPath),
			forkDirectoryExists: fs.existsSync(forkDirectory),
			copiedMarker: await fs.promises.readFile(join(forkDirectory, 'marker.txt'), 'utf8'),
		}, {
			forkRequest: { method: 'thread/fork', cwd: forkDirectory },
			forkInventory: { method: 'mcpServerStatus/list', threadId: 'managed-fork' },
			forkOwnsManagedDirectory: forkDirectory,
			sourceDirectoryExists: false,
			forkDirectoryExists: true,
			copiedMarker: 'fork me',
		});

		// Disposing the fork's own (only) chat drops its configuration scope's
		// ref count to zero, so the reclaim runs inline — no separate
		// finalize call is needed.
		const disposingFork = agent.chats.disposeChat(forkChat, { configurationResource: forked.session, resource: forkChat });
		const forkUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: forkUnsubscribe.id, result: {} });
		await disposingFork;
		assert.strictEqual(fs.existsSync(forkDirectory), false);
		peer.exit();
	});

	test('workspace-less turns honor the full-access permissions preset', async () => {
		const agent = await createAgent(disposables, { sessionConfig: { [CodexSessionConfigKey.PermissionsPreset]: 'full-access' } });
		const source = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(source.session))!;
		entry.managedWorkingDirectory = URI.file('/scratch/permissions');
		const options = agent['_turnStartOptions'](entry, 'gpt-test');
		assert.deepStrictEqual({ approvalPolicy: options.approvalPolicy, permissions: options.permissions }, {
			approvalPolicy: 'never', permissions: ':danger-full-access',
		});
		entry.managedWorkingDirectory = undefined;
	});

	const serverToolApprovalCases: readonly {
		readonly name: string;
		readonly config: Readonly<Record<string, string>>;
		readonly requiresConfirmation: boolean;
		readonly agentMergeTurn?: boolean;
		readonly approved?: boolean;
	}[] = [
			{ name: 'full-access preset', config: { [CodexSessionConfigKey.PermissionsPreset]: 'full-access' }, requiresConfirmation: false },
			{ name: 'legacy full-access permissions', config: { [CodexSessionConfigKey.ApprovalPolicy]: 'never', [CodexSessionConfigKey.SandboxMode]: 'danger-full-access' }, requiresConfirmation: false },
			{ name: 'default permissions', config: {}, requiresConfirmation: true },
			{ name: 'auto-review preset', config: { [CodexSessionConfigKey.PermissionsPreset]: 'auto-review' }, requiresConfirmation: true },
			{ name: 'never with read-only sandbox', config: { [CodexSessionConfigKey.ApprovalPolicy]: 'never', [CodexSessionConfigKey.SandboxMode]: 'read-only' }, requiresConfirmation: true },
			{ name: 'never with workspace-write sandbox', config: { [CodexSessionConfigKey.ApprovalPolicy]: 'never', [CodexSessionConfigKey.SandboxMode]: 'workspace-write' }, requiresConfirmation: true },
			{ name: 'Agent Merge with full access', config: { [CodexSessionConfigKey.PermissionsPreset]: 'full-access' }, requiresConfirmation: true, agentMergeTurn: true },
			{ name: 'denied default approval', config: {}, requiresConfirmation: true, approved: false },
		];

	for (const scenario of serverToolApprovalCases) {
		test(`workspace-less server tool approval honors ${scenario.name}`, async () => {
			const agent = await createAgent(disposables, { sessionConfig: scenario.config });
			const tool = sessionServerToolDefinitions.find(definition => definition.name === SessionServerToolName.SetWorkspace)!;
			const executions: { readonly chatUri: string; readonly toolName: string }[] = [];
			agent.setServerToolHost({
				definitions: [tool],
				toolNames: [tool.name],
				advertise: () => { },
				getDefinitionsForSession: () => [tool],
				canRequireConfirmation: sessionToolRequiresConfirmation,
				requiresConfirmation: (_chatUri, toolName) => sessionToolRequiresConfirmation(toolName),
				executeTool: (chatUri, toolName) => {
					executions.push({ chatUri, toolName });
					return 'Workspace change scheduled';
				},
			});
			const { session } = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
			const entry = agent['_sessions'].get(AgentSession.id(session))!;
			entry.threadId = 'server-tool-thread';
			entry.agentMergeTurn = scenario.agentMergeTurn;
			agent['_sessionIdByThreadId'].set(entry.threadId, entry.sessionId);
			entry.mapState.itemToToolCall.set('call-1', { toolCallId: 'tool-1', turnId: 'turn-1', toolName: tool.name, output: '' });
			const confirmations: StringOrMarkdown[] = [];
			const executionsBeforeApproval: number[] = [];
			disposables.add(agent.onDidChatProgress(signal => {
				if (signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallReady && signal.action.confirmationTitle) {
					confirmations.push(signal.action.confirmationTitle);
					executionsBeforeApproval.push(executions.length);
					agent.respondToPermissionRequest(signal.action.toolCallId, scenario.approved !== false);
				}
			}));

			const response = await agent['_handleDynamicToolCallRpc']({
				threadId: entry.threadId,
				turnId: 'turn-1',
				callId: 'call-1',
				namespace: null,
				tool: tool.name,
				arguments: { workspaceFolder: '/workspace/app', isolation: true },
			});

			assert.deepStrictEqual({
				confirmations,
				executionsBeforeApproval,
				executions,
				success: response.result?.success,
				approvalPending: entry.pendingCommandApprovals.has('tool-1'),
			}, {
				confirmations: scenario.requiresConfirmation ? ['Continue in app?'] : [],
				executionsBeforeApproval: scenario.requiresConfirmation ? [0] : [],
				executions: scenario.approved === false ? [] : [{ chatUri: defaultChatOf(session).toString(), toolName: tool.name }],
				success: scenario.approved !== false,
				approvalPending: false,
			});
		});
	}

	test('conversion releases scratch ownership only after confirmation and forks in the attached workspace', async () => {
		const database = new TestSessionDatabase();
		const agent = await createAgent(disposables, { database });
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = { kind: 'ready', client, usageSource: 'github', child: { kill: () => true } } as never;
		agent['_registerWorkingDirectoryNotifications'](client, disposables.add(new DisposableStore()));
		disposables.add(client.onNotification('turn/started', params => agent['_dispatchByThread'](params.threadId, session => agent['_handleTurnStartedNotification'](session, params))));
		disposables.add(client.onNotification('turn/completed', params => agent['_dispatchTurnCompleted'](params)));
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		agent['_refreshMcpInventory'] = async () => { };
		const source = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const sourceChat = defaultChatOf(source.session);
		const sourceEntry = agent['_sessions'].get(AgentSession.id(source.session))!;
		const sending = agent.chats.sendMessage(sourceChat, 'Add a welcome paragraph to the README', undefined, undefined, 'turn-1');
		const start = await readNextRequest(peer.outbound);
		peer.push({ id: start.id, result: { thread: { id: 'managed-source', cwd: start.params.cwd } } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await sending;
		const appTurn = { id: 'turn-1', items: [], itemsView: 'full', status: 'completed', error: null, startedAt: 1, completedAt: 2, durationMs: 1000 };
		peer.push({ method: 'turn/started', params: { threadId: 'managed-source', turn: { ...appTurn, status: 'inProgress' } } });
		peer.push({ method: 'turn/completed', params: { threadId: 'managed-source', turn: appTurn } });
		const scratch = sourceEntry.managedWorkingDirectory!;
		assert.strictEqual((await agent['_metadataStore'].read(source.session)).managedWorkingDirectory?.fsPath, scratch.fsPath);
		const folder = URI.file('/workspace/converted');
		await agent['_fileService'].createFolder(folder);
		const changing = agent.setWorkingDirectory(sourceChat, source.session, folder);
		const update = await readNextRequest(peer.outbound);
		peer.push({ id: update.id, result: {} });
		await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual({ cwd: sourceEntry.workingDirectory?.fsPath, scratchExists: fs.existsSync(scratch.fsPath) }, {
			cwd: scratch.fsPath, scratchExists: true,
		});
		peer.push({ method: 'thread/settings/updated', params: { threadId: 'managed-source', threadSettings: { cwd: folder.fsPath } } });
		await changing;
		const metadata = await agent['_metadataStore'].read(source.session);
		assert.strictEqual(await database.getMetadata('codex.ownsManagedWorkingDirectory'), 'false');

		const forkSession = AgentSession.uri(agent.id, generateUuid());
		const forkChat = defaultChatOf(forkSession);
		const forking = createSession(agent, { session: forkSession, fork: { source: sourceChat, turnId: 'turn-1', turnIndex: 0 } });
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		peer.push({ id: resume.id, result: { thread: { id: 'managed-source', cwd: folder.fsPath } } });
		const read = await readNextRequest(peer.outbound);
		peer.push({ id: read.id, result: { thread: { id: 'managed-source', cwd: folder.fsPath, historyMode: 'paginated', turns: [] } } });
		const history = await readNextRequest(peer.outbound);
		peer.push({ id: history.id, result: { data: [{ id: 'turn-1' }], nextCursor: null, backwardsCursor: null } });
		const fork = await readNextRequest(peer.outbound);
		peer.push({ id: fork.id, result: { thread: { id: 'converted-fork', cwd: folder.fsPath }, cwd: folder.fsPath } });
		await forking;
		const forkEntry = agent['_sessions'].get(AgentSession.id(forkSession))!;
		assert.deepStrictEqual({
			resume: { method: resume.method, cwd: resume.params.cwd },
			fork: { method: fork.method, threadId: fork.params.threadId, cwd: fork.params.cwd },
			sourceManagedDirectory: sourceEntry.managedWorkingDirectory,
			persistedManagedDirectory: metadata.managedWorkingDirectory,
			ownsManagedWorkingDirectory: metadata.ownsManagedWorkingDirectory,
			forkManagedDirectory: forkEntry.managedWorkingDirectory,
			forkDirectory: forkEntry.workingDirectory?.fsPath,
			scratchExists: fs.existsSync(scratch.fsPath),
		}, {
			resume: { method: 'thread/resume', cwd: folder.fsPath },
			fork: { method: 'thread/fork', threadId: 'managed-source', cwd: undefined },
			sourceManagedDirectory: undefined, persistedManagedDirectory: undefined, ownsManagedWorkingDirectory: undefined,
			forkManagedDirectory: undefined, forkDirectory: folder.fsPath, scratchExists: false,
		});
		for (const { chat, session } of [{ chat: sourceChat, session: source.session }, { chat: forkChat, session: forkSession }]) {
			const disposing = agent.chats.disposeChat(chat, { configurationResource: session, resource: chat });
			const release = await readNextRequest(peer.outbound);
			peer.push({ id: release.id, result: {} });
			await disposing;
		}
		peer.exit();
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
			const created = await createSession(agentA, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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

			const agentB = await createAgent(disposables, {
				multiRootEnabled: true,
				database,
				sessionConfig: { [CodexSessionConfigKey.PermissionsPreset]: 'auto-review' },
			});
			peerB = disposables.add(createTestPeer());
			agentB['_connection'] = {
				kind: 'ready',
				client: new CodexAppServerClient(peerB.transport),
				usageSource: 'github',
				child: { kill: () => true },
			} as never;
			agentB['_refreshSkillHookCustomizations'] = async () => { };
			agentB['_refreshSkillExtraRoots'] = async () => { };

			const restoredChat = defaultChatOf(created.session);
			const metadataPromise = agentB.getChatMetadata(restoredChat, { configurationResource: created.session, resource: restoredChat });
			const originalProbe = await readNextRequest(peerB.outbound);
			assert.strictEqual(originalProbe.params.threadId, AgentSession.id(created.session));
			assert.strictEqual(originalProbe.params.includeTurns, false);
			peerB.push({ id: originalProbe.id, error: { code: -32000, message: 'thread not found' } });
			const read = await readNextRequest(peerB.outbound);
			assert.strictEqual(read.params.includeTurns, false);
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
			assert.strictEqual(peerB.outbound.readableLength, 0);

			// Mirror Agent Host restore: metadata discovery identifies the cold
			// runtime, then the chat's opaque backing re-attaches that runtime to
			// this exact chat before any chat-addressed operation can reach it.
			await agentB.materializeChat(restoredChat, { configurationResource: created.session, resource: restoredChat }, created.providerData);
			const resumedSend = agentB.chats.sendMessage(restoredChat, 'again', undefined, undefined, 'turn-2', undefined, undefined, { configurationResource: created.session, resource: restoredChat });
			const reloadUnsubscribe = await readNextRequest(peerB.outbound);
			assert.strictEqual(reloadUnsubscribe.method, 'thread/unsubscribe');
			peerB.push({ id: reloadUnsubscribe.id, result: {} });
			const resume = await readNextRequest(peerB.outbound);
			peerB.push({
				id: resume.id,
				result: {
					thread: { id: 'thread', cwd: repoA.fsPath },
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				},
			});
			const resumedStatus = await readNextRequest(peerB.outbound);
			assert.strictEqual(resumedStatus.method, 'mcpServerStatus/list');
			peerB.push({ id: resumedStatus.id, result: { data: [], nextCursor: null } });
			const resumedTurn = await readNextRequest(peerB.outbound);
			peerB.push({ id: resumedTurn.id, result: {} });
			await resumedSend;

			assert.deepStrictEqual({
				canonicalOverlay: canonicalOverlay.workingDirectories?.map(directory => directory.fsPath),
				metadata: metadata?.workingDirectories?.map(directory => directory.fsPath),
				resume: {
					unsubscribe: reloadUnsubscribe.method,
					cwd: resume.params.cwd,
					runtimeWorkspaceRoots: resume.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: resume.params.selectedCapabilityRoots,
					approvalPolicy: resume.params.approvalPolicy,
					approvalsReviewer: resume.params.approvalsReviewer,
					permissions: resume.params.permissions,
				},
				turn: {
					runtimeWorkspaceRoots: resumedTurn.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: resumedTurn.params.selectedCapabilityRoots,
					approvalPolicy: resumedTurn.params.approvalPolicy,
					approvalsReviewer: resumedTurn.params.approvalsReviewer,
					permissions: resumedTurn.params.permissions,
				},
			}, {
				canonicalOverlay: [repoA.fsPath, repoB.fsPath],
				metadata: [repoA.fsPath, repoB.fsPath],
				resume: {
					unsubscribe: 'thread/unsubscribe',
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					selectedCapabilityRoots: undefined,
					approvalPolicy: 'on-request',
					approvalsReviewer: 'auto_review',
					permissions: 'vscode-workspace',
				},
				turn: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					selectedCapabilityRoots: undefined,
					approvalPolicy: 'on-request',
					approvalsReviewer: 'auto_review',
					permissions: 'vscode-workspace',
				},
			});
		} finally {
			peerB?.exit();
			peerA.exit();
		}
	});

	test('reads a Desktop thread owned by another app and continues with an available native fallback', async () => {
		const database = new TestSessionDatabase();
		const agent = await createAgent(disposables, { database });
		const modelId = 'desktop-only-model';
		const selectedModelId = toCodexModelSelectionId('openai', modelId);
		const baseModel = agent.models.get()[0];
		agent['_models'].set([
			baseModel,
			{ ...baseModel, id: OPENAI_TEST_MODEL },
			{ ...baseModel, id: toCodexModelSelectionId('vscode-proxy', modelId) },
		], undefined);
		const peer = disposables.add(createTestPeer());
		const client = disposables.add(new CodexAppServerClient(peer.transport));
		agent['_connection'] = { kind: 'ready', client, usageSource: 'github', child: { kill: () => true } } as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const session = AgentSession.uri('codex', 'desktop-thread');
		const chat = defaultChatOf(session);
		const context = chatContext(session, chat);
		const workingDirectory = URI.file('/workspace/codex');
		const sessionsDirectory = URI.joinPath(agent['_environmentService'].userHome, '.codex', 'sessions');
		const rollout = URI.joinPath(sessionsDirectory, 'desktop-thread.jsonl');
		await agent['_fileService'].createFolder(sessionsDirectory);
		await agent['_fileService'].createFile(rollout, VSBuffer.fromString([
			JSON.stringify({ type: 'session_meta', payload: { originator: 'Codex Desktop', model_provider: 'openai' } }),
			JSON.stringify({ type: 'turn_context', payload: { turn_id: 'desktop-turn', model: modelId } }),
		].join('\n')));
		const thread = {
			id: 'desktop-thread',
			cwd: workingDirectory.fsPath,
			modelProvider: 'openai',
			path: rollout.fsPath,
			source: 'vscode',
			historyMode: 'paginated',
			turns: [],
		};
		const persistedTurn = {
			id: 'desktop-turn',
			items: [
				{ type: 'userMessage', id: 'user-1', clientId: null, content: [{ type: 'text', text: 'remember capybara', text_elements: [] }] },
				{ type: 'agentMessage', id: 'assistant-1', text: 'I will remember capybara.', phase: 'final_answer', memoryCitation: null },
			],
			itemsView: { type: 'full' },
			status: 'completed',
			error: null,
			startedAt: 1,
			completedAt: 2,
			durationMs: 1000,
		};
		const responses: Record<string, object> = {
			'thread/read': { thread },
			'thread/unsubscribe': {},
			'thread/resume': { thread, cwd: workingDirectory.fsPath },
			'mcpServerStatus/list': { data: [], nextCursor: null },
			'thread/turns/list': { data: [persistedTurn], nextCursor: null, backwardsCursor: null },
			'turn/start': {},
		};
		const requests: ITestWireRequest[] = [];
		let externalWriterActive = true;
		disposables.add(Event.fromNodeEventEmitter<Buffer>(peer.outbound, 'data')(chunk => {
			const request: ITestWireRequest = JSON.parse(chunk.toString('utf8'));
			requests.push(request);
			if (request.method === 'thread/resume' && externalWriterActive) {
				peer.push({ id: request.id, error: { code: -32600, message: 'thread desktop-thread already has an active writer' } });
				return;
			}
			assert.ok(responses[request.method], `Unexpected request: ${request.method}`);
			peer.push({ id: request.id, result: responses[request.method] });
		}));

		const metadata = await agent.getChatMetadata(chat, context);
		await agent.materializeChat(chat, context, undefined);
		const history = await agent.chats.getMessages(chat, context);
		const needsResumeAfterRead = agent['_sessions'].get('desktop-thread')?.needsResume;
		const modelAfterRead = agent['_sessions'].get('desktop-thread')?.model;
		externalWriterActive = false;
		await agent.chats.sendMessage(chat, 'continue here', [workingDirectory], undefined, 'turn-1', undefined, undefined, context);

		assert.deepStrictEqual({
			metadataModel: metadata?.model?.id,
			needsResumeAfterRead,
			modelAfterRead,
			history: history.map(turn => ({ id: turn.id, text: turn.message.text, model: turn.message.model?.id })),
			requests: requests.map(request => ({ method: request.method, threadId: request.params.threadId })),
			resumeProvider: requests.find(request => request.method === 'thread/resume')?.params.modelProvider,
			resumeModel: requests.find(request => request.method === 'thread/resume')?.params.model,
			turnModel: requests.find(request => request.method === 'turn/start')?.params.model,
			persistedThreadId: await database.getMetadata('codex.threadId'),
			persistedModelId: await database.getMetadata('codex.model'),
		}, {
			metadataModel: OPENAI_TEST_MODEL,
			needsResumeAfterRead: true,
			modelAfterRead: { id: OPENAI_TEST_MODEL },
			history: [{ id: 'desktop-turn', text: 'remember capybara', model: selectedModelId }],
			requests: ['thread/read', 'thread/read', 'thread/turns/list', 'thread/unsubscribe', 'thread/resume', 'mcpServerStatus/list', 'turn/start']
				.map(method => ({ method, threadId: 'desktop-thread' })),
			resumeProvider: 'openai',
			resumeModel: 'gpt-5.6-sol',
			turnModel: 'gpt-5.6-sol',
			persistedThreadId: 'desktop-thread',
			persistedModelId: OPENAI_TEST_MODEL,
		});
		peer.exit();
	});

	test('directly restored Desktop thread heals a stale overlay and uses the latest rollout provider', async () => {
		const database = new TestSessionDatabase();
		await Promise.all([
			database.setMetadata('codex.threadId', 'replacement-thread'),
			database.setMetadata('codex.model', OPENAI_TEST_MODEL),
		]);
		const telemetryService = new TestCodexTelemetryService();
		const agent = await createAgent(disposables, { database, telemetryService });
		const baseModel = agent.models.get()[0];
		agent['_models'].set([
			{ ...baseModel, id: COPILOT_TEST_MODEL },
			{ ...baseModel, id: OPENAI_TEST_MODEL },
		], undefined);
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const session = AgentSession.uri('codex', 'desktop-thread');
		const chat = defaultChatOf(session);
		const context = { configurationResource: session, resource: chat };
		const workingDirectory = URI.file('/workspace/codex');
		const sessionsDirectory = URI.joinPath(agent['_environmentService'].userHome, '.codex', 'sessions');
		const rollout = URI.joinPath(sessionsDirectory, 'desktop-thread.jsonl');
		await agent['_fileService'].createFolder(sessionsDirectory);
		await agent['_fileService'].createFile(rollout, VSBuffer.fromString([
			'{"type":"session_meta","payload":{"originator":"Codex Desktop","model_provider":"openai"}}',
			'{"type":"event_msg","payload":{"type":"thread_settings_applied","thread_settings":{"model":"gpt-test","model_provider_id":"vscode-proxy"}}}',
			'{"type":"event_msg","payload":{"type":"task_started","turn_id":"desktop-turn"}}',
			'{"type":"turn_context","payload":{"turn_id":"desktop-turn","model":"gpt-test"}}',
		].join('\n')));
		const persistedTurn = {
			id: 'desktop-turn',
			items: [
				{ type: 'userMessage', id: 'user-1', clientId: null, content: [{ type: 'text', text: 'remember capybara', text_elements: [] }] },
				{ type: 'agentMessage', id: 'assistant-1', text: 'I will remember capybara.', phase: 'final_answer', memoryCitation: null },
			],
			itemsView: { type: 'full' },
			status: 'completed',
			error: null,
			startedAt: 1,
			completedAt: 2,
			durationMs: 1000,
		};

		const metadataPromise = agent.getChatMetadata(chat, context);
		const metadataRead = await readNextRequest(peer.outbound);
		assert.strictEqual(metadataRead.params.includeTurns, false);
		peer.push({
			id: metadataRead.id,
			result: {
				thread: {
					id: metadataRead.params.threadId,
					cwd: workingDirectory.fsPath,
					modelProvider: 'openai',
					path: rollout.fsPath,
					source: 'vscode',
					turns: [persistedTurn],
				},
			},
		});
		const metadata = await metadataPromise;
		assert.strictEqual(peer.outbound.readableLength, 0);
		const restored = agent['_sessions'].get(AgentSession.id(session));
		await agent.materializeChat(chat, context, JSON.stringify({ sessionId: AgentSession.id(session) }));

		const historyPromise = agent.chats.getMessages(chat, context);
		const historyRead = await readNextRequest(peer.outbound);
		assert.strictEqual(historyRead.params.includeTurns, false);
		peer.push({
			id: historyRead.id,
			result: {
				thread: {
					id: historyRead.params.threadId,
					cwd: workingDirectory.fsPath,
					historyMode: 'paginated',
					modelProvider: 'openai',
					path: rollout.fsPath,
					source: 'vscode',
					turns: [],
				},
			},
		});
		const historyPage = await readNextRequest(peer.outbound);
		peer.push({ id: historyPage.id, result: { data: [persistedTurn], nextCursor: null, backwardsCursor: null } });
		const history = await historyPromise;

		const send = agent.chats.sendMessage(chat, 'hello', [workingDirectory], undefined, 'turn-1', undefined, undefined, context);
		const unsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: unsubscribe.id, result: {} });
		const resume = await readNextRequest(peer.outbound);
		peer.push({
			id: resume.id,
			result: {
				thread: { id: resume.params.threadId, cwd: workingDirectory.fsPath },
				cwd: workingDirectory.fsPath,
			},
		});
		const resumeInventory = await readNextRequest(peer.outbound);
		peer.push({ id: resumeInventory.id, result: { data: [], nextCursor: null } });
		const turn = await readNextRequest(peer.outbound);
		peer.push({ id: turn.id, result: {} });
		await send;

		assert.deepStrictEqual({
			metadataReadThreadId: metadataRead.params.threadId,
			metadataModel: metadata?.model?.id,
			restored: {
				threadId: restored?.threadId,
				model: restored?.model?.id,
				materializedModelProvider: restored?.materializedModelProvider,
			},
			history: history.map(item => ({
				id: item.id,
				message: item.message.text,
				messageModel: item.message.model?.id,
				usageModel: item.usage?.model,
			})),
			resume: { method: resume.method, threadId: resume.params.threadId, modelProvider: resume.params.modelProvider },
			unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
			historyReadThreadId: historyRead.params.threadId,
			turn: { method: turn.method, threadId: turn.params.threadId, model: turn.params.model },
			overlay: {
				threadId: await database.getMetadata('codex.threadId'),
				modelId: await database.getMetadata('codex.model'),
			},
		}, {
			metadataReadThreadId: 'desktop-thread',
			metadataModel: COPILOT_TEST_MODEL,
			restored: {
				threadId: 'desktop-thread',
				model: COPILOT_TEST_MODEL,
				materializedModelProvider: 'vscode-proxy',
			},
			history: [{
				id: 'desktop-turn',
				message: 'remember capybara',
				messageModel: COPILOT_TEST_MODEL,
				usageModel: COPILOT_TEST_MODEL,
			}],
			resume: { method: 'thread/resume', threadId: 'desktop-thread', modelProvider: 'vscode-proxy' },
			unsubscribe: { method: 'thread/unsubscribe', threadId: 'desktop-thread' },
			historyReadThreadId: 'desktop-thread',
			turn: { method: 'turn/start', threadId: 'desktop-thread', model: 'gpt-test' },
			overlay: { threadId: 'desktop-thread', modelId: COPILOT_TEST_MODEL },
		});
		assert.deepStrictEqual(telemetryService.events, []);
		await agent.chats.changeModel(chat, { id: OPENAI_TEST_MODEL }, context);
		const nativeSend = agent.chats.sendMessage(chat, 'continue through ChatGPT', [workingDirectory], undefined, 'native-turn', undefined, undefined, context);
		const nativeUnsubscribe = await readNextRequest(peer.outbound);
		peer.push({ id: nativeUnsubscribe.id, result: {} });
		const nativeResume = await readNextRequest(peer.outbound);
		peer.push({ id: nativeResume.id, result: { thread: { id: 'desktop-thread' } } });
		const nativeInventory = await readNextRequest(peer.outbound);
		peer.push({ id: nativeInventory.id, result: { data: [], nextCursor: null } });
		const nativeTurn = await readNextRequest(peer.outbound);
		assert.deepStrictEqual(telemetryService.events, []);
		peer.push({ id: nativeTurn.id, result: {} });
		await nativeSend;
		assert.deepStrictEqual({
			method: nativeTurn.method,
			threadId: nativeTurn.params.threadId,
			events: telemetryService.events,
		}, {
			method: 'turn/start',
			threadId: 'desktop-thread',
			events: [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread: true },
			}],
		});
		peer.exit();
	});
});
suite('CodexAgent baseline checkpoint', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('captures the baseline checkpoint on the fresh first send but not on subsequent sends', async () => {
		const checkpointService = new RecordingCheckpointService();
		const agent = await createAgent(disposables, { checkpointService });
		const peer = disposables.add(createTestPeer());
		const client = new CodexAppServerClient(peer.transport);
		agent['_connection'] = { kind: 'ready', client, usageSource: 'github', child: { kill: () => true } } as never;
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };

		const folder = URI.file('/repo/baseline-folder');
		const { session } = await createSession(agent, { workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		const chat = URI.parse(buildDefaultChatUri(session));

		// Complete the prewarm `thread/start` so the folder thread is materialized
		// (which sets the tool/mcp/customization signatures).
		const prewarmStart = await readNextRequest(peer.outbound);
		try {
			peer.push({ id: prewarmStart.id, result: { thread: { id: 'thread-baseline' } } });
			await entry.materializePromise;

			// Fresh first send: the folder is already materialized with matching
			// signatures, so the only outbound request is `turn/start`.
			const send1 = agent.chats.sendMessage(chat, 'hello', [folder], undefined, 'turn-1');
			const turnStart1 = await readNextRequest(peer.outbound);
			peer.push({ id: turnStart1.id, result: {} });
			await send1;

			// The second send has `firstTurnSent === true`, so the gate prevents
			// a second capture.
			const send2 = agent.chats.sendMessage(chat, 'again', [folder], undefined, 'turn-2');
			const turnStart2 = await readNextRequest(peer.outbound);
			peer.push({ id: turnStart2.id, result: {} });
			await send2;

			assert.deepStrictEqual(checkpointService.baselineCalls, [
				{ session: session.toString(), workingDirectories: [folder.toString()] },
			]);
		} finally {
			peer.exit();
		}
	});
});

suite('CodexAgent managed working directory ownership', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a legacy overlay recording only the ownership flag is never reclaimed once cwd is adopted by a real folder', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'legacy-session');
		const chat = defaultChatOf(session);
		const sessionId = AgentSession.id(session);

		const userFolder = fs.mkdtempSync(join(os.tmpdir(), 'vscode-codex-test-user-'));
		const marker = join(userFolder, 'marker.txt');
		fs.writeFileSync(marker, 'keep-me');
		try {
			// An overlay written before the explicit `managedWorkingDirectory`
			// field existed: only the legacy boolean flag was ever recorded,
			// and `cwd` has since been overwritten — by an adoption in some
			// prior process — with a real, unmanaged user folder.
			await agent['_metadataStore'].write(session, {
				threadId: 'legacy-thread',
				cwd: URI.file(userFolder),
				ownsManagedWorkingDirectory: true,
			});

			await agent.materializeChat(chat, session, JSON.stringify({ sessionId }));
			assert.strictEqual(
				agent['_sessions'].get(sessionId)?.managedWorkingDirectory,
				undefined,
				'a legacy flag with no explicit path must not resurrect a managed directory',
			);

			// Idle-release then dispose: drops the runtime from memory and
			// untracks the chat's configuration scope, driving the reclaim
			// path for a session that is no longer live — the exact path a
			// stale flag could otherwise infer `cwd` from. Clearing the
			// released-directory memo simulates the in-memory map being
			// empty, as it would be after a process restart.
			agent['_releasedManagedWorkingDirectories'].clear();
			await agent.chats.releaseChat(chat, chatContext(session, chat));
			await agent.chats.disposeChat(chat, chatContext(session, chat));

			assert.strictEqual(fs.existsSync(marker), true, 'the user folder must never be deleted');
		} finally {
			fs.rmSync(userFolder, { recursive: true, force: true });
		}
	});

	test('an explicit managed working directory is still reclaimed once the session is no longer live', async () => {
		const agent = await createAgent(disposables);
		const session = AgentSession.uri('codex', 'explicit-managed-session');
		const chat = defaultChatOf(session);
		const sessionId = AgentSession.id(session);

		const managedFolder = fs.mkdtempSync(join(os.tmpdir(), 'vscode-agent-codex-'));
		try {
			await agent['_metadataStore'].write(session, {
				threadId: 'managed-thread',
				cwd: URI.file(managedFolder),
				ownsManagedWorkingDirectory: true,
				managedWorkingDirectory: URI.file(managedFolder),
			});

			await agent.materializeChat(chat, session, JSON.stringify({ sessionId }));
			assert.strictEqual(
				agent['_sessions'].get(sessionId)?.managedWorkingDirectory?.fsPath,
				URI.file(managedFolder).fsPath,
				'an explicit managed path is trusted and restored',
			);

			agent['_releasedManagedWorkingDirectories'].clear();
			await agent.chats.releaseChat(chat, chatContext(session, chat));
			await agent.chats.disposeChat(chat, chatContext(session, chat));

			assert.strictEqual(fs.existsSync(managedFolder), false, 'the explicitly recorded managed folder is still cleaned up');
		} finally {
			fs.rmSync(managedFolder, { recursive: true, force: true });
		}
	});

	test('adopting a host-supplied working directory abandons a stale managed folder left behind by a failed thread start, and never touches the newly adopted folder', async () => {
		const agent = await createAgent(disposables);
		agent['_refreshSkillHookCustomizations'] = async () => { };
		agent['_refreshSkillExtraRoots'] = async () => { };
		const peer = disposables.add(createTestPeer());
		agent['_connection'] = {
			kind: 'ready',
			client: new CodexAppServerClient(peer.transport),
			usageSource: 'github',
			child: { kill: () => true },
		} as never;

		// A workspace-less session defers its backing until the first send.
		// `_materialize` mints the managed temp folder and records it on the
		// session *before* issuing `thread/start`; if that request fails, the
		// folder is left behind with no thread id ever assigned. A retry that
		// supplies a real, host-selected folder must abandon that stale
		// managed folder via its own recorded path rather than orphaning it,
		// and must never treat the newly adopted folder as managed.
		const { session } = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
		const chat = defaultChatOf(session);
		const sessionId = AgentSession.id(session);
		let userFolder: string | undefined;
		try {
			const firstSend = agent.chats.sendMessage(chat, 'hello', undefined, undefined, 'turn-1');
			const failedStart = await readNextRequest(peer.outbound);
			assert.strictEqual(failedStart.method, 'thread/start');
			peer.push({ id: failedStart.id, error: { code: -32000, message: 'boom' } });
			await firstSend;

			const entry = agent['_sessions'].get(sessionId)!;
			assert.strictEqual(entry.threadId, undefined, 'the failed start never assigned a thread id');
			assert.strictEqual(entry.prewarmClaimed, true, 'the real send already claimed prewarm before materializing');
			const staleManagedFolder = entry.managedWorkingDirectory!;
			assert.ok(staleManagedFolder, 'materialize created a managed folder before the failing thread/start call');
			assert.strictEqual(fs.existsSync(staleManagedFolder.fsPath), true);

			userFolder = fs.mkdtempSync(join(os.tmpdir(), 'vscode-codex-test-adopted-'));
			const secondSend = agent.chats.sendMessage(chat, 'hello again', [URI.file(userFolder)], undefined, 'turn-2');
			const restart = await readNextRequest(peer.outbound);
			assert.strictEqual(restart.method, 'thread/start');
			assert.strictEqual(restart.params.cwd, URI.file(userFolder).fsPath);
			peer.push({ id: restart.id, result: { thread: { id: 'thread-adopt-2' } } });
			const turn = await readNextRequest(peer.outbound);
			peer.push({ id: turn.id, result: {} });
			await secondSend;

			const restoredEntry = agent['_sessions'].get(sessionId)!;
			assert.deepStrictEqual({
				threadId: restoredEntry.threadId,
				workingDirectory: restoredEntry.workingDirectory?.fsPath,
				managedWorkingDirectory: restoredEntry.managedWorkingDirectory,
				staleManagedFolderExists: fs.existsSync(staleManagedFolder.fsPath),
				userFolderExists: fs.existsSync(userFolder),
			}, {
				threadId: 'thread-adopt-2',
				workingDirectory: URI.file(userFolder).fsPath,
				managedWorkingDirectory: undefined,
				staleManagedFolderExists: false,
				userFolderExists: true,
			});
		} finally {
			peer.exit();
			if (userFolder) {
				fs.rmSync(userFolder, { recursive: true, force: true });
			}
		}
	});
});
