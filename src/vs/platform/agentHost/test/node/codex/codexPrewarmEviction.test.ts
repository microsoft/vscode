/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
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
import { PluginFormat, type IParsedPlugin } from '../../../../agentPlugins/common/pluginParsers.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { AgentSession } from '../../../common/agentService.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { CustomizationType, McpServerStatus } from '../../../common/state/protocol/channels-session/state.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { CodexAgent, toCodexModelSelectionId } from '../../../node/codex/codexAgent.js';
import { CodexAppServerClient, type ICodexAppServerTransport } from '../../../node/codex/codexAppServerClient.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';
import { AgentHostCodexMultiRootEnabledConfigKey } from '../../../common/agentHostSchema.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import type { SandboxPolicy } from '../../../node/codex/protocol/generated/v2/SandboxPolicy.js';
import type { SelectedCapabilityRoot } from '../../../node/codex/protocol/generated/v2/SelectedCapabilityRoot.js';
import { createSessionDataService, RecordingCheckpointService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';

interface ITestWireRequest {
	readonly id: number;
	readonly method: string;
	readonly params: {
		readonly cwd?: string;
		readonly threadId?: string;
		readonly runtimeWorkspaceRoots?: readonly string[];
		readonly model?: string;
		readonly modelProvider?: string;
		readonly selectedCapabilityRoots?: readonly SelectedCapabilityRoot[];
		readonly sandboxPolicy?: SandboxPolicy;
		readonly config?: Record<string, unknown>;
		readonly developerInstructions?: string;
		readonly collaborationMode?: { readonly settings: { readonly developer_instructions: string | null } };
	};
}

const COPILOT_TEST_MODEL = toCodexModelSelectionId('vscode-proxy', 'gpt-test');

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
	readonly checkpointService?: IAgentHostCheckpointService;
}

class TestCodexLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
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
	const models = [{ id: 'gpt-test', name: 'GPT Test', supported_endpoints: ['/responses'] }] as CCAModel[];
	const instantiationService = new TestInstantiationService();
	const logService = new TestCodexLogService();
	const fileService = disposables.add(new TestCodexFileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new TestCodexConfigurationService(stateManager, logService, options.sessionConfig));
	configurationService.updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: options.multiRootEnabled });
	instantiationService.stub(ISessionDataService, createSessionDataService(options.database));
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models: async () => models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined, isSdkResolvableWithoutDownload: async () => true });
	instantiationService.stub(IAgentHostCheckpointService, options.checkpointService ?? NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getNativeSdkTelemetryConfig: async () => undefined,
		getSessionTraceContext: () => undefined,
		releaseSessionTraceContext: () => { },
	});
	instantiationService.stub(IAgentHostStateManager, stateManager);
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(IFileService, fileService);
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
	const { session } = await agent.createSession({ workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
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

	test('routes provider-qualified models independently and switches one session', async () => {
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

		const chatGPTModel = toCodexModelSelectionId('openai', 'gpt-test');
		agent['_models'].set([
			{ provider: 'copilot', id: COPILOT_TEST_MODEL, name: 'GPT Test', supportsVision: false },
			{ provider: 'codex', id: chatGPTModel, name: 'GPT Test', supportsVision: false },
		], undefined);

		const copilot = await agent.createSession({ workingDirectories: [URI.file('/repo/copilot')], model: { id: COPILOT_TEST_MODEL } });
		const chatGPT = await agent.createSession({ workingDirectories: [URI.file('/repo/chatgpt')], model: { id: chatGPTModel } });
		const copilotEntry = agent['_sessions'].get(AgentSession.id(copilot.session))!;
		const chatGPTEntry = agent['_sessions'].get(AgentSession.id(chatGPT.session))!;

		const materializeCopilot = agent['_materializeIfNeeded'](copilotEntry, false);
		const copilotStart = await readNextRequest(peer.outbound);
		peer.push({ id: copilotStart.id, result: { thread: { id: 'thread-copilot' } } });
		await materializeCopilot;

		const materializeChatGPT = agent['_materializeIfNeeded'](chatGPTEntry, false);
		const chatGPTStart = await readNextRequest(peer.outbound);
		peer.push({ id: chatGPTStart.id, result: { thread: { id: 'thread-chatgpt' } } });
		await materializeChatGPT;

		await agent.chats.changeModel(URI.parse(buildDefaultChatUri(copilot.session)), { id: chatGPTModel });
		const persistedAfterSwitch = await agent['_metadataStore'].read(copilot.session);
		const rematerializeCopilot = agent['_materializeIfNeeded'](copilotEntry, false);
		const switchedStart = await readNextRequest(peer.outbound);
		peer.push({ id: switchedStart.id, result: { thread: { id: 'thread-copilot-switched' } } });
		await rematerializeCopilot;

		assert.deepStrictEqual({
			copilotStart: { model: copilotStart.params.model, provider: copilotStart.params.modelProvider },
			chatGPTStart: { model: chatGPTStart.params.model, provider: chatGPTStart.params.modelProvider },
			switchedStart: { model: switchedStart.params.model, provider: switchedStart.params.modelProvider },
			copilotThread: copilotEntry.threadId,
			chatGPTThread: chatGPTEntry.threadId,
			persistedAfterSwitch: persistedAfterSwitch.modelId,
		}, {
			copilotStart: { model: 'gpt-test', provider: 'vscode-proxy' },
			chatGPTStart: { model: 'gpt-test', provider: 'openai' },
			switchedStart: { model: 'gpt-test', provider: 'openai' },
			copilotThread: 'thread-copilot-switched',
			chatGPTThread: 'thread-chatgpt',
			persistedAfterSwitch: chatGPTModel,
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
		const { session } = await agent.createSession({ workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
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
				customization: { type: CustomizationType.McpServer, id: 'mcp', uri: 'file:///plugin/.mcp.json', name: 'local', enabled: true, state: { kind: McpServerStatus.Starting } },
			}],
		};
		const unsafeSession = URI.from({ scheme: 'codex', path: '/../../codex-customization-victim' });
		const { session } = await agent.createSession({ session: unsafeSession, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL }, agent: { uri: agentUri.toString() } });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;
		entry.clientCustomizations.setClient('test', [{
			synced: { customization: { type: CustomizationType.Plugin, id: 'plugin', uri: pluginDir.toString(), name: 'plugin', enabled: true }, pluginDir },
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
			developerInstructions: 'Run focused tests.\n\nReview carefully.',
			turnDeveloperInstructions: 'Run focused tests.\n\nReview carefully.',
			capabilityPaths: [URI.file('/plugin/skills').fsPath],
			roleFile: 'name = "Reviewer"\ndescription = "Reviews changes"\ndeveloper_instructions = "Review carefully."\n',
			roleFileUsesHostGeneratedRoot: true,
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
			const { session } = await agent.createSession({ workingDirectories: [repoA, repoB, repoC], model: { id: COPILOT_TEST_MODEL } });
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
			const { session } = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
			const { session } = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories, model: { id: COPILOT_TEST_MODEL } });
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
				start: {
					cwd: start.params.cwd,
					runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: start.params.selectedCapabilityRoots,
				},
				turn: {
					runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
					selectedCapabilityRoots: turn.params.selectedCapabilityRoots,
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
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					selectedCapabilityRoots: undefined,
				},
				turn: {
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					selectedCapabilityRoots: undefined,
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
			const created = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
					writableRoots: secondTurn.params.sandboxPolicy?.type === 'workspaceWrite' ? secondTurn.params.sandboxPolicy.writableRoots : undefined,
				},
				third: {
					method: thirdTurn.method,
					threadId: thirdTurn.params.threadId,
					runtimeWorkspaceRoots: thirdTurn.params.runtimeWorkspaceRoots,
					writableRoots: thirdTurn.params.sandboxPolicy?.type === 'workspaceWrite' ? thirdTurn.params.sandboxPolicy.writableRoots : undefined,
				},
			}, {
				second: {
					method: 'turn/start',
					threadId: 'thread',
					runtimeWorkspaceRoots: [repoA.fsPath, repoC.fsPath],
					writableRoots: [repoA.fsPath, repoC.fsPath],
				},
				third: {
					method: 'turn/start',
					threadId: 'thread',
					runtimeWorkspaceRoots: [repoA.fsPath],
					writableRoots: [repoA.fsPath],
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
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
				writableRoots: turn.params.sandboxPolicy?.type === 'workspaceWrite' ? turn.params.sandboxPolicy.writableRoots : undefined,
			}, {
				startRuntimeWorkspaceRoots: undefined,
				startSelectedCapabilityRoots: undefined,
				turnRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
				turnSelectedCapabilityRoots: undefined,
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
			const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
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
					selectedCapabilityRoots: undefined,
				},
				turn: {
					runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
					selectedCapabilityRoots: undefined,
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
			const source = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
					model: fork.params.model,
					modelProvider: fork.params.modelProvider,
					selectedCapabilityRoots: fork.params.selectedCapabilityRoots,
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
			const created = await agentA.createSession({ workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
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
					selectedCapabilityRoots: resume.params.selectedCapabilityRoots,
				},
				turnRuntimeWorkspaceRoots: resumedTurn.params.runtimeWorkspaceRoots,
				turnSelectedCapabilityRoots: resumedTurn.params.selectedCapabilityRoots,
			}, {
				canonicalOverlay: [repoA.fsPath, repoB.fsPath],
				metadata: [repoA.fsPath, repoB.fsPath],
				resume: {
					cwd: repoA.fsPath,
					runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
					selectedCapabilityRoots: undefined,
				},
				turnRuntimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
				turnSelectedCapabilityRoots: undefined,
			});
		} finally {
			peerB?.exit();
			peerA.exit();
		}
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
		const { session } = await agent.createSession({ workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
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
