/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { hasKey } from '../../../../base/common/types.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, IRestoredSubagentSession, SubagentChatSignal, type IAgent, type IAgentChatDataChange, type IAgentChats, type IAgentCreateChatForkSource, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentCreateSessionResult, type IAgentLegacyChat, type IAgentSessionMetadata, type IAgentSpawnChatEvent } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { ActionType, ActionEnvelope } from '../../common/state/sessionActions.js';
import { ChangesetStatus, CustomizationType, MessageAttachmentKind, MessageKind, SessionActiveClient, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, customizationId, isSubagentSession, parseChatUri, parseSubagentSessionUri, ChatOriginKind, type ChangesetState, type ISessionWithDefaultChat, type MarkdownResponsePart, type ToolCallCompletedState, type ToolCallResponsePart, type Turn } from '../../common/state/sessionState.js';
import { type MessageResourceAttachment } from '../../common/state/protocol/state.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent, ScriptedMockAgent } from './mockAgent.js';
import { mapSessionEventsToHistoryRecords } from './historyRecordFixtures.js';
import { type ISessionEvent } from './copilotTestEvents.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { WorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { AhpErrorCodes, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { INetworkDiagnosticsService } from '../../node/networkDiagnosticsService.js';

/**
 * Loads a JSONL fixture of raw Copilot SDK events, runs them through
 * {@link mapSessionEventsToHistoryRecords}, and returns the result
 * suitable for setting on {@link MockAgent.sessionMessages}. Tests the
 * full pipeline: SDK events → IHistoryRecord → buildTurnsFromHistory →
 * Turn[].
 *
 * Fixture files live in `test-cases/` and are sanitized copies of real
 * `events.jsonl` files from `~/.copilot/session-state/`.
 */
async function loadFixtureMessages(fixtureName: string, session: URI) {
	// Resolve the fixture from the source tree (test-cases/ is not compiled to out/)
	const thisFile = fileURLToPath(import.meta.url);
	// Navigate from out/vs/... to src/vs/... by replacing the out/ prefix.
	// Use a regex that handles both / and \ separators for Windows compat.
	const srcFile = thisFile.replace(/[/\\]out[/\\]/, (m) => m.replace('out', 'src'));
	const lastSep = Math.max(srcFile.lastIndexOf('/'), srcFile.lastIndexOf('\\'));
	const fixtureDir = srcFile.substring(0, lastSep);
	const sep = srcFile.includes('\\') ? '\\' : '/';
	const raw = readFileSync(`${fixtureDir}${sep}test-cases${sep}${fixtureName}`, 'utf-8');
	const events: ISessionEvent[] = raw.trim().split('\n').map(line => JSON.parse(line));
	return mapSessionEventsToHistoryRecords(session, undefined, events);
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly utilityCalls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'Generated session title';
	responsePromise: Promise<string> | undefined;
	error: Error | undefined;

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
	async resolveRestrictedTelemetryContext() { return { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }; }
	async resolveApiEndpoint() { return undefined; }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.utilityCalls.push({ token: githubToken, request, options });
		if (this.error) {
			throw this.error;
		}
		if (this.responsePromise) {
			return this.responsePromise;
		}
		return this.response;
	}
}

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;
	let fileService: FileService;
	let nullSessionDataService: ISessionDataService;

	setup(async () => {
		nullSessionDataService = {
			_serviceBrand: undefined,
			getSessionDataDir: () => URI.parse('inmemory:/session-data'),
			getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
			openDatabase: () => { throw new Error('not implemented'); },
			tryOpenDatabase: async () => undefined,
			deleteSessionData: async () => { },
			onWillDeleteSessionData: Event.None,
			cleanupOrphanedData: async () => { },
			whenIdle: async () => { },
		};

		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		// Seed a directory for browseDirectory tests
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/testDir' }));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		service = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		copilotAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => copilotAgent.dispose()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider registration ------------------------------------------

	suite('registerProvider', () => {

		test('registers a provider successfully', () => {
			service.registerProvider(copilotAgent);
			// No throw - success
		});

		test('throws on duplicate provider registration', () => {
			service.registerProvider(copilotAgent);
			const duplicate = new MockAgent('copilot');
			disposables.add(toDisposable(() => duplicate.dispose()));
			assert.throws(() => service.registerProvider(duplicate), /already registered/);
		});

		test('aggregates and deduplicates network diagnostics endpoints', async () => {
			const providerA: IAgent = copilotAgent;
			providerA.getNetworkDiagnosticsEndpoints = async () => [
				{ name: 'First', url: 'https://example.com' },
				{ name: 'Other', url: 'https://other.example.com' },
			];
			providerA.getNetworkDiagnosticsAccount = async () => 'octocat';
			const providerB = new MockAgent('other');
			disposables.add(toDisposable(() => providerB.dispose()));
			const providerBContract: IAgent = providerB;
			providerBContract.getNetworkDiagnosticsEndpoints = async () => [
				{ name: 'Duplicate', url: 'https://example.com/' },
			];
			const failingProvider = new MockAgent('failing');
			disposables.add(toDisposable(() => failingProvider.dispose()));
			const failingProviderContract: IAgent = failingProvider;
			failingProviderContract.getNetworkDiagnosticsEndpoints = async () => { throw new Error('unavailable'); };
			const diagnostics: INetworkDiagnosticsService = {
				_serviceBrand: undefined,
				getInfo: async (endpoints, account) => ({ version: 'test', os: 'test', arch: 'test', account, proxySettings: {}, proxyEnv: {}, endpoints }),
				fetch: async url => ({ url }),
			};
			service.setNetworkDiagnosticsService(diagnostics);
			service.registerProvider(providerA);
			service.registerProvider(providerB);
			service.registerProvider(failingProvider);

			const info = await service.getNetworkDiagnosticsInfo();

			assert.deepStrictEqual({ account: info.account, endpoints: info.endpoints }, {
				account: 'octocat',
				endpoints: [
					{ name: 'First', url: 'https://example.com' },
					{ name: 'Other', url: 'https://other.example.com' },
				],
			});
		});

		test('maps progress events to protocol actions via onDidAction', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			// Start a turn so there's an active turn to map events to
			service.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(service.onDidAction(e => envelopes.push(e)));

			copilotAgent.fireProgress({
				kind: 'action', resource: URI.parse(buildDefaultChatUri(session.toString())),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-1', content: 'hello' } },
			});
			assert.ok(envelopes.some(e => e.action.type === ActionType.ChatResponsePart));
		});
	});

	test('resolveSessionConfig echoes host-owned worktree values across isolation modes', async () => {
		const workingDirectory = URI.file('/workspace/repo');
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async () => workingDirectory;
		gitService.revParse = async () => 'head';
		gitService.getCurrentBranch = async () => 'feature';
		gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
		const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		localService.setWorktreeIsolation(disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			new TestCopilotApiService(),
			nullSessionDataService,
			new NullLogService(),
		)));
		const agent = new MockAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		localService.registerProvider(agent);
		const includeFiles = ['.env', '.env.local', 'config/**'];

		const worktree = await localService.resolveSessionConfig({
			provider: 'copilot',
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'feature', [SessionConfigKey.WorktreeIncludeFiles]: includeFiles },
		});
		const folder = await localService.resolveSessionConfig({
			provider: 'copilot',
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.WorktreeIncludeFiles]: includeFiles },
		});

		assert.deepStrictEqual({
			worktreeBranch: worktree.values[SessionConfigKey.Branch],
			worktreeReadOnly: worktree.schema.properties[SessionConfigKey.WorktreeIncludeFiles]?.readOnly,
			worktreeValue: worktree.values[SessionConfigKey.WorktreeIncludeFiles],
			folderReadOnly: folder.schema.properties[SessionConfigKey.WorktreeIncludeFiles]?.readOnly,
			folderValue: folder.values[SessionConfigKey.WorktreeIncludeFiles],
		}, {
			worktreeBranch: 'feature',
			worktreeReadOnly: true,
			worktreeValue: includeFiles,
			folderReadOnly: true,
			folderValue: includeFiles,
		});
	});

	test('session config keeps host-owned values outside provider calls', async () => {
		const workingDirectory = URI.file('/workspace/repo');
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async () => workingDirectory;
		gitService.revParse = async () => 'head';
		gitService.getCurrentBranch = async () => 'feature';
		gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'origin/main' });
		const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		localService.setWorktreeIsolation(disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			new TestCopilotApiService(),
			nullSessionDataService,
			new NullLogService(),
		)));
		const agent = new MockAgent('codex');
		const providerResolveConfigs: Array<Record<string, unknown> | undefined> = [];
		const providerCompletionConfigs: Array<Record<string, unknown> | undefined> = [];
		agent.resolveSessionConfig = async params => {
			providerResolveConfigs.push(params.config);
			return {
				schema: {
					type: 'object',
					properties: {
						[SessionConfigKey.Isolation]: { type: 'string', title: 'Provider Isolation' },
						[SessionConfigKey.Branch]: { type: 'string', title: 'Provider Branch' },
						providerSetting: { type: 'string', title: 'Provider Setting' },
					},
				},
				values: {
					...params.config,
					[SessionConfigKey.Isolation]: 'folder',
					[SessionConfigKey.Branch]: 'provider-branch',
				},
			};
		};
		agent.sessionConfigCompletions = async params => {
			providerCompletionConfigs.push(params.config);
			return { items: [] };
		};
		disposables.add(toDisposable(() => agent.dispose()));
		localService.registerProvider(agent);

		const initial = await localService.resolveSessionConfig({
			provider: 'codex',
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'worktree', providerSetting: 'initial' },
		});
		const selected = await localService.resolveSessionConfig({
			provider: 'codex',
			workingDirectory,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'feature/config',
				[SessionConfigKey.WorktreeBranchPrefix]: 'users/test/',
				[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
				providerSetting: 'selected',
			},
		});
		const folder = await localService.resolveSessionConfig({
			provider: 'codex',
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.Branch]: 'feature/config', providerSetting: 'folder' },
		});
		await localService.sessionConfigCompletions({
			provider: 'codex',
			workingDirectory,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'feature/config',
				[SessionConfigKey.WorktreeBranchPrefix]: 'users/test/',
				[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
				providerSetting: 'completion',
			},
			property: 'providerSetting',
		});

		assert.deepStrictEqual({
			providerResolveConfigs,
			providerCompletionConfigs,
			initial: {
				isolation: initial.values[SessionConfigKey.Isolation],
				branchDefault: initial.schema.properties[SessionConfigKey.Branch]?.default,
				branch: initial.values[SessionConfigKey.Branch],
				providerSetting: initial.values.providerSetting,
			},
			selected: {
				isolation: selected.values[SessionConfigKey.Isolation],
				branch: selected.values[SessionConfigKey.Branch],
				branchPrefix: selected.values[SessionConfigKey.WorktreeBranchPrefix],
				includeFiles: selected.values[SessionConfigKey.WorktreeIncludeFiles],
				providerSetting: selected.values.providerSetting,
			},
			folder: {
				isolation: folder.values[SessionConfigKey.Isolation],
				branch: folder.values[SessionConfigKey.Branch],
				providerSetting: folder.values.providerSetting,
			},
		}, {
			providerResolveConfigs: [
				{ providerSetting: 'initial' },
				{ providerSetting: 'selected' },
				{ providerSetting: 'folder' },
			],
			providerCompletionConfigs: [{ providerSetting: 'completion' }],
			initial: { isolation: 'worktree', branchDefault: 'main', branch: 'main', providerSetting: 'initial' },
			selected: { isolation: 'worktree', branch: 'feature/config', branchPrefix: 'users/test/', includeFiles: ['.env'], providerSetting: 'selected' },
			folder: { isolation: 'folder', branch: 'feature', providerSetting: 'folder' },
		});
	});

	test('marks worktree isolation pending before a provisional provider can prewarm', async () => {
		const session = AgentSession.uri('codex', 'pending-before-create');
		const workingDirectory = URI.file('/workspace/repo');
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async () => workingDirectory;
		gitService.revParse = async () => 'head';
		gitService.getCurrentBranch = async () => 'feature';
		gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
		const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		const isolation = disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			new TestCopilotApiService(),
			nullSessionDataService,
			new NullLogService(),
		));
		localService.setWorktreeIsolation(isolation);
		const pendingDuringCreate: boolean[] = [];
		const providerCreateConfigs: Array<Record<string, unknown> | undefined> = [];
		let failCreate = false;
		class PrewarmingAgent extends MockAgent {
			override async createSession(config?: import('../../common/agentService.js').IAgentCreateSessionConfig): Promise<import('../../common/agentService.js').IAgentCreateSessionResult> {
				pendingDuringCreate.push(localService.configurationService.isWorkingDirectoryPending(config!.session!.toString()));
				providerCreateConfigs.push(config?.config);
				if (failCreate) {
					throw new Error('create failed');
				}
				return { ...await super.createSession(config), provisional: true };
			}
		}
		const agent = new PrewarmingAgent('codex');
		disposables.add(toDisposable(() => agent.dispose()));
		localService.registerProvider(agent);

		await localService.createSession({
			provider: 'codex',
			session,
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		});
		const failedSession = AgentSession.uri('codex', 'failed-before-create');
		failCreate = true;
		await assert.rejects(localService.createSession({
			provider: 'codex',
			session: failedSession,
			workingDirectory,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		}), /create failed/);

		assert.deepStrictEqual({
			pendingDuringCreate,
			providerCreateConfigs,
			pendingAfterCreate: localService.configurationService.isWorkingDirectoryPending(session.toString()),
			pendingAfterFailure: localService.configurationService.isWorkingDirectoryPending(failedSession.toString()),
		}, {
			pendingDuringCreate: [true, true],
			providerCreateConfigs: [{}, {}],
			pendingAfterCreate: true,
			pendingAfterFailure: false,
		});
	});

	suite('resourceRead', () => {

		test('maps missing files to NotFound', async () => {
			const uri = URI.from({ scheme: Schemas.inMemory, path: '/missing.txt' });

			await assert.rejects(
				() => service.resourceRead(uri),
				(error: unknown) => error instanceof ProtocolError
					&& error.code === AhpErrorCodes.NotFound
					&& error.message === `Content not found: ${uri.toString()}`
			);
		});

		test('does not map all read failures to NotFound', async () => {
			const uri = URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' });
			const originalReadFile = fileService.readFile.bind(fileService);
			fileService.readFile = async resource => {
				if (resource.toString() === uri.toString()) {
					return Promise.reject('Injected unknown read failure');
				}
				return originalReadFile(resource);
			};
			disposables.add(toDisposable(() => fileService.readFile = originalReadFile));

			await assert.rejects(
				() => service.resourceRead(uri),
				(error: unknown) => error instanceof ProtocolError
					&& error.code === JSON_RPC_INTERNAL_ERROR
					&& error.message === `Failed to read content: ${uri.toString()}: Injected unknown read failure`
			);
		});
	});

	// ---- createSession --------------------------------------------------

	suite('dispatchAction', () => {

		async function waitForCondition(predicate: () => boolean | Promise<boolean>, message: string): Promise<void> {
			for (let i = 0; i < 20; i++) {
				if (await predicate()) {
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 5));
			}
			assert.ok(await predicate(), message);
		}

		async function setupTitleGeneration(copilotApiService: TestCopilotApiService): Promise<{ svc: AgentService; agent: MockAgent; session: URI; db: TestSessionDatabase }> {
			const db = new TestSessionDatabase();
			const sessionDataService = createSessionDataService(db);
			const svc = disposables.add(new AgentService(
				new NullLogService(),
				fileService,
				sessionDataService,
				{ _serviceBrand: undefined } as IProductService,
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
				undefined,
				undefined,
				undefined,
				copilotApiService,
			));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			svc.registerProvider(agent);
			await svc.authenticate({
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
				token: 'gh-token',
			});
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, db };
		}

		test('applies and persists root config changes from clients', async () => {
			const tempDir = URI.file(mkdtempSync(`${tmpdir()}/agent-host-config-`));
			// Use a local DisposableStore so that svc can be explicitly disposed
			// before cleaning up the temp directory. On Windows, rmSync fails with
			// EPERM if the AgentService (and its child AgentConfigurationService)
			// still holds references while the directory is being deleted.
			const localDisposables = new DisposableStore();
			try {
				const rootConfigResource = joinPath(tempDir, 'agent-host-config.json');
				const svc = localDisposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService(), NULL_CHECKPOINT_SERVICE, rootConfigResource));
				const agent = new MockAgent('copilot');
				localDisposables.add(toDisposable(() => agent.dispose()));
				svc.registerProvider(agent);

				const customization = { uri: 'file:///plugin-a', displayName: 'Plugin A' };
				svc.dispatchAction(ROOT_STATE_URI, {
					type: ActionType.RootConfigChanged,
					config: { customizations: [customization] },
				}, 'test-client', 1);

				let persisted = false;
				for (let attempt = 0; attempt < 20; attempt++) {
					try {
						const parsed = JSON.parse(readFileSync(rootConfigResource.fsPath, 'utf8'));
						assert.deepStrictEqual(
							parsed.customizations,
							[customization],
						);
						persisted = true;
						break;
					} catch {
						// Wait for the serialized root-config write to complete.
					}
					if (attempt === 19) {
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 5));
				}

				assert.ok(persisted, 'should persist the root config change');

				// Drain any in-flight root-config write so its file handle is
				// closed before we delete the temp directory.
				await svc.configurationService.whenIdle();
			} finally {
				localDisposables.dispose();
				rmSync(tempDir.fsPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			}
		});

		test('generates and persists an AI title after first-turn fallback title', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = '"Fix TypeScript compile errors."';
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);
			const titleActions: string[] = [];
			disposables.add(svc.onDidAction(e => {
				if (e.action.type === ActionType.SessionTitleChanged) {
					titleActions.push(e.action.title);
				}
			}));

			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'Please help me fix the TypeScript compile errors', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			await waitForCondition(() => svc.stateManager.getSessionState(session.toString())?.title === 'Fix TypeScript compile errors', 'generated title should be applied');
			await waitForCondition(async () => await db.getMetadata('customTitle') !== undefined, 'generated title should be persisted');

			assert.deepStrictEqual({
				titles: titleActions,
				token: copilotApiService.utilityCalls[0]?.token,
				promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some(message => message.content.includes('Please help me fix the TypeScript compile errors')),
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				titles: ['Please help me fix the TypeScript compile errors', 'Fix TypeScript compile errors'],
				token: 'gh-token',
				promptIncludesUserText: true,
				persistedTitle: 'Fix TypeScript compile errors',
			});
		});

		test('leaves fallback title when AI title generation fails', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.error = new Error('title failed');
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'Explain workspace search indexing', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be attempted');
			await Promise.resolve();

			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(session.toString())?.title,
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				title: 'Explain workspace search indexing',
				persistedTitle: undefined,
			});
		});

		test('does not overwrite a manual rename with delayed AI title', async () => {
			const copilotApiService = new TestCopilotApiService();
			let resolveTitle!: (title: string) => void;
			copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'Create tests for terminal persistence', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be in flight');

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTitleChanged, title: 'Manual title' },
				'test-client', 2,
			);
			resolveTitle('Terminal persistence tests');
			await waitForCondition(async () => await db.getMetadata('customTitle') === 'Manual title', 'manual title should be persisted');

			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(session.toString())?.title,
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				title: 'Manual title',
				persistedTitle: 'Manual title',
			});
		});

		test('aborts pending AI title generation when session is disposed', async () => {
			const copilotApiService = new TestCopilotApiService();
			let resolveTitle!: (title: string) => void;
			copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'Investigate flaky terminal tests', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be in flight');

			await svc.disposeSession(session);
			resolveTitle('Flaky terminal tests');
			await Promise.resolve();

			assert.deepStrictEqual({
				aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
				state: svc.stateManager.getSessionState(session.toString()),
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				aborted: true,
				state: undefined,
				persistedTitle: undefined,
			});
		});

		test('generates an AI title for forked sessions from the forked chat', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = 'Source generated title';
			const { svc, session: sourceSession } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				buildDefaultChatUri(sourceSession.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'source-turn', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'Seed fork title', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => svc.stateManager.getSessionState(sourceSession.toString())?.title === 'Source generated title', 'source generated title should be applied');
			svc.dispatchAction(
				buildDefaultChatUri(sourceSession.toString()),
				{ type: ActionType.ChatTurnComplete, turnId: 'source-turn', duration: 1000 },
				'test-client', 2,
			);
			await waitForCondition(() => (svc.stateManager.getSessionState(sourceSession.toString())?.turns.length ?? 0) === 1, 'source turn should be complete before forking');

			// The fork inherits a `Forked: …` placeholder, then regenerates a
			// content-derived title from the copied chat.
			copilotApiService.response = 'Forked branch title';
			const forkedSession = await svc.createSession({
				provider: 'copilot',
				fork: {
					session: sourceSession,
					turnIndex: 0,
					turnId: 'source-turn',
				},
			});
			await waitForCondition(() => svc.stateManager.getSessionState(forkedSession.toString())?.title === 'Forked branch title', 'forked session should get a content-generated title');

			const forkedCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
			const userMessage = forkedCall.request.messages.find(message => message.role === 'user')?.content ?? '';
			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(forkedSession.toString())?.title,
				utilityCalls: copilotApiService.utilityCalls.length,
				includesForkedChat: userMessage.includes('Seed fork title'),
			}, {
				title: 'Forked branch title',
				utilityCalls: 2,
				includesForkedChat: true,
			});
		});
	});

	// ---- attachment rewriting ------------------------------------------

	suite('user-message attachment rewriting', () => {

		/**
		 * Sets up an {@link AgentService} backed by an in-memory file system
		 * and a {@link createSessionDataService} that points at a fixed
		 * directory. Returns the wired-up service and the URI under which
		 * snapshotted attachments should land.
		 */
		async function setup(): Promise<{
			svc: AgentService;
			agent: MockAgent;
			session: URI;
			attachmentsRoot: URI;
			warnings: string[];
		}> {
			const sessionDataDir = URI.from({ scheme: Schemas.inMemory, path: '/session-data' });
			const attachmentsRoot = joinPath(sessionDataDir, 'attachments');
			await fileService.createFolder(attachmentsRoot);
			const sessionDataService = createSessionDataService();
			// Override getSessionDataDir so the rewriter writes under our
			// in-memory file system instead of the helper's default path.
			sessionDataService.getSessionDataDir = () => sessionDataDir;
			const warnings: string[] = [];
			const logService = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			};
			const svc = disposables.add(new AgentService(logService, fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			svc.registerProvider(agent);
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, attachmentsRoot, warnings };
		}

		async function dispatchTurnAndWait(svc: AgentService, agent: MockAgent, session: URI, attachments: MessageResourceAttachment[] | { type: MessageAttachmentKind.EmbeddedResource; label: string; data: string; contentType: string; displayKind?: string }[]): Promise<void> {
			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt: '2025-01-01T00:00:00.000Z',
					message: { text: 'hello', origin: { kind: MessageKind.User }, attachments: attachments as never },
				},
				'test-client', 1,
			);
			// dispatchAction queues an async rewrite and the side-effect
			// handler is invoked from the same continuation; poll until the
			// agent has observed the (rewritten) sendMessage.
			for (let i = 0; i < 20 && agent.sendMessageCalls.length === 0; i++) {
				await new Promise(r => setTimeout(r, 5));
			}
		}

		test('snapshots EmbeddedResource attachments to disk and rewrites to a Resource URI under the session attachments folder', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'paste.png',
				data: encodeBase64(VSBuffer.wrap(png)),
				contentType: 'image/png',
				displayKind: 'image',
			} as never]);

			assert.strictEqual(agent.sendMessageCalls.length, 1);
			const rewritten = agent.sendMessageCalls[0].attachments;
			assert.strictEqual(rewritten?.length, 1);
			const a = rewritten[0];
			assert.strictEqual(a.type, MessageAttachmentKind.Resource);
			if (a.type !== MessageAttachmentKind.Resource) { return; }
			assert.strictEqual(a.label, 'paste.png');
			assert.strictEqual(a.displayKind, 'image');
			assert.ok(a.uri.startsWith(attachmentsRoot.toString() + '/'), `attachment uri ${a.uri} should be under ${attachmentsRoot.toString()}/`);
			// File on disk holds exactly the original bytes
			const written = await fileService.readFile(URI.parse(a.uri));
			assert.deepStrictEqual([...written.value.buffer], [...png]);
		});

		test('preserves existing displayKind / range / selection / _meta on rewrite', async () => {
			const { svc, agent, session } = await setup();
			const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'note.txt',
				data: encodeBase64(VSBuffer.fromString('alpha\nbeta\ngamma')),
				contentType: 'text/plain',
				// EmbeddedResource carries optional selection too
				// (textual resources only); make sure the rewriter copies it.
				displayKind: 'selection',
			} as never]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			// `displayKind` is preserved as-is from the original attachment.
			assert.strictEqual(rewritten.displayKind, 'selection');

			void range; // selection round-trip on EmbeddedResource is covered by the next test
		});

		test('snapshots Resource attachments by reading the original file and rewriting to a local snapshot', async () => {
			const { svc, agent, session, attachmentsRoot, warnings } = await setup();
			const sourceUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/source.txt' });
			await fileService.writeFile(sourceUri, VSBuffer.fromString('hello world'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: sourceUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			assert.notStrictEqual(rewritten.uri, sourceUri.toString(), `should be rewritten to the snapshot URI; warnings=${JSON.stringify(warnings)}; got ${rewritten.uri}`);
			assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + '/'));
			assert.strictEqual(rewritten.label, 'source.txt');
			assert.strictEqual(rewritten.displayKind, 'document');

			const snapshot = await fileService.readFile(URI.parse(rewritten.uri));
			assert.strictEqual(snapshot.value.toString(), 'hello world');
		});

		test('passes through existing file:// Resource attachments unchanged (#319314)', async () => {
			const { svc, agent, session } = await setup();
			// Register a file-scheme provider so the attachment URI resolves to
			// an existing file on the agent host side.
			disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
			const fileUri = URI.from({ scheme: Schemas.file, path: '/host/source.txt' });
			await fileService.writeFile(fileUri, VSBuffer.fromString('on host'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: fileUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: fileUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);
		});

		test('preserves selection range on Resource rewrite', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const sourceUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/sel.txt' });
			await fileService.writeFile(sourceUri, VSBuffer.fromString('alpha\nbeta\ngamma'));
			const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: sourceUri.toString(),
				label: 'sel.txt',
				displayKind: 'selection',
				selection: { range },
			}]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + '/'), 'should be rewritten to a snapshot URI');
			assert.deepStrictEqual(rewritten.selection?.range, range);
			assert.strictEqual(rewritten.displayKind, 'selection');
		});

		test('passes directory Resource attachments through unchanged', async () => {
			const { svc, agent, session } = await setup();
			const dirUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/dir' });

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: dirUri.toString(),
				label: 'dir',
				displayKind: 'directory',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: dirUri.toString(),
				label: 'dir',
				displayKind: 'directory',
			}]);
		});

		test('does not re-snapshot attachments that already point under the session attachments folder', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const existing = joinPath(attachmentsRoot, 'previous-id', 'note.txt');
			await fileService.writeFile(existing, VSBuffer.fromString('already snapshotted'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: existing.toString(),
				label: 'note.txt',
				displayKind: 'document',
			}]);

			const a = agent.sendMessageCalls[0].attachments?.[0];
			assert.ok(a && a.type === MessageAttachmentKind.Resource);
			assert.strictEqual(a.uri, existing.toString(), 'second-pass rewrite should be a no-op');
		});

		test('preserves the original attachment when the source cannot be read', async () => {
			const { svc, agent, session } = await setup();
			const missingUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/missing.txt' });

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: missingUri.toString(),
				label: 'missing.txt',
				displayKind: 'document',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: missingUri.toString(),
				label: 'missing.txt',
				displayKind: 'document',
			}]);
		});
	});

	suite('createSession', () => {

		test('creates session via specified provider', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('honors requested session URI', async () => {
			service.registerProvider(copilotAgent);

			const requestedSession = AgentSession.uri('copilot', 'requested-session');
			const session = await service.createSession({ provider: 'copilot', session: requestedSession });
			assert.strictEqual(session.toString(), requestedSession.toString());
		});

		test('scripted mock agent honors requested session URI', async () => {
			const agent = new ScriptedMockAgent();
			disposables.add(toDisposable(() => agent.dispose()));

			const requestedSession = AgentSession.uri('mock', 'requested-session');
			const result = await agent.createSession({ session: requestedSession });
			const sessions = await agent.listSessions();

			assert.deepStrictEqual({
				created: result.session.toString(),
				listed: sessions.some(s => s.session.toString() === requestedSession.toString()),
			}, {
				created: requestedSession.toString(),
				listed: true,
			});
		});

		test('uses default provider when none specified', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession();
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('throws when no providers are registered at all', async () => {
			await assert.rejects(() => service.createSession(), /No agent provider/);
		});
	});

	// ---- disposeSession -------------------------------------------------

	suite('disposeSession', () => {

		test('dispatches to the correct provider and cleans up tracking', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			await service.disposeSession(session);

			assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1);
		});

		test('is a no-op for unknown sessions', async () => {
			service.registerProvider(copilotAgent);
			const unknownSession = URI.from({ scheme: 'unknown', path: '/nope' });

			// Should not throw
			await service.disposeSession(unknownSession);
		});
	});

	// ---- listSessions / listModels --------------------------------------

	suite('aggregation', () => {

		test('listSessions aggregates sessions from all providers', async () => {
			service.registerProvider(copilotAgent);

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
		});

		test('listSessions overlays custom title from session database', async () => {
			// Pre-seed a custom title in an in-memory database
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('customTitle', 'My Custom Title');

			const sessionId = 'test-session-abc';
			const sessionUri = AgentSession.uri('copilot', sessionId);

			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({
					object: db,
					dispose: () => { },
				}),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({
					object: db,
					dispose: () => { },
				}),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			// Create a mock that returns a session with that ID
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { summary: 'SDK Title' };
			// Manually add the session to the mock
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'My Custom Title');
		});

		test('listSessions overlays the AH-owned workspaceless marker for any agent', async () => {
			// The AH service owns `agentHost.workspaceless` in the central session
			// database and overlays it onto every agent's summary `_meta` — so an
			// agent that persists/re-emits nothing itself still restores as a quick
			// chat. Pre-seed the AH key with no agent-side re-emit.
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('agentHost.workspaceless', 'true');

			const sessionId = 'test-session-workspaceless';
			const sessionUri = AgentSession.uri('copilot', sessionId);

			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({
					object: db,
					dispose: () => { },
				}),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({
					object: db,
					dispose: () => { },
				}),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			// The agent returns the session with NO `_meta.workspaceless` of its own.
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(sessions[0]._meta, { workspaceless: true });
		});

		test('listSessions uses SDK title when no custom title exists', async () => {
			service.registerProvider(copilotAgent);
			copilotAgent.sessionMetadataOverrides = { summary: 'Auto-generated Title' };

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'Auto-generated Title');
		});

		test('listSessions never returns subagent sessions', async () => {
			service.registerProvider(copilotAgent);
			const parentSession = await service.createSession({ provider: 'copilot' });

			// Simulate a live subagent being spawned: `_handleSubagentStarted`
			// registers the child session via `restoreSession`, which records
			// it in the announced-summary map that `listSessions` overlays
			// onto provider results.
			const childSessionUri = buildSubagentSessionUri(parentSession.toString(), 'tc-sub');
			service.stateManager.restoreSession(
				{
					resource: childSessionUri,
					provider: 'subagent',
					title: 'Explore',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				},
				[],
			);

			// Sanity: the subagent child session is announced.
			assert.ok(
				service.stateManager.getOverlaySessionSummaries().some(s => s.resource === childSessionUri),
				'subagent child session should be listed',
			);

			const listed = await service.listSessions();
			assert.deepStrictEqual(
				{
					subagentSessions: listed.filter(s => isSubagentSession(s.session.toString())).map(s => s.session.toString()),
					includesParent: listed.some(s => s.session.toString() === parentSession.toString()),
				},
				{
					subagentSessions: [],
					includesParent: true,
				},
			);
		});

		test('listSessions overlay excludes idle provisional sessions but keeps ones with an active turn (#321269)', async () => {
			// A provisional agent whose `listSessions` never returns the
			// provisional session (mirroring CLI/Claude, which don't persist a
			// session until its first message). The agent service's overlay is
			// then the only thing that could surface it.
			class ProvisionalMockAgent extends MockAgent {
				override async createSession(config?: import('../../common/agentService.js').IAgentCreateSessionConfig): Promise<import('../../common/agentService.js').IAgentCreateSessionResult> {
					const result = await super.createSession(config);
					return { ...result, provisional: true };
				}
				override async listSessions() {
					return [];
				}
			}

			const provisionalAgent = new ProvisionalMockAgent('copilot');
			disposables.add(toDisposable(() => provisionalAgent.dispose()));
			service.registerProvider(provisionalAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Idle provisional session (the new-session composer's eagerly
			// created session, before its first message) must not leak in.
			const idleListed = await service.listSessions();
			assert.ok(
				!idleListed.some(s => s.session.toString() === session.toString()),
				'idle provisional session should not appear in listSessions',
			);

			// Once a turn is in flight (the first turn can start before
			// materialization completes), the session must stay visible so
			// renderer-side caches don't evict the in-flight session.
			service.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			const activeListed = await service.listSessions();
			assert.ok(
				activeListed.some(s => s.session.toString() === session.toString()),
				'provisional session with an active turn should appear in listSessions',
			);

			// If the turn completes before the materialize event lands, the
			// session is back to lifecycle=creating with no active turn — but it
			// has a recorded turn now, so it must STAY visible (otherwise a
			// listSessions refresh in this window would evict the just-finished
			// session, reintroducing #321269's sibling eviction bug).
			service.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
				'test-client', 2,
			);
			const stateAfterTurn = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(stateAfterTurn?.lifecycle, SessionLifecycle.Creating, 'session should still be provisional (materialize not yet fired)');
			assert.strictEqual(stateAfterTurn?.activeTurn, undefined, 'completed turn should clear the active turn');
			const completedListed = await service.listSessions();
			assert.ok(
				completedListed.some(s => s.session.toString() === session.toString()),
				'provisional session with a completed turn should still appear in listSessions',
			);
		});

		test('listSessions overlays live workspace metadata over a stale provider snapshot', async () => {
			class DelayedListAgent extends MockAgent {
				readonly listStarted = new DeferredPromise<void>();
				readonly releaseList = new DeferredPromise<void>();
				override async listSessions() {
					const snapshot = await super.listSessions();
					this.listStarted.complete();
					await this.releaseList.p;
					return snapshot;
				}
			}

			const agent = new DelayedListAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = URI.file('/original');
			service.registerProvider(agent);
			const { session } = await agent.createSession();

			const listing = service.listSessions();
			await agent.listStarted.p;
			service.stateManager.restoreSession({
				resource: session.toString(),
				provider: 'copilot',
				title: 'Materialized',
				status: SessionStatus.Idle,
				createdAt: new Date(1000).toISOString(),
				modifiedAt: new Date(2000).toISOString(),
				project: { uri: URI.file('/project').toString(), displayName: 'project' },
				workingDirectory: URI.file('/worktree').toString(),
			}, []);
			agent.releaseList.complete();

			const listed = (await listing).find(item => item.session.toString() === session.toString());
			assert.deepStrictEqual({
				modifiedTime: listed?.modifiedTime,
				project: listed?.project && { uri: listed.project.uri.path, displayName: listed.project.displayName },
				workingDirectory: listed?.workingDirectory?.path,
			}, {
				modifiedTime: 2000,
				project: { uri: '/project', displayName: 'project' },
				workingDirectory: '/worktree',
			});
		});

		test.skip('listSessions synthesizes the session changeset catalogue from persisted diffs for unopened sessions', async () => {
			// Pre-seed a `'diffs'` blob in the in-memory DB. The agent's
			// `listSessions()` returns the session metadata but the session
			// is NOT live in the state manager (no createSession /
			// restoreSession call), so the synthesised catalogue path runs.
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } },
					diff: { added: 3, removed: 0 },
				},
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'persisted-session';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/session`,
					additions: 8,
					deletions: 2,
					files: 2,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions silently ignores malformed persisted diffs', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('diffs', '{ not valid json');

			const sessionId = 'bad-diffs-session';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].changesets, undefined);
		});

		test.skip('listSessions advertises persisted changeset counts without seeding state; changeset subscribe restores lazily', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-with-diffs';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			const changesetUri = buildSessionChangesetUri(sessionUri.toString());

			assert.deepStrictEqual({
				listCatalogueEntry: sessions[0].changesets?.find(c => c.uriTemplate === changesetUri),
				listSeededSnapshot: svc.stateManager.getSnapshot(changesetUri),
			}, {
				listCatalogueEntry: {
					label: 'Branch Changes',
					uriTemplate: changesetUri,
					additions: 5,
					deletions: 2,
					files: 1,
				},
				listSeededSnapshot: undefined,
			});

			const snapshot = await svc.subscribe(URI.parse(changesetUri), 'client-changeset');
			const state = snapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(state.status, 'ready');
			assert.deepStrictEqual(state.files.map(f => f.id), ['file:///wd/a.ts']);
		});

		test.skip('listSessions prefers ready live changeset state over stale persisted diffs for unopened sessions', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			// Stale persisted diffs — obviously different totals so the
			// source-of-truth choice is visible.
			const persistedDiffs = [
				{ after: { uri: 'file:///wd/x.ts', content: { uri: 'file:///wd/x.ts' } }, diff: { added: 99, removed: 0 } },
				{ after: { uri: 'file:///wd/y.ts', content: { uri: 'file:///wd/y.ts' } }, diff: { added: 0, removed: 0 } },
				{ after: { uri: 'file:///wd/z.ts', content: { uri: 'file:///wd/z.ts' } }, diff: { added: 0, removed: 0 } },
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-stale-diffs';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Seed live changeset state directly: a single file with
			// different counts than the stale persisted blob.
			const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetFileSet,
				file: {
					id: 'file:///wd/live.ts',
					edit: { after: { uri: 'file:///wd/live.ts', content: { uri: 'file:///wd/live.ts' } }, diff: { added: 1, removed: 0 } }
				},
			});
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Ready,
			});

			const sessions = await svc.listSessions();
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: changesetUri,
					additions: 1,
					deletions: 0,
					files: 1,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions does not request the diffs metadata key when a live source can answer', async () => {
			const requestedKeys: string[][] = [];
			const db: ISessionDatabase = {
				dispose: () => { },
				getMetadata: async () => undefined,
				getMetadataObject: async <T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> => {
					requestedKeys.push(Object.keys(obj));
					return Object.fromEntries(Object.keys(obj).map(k => [k, undefined])) as { [K in keyof T]: string | undefined };
				},
				setMetadata: async () => { },
				deleteMetadata: async () => { },
				appendEvent: async () => { },
				readEvents: async () => [],
				readEventCount: async () => 0,
			} as unknown as ISessionDatabase;

			const sessionId = 'unopened-live-source';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Seed a ready (zero-file) live changeset state — this alone
			// must be authoritative enough to suppress the persisted-diffs
			// read.
			const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Ready,
			});

			await svc.listSessions();

			assert.strictEqual(requestedKeys.length, 1);
			assert.strictEqual(requestedKeys[0].includes('diffs'), false, `expected listSessions to skip the 'diffs' key when ready live changeset state exists; requested=${requestedKeys[0].join(',')}`);
		});

		test.skip('listSessions still reads persisted diffs when only a computing (not ready) changeset state exists', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{ after: { uri: 'file:///wd/p.ts', content: { uri: 'file:///wd/p.ts' } }, diff: { added: 7, removed: 1 } },
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-computing-changeset';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Register a changeset but leave it in the default
			// `Computing` status (no ChangesetStatusChanged dispatch).
			svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));

			const sessions = await svc.listSessions();
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/session`,
					additions: 7,
					deletions: 1,
					files: 1,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions overlays live state manager title over SDK title', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Simulate immediate title change via state manager
			service.stateManager.dispatchServerAction(session.toString(), {
				type: ActionType.SessionTitleChanged,
				title: 'User first message',
			});

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'User first message');
		});

		test('createSession attaches git state into state _meta when working directory is present', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: true,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: 'origin/feature/x',
				incomingChanges: 1,
				outgoingChanges: 2,
				uncommittedChanges: 3,
			};
			const calls: string[] = [];
			const gitService = {
				_serviceBrand: undefined,
				getCurrentBranch: async () => undefined,
				getDefaultBranch: async () => undefined,
				getBranches: async () => [],
				getRepositoryRoot: async () => undefined,
				getWorktreeRoots: async () => [],
				addWorktree: async () => { },
				copyWorktreeIncludeFiles: async () => { },
				addExistingWorktree: async () => { },
				removeWorktree: async () => { },
				branchExists: async () => false,
				hasUncommittedChanges: async () => false,
				commitAll: async () => { },
				restore: async () => { },
				hasUpstream: async () => false,
				pull: async () => { },
				push: async () => { },
				getSessionGitState: async (uri: URI) => { calls.push(uri.fsPath); return gitState; },
				computeSessionFileDiffs: async () => undefined,
				showBlob: async () => undefined,
				captureWorkingTreeAsTree: async () => undefined,
				commitTree: async () => undefined,
				updateRef: async () => { },
				deleteRefs: async () => { },
				revParse: async () => undefined,
				resolveBranchBaselineCommit: async () => undefined,
				overlayPathIntoTree: async () => undefined,
				diffTreePaths: async () => undefined,
				computeFileDiffsBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			// A normal session passes an input workingDirectory, so it is not
			// inferred workspace-less; `_meta` carries only the git overlay.
			const session = await localService.createSession({ provider: 'copilot', workingDirectory });

			// _attachGitState is fire-and-forget; drain microtasks until the
			// git service's promise has resolved and setSessionMeta has run.
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const sessions = await localService.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
			assert.deepStrictEqual(
				localService.stateManager.getSessionState(session.toString())?._meta,
				{ git: gitState },
			);
		});

		test.skip('createSession refreshes branch and uncommitted changesets after git state attaches', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const computeCalls: Array<{ sessionUri: string; baseBranch: string | undefined }> = [];
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;
			gitService.computeSessionFileDiffs = async (_wd, opts) => {
				computeCalls.push({ sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
				return [];
			};
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 100 && computeCalls.length < 2; i++) {
				await new Promise(resolve => setTimeout(resolve, 2));
			}

			assert.deepStrictEqual(
				computeCalls.sort((a, b) => (a.baseBranch ?? '').localeCompare(b.baseBranch ?? '')),
				[
					{ sessionUri: session.toString(), baseBranch: undefined },
					{ sessionUri: session.toString(), baseBranch: 'main' },
				],
			);
		});

		test('createSession infers workspace-less (and skips git overlay) when no working directory', async () => {
			const gitService = {
				_serviceBrand: undefined,
				getCurrentBranch: async () => undefined,
				getDefaultBranch: async () => undefined,
				getBranches: async () => [],
				getRepositoryRoot: async () => undefined,
				getWorktreeRoots: async () => [],
				addWorktree: async () => { },
				copyWorktreeIncludeFiles: async () => { },
				addExistingWorktree: async () => { },
				removeWorktree: async () => { },
				branchExists: async () => false,
				hasUncommittedChanges: async () => false,
				commitAll: async () => { },
				hasUpstream: async () => false,
				pull: async () => { },
				push: async () => { },
				restore: async () => { },
				getSessionGitState: async () => undefined,
				computeSessionFileDiffs: async () => undefined,
				showBlob: async () => undefined,
				captureWorkingTreeAsTree: async () => undefined,
				commitTree: async () => undefined,
				updateRef: async () => { },
				deleteRefs: async () => { },
				revParse: async () => undefined,
				resolveBranchBaselineCommit: async () => undefined,
				overlayPathIntoTree: async () => undefined,
				diffTreePaths: async () => undefined,
				computeFileDiffsBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			// No resolvedWorkingDirectory set on the mock.
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			const sessions = await localService.listSessions();

			assert.strictEqual(sessions.length, 1);
			// No input workingDirectory → inferred workspace-less (tagged), and no
			// git overlay because there is no working directory to probe.
			assert.deepStrictEqual(localService.stateManager.getSessionState(session.toString())?._meta, { workspaceless: true });
		});

		test.skip('createSession strips git-only catalogue entries for non-git working directory', async () => {
			const workingDirectory = URI.file('/workspace/not-a-repo');
			const gitService = createNoopGitService();
			// Probe runs but reports "not a git repo".
			gitService.getSessionGitState = async () => undefined;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets?.length, 0);
		});

		test.skip('createSession keeps git-only catalogue entries for a git working directory', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'main',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, [
				{ label: 'Branch Changes', uriTemplate: `${session.toString()}/changeset/session`, description: 'main', changeKind: 'session' },
				{ label: 'Uncommitted Changes', uriTemplate: `${session.toString()}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
			]);
		});

		test.skip('createSession sets Branch Changes description from worktree branch info', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, [
				{ label: 'Branch Changes', uriTemplate: `${session.toString()}/changeset/session`, description: 'feature/x → main', changeKind: 'session' },
				{ label: 'Uncommitted Changes', uriTemplate: `${session.toString()}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
			]);
		});

		test('subscribe lazily attaches git state when an existing session has no _meta.git', () => {
			// Regression test: previously AgentService was constructed without
			// a git service, so the git probe always bailed and `_meta.git`
			// was never populated. This test ensures the lazy-fire path on
			// subscribe() actually invokes the git service and writes git
			// state into the session's `_meta`.
			//
			// subscribe() kicks off the git-state refresh as fire-and-forget
			// (it does not await it), so the test must yield to let that async
			// work run before asserting. Fake timers are used because the
			// refresh is rate-limited (it only settles after a delay).
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const workingDirectory = URI.file('/workspace/repo');
				const gitState = {
					hasGitHubRemote: false,
					branchName: 'feature/lazy',
					baseBranchName: 'main',
					upstreamBranchName: undefined,
					incomingChanges: 0,
					outgoingChanges: 0,
					uncommittedChanges: 0,
				};
				const calls: string[] = [];
				const gitService = createNoopGitService();
				gitService.getSessionGitState = async (uri: URI) => { calls.push(uri.fsPath); return gitState; };
				const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
				const agent = new MockAgent('copilot');
				disposables.add(toDisposable(() => agent.dispose()));
				agent.resolvedWorkingDirectory = workingDirectory;
				agent.sessionMetadataOverrides = { workingDirectory };
				localService.registerProvider(agent);

				// Seed a session and clear its _meta so subscribe must lazily
				// recompute git state. A microtask drain lets the
				// createSession-triggered refresh record its call so we can
				// reset the probes to a clean baseline.
				const session = await localService.createSession({ provider: 'copilot' });
				for (let i = 0; i < 5; i++) {
					await Promise.resolve();
				}
				localService.stateManager.setSessionMeta(session.toString(), undefined);
				calls.length = 0;

				// subscribe fires the git-state refresh without awaiting it, so
				// advance time to let that fire-and-forget refresh run and write
				// _meta.git.
				await localService.subscribe(session, 'client-1');
				await timeout(5_000);

				assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
				assert.deepStrictEqual(
					localService.stateManager.getSessionState(session.toString())?._meta,
					{ git: gitState },
				);
			});
		});

		test('subscribe to a registered session changeset URI returns a changeset snapshot', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			const changesetUri = buildSessionChangesetUri(session.toString());
			const snapshot = await service.subscribe(URI.parse(changesetUri), 'client-cs-known');

			assert.deepStrictEqual(
				{
					resource: snapshot.resource.toString(),
					files: (snapshot.state as ChangesetState).files.length,
				},
				{
					resource: changesetUri,
					files: 0,
				},
			);
		});

		test('subscribe to an unknown changeset id fails without restoring the parent session', async () => {
			service.registerProvider(copilotAgent);
			// Build a changeset URI with a producer-defined id we don't
			// recognise (`staged`). The unknown-changeset early throw must
			// fire before the session-restore fallback so the parent session
			// is not materialized as a side effect of subscribing to a child
			// changeset URI.
			const sessionUri = URI.from({ scheme: 'copilot', path: '/missing-session' }).toString();
			const changesetUri = `${sessionUri}/changeset/staged`;

			await assert.rejects(
				() => service.subscribe(URI.parse(changesetUri), 'client-cs-unknown'),
				/unknown changeset resource/,
			);
			assert.strictEqual(
				service.stateManager.getSessionState(sessionUri),
				undefined,
				'parent session must not be materialized as a side effect of an unknown changeset subscription',
			);
		});

		test('createSession stores live session config', async () => {
			service.registerProvider(copilotAgent);

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const session = await service.createSession({ provider: 'copilot', config });

			assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.config?.values, config);
		});

		test('seeds activeClient into the initial session state when provided', async () => {
			service.registerProvider(copilotAgent);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(service.onDidAction(env => envelopes.push(env)));

			const activeClient: SessionActiveClient = {
				clientId: 'client-eager',
				tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
				customizations: [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'A', enabled: true }],
			};
			const session = await service.createSession({ provider: 'copilot', activeClient });

			assert.deepStrictEqual({
				activeClients: service.stateManager.getSessionState(session.toString())?.activeClients,
				dispatchedActiveClientSet: envelopes.some(e => e.action.type === ActionType.SessionActiveClientSet),
			}, {
				activeClients: [activeClient],
				dispatchedActiveClientSet: false,
			});
		});

		test('omits activeClient from the initial session state when not provided', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.activeClients, []);
		});
	});

	// ---- authenticate ---------------------------------------------------

	suite('authenticate', () => {

		test('routes token to provider matching the resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'ghp_test123' });

			assert.deepStrictEqual(result, { authenticated: true });
			assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'ghp_test123' }]);
		});

		test('returns not authenticated for unknown resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://unknown.example.com', token: 'tok' });

			assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: 'https://unknown.example.com' }), authenticateCalls: copilotAgent.authenticateCalls }, {
				result: { authenticated: false },
				token: undefined,
				authenticateCalls: [],
			});
		});

		test('stores GitHub Copilot token for operation handlers', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' });

			assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported }), authenticateCalls: copilotAgent.authenticateCalls }, {
				result: { authenticated: true },
				token: 'copilot-token',
				authenticateCalls: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' }],
			});
		});

		test('stores tokens for the same resource by scopes', async () => {
			service.registerProvider(copilotAgent);

			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'], token: 'read-token' });
			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user', 'user:email'], token: 'profile-token' });

			assert.deepStrictEqual({
				readToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'] }),
				profileToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email', 'read:user'] }),
				supersetToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email'] }),
			}, {
				readToken: 'read-token',
				profileToken: 'profile-token',
				supersetToken: 'profile-token',
			});
		});

		test('fans out to every provider that owns the resource', async () => {
			// Two providers share the same protected resource (the real
			// motivating example: both Copilot CLI and Claude consume the
			// GitHub Copilot token). Both must see the token — the
			// previous for-loop short-circuit only delivered to the first.
			const claudeAgent = new MockAgent('claude');
			claudeAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			disposables.add(toDisposable(() => claudeAgent.dispose()));
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual({
				result,
				copilotCalls: copilotAgent.authenticateCalls,
				claudeCalls: claudeAgent.authenticateCalls,
			}, {
				result: { authenticated: true },
				copilotCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
				claudeCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
			});
		});

		test('isolates a provider that throws — others still authenticate', async () => {
			// Regression: if any provider's authenticate() rejects, the
			// fan-out must NOT sink the others. Previously the call used
			// Promise.all, which propagated the first rejection.
			const flakyAgent = new MockAgent('claude');
			flakyAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyAgent.authenticate = async () => { throw new Error('proxy bind failed'); };
			disposables.add(toDisposable(() => flakyAgent.dispose()));
			service.registerProvider(copilotAgent);
			service.registerProvider(flakyAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual({
				result,
				copilotCalls: copilotAgent.authenticateCalls,
			}, {
				result: { authenticated: true },
				copilotCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
			});
		});

		test('reports not authenticated when every matching provider rejects', async () => {
			// All matching providers fail — the result must be
			// { authenticated: false } rather than a thrown error.
			const flakyA = new MockAgent('claude');
			const flakyB = new MockAgent('mock');
			flakyA.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyB.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyA.authenticate = async () => { throw new Error('A'); };
			flakyB.authenticate = async () => { throw new Error('B'); };
			disposables.add(toDisposable(() => flakyA.dispose()));
			disposables.add(toDisposable(() => flakyB.dispose()));
			service.registerProvider(flakyA);
			service.registerProvider(flakyB);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual(result, { authenticated: false });
		});
	});

	// ---- shutdown -------------------------------------------------------

	suite('shutdown', () => {

		test('shuts down all providers', async () => {
			let copilotShutdown = false;
			copilotAgent.shutdown = async () => { copilotShutdown = true; };

			service.registerProvider(copilotAgent);

			await service.shutdown();
			assert.ok(copilotShutdown);
		});
	});

	// ---- restoreSession -------------------------------------------------

	suite('restoreSession', () => {

		async function waitForDraft(db: TestSessionDatabase, chat: URI, expected: unknown): Promise<void> {
			for (let i = 0; i < 20; i++) {
				if (JSON.stringify(await db.getChatDraft(chat)) === JSON.stringify(expected)) {
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 5));
			}
			assert.deepStrictEqual(await db.getChatDraft(chat), expected);
		}

		test('restores the AH-owned workspaceless marker onto the summary _meta for any agent', async () => {
			// The workspace-less marker is owned by the AH service and overlaid on
			// restore from the central session DB — the agent (MockAgent) re-emits
			// nothing itself, yet the restored session still carries the tag.
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(copilotAgent);
			await copilotAgent.createSession();
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];
			await db.setMetadata('agentHost.workspaceless', 'true');

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(localService.stateManager.getSessionState(sessionResource.toString())?._meta, { workspaceless: true });
		});

		test('restores a session with message history', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state, 'session should be in state manager');
			assert.strictEqual(state!.lifecycle, SessionLifecycle.Ready);
			assert.strictEqual(state!.turns.length, 1);
			assert.strictEqual(state!.turns[0].message.text, 'Hello');
			const mdPart = state!.turns[0].responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdPart);
			assert.strictEqual(mdPart.content, 'Hi there!');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);
		});

		test('interleaves persisted host-injected local turns after their anchor on restore', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			const defaultChatUri = buildDefaultChatUri(sessionResource.toString());

			// SDK transcript reconstructs a single real turn keyed by the user
			// envelope id (`msg-real`, per mapSessionEvents).
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-real', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-real-a', content: 'Hi there!', toolRequests: [] },
			];

			// A host-injected local turn anchored after the real turn, plus one
			// with no anchor (precedes any real turn), plus an orphan whose
			// anchor is absent from the SDK transcript (should be dropped).
			const localTurn = (id: string, text: string) => ({ id, message: { text, origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete });
			await db.insertLocalTurn({ turnId: 'local-head', chatUri: defaultChatUri, anchorTurnId: undefined, seq: 1, payload: JSON.stringify(localTurn('local-head', '!pwd')) });
			await db.insertLocalTurn({ turnId: 'local-after', chatUri: defaultChatUri, anchorTurnId: 'msg-real', seq: 2, payload: JSON.stringify(localTurn('local-after', '!ls')) });
			await db.insertLocalTurn({ turnId: 'local-orphan', chatUri: defaultChatUri, anchorTurnId: 'gone', seq: 3, payload: JSON.stringify(localTurn('local-orphan', '!echo')) });

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			// head (no anchor) first, then the real turn, then its anchored local; orphan dropped.
			assert.deepStrictEqual(state!.turns.map(t => t.id), ['local-head', 'msg-real', 'local-after']);
		});


		test('restores the default chat\'s independently-renamed title', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(copilotAgent);
			await copilotAgent.createSession();
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];

			// The host persists an independent default-chat rename under this key;
			// restore must seed it back or the main chat tab reverts to the session title.
			const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
			await db.setMetadata(`customChatTitle:${defaultChatUri}`, 'Renamed Default Chat');

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.strictEqual(state?.chats.find(c => c.resource === defaultChatUri)?.title, 'Renamed Default Chat');
		});

		test('persists chat drafts to session metadata', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(copilotAgent);
			const session = await localService.createSession({ provider: 'copilot' });
			const draft = {
				text: 'draft text',
				origin: { kind: MessageKind.User },
				model: { id: 'opus-4.7' },
				agent: { uri: 'agent://reviewer' },
			};

			localService.dispatchAction(buildDefaultChatUri(session.toString()), {
				type: ActionType.ChatDraftChanged,
				draft,
			}, 'test-client', 1);

			await waitForDraft(db, URI.parse(buildDefaultChatUri(session.toString())), draft);
		});

		test('restores chat drafts from session metadata', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			const draft = {
				text: 'restored draft',
				origin: { kind: MessageKind.User },
				model: { id: 'opus-4.7' },
				agent: { uri: 'agent://reviewer' },
			};
			await db.setChatDraft(URI.parse(buildDefaultChatUri(sessionResource.toString())), draft);
			(copilotAgent as MockAgent & { getChatDraft(chat: URI): Promise<typeof draft | undefined> }).getChatDraft = chat => db.getChatDraft(chat) as Promise<typeof draft | undefined>;
			copilotAgent.sessionMessages = [];

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(localService.stateManager.getSessionState(session.toString())?.draft, draft);
		});

		test('restores a session with tool calls', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Run a command', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'I will run a command.', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running command...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'output' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			const turn = state!.turns[0];
			const toolCallParts = turn.responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1);
			const tc = toolCallParts[0].toolCall as ToolCallCompletedState;
			assert.strictEqual(tc.status, ToolCallStatus.Completed);
			assert.strictEqual(tc.toolCallId, 'tc-1');
			assert.strictEqual(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
		});

		test('interleaves reasoning, markdown, and tool calls in stream order on resume', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'u-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'a-1', content: 'Reply A', reasoningText: 'Thinking A', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'a-2', content: 'Reply B', reasoningText: 'Thinking B', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			const turn = state!.turns[0];
			const summary = turn.responseParts.map(p => {
				if (p.kind === ResponsePartKind.Reasoning) { return ['reasoning', p.content]; }
				if (p.kind === ResponsePartKind.Markdown) { return ['markdown', p.content]; }
				if (p.kind === ResponsePartKind.ToolCall) { return ['toolCall', p.toolCall.toolCallId]; }
				return ['other'];
			});
			assert.deepStrictEqual(summary, [
				['reasoning', 'Thinking A'],
				['markdown', 'Reply A'],
				['toolCall', 'tc-1'],
				['reasoning', 'Thinking B'],
				['markdown', 'Reply B'],
			]);
		});

		test('flushes interrupted turns', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Interrupted', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'msg-2', content: 'Retried', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Answer', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].state, TurnState.Complete);
		});

		test('throws when session is not found on backend', async () => {
			service.registerProvider(copilotAgent);
			await assert.rejects(
				() => service.restoreSession(AgentSession.uri('copilot', 'nonexistent')),
				/Session not found on backend/,
			);
		});

		test('restores known session without listing all provider sessions', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			service.stateManager.deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			let listSessionsCalled = false;
			copilotAgent.listSessions = async () => {
				listSessionsCalled = true;
				throw new Error('restoreSession should not enumerate sessions');
			};

			await service.restoreSession(session);

			assert.strictEqual(listSessionsCalled, false);
			assert.ok(service.stateManager.getSessionState(session.toString()));
		});

		test('falls back to listing sessions when direct metadata restore fails', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			service.stateManager.deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			copilotAgent.getSessionMetadata = async () => {
				throw new Error('direct metadata unavailable');
			};
			const originalListSessions = copilotAgent.listSessions.bind(copilotAgent);
			let listSessionsCalled = false;
			copilotAgent.listSessions = async () => {
				listSessionsCalled = true;
				return originalListSessions();
			};

			await service.restoreSession(session);

			assert.deepStrictEqual({
				listSessionsCalled,
				restored: !!service.stateManager.getSessionState(session.toString()),
			}, {
				listSessionsCalled: true,
				restored: true,
			});
		});

		test('coalesces concurrent restores for the same session', async () => {
			class BlockingRestoreAgent extends MockAgent {
				readonly metadataReached = new DeferredPromise<void>();
				readonly metadataGate = new DeferredPromise<void>();
				getSessionMetadataCalls = 0;
				getSessionMessagesCalls = 0;

				override async getSessionMetadata(session: URI) {
					this.getSessionMetadataCalls++;
					this.metadataReached.complete();
					await this.metadataGate.p;
					return super.getSessionMetadata(session);
				}

				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					this.getSessionMessagesCalls++;
					return super.getSessionMessages(session);
				}
			}

			const agent = disposables.add(new BlockingRestoreAgent('copilot'));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			service.stateManager.deleteSession(session.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			const firstRestore = service.restoreSession(session);
			await agent.metadataReached.p;
			const secondRestore = service.restoreSession(session);

			assert.strictEqual(agent.getSessionMetadataCalls, 1);
			agent.metadataGate.complete();
			await Promise.all([firstRestore, secondRestore]);

			assert.deepStrictEqual({
				metadataCalls: agent.getSessionMetadataCalls,
				messageCalls: agent.getSessionMessagesCalls,
				restored: !!service.stateManager.getSessionState(session.toString()),
			}, {
				metadataCalls: 1,
				messageCalls: 1,
				restored: true,
			});
		});

		test('hydrates session customizations when restoring an existing session', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			service.stateManager.deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			let getSessionCustomizationsCalls = 0;
			copilotAgent.getSessionCustomizations = async () => {
				getSessionCustomizationsCalls++;
				return [
					{ type: CustomizationType.Plugin, id: customizationId('file:///restore-skill'), uri: 'file:///restore-skill', name: 'Restore Skill', enabled: true },
				];
			};

			await service.restoreSession(session);

			const customizations = service.stateManager.getSessionState(session.toString())?.customizations;
			assert.strictEqual(getSessionCustomizationsCalls, 1);
			assert.strictEqual(customizations?.length, 1);
			assert.strictEqual(customizations?.[0]?.type, CustomizationType.Plugin);
			assert.strictEqual(customizations?.[0]?.name, 'Restore Skill');
			assert.strictEqual(customizations?.[0]?.id, customizationId('file:///restore-skill'));
			assert.strictEqual(customizations?.[0]?.enabled, true);
		});

		test('clears failed restore attempts so sessions can be retried', async () => {
			class FailingOnceRestoreAgent extends MockAgent {
				shouldFailRestore = true;
				getSessionMessagesCalls = 0;

				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					this.getSessionMessagesCalls++;
					if (this.shouldFailRestore) {
						throw new Error('restore failed');
					}
					return super.getSessionMessages(session);
				}
			}

			const agent = disposables.add(new FailingOnceRestoreAgent('copilot'));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			service.stateManager.deleteSession(session.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await assert.rejects(() => service.restoreSession(session), /restore failed/);

			agent.shouldFailRestore = false;
			await service.restoreSession(session);

			assert.deepStrictEqual({
				messageCalls: agent.getSessionMessagesCalls,
				restored: !!service.stateManager.getSessionState(session.toString()),
			}, {
				messageCalls: 2,
				restored: true,
			});
		});

		test('restores a session with subagent tool calls', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review this code', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				// Inner tool calls from the subagent (have parentToolCallId)
				{ type: 'tool_start', session, toolCallId: 'tc-inner-1', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-1', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner-2', toolName: 'view', displayName: 'View File', invocationMessage: 'Reading file1.ts', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-2', result: { success: true, pastTenseMessage: 'Read file1.ts' }, parentToolCallId: 'tc-sub' },
				// Parent tool completes
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found 3 issues' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'The review found 3 issues.', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);

			// Should produce exactly one turn
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}`);

			const turn = state!.turns[0];
			assert.strictEqual(turn.message.text, 'Review this code');

			// The parent turn should only have the parent tool call — inner
			// tool calls are excluded from the parent and belong to the
			// child subagent session instead.
			const toolCallParts = turn.responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1, `Expected 1 tool call (parent only) but got ${toolCallParts.length}`);

			// Parent subagent tool call
			const parentTc = toolCallParts[0].toolCall as ToolCallCompletedState;
			assert.strictEqual(parentTc.toolCallId, 'tc-sub');
			assert.strictEqual(parentTc.status, ToolCallStatus.Completed);
			assert.strictEqual(parentTc._meta?.toolKind, 'subagent');
			assert.strictEqual(parentTc._meta?.subagentDescription, 'Find related files');
			assert.strictEqual(parentTc._meta?.subagentAgentName, 'explore');

			// Parent tool should have subagent content entry
			const content = parentTc.content ?? [];
			const subagentEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
			assert.ok(subagentEntry, 'Completed tool call should have subagent content entry');

			// Subscribing to the child session should restore it with inner tool calls
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), 'tc-sub');
			const snapshot = await service.subscribe(URI.parse(childSessionUri), 'client-test');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(childToolParts.length, 2, `Child session should have 2 inner tool calls but got ${childToolParts.length}`);
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-1'), 'Should have tc-inner-1');
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-2'), 'Should have tc-inner-2');

			// The turn should also have the final markdown
			const mdParts = turn.responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.some(p => p.content.includes('3 issues')), 'Should have the final markdown response');
		});

		test('inner assistant messages from subagent do not create extra turns (fixture)', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Load real SDK events from fixture (sanitized from ~/.copilot/session-state/)
			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}: ${state!.turns.map(t => `"${t.message.text.substring(0, 40)}"`).join(', ')}`);
			assert.strictEqual(state!.turns[0].message.text, 'Run a sync subagent to do some searches, just testing subagent rendering');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);

			// Should have the parent subagent tool call with subagent content
			const toolCallParts = state!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			const parentTc = toolCallParts.find(p => p.toolCall.toolName === 'task');
			assert.ok(parentTc, 'Should have a task tool call');
			assert.strictEqual(parentTc!.toolCall._meta?.toolKind, 'subagent');

			// Inner tool calls should NOT be in the parent turn — they belong
			// to the child subagent session.
			const parentToolCallId = parentTc!.toolCall.toolCallId;
			const nonParentTools = toolCallParts.filter(p => p.toolCall.toolCallId !== parentToolCallId);
			assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);

			// Subscribe to the child subagent session and verify inner tools
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
			const snapshot = await service.subscribe(URI.parse(childSessionUri), 'client-test');
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);

			// Should have the final markdown
			const mdParts = state!.turns[0].responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.length > 0, 'Should have markdown content');
		});

		test('eagerly registers subagent child sessions during parent restore', async () => {
			// An agent that surfaces its subagent children from the parent's
			// reconstructed history, exercising the eager-registration path.
			class EagerSubagentMockAgent extends MockAgent {
				async getSubagentSessions(session: URI): Promise<readonly IRestoredSubagentSession[]> {
					if (parseSubagentSessionUri(session)) {
						return [];
					}
					const parent = session.toString();
					const out: IRestoredSubagentSession[] = [];
					const seen = new Set<string>();
					for (const rec of this.sessionMessages) {
						if (rec.type === 'subagent_started' && !seen.has(rec.toolCallId)) {
							seen.add(rec.toolCallId);
							const childUri = buildSubagentSessionUri(parent, rec.toolCallId);
							const turns = await this.getSessionMessages(URI.parse(childUri));
							if (turns.length > 0) {
								out.push({ resource: URI.parse(childUri), toolCallId: rec.toolCallId, title: rec.agentDisplayName, turns });
							}
						}
					}
					return out;
				}
			}

			const agent = new EagerSubagentMockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session;

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review this code', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner-1', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-1', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found 3 issues' }] } },
			];

			await service.restoreSession(sessionResource);

			// The subagent child state must already exist WITHOUT any client
			// subscribing to it: parent restore registered it eagerly.
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), 'tc-sub');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(childState, 'subagent child should be eagerly registered during parent restore');
			assert.strictEqual(childState!.turns.length, 1, 'child should have its reconstructed turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-1'), 'child should contain the inner tool call');
		});

		test('inner assistant messages from subagent route via envelope agentId (fixture)', async () => {
			// Regression for the SDK migration away from the deprecated
			// `data.parentToolCallId` to the envelope-level `agentId`. Newer
			// session logs only tag subagent events with `agentId`, so the
			// reopen/replay path must resolve those back to the parent tool
			// call id — otherwise the subagent's assistant messages leak into
			// the main session as extra turns.
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session-agentid.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}: ${state!.turns.map(t => `"${t.message.text.substring(0, 40)}"`).join(', ')}`);
			assert.strictEqual(state!.turns[0].message.text, 'Run a sync subagent to do some searches, just testing subagent rendering');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);

			// Should have the parent subagent tool call with subagent content.
			const toolCallParts = state!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			const parentTc = toolCallParts.find(p => p.toolCall.toolName === 'task');
			assert.ok(parentTc, 'Should have a task tool call');
			assert.strictEqual(parentTc!.toolCall._meta?.toolKind, 'subagent');

			// Inner tool calls should NOT be in the parent turn — they belong
			// to the child subagent session.
			const parentToolCallId = parentTc!.toolCall.toolCallId;
			const nonParentTools = toolCallParts.filter(p => p.toolCall.toolCallId !== parentToolCallId);
			assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);

			// The subagent's inner assistant message must not surface in the
			// parent transcript.
			const mdParts = state!.turns[0].responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(
				mdParts.every(p => !p.content.startsWith('Perfect! I now have enough information')),
				'Subagent inner assistant message should not leak into the parent turn',
			);
			assert.ok(mdParts.length > 0, 'Should have markdown content');

			// Subscribe to the child subagent session and verify inner tools
			// and the subagent's assistant message landed there.
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
			const snapshot = await service.subscribe(URI.parse(childSessionUri), 'client-test');
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);
		});

		test('coalesces concurrent restores for the same subagent session', async () => {
			class BlockingSubagentAgent extends MockAgent {
				readonly subagentReached = new DeferredPromise<void>();
				readonly subagentGate = new DeferredPromise<void>();
				subagentGetSessionMessagesCalls = 0;

				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					if (parseSubagentSessionUri(session)) {
						this.subagentGetSessionMessagesCalls++;
						this.subagentReached.complete();
						await this.subagentGate.p;
					}
					return super.getSessionMessages(session);
				}
			}

			const agent = disposables.add(new BlockingSubagentAgent('copilot'));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			const sessions = await agent.listSessions();
			const sessionResource = sessions[0].session;

			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found files' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done.', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);

			const childSessionUri = URI.parse(buildSubagentSessionUri(sessionResource.toString(), 'tc-sub'));
			const firstSubscribe = service.subscribe(childSessionUri, 'client-1');
			await agent.subagentReached.p;
			const secondSubscribe = service.subscribe(childSessionUri, 'client-2');

			assert.strictEqual(agent.subagentGetSessionMessagesCalls, 1);
			agent.subagentGate.complete();
			await Promise.all([firstSubscribe, secondSubscribe]);

			assert.deepStrictEqual({
				messageCalls: agent.subagentGetSessionMessagesCalls,
				childTurns: service.stateManager.getSessionState(childSessionUri.toString())?.turns.length,
			}, {
				messageCalls: 1,
				childTurns: 1,
			});
		});
	});

	// ---- createChat (multi-chat) ----------------------------------------

	suite('createChat', () => {

		test('routes to the provider for a restored session not tracked in the provider map', async () => {
			// A session restored after a host restart lives in the state manager
			// but is not recorded in the session→provider map (only createSession
			// records that). createChat must still resolve the provider via the
			// scheme fallback instead of throwing `no provider for session`.
			const created: { session: string; chat: string }[] = [];
			class MultiChatAgent extends MockAgent {
				override async createChat(session: URI, chat: URI): Promise<void> {
					created.push({ session: session.toString(), chat: chat.toString() });
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			// Drop any tracking so only the scheme fallback can resolve the agent.
			service.stateManager.deleteSession(session.toString());
			await service.restoreSession(session);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);

			const state = service.stateManager.getSessionState(session.toString());
			assert.deepStrictEqual({
				created,
				inCatalog: !!state?.chats.some(c => c.resource.toString() === chatUri.toString()),
			}, {
				created: [{ session: session.toString(), chat: chatUri.toString() }],
				inCatalog: true,
			});
		});

		test('routes a tracked session and registers the chat with its title in the catalog', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { title: 'Peer Chat' });

			const state = service.stateManager.getSessionState(session.toString());
			assert.deepStrictEqual(
				state?.chats.find(c => c.resource.toString() === chatUri.toString())?.title,
				'Peer Chat',
			);
		});

		test('creates the backing chat before registering the chat in the catalog', async () => {
			let catalogHadChatDuringCreate: boolean | undefined;
			class MultiChatAgent extends MockAgent {
				override async createChat(session: URI, chat: URI): Promise<void> {
					const state = service.stateManager.getSessionState(session.toString());
					catalogHadChatDuringCreate = !!state?.chats.some(c => c.resource.toString() === chat.toString());
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);

			assert.strictEqual(catalogHadChatDuringCreate, false);
		});

		test('throws when the provider does not support multiple chats', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));

			await assert.rejects(
				() => service.createChat(session, chatUri),
				/does not support multiple chats/,
			);
		});

		test('disposeChat removes the chat from the catalog and tears down the chat', async () => {
			const disposed: string[] = [];
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
				override async disposeChat(_session: URI, chat: URI): Promise<void> {
					disposed.push(chat.toString());
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);

			await service.disposeChat(session, chatUri);

			const state = service.stateManager.getSessionState(session.toString());
			assert.deepStrictEqual({
				disposed,
				inCatalog: !!state?.chats.some(c => c.resource.toString() === chatUri.toString()),
			}, {
				disposed: [chatUri.toString()],
				inCatalog: false,
			});
		});

		test('restoreSession preserves peer chat catalog order regardless of load timing', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					// Resolve in the reverse of catalog order so a resolution-order
					// append would scramble the catalog; the restore must keep a,b,c.
					const delays: Record<string, number> = { 'peer-a': 30, 'peer-b': 15, 'peer-c': 0 };
					await timeout(delays[parseChatUri(session)?.chatId ?? ''] ?? 0);
					return [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Seed the orchestrator catalog in a,b,c order via createChat.
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-a')));
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-b')));
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-c')));

			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			const peerChatIds = (state?.chats ?? [])
				.map(c => parseChatUri(c.resource)?.chatId)
				.filter((id): id is string => !!id && id.startsWith('peer-'));
			assert.deepStrictEqual(peerChatIds, ['peer-a', 'peer-b', 'peer-c']);
		});

		test('fork seeds the new chat with remapped source turns and forwards fork to the provider', async () => {
			let receivedFork: IAgentCreateChatForkSource | undefined;
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
					receivedFork = options?.fork;
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			// Seed the source (default) chat with two turns and a title.
			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
				{ id: 't2', state: TurnState.Complete, message: { text: 'second', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);
			service.stateManager.updateChatTitle(session.toString(), buildDefaultChatUri(session.toString()), 'My Session');

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 't1' } });

			const newChatState = service.stateManager.getChatState(chatUri.toString());
			const newTurnIds = newChatState?.turns.map(t => t.id) ?? [];
			assert.deepStrictEqual({
				forkSource: receivedFork?.source.toString(),
				forkTurnId: receivedFork?.turnId,
				mappingSize: receivedFork?.turnIdMapping?.size,
				mappedFromT1: receivedFork?.turnIdMapping?.get('t1'),
				newTurnCount: newTurnIds.length,
				newTurnIsRemapped: newTurnIds[0] !== undefined && newTurnIds[0] !== 't1',
				title: newChatState?.title,
			}, {
				forkSource: session.toString(),
				forkTurnId: 't1',
				mappingSize: 1,
				mappedFromT1: newTurnIds[0],
				newTurnCount: 1,
				newTurnIsRemapped: true,
				title: 'Forked: My Session',
			});
		});

		test('fork with an unknown turn id drops the fork and seeds no turns', async () => {
			let receivedFork: IAgentCreateChatForkSource | undefined;
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
					receivedFork = options?.fork;
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 'missing' } });

			const newChatState = service.stateManager.getChatState(chatUri.toString());
			assert.deepStrictEqual({
				forkForwarded: receivedFork !== undefined,
				newTurnCount: newChatState?.turns.length ?? 0,
			}, {
				forkForwarded: false,
				newTurnCount: 0,
			});
		});

		test('fork at a host-injected local turn redirects the SDK boundary to the concrete anchor and carries the local turn into the new chat', async () => {
			let receivedFork: IAgentCreateChatForkSource | undefined;
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
					receivedFork = options?.fork;
				}
			}
			const db = new TestSessionDatabase();
			const agent = disposables.add(new MultiChatAgent('copilot'));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(agent);
			const { session } = await agent.createSession();
			const sessionResource = (await agent.listSessions())[0].session;
			const defaultChatUri = buildDefaultChatUri(sessionResource.toString());

			// SDK transcript reconstructs a single real turn keyed by the user
			// message id; a host-injected local turn is persisted after it.
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'real-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'real-1-a', content: 'Hi', toolRequests: [] },
			];
			const localTurn: Turn = { id: 'local-1', state: TurnState.Complete, message: { text: '!echo hi', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
			await db.insertLocalTurn({ turnId: 'local-1', chatUri: defaultChatUri, anchorTurnId: 'real-1', seq: 1, payload: JSON.stringify(localTurn) });

			// Restore so the source chat interleaves [real-1, local-1] and the
			// in-memory local index knows local-1 is a local turn.
			await localService.restoreSession(sessionResource);
			assert.deepStrictEqual(localService.stateManager.getSessionState(sessionResource.toString())?.turns.map(t => t.id), ['real-1', 'local-1']);

			// Fork the default chat AT the local turn into a new peer chat.
			const peerUri = URI.parse(buildChatUri(sessionResource, 'peer-1'));
			await localService.createChat(sessionResource, peerUri, { fork: { source: URI.parse(defaultChatUri), turnId: 'local-1' } });

			const peerTurns = localService.stateManager.getChatState(peerUri.toString())?.turns ?? [];
			const forkedLocals = (await db.getLocalTurns()).filter(r => r.chatUri === peerUri.toString());
			assert.deepStrictEqual({
				// SDK fork boundary redirected from the local turn to its concrete anchor.
				sdkForkTurnId: receivedFork?.turnId,
				// New chat seeded with remapped copies of both turns.
				peerTurnCount: peerTurns.length,
				// The forked local turn is persisted under the new chat, anchored to
				// the forked copy of the real turn.
				forkedLocalCount: forkedLocals.length,
				forkedLocalAnchor: forkedLocals[0]?.anchorTurnId,
				anchorIsPeerFirstTurn: forkedLocals[0]?.anchorTurnId === peerTurns[0]?.id,
			}, {
				sdkForkTurnId: 'real-1',
				peerTurnCount: 2,
				forkedLocalCount: 1,
				forkedLocalAnchor: peerTurns[0]?.id,
				anchorIsPeerFirstTurn: true,
			});
		});

		test('a peer chat backing session is filtered out of listSessions and stays filtered across a restart', async () => {
			// Per-session databases so the backing SDK session's marker is
			// isolated from the parent session's own database.
			const dbs = new Map<string, TestSessionDatabase>();
			const dbFor = (session: URI): TestSessionDatabase => {
				const key = session.toString();
				let db = dbs.get(key);
				if (!db) {
					db = new TestSessionDatabase();
					dbs.set(key, db);
				}
				return db;
			};
			const perSessionDataService: ISessionDataService = {
				...createSessionDataService(),
				openDatabase: (session: URI): IReference<ISessionDatabase> => ({ object: dbFor(session), dispose: () => { } }),
				tryOpenDatabase: async (session: URI): Promise<IReference<ISessionDatabase> | undefined> => ({ object: dbFor(session), dispose: () => { } }),
			};

			const backingSdkId = 'backing-sdk-id';
			const backingUri = AgentSession.uri('copilot', backingSdkId).toString();
			// A Claude-like agent whose peer-chat backing is a fresh SDK session
			// it also enumerates from listSessions — the leak this fix suppresses.
			class LeakyMultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<IAgentCreateChatResult> {
					return { providerData: 'blob', backingSession: AgentSession.uri(this.id, backingSdkId) };
				}
				override async listSessions(): Promise<IAgentSessionMetadata[]> {
					const base = await super.listSessions();
					return [...base, { session: AgentSession.uri(this.id, backingSdkId), startTime: Date.now(), modifiedTime: Date.now() }];
				}
			}

			const agent = disposables.add(new LeakyMultiChatAgent('copilot'));
			const svc = disposables.add(new AgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await svc.createChat(session, chatUri);

			const beforeRestart = await svc.listSessions();

			// Simulate a host restart: a fresh service over the same persisted
			// databases, with a fresh agent still leaking the backing session.
			const restartAgent = disposables.add(new LeakyMultiChatAgent('copilot'));
			const restarted = disposables.add(new AgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			restarted.registerProvider(restartAgent);
			const afterRestart = await restarted.listSessions();

			assert.deepStrictEqual({
				leakedBeforeRestart: beforeRestart.map(s => s.session.toString()).includes(backingUri),
				markerPersisted: await dbFor(AgentSession.uri('copilot', backingSdkId)).getMetadata('peerChatBacking'),
				leakedAfterRestart: afterRestart.map(s => s.session.toString()).includes(backingUri),
			}, {
				leakedBeforeRestart: false,
				markerPersisted: chatUri.toString(),
				leakedAfterRestart: false,
			});
		});
	});

	// ---- chat surface routing (G-C1) ----------------------------

	suite('chat surface routing', () => {

		/**
		 * An agent that exposes the chat surface AND the legacy
		 * `(session, chat?)` peer-chat methods, recording which path the
		 * orchestrator takes.
		 */
		class ChatSurfaceAgent extends MockAgent {
			readonly sessionCreateCalls: URI[] = [];
			readonly sessionDisposeCalls: URI[] = [];
			readonly legacyCreateChatCalls: URI[] = [];
			readonly chatCalls: { op: string; args: string[] }[] = [];

			override async createSession(config?: import('../../common/agentService.js').IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
				const result = await super.createSession(config);
				this.sessionCreateCalls.push(result.session);
				return result;
			}

			override async disposeSession(session: URI): Promise<void> {
				this.sessionDisposeCalls.push(session);
				await super.disposeSession(session);
			}

			// The legacy peer-chat method is present too; it must NOT be used
			// when the chats surface exists.
			override async createChat(_session: URI, chat: URI): Promise<void> {
				this.legacyCreateChatCalls.push(chat);
			}

			override readonly chats: IAgentChats = {
				createChat: async (chat: URI, options?: IAgentCreateChatOptions) => {
					const session = parseChatUri(chat)!.session;
					this.chatCalls.push({ op: 'createChat', args: [session, chat.toString(), options?.title ?? ''] });
					return { providerData: 'pd' };
				},
				fork: async (chat: URI, source: IAgentCreateChatForkSource) => {
					const session = parseChatUri(chat)!.session;
					this.chatCalls.push({ op: 'fork', args: [session, chat.toString(), source.source.toString(), source.turnId] });
					return { providerData: 'pd-fork' };
				},
				disposeChat: async (chat: URI) => {
					this.chatCalls.push({ op: 'disposeChat', args: [chat.toString()] });
				},
				sendMessage: async () => { },
				abort: async () => { },
				changeModel: async () => { },
				changeAgent: async () => { },
				getMessages: async (chat: URI) => {
					this.chatCalls.push({ op: 'getMessages', args: [chat.toString()] });
					return [];
				},
			};
		}

		test('createSession/createChat/disposeChat/disposeSession prefer the chat surface over legacy methods', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			service.registerProvider(agent);

			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { title: 'Peer' });
			await service.disposeChat(session, chatUri);
			await service.disposeSession(session);

			assert.deepStrictEqual({
				sessionCreate: agent.sessionCreateCalls.map(s => s.toString()),
				sessionDispose: agent.sessionDisposeCalls.map(s => s.toString()),
				legacyCreateChat: agent.legacyCreateChatCalls.length,
				chatOps: agent.chatCalls.map(c => c.op),
				createChatArgs: agent.chatCalls.find(c => c.op === 'createChat')?.args,
				disposeChatArg: agent.chatCalls.find(c => c.op === 'disposeChat')?.args[0],
			}, {
				sessionCreate: [session.toString()],
				sessionDispose: [session.toString()],
				legacyCreateChat: 0,
				chatOps: ['createChat', 'disposeChat'],
				createChatArgs: [session.toString(), chatUri.toString(), 'Peer'],
				disposeChatArg: chatUri.toString(),
			});
		});

		test('fork routes to chats.fork with the resolved source chat', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 't1' } });

			const forkCall = agent.chatCalls.find(c => c.op === 'fork');
			assert.deepStrictEqual(forkCall?.args, [session.toString(), chatUri.toString(), session.toString(), 't1']);
		});

		test('restore reads the default chat via chats.getMessages on the default chat URI', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			service.registerProvider(agent);
			const { session } = await agent.createSession();
			service.stateManager.deleteSession(session.toString());

			await service.restoreSession(session);

			const getMessages = agent.chatCalls.filter(c => c.op === 'getMessages').map(c => c.args[0]);
			assert.deepStrictEqual(getMessages, [buildDefaultChatUri(session)]);
		});
	});

	// ---- spawn channel routing (G-D1) -----------------------------------

	suite('spawn channel routing', () => {

		/**
		 * An agent that exposes the first-class spawn membership channel,
		 * with a test hook to fire {@link IAgent.onDidSpawnChat}.
		 */
		class SpawnChannelAgent extends MockAgent {
			private readonly _onDidSpawnChat = new Emitter<IAgentSpawnChatEvent>();
			readonly onDidSpawnChat = this._onDidSpawnChat.event;

			fireSpawn(e: IAgentSpawnChatEvent): void {
				this._onDidSpawnChat.fire(e);
			}

			override dispose(): void {
				this._onDidSpawnChat.dispose();
				super.dispose();
			}
		}

		test('onDidSpawnChat adds the chat to the catalog with a Tool origin from its parent', async () => {
			const agent = disposables.add(new SpawnChannelAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const parentChat = URI.parse(buildDefaultChatUri(session.toString()));
			const spawned = URI.parse(buildChatUri(session, 'spawned-1'));
			agent.fireSpawn({
				session,
				chat: spawned,
				parent: { chat: parentChat, toolCallId: 'tc-task-1' },
				title: 'Explore',
			});

			const chatState = service.stateManager.getChatState(spawned.toString());
			const sessionChats = (service.stateManager.getSessionState(session.toString())?.chats ?? []).map(c => c.resource);
			assert.deepStrictEqual({
				title: chatState?.title,
				origin: chatState?.origin,
				inCatalog: sessionChats.includes(spawned.toString()),
			}, {
				title: 'Explore',
				origin: { kind: ChatOriginKind.Tool, chat: parentChat.toString(), toolCallId: 'tc-task-1' },
				inCatalog: true,
			});
		});

		test('onDidSpawnChat without a parent adds the chat with no tool origin', async () => {
			const agent = disposables.add(new SpawnChannelAgent('copilot'));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });

			const spawned = URI.parse(buildChatUri(session, 'spawned-2'));
			agent.fireSpawn({ session, chat: spawned });

			const chatState = service.stateManager.getChatState(spawned.toString());
			assert.deepStrictEqual({
				origin: chatState?.origin,
				inCatalog: chatState !== undefined,
			}, {
				origin: undefined,
				inCatalog: true,
			});
		});
	});

	// ---- subagent membership sequencing (DR1: unified spawn channel) ----

	suite('subagent membership sequencing', () => {

		/** Fires a parent turn on the session's default chat. */
		function startParentTurn(session: URI, turnId: string): void {
			service.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId, startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'go', origin: { kind: MessageKind.User } } },
				'client-test', 1,
			);
		}

		test('a subagent_started signal yields exactly one catalog entry with the parent origin, title, and a started turn', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
				taskDescription: 'Review package.json structure',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			const chatState = service.stateManager.getChatState(subagentUri);
			const matching = (service.stateManager.getSessionState(session.toString())?.chats ?? []).filter(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				catalogEntries: matching.length,
				title: chatState?.title,
				origin: chatState?.origin,
				interactivity: chatState?.interactivity,
				hasStartedTurn: service.stateManager.getActiveTurnId(subagentUri) !== undefined,
			}, {
				catalogEntries: 1,
				// The concise per-task description names the tab (distinct even for
				// two subagents of the same type), not the agent-type display name.
				title: 'Review package.json structure',
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tc-sub' },
				interactivity: 'read-only',
				hasStartedTurn: true,
			});
		});

		test('the spawned catalog chat is resolvable from the inline pill resource via parseChatUri (the Open-Subagent contract)', async () => {
			// The inline subagent pill (`ToolResultSubagentContent.resource`) and
			// the catalog chat are both built from `buildSubagentChatUri`, and the
			// Agents window resolves the pill to its tab by matching
			// `parseChatUri(pillResource).chatId` against the catalog chat's
			// parsed chatId (see `findSubagentChat`/`matchesResource` in
			// `openSubagentChat.ts`). If the two ever desync, the pill shows the
			// fallback "Open Subagent" label and clicking it no-ops. Guard the
			// round-trip so the pill stays resolvable.
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
			});

			// The resource the inline pill carries for this subagent.
			const pillResource = buildSubagentChatUri(session.toString(), 'tc-sub');
			const pillChatId = parseChatUri(pillResource)?.chatId;
			const catalog = service.stateManager.getSessionState(session.toString())?.chats ?? [];
			const resolvedByPill = catalog.filter(c => parseChatUri(c.resource)?.chatId === pillChatId);
			assert.deepStrictEqual({
				pillChatId,
				resolvedCatalogEntries: resolvedByPill.length,
			}, {
				pillChatId: 'subagent/tc-sub',
				resolvedCatalogEntries: 1,
			});
		});

		test('a subagent_started signal without a taskDescription falls back to the agent display name for the tab title', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			assert.strictEqual(service.stateManager.getChatState(subagentUri)?.title, 'Explore');
		});

		test('membership stays a single entry when the agent also mirrors the subagent onto onDidSpawnChat, regardless of order', async () => {
			// Mirror the real copilot/claude agents, which ALSO bridge their
			// subagent signals onto onDidSpawnChat. The orchestrator's
			// progress sequencer and the agent's spawn bridge both funnel to the
			// idempotent _onChatSpawned, so the catalog must gain exactly
			// one entry no matter which listener runs first.
			class BridgingSubagentAgent extends MockAgent {
				private readonly _onDidSpawnChat = new Emitter<IAgentSpawnChatEvent>();
				readonly onDidSpawnChat = this._onDidSpawnChat.event;
				private readonly _bridge = this.onDidSessionProgress(signal => {
					const e = SubagentChatSignal.toSpawnEvent(signal);
					if (e) {
						this._onDidSpawnChat.fire(e);
					}
				});

				override dispose(): void {
					this._bridge.dispose();
					this._onDidSpawnChat.dispose();
					super.dispose();
				}
			}

			const agent = new BridgingSubagentAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			service.registerProvider(agent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			agent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			const matching = (service.stateManager.getSessionState(session.toString())?.chats ?? []).filter(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				catalogEntries: matching.length,
				origin: service.stateManager.getChatState(subagentUri)?.origin,
				hasStartedTurn: service.stateManager.getActiveTurnId(subagentUri) !== undefined,
			}, {
				catalogEntries: 1,
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tc-sub' },
				hasStartedTurn: true,
			});
		});

		test('an inner tool call arriving before subagent_started is buffered and drained onto the subagent chat', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			// Parent task tool starts.
			copilotAgent.fireProgress({ kind: 'action', resource: URI.parse(parentChat), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			copilotAgent.fireProgress({ kind: 'action', resource: URI.parse(parentChat), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-sub', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// Inner tool arrives BEFORE subagent_started (buffered).
			copilotAgent.fireProgress({ kind: 'action', resource: URI.parse(parentChat), parentToolCallId: 'tc-sub', action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'inner-1', toolName: 'read', displayName: 'Read', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			copilotAgent.fireProgress({ kind: 'action', resource: URI.parse(parentChat), parentToolCallId: 'tc-sub', action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'inner-1', invocationMessage: 'Reading...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// subagent_started arrives and drains the buffer.
			copilotAgent.fireProgress({ kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			const subState = service.stateManager.getSessionState(subagentUri);
			const innerOnSubagent = subState?.activeTurn?.responseParts.some(rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1');
			const innerOnParent = service.stateManager.getSessionState(session.toString())?.activeTurn?.responseParts.some(rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1');
			assert.deepStrictEqual({ innerOnSubagent, innerOnParent }, { innerOnSubagent: true, innerOnParent: false });
		});

		test('a subagent chat survives subagent_completed (stays live and subscribable, its turn completed)', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({ kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });
			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			assert.ok(service.stateManager.getChatState(subagentUri), 'precondition: subagent chat present after start');

			copilotAgent.fireProgress({ kind: 'subagent_completed', chat: URI.parse(parentChat), toolCallId: 'tc-sub' });

			const stillInCatalog = (service.stateManager.getSessionState(session.toString())?.chats ?? []).some(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				hasChatState: service.stateManager.getChatState(subagentUri) !== undefined,
				stillInCatalog,
				hasActiveTurn: service.stateManager.getActiveTurnId(subagentUri) !== undefined,
			}, {
				hasChatState: true,
				stillInCatalog: true,
				hasActiveTurn: false,
			});
		});

		test('a subagent tool call awaiting user confirmation does not time out before the user responds', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const session = await service.createSession({ provider: 'copilot' });
				const parentChat = buildDefaultChatUri(session.toString());
				startParentTurn(session, 'turn-1');

				copilotAgent.fireProgress({
					kind: 'action', resource: URI.parse(parentChat),
					action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } },
				});
				// No `confirmed` — the tool sits in PendingConfirmation, e.g. waiting on the user.
				copilotAgent.fireProgress({
					kind: 'action', resource: URI.parse(parentChat),
					action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-sub', invocationMessage: 'Delegating...', toolInput: undefined },
				});

				// The user takes far longer than the pending-registration bound to respond.
				await new Promise(resolve => setTimeout(resolve, 60_000));

				// Only now does the user approve — this must still arm a fresh wait, not one already timed out.
				service.dispatchAction(parentChat, { type: ActionType.ChatToolCallConfirmed, turnId: 'turn-1', toolCallId: 'tc-sub', approved: true, confirmed: ToolCallConfirmationReason.UserAction }, 'client-1', 1);

				const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
				const subscribePromise = service.subscribe(URI.parse(subagentUri), 'client-race');
				let settled = false;
				void subscribePromise.then(() => { settled = true; });
				await timeout(0);
				assert.strictEqual(settled, false, 'subscribe should still be pending right after approval');

				copilotAgent.fireProgress({ kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });

				const snapshot = await subscribePromise;
				assert.strictEqual(snapshot.resource, subagentUri);
			});
		});

		test('denying a subagent tool call before confirmation does not leave a dangling wait', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'action', resource: URI.parse(parentChat),
				action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } },
			});
			copilotAgent.fireProgress({
				kind: 'action', resource: URI.parse(parentChat),
				action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-sub', invocationMessage: 'Delegating...', toolInput: undefined },
			});

			service.dispatchAction(parentChat, { type: ActionType.ChatToolCallConfirmed, turnId: 'turn-1', toolCallId: 'tc-sub', approved: false, reason: ToolCallCancellationReason.Denied }, 'client-1', 1);

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			await assert.rejects(service.subscribe(URI.parse(subagentUri), 'client-race'), /Cannot subscribe to unknown resource/);
		});

		test('subscribe to a subagent chat announced via _meta.subagentChatUri waits for the resource instead of failing immediately', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'action', resource: URI.parse(parentChat),
				action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } },
			});
			copilotAgent.fireProgress({
				kind: 'action', resource: URI.parse(parentChat),
				action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-sub', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded },
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			assert.strictEqual(service.stateManager.getSnapshot(subagentUri), undefined, 'precondition: resource not registered yet');

			// Subscribe before the resource exists — this must not reject.
			const subscribePromise = service.subscribe(URI.parse(subagentUri), 'client-race');
			let settled = false;
			void subscribePromise.then(() => { settled = true; });
			await timeout(0);
			assert.strictEqual(settled, false, 'subscribe should still be pending while the resource is unregistered');

			copilotAgent.fireProgress({ kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });

			const snapshot = await subscribePromise;
			assert.strictEqual(snapshot.resource, subagentUri);
		});

		test('subscribe to an announced subagent chat that never spawns eventually rejects instead of hanging', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const session = await service.createSession({ provider: 'copilot' });
				const parentChat = buildDefaultChatUri(session.toString());
				startParentTurn(session, 'turn-1');

				copilotAgent.fireProgress({
					kind: 'action', resource: URI.parse(parentChat),
					action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } },
				});
				copilotAgent.fireProgress({
					kind: 'action', resource: URI.parse(parentChat),
					action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-sub', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded },
				});

				const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');

				// The tool call is denied/cancelled before the SDK ever
				// confirms subagent_started — the resource never registers.
				const subscribePromise = service.subscribe(URI.parse(subagentUri), 'client-race');
				await assert.rejects(subscribePromise, /Cannot subscribe to unknown resource/);
			});
		});
	});

	// ---- peer-chat catalog persistence (B2: orchestrator-owned) ---------

	suite('peer chat catalog persistence', () => {

		/** Polls the persisted peer-chat catalog blob until it appears or times out. */
		async function readCatalog(db: TestSessionDatabase): Promise<{ uri: string; providerData?: string }[]> {
			for (let i = 0; i < 50; i++) {
				const raw = await db.getMetadata('peerChats');
				if (raw !== undefined) {
					return JSON.parse(raw);
				}
				await timeout(0);
			}
			return [];
		}

		test('createChat persists providerData; restore re-materializes from the orchestrator catalog before reading history', async () => {
			const materializeOrder: { call: string; uri: string; providerData?: string }[] = [];
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<{ providerData?: string }> {
					return { providerData: 'blob-1' };
				}
				async materializeChat(chat: URI, providerData: string | undefined): Promise<void> {
					materializeOrder.push({ call: 'materialize', uri: chat.toString(), providerData });
				}
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					if (session.scheme === 'ahp-chat') {
						materializeOrder.push({ call: 'getMessages', uri: session.toString() });
						return [{
							id: 'peer-turn-1',
							state: TurnState.Complete,
							message: { text: 'hi peer', origin: { kind: MessageKind.User } },
							responseParts: [],
							usage: undefined,
						}];
					}
					return [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			await readCatalog(db);

			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			const peerChatState = localService.stateManager.getChatState(peerUri.toString());
			assert.deepStrictEqual({
				order: materializeOrder.map(o => o.call),
				materializedWith: materializeOrder.find(o => o.call === 'materialize')?.providerData,
				inCatalog: !!state?.chats.some(c => c.resource.toString() === peerUri.toString()),
				restoredProviderData: localService.stateManager.getChatProviderData(peerUri.toString()),
				peerTurnIds: peerChatState?.turns.map(t => t.id) ?? [],
			}, {
				// The default chat is read first; peer materialize must precede
				// the peer history read on restore.
				order: ['getMessages', 'materialize', 'getMessages'],
				materializedWith: 'blob-1',
				inCatalog: true,
				restoredProviderData: 'blob-1',
				peerTurnIds: ['peer-turn-1'],
			});
		});

		test('onDidChangeChatData re-persists the updated providerData blob', async () => {
			const onDidChangeChatData = disposables.add(new Emitter<IAgentChatDataChange>());
			class MultiChatAgent extends MockAgent {
				readonly onDidChangeChatData = onDidChangeChatData.event;
				override async createChat(_session: URI, _chat: URI): Promise<{ providerData?: string }> {
					return { providerData: 'v1' };
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			const afterCreate = await readCatalog(db);

			onDidChangeChatData.fire({ chat: peerUri, providerData: 'v2' });
			// Wait for the re-persist write to flush.
			let updated = afterCreate;
			for (let i = 0; i < 50; i++) {
				updated = await readCatalog(db);
				if (updated.find(e => e.uri === peerUri.toString())?.providerData === 'v2') {
					break;
				}
				await timeout(0);
			}

			assert.deepStrictEqual({
				afterCreate: afterCreate.find(e => e.uri === peerUri.toString())?.providerData,
				afterChange: updated.find(e => e.uri === peerUri.toString())?.providerData,
			}, {
				afterCreate: 'v1',
				afterChange: 'v2',
			});
		});

		test('disposeChat removes the chat from the persisted catalog', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<{ providerData?: string }> {
					return { providerData: 'blob-1' };
				}
				override async disposeChat(_session: URI, _chat: URI): Promise<void> { }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			const afterCreate = await readCatalog(db);

			await localService.disposeChat(session, peerUri);
			let afterDispose = afterCreate;
			for (let i = 0; i < 50; i++) {
				afterDispose = await readCatalog(db);
				if (!afterDispose.some(e => e.uri === peerUri.toString())) {
					break;
				}
				await timeout(0);
			}

			assert.deepStrictEqual({
				afterCreate: afterCreate.map(e => e.uri),
				afterDispose: afterDispose.map(e => e.uri),
			}, {
				afterCreate: [peerUri.toString()],
				afterDispose: [],
			});
		});

		// ---- BC1: one-time legacy `*.chats` migration on restore ----------

		test('legacy *.chats with no peerChats catalog migrates once into the orchestrator catalog', async () => {
			class LegacyAgent extends MockAgent {
				listLegacyCallCount = 0;
				override async createChat(): Promise<IAgentCreateChatResult | void> { }
				async materializeChat(): Promise<void> { }
				async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
					];
				}
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					if (session.scheme === 'ahp-chat') {
						return [{
							id: `${parseChatUri(session)?.chatId}-turn`,
							state: TurnState.Complete,
							message: { text: 'legacy hi', origin: { kind: MessageKind.User } },
							responseParts: [],
							usage: undefined,
						}];
					}
					return [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Seed a persisted title for one legacy chat so we can assert
			// history + title are restored.
			const legacyAUri = URI.parse(buildChatUri(session, 'legacy-a'));
			const legacyBUri = URI.parse(buildChatUri(session, 'legacy-b'));
			await db.setMetadata(`customChatTitle:${legacyAUri.toString()}`, 'Legacy A Title');

			// No peerChats key exists (undefined catalog) -> migration runs.
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalogAfterFirst = await readCatalog(db);

			// Second restore: catalog now present -> legacy read not consulted again.
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);

			const stateA = localService.stateManager.getChatState(legacyAUri.toString());
			const stateB = localService.stateManager.getChatState(legacyBUri.toString());
			assert.deepStrictEqual({
				legacyCalls: agent.listLegacyCallCount,
				catalog: catalogAfterFirst.map(e => ({ uri: e.uri, providerData: e.providerData })),
				aTitle: stateA?.title,
				aTurns: stateA?.turns.map(t => t.id) ?? [],
				aProviderData: localService.stateManager.getChatProviderData(legacyAUri.toString()),
				bTurns: stateB?.turns.map(t => t.id) ?? [],
				bProviderData: localService.stateManager.getChatProviderData(legacyBUri.toString()),
			}, {
				legacyCalls: 1,
				catalog: [
					{ uri: legacyAUri.toString(), providerData: 'lp-a' },
					{ uri: legacyBUri.toString(), providerData: 'lp-b' },
				],
				aTitle: 'Legacy A Title',
				aTurns: ['legacy-a-turn'],
				aProviderData: 'lp-a',
				bTurns: ['legacy-b-turn'],
				bProviderData: 'lp-b',
			});
		});

		test('an empty ([]) peerChats catalog does not resurrect legacy chats', async () => {
			class LegacyAgent extends MockAgent {
				listLegacyCallCount = 0;
				async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' }];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Known-empty catalog must be treated as "no peer chats", never migrated.
			await db.setMetadata('peerChats', '[]');
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			assert.deepStrictEqual({
				legacyCalls: agent.listLegacyCallCount,
				peerChats: (state?.chats ?? []).map(c => parseChatUri(c.resource)?.chatId).filter(id => id !== 'default'),
			}, {
				legacyCalls: 0,
				peerChats: [],
			});
		});

		test('a valid new-format peerChats catalog restores without consulting legacy chats', async () => {
			class LegacyAgent extends MockAgent {
				listLegacyCallCount = 0;
				override async createChat(): Promise<IAgentCreateChatResult | void> {
					return { providerData: 'new-blob' };
				}
				async materializeChat(): Promise<void> { }
				async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' }];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			await readCatalog(db);

			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			assert.deepStrictEqual({
				legacyCalls: agent.listLegacyCallCount,
				peerInCatalog: !!state?.chats.some(c => c.resource.toString() === peerUri.toString()),
				legacyInCatalog: state?.chats.some(c => parseChatUri(c.resource)?.chatId === 'legacy-a') ?? false,
			}, {
				legacyCalls: 0,
				peerInCatalog: true,
				legacyInCatalog: false,
			});
		});
		// ---- RV-1: legacy migration persists the catalog atomically ----------

		test('legacy migration persists the whole set in one write (never a subset, even across a re-restore)', async () => {
			class LegacyAgent extends MockAgent {
				override async createChat(): Promise<IAgentCreateChatResult | void> { }
				async materializeChat(): Promise<void> { }
				async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-c')), providerData: 'lp-c' },
					];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Absent peerChats key => migration runs and must write the full set once.
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalog = await readCatalog(db);

			const restoredIds = (localService.stateManager.getSessionState(session.toString())?.chats ?? [])
				.map(c => parseChatUri(c.resource)?.chatId)
				.filter(id => id !== 'default');
			assert.deepStrictEqual({
				catalogIds: catalog.map(e => parseChatUri(URI.parse(e.uri))?.chatId),
				restoredIds,
			}, {
				catalogIds: ['legacy-a', 'legacy-b', 'legacy-c'],
				restoredIds: ['legacy-a', 'legacy-b', 'legacy-c'],
			});
		});

		test('a rejected migration write leaves the catalog absent (not a subset) so migration re-runs', async () => {
			class FailingCatalogDatabase extends TestSessionDatabase {
				failPeerChatsWrites = 1;
				override async setMetadata(key: string, value: string): Promise<void> {
					if (key === 'peerChats' && this.failPeerChatsWrites > 0) {
						this.failPeerChatsWrites--;
						throw new Error('simulated catalog write failure');
					}
					return super.setMetadata(key, value);
				}
			}
			class LegacyAgent extends MockAgent {
				override async createChat(): Promise<IAgentCreateChatResult | void> { }
				async materializeChat(): Promise<void> { }
				async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
					];
				}
			}
			const db = new FailingCatalogDatabase();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			localService.registerProvider(agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// First restore: the single catalog write is rejected. Because the write
			// is all-or-nothing, the key must stay absent (never a proper subset).
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalogAfterFailedWrite = await db.getMetadata('peerChats');

			// Second restore: catalog still absent => migration re-runs and now
			// persists the complete set.
			localService.stateManager.deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalog = await readCatalog(db);

			assert.deepStrictEqual({
				catalogAfterFailedWrite,
				catalogIds: catalog.map(e => parseChatUri(URI.parse(e.uri))?.chatId),
			}, {
				catalogAfterFailedWrite: undefined,
				catalogIds: ['legacy-a', 'legacy-b'],
			});
		});
	});

	suite('subscriber refcount eviction', () => {

		test('an empty session created in this lifetime stays observable until GC fires', async () => {
			service.registerProvider(copilotAgent);
			const sessionResource = await service.createSession({ provider: 'copilot' });

			service.addSubscriber(sessionResource, 'client-1');
			service.unsubscribe(sessionResource, 'client-1');

			// Empty sessions are routed to the GC pipeline rather than the
			// eviction pipeline, so their state stays observable in the
			// grace window for a re-subscribe to find.
			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'empty created session must remain observable for the GC grace window');
		});

		test('a session with an active turn is NOT evicted when its last subscriber drops', async () => {
			service.registerProvider(copilotAgent);
			const sessionResource = await service.createSession({ provider: 'copilot' });

			service.addSubscriber(sessionResource, 'client-1');
			// Simulate an in-flight turn — eviction must skip this session even
			// when the refcount reaches zero, otherwise we'd drop live state
			// mid-response.
			service.dispatchAction(
				buildDefaultChatUri(sessionResource.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
				'client-1', 1,
			);

			service.unsubscribe(sessionResource, 'client-1');

			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'active-turn session must not be evicted');
		});

		test('a restored idle session is evicted when its last subscriber drops', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Release is deferred behind the grace window — still cached until it elapses.
				assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'session stays cached during the release grace');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'restored idle session should be evicted after the grace');
				assert.deepStrictEqual(
					copilotAgent.releaseSessionCalls.map(u => u.toString()),
					[sessionResource.toString()],
					'provider releaseSession should be invoked for the evicted root',
				);
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'eviction must not destructively dispose the session');
			});
		});

		test('re-subscribing within the grace cancels the release', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Reconnect within the grace window.
				service.addSubscriber(sessionResource, 'client-2');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'session must stay cached when re-subscribed within the grace');
				assert.strictEqual(copilotAgent.releaseSessionCalls.length, 0, 'releaseSession must not fire when the grace was cancelled');
			});
		});

		test('an evicted idle session restores losslessly on re-subscribe', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');
				const before = service.stateManager.getSessionState(sessionResource.toString());
				assert.ok(before, 'session state present before eviction');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'session evicted after last subscriber drops');

				// Re-subscribe rehydrates from the preserved durable data.
				await service.subscribe(sessionResource, 'client-2');
				const after = service.stateManager.getSessionState(sessionResource.toString());
				assert.ok(after, 'session restored on re-subscribe');
				// Response-part ids are freshly generated on each reconstruction, so
				// normalize them out before comparing the durable turn content.
				const normalizeTurns = (turns: ISessionWithDefaultChat['turns']) =>
					turns.map(turn => ({ ...turn, responseParts: turn.responseParts.map(part => ({ ...part, id: undefined })) }));
				assert.deepStrictEqual(normalizeTurns(after.turns), normalizeTurns(before.turns), 'restored turns match the pre-eviction state');
			});
		});

		test('restored session is evicted after all subscribers drop', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');
				service.addSubscriber(sessionResource, 'client-2');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'still subscribed by client-2');

				service.unsubscribe(sessionResource, 'client-2');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'evicted after last subscriber drops');
			});
		});

		test('subagent subscriber pins the parent session against eviction', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
					{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating', toolKind: 'subagent' as const, subagentDescription: 'Find files', subagentAgentName: 'explore' },
					{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' },
					{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'ls', parentToolCallId: 'tc-sub' },
					{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'ran', content: [{ type: ToolResultContentType.Text, text: 'a' }] }, parentToolCallId: 'tc-sub' },
					{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'done', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				const childUri = URI.parse(buildSubagentSessionUri(sessionResource.toString(), 'tc-sub'));
				await service.subscribe(childUri, 'client-child');

				service.addSubscriber(sessionResource, 'client-parent');

				// Parent drops — child still subscribed, parent must not be evicted
				service.unsubscribe(sessionResource, 'client-parent');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'parent must stay while child is subscribed');
				assert.ok(service.stateManager.getSessionState(childUri.toString()), 'child still present');

				// Child drops — parent and child can now be evicted.
				service.unsubscribe(childUri, 'client-child');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'parent evicted after subagent drops');
				assert.strictEqual(service.stateManager.getSessionState(childUri.toString()), undefined, 'child also evicted with parent');
			});
		});

		test('nested subagent subscriber pins ancestor session against eviction', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating', toolKind: 'subagent' as const, subagentDescription: 'Find files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'ls', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'ran', content: [{ type: ToolResultContentType.Text, text: 'a' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'done', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);
			const childUri = URI.parse(buildSubagentSessionUri(sessionResource, 'tc-sub'));
			await service.subscribe(childUri, 'client-child');
			const nestedChildUri = URI.parse(buildSubagentSessionUri(childUri, 'tc-nested'));

			service.addSubscriber(sessionResource, 'client-parent');
			service.addSubscriber(nestedChildUri, 'client-nested-child');
			service.unsubscribe(sessionResource, 'client-parent');

			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'ancestor parent must stay while nested child is subscribed');
			assert.ok(service.stateManager.getSessionState(childUri.toString()), 'intermediate child still present');
		});

		test('depth-2 subagent unsubscribe evicts the root session state', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				// Regression: when a depth-2 subagent URI unsubscribes the eviction
				// must reach all the way to the root, not stop at the intermediate
				// parent and leave root state cached indefinitely.
				service.registerProvider(copilotAgent);
				const { session } = await copilotAgent.createSession();
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'hi', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'done', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);

				// Simulate a client that only subscribed to the depth-2 URI.
				const childUri = URI.parse(buildSubagentSessionUri(sessionResource, 'tc-sub'));
				const nestedUri = URI.parse(buildSubagentSessionUri(childUri, 'tc-nested'));
				service.addSubscriber(nestedUri, 'client-nested');
				service.unsubscribe(nestedUri, 'client-nested');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'root state must be evicted when no subscribers remain');
			});
		});
	});

	// ---- handshake fast-path: uncommitted refresh on addSubscriber ----

	suite('addSubscriber triggers uncommitted refresh', () => {

		test('addSubscriber for <session>/changeset/uncommitted triggers the first git diff refresh', async () => {
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-refresh' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			// Recording git service: a call to `computeSessionFileDiffs`
			// with `baseBranch=undefined` is the signature of the uncommitted
			// refresh fired by `_triggerUncommittedRefresh`.
			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);
			const sessionResource = await localService.createSession({ provider: 'copilot' });
			const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));

			// The handshake fast-path used during connect/initialize when
			// `getSnapshot(uri)` is already populated. This is the path
			// that previously skipped the refresh for sessions that were
			// already active when the Agents Window opened.
			localService.addSubscriber(uncommittedUri, 'client-1');

			// Refresh is scheduled through the per-session sequencer;
			// allow it to drain.
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.baseBranch === undefined && c.wd === workingDirectory.toString()),
				`expected an uncommitted-kind git diff against the working dir, got: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(uncommittedUri, 'client-1');
		});

		test('addSubscriber for the session URI or session-changeset URI triggers a static refresh', async () => {
			// The Agents Window subscribes to the session URI (list /
			// detail) rather than to either of the static changeset URIs
			// directly, so the chip would never refresh on session open
			// without this trigger. Subscribing to the session-changeset
			// URI from any other client must also fire its own refresh.
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-refresh-2' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);
			const sessionResource = await localService.createSession({ provider: 'copilot' });
			const sessionChangesetUri = URI.parse(buildSessionChangesetUri(sessionResource.toString()));

			localService.addSubscriber(sessionChangesetUri, 'client-1');
			localService.addSubscriber(sessionResource, 'client-2');
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.wd === workingDirectory.toString()),
				`session-URI / session-changeset subscriptions must trigger a git diff against the working dir, got: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(sessionChangesetUri, 'client-1');
			localService.unsubscribe(sessionResource, 'client-2');
		});

		test('restoreSession drains a pending uncommitted refresh deferred by an earlier addSubscriber', async () => {
			// Reproduces the cold-open race that broke §3:
			// 1. Client subscribes to `<session>/changeset/uncommitted`
			//    before the session has been restored on the server.
			// 2. addSubscriber's 0→1 trigger fires `_triggerUncommittedRefresh`,
			//    which reads `summary.workingDirectory` from live state
			//    — finds nothing (session not restored yet) — and defers
			//    via `_pendingUncommittedRefreshes`.
			// 3. restoreSession then runs (driven by the chat-view path or
			//    a separate subscribe), populates `summary.workingDirectory`
			//    from disk, and MUST drain the pending refresh.
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-restore-drain' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);

			// Seed a session on the agent without calling
			// `localService.createSession` — mirrors a restored-from-disk
			// session not yet in the service's state manager.
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;
			const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));

			// Step 1+2: subscribe before restore. Trigger defers.
			localService.addSubscriber(uncommittedUri, 'client-1');
			await new Promise(r => setTimeout(r, 20));
			assert.strictEqual(
				computeCalls.length,
				0,
				`no compute should fire while the session is not restored (workingDirectory unknown), got: ${JSON.stringify(computeCalls)}`,
			);

			// Step 3: restoreSession runs (chat-view path / a parallel
			// session-URI subscribe). After this, the pending refresh
			// must drain and `_tryComputeGitDiffs` must run for the
			// uncommitted slot.
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hi', toolRequests: [] },
			];
			await localService.restoreSession(sessionResource);
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.baseBranch === undefined && c.wd === workingDirectory.toString()),
				`restoreSession must drain the pending refresh; got compute calls: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(uncommittedUri, 'client-1');
		});
	});

	// ---- empty-session GC ----------------------------------------------

	suite('empty-session GC', () => {

		test('an empty unsubscribed session is disposed after the grace period', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');

				// Before the grace period, dispose has not been called.
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'no GC before grace expires');

				// After the grace period, the session is disposed entirely.
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual(
					copilotAgent.disposeSessionCalls.map(u => u.toString()),
					[sessionResource.toString()],
					'GC fired after grace period',
				);
			});
		});

		test('a session with at least one turn is not GC-disposed', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');
				service.dispatchAction(
					buildDefaultChatUri(sessionResource.toString()),
					{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
					'client-1', 1,
				);
				service.dispatchAction(
					buildDefaultChatUri(sessionResource.toString()),
					{ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
					'client-1', 2,
				);

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'session with turns must not be GC-disposed');
			});
		});

		test('resubscribe within the grace period cancels GC', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Resubscribe before the timer fires.
				await new Promise(resolve => setTimeout(resolve, 5_000));
				service.addSubscriber(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'GC must be cancelled after resubscribe');
			});
		});

		test('GC is rearmed after a resubscribe-then-unsubscribe cycle', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 5_000));
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');

				// Old timer was cancelled; a fresh 30s timer is now armed.
				await new Promise(resolve => setTimeout(resolve, 29_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'rearmed timer not yet fired');
				await new Promise(resolve => setTimeout(resolve, 2_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1, 'rearmed timer fires after fresh 30s');
			});
		});

		test('createSession on the same URI cancels a pending GC', () => {
			// Models the reconnect path: client subscribes to a session,
			// drops the subscription (GC armed), then re-issues
			// `createSession` for the same URI before the grace expires.
			// Without explicit cancellation, the timer would fire and
			// dispose the just-revived session.
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'recreate-test') });
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');

				// Re-issue createSession mid-grace.
				await new Promise(resolve => setTimeout(resolve, 5_000));
				await service.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'recreate-test') });

				// Wait past the original grace window. If GC wasn't
				// cancelled by createSession, dispose would have fired.
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'createSession on same URI must cancel pending GC');
			});
		});
	});

	suite('session config persistence', () => {

		test('createSession persists initial config values to the session DB', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			await localService.createSession({ provider: 'copilot', config: { autoApprove: 'autoApprove' } });

			// Persistence is fire-and-forget; wait for it to flush
			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.ok(persisted, 'configValues should be persisted');
			assert.deepStrictEqual(JSON.parse(persisted!), { autoApprove: 'autoApprove' });
		});

		test('createSession does not write configValues when there are no values', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			await localService.createSession({ provider: 'copilot' });

			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.strictEqual(persisted, undefined);
		});

		test('restoreSession overlays persisted config values onto the resolved config', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend (no config) so listSessions can find it
			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Pre-seed persisted config values
			await sessionDb.setMetadata('configValues', JSON.stringify({ autoApprove: 'autoApprove' }));

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// MockAgent.resolveSessionConfig echoes params.config back as values, so the
			// persisted values are forwarded through and end up on state.config.values.
			assert.deepStrictEqual(state!.config?.values, { autoApprove: 'autoApprove' });
		});

		test.skip('restoreSession seeds the session changeset from persisted diffs', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
			];
			await sessionDb.setMetadata('diffs', JSON.stringify(persistedDiffs));

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// The session has no working directory, so `_attachGitState`
			// treats it as transient and does NOT strip the two git-only
			// catalogue entries. The Branch Changes entry receives the
			// persisted diff counts seeded by the changeset coordinator.
			assert.deepStrictEqual(state!.changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/session`,
					changeKind: 'session',
				},
				{
					label: 'Uncommitted Changes',
					description: 'Show uncommitted changes in this session',
					uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			]);

			const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
			assert.ok(changesetSnapshot);
			const changesetState = changesetSnapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(changesetState.status, 'ready');
			assert.deepStrictEqual(changesetState.files.map(f => f.id), ['file:///wd/a.ts']);
		});

		test.skip('restoreSession silently ignores malformed persisted diffs', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('diffs', '{ not valid json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// Catalogue is seeded by `_buildInitialSummary` / `restoreSession`.
			// The session has no working directory, so `_attachGitState` does
			// NOT strip the git-only entries — they remain advertised but
			// without counts until a real compute lands.
			assert.deepStrictEqual(state!.changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/session`,
					changeKind: 'session',
				},
				{
					description: 'Show uncommitted changes in this session',
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			]);

			const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
			assert.ok(changesetSnapshot);
			const changesetState = changesetSnapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(changesetState.status, 'computing');
			assert.strictEqual(changesetState.files.length, 0);
		});

		test('createSession + restoreSession round-trip restores initial config without any mid-session changes', async () => {
			// Regression test: when a session is created with initial config but no
			// mid-session SessionConfigChanged actions are dispatched, restoring it
			// must still rehydrate the initial values.
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const session = await localService.createSession({ provider: 'copilot', config: { autoApprove: 'autoApprove' } });

			// Wait for the fire-and-forget persistence to flush
			await new Promise(r => setTimeout(r, 50));

			// Simulate a server restart: drop the in-memory state
			localService.stateManager.removeSession(session.toString());

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.config?.values, { autoApprove: 'autoApprove' });
		});

		test('restoreSession ignores malformed persisted configValues', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('configValues', '{not json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			// Should not throw despite the malformed JSON
			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// MockAgent has a workingDirectory? No — but the metadata supplies it as undefined.
			// _resolveCreatedSessionConfig bails when both .config and .workingDirectory are
			// missing, so state.config is undefined here. The key point is: no throw.
			assert.strictEqual(state!.config, undefined);
		});
	});

	// ---- resourceList ------------------------------------------------

	suite('resourceList', () => {

		test('throws when the directory does not exist', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' })),
				/Directory not found/,
			);
		});

		test('throws when the target is not a directory', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' })),
				/Not a directory/,
			);
		});
	});

	// ---- worktree working directory -------------------------------------

	suite('worktree working directory', () => {

		test('createSession uses agent-resolved working directory in state', async () => {
			// Simulate an agent that resolves a worktree path different from the input
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.resolvedWorkingDirectory = worktreeDir;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			// The state manager should have the worktree path, not the source path
			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectory, worktreeDir.toString());
		});

		test('createSession falls back to config working directory when agent does not resolve', async () => {
			// Agent does not override the working directory (e.g. folder isolation)
			copilotAgent.resolvedWorkingDirectory = undefined;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectory, sourceDir.toString());
		});

		test('restoreSession uses agent working directory in state', async () => {
			// Agent returns the worktree path through listSessions
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.sessionMetadataOverrides = { workingDirectory: worktreeDir };
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Delete from state to simulate a server restart
			service.stateManager.deleteSession(session.toString());
			assert.strictEqual(service.stateManager.getSessionState(session.toString()), undefined);

			// Restore the session (simulates a client subscribing after restart)
			await service.restoreSession(session);

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectory, worktreeDir.toString());
		});
	});

	// ---- Item-2 regression: initial changeset seeding happens at create time --

	/**
	 * These tests pin the create-time invariant that both halves of initial
	 * changeset seeding — the summary catalogue (`buildDefaultChangesetCatalogue`
	 * inside `_buildInitialSummary`) and the backing per-changeset states
	 * (`AgentHostChangesetService.registerStaticChangesets`) — run as part
	 * of session creation, never deferred to materialization. They assert
	 * both halves through the public snapshot surface only, never inspecting
	 * state-manager internals.
	 */
	suite.skip('item-2: initial changeset seeding at create time', () => {

		/** Returns `true` when both static changeset URIs exist with `status: 'computing'`. */
		function assertBackingChangesetsComputing(stateManager: AgentService['stateManager'], sessionStr: string): void {
			const uncommitted = stateManager.getSnapshot(buildUncommittedChangesetUri(sessionStr));
			const sessionWide = stateManager.getSnapshot(buildSessionChangesetUri(sessionStr));
			assert.ok(uncommitted, `expected ${sessionStr}/changeset/uncommitted to be subscribable`);
			assert.ok(sessionWide, `expected ${sessionStr}/changeset/session to be subscribable`);
			assert.strictEqual((uncommitted.state as { status: string }).status, ChangesetStatus.Computing);
			assert.strictEqual((sessionWide.state as { status: string }).status, ChangesetStatus.Computing);
		}

		function defaultCatalogue(sessionStr: string) {
			// These tests have no working directory resolved, so
			// `_attachGitState` treats it as transient and does NOT strip
			// the two git-only entries. All three default entries are
			// advertised (without counts) until a real compute lands.
			return [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionStr}/changeset/session`,
					changeKind: 'session',

				},
				{
					label: 'Uncommitted Changes',
					description: 'Show uncommitted changes in this session',
					uriTemplate: `${sessionStr}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			];
		}

		test('createSession seeds both halves before SessionReady', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			const state = service.stateManager.getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);
		});

		test('forked createSession seeds both halves on the forked session', async () => {
			service.registerProvider(copilotAgent);

			// Set up a source session with at least one completed turn. The
			// fork path at agentService.ts:493-504 intentionally drops
			// `config.fork` when the source has zero turns and falls through
			// to the non-fork create path; without this prelude the test
			// would silently exercise the non-fork branch and pass vacuously.
			const sourceSession = await service.createSession({ provider: 'copilot' });
			const sourceState = service.stateManager.getSessionState(sourceSession.toString())!;
			const sourceTurnId = 'turn-src-1';
			sourceState.turns = [{
				id: sourceTurnId,
				state: TurnState.Complete,
				message: { text: 'hi', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			}];

			const forked = await service.createSession({
				provider: 'copilot',
				fork: { session: sourceSession, turnIndex: 0, turnId: sourceTurnId },
			});
			assert.notStrictEqual(forked.toString(), sourceSession.toString(), 'fork should produce a distinct session URI');
			const forkedStr = forked.toString();

			const forkedState = service.stateManager.getSessionState(forkedStr);
			assert.ok(forkedState);
			assert.deepStrictEqual(forkedState!.changesets, defaultCatalogue(forkedStr));
			// Note: source-session turn was seeded directly on state, so the
			// reducer never saw a ChatTurnStarted/Complete pair for it;
			// the fork branch (agentService.ts:548 path) is still exercised
			// because `config.fork` survives the L493-504 turn-count check.
			assert.ok(forkedState!.turns.length > 0, 'forked session should carry copied turns');
			assertBackingChangesetsComputing(service.stateManager, forkedStr);
		});

		test('provisional session materialization preserves both halves', async () => {
			// Custom mock that returns `provisional: true` and exposes a hook
			// to fire `onDidMaterializeSession` later, simulating the
			// "session created in-memory now, persisted on first sendMessage"
			// flow that Copilot CLI / Claude actually use in production.
			class ProvisionalMockAgent extends MockAgent {
				private readonly _onDidMaterialize = new Emitter<{ session: URI; workingDirectory: URI | undefined; project: { uri: URI; displayName: string } | undefined }>();
				readonly onDidMaterializeSession = this._onDidMaterialize.event;
				override async createSession(config?: import('../../common/agentService.js').IAgentCreateSessionConfig): Promise<import('../../common/agentService.js').IAgentCreateSessionResult> {
					const result = await super.createSession(config);
					return { ...result, provisional: true };
				}
				materialize(session: URI, workingDirectory?: URI): void {
					this._onDidMaterialize.fire({ session, workingDirectory, project: undefined });
				}
			}

			const provisionalAgent = new ProvisionalMockAgent('copilot');
			disposables.add(toDisposable(() => provisionalAgent.dispose()));
			service.registerProvider(provisionalAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			// Snapshot the create-time state BEFORE materialization.
			const stateBefore = service.stateManager.getSessionState(sessionStr);
			assert.ok(stateBefore, 'provisional session should already have state');
			assert.deepStrictEqual(stateBefore!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);

			// `markSessionPersisted` (called from `_onDidMaterializeSession`)
			// re-spreads flattened session metadata. A future change to that spread
			// could drop the catalogue or invalidate the backing snapshots;
			// the post-materialization re-assertion is what catches it.
			provisionalAgent.materialize(session, URI.file('/wd'));

			const stateAfter = service.stateManager.getSessionState(sessionStr);
			assert.ok(stateAfter, 'materialized session should still have state');
			assert.deepStrictEqual(stateAfter!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);
		});

		test('restoreSession with no persisted diffs seeds both halves in computing state', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;
			const sessionStr = sessionResource.toString();

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(localService.stateManager, sessionStr);
		});
	});
});
