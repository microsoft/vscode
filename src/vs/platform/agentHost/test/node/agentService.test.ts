/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { rm } from 'fs/promises';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import type { Database } from '@vscode/sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { hasKey } from '../../../../base/common/types.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AgentChatMigrationDeferred, AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, SubagentChatSignal, resolveAgentChatContext, type IAgent, type IAgentChatAdoptionResult, type IAgentChatContext, type IAgentChatDataChange, type IAgentChatMetadata, type IAgentChatMetadataOptions, type IAgentChats, type IAgentCreateChatForkSource, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentCreateSessionConfig, type IAgentCreateSessionResult, type IAgentDescriptor, type IAgentDiscoveredChat, type IAgentLegacyChat, type IAgentMaterializeChatEvent, type IAgentSessionMetadata, type IAgentSpawnChatEvent } from '../../common/agent.js';
import { IConnectionTrackerService } from '../../common/agentService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostExternalSessionsMode, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostShowExternalSessionsConfigKey } from '../../common/agentHostSchema.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { ClaudeSessionConfigKey } from '../../common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../common/codexSessionConfigKeys.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { GitRefType } from '../../common/agentHostGitService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentMergeConfigKey, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { ActionType, ActionEnvelope, NotificationType, type INotification } from '../../common/state/sessionActions.js';
import { AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, readSessionEhcliAdopted, AH_META_IS_ARCHIVED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, ChangesetStatus, CustomizationType, MessageAttachmentKind, MessageKind, SessionActiveClient, ResponsePartKind, ROOT_STATE_URI, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_MULTI_ROOT_KEY, SessionLifecycle, SessionSourceControlOutcome, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, createErrorResponsePart, customizationId, isDefaultChatUri, isMessageHiddenFromTranscript, isSubagentSession, parseChatUri, parseSubagentSessionUri, readSessionCreationReference, readSessionEhcliAdoptable, readSessionExternal, readSessionGitHubState, readSessionMultiRootMetadata, readSessionFolderPickerDecision, readSessionSourceControlState, withSessionEhcliAdoptable, withSessionExternal, withSessionMultiRootMetadata, ChatOriginKind, type ChangesetState, type ISessionFolderPickerDecision, type ISessionWithDefaultChat, type MarkdownResponsePart, type SessionState, type SessionSummary, type ToolCallCompletedState, type ToolCallResponsePart, type Turn } from '../../common/state/sessionState.js';
import { ChatInteractivity, type MessageAttachment } from '../../common/state/protocol/state.js';
import { isHostSnapshotAttachment, toHostSnapshotAttachmentMeta } from '../../common/meta/agentSnapshotAttachmentMeta.js';
import { readAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentService } from '../../node/agentService.js';
import { AgentHostDatabase, IAgentHostDatabase, IAgentHostDatabaseRegisterOptions, IAgentHostDatabaseSession, IAgentHostDatabaseSessionOptions } from '../../node/agentHostDatabase.js';
import { AgentSessionRegistry, type IRegisteredSession } from '../../node/agentSessionRegistry.js';
import { AgentHostManagementService } from '../../node/agentHostManagementService.js';
import { AGENT_HOST_TITLE_SOURCE_AUTO, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { MockAgent, ScriptedMockAgent } from './mockAgent.js';
import { mapSessionEventsToHistoryRecords } from './historyRecordFixtures.js';
import { type ISessionEvent } from './copilotTestEvents.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { buildGitBlobUri } from '../../node/gitDiffContent.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { getWorktreesRoot, WorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT } from '../../node/shared/worktreeIsolation.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { buildMcpChannel } from '../../node/shared/mcpCustomizationController.js';
import { readEphemeralSessionMeta, withEphemeralSessionMeta } from '../../common/meta/agentEphemeralSessionMeta.js';
import { readChatSurfaceMeta, withChatSurfaceMeta } from '../../common/meta/agentChatSurfaceMeta.js';
import { createTestAgentHostWorktreeIsolation, createTestAgentService, getTestAgentHostProviderService, getTestAgentHostWorktreeIsolation, getTestAgentServiceComposition, getTestAgentStateManager, registerTestAgentProvider, setTestAgentHostWorktreeIsolation } from './agentServiceTestUtils.js';

/**
 * Replace individual operations on an agent's chat surface, delegating every
 * other operation to `base`. {@link MockAgent.chats} is an instance field
 * rather than a prototype method, so `super.chats` is not reachable: a
 * subclass captures the base surface as `this.chats` inside its own field
 * initializer, which runs after the base constructor has already assigned it.
 * `overrides` receives that captured surface so an override can delegate to
 * the base implementation without recursing into itself.
 */
function withChatOverrides(base: IAgentChats, overrides: (base: IAgentChats) => Partial<IAgentChats>): IAgentChats {
	return { ...base, ...overrides(base) };
}

function getChatSurface(agent: IAgent): IAgentChats {
	return agent.chats;
}

function getConfigurationService(service: AgentService) {
	return getTestAgentServiceComposition(service).configurationService;
}

function getAuthenticationService(service: AgentService) {
	return getTestAgentServiceComposition(service).authenticationService;
}

function getCheckpointService(service: AgentService) {
	return getTestAgentServiceComposition(service).checkpointService;
}

function getStateManager(service: AgentService) {
	return getTestAgentStateManager(service);
}

function isWorkingDirectoryPending(service: AgentService, session: URI | string): boolean {
	return getTestAgentHostWorktreeIsolation(service).isWorkingDirectoryPending(AgentSession.id(session));
}

/**
 * Provision a session directly on an agent through the exact-chat seam
 * an initializing {@link IAgentChats.createChat} call, mirroring what
 * `AgentService.createSession` does. Used by tests that need a session to
 * exist on the agent backend without going through the orchestrator.
 */
async function createAgentSession(agent: IAgent, config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
	const session = config?.session ?? AgentSession.uri(agent.id, generateUuid());
	const defaultChat = URI.parse(buildDefaultChatUri(session));
	const chat = await expectCreatedChat(agent.chats.createChat(defaultChat, session, sessionConfigToChatOptions({ ...config, session })));
	return { session, ...chat, chat };
}

function discoveredChat(session: URI, external = true, modifiedTime = Date.now()): IAgentDiscoveredChat {
	return {
		chat: URI.parse(buildDefaultChatUri(session)),
		startTime: modifiedTime,
		modifiedTime,
		external,
	};
}

function createPerSessionDataService(): { readonly service: ISessionDataService; readonly database: (session: URI) => TestSessionDatabase } {
	const databases = new Map<string, TestSessionDatabase>();
	const database = (session: URI): TestSessionDatabase => {
		const key = session.toString();
		let result = databases.get(key);
		if (!result) {
			result = new TestSessionDatabase();
			databases.set(key, result);
		}
		return result;
	};
	return {
		service: {
			...createSessionDataService(),
			openDatabase: session => ({ object: database(session), dispose: () => { } }),
			tryOpenDatabase: async session => {
				const result = databases.get(session.toString());
				return result ? { object: result, dispose: () => { } } : undefined;
			},
		},
		database,
	};
}

function sessionConfigToChatOptions(config: IAgentCreateSessionConfig): IAgentCreateChatOptions {
	return {
		model: config.model,
		agent: config.agent,
		workingDirectories: config.workingDirectories,
		config: config.config,
		activeClient: config.activeClient,
		deferBacking: !config.importConversation,
		importConversation: config.importConversation,
	};
}

async function expectCreatedChat(result: Promise<IAgentCreateChatResult | void>): Promise<IAgentCreateChatResult> {
	const created = await result;
	if (!created) {
		throw new Error('Expected chat metadata');
	}
	return created;
}

async function createProvisionalChat(base: IAgentChats, chat: URI, context: URI | IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
	const result = await base.createChat(chat, context, options);
	return result ? { ...result, provisional: true } : result;
}

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

class TransientRegistryWriteDatabase implements IAgentHostDatabase {
	private readonly _sessions = new Map<string, IAgentHostDatabaseSession>();
	private _backfilled = false;
	private readonly _providerBackfilled = new Set<string>();
	private readonly _tombstones = new Set<string>();
	private readonly _agentMergeEnabled = new Set<string>();
	registryWriteAttempts = 0;
	private _remainingRegistryWriteFailures = 0;
	private readonly _sessionsWithoutExternal = new Set<string>();
	readonly externalUpdates: { session: string; external: boolean }[] = [];
	undefinedExternalListCalls = 0;

	addSessionWithoutExternal(session: IAgentHostDatabaseSession): void {
		this._sessions.set(session.session, session);
		this._sessionsWithoutExternal.add(session.session);
	}

	failRegistryWrites(count: number): void {
		this.registryWriteAttempts = 0;
		this._remainingRegistryWriteFailures = count;
	}

	async registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		this._beforeWrite();
		if (registerOptions.checkTombstone && this._tombstones.has(session)) {
			return false;
		}
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		const existing = this._sessions.get(session);
		const inserted = { session, provider, startTime, modifiedTime, external: source === 'discovery', source };
		const next: IAgentHostDatabaseSession = source === 'explicit'
			? { ...inserted, startTime: existing?.startTime ?? startTime }
			: existing && source === 'discovery'
				? { ...existing, external: true, source: 'discovery' }
				: existing ?? inserted;
		this._sessions.set(session, { ...next, modifiedTime: Math.max(existing?.modifiedTime ?? modifiedTime, modifiedTime) });
		if (!registerOptions.checkTombstone) {
			this._tombstones.delete(session);
		}
		return true;
	}

	async unregisterSession(session: string): Promise<void> {
		this._beforeWrite();
		this._sessions.delete(session);
		this._agentMergeEnabled.delete(session);
	}

	async tombstoneAndUnregisterSession(session: string): Promise<void> {
		this._beforeWrite();
		this._tombstones.add(session);
		this._sessions.delete(session);
		this._agentMergeEnabled.delete(session);
	}

	async updateSessionExternal(updates: readonly { readonly session: string; readonly external: boolean }[]): Promise<void> {
		this.externalUpdates.push(...updates);
		for (const update of updates) {
			const session = this._sessions.get(update.session);
			if (session && this._sessionsWithoutExternal.delete(update.session)) {
				this._sessions.set(update.session, {
					...session,
					external: update.external,
					source: update.external ? 'discovery' : session.source,
				});
			}
		}
	}

	async updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean> {
		this._beforeWrite();
		const existing = this._sessions.get(session);
		if (!existing || existing.modifiedTime >= modifiedTime) {
			return false;
		}
		this._sessions.set(session, { ...existing, modifiedTime });
		return true;
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		this.undefinedExternalListCalls++;
		return [...this._sessions.values()].map(session => this._sessionsWithoutExternal.has(session.session)
			? { ...session, external: undefined }
			: session);
	}

	async getSession(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		const value = this._sessions.get(session);
		return value && this._sessionsWithoutExternal.has(session) ? { ...value, external: undefined } : value;
	}

	async isSessionRegistryEmpty(): Promise<boolean> {
		return this._sessions.size === 0;
	}

	async isSessionRegistryBackfilled(): Promise<boolean> {
		return this._backfilled;
	}

	async markSessionRegistryBackfilled(): Promise<void> {
		this._beforeWrite();
		this._backfilled = true;
	}

	async isProviderBackfilled(provider: string): Promise<boolean> {
		return this._providerBackfilled.has(provider);
	}

	async markProviderBackfilled(provider: string): Promise<void> {
		this._beforeWrite();
		this._providerBackfilled.add(provider);
	}

	async isSessionTombstoned(session: string): Promise<boolean> {
		return this._tombstones.has(session);
	}

	async markSessionTombstoned(session: string): Promise<void> {
		this._beforeWrite();
		this._tombstones.add(session);
	}

	async clearSessionTombstone(session: string): Promise<void> {
		this._beforeWrite();
		this._tombstones.delete(session);
	}

	async setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void> {
		if (enabled) {
			this._agentMergeEnabled.add(session);
		} else {
			this._agentMergeEnabled.delete(session);
		}
	}

	async listAgentMergeEnabledSessions(): Promise<readonly string[]> {
		return [...this._agentMergeEnabled];
	}

	async close(): Promise<void> { }
	dispose(): void { }

	private _beforeWrite(): void {
		this.registryWriteAttempts++;
		if (this._remainingRegistryWriteFailures > 0) {
			this._remainingRegistryWriteFailures--;
			throw new Error('transient registry write failure');
		}
	}
}

/** In-memory orchestrator database that two {@link AgentService} instances can share to simulate a host restart. */
class TestAgentHostOrchestratorDatabase implements IAgentHostDatabase {
	private readonly _sessions = new Map<string, IAgentHostDatabaseSession>();
	private readonly _providerBackfilled = new Set<string>();
	private readonly _tombstones = new Set<string>();
	private readonly _agentMergeEnabled = new Set<string>();
	private _backfilled = false;

	async registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		if (registerOptions.checkTombstone && this._tombstones.has(session)) {
			return false;
		}
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		const existing = this._sessions.get(session);
		this._sessions.set(session, existing
			? { ...existing, modifiedTime: Math.max(existing.modifiedTime, modifiedTime) }
			: { session, provider, startTime, modifiedTime, external: source === 'discovery', source });
		if (!registerOptions.checkTombstone) {
			this._tombstones.delete(session);
		}
		return true;
	}

	async unregisterSession(session: string): Promise<void> {
		this._sessions.delete(session);
		this._agentMergeEnabled.delete(session);
	}

	async tombstoneAndUnregisterSession(session: string): Promise<void> {
		this._tombstones.add(session);
		this._sessions.delete(session);
		this._agentMergeEnabled.delete(session);
	}

	async updateSessionExternal(): Promise<void> { }

	async updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean> {
		const existing = this._sessions.get(session);
		if (!existing || existing.modifiedTime >= modifiedTime) {
			return false;
		}
		this._sessions.set(session, { ...existing, modifiedTime });
		return true;
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		return [...this._sessions.values()];
	}

	async getSession(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		return this._sessions.get(session);
	}

	async isSessionRegistryEmpty(): Promise<boolean> {
		return this._sessions.size === 0;
	}

	async isSessionRegistryBackfilled(): Promise<boolean> {
		return this._backfilled;
	}

	async markSessionRegistryBackfilled(): Promise<void> {
		this._backfilled = true;
	}

	async isProviderBackfilled(provider: string): Promise<boolean> {
		return this._providerBackfilled.has(provider);
	}

	async markProviderBackfilled(provider: string): Promise<void> {
		this._providerBackfilled.add(provider);
	}

	async isSessionTombstoned(session: string): Promise<boolean> {
		return this._tombstones.has(session);
	}

	async markSessionTombstoned(session: string): Promise<void> {
		this._tombstones.add(session);
	}

	async clearSessionTombstone(session: string): Promise<void> {
		this._tombstones.delete(session);
	}

	async setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void> {
		if (enabled) {
			this._agentMergeEnabled.add(session);
		} else {
			this._agentMergeEnabled.delete(session);
		}
	}

	async listAgentMergeEnabledSessions(): Promise<readonly string[]> {
		return [...this._agentMergeEnabled];
	}

	async close(): Promise<void> { }
	dispose(): void { }
}

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;
	let fileService: FileService;
	let nullSessionDataService: ISessionDataService;

	setup(async () => {
		nullSessionDataService = createSessionDataService();

		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		// Seed a directory for browseDirectory tests
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/testDir' }));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		service = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		copilotAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => copilotAgent.dispose()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveAgentChatContext', () => {

		test('accepts configuration- and chat-scoped resources and rejects unrelated resources', () => {
			const session = AgentSession.uri('copilot', 'owner');
			const chat = URI.parse(buildChatUri(session, 'peer'));

			assert.throws(
				() => resolveAgentChatContext({ configurationResource: session, resource: URI.parse('copilot:/other') }, chat),
				/Chat context resource must be the configuration resource or addressed chat/,
			);
			assert.deepStrictEqual({
				configurationScoped: resolveAgentChatContext({ configurationResource: session, resource: session }, chat).resource.toString(),
				chatScoped: resolveAgentChatContext({ configurationResource: session, resource: chat }, chat).resource.toString(),
			}, {
				configurationScoped: session.toString(),
				chatScoped: chat.toString(),
			});
		});
	});

	test('surfaces explicitly requested SDK download progress without a session', () => {
		const notifications: { type: string; progressToken?: string; progress?: number; total?: number; message?: string }[] = [];
		disposables.add(service.onDidNotification(notification => notifications.push(notification)));

		service.emitDownloadProgress('codex', 'Codex', 50, 100, false, true);

		assert.deepStrictEqual(notifications, [{
			type: NotificationType.Progress,
			channel: ROOT_STATE_URI,
			progressToken: 'codex',
			progress: 50,
			total: 100,
			message: 'Downloading Codex agent',
		}]);
	});

	// ---- Provider registration ------------------------------------------

	suite('registerProvider', () => {

		test('registers a provider successfully', () => {
			registerTestAgentProvider(service, copilotAgent);
			// No throw - success
		});

		suite('failed turn resume', () => {
			async function createErroredTurn(resumable = true): Promise<{ session: URI; chat: string }> {
				registerTestAgentProvider(service, copilotAgent);
				const session = await service.createSession({ provider: 'copilot' });
				const chat = buildDefaultChatUri(session.toString());
				const stateManager = getStateManager(service);
				stateManager.dispatchServerAction(chat, {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt: '2026-08-11T00:00:00.000Z',
					message: { text: 'hello', origin: { kind: MessageKind.User } },
				});
				stateManager.dispatchServerAction(chat, {
					type: ActionType.ChatUsage,
					turnId: 'turn-1',
					usage: {
						inputTokens: 10,
						outputTokens: 5,
						model: 'model-1',
						_meta: {
							cost: 1,
							copilotUsage: { totalNanoAiu: 2 },
							turnTokenTotals: [{ model: 'model-1', inputTokens: 10, cachedTokens: 1, outputTokens: 5 }],
						},
					},
				});
				stateManager.dispatchServerAction(chat, {
					type: ActionType.ChatError,
					turnId: 'turn-1',
					duration: 100,
					part: createErrorResponsePart({ errorType: 'requestFailed', message: 'failed' }, resumable),
				});
				return { session, chat };
			}

			test('rejects resumable state when the provider cannot continue', async () => {
				const { chat } = await createErroredTurn();
				const envelopePromise = Event.toPromise(Event.filter(service.onDidAction, envelope => envelope.origin?.clientSeq === 1));

				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);

				const envelope = await envelopePromise;
				assert.deepStrictEqual({
					rejectionReason: envelope.rejectionReason,
					activeTurn: getStateManager(service).getChatState(chat)?.activeTurn,
				}, {
					rejectionReason: 'The session provider does not support turn resume.',
					activeTurn: undefined,
				});
			});

			test('rejects a non-resumable error without calling the provider', async () => {
				const { chat } = await createErroredTurn(false);
				const resumeCalls: string[] = [];
				copilotAgent.chats.resumeTurn = async (_chat, turnId) => {
					resumeCalls.push(turnId);
				};
				const envelopePromise = Event.toPromise(Event.filter(service.onDidAction, envelope => envelope.origin?.clientSeq === 1));

				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);

				const envelope = await envelopePromise;
				assert.deepStrictEqual({
					rejectionReason: envelope.rejectionReason,
					resumeCalls,
					activeTurn: getStateManager(service).getChatState(chat)?.activeTurn,
				}, {
					rejectionReason: 'The requested turn is not the latest resumable errored turn.',
					resumeCalls: [],
					activeTurn: undefined,
				});
			});

			test('rejects resume after the session is archived', async () => {
				const { session, chat } = await createErroredTurn();
				copilotAgent.chats.resumeTurn = async () => { };
				getStateManager(service).dispatchServerAction(session.toString(), {
					type: ActionType.SessionIsArchivedChanged,
					isArchived: true,
				});
				const envelopePromise = Event.toPromise(Event.filter(service.onDidAction, envelope => envelope.origin?.clientSeq === 1));

				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);

				const envelope = await envelopePromise;
				assert.strictEqual(envelope.rejectionReason, 'Cannot resume a read-only or archived chat.');
			});

			test('accepts only one racing resume before provider side effects', async () => {
				const { chat } = await createErroredTurn();
				const calls: Array<{ chat: string; turnId: string }> = [];
				copilotAgent.chats.resumeTurn = async (resource, turnId) => {
					calls.push({ chat: resource.toString(), turnId });
				};
				const envelopes: ActionEnvelope[] = [];
				disposables.add(service.onDidAction(envelope => {
					if (envelope.origin?.clientSeq === 1 || envelope.origin?.clientSeq === 2) {
						envelopes.push(envelope);
					}
				}));

				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);
				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-2', 2);
				await timeout(0);

				assert.deepStrictEqual({
					calls,
					envelopes: envelopes.map(envelope => ({ clientSeq: envelope.origin?.clientSeq, rejectionReason: envelope.rejectionReason })),
					activeTurnId: getStateManager(service).getChatState(chat)?.activeTurn?.id,
				}, {
					calls: [{ chat, turnId: 'turn-1' }],
					envelopes: [
						{ clientSeq: 1, rejectionReason: undefined },
						{ clientSeq: 2, rejectionReason: 'Cannot resume while a turn is active.' },
					],
					activeTurnId: 'turn-1',
				});
			});

			test('preserves cumulative logical-turn duration and usage', async () => {
				const { chat } = await createErroredTurn();
				copilotAgent.chats.resumeTurn = async () => { };
				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);
				copilotAgent.fireProgress({
					kind: 'action',
					resource: URI.parse(chat),
					action: {
						type: ActionType.ChatUsage,
						turnId: 'turn-1',
						usage: {
							inputTokens: 20,
							outputTokens: 8,
							model: 'model-1',
							_meta: {
								cost: 3,
								copilotUsage: { totalNanoAiu: 4 },
								turnTokenTotals: [{ model: 'model-1', inputTokens: 20, cachedTokens: 2, outputTokens: 8 }],
							},
						},
					},
				});
				copilotAgent.fireProgress({
					kind: 'action',
					resource: URI.parse(chat),
					action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 50 },
				});

				const turn = getStateManager(service).getChatState(chat)?.turns.at(-1);
				assert.deepStrictEqual({
					id: turn?.id,
					duration: turn?.duration,
					usage: turn?.usage,
				}, {
					id: 'turn-1',
					duration: 150,
					usage: {
						inputTokens: 20,
						outputTokens: 8,
						model: 'model-1',
						_meta: {
							cost: 4,
							copilotUsage: { totalNanoAiu: 6 },
							turnTokenTotals: [{ model: 'model-1', inputTokens: 30, cachedTokens: 3, outputTokens: 13 }],
						},
					},
				});
			});

			test('accumulates duration and usage across repeated failed continuations', async () => {
				const { chat } = await createErroredTurn();
				copilotAgent.chats.resumeTurn = async () => { };
				const failContinuation = (clientSeq: number, duration: number, usage: { inputTokens: number; outputTokens: number; cost: number; nanoAiu: number; cachedTokens: number }, message: string) => {
					service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, `client-${clientSeq}`, clientSeq);
					copilotAgent.fireProgress({
						kind: 'action',
						resource: URI.parse(chat),
						action: {
							type: ActionType.ChatUsage,
							turnId: 'turn-1',
							usage: {
								inputTokens: usage.inputTokens,
								outputTokens: usage.outputTokens,
								model: 'model-1',
								_meta: {
									cost: usage.cost,
									copilotUsage: { totalNanoAiu: usage.nanoAiu },
									turnTokenTotals: [{
										model: 'model-1',
										inputTokens: usage.inputTokens,
										cachedTokens: usage.cachedTokens,
										outputTokens: usage.outputTokens,
									}],
								},
							},
						},
					});
					copilotAgent.fireProgress({
						kind: 'action',
						resource: URI.parse(chat),
						action: {
							type: ActionType.ChatError,
							turnId: 'turn-1',
							duration,
							part: createErrorResponsePart({ errorType: 'requestFailed', message }, true),
						},
					});
				};

				failContinuation(1, 50, { inputTokens: 20, outputTokens: 8, cost: 3, nanoAiu: 4, cachedTokens: 2 }, 'failed again');
				failContinuation(2, 25, { inputTokens: 30, outputTokens: 10, cost: 5, nanoAiu: 6, cachedTokens: 3 }, 'failed a third time');

				const state = getStateManager(service).getChatState(chat);
				const turn = state?.turns.at(-1);
				assert.deepStrictEqual({
					turnCount: state?.turns.length,
					id: turn?.id,
					duration: turn?.duration,
					errorMessages: turn?.responseParts
						.filter(part => part.kind === ResponsePartKind.Error)
						.map(part => part.error.message),
					usage: turn?.usage,
				}, {
					turnCount: 1,
					id: 'turn-1',
					duration: 175,
					errorMessages: ['failed', 'failed again', 'failed a third time'],
					usage: {
						inputTokens: 30,
						outputTokens: 10,
						model: 'model-1',
						_meta: {
							cost: 9,
							copilotUsage: { totalNanoAiu: 12 },
							turnTokenTotals: [{ model: 'model-1', inputTokens: 60, cachedTokens: 6, outputTokens: 23 }],
						},
					},
				});
			});

			test('finalizes the same turn with a non-resumable error when continuation fails immediately', async () => {
				const { chat } = await createErroredTurn();
				copilotAgent.chats.resumeTurn = async () => {
					throw new Error('continuation failed');
				};
				service.dispatchAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn-1' }, 'client-1', 1);
				await Event.toPromise(Event.filter(service.onDidAction, envelope =>
					envelope.action.type === ActionType.ChatError && !envelope.origin));

				const state = getStateManager(service).getChatState(chat);
				const turn = state?.turns.at(-1);
				assert.deepStrictEqual({
					turnCount: state?.turns.length,
					id: turn?.id,
					state: turn?.state,
					errors: turn?.responseParts.filter(part => part.kind === ResponsePartKind.Error),
					durationAtLeastInitial: (turn?.duration ?? 0) >= 100,
				}, {
					turnCount: 1,
					id: 'turn-1',
					state: TurnState.Error,
					errors: [
						createErrorResponsePart({ errorType: 'requestFailed', message: 'failed' }, true),
						createErrorResponsePart({ errorType: 'sendFailed', message: 'Error: continuation failed' }),
					],
					durationAtLeastInitial: true,
				});
			});
		});

		test('forwards the exact chat URI encoded in an MCP channel', async () => {
			const provider: IAgent = copilotAgent;
			const calls: Array<{ chat: string; serverName: string; method: string; params: Record<string, unknown> | undefined }> = [];
			provider.handleMcpRequest = async (chat, serverName, method, params) => {
				calls.push({ chat: chat.toString(), serverName, method, params });
				return 'result';
			};
			registerTestAgentProvider(service, provider);
			const session = AgentSession.uri('copilot', 'agent-host-session');
			const chat = URI.parse(buildChatUri(session, 'peer-chat'));
			const params = { uri: 'ui://example/app' };

			const result = await service.handleMcpRequest(buildMcpChannel(chat, 'server'), 'resources/read', params);

			assert.deepStrictEqual({ result, calls }, {
				result: 'result',
				calls: [{
					chat: chat.toString(),
					serverName: 'server',
					method: 'resources/read',
					params,
				}],
			});
		});

		test('throws on duplicate provider registration', () => {
			registerTestAgentProvider(service, copilotAgent);
			const duplicate = new MockAgent('copilot');
			disposables.add(toDisposable(() => duplicate.dispose()));
			assert.throws(() => registerTestAgentProvider(service, duplicate), /already registered/);
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
			registerTestAgentProvider(service, providerA);
			registerTestAgentProvider(service, providerB);
			registerTestAgentProvider(service, failingProvider);

			const info = await service.getNetworkDiagnosticsInfo();

			assert.deepStrictEqual({ account: info.account, endpoints: info.endpoints }, {
				account: 'octocat',
				endpoints: [
					{ name: 'First', url: 'https://example.com' },
					{ name: 'Other', url: 'https://other.example.com' },
				],
			});
		});

		test('aggregates managed-settings diagnostics from capable providers', async () => {
			const provider: IAgent = copilotAgent;
			provider.getManagedSettingsDiagnostics = async () => ({
				source: 'device',
				serverManaged: false,
				deviceManaged: true,
				failClosed: false,
				bypassPermissionsDisabled: false,
				managedKeys: ['permissions'],
				settings: { permissions: { allow: ['Shell(echo *)'] } },
			});
			const unsupportedProvider = new MockAgent('other');
			disposables.add(toDisposable(() => unsupportedProvider.dispose()));
			const failingProvider = new MockAgent('failing');
			disposables.add(toDisposable(() => failingProvider.dispose()));
			const failingProviderContract: IAgent = failingProvider;
			failingProviderContract.getManagedSettingsDiagnostics = async () => { throw new Error('unavailable'); };
			registerTestAgentProvider(service, provider);
			registerTestAgentProvider(service, unsupportedProvider);
			registerTestAgentProvider(service, failingProvider);

			const diagnostics = await service.getManagedSettingsDiagnostics();

			assert.deepStrictEqual(diagnostics, [
				{
					provider: 'copilot',
					snapshot: {
						source: 'device',
						serverManaged: false,
						deviceManaged: true,
						failClosed: false,
						bypassPermissionsDisabled: false,
						managedKeys: ['permissions'],
						settings: { permissions: { allow: ['Shell(echo *)'] } },
					},
				},
				{ provider: 'failing', error: 'unavailable' },
			]);
		});

		test('forwards managed-settings diagnostics through the local management service', async () => {
			const provider: IAgent = copilotAgent;
			provider.getManagedSettingsDiagnostics = async () => ({
				source: 'device',
				serverManaged: false,
				deviceManaged: true,
				failClosed: false,
				bypassPermissionsDisabled: false,
				managedKeys: ['permissions'],
			});
			registerTestAgentProvider(service, provider);
			const managementService = new AgentHostManagementService(service, {} as IConnectionTrackerService, async () => { }, nullSessionDataService, new NullLogService());

			assert.deepStrictEqual(await managementService.getManagedSettingsDiagnostics(), [{
				provider: 'copilot',
				snapshot: {
					source: 'device',
					serverManaged: false,
					deviceManaged: true,
					failClosed: false,
					bypassPermissionsDisabled: false,
					managedKeys: ['permissions'],
				},
			}]);
		});

		test('maps progress events to protocol actions via onDidAction', async () => {
			registerTestAgentProvider(service, copilotAgent);
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
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		setTestAgentHostWorktreeIsolation(localService, disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			nullSessionDataService,
			new NullLogService(),
		)));
		const agent = new MockAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(localService, agent);
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
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		setTestAgentHostWorktreeIsolation(localService, disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			nullSessionDataService,
			new NullLogService(),
		)));
		const agent = new MockAgent('codex');
		const providerResolveConfigs: Array<Record<string, unknown> | undefined> = [];
		const providerCompletionConfigs: Array<Record<string, unknown> | undefined> = [];
		agent.resolveChatConfig = async params => {
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
		agent.chatConfigCompletions = async params => {
			providerCompletionConfigs.push(params.config);
			return { items: [] };
		};
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(localService, agent);

		const initial = await localService.resolveSessionConfig({
			provider: 'codex',
			workingDirectory,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.AgentMerge]: { enabled: true },
				[SessionConfigKey.AgentMergeController]: { lastPromptFingerprint: 'fingerprint' },
				providerSetting: 'initial',
			},
		});
		const selected = await localService.resolveSessionConfig({
			provider: 'codex',
			workingDirectory,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'feature/config',
				[SessionConfigKey.WorktreeBranchPrefix]: 'users/test/',
				[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
				[SessionConfigKey.WorktreeBranchTrack]: false,
				[SessionConfigKey.WorktreeCreateNewBranch]: false,
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
				[SessionConfigKey.WorktreeBranchTrack]: false,
				[SessionConfigKey.WorktreeCreateNewBranch]: false,
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
				agentMerge: initial.values[SessionConfigKey.AgentMerge],
				agentMergeController: initial.values[SessionConfigKey.AgentMergeController],
				providerSetting: initial.values.providerSetting,
			},
			selected: {
				isolation: selected.values[SessionConfigKey.Isolation],
				branch: selected.values[SessionConfigKey.Branch],
				branchPrefix: selected.values[SessionConfigKey.WorktreeBranchPrefix],
				includeFiles: selected.values[SessionConfigKey.WorktreeIncludeFiles],
				branchTrack: selected.values[SessionConfigKey.WorktreeBranchTrack],
				createNewBranch: selected.values[SessionConfigKey.WorktreeCreateNewBranch],
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
			initial: {
				isolation: 'worktree',
				branchDefault: 'main',
				branch: 'main',
				agentMerge: { enabled: true },
				agentMergeController: { lastPromptFingerprint: 'fingerprint' },
				providerSetting: 'initial',
			},
			selected: { isolation: 'worktree', branch: 'feature/config', branchPrefix: 'users/test/', includeFiles: ['.env'], branchTrack: false, createNewBranch: false, providerSetting: 'selected' },
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
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		const isolation = disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			nullSessionDataService,
			new NullLogService(),
		));
		setTestAgentHostWorktreeIsolation(localService, isolation);
		const pendingDuringCreate: boolean[] = [];
		const providerCreateConfigs: Array<Record<string, unknown> | undefined> = [];
		let failCreate = false;
		class PrewarmingAgent extends MockAgent {
			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: async (chat, context, options) => {
					const { configurationResource } = resolveAgentChatContext(context, chat);
					pendingDuringCreate.push(isWorkingDirectoryPending(localService, configurationResource.toString()));
					providerCreateConfigs.push(options?.config);
					if (failCreate) {
						throw new Error('create failed');
					}
					return { ...await expectCreatedChat(base.createChat(chat, context, options)), provisional: true };
				},
			}));
		}
		const agent = new PrewarmingAgent('codex');
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(localService, agent);

		await localService.createSession({
			provider: 'codex',
			session,
			workingDirectories: workingDirectory ? [workingDirectory] : undefined,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		});

		const failedSession = AgentSession.uri('codex', 'failed-before-create');
		failCreate = true;
		await assert.rejects(localService.createSession({
			provider: 'codex',
			session: failedSession,
			workingDirectories: workingDirectory ? [workingDirectory] : undefined,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		}), /create failed/);

		assert.deepStrictEqual({
			pendingDuringCreate,
			providerCreateConfigs,
			pendingAfterCreate: isWorkingDirectoryPending(localService, session.toString()),
			pendingAfterFailure: isWorkingDirectoryPending(localService, failedSession.toString()),
		}, {
			pendingDuringCreate: [true, true],
			providerCreateConfigs: [{}, {}],
			pendingAfterCreate: true,
			pendingAfterFailure: false,
		});
	});

	test('createSession validates, exposes, and persists multi-root metadata', async () => {
		const db = new TestSessionDatabase();
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		const agent = new MockAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(localService, agent);
		const multiRoot = {
			workspaceFile: 'vscode-remote://ssh-remote+host/work/demo.code-workspace',
		};
		const github = {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
			pullRequestBranchName: 'feature',
		};
		const session = await localService.createSession({
			provider: agent.id,
			workingDirectories: [URI.file('/workspace/one'), URI.file('/workspace/two')],
			_meta: { github, multiRoot, ignored: 'client value' },
		});
		const override = {
			workspaceFile: 'file:///work/override.code-workspace',
		};
		const overridden = await localService.createSession({
			provider: agent.id,
			_meta: { multiRoot: override },
		});

		assert.deepStrictEqual({
			state: getStateManager(localService).getSessionState(session.toString())?._meta,
			persisted: await db.getMetadata(SESSION_META_MULTI_ROOT_KEY),
			github: readSessionGitHubState(getStateManager(localService).getSessionState(session.toString())?._meta),
			overridden: readSessionMultiRootMetadata(getStateManager(localService).getSessionState(overridden.toString())?._meta),
		}, {
			state: { github, multiRoot },
			persisted: JSON.stringify(override),
			github,
			overridden: override,
		});
	});

	test('createSession fails open (shows the picker) when the folder-picker decision rejects', async () => {
		class RejectingFolderPickerAgent extends MockAgent {
			override getDescriptor() {
				const base = super.getDescriptor();
				return { ...base, capabilities: { ...base.capabilities, multipleWorkingDirectories: { immutablePrimary: true } } };
			}
			computeFolderPickerDecision(): Promise<ISessionFolderPickerDecision | undefined> {
				return Promise.reject(new Error('scan failed'));
			}
		}
		const agent = new RejectingFolderPickerAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		registerTestAgentProvider(localService, agent);

		const session = await localService.createSession({
			provider: agent.id,
			workingDirectories: [URI.file('/workspace/one'), URI.file('/workspace/two')],
		});

		assert.deepStrictEqual(
			readSessionFolderPickerDecision(getStateManager(localService).getSessionState(session.toString())?._meta),
			{ hidden: false },
		);
	});

	test('createSession seeds the harness-pinned folder-picker decision into session metadata', async () => {
		class PinningFolderPickerAgent extends MockAgent {
			override getDescriptor() {
				const base = super.getDescriptor();
				return { ...base, capabilities: { ...base.capabilities, multipleWorkingDirectories: { immutablePrimary: true } } };
			}
			computeFolderPickerDecision(workingDirectories: readonly URI[]): Promise<ISessionFolderPickerDecision | undefined> {
				return Promise.resolve({ hidden: true, primary: workingDirectories[1].toString() });
			}
		}
		const agent = new PinningFolderPickerAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		registerTestAgentProvider(localService, agent);

		const session = await localService.createSession({
			provider: agent.id,
			workingDirectories: [URI.file('/workspace/one'), URI.file('/workspace/two')],
		});

		assert.deepStrictEqual(
			readSessionFolderPickerDecision(getStateManager(localService).getSessionState(session.toString())?._meta),
			{ hidden: true, primary: URI.file('/workspace/two').toString() },
		);
	});

	test('persists the folder-picker decision at create and restores it on reopen (shown and pinned)', async () => {
		class DecidingFolderPickerAgent extends MockAgent {
			decision: ISessionFolderPickerDecision = { hidden: false };
			override getDescriptor() {
				const base = super.getDescriptor();
				return { ...base, capabilities: { ...base.capabilities, multipleWorkingDirectories: { immutablePrimary: true } } };
			}
			computeFolderPickerDecision(): Promise<ISessionFolderPickerDecision | undefined> {
				return Promise.resolve(this.decision);
			}
		}

		const cases: ISessionFolderPickerDecision[] = [
			{ hidden: false },
			{ hidden: true, primary: URI.file('/workspace/two').toString() },
		];
		for (const decision of cases) {
			const db = new TestSessionDatabase();

			// Create writes the frozen decision into the session DB (non-provisional).
			const creating = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const creatingAgent = new DecidingFolderPickerAgent('copilot');
			creatingAgent.decision = decision;
			disposables.add(toDisposable(() => creatingAgent.dispose()));
			registerTestAgentProvider(creating, creatingAgent);
			const session = await creating.createSession({
				provider: creatingAgent.id,
				workingDirectories: [URI.file('/workspace/one'), URI.file('/workspace/two')],
			});

			// Reopen: a fresh service on the same DB rediscovers the provider-native
			// session and must restore the persisted decision into `_meta`.
			const reopened = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(reopened).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const reopenedAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => reopenedAgent.dispose()));
			(reopenedAgent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			registerTestAgentProvider(reopened, reopenedAgent);
			const restored = (await reopened.listSessions()).find(s => s.session.toString() === session.toString());

			assert.deepStrictEqual({
				seeded: readSessionFolderPickerDecision(getStateManager(creating).getSessionState(session.toString())?._meta),
				persisted: await db.getMetadata(SESSION_META_FOLDER_PICKER_KEY),
				restored: readSessionFolderPickerDecision(restored?._meta),
			}, {
				seeded: decision,
				persisted: JSON.stringify(decision),
				restored: decision,
			});
		}
	});

	test('defers folder-picker persistence to materialization for a provisional session, then restores on reopen', async () => {
		class ProvisionalDecidingAgent extends MockAgent {
			private readonly _onDidMaterializeChat = new Emitter<IAgentMaterializeChatEvent>();
			override readonly onDidMaterializeChat = this._onDidMaterializeChat.event;
			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
			}));
			override getDescriptor() {
				const base = super.getDescriptor();
				return { ...base, capabilities: { ...base.capabilities, multipleWorkingDirectories: { immutablePrimary: true } } };
			}
			computeFolderPickerDecision(workingDirectories: readonly URI[]): Promise<ISessionFolderPickerDecision | undefined> {
				return Promise.resolve({ hidden: true, primary: workingDirectories[1].toString() });
			}
			materialize(session: URI, workingDirectories: readonly URI[]): void {
				this._onDidMaterializeChat.fire({ chat: URI.parse(buildDefaultChatUri(session)), workingDirectories, project: undefined });
			}
			override dispose(): void {
				this._onDidMaterializeChat.dispose();
				super.dispose();
			}
		}

		const db = new TestSessionDatabase();
		const creating = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		const agent = new ProvisionalDecidingAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(creating, agent);
		const decision = { hidden: true, primary: URI.file('/work/two').toString() };
		const session = await creating.createSession({
			provider: agent.id,
			workingDirectories: [URI.file('/work/one'), URI.file('/work/two')],
		});

		const persistedBeforeMaterialize = await db.getMetadata(SESSION_META_FOLDER_PICKER_KEY);
		agent.materialize(session, [URI.file('/work/one'), URI.file('/work/two')]);
		await timeout(0);

		const reopened = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		getConfigurationService(reopened).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
		const reopenedAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => reopenedAgent.dispose()));
		(reopenedAgent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
		registerTestAgentProvider(reopened, reopenedAgent);
		const restored = (await reopened.listSessions()).find(s => s.session.toString() === session.toString());

		assert.deepStrictEqual({
			seeded: readSessionFolderPickerDecision(getStateManager(creating).getSessionState(session.toString())?._meta),
			persistedBeforeMaterialize,
			persistedAfterMaterialize: await db.getMetadata(SESSION_META_FOLDER_PICKER_KEY),
			restored: readSessionFolderPickerDecision(restored?._meta),
		}, {
			seeded: decision,
			persistedBeforeMaterialize: undefined,
			persistedAfterMaterialize: JSON.stringify(decision),
			restored: decision,
		});
	});

	test('provisional materialization preserves and persists multi-root metadata', async () => {
		class ProvisionalAgent extends MockAgent {
			private readonly _onDidMaterializeChat = new Emitter<IAgentMaterializeChatEvent>();
			override readonly onDidMaterializeChat = this._onDidMaterializeChat.event;

			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
			}));

			materialize(session: URI, workingDirectories: readonly URI[]): void {
				this._onDidMaterializeChat.fire({ chat: URI.parse(buildDefaultChatUri(session)), workingDirectories, project: undefined });
			}

			override dispose(): void {
				this._onDidMaterializeChat.dispose();
				super.dispose();
			}
		}

		const db = new TestSessionDatabase();
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		const agent = new ProvisionalAgent('copilot');
		disposables.add(toDisposable(() => agent.dispose()));
		registerTestAgentProvider(localService, agent);
		const multiRoot = {
			workspaceFile: 'file:///work/demo.code-workspace',
		};
		const github = {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
			pullRequestBranchName: 'feature',
		};
		const session = await localService.createSession({
			provider: agent.id,
			workingDirectories: [URI.file('/work/one'), URI.file('/work/two')],
			_meta: { github, multiRoot },
		});
		const before = readSessionMultiRootMetadata(getStateManager(localService).getSessionState(session.toString())?._meta);
		const persistedBefore = await db.getMetadata(SESSION_META_MULTI_ROOT_KEY);
		const githubBefore = readSessionGitHubState(getStateManager(localService).getSessionState(session.toString())?._meta);
		const persistedGitHubBefore = await db.getMetadata(META_GITHUB_STATE);

		agent.materialize(session, [URI.file('/work/materialized'), URI.file('/work/two')]);
		await timeout(0);

		assert.deepStrictEqual({
			before,
			persistedBefore,
			githubBefore,
			persistedGitHubBefore,
			after: readSessionMultiRootMetadata(getStateManager(localService).getSessionState(session.toString())?._meta),
			persistedAfter: await db.getMetadata(SESSION_META_MULTI_ROOT_KEY),
			githubAfter: readSessionGitHubState(getStateManager(localService).getSessionState(session.toString())?._meta),
			persistedGitHubAfter: await db.getMetadata(META_GITHUB_STATE),
		}, {
			before: multiRoot,
			persistedBefore: undefined,
			githubBefore: github,
			persistedGitHubBefore: undefined,
			after: multiRoot,
			persistedAfter: JSON.stringify(multiRoot),
			githubAfter: github,
			persistedGitHubAfter: JSON.stringify(github),
		});
	});

	test('reconciles pending worktree isolation when creating session config changes', async () => {
		const gitService = createNoopGitService();
		const sessionDataService = createSessionDataService(new TestSessionDatabase());
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		const isolation = disposables.add(new WorktreeIsolation(
			{ generateBranchName: async () => 'agents/test' },
			gitService,
			sessionDataService,
			new NullLogService(),
		));
		setTestAgentHostWorktreeIsolation(localService, isolation);

		class ProvisionalAgent extends MockAgent {
			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
			}));
		}

		const provisionalAgent = new ProvisionalAgent('codex');
		const readyAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => provisionalAgent.dispose()));
		disposables.add(toDisposable(() => readyAgent.dispose()));
		registerTestAgentProvider(localService, provisionalAgent);
		registerTestAgentProvider(localService, readyAgent);

		const creatingSession = await localService.createSession({
			provider: 'codex',
			workingDirectories: [URI.file('/workspace/repo')],
			config: { [SessionConfigKey.Isolation]: 'folder' },
		});
		const readySession = await localService.createSession({
			provider: 'copilot',
			workingDirectories: [URI.file('/workspace/repo')],
			config: { [SessionConfigKey.Isolation]: 'folder' },
		});
		const creatingInitially = isWorkingDirectoryPending(localService, creatingSession.toString());
		const readyInitially = isWorkingDirectoryPending(localService, readySession.toString());
		const creatingLifecycle = getStateManager(localService).getSessionState(creatingSession.toString())?.lifecycle;
		const readyLifecycle = getStateManager(localService).getSessionState(readySession.toString())?.lifecycle;

		localService.dispatchAction(creatingSession.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.Isolation]: 'worktree' },
		}, 'test-client', 1);
		const creatingAfterWorktree = isWorkingDirectoryPending(localService, creatingSession.toString());

		localService.dispatchAction(creatingSession.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.Isolation]: 'folder' },
		}, 'test-client', 2);
		const creatingAfterFolder = isWorkingDirectoryPending(localService, creatingSession.toString());

		localService.dispatchAction(readySession.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.Isolation]: 'worktree' },
		}, 'test-client', 3);
		const readyAfterWorktree = isWorkingDirectoryPending(localService, readySession.toString());

		assert.deepStrictEqual({
			creatingInitially,
			readyInitially,
			creatingLifecycle,
			readyLifecycle,
			creatingAfterWorktree,
			creatingAfterFolder,
			readyAfterWorktree,
		}, {
			creatingInitially: false,
			readyInitially: false,
			creatingLifecycle: SessionLifecycle.Creating,
			readyLifecycle: SessionLifecycle.Ready,
			creatingAfterWorktree: true,
			creatingAfterFolder: false,
			readyAfterWorktree: false,
		});
	});

	suite('resourceRead', () => {

		test('returns binary resources as Base64 when requested', async () => {
			const uri = URI.from({ scheme: Schemas.inMemory, path: '/logs.zip' });
			await fileService.writeFile(uri, VSBuffer.wrap(Uint8Array.from([80, 75, 0, 1, 255])));

			assert.deepStrictEqual(await service.resourceRead(uri, ContentEncoding.Base64), {
				data: 'UEsAAf8=',
				encoding: ContentEncoding.Base64,
				contentType: 'application/octet-stream',
			});
		});

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

		// ---- git-blob: content resolution (AC-5, Q5 Option A) ---------------
		//
		// A `git-blob:` URI carries the changed file's ABSOLUTE path (as the URI
		// path) plus the session it belongs to. The host must run `git show` in
		// the repository that actually contains that file, chosen SERVER-SIDE
		// from the session's own working directories — never from a
		// client-supplied directory.

		/**
		 * Builds a git service whose {@link IAgentHostGitService.getRepositoryRoot}
		 * maps each working directory to a repo root via {@link repoRootByDir}
		 * and whose {@link IAgentHostGitService.showBlob} records the working
		 * directory it is asked to run in (so tests can assert the server picked
		 * the right repository).
		 */
		function createBlobGitService(repoRootByDir: ReadonlyMap<string, URI>, showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }>) {
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async workingDirectory => repoRootByDir.get(workingDirectory.toString());
			gitService.showBlob = async (workingDirectory, ref, repoRelativePath) => {
				showBlobCalls.push({ workingDirectory: workingDirectory.toString(), ref, repoRelativePath });
				return VSBuffer.fromString(`blob:${repoRelativePath}`);
			};
			return gitService;
		}

		async function createBlobSession(gitService: ReturnType<typeof createNoopGitService>, workingDirectories: readonly URI[]): Promise<{ service: AgentService; session: URI }> {
			// Advertise `multipleWorkingDirectories` so the full multi-root set is
			// retained in session state (a provider without it is truncated to
			// the primary at create time).
			class MultiRootMockAgent extends MockAgent {
				override getDescriptor(): IAgentDescriptor {
					return { provider: this.id, displayName: this.id, description: this.id, capabilities: { multipleWorkingDirectories: { immutablePrimary: true } } };
				}
			}
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MultiRootMockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot', workingDirectories: [...workingDirectories] });
			return { service: localService, session };
		}

		test('git-blob resolves against the containing repo root of a NON-primary folder (multi-root)', async () => {
			const repoA = URI.file('/workspace/repoA');
			const repoB = URI.file('/workspace/repoB');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA], [repoB.toString(), repoB]]), showBlobCalls);
			const { service: localService, session } = await createBlobSession(gitService, [repoA, repoB]);

			// A file changed in the NON-primary folder (repoB).
			const blobUri = URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'src/app.ts', '/workspace/repoB/src/app.ts'));
			const result = await localService.resourceRead(blobUri);

			// showBlob ran in repoB's root — not the primary (repoA) — and its
			// content was returned.
			assert.deepStrictEqual(showBlobCalls, [{ workingDirectory: repoB.toString(), ref: 'baseSha', repoRelativePath: 'src/app.ts' }]);
			assert.strictEqual(result.data, 'blob:src/app.ts');
		});

		test('git-blob whose absolute path is under no session repo root maps to NotFound (no wrong-primary fallback)', async () => {
			const repoA = URI.file('/workspace/repoA');
			const repoB = URI.file('/workspace/repoB');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA], [repoB.toString(), repoB]]), showBlobCalls);
			const { service: localService, session } = await createBlobSession(gitService, [repoA, repoB]);

			// Absolute path is outside every session repository root.
			const blobUri = URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'x.ts', '/workspace/outside/x.ts'));

			await assert.rejects(
				() => localService.resourceRead(blobUri),
				(error: unknown) => error instanceof ProtocolError && error.code === AhpErrorCodes.NotFound,
			);
			// The primary was NOT used as a wrong fallback — showBlob never ran.
			assert.deepStrictEqual(showBlobCalls, []);
		});

		test('git-blob resolves against the sole repo root in a single-folder session (unchanged behavior)', async () => {
			const repoA = URI.file('/workspace/repoA');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA]]), showBlobCalls);
			const { service: localService, session } = await createBlobSession(gitService, [repoA]);

			const blobUri = URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'src/app.ts', '/workspace/repoA/src/app.ts'));
			const result = await localService.resourceRead(blobUri);

			assert.deepStrictEqual(showBlobCalls, [{ workingDirectory: repoA.toString(), ref: 'baseSha', repoRelativePath: 'src/app.ts' }]);
			assert.strictEqual(result.data, 'blob:src/app.ts');
		});

		test('git-blob restores the session before resolving its working directory', async () => {
			const repoA = URI.file('/workspace/repoA');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA]]), showBlobCalls);
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			agent.sessionMetadataOverrides = { workingDirectories: [repoA] };
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const { session } = await createAgentSession(agent);
			const sessionRestoredBeforeRead = !!getStateManager(localService).getSessionState(session.toString());

			const result = await localService.resourceRead(URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'src/app.ts', '/workspace/repoA/src/app.ts')));

			assert.deepStrictEqual({
				sessionRestoredBeforeRead,
				sessionRestored: !!getStateManager(localService).getSessionState(session.toString()),
				showBlobCalls,
				data: result.data,
			}, {
				sessionRestoredBeforeRead: false,
				sessionRestored: true,
				showBlobCalls: [{ workingDirectory: repoA.toString(), ref: 'baseSha', repoRelativePath: 'src/app.ts' }],
				data: 'blob:src/app.ts',
			});
		});

		test('git-blob restores the owning session for nested subagents and retains it in the MRU', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const repoA = URI.file('/workspace/repoA');
				const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
				const gitService = createBlobGitService(new Map([[repoA.toString(), repoA]]), showBlobCalls);
				const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
				const agent = new MockAgent('copilot');
				agent.sessionMetadataOverrides = { workingDirectories: [repoA] };
				disposables.add(toDisposable(() => agent.dispose()));
				registerTestAgentProvider(localService, agent);
				const { session } = await createAgentSession(agent);
				const childSession = URI.parse(buildSubagentSessionUri(session, 'child'));
				const nestedSession = URI.parse(buildSubagentSessionUri(childSession, 'nested'));

				const result = await localService.resourceRead(URI.parse(buildGitBlobUri(nestedSession.toString(), 'baseSha', 'src/app.ts', '/workspace/repoA/src/app.ts')));
				localService.addSubscriber(nestedSession, 'client');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				const retainedForSubscriber = !!getStateManager(localService).getSessionState(session.toString());
				localService.unsubscribe(nestedSession, 'client');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual({
					showBlobCalls,
					data: result.data,
					retainedForSubscriber,
					releasedAfterUnsubscribe: !getStateManager(localService).getSessionState(session.toString()),
				}, {
					showBlobCalls: [{ workingDirectory: repoA.toString(), ref: 'baseSha', repoRelativePath: 'src/app.ts' }],
					data: 'blob:src/app.ts',
					retainedForSubscriber: true,
					releasedAfterUnsubscribe: false,
				});
			});
		});

		test('single-folder git-blob uses the primary directory even for a path outside the root (AC-1.1 unchanged)', async () => {
			const repoA = URI.file('/workspace/repoA');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA]]), showBlobCalls);
			const { service: localService, session } = await createBlobSession(gitService, [repoA]);

			// Absolute path is OUTSIDE the (single) working directory — e.g. a
			// relocated/remapped worktree. Pre-multi-root single-folder behavior
			// ran `git show` from the primary directory regardless of the path;
			// single-folder sessions must keep doing so (no containment check),
			// rather than returning NotFound as the multi-root path would.
			const blobUri = URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'src/app.ts', '/somewhere/else/src/app.ts'));
			const result = await localService.resourceRead(blobUri);

			assert.deepStrictEqual(showBlobCalls, [{ workingDirectory: repoA.toString(), ref: 'baseSha', repoRelativePath: 'src/app.ts' }]);
			assert.strictEqual(result.data, 'blob:src/app.ts');
		});

		test('git-blob runs showBlob in a server-derived repo root, never a directory read from the URI', async () => {
			const repoA = URI.file('/workspace/repoA');
			// The repoB working directory is a SUBDIRECTORY of its repo root, so
			// the resolved repo root differs from both the working directory and
			// the URI path's parent directory.
			const repoBWorkingDir = URI.file('/workspace/repoB/nested/sub');
			const repoBRoot = URI.file('/workspace/repoB');
			const showBlobCalls: Array<{ workingDirectory: string; ref: string; repoRelativePath: string }> = [];
			const gitService = createBlobGitService(new Map([[repoA.toString(), repoA], [repoBWorkingDir.toString(), repoBRoot]]), showBlobCalls);
			const { service: localService, session } = await createBlobSession(gitService, [repoA, repoBWorkingDir]);

			// The URI path's parent directory (/workspace/repoB/src) must NOT be
			// used as the cwd; the repo root is what runs `git show`.
			const blobUri = URI.parse(buildGitBlobUri(session.toString(), 'baseSha', 'src/app.ts', '/workspace/repoB/src/app.ts'));
			await localService.resourceRead(blobUri);

			assert.strictEqual(showBlobCalls.length, 1);
			// cwd is a session-resolved repo root...
			const resolvedRepoRoots = [repoA.toString(), repoBRoot.toString()];
			assert.ok(resolvedRepoRoots.includes(showBlobCalls[0].workingDirectory), 'cwd must be one of the session repo roots');
			assert.strictEqual(showBlobCalls[0].workingDirectory, repoBRoot.toString());
			// ...and NOT a value derived from the URI (parent dir) or the working directory.
			assert.notStrictEqual(showBlobCalls[0].workingDirectory, URI.file('/workspace/repoB/src').toString());
			assert.notStrictEqual(showBlobCalls[0].workingDirectory, repoBWorkingDir.toString());
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

		async function setupTitleGeneration(copilotApiService: TestCopilotApiService, activeAgentTitleGeneration = false): Promise<{ svc: AgentService; agent: MockAgent; session: URI; db: TestSessionDatabase }> {
			const db = new TestSessionDatabase();
			const sessionDataService = createSessionDataService(db);
			const svc = disposables.add(createTestAgentService(
				new NullLogService(),
				fileService,
				sessionDataService,
				{ _serviceBrand: undefined } as IProductService,
				createNoopGitService(),
				undefined,
				undefined,
				undefined,
				copilotApiService,
			));
			getConfigurationService(svc).updateRootConfig({ [AgentHostActiveAgentTitleGenerationConfigKey]: activeAgentTitleGeneration });
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			await svc.authenticate({
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
				token: 'gh-token',
			});
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, db };
		}

		class DynamicWorkingDirectoryAgent extends MockAgent {
			constructor(id: string, private readonly immutablePrimary = true) {
				super(id);
			}

			override getDescriptor(): IAgentDescriptor {
				return {
					provider: this.id,
					displayName: this.id,
					description: this.id,
					capabilities: {
						multipleWorkingDirectories: { immutablePrimary: this.immutablePrimary },
						multipleChats: { fork: true, sideChat: true },
					},
				};
			}
		}

		async function createDynamicWorkingDirectorySession(immutablePrimary = true): Promise<{ svc: AgentService; session: URI; primary: URI; secondary: URI }> {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new DynamicWorkingDirectoryAgent('dynamic', immutablePrimary);
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const primary = URI.file('/workspace/primary');
			const secondary = URI.file('/workspace/secondary');
			const session = await svc.createSession({
				provider: agent.id,
				workingDirectories: [primary, secondary],
				_meta: withSessionMultiRootMetadata(undefined, { workspaceFile: URI.file('/workspace/demo.code-workspace').toString() }),
			});
			return { svc, session, primary, secondary };
		}

		test('rejects a turn id already used by another chat before applying it', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const defaultChat = buildDefaultChatUri(session.toString());
			const peerChat = buildChatUri(session, 'peer-1');
			getStateManager(svc).addChat(session.toString(), peerChat);
			getStateManager(svc).dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'duplicate-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'peer', origin: { kind: MessageKind.User } },
			});
			getStateManager(svc).dispatchServerAction(peerChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'duplicate-turn',
				duration: 1,
			});
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'duplicate-turn',
				startedAt: '2025-01-01T00:00:01.000Z',
				message: { text: 'default', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);
			const envelope = await envelopePromise;
			const defaultChatState = getStateManager(svc).getChatState(defaultChat);

			assert.deepStrictEqual({
				rejected: envelope.rejectionReason !== undefined,
				activeTurn: defaultChatState?.activeTurn,
				turns: defaultChatState?.turns,
				sendMessageCalls: agent.sendMessageCalls,
			}, {
				rejected: true,
				activeTurn: undefined,
				turns: [],
				sendMessageCalls: [],
			});
		});

		test('rejects a turn id used by an unresolved restored peer before applying it', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const defaultChat = buildDefaultChatUri(session.toString());
			const peerChat = buildChatUri(session, 'peer-1');
			let resolverCalls = 0;
			getStateManager(svc).registerRestoredChatSummary(session.toString(), peerChat, {
				resolver: async () => {
					resolverCalls++;
					return {
						turns: [{
							id: 'duplicate-turn',
							state: TurnState.Complete,
							message: { text: 'peer', origin: { kind: MessageKind.User } },
							responseParts: [],
							usage: undefined,
						}],
					};
				},
			});
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(defaultChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'duplicate-turn',
				startedAt: '2025-01-01T00:00:01.000Z',
				message: { text: 'default', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);
			const envelope = await envelopePromise;
			const defaultChatState = getStateManager(svc).getChatState(defaultChat);

			assert.deepStrictEqual({
				rejected: envelope.rejectionReason !== undefined,
				resolverCalls,
				peerResolved: getStateManager(svc).getChatState(peerChat) !== undefined,
				activeTurn: defaultChatState?.activeTurn,
				turns: defaultChatState?.turns,
				sendMessageCalls: agent.sendMessageCalls,
			}, {
				rejected: true,
				resolverCalls: 1,
				peerResolved: true,
				activeTurn: undefined,
				turns: [],
				sendMessageCalls: [],
			});
		});

		test('rejects working-directory mutations from non-Editor clients', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectorySet,
				directory: URI.file('/workspace/added').toString(),
			}, 'agents-window-client', 1, AgentHostClientType.AgentsWindow);
			const envelope = await envelopePromise;

			assert.deepStrictEqual({
				rejectionReason: envelope.rejectionReason,
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				rejectionReason: 'Session working-directory actions require an Editor Window client.',
				confirmed: [primary.toString(), secondary.toString()],
			});
		});

		test('rejects client writes to host-owned Agent Merge controller state', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			// A forged target would otherwise authorize a native merge of any pull request.
			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionConfigChanged,
				config: {
					[SessionConfigKey.AgentMergeController]: {
						target: { branchName: 'main', pullRequestUrl: 'https://github.com/octo/repo/pull/1', enabledAt: '2026-01-01T00:00:00.000Z', commentWatermark: '2026-01-01T00:00:00.000Z' },
					},
				},
			}, 'agents-window-client', 1, AgentHostClientType.AgentsWindow);
			const envelope = await envelopePromise;

			assert.deepStrictEqual({
				rejectionReason: envelope.rejectionReason,
				controllerState: getStateManager(svc).getSessionState(session.toString())?.config?.values[SessionConfigKey.AgentMergeController],
			}, {
				rejectionReason: `Session config keys are host-owned and cannot be set by a client: ${SessionConfigKey.AgentMergeController}.`,
				controllerState: undefined,
			});
		});

		test('preserves host-owned Agent Merge controller state across a client config replacement', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const controllerState = { target: { branchName: 'main', pullRequestUrl: 'https://github.com/octo/repo/pull/1', enabledAt: '2026-01-01T00:00:00.000Z', commentWatermark: '2026-01-01T00:00:00.000Z' } };
			const session = await svc.createSession({ provider: 'copilot', config: { [SessionConfigKey.AgentMergeController]: controllerState } });
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			// A wholesale replacement that omits the key must not clear the binding,
			// which would otherwise reset the watermark and attempt budgets.
			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { [SessionConfigKey.AgentMerge]: { enabled: true } },
				replace: true,
			}, 'agents-window-client', 1, AgentHostClientType.AgentsWindow);
			const envelope = await envelopePromise;

			assert.deepStrictEqual({
				rejectionReason: envelope.rejectionReason,
				controllerState: getStateManager(svc).getSessionState(session.toString())?.config?.values[SessionConfigKey.AgentMergeController],
			}, {
				rejectionReason: undefined,
				controllerState,
			});
		});

		test('accepts client writes to the client-owned Agent Merge enablement value', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { [SessionConfigKey.AgentMerge]: { enabled: true } },
			}, 'agents-window-client', 1, AgentHostClientType.AgentsWindow);
			const envelope = await envelopePromise;

			assert.strictEqual(envelope.rejectionReason, undefined);
		});

		test('accepts a working-directory mutation synchronously', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const added = URI.file('/workspace/added');
			let envelope: ActionEnvelope | undefined;
			const listener = svc.onDidAction(candidate => {
				if (candidate.origin?.clientSeq === 1) {
					envelope = candidate;
				}
			});

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectorySet,
				directory: added.toString(),
			}, 'test-client', 1, AgentHostClientType.EditorWindow);

			assert.deepStrictEqual({
				envelope: envelope?.action,
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				envelope: { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
				confirmed: [primary.toString(), secondary.toString(), added.toString()],
			});
			listener.dispose();
		});

		test('rejects a failed review update and clears the client dispatch queue', async () => {
			const db = new TestSessionDatabase();
			db.getMetadata = async () => { throw new Error('metadata unavailable'); };
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: agent.id, workingDirectories: [URI.file('/workspace')] });
			const changeset = buildBranchChangesetUri(session.toString());
			getStateManager(svc).registerChangeset(changeset);
			const rejectionPromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(changeset, {
				type: ActionType.ChangesetFilesReviewChanged,
				files: [URI.file('/workspace/file.txt').toString()],
				reviewed: true,
			}, 'test-client', 1);
			const rejection = await rejectionPromise;
			await timeout(0);

			let nextAction: ActionEnvelope | undefined;
			const listener = svc.onDidAction(envelope => {
				if (envelope.origin?.clientSeq === 2) {
					nextAction = envelope;
				}
			});
			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionTitleChanged,
				title: 'Updated title',
			}, 'test-client', 2);

			assert.deepStrictEqual({
				rejectionReason: rejection.rejectionReason,
				rejectedAction: rejection.action,
				nextAction: nextAction?.action,
			}, {
				rejectionReason: 'metadata unavailable',
				rejectedAction: {
					type: ActionType.ChangesetFilesReviewChanged,
					files: [URI.file('/workspace/file.txt').toString()],
					reviewed: true,
				},
				nextAction: { type: ActionType.SessionTitleChanged, title: 'Updated title' },
			});
			listener.dispose();
		});

		test('queues a working-directory mutation behind an earlier attachment rewrite from the same client', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const source = URI.from({ scheme: Schemas.inMemory, path: '/workspace/source.txt' });
			await fileService.writeFile(source, VSBuffer.fromString('contents'));
			const readStarted = new DeferredPromise<void>();
			const readGate = new DeferredPromise<void>();
			const originalReadFile = fileService.readFile.bind(fileService);
			fileService.readFile = async resource => {
				if (resource.toString() === source.toString()) {
					readStarted.complete();
					await readGate.p;
				}
				return originalReadFile(resource);
			};
			disposables.add(toDisposable(() => fileService.readFile = originalReadFile));
			const observed: ActionType[] = [];
			const listener = svc.onDidAction(envelope => observed.push(envelope.action.type));
			const clientId = 'ordered-client';
			const chat = buildDefaultChatUri(session.toString());

			svc.dispatchAction(chat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: {
					text: 'hello',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: source.toString(),
						label: 'source.txt',
						displayKind: 'document',
					}],
				},
			}, clientId, 1, AgentHostClientType.EditorWindow);
			await readStarted.p;
			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectorySet,
				directory: URI.file('/workspace/added').toString(),
			}, clientId, 2, AgentHostClientType.EditorWindow);
			await timeout(0);

			assert.deepStrictEqual(
				getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
				[primary.toString(), secondary.toString()],
				'working-directory action must not overtake the pending rewrite',
			);

			readGate.complete();
			await waitForCondition(() => observed.includes(ActionType.SessionWorkingDirectorySet), 'working-directory action should dispatch after the rewrite');
			assert.ok(
				observed.indexOf(ActionType.ChatTurnStarted) < observed.indexOf(ActionType.SessionWorkingDirectorySet),
				`expected turn action before working-directory action, got ${observed.join(', ')}`,
			);
			listener.dispose();
		});

		test('reduces working-directory mutations synchronously in dispatch order', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const added = URI.file('/workspace/added');

			svc.dispatchAction(session.toString(), { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() }, 'test-client', 1, AgentHostClientType.EditorWindow);
			svc.dispatchAction(session.toString(), { type: ActionType.SessionWorkingDirectoryRemoved, directory: secondary.toString() }, 'test-client', 2, AgentHostClientType.EditorWindow);

			assert.deepStrictEqual({
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				confirmed: [primary.toString(), added.toString()],
			});
		});

		test('canonicalizes equivalent and absent idempotent working-directory actions', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const envelopes: ActionEnvelope[] = [];
			const listener = svc.onDidAction(envelope => envelopes.push(envelope));

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectorySet,
				directory: 'file:///workspace/%73econdary',
			}, 'test-client', 1, AgentHostClientType.EditorWindow);
			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectoryRemoved,
				directory: 'file:///workspace/%61bsent',
			}, 'test-client', 2, AgentHostClientType.EditorWindow);

			assert.deepStrictEqual({
				actions: envelopes.map(envelope => envelope.action),
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				actions: [
					{ type: ActionType.SessionWorkingDirectorySet, directory: secondary.toString() },
					{ type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///workspace/absent' },
				],
				confirmed: [primary.toString(), secondary.toString()],
			});
			listener.dispose();
		});

		test('rejects removal of the immutable primary', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession();
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectoryRemoved,
				directory: primary.toString(),
			}, 'test-client', 1, AgentHostClientType.EditorWindow);
			const envelope = await envelopePromise;

			assert.deepStrictEqual({
				rejected: !!envelope.rejectionReason,
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				rejected: true,
				confirmed: [primary.toString(), secondary.toString()],
			});
		});

		test('allows removal of index zero for equal-peer working directories', async () => {
			const { svc, session, primary, secondary } = await createDynamicWorkingDirectorySession(false);
			const envelopePromise = Event.toPromise(Event.filter(svc.onDidAction, envelope => envelope.origin?.clientSeq === 1));

			svc.dispatchAction(session.toString(), {
				type: ActionType.SessionWorkingDirectoryRemoved,
				directory: primary.toString(),
			}, 'test-client', 1, AgentHostClientType.EditorWindow);
			const envelope = await envelopePromise;

			assert.deepStrictEqual({
				rejected: !!envelope.rejectionReason,
				confirmed: getStateManager(svc).getSessionState(session.toString())?.workingDirectories,
			}, {
				rejected: false,
				confirmed: [secondary.toString()],
			});
		});

		test('applies and persists root config changes from clients', async () => {
			const tempDir = URI.file(mkdtempSync(`${tmpdir()}/agent-host-config-`));
			// Use a local DisposableStore so that svc can be explicitly disposed
			// before cleaning up the temp directory. On Windows, rmSync fails with
			// EPERM if the AgentService (and its child AgentConfigurationService)
			// still holds references while the directory is being deleted.
			const localDisposables = new DisposableStore();
			try {
				const rootConfigResource = joinPath(tempDir, 'agent-host-config.json');
				const svc = localDisposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService(), rootConfigResource));
				const agent = new MockAgent('copilot');
				localDisposables.add(toDisposable(() => agent.dispose()));
				registerTestAgentProvider(svc, agent);

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
				await getConfigurationService(svc).whenIdle();
			} finally {
				localDisposables.dispose();
				await rm(tempDir.fsPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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

			await waitForCondition(() => getStateManager(svc).getSessionState(session.toString())?.title === 'Fix TypeScript compile errors', 'generated title should be applied');
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

		test('active-agent title generation skips the utility model and persists auto provenance', async () => {
			const copilotApiService = new TestCopilotApiService();
			const { svc, session, db } = await setupTitleGeneration(copilotApiService, true);
			const prompt = `Explain ${'active agent title generation '.repeat(4)}`;

			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: prompt, origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			const title = getStateManager(svc).getSessionState(session.toString())?.title;
			assert.strictEqual(title, 'Explain active agent title generation active...');
			assert.strictEqual(copilotApiService.utilityCalls.length, 0);
			await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, 'active-agent fallback provenance should be persisted');

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
				title: getStateManager(svc).getSessionState(session.toString())?.title,
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
				title: getStateManager(svc).getSessionState(session.toString())?.title,
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
				state: getStateManager(svc).getSessionState(session.toString()),
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				aborted: true,
				state: undefined,
				persistedTitle: undefined,
			});
		});

		test('generates a utility title for imported conversations when active-agent naming is disabled', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = 'Imported conversation title';
			const { svc } = await setupTitleGeneration(copilotApiService);
			const imported = await svc.createSession({
				provider: 'copilot',
				importConversation: {
					turns: [{
						id: 'imported-turn',
						message: { text: 'Investigate imported conversation', origin: { kind: MessageKind.User } },
						responseParts: [{ kind: ResponsePartKind.Markdown, id: 'imported-response', content: 'Found the import path.' }],
						state: TurnState.Complete,
						usage: undefined,
					}],
				},
			});

			await waitForCondition(() => getStateManager(svc).getSessionState(imported.toString())?.title === 'Imported conversation title', 'imported title should be generated');
			assert.strictEqual(copilotApiService.utilityCalls.length, 1);
		});

		test('keeps a deterministic imported title without utility generation in active-agent mode', async () => {
			const copilotApiService = new TestCopilotApiService();
			const { svc, db } = await setupTitleGeneration(copilotApiService, true);
			const imported = await svc.createSession({
				provider: 'copilot',
				importConversation: {
					turns: [{
						id: 'imported-turn',
						message: { text: 'Investigate imported conversation', origin: { kind: MessageKind.User } },
						responseParts: [],
						state: TurnState.Complete,
						usage: undefined,
					}],
				},
			});

			assert.strictEqual(getStateManager(svc).getSessionState(imported.toString())?.title, 'Investigate imported conversation');
			assert.strictEqual(copilotApiService.utilityCalls.length, 0);
			await waitForCondition(async () => await db.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY) === AGENT_HOST_TITLE_SOURCE_AUTO, 'imported fallback provenance should be persisted');
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
			const svc = disposables.add(createTestAgentService(logService, fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, attachmentsRoot, warnings };
		}

		async function dispatchTurnAndWait(svc: AgentService, agent: MockAgent, session: URI, attachments: MessageAttachment[]): Promise<void> {
			svc.dispatchAction(
				buildDefaultChatUri(session.toString()),
				{
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt: '2025-01-01T00:00:00.000Z',
					message: { text: 'hello', origin: { kind: MessageKind.User }, attachments },
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

		test('snapshots embedded text attachments as text files without retaining the payload in state', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const metadata = { kind: 'paste' };

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'Pasted text #1',
				data: encodeBase64(VSBuffer.fromString('large pasted text')),
				contentType: 'text/plain',
				_meta: metadata,
			}]);

			const rewritten = agent.sendMessageCalls[0].attachments?.[0];
			assert.ok(rewritten);
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) {
				return;
			}
			const stateAttachment = getStateManager(svc).getSessionState(session.toString())?.activeTurn?.message.attachments?.[0];
			assert.deepStrictEqual(stateAttachment, rewritten);
			const resource = URI.parse(rewritten.uri);
			const contents = await fileService.readFile(resource);
			assert.deepStrictEqual({
				label: rewritten.label,
				displayKind: rewritten.displayKind,
				metadata: rewritten._meta,
				isSessionAttachment: resource.toString().startsWith(`${attachmentsRoot.toString()}/`),
				fileName: resource.path.split('/').at(-1),
				contents: contents.value.toString(),
			}, {
				label: 'Pasted text #1',
				displayKind: undefined,
				metadata: { ...metadata, ...toHostSnapshotAttachmentMeta('text/plain') },
				isSessionAttachment: true,
				fileName: 'Pasted text #1.txt',
				contents: 'large pasted text',
			});
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
			// Tagged read-only so downstream providers present it as content, not an editable file (#331154).
			assert.ok(isHostSnapshotAttachment(rewritten), 'should be tagged as a read-only snapshot');

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

		test('does not re-snapshot attachments already under the attachments folder, but tags them read-only (#331154)', async () => {
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
			assert.strictEqual(a.uri, existing.toString(), 'second-pass rewrite should not move the file');
			// A re-attached snapshot must still be tagged so providers treat it as read-only content.
			assert.ok(isHostSnapshotAttachment(a), 're-attached snapshot should be tagged read-only');
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

		test('resolves provider-owned session state files through the local management service', async () => {
			const provider: IAgent = copilotAgent;
			provider.getSessionStateFile = async session => URI.file(`/state/${AgentSession.id(session)}/events.jsonl`);
			registerTestAgentProvider(service, provider);
			const managementService = new AgentHostManagementService(service, {} as IConnectionTrackerService, async () => { }, nullSessionDataService, new NullLogService());

			assert.deepStrictEqual({
				supported: (await managementService.getSessionStateFile(AgentSession.uri('copilot', 'session-1')))?.toString(),
				unsupported: await managementService.getSessionStateFile(AgentSession.uri('other', 'session-2')),
			}, {
				supported: 'file:///state/session-1/events.jsonl',
				unsupported: undefined,
			});
		});
	});

	suite('createSession', () => {

		test('creates session via specified provider', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('accepts customization updates while creating a provisional session', async () => {
			const customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin'), uri: 'file:///plugin', name: 'Plugin' } as const;
			class ProvisionalCustomizationAgent extends MockAgent {
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
				}));

				override getSessionCustomizations = async (session: URI) => {
					this.fireProgress({
						kind: 'action',
						resource: session,
						action: { type: ActionType.SessionCustomizationUpdated, customization },
					});
					return [];
				};
			}

			const agent = new ProvisionalCustomizationAgent('codex');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(service, agent);

			const session = await service.createSession({ provider: agent.id });

			assert.deepStrictEqual(getStateManager(service).getSessionState(session.toString())?.customizations, [customization]);
		});

		test('publishes initial customizations to a client subscribed during discovery', async () => {
			const customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin'), uri: 'file:///plugin', name: 'Plugin', enabled: true } as const;
			class MaterializingCustomizationAgent extends MockAgent {
				private readonly _onDidMaterializeChat = new Emitter<IAgentMaterializeChatEvent>();
				override readonly onDidMaterializeChat = this._onDidMaterializeChat.event;
				readonly customizationReadStarted = new DeferredPromise<URI>();
				readonly releaseCustomizationRead = new DeferredPromise<void>();
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
				}));

				override getSessionCustomizations = async (session: URI) => {
					this.customizationReadStarted.complete(session);
					await this.releaseCustomizationRead.p;
					return [customization];
				};

				materialize(session: URI): void {
					this._onDidMaterializeChat.fire({ chat: URI.parse(buildDefaultChatUri(session)), workingDirectories: undefined, project: undefined });
				}

				override dispose(): void {
					this._onDidMaterializeChat.dispose();
					super.dispose();
				}
			}

			const agent = new MaterializingCustomizationAgent('codex');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(service, agent);

			const creation = service.createSession({ provider: agent.id });
			const session = await agent.customizationReadStarted.p;
			agent.materialize(session);
			const initialSnapshot = await service.subscribe(session, 'client');
			const initialSnapshotCustomizations = (initialSnapshot.state as SessionState).customizations;
			const customizationChanged = Event.toPromise(Event.filter(service.onDidAction, envelope =>
				envelope.channel === session.toString() && envelope.action.type === ActionType.SessionCustomizationsChanged));
			agent.releaseCustomizationRead.complete();
			const [, envelope] = await Promise.all([creation, customizationChanged]);

			assert.deepStrictEqual({
				initialSnapshotCustomizations,
				action: envelope.action,
				currentSnapshotCustomizations: (getStateManager(service).getSnapshot(session.toString())?.state as SessionState | undefined)?.customizations,
			}, {
				initialSnapshotCustomizations: undefined,
				action: { type: ActionType.SessionCustomizationsChanged, customizations: [customization] },
				currentSnapshotCustomizations: [customization],
			});
		});

		test('truncates working directories for a provider without multipleWorkingDirectories', async () => {
			class CapturingAgent extends MockAgent {
				lastConfig: IAgentCreateSessionConfig | undefined;
				constructor(id: string, private readonly _caps: import('../../common/agent.js').IAgentCapabilities | undefined) {
					super(id);
				}
				override getDescriptor() {
					return { ...super.getDescriptor(), capabilities: this._caps };
				}
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => {
						const session = resolveAgentChatContext(context, chat).configurationResource;
						this.lastConfig = { session, model: options?.model, agent: options?.agent, workingDirectories: options?.workingDirectories, config: options?.config };
						return base.createChat(chat, context, options);
					},
				}));
			}

			const single = new CapturingAgent('single', undefined);
			const multi = new CapturingAgent('multi', { multipleWorkingDirectories: { immutablePrimary: true } });
			disposables.add(toDisposable(() => single.dispose()));
			disposables.add(toDisposable(() => multi.dispose()));
			registerTestAgentProvider(service, single);
			registerTestAgentProvider(service, multi);

			const dirs = [URI.file('/repoA'), URI.file('/repoB'), URI.file('/repoC')];
			await service.createSession({ provider: 'single', workingDirectories: dirs });
			await service.createSession({ provider: 'multi', workingDirectories: dirs });

			// A provider that does not advertise the capability keeps only the
			// primary (index 0); one that advertises it receives the full set.
			assert.deepStrictEqual({
				single: single.lastConfig?.workingDirectories?.map(d => d.toString()),
				multi: multi.lastConfig?.workingDirectories?.map(d => d.toString()),
			}, {
				single: [dirs[0].toString()],
				multi: dirs.map(d => d.toString()),
			});
		});

		test('honors requested session URI', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const requestedSession = AgentSession.uri('copilot', 'requested-session');
			const session = await service.createSession({ provider: 'copilot', session: requestedSession });
			assert.strictEqual(session.toString(), requestedSession.toString());
		});

		test('scripted mock agent honors requested session URI', async () => {
			const agent = new ScriptedMockAgent();
			disposables.add(toDisposable(() => agent.dispose()));

			const requestedSession = AgentSession.uri('mock', 'requested-session');
			const result = await createAgentSession(agent, { session: requestedSession });
			const sessions = await agent.listSessions();

			assert.deepStrictEqual({
				created: result.session.toString(),
				listed: sessions.some(s => s.session.toString() === requestedSession.toString()),
			}, {
				created: requestedSession.toString(),
				listed: true,
			});
		});

		test('scripted mock agent does not advertise unsupported multiple chats', () => {
			const agent = new ScriptedMockAgent();
			disposables.add(toDisposable(() => agent.dispose()));

			assert.strictEqual(agent.getDescriptor().capabilities?.multipleChats, undefined);
		});

		test('uses default provider when none specified', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession();
			// A create with no config at all is still workspace-less: the agent
			// infers that from the absent working directory and assigns a
			// scratch cwd, so the service must tag it to match — otherwise the
			// session comes back looking workspace-bound, rooted at that scratch
			// dir.
			assert.deepStrictEqual({
				provider: AgentSession.provider(session),
				meta: getStateManager(service).getSessionState(session.toString())?._meta,
			}, {
				provider: 'copilot',
				meta: { workspaceless: true },
			});
		});

		test('throws when no providers are registered at all', async () => {
			await assert.rejects(() => service.createSession(), /No agent provider/);
		});

		test('retries a transient registry registration failure before reporting creation success', async () => {
			const db = new TransientRegistryWriteDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			db.failRegistryWrites(1);

			const session = await svc.createSession({ provider: 'copilot' });

			assert.deepStrictEqual({
				registryWriteAttempts: db.registryWriteAttempts,
				registeredSessions: (await svc.getRegisteredSessions()).map(resource => resource.toString()),
			}, {
				registryWriteAttempts: 2,
				registeredSessions: [session.toString()],
			});
		});

		test('marks the backing and rolls back creation when default-chat provider data cannot be persisted', async () => {
			// N2: `_persistDefaultChatBacking`'s provider-data write and its
			// backing-marker write must be independent — a provider-data
			// write failure must not prevent (or roll back) the backing
			// marker, since that marker is what keeps the backing session out
			// of the top-level list.
			class FailingProviderDataDatabase extends TestSessionDatabase {
				override async setMetadata(key: string, value: string): Promise<void> {
					if (key === 'defaultChatProviderData') {
						throw new Error('provider data write failed');
					}
					return super.setMetadata(key, value);
				}
			}
			class BackedDefaultChatAgent extends MockAgent {
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						return result ? { ...result, providerData: 'blob', backingSession: AgentSession.uri(this.id, 'default-chat-backing-sdk-id') } : result;
					},
				}));
			}

			const db = new FailingProviderDataDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new BackedDefaultChatAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			await assert.rejects(() => svc.createSession({ provider: 'copilot' }), /provider data write failed/);

			assert.deepStrictEqual({
				registered: await svc.getRegisteredSessions(),
				backingMarked: db.setMetadataCalls.some(c => c.key === 'peerChatBacking'),
				providerDataPersisted: db.setMetadataCalls.some(c => c.key === 'defaultChatProviderData'),
				disposeCalls: agent.disposeSessionCalls.length,
			}, {
				registered: [],
				backingMarked: true,
				providerDataPersisted: false,
				disposeCalls: 1,
			});
		});
	});

	// ---- disposeSession -------------------------------------------------

	suite('disposeSession', () => {

		test('dispatches to the correct provider and cleans up tracking', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			await service.disposeSession(session);

			assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1);
		});

		test('is a no-op for unknown sessions', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const unknownSession = URI.from({ scheme: 'unknown', path: '/nope' });

			// Should not throw
			await service.disposeSession(unknownSession);
		});

		test('deletes session data before removing the worktree', async () => {
			// Subscribers of the will-delete event drop this session's git refs,
			// which requires resolving the repository from the working directory.
			// For a worktree-isolated session that directory *is* the worktree, so
			// removing it first would strand the refs in the main repository.
			const order: string[] = [];
			const sessionDataService: ISessionDataService = {
				...nullSessionDataService,
				deleteSessionData: async () => { order.push('deleteSessionData'); },
			};
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, copilotAgent);
			const session = await svc.createSession({ provider: 'copilot' });
			const workingDirectoryPendingChange = disposables.add(new Emitter<string>());
			setTestAgentHostWorktreeIsolation(svc, createTestAgentHostWorktreeIsolation({
				onDidChangeWorkingDirectoryPending: workingDirectoryPendingChange.event,
				prepareSessionDeletion: async () => {
					order.push('prepareSessionDeletion');
					return { repositoryRoot: URI.file('/repo'), worktree: URI.file('/worktree') };
				},
				removeSessionWorktree: async (_sessionId: string, worktree: { readonly worktree: URI } | undefined) => {
					order.push(`removeSessionWorktree:${worktree?.worktree.toString()}`);
				},
			}));

			await svc.disposeSession(session);

			assert.deepStrictEqual(order, ['prepareSessionDeletion', 'deleteSessionData', 'removeSessionWorktree:file:///worktree']);
		});

		test('preserves session data when worktree metadata cannot be read', async () => {
			let deletedSessionData = false;
			const sessionDataService: ISessionDataService = {
				...nullSessionDataService,
				deleteSessionData: async () => { deletedSessionData = true; },
			};
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, copilotAgent);
			const session = await svc.createSession({ provider: 'copilot' });
			setTestAgentHostWorktreeIsolation(svc, createTestAgentHostWorktreeIsolation({
				prepareSessionDeletion: async () => { throw new Error('metadata unavailable'); },
			}));

			await assert.rejects(() => svc.disposeSession(session), /metadata unavailable/);

			assert.deepStrictEqual({
				deletedSessionData,
				providerSessionStillExists: !!(await copilotAgent.getSessionMetadata(session)),
				registered: (await svc.getRegisteredSessions()).map(resource => resource.toString()),
				hasState: !!getStateManager(svc).getSessionState(session.toString()),
			}, {
				deletedSessionData: false,
				providerSessionStillExists: true,
				registered: [session.toString()],
				hasState: true,
			});
		});

		test('reports failed unregistration and allows deletion to retry durably', async () => {
			const db = new TransientRegistryWriteDatabase();
			let deleteSessionDataCalls = 0;
			let removeWorktreeCalls = 0;
			const sessionDataService: ISessionDataService = {
				...createSessionDataService(),
				deleteSessionData: async () => { deleteSessionDataCalls++; },
			};
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			setTestAgentHostWorktreeIsolation(svc, createTestAgentHostWorktreeIsolation({
				prepareSessionDeletion: async () => undefined,
				removeSessionWorktree: async () => { removeWorktreeCalls++; },
			}));
			// Flush the provider backfill before injecting failures: its
			// registry write is fire-and-forget and would otherwise consume
			// part of the failure budget intended for the unregistration.
			await svc.listSessions();
			db.failRegistryWrites(2);

			await assert.rejects(svc.disposeSession(session), /transient registry write failure/);
			assert.deepStrictEqual({
				registeredSessions: (await svc.getRegisteredSessions()).map(resource => resource.toString()),
				hasState: !!getStateManager(svc).getSessionState(session.toString()),
				deleteSessionDataCalls,
				removeWorktreeCalls,
			}, {
				registeredSessions: [session.toString()],
				hasState: true,
				deleteSessionDataCalls: 0,
				removeWorktreeCalls: 0,
			});

			await svc.disposeSession(session);
			assert.deepStrictEqual({
				registryWriteAttempts: db.registryWriteAttempts,
				registeredSessions: await svc.getRegisteredSessions(),
				hasState: !!getStateManager(svc).getSessionState(session.toString()),
				deleteSessionDataCalls,
				removeWorktreeCalls,
			}, {
				registryWriteAttempts: 3,
				registeredSessions: [],
				hasState: false,
				deleteSessionDataCalls: 1,
				removeWorktreeCalls: 1,
			});
		});
	});

	// ---- listSessions / listModels --------------------------------------

	suite('aggregation', () => {

		class TimedExternalAgent extends MockAgent {
			readonly catalog = new Map<string, { session: URI; modifiedTime: number; _meta?: IAgentSessionMetadata['_meta'] }>();

			addSession(id: string, modifiedTime: number, _meta?: IAgentSessionMetadata['_meta']): URI {
				const session = AgentSession.uri(this.id, id);
				this.catalog.set(id, { session, modifiedTime, _meta });
				(this as unknown as { _sessions: Map<string, URI> })._sessions.set(id, session);
				return session;
			}

			override async listExternalChats(): Promise<IAgentChatMetadata[]> {
				return [...this.catalog.values()].map(entry => ({
					chat: URI.parse(buildDefaultChatUri(entry.session)),
					startTime: entry.modifiedTime,
					modifiedTime: entry.modifiedTime,
					...(entry._meta ? { _meta: entry._meta } : {}),
				}));
			}

			override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
				const session = resolveAgentChatContext(context, chat).configurationResource;
				const entry = this.catalog.get(AgentSession.id(session));
				return entry ? { chat, startTime: entry.modifiedTime, modifiedTime: entry.modifiedTime, ...(entry._meta ? { _meta: entry._meta } : {}) } : undefined;
			}
		}

		function createExternalSessionService(sessionDataService = createSessionDataService(), orchestratorDatabase?: IAgentHostDatabase, copilotApiService?: ICopilotApiService): AgentService {
			return disposables.add(createTestAgentService(
				new NullLogService(),
				fileService,
				sessionDataService,
				{ _serviceBrand: undefined } as IProductService,
				createNoopGitService(),
				undefined,
				undefined,
				undefined,
				copilotApiService,
				undefined,
				[],
				undefined,
				undefined,
				orchestratorDatabase,
			));
		}

		function testWithExternalSessionClock(name: string, fn: () => Promise<void>): void {
			test(name, () => runWithFakedTimers({
				useFakeTimers: true,
				startTime: Date.UTC(2026, 0, 1),
				maxTaskCount: 10_000,
			}, fn));
		}

		function setExternalSessionsMode(service: AgentService, mode: AgentHostExternalSessionsMode, clientSeq: number): void {
			service.dispatchAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostShowExternalSessionsConfigKey]: mode },
			}, 'test-client', clientSeq);
		}

		async function waitForSessionListReconciliation(service: AgentService): Promise<void> {
			await (service as unknown as { _sessionListReconciliation: Promise<void> })._sessionListReconciliation;
		}

		function exposeListedSessions(service: AgentService, sessions: readonly IAgentSessionMetadata[]): void {
			const summaries = sessions.map((session): SessionSummary => {
				const provider = AgentSession.provider(session.session);
				if (!provider) {
					throw new Error(`Session has no provider: ${session.session.toString()}`);
				}
				return {
					resource: session.session.toString(),
					provider,
					title: session.summary ?? 'Session',
					status: session.status ?? SessionStatus.Idle,
					activity: session.activity,
					createdAt: new Date(session.startTime).toISOString(),
					modifiedAt: new Date(session.modifiedTime).toISOString(),
					...(session.project ? { project: { uri: session.project.uri.toString(), displayName: session.project.displayName } } : {}),
					workingDirectories: session.workingDirectories?.map(directory => directory.toString()),
					changes: session.changes,
					...(session._meta !== undefined ? { _meta: session._meta } : {}),
				};
			});
			getStateManager(service).prepareSessionSummariesForListing(summaries);
		}

		test('listSessions aggregates sessions from all providers', async () => {
			registerTestAgentProvider(service, copilotAgent);

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
		});

		test('listSessions discovers provider-native sessions as external and restore preserves provenance', async () => {
			const db = new TestSessionDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));

			// Simulate a provider-native session that predates host registration.
			const external = AgentSession.uri('copilot', 'external-session');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(external), external);
			registerTestAgentProvider(svc, agent);

			const listed = new Set((await svc.listSessions()).map(s => s.session.toString()));
			assert.deepStrictEqual(listed, new Set([external.toString()]));
			assert.strictEqual(readSessionExternal((await svc.listSessions())[0]._meta), true);
			assert.strictEqual(await db.getMetadata(AH_META_IS_READ_DB_KEY), 'true');
			await svc.restoreSession(external);

			const registered = await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list();
			assert.deepStrictEqual(registered.map(entry => ({
				session: entry.session.toString(),
				external: entry.external,
				source: entry.source,
			})), [{ session: external.toString(), external: true, source: 'discovery' }]);
		});

		test('rediscovery advances recency without overwriting durable unread state for an existing external session', async () => {
			const db = new TestSessionDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			const session = AgentSession.uri('copilot', 'rediscovered-external');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			await db.setMetadata(AH_META_IS_READ_DB_KEY, '');
			const rediscoveredModifiedTime = Date.now() + 60_000;

			await (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats(agent, [discoveredChat(session, true, rediscoveredModifiedTime)]);
			const registered = await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.get(session);

			assert.deepStrictEqual({
				isRead: await db.getMetadata(AH_META_IS_READ_DB_KEY),
				modifiedTime: registered?.modifiedTime,
			}, {
				isRead: '',
				modifiedTime: rediscoveredModifiedTime,
			});
		});

		testWithExternalSessionClock('discovery does not ingest external sessions older than 30 days', async () => {
			const day = 24 * 60 * 60 * 1000;
			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const stale = agent.addSession('stale', now - 30 * day - 1);
			const fresh = agent.addSession('fresh', now - 29 * day);
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 1);
			await waitForSessionListReconciliation(svc);
			registerTestAgentProvider(svc, agent);
			await (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats(agent, [
				{ chat: URI.parse(buildDefaultChatUri(stale)), startTime: now - 30 * day - 1, modifiedTime: now - 30 * day - 1, external: true },
				{ chat: URI.parse(buildDefaultChatUri(fresh)), startTime: now - 29 * day, modifiedTime: now - 29 * day, external: true },
			]);

			const listed = (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort();
			const registered = new Set((await svc.getRegisteredSessions()).map(session => session.toString()));

			assert.deepStrictEqual({
				listed,
				registered: [...registered].sort(),
			}, {
				listed: [AgentSession.id(fresh)],
				registered: [fresh.toString()],
			});
			assert.ok(!registered.has(stale.toString()));
		});

		test('defers titling the two most recently updated untitled external sessions until startup settled', async () => {
			const now = Date.now();
			const copilotApiService = new TestCopilotApiService();
			const svc = createExternalSessionService(createPerSessionDataService().service, undefined, copilotApiService);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const oldest = agent.addSession('oldest', now - 3000);
			const middle = agent.addSession('middle', now - 2000);
			const newest = agent.addSession('newest', now - 1000);
			agent.chats.getMessages = async (chat: URI) => [{
				id: 'turn-1',
				state: TurnState.Complete,
				message: { text: `prompt of ${chat.toString()}`, origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			}];
			registerTestAgentProvider(svc, agent);
			await svc.authenticate({
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
				token: 'gh-token',
			});

			await (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats(agent, [
				discoveredChat(oldest, true, now - 3000),
				discoveredChat(middle, true, now - 2000),
				discoveredChat(newest, true, now - 1000),
			]);
			const callsBeforeStartupSettled = copilotApiService.utilityCalls.length;
			await svc.listSessions();
			svc.markStartupComplete();
			// The lane is serialized, so settling implies generation finished: no polling.
			await svc.whenDeferredWorkSettled();

			const titled = [oldest, middle, newest].filter(session => copilotApiService.utilityCalls.some(
				call => call.request.messages.some(message => message.content.includes(`prompt of ${buildDefaultChatUri(session)}`))));
			assert.deepStrictEqual({
				callsBeforeStartupSettled,
				callsAfterSettled: copilotApiService.utilityCalls.length,
				titled: titled.map(session => AgentSession.id(session)),
			}, {
				callsBeforeStartupSettled: 0,
				callsAfterSettled: 2,
				titled: ['middle', 'newest'],
			});
		});

		testWithExternalSessionClock('prune removes stale external sessions but keeps adoptable-legacy sessions', async () => {
			const day = 24 * 60 * 60 * 1000;
			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const stale = agent.addSession('stale-prune', now - 30 * day - 1);
			const staleAdoptable = agent.addSession('stale-adoptable', now - 30 * day - 1, withSessionEhcliAdoptable(undefined));
			const fresh = agent.addSession('fresh-prune', now - 29 * day);
			registerTestAgentProvider(svc, agent);
			const sessionRegistry = (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			await sessionRegistry.register(stale, { provider: 'copilot', startTime: now - 30 * day - 1, source: 'discovery' }, { checkTombstone: true });
			await sessionRegistry.register(staleAdoptable, { provider: 'copilot', startTime: now - 30 * day - 1, source: 'discovery' }, { checkTombstone: true });
			await sessionRegistry.register(fresh, { provider: 'copilot', startTime: now - 30 * day, source: 'discovery' }, { checkTombstone: true });

			await (svc as unknown as { _pruneStaleExternalSessions(): Promise<void> })._pruneStaleExternalSessions();
			const registered = (await sessionRegistry.list()).map(entry => entry.session.toString()).sort();

			assert.deepStrictEqual(registered, [fresh.toString(), staleAdoptable.toString()].sort());
		});

		test('external session mode time boundaries are inclusive', () => {
			const day = 24 * 60 * 60 * 1000;
			const now = Date.UTC(2026, 0, 1);
			const svc = createExternalSessionService();
			const shouldIncludeSession = (svc as unknown as {
				_shouldIncludeSession(session: IAgentSessionMetadata, mode: AgentHostExternalSessionsMode, now: number): boolean;
			})._shouldIncludeSession.bind(svc);
			const metadata = (age: number): IAgentSessionMetadata => ({
				session: AgentSession.uri('copilot', `age-${age}`),
				startTime: now - age,
				modifiedTime: now - age,
				_meta: withSessionExternal(undefined, true),
			});

			assert.deepStrictEqual({
				at24Hours: shouldIncludeSession(metadata(day), AgentHostExternalSessionsMode.Last24Hours, now),
				olderThan24Hours: shouldIncludeSession(metadata(day + 1), AgentHostExternalSessionsMode.Last24Hours, now),
				at7Days: shouldIncludeSession(metadata(7 * day), AgentHostExternalSessionsMode.Last7Days, now),
				olderThan7Days: shouldIncludeSession(metadata(7 * day + 1), AgentHostExternalSessionsMode.Last7Days, now),
				at30Days: shouldIncludeSession(metadata(30 * day), AgentHostExternalSessionsMode.Last30Days, now),
				olderThan30Days: shouldIncludeSession(metadata(30 * day + 1), AgentHostExternalSessionsMode.Last30Days, now),
			}, {
				at24Hours: true,
				olderThan24Hours: false,
				at7Days: true,
				olderThan7Days: false,
				at30Days: true,
				olderThan30Days: false,
			});
		});

		/** An external session two newer local sessions postdate is no longer recent. */
		test('recent drops external sessions that two newer local sessions superseded', () => {
			const hour = 60 * 60 * 1000;
			const at = (hourOfDay: number) => Date.UTC(2026, 0, 1) + hourOfDay * hour;
			const now = at(18);
			const external = (id: string, modifiedTime: number): IAgentSessionMetadata => ({
				session: AgentSession.uri('copilot', id),
				startTime: modifiedTime,
				modifiedTime,
				_meta: withSessionExternal(undefined, true),
			});
			const local = (id: string, startTime: number): IRegisteredSession => ({
				session: AgentSession.uri('copilot', id),
				provider: 'copilot',
				startTime,
				modifiedTime: startTime,
				external: false,
				source: 'restore',
			});
			const catalog = [external('external-morning', at(10)), external('external-afternoon', at(16))];
			// The cutoff is snapshotted per service, so each case needs its own.
			const recentIds = (...locals: IRegisteredSession[]) => {
				const svc = createExternalSessionService() as unknown as {
					_resolveRecentSupersedingCutoff(registered: readonly IRegisteredSession[], epoch: number): number | undefined;
					_getRecentSessionKeys(sessions: readonly IAgentSessionMetadata[], now: number, supersededBefore: number | undefined): ReadonlySet<string>;
					_registryEpoch: number;
				};
				const cutoff = svc._resolveRecentSupersedingCutoff(locals, svc._registryEpoch);
				return [...svc._getRecentSessionKeys(catalog, now, cutoff)].map(key => AgentSession.id(URI.parse(key))).sort();
			};

			assert.deepStrictEqual({
				noLocalSessionsAfter: recentIds(local('local-8am', at(8)), local('local-9am', at(9))),
				oneLocalSessionAfter: recentIds(local('local-11am', at(11))),
				twoLocalSessionsAfterTheMorningOne: recentIds(local('local-11am', at(11)), local('local-5pm', at(17))),
				twoLocalSessionsAfterBoth: recentIds(local('local-5pm', at(17)), local('local-5pm-2', at(17))),
			}, {
				noLocalSessionsAfter: ['external-afternoon', 'external-morning'],
				oneLocalSessionAfter: ['external-afternoon', 'external-morning'],
				twoLocalSessionsAfterTheMorningOne: ['external-afternoon'],
				twoLocalSessionsAfterBoth: [],
			});
		});

		/**
		 * The cutoff reads the registry, not the hydrated listing: a local session
		 * whose provider is unavailable is dropped from the latter, which would
		 * undercount and leave a superseded external row visible.
		 */
		testWithExternalSessionClock('recent counts local sessions the provider cannot hydrate', async () => {
			const hour = 60 * 60 * 1000;
			const now = Date.now();
			const at = (hourOfDay: number) => now - (18 - hourOfDay) * hour;
			const database = new TransientRegistryWriteDatabase();
			for (const [id, startTime] of [['external-morning', at(10)], ['external-afternoon', at(16)]] as const) {
				await database.registerSession(AgentSession.uri('copilot', id).toString(), { provider: 'copilot', startTime, source: 'discovery' }, { checkTombstone: true });
			}
			// Registered under a provider that is never registered with the service.
			for (const [id, startTime] of [['local-11am', at(11)], ['local-5pm', at(17)]] as const) {
				await database.registerSession(AgentSession.uri('claude', id).toString(), { provider: 'claude', startTime, source: 'restore' }, { checkTombstone: true });
			}
			await database.markProviderBackfilled('copilot');

			const svc = createExternalSessionService(createSessionDataService(), database);
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			agent.addSession('external-morning', at(10));
			agent.addSession('external-afternoon', at(16));
			registerTestAgentProvider(svc, agent);

			const listed = await svc.listSessions();

			assert.deepStrictEqual({
				visible: listed.map(session => AgentSession.id(session.session)).sort(),
				cutoffCountedUnhydratedLocals: (svc as unknown as { _recentSupersedingCutoff: number | undefined })._recentSupersedingCutoff === at(11),
			}, {
				visible: ['external-afternoon'],
				cutoffCountedUnhydratedLocals: true,
			});
		});

		/** A stale pass must not freeze its cutoff: the registry changed under it. */
		test('recent does not commit a superseding cutoff computed for a stale registry epoch', () => {
			const at = (hourOfDay: number) => Date.UTC(2026, 0, 1) + hourOfDay * 60 * 60 * 1000;
			const svc = createExternalSessionService() as unknown as {
				_resolveRecentSupersedingCutoff(registered: readonly IRegisteredSession[], epoch: number): number | undefined;
				_hasRecentSupersedingCutoff: boolean;
				_registryEpoch: number;
			};
			const locals: IRegisteredSession[] = [at(11), at(17)].map((startTime, index) => ({
				session: AgentSession.uri('copilot', `local-${index}`),
				provider: 'copilot',
				startTime,
				modifiedTime: startTime,
				external: false,
				source: 'restore',
			}));

			const staleCutoff = svc._resolveRecentSupersedingCutoff(locals, svc._registryEpoch - 1);
			const committedAfterStalePass = svc._hasRecentSupersedingCutoff;
			const currentCutoff = svc._resolveRecentSupersedingCutoff(locals, svc._registryEpoch);

			assert.deepStrictEqual({ staleCutoff, committedAfterStalePass, currentCutoff, committedAfterCurrentPass: svc._hasRecentSupersedingCutoff }, {
				staleCutoff: at(11),
				committedAfterStalePass: false,
				currentCutoff: at(11),
				committedAfterCurrentPass: true,
			});
		});

		/** A first message creates a local session, so the cutoff must not re-measure per listing. */
		testWithExternalSessionClock('recent snapshots the superseding local sessions until the external mode changes', async () => {
			const hour = 60 * 60 * 1000;
			const at = (hourOfDay: number) => Date.now() + hourOfDay * hour - 18 * hour;
			const now = at(18);
			const svc = createExternalSessionService();
			const internals = svc as unknown as {
				_resolveRecentSupersedingCutoff(registered: readonly IRegisteredSession[], epoch: number): number | undefined;
				_getRecentSessionKeys(sessions: readonly IAgentSessionMetadata[], now: number, supersededBefore: number | undefined): ReadonlySet<string>;
				_registryEpoch: number;
			};
			const catalog: IAgentSessionMetadata[] = [
				{ session: AgentSession.uri('copilot', 'external-morning'), startTime: at(10), modifiedTime: at(10), _meta: withSessionExternal(undefined, true) },
				{ session: AgentSession.uri('copilot', 'external-afternoon'), startTime: at(16), modifiedTime: at(16), _meta: withSessionExternal(undefined, true) },
			];
			const locals: IRegisteredSession[] = [];
			const recentIds = () => {
				const cutoff = internals._resolveRecentSupersedingCutoff(locals, internals._registryEpoch);
				return [...internals._getRecentSessionKeys(catalog, now, cutoff)].map(key => AgentSession.id(URI.parse(key))).sort();
			};

			const initial = recentIds();
			for (const id of ['local-first', 'local-second']) {
				locals.push({ session: AgentSession.uri('copilot', id), provider: 'copilot', startTime: at(17), modifiedTime: at(17), external: false, source: 'restore' });
			}
			const afterLocalSessionsCreated = recentIds();
			// Invalidation is synchronous; read before the queued reconciliation re-snapshots.
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 1);
			const afterModeChange = recentIds();
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({ initial, afterLocalSessionsCreated, afterModeChange }, {
				initial: ['external-afternoon', 'external-morning'],
				afterLocalSessionsCreated: ['external-afternoon', 'external-morning'],
				afterModeChange: [],
			});
		});

		testWithExternalSessionClock('filters external sessions in every mode', async () => {
			const day = 24 * 60 * 60 * 1000;
			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			agent.addSession('recent', now);
			agent.addSession('within-24-hours', now - day + day / 2);
			agent.addSession('older-than-24-hours', now - day - 1);
			agent.addSession('within-7-days', now - 7 * day + day / 2);
			agent.addSession('older-than-7-days', now - 7 * day - 1);
			agent.addSession('within-30-days', now - 30 * day + day / 2);
			agent.addSession('older-than-30-days', now - 30 * day - 1);
			registerTestAgentProvider(svc, agent);

			const listedByMode: Record<AgentHostExternalSessionsMode, string[]> = {
				[AgentHostExternalSessionsMode.Recent]: [],
				[AgentHostExternalSessionsMode.None]: [],
				[AgentHostExternalSessionsMode.Last30Days]: [],
				[AgentHostExternalSessionsMode.Last24Hours]: [],
				[AgentHostExternalSessionsMode.Last7Days]: [],
			};
			const listedByDefault = (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort();
			let clientSeq = 1;
			for (const mode of [AgentHostExternalSessionsMode.Recent, AgentHostExternalSessionsMode.None, AgentHostExternalSessionsMode.Last30Days, AgentHostExternalSessionsMode.Last24Hours, AgentHostExternalSessionsMode.Last7Days]) {
				setExternalSessionsMode(svc, mode, clientSeq++);
				await waitForSessionListReconciliation(svc);
				listedByMode[mode] = (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort();
			}

			assert.deepStrictEqual({ listedByDefault, listedByMode }, {
				listedByDefault: [],
				listedByMode: {
					[AgentHostExternalSessionsMode.Recent]: ['recent', 'within-24-hours'],
					[AgentHostExternalSessionsMode.None]: [],
					[AgentHostExternalSessionsMode.Last30Days]: ['older-than-24-hours', 'older-than-7-days', 'recent', 'within-24-hours', 'within-30-days', 'within-7-days'],
					[AgentHostExternalSessionsMode.Last24Hours]: ['recent', 'within-24-hours'],
					[AgentHostExternalSessionsMode.Last7Days]: ['older-than-24-hours', 'recent', 'within-24-hours', 'within-7-days'],
				},
			});
		});

		testWithExternalSessionClock('a mode that hides every external session skips the catalog work for them', async () => {
			const now = Date.now();
			const perSession = createPerSessionDataService();
			const svc = createExternalSessionService(perSession.service);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			agent.addSession('external-one', now);
			agent.addSession('external-two', now);
			registerTestAgentProvider(svc, agent);
			await svc.listSessions(AgentHostExternalSessionsMode.Last30Days);

			// A catalog pass otherwise opens every registered session's database,
			// so a mode that discards the row regardless must not pay for it.
			const opened: string[] = [];
			const dataService = perSession.service as { tryOpenDatabase(session: URI): Promise<unknown> };
			const originalTryOpen = dataService.tryOpenDatabase;
			dataService.tryOpenDatabase = async (session: URI) => {
				opened.push(AgentSession.id(session));
				return originalTryOpen.call(perSession.service, session);
			};
			try {
				const hidden = (await svc.listSessions(AgentHostExternalSessionsMode.None)).map(session => AgentSession.id(session.session));
				const openedWhileHidden = [...new Set(opened)].sort();
				opened.length = 0;
				const visible = (await svc.listSessions(AgentHostExternalSessionsMode.Last30Days)).map(session => AgentSession.id(session.session)).sort();

				assert.deepStrictEqual({ hidden, openedWhileHidden, visible, openedWhileVisible: [...new Set(opened)].sort() }, {
					hidden: [],
					openedWhileHidden: [],
					visible: ['external-one', 'external-two'],
					openedWhileVisible: ['external-one', 'external-two'],
				});
			} finally {
				dataService.tryOpenDatabase = originalTryOpen;
			}
		});

		testWithExternalSessionClock('a mode change reconciles with a single catalog pass', async () => {
			const day = 24 * 60 * 60 * 1000;
			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			agent.addSession('recent', now);
			agent.addSession('yesterday', now - day);
			agent.addSession('last-week', now - 6 * day);
			registerTestAgentProvider(svc, agent);
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 1);
			await waitForSessionListReconciliation(svc);

			// Each `listSessions` is one walk over every registered session's
			// database, so the modes it is asked for are the catalog passes.
			const listedModes: (AgentHostExternalSessionsMode | undefined)[] = [];
			const listSessions = svc.listSessions;
			svc.listSessions = mode => {
				listedModes.push(mode);
				return Reflect.apply(listSessions, svc, [mode]);
			};

			// `Recent` is the mode whose visibility depends on the whole catalog,
			// so it is the one most likely to regress into a second pass.
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 2);
			// Await the transition's own reconciliation: publishing into `Recent`
			// moves summaries, which queues a further pass of its own.
			await (svc as unknown as { _sessionListReconciliation: Promise<void> })._sessionListReconciliation;
			const transitionModes = [...listedModes];
			await waitForSessionListReconciliation(svc);
			svc.listSessions = listSessions;

			assert.deepStrictEqual({
				transitionModes,
				visible: (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort(),
			}, {
				transitionModes: [AgentHostExternalSessionsMode.Last30Days],
				visible: ['recent', 'yesterday'],
			});
		});

		testWithExternalSessionClock('recent replaces the oldest visible external session when a newer session is discovered', async () => {
			const now = Date.now();
			const svc = createExternalSessionService();
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const first = agent.addSession('first', now - 1);
			const second = agent.addSession('second', now - 2);
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			await waitForSessionListReconciliation(svc);

			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${AgentSession.id(URI.parse(notification.summary.resource))}`);
				} else if (notification.type === NotificationType.SessionRemoved) {
					notifications.push(`remove:${AgentSession.id(URI.parse(notification.session))}`);
				}
			}));

			const newest = agent.addSession('newest', now);
			await (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats(agent, [{
				chat: URI.parse(buildDefaultChatUri(newest)),
				startTime: now,
				modifiedTime: now,
				external: true,
			}]);
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				visible: (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort(),
				notifications,
			}, {
				visible: [AgentSession.id(first), AgentSession.id(newest)].sort(),
				notifications: ['add:newest', `remove:${AgentSession.id(second)}`],
			});
		});

		testWithExternalSessionClock('recent re-adds a registry-known external session after restart list visibility rotates', async () => {
			const now = Date.now();
			const database = new TransientRegistryWriteDatabase();
			const first = AgentSession.uri('copilot', 'first');
			const second = AgentSession.uri('copilot', 'second');
			const third = AgentSession.uri('copilot', 'third');
			for (const [session, startTime] of [[first, now - 1], [second, now - 2], [third, now - 3]] as const) {
				await database.registerSession(session.toString(), { provider: 'copilot', startTime, source: 'discovery' }, { checkTombstone: true });
			}
			await database.markProviderBackfilled('copilot');

			const svc = createExternalSessionService(createSessionDataService(), database);
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			agent.addSession('first', now - 1);
			agent.addSession('second', now - 2);
			agent.addSession('third', now - 3);
			registerTestAgentProvider(svc, agent);

			const initiallyListed = await svc.listSessions();
			exposeListedSessions(svc, initiallyListed);
			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${AgentSession.id(URI.parse(notification.summary.resource))}`);
				} else if (notification.type === NotificationType.SessionRemoved) {
					notifications.push(`remove:${AgentSession.id(URI.parse(notification.session))}`);
				}
			}));

			agent.addSession('third', now);
			(svc as unknown as { _queueSessionListReconciliation(): void })._queueSessionListReconciliation();
			await waitForSessionListReconciliation(svc);
			agent.addSession('second', now + 1);
			(svc as unknown as { _queueSessionListReconciliation(): void })._queueSessionListReconciliation();
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				initiallyListed: initiallyListed.map(session => AgentSession.id(session.session)),
				visible: (await svc.listSessions()).map(session => AgentSession.id(session.session)),
				notifications,
			}, {
				initiallyListed: ['first', 'second'],
				visible: ['second', 'third'],
				notifications: ['add:first', 'add:third', 'remove:second', 'add:second', 'remove:first'],
			});
		});

		testWithExternalSessionClock('external discovery reconciles against a mode change that completes while registration is in flight', async () => {
			const now = Date.now();
			const svc = createExternalSessionService();
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();

			const first = agent.addSession('first', now);
			const second = agent.addSession('second', now - 1);
			const third = agent.addSession('third', now - 2);
			const registry = (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			const originalRegister = registry.register.bind(registry);
			const registrationGate = new DeferredPromise<void>();
			let registrationsStarted = 0;
			registry.register = async (session, sessionOptions, registerOptions) => {
				registrationsStarted++;
				await registrationGate.p;
				return originalRegister(session, sessionOptions, registerOptions);
			};

			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${AgentSession.id(URI.parse(notification.summary.resource))}`);
				}
			}));
			const registration = (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats(agent, [
				{ chat: URI.parse(buildDefaultChatUri(first)), startTime: now, modifiedTime: now, external: true },
				{ chat: URI.parse(buildDefaultChatUri(second)), startTime: now - 1, modifiedTime: now - 1, external: true },
				{ chat: URI.parse(buildDefaultChatUri(third)), startTime: now - 2, modifiedTime: now - 2, external: true },
			]);
			for (let attempt = 0; attempt < 20 && registrationsStarted < 3; attempt++) {
				await timeout(0);
			}

			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 2);
			await waitForSessionListReconciliation(svc);
			registrationGate.complete();
			await registration;
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				visible: (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort(),
				notifications: notifications.sort(),
			}, {
				visible: ['first', 'second'],
				notifications: ['add:first', 'add:second'],
			});
		});

		testWithExternalSessionClock('recent reconciles clients when a hidden external session becomes more recent', async () => {
			const now = Date.now();
			const svc = createExternalSessionService();
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Recent, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const first = agent.addSession('first', now - 1);
			const second = agent.addSession('second', now - 2);
			const third = agent.addSession('third', now - 3);
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			await waitForSessionListReconciliation(svc);
			await svc.restoreSession(third);

			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${AgentSession.id(URI.parse(notification.summary.resource))}`);
				} else if (notification.type === NotificationType.SessionRemoved) {
					notifications.push(`remove:${AgentSession.id(URI.parse(notification.session))}`);
				}
			}));

			getStateManager(svc).dispatchServerAction(buildDefaultChatUri(third), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-third',
				startedAt: new Date(now).toISOString(),
				message: { text: 'Update', origin: { kind: MessageKind.User } },
			});
			await timeout(150);
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				visible: (await svc.listSessions()).map(session => AgentSession.id(session.session)).sort(),
				notifications,
			}, {
				visible: [AgentSession.id(first), AgentSession.id(third)].sort(),
				notifications: ['add:third', `remove:${AgentSession.id(second)}`],
			});
		});

		testWithExternalSessionClock('configuration changes add and remove non-live external sessions immediately', async () => {
			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const session = agent.addSession('config-visible', now);
			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${notification.summary.resource}`);
				} else if (notification.type === NotificationType.SessionRemoved) {
					notifications.push(`remove:${notification.session}`);
				}
			}));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			for (let attempt = 0; attempt < 20 && (await svc.getRegisteredSessions()).length === 0; attempt++) {
				await timeout(0);
			}
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.None, 1);
			await waitForSessionListReconciliation(svc);
			notifications.length = 0;

			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 2);
			await waitForSessionListReconciliation(svc);
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.None, 3);
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual(notifications, [`add:${session.toString()}`, `remove:${session.toString()}`]);
		});

		testWithExternalSessionClock('unpublishes and republishes a restored external session as the configured mode changes', async () => {
			const now = Date.now();
			const svc = createExternalSessionService();
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 1);
			await waitForSessionListReconciliation(svc);
			const agent = disposables.add(new TimedExternalAgent('copilot'));
			const session = agent.addSession('restored-external', now);
			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${notification.summary.resource}`);
				} else if (notification.type === NotificationType.SessionRemoved) {
					notifications.push(`remove:${notification.session}`);
				}
			}));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			await svc.restoreSession(session);
			notifications.length = 0;

			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.None, 2);
			await waitForSessionListReconciliation(svc);
			const hidden = (await svc.listSessions()).map(entry => entry.session.toString());
			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 3);
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				hidden,
				visibleAgain: (await svc.listSessions()).map(entry => entry.session.toString()),
				notifications,
			}, {
				hidden: [],
				visibleAgain: [session.toString()],
				notifications: [`remove:${session.toString()}`, `add:${session.toString()}`],
			});
		});

		testWithExternalSessionClock('publishes an external session restored while hidden when the configured mode includes it', async () => {
			class ExternalOnlyAgent extends TimedExternalAgent {
				override async listSessions(): Promise<IAgentSessionMetadata[]> {
					return [];
				}
			}

			const now = Date.now();
			const svc = createExternalSessionService();
			const agent = disposables.add(new ExternalOnlyAgent('copilot'));
			const session = agent.addSession('hidden-then-restored', now);
			const notifications: string[] = [];
			disposables.add(svc.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionAdded) {
					notifications.push(`add:${notification.summary.resource}`);
				}
			}));

			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.None, 1);
			await waitForSessionListReconciliation(svc);
			registerTestAgentProvider(svc, agent);
			assert.deepStrictEqual(await svc.listSessions(), []);
			agent.fireDiscoveredChats([discoveredChat(session)]);
			for (let attempt = 0; attempt < 20 && (await svc.getRegisteredSessions()).length === 0; attempt++) {
				await timeout(0);
			}
			await svc.restoreSession(session);
			notifications.length = 0;

			setExternalSessionsMode(svc, AgentHostExternalSessionsMode.Last30Days, 2);
			await waitForSessionListReconciliation(svc);

			assert.deepStrictEqual({
				visible: (await svc.listSessions()).map(entry => entry.session.toString()),
				notifications,
			}, {
				visible: [session.toString()],
				notifications: [`add:${session.toString()}`],
			});
		});

		test('discovery registration preserves provider-supplied internal provenance', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();

			const session = AgentSession.uri('copilot', 'provider-internal');
			agent.fireDiscoveredChats([discoveredChat(session, false)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}

			assert.deepStrictEqual(
				(await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list()).map(entry => ({
					session: entry.session.toString(),
					external: entry.external,
					source: entry.source,
				})),
				[{ session: session.toString(), external: false, source: 'restore' }],
			);
		});

		test('discovery announces a registered session with provider metadata intact', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			await svc.listSessions();

			const session = AgentSession.uri('copilot', 'provider-announced');
			agent.fireDiscoveredChats([{
				...discoveredChat(session, false),
				summary: 'Provider chat',
				_meta: withSessionEhcliAdoptable(undefined),
			}]);
			for (let i = 0; i < 50 && !getStateManager(svc).getSurfacedSessionSummary(session.toString()); i++) {
				await timeout(0);
			}

			const surfaced = getStateManager(svc).getSurfacedSessionSummary(session.toString());
			assert.deepStrictEqual({
				resource: surfaced?.resource,
				title: surfaced?.title,
				external: readSessionExternal(surfaced?._meta),
				adoptable: readSessionEhcliAdoptable(surfaced?._meta),
			}, {
				resource: session.toString(),
				title: 'Provider chat',
				external: false,
				adoptable: true,
			});
		});

		test('an adoptable chat retracted by disabling migration is re-surfaced when it is re-enabled', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			await svc.listSessions();

			const session = AgentSession.uri('copilot', 'toggled-adoptable');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			agent.fireDiscoveredChats([{ ...discoveredChat(session, false), _meta: withSessionEhcliAdoptable(undefined) }]);
			for (let i = 0; i < 50 && !getStateManager(svc).getSurfacedSessionSummary(session.toString()); i++) {
				await timeout(0);
			}
			const afterFirstEnable = !!getStateManager(svc).getSurfacedSessionSummary(session.toString());

			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: false });
			await timeout(0);
			const whileDisabled = !!getStateManager(svc).getSurfacedSessionSummary(session.toString());

			// Discovery skips chats already in the registry, so re-enabling must restore
			// them from the registry rather than waiting for another discovery pass.
			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			for (let i = 0; i < 50 && !getStateManager(svc).getSurfacedSessionSummary(session.toString()); i++) {
				await timeout(0);
			}

			assert.deepStrictEqual(
				{ afterFirstEnable, whileDisabled, afterReEnable: !!getStateManager(svc).getSurfacedSessionSummary(session.toString()) },
				{ afterFirstEnable: true, whileDisabled: false, afterReEnable: true },
			);
		});

		test('rediscovering a registered chat with different provenance performs no per-session database I/O', async () => {
			const perSession = createPerSessionDataService();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const session = AgentSession.uri('copilot', 'known-discovered');
			const register = (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats.bind(svc);
			await register(agent, [discoveredChat(session)]);

			const opened: string[] = [];
			const service = perSession.service as { tryOpenDatabase(session: URI): Promise<unknown> };
			const originalTryOpen = service.tryOpenDatabase;
			service.tryOpenDatabase = async (s: URI) => {
				opened.push(s.toString());
				return originalTryOpen.call(perSession.service, s);
			};
			try {
				const changed = await register(agent, [discoveredChat(session, false)]);

				assert.deepStrictEqual({ changed, opened }, { changed: false, opened: [] });
			} finally {
				service.tryOpenDatabase = originalTryOpen;
			}
		});

		test('the known-sessions filter reports registered sessions only, leaving tombstones to registration', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const registered = AgentSession.uri('copilot', 'filter-registered');
			const deleted = AgentSession.uri('copilot', 'filter-deleted');
			const unknown = AgentSession.uri('copilot', 'filter-unknown');
			const register = (svc as unknown as { _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> })._registerDiscoveredChats.bind(svc);
			await register(agent, [discoveredChat(registered), discoveredChat(deleted)]);
			await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.tombstone(deleted);

			const known = await (svc as unknown as { _filterKnownSessions(sessions: readonly URI[]): Promise<ReadonlySet<string>> })._filterKnownSessions([registered, deleted, unknown]);
			const reRegistered = await register(agent, [discoveredChat(deleted)]);

			assert.deepStrictEqual({
				known: [...known],
				reRegistered,
				sessions: (await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list()).map(entry => entry.session.toString()),
			}, {
				known: [registered.toString()],
				reRegistered: false,
				sessions: [registered.toString()],
			});
		});

		test('concurrent listSessions calls share one computation and never share their result array', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.createSession({ provider: 'copilot' });
			let computations = 0;
			const inner = svc as unknown as { _computeSessions(mode: AgentHostExternalSessionsMode): Promise<readonly IAgentSessionMetadata[]> };
			const original = inner._computeSessions;
			inner._computeSessions = async mode => {
				computations++;
				return original.call(svc, mode);
			};

			const [first, second] = await Promise.all([svc.listSessions(), svc.listSessions()]);
			const sharedComputations = computations;
			first.length = 0;
			const third = await svc.listSessions();

			assert.deepStrictEqual({
				sharedComputations,

				computations,
				secondIntact: second.length,
				thirdIntact: third.length,
				distinctArrays: first !== second,
			}, {
				sharedComputations: 1,
				computations: 2,
				secondIntact: 1,
				thirdIntact: 1,
				distinctArrays: true,
			});
		});

		test('a registry mutation during an in-flight list is not served from the shared computation', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			const snapshotCaptured = new DeferredPromise<void>();
			const releaseSnapshot = new DeferredPromise<void>();
			const inner = svc as unknown as { _listRegisteredSessions(): Promise<IRegisteredSession[]> };
			const original = inner._listRegisteredSessions;
			let listCalls = 0;
			inner._listRegisteredSessions = async () => {
				const snapshot = await original.call(svc);
				listCalls++;
				if (listCalls === 1) {
					snapshotCaptured.complete();
					await releaseSnapshot.p;
				}
				return snapshot;
			};

			const listing = svc.listSessions();
			await snapshotCaptured.p;
			await svc.createSession({ provider: 'copilot' });
			releaseSnapshot.complete();
			const listed = await listing;

			assert.deepStrictEqual({
				listCalls,
				listed: listed.length,
			}, {
				listCalls: 2,
				listed: 1,
			});
		});

		test('provider registration invalidates an in-flight list computation', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const gate = new DeferredPromise<void>();
			const inner = svc as unknown as { _computeSessions(mode: AgentHostExternalSessionsMode): Promise<readonly IAgentSessionMetadata[]> };
			const original = inner._computeSessions;
			let computations = 0;
			inner._computeSessions = async mode => {
				computations++;
				await gate.p;
				return original.call(svc, mode);
			};

			const beforeRegistration = svc.listSessions();
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const afterRegistration = svc.listSessions();
			gate.complete();
			await Promise.all([beforeRegistration, afterRegistration]);

			assert.strictEqual(computations, 2);
		});

		test('explicitly created sessions are registered as non-external', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			assert.deepStrictEqual(
				(await (service as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list()).map(entry => ({
					session: entry.session.toString(),
					external: entry.external,
				})),
				[{ session: session.toString(), external: false }],
			);
		});

		test('legacy migration and external discovery use separate provider catalogs and signals', async () => {
			class SeparateCatalogAgent extends MockAgent {
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				externalCalls = 0;
				legacyCalls = 0;

				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.externalCalls++;
					return [{ chat: URI.parse(buildDefaultChatUri(external)), startTime: Date.now(), modifiedTime: Date.now() }];
				}

				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					this.legacyCalls++;
					return [{ chat: URI.parse(buildDefaultChatUri(legacy)), startTime: Date.now(), modifiedTime: Date.now() }];
				}

				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }

				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}

			const external = AgentSession.uri('copilot', 'external-catalog');
			const legacy = AgentSession.uri('copilot', 'legacy-catalog');
			const sessionData = createPerSessionDataService();
			await sessionData.database(legacy).setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'false');
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SeparateCatalogAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();

			const initial = await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list();
			assert.deepStrictEqual(initial.map(entry => ({
				session: entry.session.toString(),
				external: entry.external,
				source: entry.source,
			})).sort((a, b) => a.session.localeCompare(b.session)), [
				{ session: external.toString(), external: true, source: 'discovery' },
				{ session: legacy.toString(), external: false, source: 'restore' },
			].sort((a, b) => a.session.localeCompare(b.session)));

			agent.fireDiscoveredChats([discoveredChat(external)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length < 2; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual({ externalCalls: agent.externalCalls, legacyCalls: agent.legacyCalls }, { externalCalls: 1, legacyCalls: 1 });

			agent.fireDiscoveredChats([discoveredChat(legacy)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length < 2; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual({ externalCalls: agent.externalCalls, legacyCalls: agent.legacyCalls }, { externalCalls: 1, legacyCalls: 1 });
		});

		test('one invalid discovered chat does not block sibling registration', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			const invalid = AgentSession.uri('copilot', 'invalid-discovered');
			const valid = AgentSession.uri('copilot', 'valid-discovered');
			const internals = svc as unknown as { _isChatBacking(session: URI): Promise<boolean> };
			const originalIsChatBacking = internals._isChatBacking.bind(svc);
			internals._isChatBacking = async session => {
				if (session.toString() === invalid.toString()) {
					throw new Error('invalid backing');
				}
				return originalIsChatBacking(session);
			};

			agent.fireDiscoveredChats([discoveredChat(invalid), discoveredChat(valid)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}

			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(session => session.toString()), [valid.toString()]);
		});

		test('failed discovery announcement releases its deduplication reservation', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			const session = AgentSession.uri('copilot', 'announcement-retry');
			const registry = (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			const originalIsTombstoned = registry.isTombstoned.bind(registry);
			let fail = true;
			registry.isTombstoned = async candidate => {
				if (fail && candidate.toString() === session.toString()) {
					fail = false;
					throw new Error('transient tombstone read failure');
				}
				return originalIsTombstoned(candidate);
			};

			agent.fireDiscoveredChats([discoveredChat(session, false)]);
			for (let i = 0; i < 50 && fail; i++) {
				await timeout(0);
			}
			assert.strictEqual(getStateManager(svc).getSurfacedSessionSummary(session.toString()), undefined);

			await (svc as unknown as { _announceSurfacedSession(meta: IAgentSessionMetadata, provider: string): Promise<void> })._announceSurfacedSession({
				session,
				startTime: Date.now(),
				modifiedTime: Date.now(),
			}, agent.id);
			assert.strictEqual(getStateManager(svc).getSurfacedSessionSummary(session.toString())?.resource, session.toString());
		});

		test('migration candidates derive provenance from the workspaceless marker', async () => {
			class MixedMigrationAgent extends MockAgent {
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					return [
						{ chat: URI.parse(buildDefaultChatUri(restored)), startTime: Date.now(), modifiedTime: Date.now() },
						{ chat: URI.parse(buildDefaultChatUri(external)), startTime: Date.now(), modifiedTime: Date.now() },
					];
				}
			}

			const restored = AgentSession.uri('copilot', 'migration-restored');
			const external = AgentSession.uri('copilot', 'migration-external');
			const sessionData = createPerSessionDataService();
			await sessionData.database(restored).setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, disposables.add(new MixedMigrationAgent('copilot')));
			await svc.listSessions();

			const registered = await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list();
			assert.deepStrictEqual(registered.map(entry => ({
				session: entry.session.toString(),
				external: entry.external,
				source: entry.source,
			})).sort((a, b) => a.session.localeCompare(b.session)), [
				{ session: restored.toString(), external: false, source: 'restore' },
				{ session: external.toString(), external: true, source: 'discovery' },
			].sort((a, b) => a.session.localeCompare(b.session)));
		});

		test('legacy registry rows without provenance are classified and persisted', async () => {
			const internal = AgentSession.uri('copilot', 'legacy-internal');
			const external = AgentSession.uri('claude', 'legacy-external');
			const database = new TransientRegistryWriteDatabase();
			database.addSessionWithoutExternal({ session: internal.toString(), provider: 'copilot', startTime: 1, modifiedTime: 1, external: false, source: 'explicit' });
			database.addSessionWithoutExternal({ session: external.toString(), provider: 'claude', startTime: 2, modifiedTime: 2, external: false, source: 'explicit' });
			const sessionData = createPerSessionDataService();
			await sessionData.database(internal).setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'false');
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, database));

			await svc.getRegisteredSessions();
			await svc.getRegisteredSessions();

			assert.deepStrictEqual({
				listCalls: database.undefinedExternalListCalls,
				updates: database.externalUpdates,
			}, {
				listCalls: 2,
				updates: [
					{ session: internal.toString(), external: false },
					{ session: external.toString(), external: true },
				],
			});
		});

		test('real v1 registry rows retain undefined provenance until service migration', async () => {
			const directory = mkdtempSync(join(tmpdir(), 'agent-host-registry-'));
			const path = join(directory, 'agent-host.db');
			let legacyDatabase: Database | undefined;
			let database: AgentHostDatabase | undefined;
			try {
				const sqlite3 = await import('@vscode/sqlite3');
				legacyDatabase = await new Promise<Database>((resolve, reject) => {
					const opened = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(opened));
				});
				await new Promise<void>((resolve, reject) => legacyDatabase!.exec(`
					CREATE TABLE sessions (
						session_uri TEXT PRIMARY KEY NOT NULL,
						provider TEXT NOT NULL,
						start_time INTEGER NOT NULL
					);
					CREATE TABLE metadata (
						key TEXT PRIMARY KEY NOT NULL,
						value TEXT NOT NULL
					);
					INSERT INTO sessions (session_uri, provider, start_time) VALUES ('copilot:/legacy-real-database', 'copilot', 1);
					PRAGMA user_version = 1;
				`, error => error ? reject(error) : resolve()));
				await new Promise<void>((resolve, reject) => legacyDatabase!.close(error => error ? reject(error) : resolve()));
				legacyDatabase = undefined;

				database = new AgentHostDatabase(path);
				const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, database));
				const agent = disposables.add(new MockAgent('copilot'));
				agent.sessionMetadataOverrides = { startTime: 1, modifiedTime: 1 };
				const session = AgentSession.uri('copilot', 'legacy-real-database');
				(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
				registerTestAgentProvider(svc, agent);
				await svc.getRegisteredSessions();
				await svc.restoreSession(session);
				const entries = await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list();

				assert.deepStrictEqual(entries.map(entry => ({
					startTime: entry.startTime,
					modifiedTime: entry.modifiedTime,
					external: entry.external,
					source: entry.source,
				})), [{ startTime: 1, modifiedTime: 1, external: true, source: 'discovery' }]);
			} finally {
				if (legacyDatabase) {
					await new Promise<void>(resolve => legacyDatabase!.close(() => resolve()));
				}
				await database?.close();
				await rm(directory, { recursive: true, force: true });
			}
		});

		test('list refreshes do not rescan a provider catalog or prune a discovered session', async () => {
			class CountingAgent extends MockAgent {
				listExternalChatsCalls = 0;
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listExternalChatsCalls++;
					return super.listExternalChats();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new CountingAgent('copilot'));
			const native = AgentSession.uri('copilot', 'native-disappeared');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(native), native);
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();

			(agent as unknown as { _sessions: Map<string, URI> })._sessions.delete(AgentSession.id(native));
			await svc.listSessions();

			assert.deepStrictEqual(
				(await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.list()).map(entry => ({
					session: entry.session.toString(),
					external: entry.external,
				})),
				[{ session: native.toString(), external: true }],
			);
			assert.strictEqual(agent.listExternalChatsCalls, 1, 'ordinary list refreshes must not re-enumerate the provider');
		});

		test('concurrent listSessions calls share one registry discovery pass', async () => {
			const gate = new DeferredPromise<void>();
			class GatedListAgent extends MockAgent {
				override readonly onDidDiscoverChats = Event.None;
				listCalls = 0;
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					this.listCalls++;
					await gate.p;
					return super.listExternalChats();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new GatedListAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const legacy = AgentSession.uri('copilot', 'legacy-concurrent');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);

			const first = svc.listSessions();
			const second = svc.listSessions();
			for (let i = 0; i < 20 && agent.listCalls === 0; i++) {
				await timeout(0);
			}
			gate.complete();

			const [firstResult, secondResult] = await Promise.all([first, second]);
			assert.deepStrictEqual({
				listCalls: agent.listCalls,
				first: firstResult.map(session => session.session.toString()),
				second: secondResult.map(session => session.session.toString()),
			}, {
				listCalls: 1,
				first: [legacy.toString()],
				second: [legacy.toString()],
			});
		});

		test('a readiness signal retries provider-native discovery after a transient provider failure', async () => {
			class TransientListFailureAgent extends MockAgent {
				private _failList = true;
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;

				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					if (this._failList) {
						this._failList = false;
						throw new Error('transient list failure');
					}
					return super.listExternalChats();
				}

				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void {
					this._onDidDiscoverChats.fire(chats);
				}

				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const db = new TestSessionDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new TransientListFailureAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const legacy = AgentSession.uri('copilot', 'legacy-session');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);

			// A provider failure is logged and swallowed, not thrown: it must
			// never hide sessions the registry already has from other providers.
			assert.deepStrictEqual(await svc.listSessions(), []);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			agent.fireDiscoveredChats([discoveredChat(legacy)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual((await svc.listSessions()).map(session => session.session.toString()), [legacy.toString()]);
			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(session => session.toString()), [legacy.toString()]);
		});

		test('a late-registered provider gets its own native discovery pass', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const early = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, early);

			// Run discovery for the first provider before the second registers.
			await svc.listSessions();

			const late = disposables.add(new MockAgent('claude'));
			const legacy = AgentSession.uri('claude', 'legacy-late');
			(late as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			registerTestAgentProvider(svc, late);

			// A subsequent listSessions call awaits the late provider's own
			// discovery pass alongside the already-registered provider.
			const listed = new Set((await svc.listSessions()).map(s => s.session.toString()));
			assert.deepStrictEqual(listed, new Set([legacy.toString()]));

			const registered = new Set((await svc.getRegisteredSessions()).map(s => s.toString()));
			assert.deepStrictEqual(registered, new Set([legacy.toString()]));
		});

		test('a provider whose native catalog gains a chat is discovered on its chat-list-changed signal', async () => {
			class LateEnumerableAgent extends MockAgent {
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				listExternalChatsCalls = 0;

				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listExternalChatsCalls++;
					return super.listExternalChats();
				}

				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void {
					this._onDidDiscoverChats.fire(chats);
				}

				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LateEnumerableAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			// The first discovery completes with no native chats.
			await svc.listSessions();
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);
			assert.strictEqual(await svc.isProviderRegistryBackfilled('copilot'), true);

			// The provider's native catalog now has a session and reports the change.
			const legacy = AgentSession.uri('copilot', 'legacy-became-enumerable');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			agent.fireDiscoveredChats([discoveredChat(legacy)]);

			// Wait for the fire-and-forget forced re-sweep triggered by the signal.
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}

			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(s => s.toString()), [legacy.toString()]);
			assert.strictEqual(agent.listExternalChatsCalls, 1, 'event payload ingestion must not re-enumerate the provider');
		});

		test('surfaces registered adoptable legacy metadata directly from the provider catalog', async () => {
			class AdoptableLegacyAgent extends MockAgent {
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					return this.listExternalChats();
				}

				override async getChatMetadata(): Promise<IAgentChatMetadata | undefined> {
					return undefined;
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new AdoptableLegacyAgent('copilot'));
			const legacy = AgentSession.uri('copilot', 'adoptable-legacy');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			agent.sessionMetadataOverrides = { _meta: withSessionEhcliAdoptable(undefined) };
			registerTestAgentProvider(svc, agent);
			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			await svc.listSessions();

			const surfaced = getStateManager(svc).getSurfacedSessionSummary(legacy.toString());
			assert.deepStrictEqual({
				resource: surfaced?.resource,
				provider: surfaced?.provider,
				adoptable: readSessionEhcliAdoptable(surfaced?._meta),
			}, {
				resource: legacy.toString(),
				provider: 'copilot',
				adoptable: true,
			});
		});

		test('does not surface a discovered session that was already deleted', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			const legacy = AgentSession.uri('copilot', 'deleted-adoptable-legacy');
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();
			await (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry.tombstone(legacy);
			agent.fireDiscoveredChats([{
				...discoveredChat(legacy),
				_meta: withSessionEhcliAdoptable(undefined),
			}]);
			await timeout(0);

			assert.strictEqual(getStateManager(svc).getSurfacedSessionSummary(legacy.toString()), undefined);
		});

		test('registry discovery retains one provider despite another provider failing', async () => {
			class CountingAgent extends MockAgent {
				listExternalChatsCalls = 0;
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listExternalChatsCalls++;
					return super.listExternalChats();
				}
			}
			class FailingThenRecoveringAgent extends MockAgent {
				private _fail = true;
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				stopFailing(): void { this._fail = false; }
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					if (this._fail) {
						throw new Error('provider B enumeration failed');
					}
					return super.listExternalChats();
				}
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const providerA = disposables.add(new CountingAgent('copilot'));
			const providerB = disposables.add(new FailingThenRecoveringAgent('other'));

			const legacyA = AgentSession.uri('copilot', 'legacy-a');
			(providerA as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacyA), legacyA);
			const legacyB = AgentSession.uri('other', 'legacy-b');
			(providerB as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacyB), legacyB);
			registerTestAgentProvider(svc, providerA);
			registerTestAgentProvider(svc, providerB);

			// One provider failing must never hide sessions already registered
			// (or registerable in the same sweep) by another provider.
			assert.deepStrictEqual((await svc.listSessions()).map(s => s.session.toString()), [legacyA.toString()]);

			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(s => s.toString()), [legacyA.toString()]);

			providerB.stopFailing();
			providerB.fireDiscoveredChats([discoveredChat(legacyB)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length < 2; i++) {
				await timeout(0);
			}
			const registered = new Set((await svc.listSessions()).map(s => s.session.toString()));
			assert.deepStrictEqual(registered, new Set([legacyA.toString(), legacyB.toString()]));

			// Provider A has no readiness change, so it is not re-enumerated
			// merely because the aggregate session list refreshed.
			assert.strictEqual(providerA.listExternalChatsCalls, 1);
		});

		test('a provider that cannot enumerate yet (undefined) retries on its readiness signal', async () => {
			// `undefined` from `listExternalChats` means "cannot enumerate yet"
			// (e.g. SDK not downloaded), not an authoritative "no legacy
			// chats" — a later discovery pass must retry it.
			//
			// `MockAgent.listExternalChats` predates the `| undefined` contract
			// (see `IAgent.listExternalChats`), so the override is monkey-patched
			// onto the instance rather than declared on a subclass to avoid a
			// narrowing conflict with the base class's declared return type.
			class NotYetEnumerableAgent extends MockAgent {
				enumerable = false;
				listExternalChatsCalls = 0;
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new NotYetEnumerableAgent('copilot'));
			const originalListExternalChats = agent.listExternalChats.bind(agent);
			(agent as unknown as { listExternalChats: () => Promise<readonly IAgentChatMetadata[] | undefined> }).listExternalChats = async () => {
				agent.listExternalChatsCalls++;
				if (!agent.enumerable) {
					return undefined;
				}
				return originalListExternalChats();
			};
			registerTestAgentProvider(svc, agent);
			const legacy = AgentSession.uri('copilot', 'legacy-not-yet-enumerable');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);

			assert.deepStrictEqual(await svc.listSessions(), []);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			// The provider's SDK becomes available and requests a retry.
			agent.enumerable = true;
			agent.fireDiscoveredChats([discoveredChat(legacy)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual((await svc.listSessions()).map(s => s.session.toString()), [legacy.toString()]);
			assert.strictEqual(agent.listExternalChatsCalls, 1);
		});

		test('a deferred provider does not block healthy listings and migrates when discovery signals readiness', async () => {
			class CatalogAgent extends MockAgent {
				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[]> {
					return this.listExternalChats();
				}
			}
			class DeferredCatalogAgent extends MockAgent {
				ready = false;
				catalogCalls = 0;
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;

				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | typeof AgentChatMigrationDeferred> {
					this.catalogCalls++;
					return this.ready ? this.listExternalChats() : AgentChatMigrationDeferred;
				}

				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void {
					this._onDidDiscoverChats.fire(chats);
				}

				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}

			const db = new TransientRegistryWriteDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const healthy = disposables.add(new CatalogAgent('copilot'));
			const deferred = disposables.add(new DeferredCatalogAgent('claude'));
			const healthySession = AgentSession.uri('copilot', 'healthy');
			const deferredSession = AgentSession.uri('claude', 'deferred');
			(healthy as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(healthySession), healthySession);
			registerTestAgentProvider(svc, healthy);
			registerTestAgentProvider(svc, deferred);

			const listedWhileDeferred = (await svc.listSessions()).map(session => session.session.toString());
			const markerWhileDeferred = await db.isProviderBackfilled('claude');
			assert.deepStrictEqual({ listedWhileDeferred, markerWhileDeferred }, {
				listedWhileDeferred: [healthySession.toString()],
				markerWhileDeferred: false,
			});

			deferred.ready = true;
			(deferred as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(deferredSession), deferredSession);
			deferred.fireDiscoveredChats([discoveredChat(deferredSession)]);
			for (let i = 0; i < 50 && !(await db.isProviderBackfilled('claude')); i++) {
				await timeout(0);
			}

			assert.deepStrictEqual({
				markerAfterReadiness: await db.isProviderBackfilled('claude'),
				catalogCalls: deferred.catalogCalls,
				listedAfterReadiness: (await svc.listSessions()).map(session => session.session.toString()).sort(),
			}, {
				markerAfterReadiness: true,
				catalogCalls: 2,
				listedAfterReadiness: [deferredSession.toString(), healthySession.toString()].sort(),
			});
		});

		test('a failed deferred migration remains retryable on the next list refresh', async () => {
			class DeferredCatalogAgent extends MockAgent {
				ready = false;
				catalogCalls = 0;

				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | typeof AgentChatMigrationDeferred> {
					this.catalogCalls++;
					return this.ready ? this.listExternalChats() : AgentChatMigrationDeferred;
				}
			}

			const db = new TransientRegistryWriteDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new DeferredCatalogAgent('claude'));
			const session = AgentSession.uri('claude', 'retry-after-write-failure');
			registerTestAgentProvider(svc, agent);

			assert.deepStrictEqual(await svc.listSessions(), []);

			agent.ready = true;
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			db.failRegistryWrites(1);
			await assert.rejects(svc.listSessions(), /transient registry write failure/);

			assert.deepStrictEqual({
				markerAfterFailure: await db.isProviderBackfilled('claude'),
				listedAfterRetry: (await svc.listSessions()).map(candidate => candidate.session.toString()),
				markerAfterRetry: await db.isProviderBackfilled('claude'),
				catalogCalls: agent.catalogCalls,
			}, {
				markerAfterFailure: false,
				listedAfterRetry: [session.toString()],
				markerAfterRetry: true,
				catalogCalls: 3,
			});
		});

		test('listSessions rejects an unavailable catalog and retries it on the next call', async () => {
			class NotYetMigratableAgent extends MockAgent {
				override readonly onDidDiscoverChats = Event.None;
				migrationCalls = 0;
				enumerable = false;
			}
			const db = new TransientRegistryWriteDatabase();
			const existing = AgentSession.uri('copilot', 'existing-before-unavailable');
			await db.registerSession(existing.toString(), { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			const writesBeforeUnavailable = db.registryWriteAttempts;
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new NotYetMigratableAgent('copilot'));
			const legacy = AgentSession.uri('copilot', 'legacy-migration-not-ready');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(existing), existing);
			(agent as unknown as { listChatsToMigrate: () => Promise<readonly IAgentChatMetadata[] | undefined> }).listChatsToMigrate = async () => {
				agent.migrationCalls++;
				return agent.enumerable
					? [{ chat: URI.parse(buildDefaultChatUri(legacy)), startTime: Date.now(), modifiedTime: Date.now() }]
					: undefined;
			};
			registerTestAgentProvider(svc, agent);
			await assert.rejects(svc.listSessions(), error => {
				assert.ok(error instanceof Error);
				const provider = Object.entries(error).find(([key]) => key === 'provider')?.[1];
				assert.deepStrictEqual({
					name: error.name,
					provider,
				}, {
					name: 'ProviderCatalogUnavailableError',
					provider: 'copilot',
				});
				return true;
			});
			const callsAfterFailure = agent.migrationCalls;
			assert.deepStrictEqual({
				registryWrites: db.registryWriteAttempts,
				registered: (await svc.getRegisteredSessions()).map(session => session.toString()),
			}, {
				registryWrites: writesBeforeUnavailable,
				registered: [existing.toString()],
			});

			agent.enumerable = true;
			const listed = await svc.listSessions();
			assert.deepStrictEqual({
				retriedBeforeFailure: callsAfterFailure > 1,
				retriedAfterFailure: agent.migrationCalls > callsAfterFailure,
				listed: listed.map(session => session.session.toString()).sort(),
			}, {
				retriedBeforeFailure: true,
				retriedAfterFailure: true,
				listed: [existing.toString(), legacy.toString()].sort(),
			});
		});

		test('a failed listing does not settle startup, so deferred work waits for a served one', async () => {
			class UnavailableCatalogAgent extends MockAgent {
				override readonly onDidDiscoverChats = Event.None;
				enumerable = false;
				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | undefined> {
					return this.enumerable ? [] : undefined;
				}
			}
			const svc = createExternalSessionService();
			const agent = disposables.add(new UnavailableCatalogAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			svc.markStartupComplete();

			await assert.rejects(svc.listSessions());
			let deferredWorkSettled = false;
			void svc.whenDeferredWorkSettled().then(() => { deferredWorkSettled = true; });
			// Ample turns for the gated maintenance to run if the gate were open.
			for (let i = 0; i < 50; i++) {
				await timeout(0);
			}
			const settledByFailedListing = deferredWorkSettled;

			agent.enumerable = true;
			await svc.listSessions();
			await svc.whenDeferredWorkSettled();

			assert.deepStrictEqual({ settledByFailedListing, settledAfterServedListing: deferredWorkSettled }, {
				settledByFailedListing: false,
				settledAfterServedListing: true,
			});
		});

		test('overlapping mode computations share ownership of a replacement migration retry', async () => {
			const retryGate = new DeferredPromise<void>();
			class SingleFlightRetryAgent extends MockAgent {
				catalogCalls = 0;
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[] | undefined> {
					this.catalogCalls++;
					if (this.catalogCalls === 1) {
						return undefined;
					}
					await retryGate.p;
					return [];
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SingleFlightRetryAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			for (let i = 0; i < 20 && agent.catalogCalls === 0; i++) {
				await timeout(0);
			}

			const last30Days = svc.listSessions(AgentHostExternalSessionsMode.Last30Days);
			const recent = svc.listSessions(AgentHostExternalSessionsMode.Recent);
			for (let i = 0; i < 20 && agent.catalogCalls < 2; i++) {
				await timeout(0);
			}
			assert.strictEqual(agent.catalogCalls, 2, 'overlapping computations must share the replacement retry');
			retryGate.complete();
			await Promise.all([last30Days, recent]);
			assert.strictEqual(agent.catalogCalls, 2, 'a losing caller must await the installed retry instead of queueing another');
		});

		test('concurrent aggregate listings retry only the unavailable provider', async () => {
			class CatalogAgent extends MockAgent {
				catalogCalls = 0;
				available = true;
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[] | undefined> {
					this.catalogCalls++;
					return this.available
						? this.listExternalChats()
						: undefined;
				}
			}
			const db = new TransientRegistryWriteDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			const copilot = disposables.add(new CatalogAgent('copilot'));
			const claude = disposables.add(new CatalogAgent('claude'));
			const copilotSession = AgentSession.uri('copilot', 'complete-provider');
			const claudeSession = AgentSession.uri('claude', 'unavailable-provider');
			(copilot as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(copilotSession), copilotSession);
			(claude as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(claudeSession), claudeSession);
			claude.available = false;
			registerTestAgentProvider(svc, copilot);
			registerTestAgentProvider(svc, claude);

			await assert.rejects(Promise.all([svc.listSessions(), svc.listSessions()]), /cannot enumerate its native session catalog yet/);
			const callsAfterFailure = { copilot: copilot.catalogCalls, claude: claude.catalogCalls };
			claude.available = true;
			const [first, second] = await Promise.all([svc.listSessions(), svc.listSessions()]);

			assert.deepStrictEqual({
				callsAfterFailure,
				finalCalls: { copilot: copilot.catalogCalls, claude: claude.catalogCalls },
				backfilled: {
					copilot: await db.isProviderBackfilled('copilot'),
					claude: await db.isProviderBackfilled('claude'),
				},
				first: first.map(session => session.session.toString()).sort(),
				second: second.map(session => session.session.toString()).sort(),
			}, {
				callsAfterFailure: { copilot: 1, claude: 2 },
				finalCalls: { copilot: 1, claude: 3 },
				backfilled: { copilot: true, claude: true },
				first: [claudeSession.toString(), copilotSession.toString()].sort(),
				second: [claudeSession.toString(), copilotSession.toString()].sort(),
			});
		});

		test('a discovery payload arriving while the initial sweep is in flight is registered without re-enumeration', async () => {
			// The bug this guards: a `force` request that arrived while a
			// non-forced sweep was already running used to share that
			// in-flight promise and return its (possibly stale) result,
			// silently swallowing the force intent instead of re-reading the
			// provider's on-disk set fresh.
			const gate = new DeferredPromise<void>();
			class GatedListAgent extends MockAgent {
				listCalls = 0;
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listCalls++;
					// Snapshot before gating so the first sweep reflects what
					// the provider could enumerate at the time it was called,
					// not whatever has since been added while it was stalled.
					const snapshot = await super.listExternalChats();
					if (this.listCalls === 1) {
						await gate.p;
						return snapshot;
					}
					return snapshot;
				}
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new GatedListAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			// Start the first (non-forced) sweep and let it stall inside
			// `listExternalChats` before it can see any sessions.
			const first = svc.listSessions();
			for (let i = 0; i < 20 && agent.listCalls === 0; i++) {
				await timeout(0);
			}
			assert.strictEqual(agent.listCalls, 1);

			// While the first sweep is still gated, a session becomes
			// enumerable and the provider fires its late-enumeration signal,
			// requesting a forced re-sweep.
			const legacy = AgentSession.uri('copilot', 'legacy-race');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			agent.fireDiscoveredChats([discoveredChat(legacy)]);

			// The forced re-sweep cannot start until the in-flight one settles;
			// let the first sweep's stale (empty) read complete now.
			gate.complete();
			await first;

			assert.strictEqual(agent.listCalls, 1, 'event payload ingestion must not re-enumerate the provider');
			let registered: readonly URI[] = [];
			for (let i = 0; i < 50; i++) {
				registered = await svc.getRegisteredSessions();
				if (registered.length > 0) {
					break;
				}
				await timeout(0);
			}
			assert.deepStrictEqual(registered.map(s => s.toString()), [legacy.toString()]);
		});

		test('the legacy global backfill marker is never auto-mirrored, even once every currently-registered provider is backfilled', async () => {
			// The bug this guards: mirroring the legacy global marker once
			// "every known provider" was backfilled was unsafe because a
			// provider (e.g. Codex) can register later than that point — a
			// downgrade to pre-per-provider code reading a prematurely-set
			// global marker would then silently skip that late provider's
			// legacy sessions forever.
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const early = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, early);
			await svc.listSessions();
			assert.strictEqual(await svc.isProviderRegistryBackfilled('copilot'), true);
			assert.strictEqual(await svc.isLegacyRegistryBackfilled(), false, 'the legacy global marker must never be written automatically');

			// A late-registering provider (simulating Codex enabling after
			// startup) also completes its own sweep.
			const late = disposables.add(new MockAgent('claude'));
			registerTestAgentProvider(svc, late);
			await svc.listSessions();
			assert.strictEqual(await svc.isProviderRegistryBackfilled('claude'), true);

			// Even with every currently-registered provider backfilled, the
			// legacy global marker is still never mirrored — so a downgrade
			// always safely re-sweeps from scratch instead of risking having
			// skipped a provider that only registers later still.
			assert.strictEqual(await svc.isLegacyRegistryBackfilled(), false);
		});

		test('a forced re-sweep cannot resurrect a session that was explicitly deleted (tombstone)', async () => {
			class ChatListChangeAgent extends MockAgent {
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ChatListChangeAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'to-be-deleted') });
			assert.ok((await svc.getRegisteredSessions()).some(s => s.toString() === session.toString()));

			// Explicitly delete the session — this durably tombstones it.
			await svc.disposeSession(session);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			// Simulate the provider's own store still reporting the session
			// (e.g. its deletion is eventual/lagging, or provider-side deletion
			// is a no-op for this session type). Without tombstone consultation,
			// the forced re-sweep below would resurrect it as a "legacy" find.
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);

			// A forced re-sweep triggered by the provider's own signal must not
			// resurrect the explicitly-deleted session.
			agent.fireDiscoveredChats([discoveredChat(session)]);
			for (let i = 0; i < 50; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual(await svc.getRegisteredSessions(), [], 'a tombstoned session must not be resurrected by a forced backfill sweep');
			assert.deepStrictEqual((await svc.listSessions()).map(s => s.session.toString()), []);
		});

		test('an explicit create at a previously-deleted session URI clears its tombstone and allows reuse', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const reusedUri = AgentSession.uri('copilot', 'reused-after-delete');

			const session = await svc.createSession({ provider: 'copilot', session: reusedUri });
			await svc.disposeSession(session);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			// Explicitly recreating at the exact same URI must succeed and be
			// visible again — the tombstone must not block legitimate reuse.
			const recreated = await svc.createSession({ provider: 'copilot', session: reusedUri });
			assert.strictEqual(recreated.toString(), reusedUri.toString());
			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(s => s.toString()), [reusedUri.toString()]);

			// A subsequent forced backfill sweep for the same session must also
			// keep it registered now that the tombstone has been cleared.
			assert.deepStrictEqual((await svc.listSessions()).map(s => s.session.toString()), [reusedUri.toString()]);
		});

		test('a forced discovery sweep cannot re-register a session concurrently, explicitly deleted mid-sweep', async () => {
			// Guards the atomic tombstone check in discovery registration: discovery's own
			// upfront tombstone filter was removed in favor of a single atomic
			// DB write, precisely because a separate check-then-act would still
			// race a concurrent explicit delete landing in between. This
			// reproduces that window directly: the sweep has already read the
			// provider's legacy list (deciding to (re-)register the session)
			// before the explicit delete tombstones it.
			const gate = new DeferredPromise<void>();
			class GatedListAgent extends MockAgent {
				listCalls = 0;
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listCalls++;
					const result = await super.listExternalChats();
					if (this.listCalls === 2) {
						await gate.p;
					}
					return result;
				}
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new GatedListAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			await svc.listSessions();

			const session = await svc.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'race-delete-during-backfill') });
			assert.ok((await svc.getRegisteredSessions()).some(s => s.toString() === session.toString()));

			// Start a provider readiness-triggered sweep. It reads
			// the legacy list (which still includes the session) and then
			// stalls before its registration write.
			agent.fireDiscoveredChats([discoveredChat(session)]);
			for (let i = 0; i < 20 && agent.listCalls < 2; i++) {
				await timeout(0);
			}

			// While the sweep is stalled, the session is explicitly deleted.
			await svc.disposeSession(session);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			// Let the stalled sweep's registration attempt proceed.
			gate.complete();
			for (let i = 0; i < 50 && agent.listCalls < 2; i++) {
				await timeout(0);
			}

			assert.deepStrictEqual(await svc.getRegisteredSessions(), [], 'the concurrently-tombstoned session must not be resurrected by the in-flight backfill sweep');
		});

		test('a legacy global marker does not gate registration-time native discovery', async () => {
			class CountingAgent extends MockAgent {
				listExternalChatsCalls = 0;
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listExternalChatsCalls++;
					return super.listExternalChats();
				}
			}
			const db = new TransientRegistryWriteDatabase();
			// Simulate an old database whose legacy one-time marker is set.
			await db.markSessionRegistryBackfilled();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			const agent = disposables.add(new CountingAgent('copilot'));
			const legacy = AgentSession.uri('copilot', 'old-db-native-session');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(legacy), legacy);
			registerTestAgentProvider(svc, agent);
			agent.fireDiscoveredChats([discoveredChat(legacy)]);

			assert.deepStrictEqual((await svc.listSessions()).map(session => session.session.toString()), [legacy.toString()]);
			assert.ok(agent.listExternalChatsCalls >= 1);
			assert.strictEqual(await svc.isProviderRegistryBackfilled('copilot'), true);
			assert.deepStrictEqual((await svc.getRegisteredSessions()).map(session => session.toString()), [legacy.toString()]);
		});

		test('repeated discovery payloads are idempotent and do not re-enumerate', async () => {
			// A freshly-created backfill entry's `forceQueued` must always
			// start `false`, even when the entry's own first attempt is
			// itself invoked with `force` — seeding it from that `force` flag
			// would make a brand-new forced sweep look like it already has a
			// follow-up queued, so a second, genuinely distinct force
			// arriving while that first attempt is still in flight would be
			// silently coalesced away instead of chaining its own follow-up.
			class SequentiallyGatedListAgent extends MockAgent {
				listCalls = 0;
				private readonly _gates: DeferredPromise<void>[] = [];
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listCalls++;
					const gate = new DeferredPromise<void>();
					this._gates[this.listCalls] = gate;
					await gate.p;
					return super.listExternalChats();
				}
				releaseCall(index: number): void {
					this._gates[index]?.complete();
				}
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SequentiallyGatedListAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			// Let the automatic non-forced first sweep (from `registerProvider`)
			// start, then release and await it to completion so its entry is
			// cleared — the provider has no in-flight backfill afterward.
			for (let i = 0; i < 20 && agent.listCalls === 0; i++) {
				await timeout(0);
			}
			assert.strictEqual(agent.listCalls, 1);
			agent.releaseCall(1);
			await svc.listSessions();
			for (let i = 0; i < 20; i++) {
				await timeout(0);
			}

			const discovered = AgentSession.uri('copilot', 'repeated-discovery');
			agent.fireDiscoveredChats([discoveredChat(discovered)]);
			agent.fireDiscoveredChats([discoveredChat(discovered)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual({
				listCalls: agent.listCalls,
				registered: (await svc.getRegisteredSessions()).map(session => session.toString()),
			}, {
				listCalls: 1,
				registered: [discovered.toString()],
			});
		});

		test('repeated discovery payloads are accepted while the initial sweep is running', async () => {
			// Guards the N1 fix: `forceQueued` must be reset the moment the
			// chained forced attempt actually *starts* running, not merely
			// once it is scheduled — otherwise a second force arriving while
			// that chained attempt is still in flight would see
			// `forceQueued` still `true` from the first chain and be
			// silently coalesced away instead of queuing its own follow-up.
			class SequentiallyGatedListAgent extends MockAgent {
				listCalls = 0;
				private readonly _gates: DeferredPromise<void>[] = [];
				override async listExternalChats(): Promise<IAgentChatMetadata[]> {
					this.listCalls++;
					const gate = new DeferredPromise<void>();
					this._gates[this.listCalls] = gate;
					await gate.p;
					return super.listExternalChats();
				}
				releaseCall(index: number): void {
					this._gates[index]?.complete();
				}
				private readonly _onDidDiscoverChats = new Emitter<readonly IAgentDiscoveredChat[]>();
				override readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
				override fireDiscoveredChats(chats: readonly IAgentDiscoveredChat[]): void { this._onDidDiscoverChats.fire(chats); }
				override dispose(): void {
					this._onDidDiscoverChats.dispose();
					super.dispose();
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SequentiallyGatedListAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			// Call #1: the initial non-forced sweep. Let it start and gate.
			const first = svc.listSessions();
			for (let i = 0; i < 20 && agent.listCalls === 0; i++) {
				await timeout(0);
			}
			assert.strictEqual(agent.listCalls, 1);

			const discovered = AgentSession.uri('copilot', 'in-flight-discovery');
			agent.fireDiscoveredChats([discoveredChat(discovered)]);

			// Release call #1; the chained forced call #2 should start.
			agent.releaseCall(1);
			await first;
			agent.fireDiscoveredChats([discoveredChat(discovered)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}
			assert.deepStrictEqual({
				listCalls: agent.listCalls,
				registered: (await svc.getRegisteredSessions()).map(session => session.toString()),
			}, {
				listCalls: 1,
				registered: [discovered.toString()],
			});
		});

		test('listSessions keeps a registered session the provider transiently drops', async () => {
			class FlakyListAgent extends MockAgent {
				dropFromList = false;
				override async listSessions(): Promise<IAgentSessionMetadata[]> {
					return this.dropFromList ? [] : super.listSessions();
				}
				override async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
					return this.dropFromList ? undefined : super.getSessionMetadata(session);
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new FlakyListAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({ provider: 'copilot' });
			assert.ok((await svc.listSessions()).some(s => s.session.toString() === session.toString()));

			// The provider transiently drops the session from both its snapshot
			// and its per-session lookup (e.g. right after turnComplete). The
			// registry keeps it, and the state-manager overlay re-supplies the
			// metadata, so the session must not be evicted from the list.
			agent.dropFromList = true;
			assert.ok((await svc.listSessions()).some(s => s.session.toString() === session.toString()));
		});

		test('listSessions preserves the last live modified time when a lazy provider becomes inactive', async () => {
			class InactiveMetadataAgent extends MockAgent {
				metadataAvailable = true;
				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext, _providerData?: string, options?: IAgentChatMetadataOptions): Promise<IAgentChatMetadata | undefined> {
					return this.metadataAvailable
						? super.getChatMetadata(chat, context)
						: options?.registryFallback ? { chat, ...options.registryFallback } : undefined;
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new InactiveMetadataAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({ provider: 'copilot' });
			const registered = (await svc.listSessions()).find(candidate => candidate.session.toString() === session.toString());
			assert.ok(registered);
			const modifiedTime = Date.now() + 60_000;
			const modifiedAt = new Date(modifiedTime).toISOString();
			const chat = URI.parse(buildDefaultChatUri(session));
			const summaryChanged = Event.toPromise(Event.filter(
				getStateManager(svc).onDidChangeSessionSummary,
				event => event.session === session.toString() && event.changes.modifiedAt === modifiedAt,
			));
			getStateManager(svc).dispatchServerAction(chat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: modifiedAt,
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});
			await summaryChanged;
			await (svc as unknown as { _sessionModifiedTimeWrites: Promise<void> })._sessionModifiedTimeWrites;

			// Model a lazy provider before explicit activation: no live state and no
			// provider round-trip. The registry keeps the last live timestamp until
			// opening the session activates authoritative metadata reads again.
			getStateManager(svc).deleteSession(session.toString());
			agent.metadataAvailable = false;
			const fallback = (await svc.listSessions()).find(candidate => candidate.session.toString() === session.toString());
			const fallbackAgain = (await svc.listSessions()).find(candidate => candidate.session.toString() === session.toString());

			assert.ok(fallback);
			assert.deepStrictEqual({
				session: fallback.session,
				startTime: fallback.startTime,
				modifiedTime: fallback.modifiedTime,
				repeatedStartTime: fallbackAgain?.startTime,
				repeatedModifiedTime: fallbackAgain?.modifiedTime,
			}, {
				session,
				startTime: fallback.startTime,
				modifiedTime,
				repeatedStartTime: fallback.startTime,
				repeatedModifiedTime: modifiedTime,
			});
		});

		testWithExternalSessionClock('lazy provider fallback filters and sorts external sessions by their last modified time', async () => {
			class InactiveMetadataAgent extends MockAgent {
				override async getChatMetadata(chat: URI, _context: URI | IAgentChatContext, _providerData?: string, options?: IAgentChatMetadataOptions): Promise<IAgentChatMetadata | undefined> {
					return options?.registryFallback ? { chat, ...options.registryFallback } : undefined;
				}
			}
			const svc = createExternalSessionService();
			const agent = disposables.add(new InactiveMetadataAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const registry = (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			const now = Date.now();
			const day = 24 * 60 * 60 * 1000;
			const oldRecentlyUsed = AgentSession.uri('copilot', 'old-recently-used');
			const newLessRecentlyUsed = AgentSession.uri('copilot', 'new-less-recently-used');
			await registry.register(oldRecentlyUsed, {
				provider: 'copilot',
				startTime: now - 10 * day,
				modifiedTime: now - 5 * 60 * 1000,
				source: 'discovery',
			} as IAgentHostDatabaseSessionOptions, { checkTombstone: true });
			await registry.register(newLessRecentlyUsed, {
				provider: 'copilot',
				startTime: now - 30 * 60 * 1000,
				modifiedTime: now - 30 * 60 * 1000,
				source: 'discovery',
			} as IAgentHostDatabaseSessionOptions, { checkTombstone: true });

			const listed = await svc.listSessions(AgentHostExternalSessionsMode.Last24Hours);

			assert.deepStrictEqual(listed.map(session => ({
				id: AgentSession.id(session.session),
				modifiedTime: session.modifiedTime,
			})), [
				{ id: 'old-recently-used', modifiedTime: now - 5 * 60 * 1000 },
				{ id: 'new-less-recently-used', modifiedTime: now - 30 * 60 * 1000 },
			]);
		});

		test('listSessions does not synthesize registry metadata for other providers', async () => {
			class MissingMetadataAgent extends MockAgent {
				metadataAvailable = true;
				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					return this.metadataAvailable ? super.getChatMetadata(chat, context) : undefined;
				}
			}
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MissingMetadataAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({ provider: 'copilot' });
			getStateManager(svc).deleteSession(session.toString());
			agent.metadataAvailable = false;

			assert.strictEqual((await svc.listSessions()).some(candidate => candidate.session.toString() === session.toString()), false);
		});

		test('session registry stays in parity with listSessions across create/delete', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(svc, agent);

			const first = await svc.createSession({ provider: 'copilot' });
			const second = await svc.createSession({ provider: 'copilot' });

			const listedAfterCreate = new Set((await svc.listSessions()).map(s => s.session.toString()));
			const registeredAfterCreate = new Set((await svc.getRegisteredSessions()).map(s => s.toString()));
			assert.deepStrictEqual(registeredAfterCreate, listedAfterCreate);
			assert.deepStrictEqual(registeredAfterCreate, new Set([first.toString(), second.toString()]));

			await svc.disposeSession(first);

			const listedAfterDelete = new Set((await svc.listSessions()).map(s => s.session.toString()));
			const registeredAfterDelete = new Set((await svc.getRegisteredSessions()).map(s => s.toString()));
			assert.deepStrictEqual(registeredAfterDelete, listedAfterDelete);
			assert.deepStrictEqual(registeredAfterDelete, new Set([second.toString()]));
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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

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
			agent.sessionMetadataOverrides = {
				_meta: { multiRoot: { workspaceFile: 'file:///provider-spoof.code-workspace' } },
			};
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(sessions[0]._meta, { 'vscode.external': true, workspaceless: true });
		});

		test('listSessions overlays the adopted-legacy marker so a migrated session keeps its legacy listing', async () => {
			const db = new TestSessionDatabase();
			await db.setMetadata(AH_META_EHCLI_ADOPTED_DB_KEY, 'true');
			const sessionId = 'test-session-ehcli-adopted';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();
			assert.deepStrictEqual(
				{ count: sessions.length, adopted: readSessionEhcliAdopted(sessions[0]?._meta) },
				{ count: 1, adopted: true },
			);
		});

		test('listSessions restores persisted multi-root metadata', async () => {
			const db = new TestSessionDatabase();
			const multiRoot = {
				workspaceFile: 'vscode-remote://ssh-remote+host/work/demo.code-workspace',
			};
			await db.setMetadata(SESSION_META_MULTI_ROOT_KEY, JSON.stringify(multiRoot));
			const sessionId = 'test-session-multi-root';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = {
				_meta: { multiRoot: { workspaceFile: 'file:///provider-spoof.code-workspace' } },
			};
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();

			assert.deepStrictEqual(readSessionMultiRootMetadata(sessions[0]._meta), multiRoot);
		});

		test('listSessions restores persisted source-control provenance', async () => {
			const db = new TestSessionDatabase();
			const sourceControlState = {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.Merge,
			};
			await db.setMetadata(META_SOURCE_CONTROL_STATE, JSON.stringify(sourceControlState));
			const sessionId = 'test-session-source-control';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();

			assert.deepStrictEqual(readSessionSourceControlState(sessions[0]._meta), sourceControlState);
		});

		test('listSessions strips provider multi-root metadata when no session database exists', async () => {
			const sessionId = 'test-session-provider-multi-root';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = {
				_meta: { multiRoot: { workspaceFile: 'file:///provider-spoof.code-workspace' } },
			};
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();

			assert.strictEqual(readSessionMultiRootMetadata(sessions[0]._meta), undefined);
		});

		test('listSessions surfaces the persisted worktree repository root without resolving it', async () => {
			const db = disposables.add(new TestSessionDatabase());
			const linkedCheckout = URI.file('/workspace/vscode.worktrees/parent');
			const sessionWorktree = URI.file('/workspace/vscode.worktrees/parent.worktrees/child');
			await db.setMetadata(WORKTREE_META_REPOSITORY_ROOT, linkedCheckout.toString());
			const sessionId = 'test-session-linked-worktree';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { workingDirectories: [sessionWorktree] };
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);
			const gitService = createNoopGitService();
			let worktreeRootResolutions = 0;
			gitService.getWorktreeRoots = async () => {
				worktreeRootResolutions++;
				return [];
			};
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, gitService));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();
			// Twice, because the deleted repair cached per session: one listing cannot tell "never resolves" from "resolves once".
			await svc.listSessions();

			assert.deepStrictEqual({
				worktreeRootResolutions,
				project: sessions[0].project && { uri: sessions[0].project.uri.toString(), displayName: sessions[0].project.displayName },
				persistedRepositoryRoot: await db.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
			}, {
				worktreeRootResolutions: 0,
				project: { uri: linkedCheckout.toString(), displayName: 'parent' },
				persistedRepositoryRoot: linkedCheckout.toString(),
			});
		});

		test('listSessions reports the repository root once opening the session heals it', async () => {
			const db = disposables.add(new TestSessionDatabase());
			const primaryRoot = URI.file('/workspace/vscode');
			const linkedCheckout = URI.file('/workspace/vscode.worktrees/parent');
			const sessionWorktree = URI.file('/workspace/vscode.worktrees/parent.worktrees/child');
			await Promise.all([
				db.setMetadata('copilot.worktree.branchName', 'agents/child'),
				db.setMetadata('copilot.worktree.path', sessionWorktree.toString()),
				db.setMetadata(WORKTREE_META_REPOSITORY_ROOT, linkedCheckout.toString()),
			]);
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { workingDirectories: [sessionWorktree] };
			const gitService = createNoopGitService();
			gitService.getWorktreeRoots = async () => [primaryRoot, linkedCheckout, sessionWorktree];
			const sessionDataService = createSessionDataService(db);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			setTestAgentHostWorktreeIsolation(svc, disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/test' },
				gitService,
				sessionDataService,
				new NullLogService(),
			)));
			await createAgentSession(agent);
			registerTestAgentProvider(svc, agent);
			const sessionResource = (await agent.listSessions())[0].session;
			agent.fireDiscoveredChats([discoveredChat(sessionResource)]);
			for (let i = 0; i < 50 && (await svc.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}
			agent.sessionMessages = [];

			const before = await svc.listSessions();
			// Restore heals the metadata by resolving the worktree project, canonicalizing the root, and writing it back.
			await svc.restoreSession(sessionResource);
			const after = await svc.listSessions();

			assert.deepStrictEqual({
				before: before[0].project?.uri.toString(),
				after: after[0].project?.uri.toString(),
				persistedRepositoryRoot: await db.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
			}, {
				before: linkedCheckout.toString(),
				after: primaryRoot.toString(),
				persistedRepositoryRoot: primaryRoot.toString(),
			});
		});

		test('restoreSession recognizes an external linked worktree without persisted metadata', async () => {
			const db = disposables.add(new TestSessionDatabase());
			const primaryRoot = URI.file('/workspace/codex');
			const sessionWorktree = URI.file('/home/user/.codex/worktrees/4b6d/codex');
			const agent = new MockAgent('codex');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { workingDirectories: [sessionWorktree], project: undefined };
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => sessionWorktree;
			gitService.getWorktreeRoots = async () => [primaryRoot, sessionWorktree];
			gitService.getCurrentBranch = async () => undefined;
			gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
			const sessionDataService = createSessionDataService(db);
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			getConfigurationService(svc).updateRootConfig({ [AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days });
			setTestAgentHostWorktreeIsolation(svc, disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/test' },
				gitService,
				sessionDataService,
				new NullLogService(),
			)));
			registerTestAgentProvider(svc, agent);
			const { session } = await createAgentSession(agent);
			agent.sessionMessages = [];

			await svc.restoreSession(session);
			const listed = await svc.listSessions();

			assert.deepStrictEqual({
				isolation: getStateManager(svc).getSessionState(session.toString())?.config?.values[SessionConfigKey.Isolation],
				project: listed[0].project && { uri: listed[0].project.uri.toString(), displayName: listed[0].project.displayName },
				workingDirectory: listed[0].workingDirectories?.[0].toString(),
				persistedRepositoryRoot: await db.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
				persistedBranch: await db.getMetadata('copilot.worktree.branchName'),
				persistedPath: await db.getMetadata('copilot.worktree.path'),
			}, {
				isolation: 'folder',
				project: { uri: primaryRoot.toString(), displayName: 'codex' },
				workingDirectory: sessionWorktree.toString(),
				persistedRepositoryRoot: primaryRoot.toString(),
				persistedBranch: undefined,
				persistedPath: undefined,
			});
		});

		test('listSessions uses SDK title when no custom title exists', async () => {
			registerTestAgentProvider(service, copilotAgent);
			copilotAgent.sessionMetadataOverrides = { summary: 'Auto-generated Title' };

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'Auto-generated Title');
		});

		test('listSessions never returns subagent sessions', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const parentSession = await service.createSession({ provider: 'copilot' });

			// Simulate a live subagent being spawned: `_handleSubagentStarted`
			// registers the child session via `restoreSession`, which records
			// it in the announced-summary map that `listSessions` overlays
			// onto provider results.
			const childSessionUri = buildSubagentSessionUri(parentSession.toString(), 'tc-sub');
			getStateManager(service).restoreSession(
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
				getStateManager(service).getOverlaySessionSummaries().some(s => s.resource === childSessionUri),
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
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
				}));
				override async listSessions() {
					return [];
				}
			}

			const provisionalAgent = new ProvisionalMockAgent('copilot');
			disposables.add(toDisposable(() => provisionalAgent.dispose()));
			registerTestAgentProvider(service, provisionalAgent);

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
			const stateAfterTurn = getStateManager(service).getSessionState(session.toString());
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
				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					const snapshot = await super.getChatMetadata(chat, context);
					this.listStarted.complete();
					await this.releaseList.p;
					return snapshot;
				}
			}

			const agent = new DelayedListAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = URI.file('/original');
			const { session } = await createAgentSession(agent);
			setExternalSessionsMode(service, AgentHostExternalSessionsMode.Last30Days, 1);
			await waitForSessionListReconciliation(service);
			registerTestAgentProvider(service, agent);
			agent.fireDiscoveredChats([discoveredChat(session)]);
			for (let i = 0; i < 50 && (await service.getRegisteredSessions()).length === 0; i++) {
				await timeout(0);
			}

			const listing = service.listSessions();
			await agent.listStarted.p;
			const summaryNow = Date.now();
			getStateManager(service).restoreSession({
				resource: session.toString(),
				provider: 'copilot',
				title: 'Materialized',
				status: SessionStatus.Idle,
				createdAt: new Date(summaryNow - 1_000).toISOString(),
				modifiedAt: new Date(summaryNow).toISOString(),
				project: { uri: URI.file('/project').toString(), displayName: 'project' },
				workingDirectories: [URI.file('/worktree').toString()],
			}, []);
			agent.releaseList.complete();

			const listed = (await listing).find(item => item.session.toString() === session.toString());
			assert.deepStrictEqual({
				modifiedTime: listed?.modifiedTime,
				project: listed?.project && { uri: listed.project.uri.path, displayName: listed.project.displayName },
				workingDirectory: listed?.workingDirectories?.[0]?.path,
			}, {
				modifiedTime: summaryNow,
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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

			const sessions = await svc.listSessions();
			const changesetUri = buildSessionChangesetUri(sessionUri.toString());

			assert.deepStrictEqual({
				listCatalogueEntry: sessions[0].changesets?.find(c => c.uriTemplate === changesetUri),
				listSeededSnapshot: getStateManager(svc).getSnapshot(changesetUri),
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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

			// Seed live changeset state directly: a single file with
			// different counts than the stale persisted blob.
			const changesetUri = getStateManager(svc).registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			getStateManager(svc).dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetFileSet,
				file: {
					id: 'file:///wd/live.ts',
					edit: { after: { uri: 'file:///wd/live.ts', content: { uri: 'file:///wd/live.ts' } }, diff: { added: 1, removed: 0 } }
				},
			});
			getStateManager(svc).dispatchServerAction(changesetUri, {
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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

			// Seed a ready (zero-file) live changeset state — this alone
			// must be authoritative enough to suppress the persisted-diffs
			// read.
			const changesetUri = getStateManager(svc).registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			getStateManager(svc).dispatchServerAction(changesetUri, {
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

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

			// Register a changeset but leave it in the default
			// `Computing` status (no ChangesetStatusChanged dispatch).
			getStateManager(svc).registerChangeset(buildSessionChangesetUri(sessionUri.toString()));

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
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Simulate immediate title change via state manager
			getStateManager(service).dispatchServerAction(session.toString(), {
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
				getBranch: async () => undefined,
				getRefs: async () => [],
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
				mergeBranch: async () => '',
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
				getFetchRemoteUrls: async () => undefined,
				getUntrackedPaths: async () => [],
				getBranchDiffSafetyInfo: async () => undefined,
				getDiffPatchBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
			registerTestAgentProvider(localService, agent);

			// A normal session passes an input workingDirectory, so it is not
			// inferred workspace-less; `_meta` carries only the git overlay.
			const session = await localService.createSession({ provider: 'copilot', workingDirectories: workingDirectory ? [workingDirectory] : undefined });

			// _attachGitState is fire-and-forget; drain microtasks until the
			// git service's promise has resolved and setSessionMeta has run.
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const sessions = await localService.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
			assert.deepStrictEqual(
				getStateManager(localService).getSessionState(session.toString())?._meta,
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
			registerTestAgentProvider(localService, agent);

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
				getBranch: async () => undefined,
				getRefs: async () => [],
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
				mergeBranch: async () => '',
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
				getFetchRemoteUrls: async () => undefined,
				getUntrackedPaths: async () => [],
				getBranchDiffSafetyInfo: async () => undefined,
				getDiffPatchBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			// No resolvedWorkingDirectory set on the mock.
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			const sessions = await localService.listSessions();

			assert.strictEqual(sessions.length, 1);
			// No input workingDirectory → inferred workspace-less (tagged), and no
			// git overlay because there is no working directory to probe.
			assert.deepStrictEqual(getStateManager(localService).getSessionState(session.toString())?._meta, { workspaceless: true });
		});

		test.skip('createSession strips git-only catalogue entries for non-git working directory', async () => {
			const workingDirectory = URI.file('/workspace/not-a-repo');
			const gitService = createNoopGitService();
			// Probe runs but reports "not a git repo".
			gitService.getSessionGitState = async () => undefined;

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = getStateManager(localService).getSessionState(session.toString());
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

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = getStateManager(localService).getSessionState(session.toString());
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

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = getStateManager(localService).getSessionState(session.toString());
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
				const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
				const agent = new MockAgent('copilot');
				disposables.add(toDisposable(() => agent.dispose()));
				agent.resolvedWorkingDirectory = workingDirectory;
				agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };
				registerTestAgentProvider(localService, agent);

				// Seed a session and clear its _meta so subscribe must lazily
				// recompute git state. A microtask drain lets the
				// createSession-triggered refresh record its call so we can
				// reset the probes to a clean baseline.
				const session = await localService.createSession({ provider: 'copilot' });
				for (let i = 0; i < 5; i++) {
					await Promise.resolve();
				}
				getStateManager(localService).setSessionMeta(session.toString(), undefined);
				calls.length = 0;

				// subscribe fires the git-state refresh without awaiting it, so
				// advance time to let that fire-and-forget refresh run and write
				// _meta.git.
				await localService.subscribe(session, 'client-1');
				await timeout(5_000);

				assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
				assert.deepStrictEqual(
					getStateManager(localService).getSessionState(session.toString())?._meta,
					{ git: gitState },
				);
			});
		});

		test('subscribe to a registered session changeset URI returns a changeset snapshot', async () => {
			registerTestAgentProvider(service, copilotAgent);
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

		test('annotations survive session state restoration', async () => {
			const sessionData = createPerSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const annotationsUri = buildAnnotationsUri(session.toString());
			const annotation = {
				id: 'feedback-1',
				origin: { session: session.toString(), turnId: 'turn-1' },
				resource: URI.file('/workspace/reviewed.ts').toString(),
				resolved: false,
				entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
			};

			await localService.subscribe(URI.parse(annotationsUri), 'client-before-restart');
			localService.dispatchAction(annotationsUri, {
				type: ActionType.AnnotationsSet,
				annotation,
			}, 'client-before-restart', 1);
			getStateManager(localService).deleteSession(session.toString());

			const restored = await localService.subscribe(URI.parse(annotationsUri), 'client-after-restart');

			assert.deepStrictEqual(restored.state, { annotations: [annotation] });
		});

		test('annotations persisted before the origin migration are restored', async () => {
			const sessionData = createPerSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const annotationsUri = buildAnnotationsUri(session.toString());
			// The shape written before annotations carried an origin: a
			// top-level `turnId` and no owning session.
			await sessionData.database(session).setMetadata('annotations', JSON.stringify({
				annotations: [{
					id: 'feedback-1',
					turnId: 'turn-1',
					resource: URI.file('/workspace/reviewed.ts').toString(),
					resolved: false,
					entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
				}],
			}));
			getStateManager(localService).deleteSession(session.toString());

			const restored = await localService.subscribe(URI.parse(annotationsUri), 'client-after-upgrade');

			assert.deepStrictEqual(restored.state, {
				annotations: [{
					id: 'feedback-1',
					origin: { session: session.toString(), turnId: 'turn-1' },
					resource: URI.file('/workspace/reviewed.ts').toString(),
					resolved: false,
					entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
				}],
			});
		});

		test('annotations subscribe concurrent with session restore returns persisted feedback', async () => {
			const sessionData = createPerSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const annotationsUri = buildAnnotationsUri(session.toString());
			const annotation = {
				id: 'feedback-1',
				origin: { session: session.toString(), turnId: 'turn-1' },
				resource: URI.file('/workspace/reviewed.ts').toString(),
				resolved: false,
				entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
			};

			await localService.subscribe(URI.parse(annotationsUri), 'client-before-restart');
			localService.dispatchAction(annotationsUri, {
				type: ActionType.AnnotationsSet,
				annotation,
			}, 'client-before-restart', 1);
			getStateManager(localService).deleteSession(session.toString());

			// The session restore populates session state before it restores
			// annotations; a subscribe racing that window must still wait.
			const [, restored] = await Promise.all([
				localService.restoreSession(session),
				localService.subscribe(URI.parse(annotationsUri), 'client-racing-restore'),
			]);

			assert.deepStrictEqual(restored.state, { annotations: [annotation] });
		});

		test('subagent annotations persist in the parent session database', async () => {
			const sessionData = createPerSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionData.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);
			const parent = await localService.createSession({ provider: 'copilot' });
			const subagent = buildSubagentSessionUri(parent, 'tool-call');
			getStateManager(localService).restoreSession({
				resource: subagent,
				provider: 'subagent',
				title: 'Subagent',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
			}, []);
			const annotationsUri = buildAnnotationsUri(subagent);

			await localService.subscribe(URI.parse(annotationsUri), 'client');
			localService.dispatchAction(annotationsUri, {
				type: ActionType.AnnotationsSet,
				annotation: {
					id: 'feedback-1',
					origin: { session: subagent, turnId: 'turn-1' },
					resource: URI.file('/workspace/reviewed.ts').toString(),
					resolved: false,
					entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
				},
			}, 'client', 1);

			assert.deepStrictEqual({
				parentKeys: sessionData.database(parent).setMetadataCalls.map(call => call.key).filter(key => key.startsWith('annotations')),
				subagentKeys: sessionData.database(URI.parse(subagent)).setMetadataCalls.map(call => call.key).filter(key => key.startsWith('annotations')),
			}, {
				parentKeys: [`annotations:${subagent}`],
				subagentKeys: [],
			});
		});

		test('subscribe to an unknown changeset id fails without restoring the parent session', async () => {
			registerTestAgentProvider(service, copilotAgent);
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
				getStateManager(service).getSessionState(sessionUri),
				undefined,
				'parent session must not be materialized as a side effect of an unknown changeset subscription',
			);
		});

		test('createSession stores live session config', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const session = await service.createSession({ provider: 'copilot', config });

			assert.deepStrictEqual(getStateManager(service).getSessionState(session.toString())?.config?.values, config);
		});

		test('seeds activeClient into the initial session state when provided', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(service.onDidAction(env => envelopes.push(env)));

			const activeClient: SessionActiveClient = {
				clientId: 'client-eager',
				tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
				customizations: [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'A', }],
			};
			const session = await service.createSession({ provider: 'copilot', activeClient });

			assert.deepStrictEqual({
				activeClients: getStateManager(service).getSessionState(session.toString())?.activeClients,
				dispatchedActiveClientSet: envelopes.some(e => e.action.type === ActionType.SessionActiveClientSet),
			}, {
				activeClients: [activeClient],
				dispatchedActiveClientSet: false,
			});
		});

		test('omits activeClient from the initial session state when not provided', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			assert.deepStrictEqual(getStateManager(service).getSessionState(session.toString())?.activeClients, []);
		});
	});

	// ---- authenticate ---------------------------------------------------

	suite('authenticate', () => {

		test('routes token to provider matching the resource', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'ghp_test123' });

			assert.deepStrictEqual(result, { authenticated: true });
			assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'ghp_test123' }]);
		});

		test('returns not authenticated for unknown resource', async () => {
			registerTestAgentProvider(service, copilotAgent);

			const result = await service.authenticate({ resource: 'https://unknown.example.com', token: 'tok' });

			assert.deepStrictEqual({ result, token: getAuthenticationService(service).getAuthToken({ resource: 'https://unknown.example.com' }), authenticateCalls: copilotAgent.authenticateCalls }, {
				result: { authenticated: false },
				token: undefined,
				authenticateCalls: [],
			});
		});

		test('stores GitHub Copilot token for operation handlers', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const changes: { resource: string; token: string | undefined }[] = [];
			disposables.add(getAuthenticationService(service).onDidChangeAuthToken(event => changes.push({ resource: event.resource, token: event.token })));

			const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' });

			assert.deepStrictEqual({ result, token: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported }), authenticateCalls: copilotAgent.authenticateCalls, changes }, {
				result: { authenticated: true },
				token: 'copilot-token',
				authenticateCalls: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' }],
				changes: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' }],
			});
		});

		test('removes a stored token when authentication is revoked', async () => {
			registerTestAgentProvider(service, copilotAgent);
			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' });

			const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: '' });

			assert.deepStrictEqual({
				result,
				token: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource }),
				authenticateCalls: copilotAgent.authenticateCalls,
			}, {
				result: { authenticated: true },
				token: undefined,
				authenticateCalls: [
					{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' },
					{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: '' },
				],
			});
		});

		test('does not replay a stored token after a failed revocation', async () => {
			registerTestAgentProvider(service, copilotAgent);
			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' });
			copilotAgent.authenticate = async () => { throw new Error('clear failed'); };

			const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: '' });
			const lateAgent = new MockAgent('codex');
			lateAgent.getProtectedResources = () => [GITHUB_COPILOT_PROTECTED_RESOURCE];
			disposables.add(toDisposable(() => lateAgent.dispose()));
			registerTestAgentProvider(service, lateAgent);
			await timeout(0);

			assert.deepStrictEqual({
				result,
				token: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource }),
				lateAuthenticateCalls: lateAgent.authenticateCalls,
			}, {
				result: { authenticated: false },
				token: undefined,
				lateAuthenticateCalls: [],
			});
		});

		test('stores tokens for the same resource by scopes', async () => {
			registerTestAgentProvider(service, copilotAgent);

			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'], token: 'read-token' });
			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user', 'user:email'], token: 'profile-token' });

			assert.deepStrictEqual({
				readToken: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'] }),
				profileToken: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email', 'read:user'] }),
				supersetToken: getAuthenticationService(service).getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email'] }),
			}, {
				readToken: 'read-token',
				profileToken: 'profile-token',
				supersetToken: 'profile-token',
			});
		});

		test('accepts an already handled MCP token after retrying session handlers', async () => {
			const mcpAgent = new MockAgent();
			disposables.add(toDisposable(() => mcpAgent.dispose()));
			const mcpAgentContract: IAgent = mcpAgent;
			let handlerCalls = 0;
			mcpAgentContract.handleAuthenticationToken = async () => ++handlerCalls === 1;
			registerTestAgentProvider(service, mcpAgentContract);

			const first = await service.authenticate({ resource: 'https://mcp.example.com', scopes: ['write', 'read'], token: 'token-1' });
			const duplicate = await service.authenticate({ resource: 'https://mcp.example.com', scopes: ['read', 'write'], token: 'token-1' });
			const replacement = await service.authenticate({ resource: 'https://mcp.example.com', scopes: ['read', 'write'], token: 'token-2' });

			assert.deepStrictEqual({ first, duplicate, replacement, handlerCalls }, {
				first: { authenticated: true },
				duplicate: { authenticated: true },
				replacement: { authenticated: false },
				handlerCalls: 3,
			});
		});

		test('does not hide a session handler rejection with an accepted token', async () => {
			const mcpAgent = new MockAgent();
			disposables.add(toDisposable(() => mcpAgent.dispose()));
			const mcpAgentContract: IAgent = mcpAgent;
			let handlerCalls = 0;
			mcpAgentContract.handleAuthenticationToken = async () => {
				handlerCalls++;
				if (handlerCalls === 1) {
					return true;
				}
				throw new Error('failed');
			};
			registerTestAgentProvider(service, mcpAgentContract);

			const first = await service.authenticate({ resource: 'https://mcp.example.com', token: 'token-1' });
			const duplicate = await service.authenticate({ resource: 'https://mcp.example.com', token: 'token-1' });

			assert.deepStrictEqual({ first, duplicate, handlerCalls }, {
				first: { authenticated: true },
				duplicate: { authenticated: false },
				handlerCalls: 2,
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
			registerTestAgentProvider(service, copilotAgent);
			registerTestAgentProvider(service, claudeAgent);

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

		test('replays stored authentication to a provider registered later', async () => {
			registerTestAgentProvider(service, copilotAgent);
			await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });
			const lateAgent = new MockAgent('codex');
			lateAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			disposables.add(toDisposable(() => lateAgent.dispose()));

			registerTestAgentProvider(service, lateAgent);
			for (let attempt = 0; attempt < 20 && lateAgent.authenticateCalls.length === 0; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 5));
			}

			assert.deepStrictEqual(lateAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'tok' }]);
		});

		test('isolates a provider that throws — others still authenticate', async () => {
			// Regression: if any provider's authenticate() rejects, the
			// fan-out must NOT sink the others. Previously the call used
			// Promise.all, which propagated the first rejection.
			const flakyAgent = new MockAgent('claude');
			flakyAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyAgent.authenticate = async () => { throw new Error('proxy bind failed'); };
			disposables.add(toDisposable(() => flakyAgent.dispose()));
			registerTestAgentProvider(service, copilotAgent);
			registerTestAgentProvider(service, flakyAgent);

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
			registerTestAgentProvider(service, flakyA);
			registerTestAgentProvider(service, flakyB);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual(result, { authenticated: false });
		});
	});

	// ---- shutdown -------------------------------------------------------

	suite('shutdown', () => {

		test('shuts down all providers', async () => {
			let copilotShutdown = false;
			copilotAgent.shutdown = async () => { copilotShutdown = true; };

			registerTestAgentProvider(service, copilotAgent);

			await service.shutdown();
			assert.ok(copilotShutdown);
		});

		test('preserves worktrees owned by persistent sessions', async () => {
			const workingDirectory = URI.file(mkdtempSync(join(tmpdir(), 'agent-service-shutdown-')));
			const worktreesRoot = getWorktreesRoot(workingDirectory);
			disposables.add(toDisposable(() => {
				rmSync(workingDirectory.fsPath, { recursive: true, force: true });
				rmSync(worktreesRoot.fsPath, { recursive: true, force: true });
			}));
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => workingDirectory;
			gitService.revParse = async () => 'head';
			gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
			gitService.addWorktree = async () => { };
			let removeWorktreeCalls = 0;
			gitService.removeWorktree = async () => { removeWorktreeCalls++; };
			const isolation = disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/test' },
				gitService,
				nullSessionDataService,
				new NullLogService(),
			));
			setTestAgentHostWorktreeIsolation(service, isolation);
			registerTestAgentProvider(service, copilotAgent);
			await isolation.resolveWorkingDirectory({
				sessionUri: AgentSession.uri('copilot', 'session'),
				sessionId: 'session',
				workingDirectory,
				config: {
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.Branch]: 'main',
				},
			});

			await service.shutdown();

			assert.deepStrictEqual({
				removeWorktreeCalls,
				resolvedWorktree: isolation.getResolvedWorktree('session')?.toString(),
			}, {
				removeWorktreeCalls: 0,
				resolvedWorktree: URI.joinPath(getWorktreesRoot(workingDirectory), 'test').toString(),
			});
		});

		test('waits for every provider shutdown when one fails', async () => {
			const failingAgent = new MockAgent('claude');
			const slowAgent = new MockAgent('mock');
			const slowShutdown = new DeferredPromise<void>();
			let slowShutdownCompleted = false;
			failingAgent.shutdown = async () => { throw new Error('provider shutdown failed'); };
			slowAgent.shutdown = async () => {
				await slowShutdown.p;
				slowShutdownCompleted = true;
			};
			disposables.add(toDisposable(() => failingAgent.dispose()));
			disposables.add(toDisposable(() => slowAgent.dispose()));
			registerTestAgentProvider(service, failingAgent);
			registerTestAgentProvider(service, slowAgent);

			const shutdown = service.shutdown();
			await Promise.resolve();
			slowShutdown.complete();

			await assert.rejects(shutdown, /provider shutdown failed/);
			assert.strictEqual(slowShutdownCompleted, true);
		});

		test('coalesces management shutdown and flushes session data after provider timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let providerShutdownCount = 0;
			let flushCount = 0;
			service.shutdown = () => {
				providerShutdownCount++;
				return new Promise<void>(() => { });
			};
			nullSessionDataService.whenIdle = async () => { flushCount++; };
			let ingressShutdownCount = 0;
			const managementService = new AgentHostManagementService(service, {} as IConnectionTrackerService, async () => { ingressShutdownCount++; }, nullSessionDataService, new NullLogService());

			const first = managementService.shutdown();
			const second = managementService.shutdown();
			await Promise.all([first, second]);

			assert.deepStrictEqual({
				samePromise: first === second,
				ingressShutdownCount,
				providerShutdownCount,
				flushCount,
			}, {
				samePromise: true,
				ingressShutdownCount: 1,
				providerShutdownCount: 1,
				flushCount: 1,
			});
		}));

		test('bounds stalled drains and reserves time to flush session data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const stalled = new DeferredPromise<void>();
			let providerShutdownCount = 0;
			let flushCount = 0;
			service.createSession = async () => {
				await stalled.p;
				return URI.parse('copilot:/stalled-shutdown');
			};
			service.shutdown = async () => { providerShutdownCount++; };
			nullSessionDataService.whenIdle = async () => { flushCount++; };
			const managementService = new AgentHostManagementService(service, {} as IConnectionTrackerService, () => stalled.p, nullSessionDataService, new NullLogService());

			void managementService.createSessionWithExtensions({});
			await managementService.shutdown();

			assert.deepStrictEqual({
				providerShutdownCount,
				flushCount,
			}, {
				providerShutdownCount: 1,
				flushCount: 1,
			});
		}));

		test('drains management mutations and rejects new ones during shutdown', async () => {
			const session = URI.parse('copilot:/management-shutdown');
			const createSession = new DeferredPromise<URI>();
			let providerShutdownCount = 0;
			let flushCount = 0;
			service.createSession = () => createSession.p;
			service.shutdown = async () => { providerShutdownCount++; };
			nullSessionDataService.whenIdle = async () => { flushCount++; };
			const managementService = new AgentHostManagementService(service, {} as IConnectionTrackerService, async () => { }, nullSessionDataService, new NullLogService());

			const mutation = managementService.createSessionWithExtensions({});
			const shutdown = managementService.shutdown();
			await Promise.resolve();
			const providerShutdownCountWhileMutationPending = providerShutdownCount;
			const lateMutationError = assert.rejects(managementService.createSessionWithExtensions({}), /shutting down/);
			createSession.complete(session);
			await mutation;
			await shutdown;

			await lateMutationError;
			assert.deepStrictEqual({
				providerShutdownCountWhileMutationPending,
				providerShutdownCount,
				flushCount,
			}, {
				providerShutdownCountWhileMutationPending: 0,
				providerShutdownCount: 1,
				flushCount: 1,
			});
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

		test('marks only an explicit restore as an activating metadata read', async () => {
			class LazyMetadataAgent extends MockAgent {
				ambientReads = 0;
				restoreReads = 0;

				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext, _providerData?: string, options?: IAgentChatMetadataOptions): Promise<IAgentChatMetadata | undefined> {
					if (options?.activation === 'restore') {
						this.restoreReads++;
					} else {
						this.ambientReads++;
					}
					return super.getChatMetadata(chat, context);
				}
			}

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LazyMetadataAgent('codex'));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: agent.id });
			await svc.listSessions();
			agent.ambientReads = 0;
			agent.restoreReads = 0;
			getStateManager(svc).deleteSession(session.toString());

			await svc.listSessions();
			const readsAfterAmbientListing = { ambient: agent.ambientReads, restore: agent.restoreReads };
			await svc.restoreSession(session);

			assert.deepStrictEqual({
				readsAfterAmbientListing,
				readsAfterRestore: { ambient: agent.ambientReads, restore: agent.restoreReads },
			}, {
				readsAfterAmbientListing: { ambient: 1, restore: 0 },
				readsAfterRestore: { ambient: 1, restore: 1 },
			});
		});

		test('waits for initial provider migration before restoring a session', async () => {
			class DelayedMigrationAgent extends MockAgent {
				readonly migrationGate = new DeferredPromise<void>();
				migrationComplete = false;
				metadataCalls = 0;

				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[]> {
					await this.migrationGate.p;
					this.migrationComplete = true;
					return this.listExternalChats();
				}

				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					this.metadataCalls++;
					return this.migrationComplete ? super.getChatMetadata(chat, context) : undefined;
				}
			}

			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new DelayedMigrationAgent('copilot'));
			const { session } = await createAgentSession(agent);
			registerTestAgentProvider(svc, agent);

			const restore = svc.restoreSession(session);
			await timeout(0);
			// Metadata reads are now made before the catalog wait, so counting them here would only track scheduling.
			const hydratedBeforeMigration = !!getStateManager(svc).getSessionState(session.toString());
			agent.migrationGate.complete();
			await restore;

			assert.deepStrictEqual({
				hydratedBeforeMigration,
				metadataReadAfterMigration: agent.metadataCalls > 0,
				registeredSessions: (await svc.getRegisteredSessions()).map(resource => resource.toString()),
				restored: !!getStateManager(svc).getSessionState(session.toString()),
			}, {
				hydratedBeforeMigration: false,
				metadataReadAfterMigration: true,
				registeredSessions: [session.toString()],
				restored: true,
			});
		});

		test('restores a registered session whose URI scheme differs from its provider', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const session = URI.parse('ahp-session:/durable-provider-route');
			await svc.createSession({ provider: 'copilot', session });
			getTestAgentHostProviderService(svc).releaseSession(session, 'copilot');
			getStateManager(svc).removeSession(session.toString());

			await svc.restoreSession(session);

			assert.deepStrictEqual({
				provider: getTestAgentHostProviderService(svc).getProviderForSession(session)?.id,
				restored: !!getStateManager(svc).getSessionState(session.toString()),
			}, {
				provider: 'copilot',
				restored: true,
			});
		});

		test('rejects restoring a session that has been explicitly deleted (tombstoned) without resurrecting it', async () => {
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({ provider: 'copilot' });
			await svc.disposeSession(session);
			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);

			await assert.rejects(
				() => svc.restoreSession(session),
				(error: unknown) => error instanceof ProtocolError && error.code === AHP_SESSION_NOT_FOUND,
			);

			assert.deepStrictEqual(await svc.getRegisteredSessions(), []);
			assert.strictEqual(getStateManager(svc).getSessionState(session.toString()), undefined, 'a rejected restore must not have populated any state');
		});

		suite('initial provider migration race (#331648)', () => {
			/** Provider whose catalog migration registers the session, and which is describable throughout. */
			class BackfillRegistersAgent extends MockAgent {
				override readonly onDidDiscoverChats = Event.None;
				readonly migrationGate = new DeferredPromise<void>();
				/** Settles once restore has read the registry and reached the adoption probe. */
				readonly adoptionProbed = new DeferredPromise<void>();
				constructor(readonly backfilled: URI) { super('copilot'); }

				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | undefined> {
					await this.migrationGate.p;
					return [{ chat: URI.parse(buildDefaultChatUri(this.backfilled)), startTime: Date.now(), modifiedTime: Date.now() }];
				}

				// Not a legacy Copilot CLI chat, e.g. an external chat the GitHub app created.
				async ensureChatAdopted(): Promise<IAgentChatAdoptionResult> {
					if (!this.adoptionProbed.isSettled) {
						this.adoptionProbed.complete();
					}
					return { adopted: false, eligible: false };
				}
			}

			test('a session the catalog migration will register is not reported missing while that migration is in flight', async () => {
				const svc = makeService();
				const session = AgentSession.uri('copilot', 'registered-by-backfill');
				const agent = disposables.add(new BackfillRegistersAgent(session));
				seedSession(agent, session);
				registerTestAgentProvider(svc, agent);
				getConfigurationService(svc).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });

				const restore = svc.restoreSession(session);
				// Restore must reach the unregistered-session guard while the backfill that
				// would register it is still gated.
				await agent.adoptionProbed.p;
				agent.migrationGate.complete();

				await restore;
				assert.strictEqual(!!getStateManager(svc).getSessionState(session.toString()), true);
			});

			/** Provider whose catalog migration is gated; per-session metadata is unavailable until it completes. */
			class StartupRaceAgent extends MockAgent {
				override readonly onDidDiscoverChats = Event.None;
				readonly migrationGate = new DeferredPromise<void>();
				sdkReady = false;
				catalogAvailable = true;
				catalogDeferred = false;
				listChatsToMigrateCalls = 0;
				getChatMetadataCalls = 0;

				override async listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | undefined | typeof AgentChatMigrationDeferred> {
					this.listChatsToMigrateCalls++;
					await this.migrationGate.p;
					if (this.catalogDeferred) {
						return AgentChatMigrationDeferred;
					}
					if (!this.catalogAvailable) {
						return undefined;
					}
					this.sdkReady = true;
					return [];
				}

				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					this.getChatMetadataCalls++;
					return this.sdkReady ? super.getChatMetadata(chat, context) : undefined;
				}
			}

			function makeService(): AgentService {
				return disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			}

			function seedSession(agent: MockAgent, session: URI): void {
				(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			}

			async function advanceUntil(predicate: () => boolean): Promise<void> {
				for (let i = 0; i < 50 && !predicate(); i++) {
					await timeout(0);
				}
			}

			test('waits for initial provider migration instead of a false SESSION_NOT_FOUND', async () => {
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'race-session');
				seedSession(agent, session);
				registerTestAgentProvider(svc, agent);

				let rejected: unknown;
				const restore = svc.restoreSession(session).catch(err => { rejected = err; });
				// The gated catalogue migration starts from `registerProvider`, so waiting
				// on it alone would sample the counters before restore's own (independent)
				// metadata read has landed.
				await advanceUntil(() => agent.listChatsToMigrateCalls > 0 && agent.getChatMetadataCalls > 0);
				const beforeGate = {
					metadataRead: agent.getChatMetadataCalls,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				};

				agent.migrationGate.complete();
				await restore;

				assert.deepStrictEqual({
					beforeGate,
					rejected,
					hydratedAfter: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					beforeGate: { metadataRead: 1, hydrated: false },
					rejected: undefined,
					hydratedAfter: true,
				});
			});

			test('re-checks the tombstone after the wait and does not resurrect a deleted session', async () => {
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'deleted-during-wait');
				seedSession(agent, session);
				registerTestAgentProvider(svc, agent);

				let rejected: unknown;
				const restore = svc.restoreSession(session).catch(err => { rejected = err; });
				// Wait until restore is parked on the catalogue: deleting before it reads
				// metadata would trip the early tombstone check instead of the one after.
				await advanceUntil(() => agent.listChatsToMigrateCalls > 0 && agent.getChatMetadataCalls > 0);
				await svc.disposeSession(session);
				agent.migrationGate.complete();
				await restore;

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					metadataRead: agent.getChatMetadataCalls,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: AHP_SESSION_NOT_FOUND,
					// Restore reads per-session metadata before waiting on the catalogue,
					// so one read happens even for a session deleted during the wait.
					metadataRead: 1,
					hydrated: false,
				});
			});

			test('restores a session the provider can describe without waiting for the catalogue', async () => {
				// Warming the catalogue is O(catalogue) — ~48s on a large `~/.copilot` —
				// so a session that resolves from its own metadata must not pay for it.
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'describable-session');
				seedSession(agent, session);
				// Describable immediately, while the catalogue migration stays gated.
				agent.sdkReady = true;
				registerTestAgentProvider(svc, agent);

				await svc.restoreSession(session);

				assert.deepStrictEqual(
					{ hydrated: !!getStateManager(svc).getSessionState(session.toString()), catalogueSettled: agent.migrationGate.isSettled },
					{ hydrated: true, catalogueSettled: false },
				);
				agent.migrationGate.complete();
			});

			test('reports a genuinely missing session as not found once migration completes', async () => {
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'never-existed');
				registerTestAgentProvider(svc, agent);
				agent.migrationGate.complete();

				let rejected: unknown;
				await svc.restoreSession(session).catch(err => { rejected = err; });

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: AHP_SESSION_NOT_FOUND,
					hydrated: false,
				});
			});

			test('reports an unavailable catalog as an internal error, never a false not found', async () => {
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'catalog-unavailable');
				seedSession(agent, session);
				agent.catalogAvailable = false;
				registerTestAgentProvider(svc, agent);
				agent.migrationGate.complete();

				let rejected: unknown;
				await svc.restoreSession(session).catch(err => { rejected = err; });

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: JSON_RPC_INTERNAL_ERROR,
					hydrated: false,
				});
			});

			test('reports a deferred catalog as an internal error, never a false not found', async () => {
				const svc = makeService();
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'catalog-deferred');
				seedSession(agent, session);
				agent.catalogDeferred = true;
				registerTestAgentProvider(svc, agent);
				agent.migrationGate.complete();

				let rejected: unknown;
				await svc.restoreSession(session).catch(err => { rejected = err; });

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: JSON_RPC_INTERNAL_ERROR,
					hydrated: false,
				});
			});

			test('probes a deferred catalog after persisted backfill before reporting a session missing', async () => {
				const db = new TransientRegistryWriteDatabase();
				await db.markProviderBackfilled('copilot');
				const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				const session = AgentSession.uri('copilot', 'deferred-after-backfill');
				seedSession(agent, session);
				agent.catalogDeferred = true;
				agent.migrationGate.complete();
				registerTestAgentProvider(svc, agent);

				let rejected: unknown;
				await svc.restoreSession(session).catch(err => { rejected = err; });

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					catalogProbed: agent.listChatsToMigrateCalls > 0,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: JSON_RPC_INTERNAL_ERROR,
					catalogProbed: true,
					hydrated: false,
				});
			});

			test('reports a known (registered) session whose provider is currently unavailable as internal error, not not-found', async () => {
				// Reviewer scenario (#331721): on a backfilled restart the one-time
				// migration short-circuits without contacting the provider, so a
				// provider that cannot currently describe the session (e.g. Claude
				// whose SDK is not downloaded yet) returns `undefined`. Because the
				// session is known to the registry, that miss must be transient, not
				// the sticky false not-found.
				const db = new TransientRegistryWriteDatabase();
				const session = AgentSession.uri('copilot', 'registered-but-unavailable');
				await db.registerSession(session.toString(), { provider: 'copilot', startTime: 1, source: 'restore' }, { checkTombstone: false });
				await db.markProviderBackfilled('copilot');
				const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, db));
				const agent = disposables.add(new StartupRaceAgent('copilot'));
				agent.migrationGate.complete();
				registerTestAgentProvider(svc, agent);

				let rejected: unknown;
				await svc.restoreSession(session).catch(err => { rejected = err; });

				assert.deepStrictEqual({
					isProtocolError: rejected instanceof ProtocolError,
					code: (rejected as ProtocolError)?.code,
					migrationShortCircuited: agent.listChatsToMigrateCalls === 0,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					isProtocolError: true,
					code: JSON_RPC_INTERNAL_ERROR,
					migrationShortCircuited: true,
					hydrated: false,
				});
			});

			test('a stalled provider migration does not block restoring a ready provider', async () => {
				const svc = makeService();
				const stalled = disposables.add(new StartupRaceAgent('copilot'));
				const ready = disposables.add(new MockAgent('claude'));
				const session = AgentSession.uri('claude', 'ready-session');
				seedSession(ready, session);
				registerTestAgentProvider(svc, stalled);
				registerTestAgentProvider(svc, ready);
				await advanceUntil(() => stalled.listChatsToMigrateCalls > 0);

				await svc.restoreSession(session);

				assert.deepStrictEqual({
					stalledStarted: stalled.listChatsToMigrateCalls > 0,
					stalledCompleted: stalled.sdkReady,
					hydrated: !!getStateManager(svc).getSessionState(session.toString()),
				}, {
					stalledStarted: true,
					stalledCompleted: false,
					hydrated: true,
				});

				stalled.migrationGate.complete();
				await svc.listSessions();
			});
		});

		test('restores the AH-owned workspaceless marker onto the summary _meta for any agent', async () => {
			// The workspace-less marker is owned by the AH service and overlaid on
			// restore from the central session DB — the agent (MockAgent) re-emits
			// nothing itself, yet the restored session still carries the tag.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];
			await db.setMetadata('agentHost.workspaceless', 'true');

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(getStateManager(localService).getSessionState(sessionResource.toString())?._meta, { workspaceless: true });
		});

		test('restores persisted multi-root metadata', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];
			copilotAgent.sessionMetadataOverrides = {
				_meta: { multiRoot: { workspaceFile: 'file:///provider-spoof.code-workspace' } },
			};
			const multiRoot = {
				workspaceFile: 'vscode-remote://ssh-remote+host/work/demo.code-workspace',
			};
			await db.setMetadata(SESSION_META_MULTI_ROOT_KEY, JSON.stringify(multiRoot));

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(readSessionMultiRootMetadata(getStateManager(localService).getSessionState(sessionResource.toString())?._meta), multiRoot);
		});

		test('restores persisted session creation metadata', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];
			const creationReference = {
				session: 'copilot:/creator',
				chat: buildDefaultChatUri('copilot:/creator'),
				turnId: 'turn-1',
			};
			await db.setMetadata(AH_META_CREATED_BY_SESSION_DB_KEY, JSON.stringify(creationReference));

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(readSessionCreationReference(getStateManager(localService).getSessionState(sessionResource.toString())?._meta), creationReference);
		});

		test('restores persisted source-control provenance', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];
			const sourceControlState = {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.Merge,
			};
			await db.setMetadata(META_SOURCE_CONTROL_STATE, JSON.stringify(sourceControlState));

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(readSessionSourceControlState(getStateManager(localService).getSessionState(sessionResource.toString())?._meta), sourceControlState);
		});

		test('restores a session with message history', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = getStateManager(service).getSessionState(sessionResource.toString());
			assert.ok(state, 'session should be in state manager');
			assert.strictEqual(state!.lifecycle, SessionLifecycle.Ready);
			assert.strictEqual(state!.turns.length, 1);
			assert.strictEqual(state!.turns[0].message.text, 'Hello');
			const mdPart = state!.turns[0].responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdPart);
			assert.strictEqual(mdPart.content, 'Hi there!');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);
		});

		test('advertises server tools after restoring the session state', async () => {
			registerTestAgentProvider(service, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;

			await service.restoreSession(sessionResource);

			assert.strictEqual(
				getStateManager(service).getSessionState(sessionResource.toString())?.serverTools?.some(tool => tool.name === SessionServerToolName.ListSessions),
				true,
			);
		});

		test('re-attaches persisted turn usage on restore', async () => {
			// Providers don't durably record token/credit usage (the Copilot
			// SDK's `assistant.usage` event is explicitly ephemeral), so without
			// the host-side overlay a reloaded session comes back with no
			// context-usage gauge and a session cost of 0.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];
			await db.setTurnUsage('msg-1', JSON.stringify({ inputTokens: 100, outputTokens: 20, model: 'gpt-5' }));

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(
				getStateManager(localService).getSessionState(sessionResource.toString())?.turns.map(t => t.usage),
				[{ inputTokens: 100, outputTokens: 20, model: 'gpt-5' }],
			);
		});

		test('re-attaches usage over an Auto-model stub, preserving the routing metadata', async () => {
			// A turn that ran on Copilot Auto is restored with a token-less stub
			// (`{ model, _meta: { autoModeResolved } }`, see mapSessionEvents)
			// because the routing decision IS persisted while the usage event is
			// not. Treating that stub as "already has usage" would skip exactly
			// the turns needing re-attachment — and Auto is the default model.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const autoModeResolved = { chosenModel: 'claude-opus-4.8', predictedLabel: 'needs_reasoning', confidence: 0.93 };
			const agent = disposables.add(new MockAgent('copilot'));
			agent.turnUsageOverride = { model: 'claude-opus-4.8', _meta: { autoModeResolved } };
			registerTestAgentProvider(localService, agent);
			const { session } = await createAgentSession(agent);
			const sessionResource = (await agent.listSessions())[0].session;
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];
			await db.setTurnUsage('msg-1', JSON.stringify({ inputTokens: 100, outputTokens: 20, model: 'claude-opus-4.8', _meta: { copilotUsage: { totalNanoAiu: 5_000_000_000 } } }));

			await localService.restoreSession(sessionResource);

			assert.deepStrictEqual(
				getStateManager(localService).getSessionState(sessionResource.toString())?.turns.map(t => t.usage),
				[{
					inputTokens: 100,
					outputTokens: 20,
					model: 'claude-opus-4.8',
					// The stub's routing metadata survives alongside the persisted usage.
					_meta: { autoModeResolved, copilotUsage: { totalNanoAiu: 5_000_000_000 } },
				}],
			);
		});

		test('interleaves persisted host-injected local turns after their anchor on restore', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
			// head (no anchor) first, then the real turn, then its anchored local; orphan dropped.
			assert.deepStrictEqual(state!.turns.map(t => t.id), ['local-head', 'msg-real', 'local-after']);
		});


		test('restores the default chat\'s independently-renamed title', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [];

			// The host persists an independent default-chat rename under this key;
			// restore must seed it back or the main chat tab reverts to the session title.
			const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
			await db.setMetadata(`customChatTitle:${defaultChatUri}`, 'Renamed Default Chat');

			await localService.restoreSession(sessionResource);

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
			assert.strictEqual(state?.chats.find(c => c.resource === defaultChatUri)?.title, 'Renamed Default Chat');
		});

		test('persists chat drafts to session metadata', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			assert.deepStrictEqual(getStateManager(localService).getSessionState(session.toString())?.draft, draft);
		});

		test('restores a session with tool calls', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			const state = getStateManager(service).getSessionState(sessionResource.toString());
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
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			const state = getStateManager(service).getSessionState(sessionResource.toString());
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
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Interrupted', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'msg-2', content: 'Retried', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Answer', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = getStateManager(service).getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].state, TurnState.Complete);
		});

		test('throws when session is not found on backend', async () => {
			registerTestAgentProvider(service, copilotAgent);
			await assert.rejects(
				() => service.restoreSession(AgentSession.uri('copilot', 'nonexistent')),
				/Session not found on backend/,
			);
		});


		test('adopts a surfaced legacy session on open only when the migrate setting is on', async () => {
			// Open-adoption is strictly gated on the live migrate setting.
			class AdoptOnOpenAgent extends MockAgent {
				adoptCalls = 0;
				private _adopted = false;
				constructor() { super('copilot'); }
				async ensureChatAdopted(_chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
					this.adoptCalls++;
					this._adopted = true;
					return { adopted: true, eligible: true };
				}
				override async getChatMetadata(chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					// Un-adopted: no backend metadata yet (mirrors the real gap).
					return this._adopted ? { chat, startTime: Date.now(), modifiedTime: Date.now() } : undefined;
				}
			}

			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new AdoptOnOpenAgent());
			registerTestAgentProvider(localService, agent);
			agent.sessionMessages = [];

			const session = AgentSession.uri('copilot', 'surfaced-legacy');
			const sessionStr = session.toString();
			getStateManager(localService).announceSurfacedSession({
				resource: sessionStr,
				provider: 'copilot',
				title: 'Legacy',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				_meta: withSessionEhcliAdoptable(undefined),
			});

			// Migrate setting off: opening must not adopt (dead-ends on missing backend metadata).
			await assert.rejects(() => localService.restoreSession(session));
			assert.strictEqual(agent.adoptCalls, 0);

			// Migrate setting on: opening adopts in place.
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			await localService.restoreSession(session);

			assert.deepStrictEqual(
				{ adoptCalls: agent.adoptCalls, restored: !!getStateManager(localService).getSessionState(sessionStr) },
				{ adoptCalls: 1, restored: true },
			);
		});

		test('an adopted chat whose restore fails is still registered, not lost from every list', async () => {
			// Adoption claims the chat on disk, which stops the extension host listing
			// it. If restore then fails (e.g. a worktree whose branch is gone) and the
			// chat was never registered, it exists in no list at all.
			class AdoptThenFailAgent extends MockAgent {
				constructor() { super('copilot'); }
				// Absent from the catalogue, so only the adoption path can register it.
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					return [];
				}
				async ensureChatAdopted(_chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
					return { adopted: true, eligible: true };
				}
				override async materializeChat(): Promise<never> {
					throw new Error('working directory no longer exists');
				}
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new AdoptThenFailAgent());
			registerTestAgentProvider(localService, agent);
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			const session = AgentSession.uri('copilot', 'adopted-restore-fails');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);

			await assert.rejects(() => localService.restoreSession(session));

			const registry = (localService as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			assert.strictEqual((await registry.get(session))?.session.toString(), session.toString());
		});

		test('an adopted chat whose registration cannot be made durable fails the migration', async () => {
			// Continuing unregistered would leave exactly the orphan the registration is
			// there to prevent: adopted on disk, so the extension host stops listing it,
			// but present in no Agent Host list either.
			class AdoptAgent extends MockAgent {
				constructor() { super('copilot'); }
				override async listChatsToMigrate(): Promise<IAgentChatMetadata[]> {
					return [];
				}
				async ensureChatAdopted(_chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
					return { adopted: true, eligible: true };
				}
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new AdoptAgent());
			registerTestAgentProvider(localService, agent);
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			const session = AgentSession.uri('copilot', 'adopted-registration-fails');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			const registry = (localService as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;
			registry.register = async () => { throw new Error('registry unavailable'); };

			await assert.rejects(() => localService.restoreSession(session));
		});

		test('does not materialize state for an unregistered chat that is not adoptable', async () => {
			// An external chat (e.g. created by the GitHub app) is hidden while
			// `showExternalSessions` is `none`, so it is absent from the registered
			// list. Restoring it would write `agentSessionData/<id>` and thereby claim
			// it away from the extension host's own Copilot CLI list.
			class NotAdoptableAgent extends MockAgent {
				constructor() { super('copilot'); }
				async ensureChatAdopted(_chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
					return { adopted: false, eligible: false };
				}
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new NotAdoptableAgent()));
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });

			const session = AgentSession.uri('copilot', 'external-chat');
			await assert.rejects(() => localService.restoreSession(session), /not an adoptable legacy chat/);
			assert.strictEqual(getStateManager(localService).getSessionState(session.toString()), undefined);
		});

		test('a passive read/archive action does not adopt a surfaced legacy session (listing must not migrate)', async () => {
			// Regression for #330383: a passive read/archive toggle from the sessions list must not restore/adopt an un-opened legacy session.
			for (const action of [{ type: ActionType.SessionIsReadChanged, isRead: true } as const, { type: ActionType.SessionIsArchivedChanged, isArchived: true } as const]) {
				class AdoptOnOpenAgent extends MockAgent {
					adoptCalls = 0;
					private _adopted = false;
					constructor() { super('copilot'); }
					async ensureChatAdopted(_chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
						this.adoptCalls++;
						this._adopted = true;
						return { adopted: true, eligible: true };
					}
					override async getChatMetadata(chat: URI, _context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
						return this._adopted ? { chat, startTime: Date.now(), modifiedTime: Date.now() } : undefined;
					}
				}

				const db = new TestSessionDatabase();
				const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
				const agent = disposables.add(new AdoptOnOpenAgent());
				registerTestAgentProvider(localService, agent);
				agent.sessionMessages = [];

				const session = AgentSession.uri('copilot', `surfaced-legacy-${action.type}`);
				const sessionStr = session.toString();
				getStateManager(localService).announceSurfacedSession({
					resource: sessionStr,
					provider: 'copilot',
					title: 'Legacy',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					_meta: withSessionEhcliAdoptable(undefined),
				});

				localService.dispatchAction(sessionStr, action, 'test-client', 1, AgentHostClientType.EditorWindow);
				await timeout(0);
				await timeout(0);

				assert.deepStrictEqual(
					{ action: action.type, adoptCalls: agent.adoptCalls, restored: !!getStateManager(localService).getSessionState(sessionStr) },
					{ action: action.type, adoptCalls: 0, restored: false },
				);
			}
		});

		test('a read/archive toggle on an un-loaded session persists and publishes without restoring it', async () => {
			// Regression: routing these toggles through `restoreSession` lost the
			// archived state whenever that restore failed.
			for (const { action, key, expectedStatus } of [
				{ action: { type: ActionType.SessionIsArchivedChanged, isArchived: true } as const, key: AH_META_IS_ARCHIVED_DB_KEY, expectedStatus: SessionStatus.Idle | SessionStatus.IsArchived },
				{ action: { type: ActionType.SessionIsReadChanged, isRead: true } as const, key: AH_META_IS_READ_DB_KEY, expectedStatus: SessionStatus.Idle | SessionStatus.IsRead },
			]) {
				const db = new TestSessionDatabase();
				const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
				const agent = disposables.add(new MockAgent('copilot'));
				registerTestAgentProvider(localService, agent);

				const session = AgentSession.uri('copilot', `passive-${action.type}`);
				const sessionStr = session.toString();
				const summary = {
					resource: sessionStr,
					provider: 'copilot',
					title: 'Idle',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				};
				getStateManager(localService).announceSurfacedSession(summary);
				getStateManager(localService).prepareSessionSummariesForListing([summary]);

				const notifications: INotification[] = [];
				const listener = localService.onDidNotification(n => notifications.push(n));

				localService.dispatchAction(sessionStr, action, 'test-client', 1, AgentHostClientType.EditorWindow);
				await timeout(0);
				await timeout(0);
				listener.dispose();

				const summaryChanged = notifications.find(n => n.type === 'root/sessionSummaryChanged');
				assert.deepStrictEqual({
					action: action.type,
					persisted: await db.getMetadata(key),
					restored: !!getStateManager(localService).getSessionState(sessionStr),
					publishedStatus: summaryChanged?.type === 'root/sessionSummaryChanged' ? summaryChanged.changes.status : undefined,
				}, {
					action: action.type,
					persisted: 'true',
					restored: false,
					publishedStatus: expectedStatus,
				});
			}
		});

		test('archiving an un-loaded session succeeds even when its working directory is gone', async () => {
			// Restore recreates the worktree and throws for a missing directory, and only
			// an *already* archived session resumes read-only — so archiving could never land.
			class MissingWorkingDirectoryAgent extends MockAgent {
				constructor() { super('copilot'); }
				override async materializeChat(): Promise<never> {
					throw new Error('working directory no longer exists');
				}
			}

			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MissingWorkingDirectoryAgent());
			registerTestAgentProvider(localService, agent);

			const session = AgentSession.uri('copilot', 'archive-missing-cwd');
			const sessionStr = session.toString();
			getStateManager(localService).announceSurfacedSession({
				resource: sessionStr,
				provider: 'copilot',
				title: 'Gone',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});

			localService.dispatchAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'test-client', 1, AgentHostClientType.EditorWindow);
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				persisted: await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				restored: !!getStateManager(localService).getSessionState(sessionStr),
			}, {
				persisted: 'true',
				restored: false,
			});
		});

		test('unarchiving an un-loaded session clears the persisted flag', async () => {
			const db = new TestSessionDatabase();
			await db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true');
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new MockAgent('copilot')));

			const session = AgentSession.uri('copilot', 'unarchive-unloaded');
			const sessionStr = session.toString();
			getStateManager(localService).announceSurfacedSession({
				resource: sessionStr,
				provider: 'copilot',
				title: 'Archived',
				status: SessionStatus.Idle | SessionStatus.IsArchived,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});

			localService.dispatchAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: false }, 'test-client', 1, AgentHostClientType.EditorWindow);
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				persisted: await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				restored: !!getStateManager(localService).getSessionState(sessionStr),
			}, {
				persisted: '',
				restored: false,
			});
		});

		test('a read/archive toggle for a session the host does not know creates no session database', async () => {
			// Creating `agentSessionData/<id>` claims a session away from the extension
			// host list, so a toggle must never do it for a never-surfaced session.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new MockAgent('copilot')));

			const sessionStr = AgentSession.uri('copilot', 'never-surfaced').toString();
			localService.dispatchAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'test-client', 1, AgentHostClientType.EditorWindow);
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				metadataWrites: db.setMetadataCalls,
				restored: !!getStateManager(localService).getSessionState(sessionStr),
			}, {
				metadataWrites: [],
				restored: false,
			});
		});

		test('a queued archive toggle still lands when an earlier action restored and residency evicted the session', async () => {
			// The passive route is picked from a snapshot taken at dispatch entry, but the
			// callback runs behind earlier queued dispatches — here one that restores the
			// session. Deciding from the stale snapshot dropped the toggle outright.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			const session = AgentSession.uri('copilot', 'restored-mid-queue');
			const sessionStr = session.toString();
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			const summary = {
				resource: sessionStr,
				provider: 'copilot',
				title: 'Surfaced',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			getStateManager(localService).announceSurfacedSession(summary);
			getStateManager(localService).prepareSessionSummariesForListing([summary]);

			// Both are queued while the session is still un-restored; the first restores it.
			localService.dispatchAction(sessionStr, { type: ActionType.SessionTitleChanged, title: 'Renamed' }, 'test-client', 1, AgentHostClientType.EditorWindow);
			localService.dispatchAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'test-client', 2, AgentHostClientType.EditorWindow);
			for (let i = 0; i < 20; i++) {
				await timeout(0);
			}

			const stateManager = getStateManager(localService);
			assert.deepStrictEqual({
				resident: !!stateManager.getSessionState(sessionStr),
				persisted: await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				surfacedArchived: !!((stateManager.getSurfacedSessionSummary(sessionStr)?.status ?? 0) & SessionStatus.IsArchived),
			}, {
				resident: false,
				persisted: 'true',
				surfacedArchived: true,
			});
		});

		test('archiving a session that was opened and then idle-evicted still persists and publishes', async () => {
			// Eviction emits no `sessionRemoved`, so clients keep listing the session and
			// can archive it; "evicted" must behave like any other un-loaded session.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new MockAgent('copilot')));

			const created = await localService.createSession({ provider: 'copilot' });
			const sessionStr = created.toString();
			getStateManager(localService).prepareSessionSummariesForListing([getStateManager(localService).getSessionSummary(sessionStr)!]);
			getStateManager(localService).removeSession(sessionStr);

			const notifications: INotification[] = [];
			const listener = localService.onDidNotification(n => notifications.push(n));
			localService.dispatchAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'test-client', 1, AgentHostClientType.EditorWindow);
			for (let i = 0; i < 20; i++) {
				await timeout(0);
			}
			listener.dispose();

			const summaryChanged = notifications.find(n => n.type === 'root/sessionSummaryChanged');
			assert.deepStrictEqual({
				persisted: await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				publishedArchived: summaryChanged?.type === 'root/sessionSummaryChanged'
					? !!((summaryChanged.changes.status ?? 0) & SessionStatus.IsArchived)
					: undefined,
			}, {
				persisted: 'true',
				publishedArchived: true,
			});
		});

		test('deleting a session drops its announced summary so a later toggle cannot revive it', async () => {
			// `removeSession` keeps the announced baseline for eviction; deletion must
			// still clear it, or a stale toggle could republish a deleted session.
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new MockAgent('copilot')));

			const created = await localService.createSession({ provider: 'copilot' });
			const sessionStr = created.toString();
			getStateManager(localService).prepareSessionSummariesForListing([getStateManager(localService).getSessionSummary(sessionStr)!]);
			getStateManager(localService).deleteSession(sessionStr);

			assert.strictEqual(getStateManager(localService).getSurfacedSessionSummary(sessionStr), undefined);
		});

		test('a queued toggle still publishes when the session was evicted while it waited', async () => {
			// Mirror of the restored-while-queued case: the session was live at dispatch
			// entry, so the entry-time snapshot says "no passive handling needed", but it
			// was evicted before the callback ran. Persistence rides the envelope either
			// way; the catalogue delta is what goes missing.
			let onWrite: (() => void) | undefined;
			class HookedDb extends TestSessionDatabase {
				override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
					await super.setMetadataValues(values);
					onWrite?.();
				}
			}
			const db = new HookedDb();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, disposables.add(new MockAgent('copilot')));

			const liveSession = (await localService.createSession({ provider: 'copilot' })).toString();
			getStateManager(localService).prepareSessionSummariesForListing([getStateManager(localService).getSessionSummary(liveSession)!]);

			// An un-restored session whose toggle holds the per-client queue with a real
			// async write, giving the second toggle a window to be evicted in.
			const surfaced = AgentSession.uri('copilot', 'queue-holder').toString();
			const surfacedSummary = {
				resource: surfaced,
				provider: 'copilot',
				title: 'Holder',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			getStateManager(localService).announceSurfacedSession(surfacedSummary);
			getStateManager(localService).prepareSessionSummariesForListing([surfacedSummary]);
			onWrite = () => { getStateManager(localService).removeSession(liveSession); onWrite = undefined; };

			const notifications: INotification[] = [];
			const listener = localService.onDidNotification(n => notifications.push(n));
			localService.dispatchAction(surfaced, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'c', 1, AgentHostClientType.EditorWindow);
			localService.dispatchAction(liveSession, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'c', 2, AgentHostClientType.EditorWindow);
			for (let i = 0; i < 30; i++) {
				await timeout(0);
			}
			listener.dispose();

			const published = notifications.find(n => n.type === 'root/sessionSummaryChanged' && n.session === liveSession);
			assert.deepStrictEqual({
				evicted: !getStateManager(localService).getSessionState(liveSession),
				publishedArchived: published?.type === 'root/sessionSummaryChanged'
					? !!((published.changes.status ?? 0) & SessionStatus.IsArchived)
					: undefined,
			}, {
				evicted: true,
				publishedArchived: true,
			});
		});

		test('turning the migrate setting off un-surfaces adoptable legacy sessions that were never opened', async () => {
			class AdoptOnOpenAgent extends MockAgent {
				constructor() { super('copilot'); }
				override async getChatMetadata(): Promise<IAgentChatMetadata | undefined> {
					return undefined; // never adopted
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new AdoptOnOpenAgent());
			registerTestAgentProvider(localService, agent);

			// Setting on, then surface an adoptable legacy session.
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			const session = AgentSession.uri('copilot', 'surfaced-legacy-unsurface');
			const sessionStr = session.toString();
			getStateManager(localService).announceSurfacedSession({
				resource: sessionStr,
				provider: 'copilot',
				title: 'Legacy',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				_meta: withSessionEhcliAdoptable(undefined),
			});
			(localService as unknown as { _announcedSurfacedKeys: Set<string> })._announcedSurfacedKeys.add(sessionStr);

			let removed: string | undefined;
			disposables.add(localService.onDidNotification(n => {
				if (n.type === 'root/sessionRemoved') {
					removed = n.session;
				}
			}));

			// Turn the setting off: the un-opened surfaced entry is dropped.
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: false });

			assert.deepStrictEqual(
				{ surfaced: getStateManager(localService).getSurfacedSessionSummary(sessionStr), removed },
				{ surfaced: undefined, removed: sessionStr },
			);
		});

		test('excludes adoptable-legacy sessions from the list while the migrate setting is off', async () => {
			// Guards against a refresh re-surfacing a registry entry that can no longer be opened while migration is off.
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const adoptable: IAgentSessionMetadata = {
				session: AgentSession.uri('copilot', 'adoptable-list-gate'),
				startTime: Date.now(),
				modifiedTime: Date.now(),
				_meta: withSessionEhcliAdoptable(undefined),
			};
			const shouldInclude = (localService as unknown as { _shouldIncludeSession(s: IAgentSessionMetadata): boolean })._shouldIncludeSession.bind(localService);

			const includedWhileOff = shouldInclude(adoptable);
			getConfigurationService(localService).updateRootConfig({ [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: true });
			const includedWhileOn = shouldInclude(adoptable);

			assert.deepStrictEqual({ includedWhileOff, includedWhileOn }, { includedWhileOff: false, includedWhileOn: true });
		});

		test('restores known session without listing all provider sessions', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			getStateManager(service).deleteSession(session.toString());

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
			assert.ok(getStateManager(service).getSessionState(session.toString()));
		});

		test('falls back to listing sessions when direct metadata restore fails', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			getStateManager(service).deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			copilotAgent.getChatMetadata = async () => {
				throw new Error('direct metadata unavailable');
			};
			const originalListExternalChats = copilotAgent.listExternalChats.bind(copilotAgent);
			let listChatsToMigrateCalled = false;
			copilotAgent.listChatsToMigrate = async () => {
				listChatsToMigrateCalled = true;
				return originalListExternalChats();
			};

			await service.restoreSession(session);

			assert.deepStrictEqual({
				listChatsToMigrateCalled,
				restored: !!getStateManager(service).getSessionState(session.toString()),
			}, {
				listChatsToMigrateCalled: true,
				restored: true,
			});
		});

		test('coalesces concurrent restores for the same session', async () => {
			class BlockingRestoreAgent extends MockAgent {
				// Disable discovery so only restore drives `getChatMetadata` (discovery's
				// reconciliation read is incidental and would race the assertions).
				override readonly onDidDiscoverChats = Event.None;
				readonly metadataReached = new DeferredPromise<void>();
				readonly metadataGate = new DeferredPromise<void>();
				getChatMetadataCalls = 0;
				getSessionMessagesCalls = 0;

				override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
					this.getChatMetadataCalls++;
					this.metadataReached.complete();
					await this.metadataGate.p;
					return super.getChatMetadata(chat, context);
				}

				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					this.getSessionMessagesCalls++;
					return super.getSessionMessages(session);
				}
			}

			const agent = disposables.add(new BlockingRestoreAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
			getStateManager(service).deleteSession(session.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			const firstRestore = service.restoreSession(session);
			await agent.metadataReached.p;
			const secondRestore = service.restoreSession(session);

			assert.strictEqual(agent.getChatMetadataCalls, 1);
			agent.metadataGate.complete();
			await Promise.all([firstRestore, secondRestore]);

			assert.deepStrictEqual({
				messageCalls: agent.getSessionMessagesCalls,
				restored: !!getStateManager(service).getSessionState(session.toString()),
			}, {
				messageCalls: 1,
				restored: true,
			});
		});

		test('hydrates session customizations when restoring an existing session', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			getStateManager(service).deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			let getSessionCustomizationsCalls = 0;
			copilotAgent.getSessionCustomizations = async () => {
				getSessionCustomizationsCalls++;
				return [
					{ type: CustomizationType.Plugin, id: customizationId('file:///restore-skill'), uri: 'file:///restore-skill', name: 'Restore Skill' },
				];
			};

			await service.restoreSession(session);

			const customizations = getStateManager(service).getSessionState(session.toString())?.customizations;
			assert.strictEqual(getSessionCustomizationsCalls, 1);
			assert.strictEqual(customizations?.length, 1);
			assert.strictEqual(customizations?.[0]?.type, CustomizationType.Plugin);
			assert.strictEqual(customizations?.[0]?.name, 'Restore Skill');
			assert.strictEqual(customizations?.[0]?.id, customizationId('file:///restore-skill'));
			assert.strictEqual(isCustomizationEnabled(customizations?.[0] ?? {}), true);
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
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
			getStateManager(service).deleteSession(session.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await assert.rejects(() => service.restoreSession(session), /restore failed/);

			agent.shouldFailRestore = false;
			await service.restoreSession(session);

			assert.deepStrictEqual({
				messageCalls: agent.getSessionMessagesCalls,
				restored: !!getStateManager(service).getSessionState(session.toString()),
			}, {
				messageCalls: 2,
				restored: true,
			});
		});

		test('restores a session with subagent tool calls', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			const state = getStateManager(service).getSessionState(sessionResource.toString());
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
			const childState = getStateManager(service).getSessionState(childSessionUri);
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
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Load real SDK events from fixture (sanitized from ~/.copilot/session-state/)
			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = getStateManager(service).getSessionState(sessionResource.toString());
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
			const childState = getStateManager(service).getSessionState(childSessionUri);
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);

			// Should have the final markdown
			const mdParts = state!.turns[0].responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.length > 0, 'Should have markdown content');
		});

		test('registers subagent summaries without loading child transcripts until subscription', async () => {
			class LazySubagentMockAgent extends MockAgent {
				readonly messageReads: string[] = [];
				private returnEmptyChildOnce = true;
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					this.messageReads.push(session.toString());
					if (parseChatUri(session)?.chatId.startsWith('subagent/') && this.returnEmptyChildOnce) {
						this.returnEmptyChildOnce = false;
						return [];
					}
					return super.getSessionMessages(session);
				}
			}

			const agent = new LazySubagentMockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
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

			const childChatUri = buildSubagentChatUri(sessionResource.toString(), 'tc-sub');
			const childSummary = getStateManager(service).getSessionState(sessionResource.toString())?.chats.find(chat => chat.resource === childChatUri);
			assert.deepStrictEqual({
				childSummary: childSummary ? {
					title: childSummary.title,
					origin: childSummary.origin,
					interactivity: childSummary.interactivity,
				} : undefined,
				childStateBeforeSubscribe: getStateManager(service).getChatState(childChatUri),
				childReadsBeforeSubscribe: agent.messageReads.filter(resource => resource === childChatUri).length,
			}, {
				childSummary: {
					title: 'Find related files',
					origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(sessionResource), toolCallId: 'tc-sub' },
					interactivity: ChatInteractivity.ReadOnly,
				},
				childStateBeforeSubscribe: undefined,
				childReadsBeforeSubscribe: 0,
			});

			await assert.rejects(service.subscribe(URI.parse(childChatUri), 'child-reader-first'), /Subagent transcript is not available yet/);
			assert.strictEqual(getStateManager(service).getChatState(childChatUri), undefined);
			await service.subscribe(URI.parse(childChatUri), 'child-reader-second');
			const childState = getStateManager(service).getChatState(childChatUri);
			assert.ok(childState);
			assert.strictEqual(childState.turns.length, 1);
			assert.strictEqual(agent.messageReads.filter(resource => resource === childChatUri).length, 2);
			assert.strictEqual(getStateManager(service).getSessionState(buildSubagentSessionUri(sessionResource.toString(), 'tc-sub')), undefined);
		});

		test('legacy subagent reconstruction replaces only a generic restored title', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const parent = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(parent);
			const childChat = buildSubagentChatUri(parent.toString(), 'tc-sub');
			const origin = { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tc-sub' } as const;
			getStateManager(service).registerRestoredChatSummary(parent.toString(), childChat, {
				title: 'Subagent',
				origin,
				interactivity: ChatInteractivity.ReadOnly,
			});
			copilotAgent.sessionMessages = [
				{ type: 'message', session: parent, role: 'user', messageId: 'msg-1', content: 'Delegate this', toolRequests: [] },
				{ type: 'message', session: parent, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session: parent, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent', subagentDescription: 'Summarize agent service', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session: parent, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_complete', session: parent, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [] } },
			];
			const turns = await copilotAgent.getSessionMessages(parent);

			await (service as unknown as { _registerRestoredSubagentSummaries(agent: IAgent, parentSession: URI, turns: readonly Turn[]): Promise<void> })._registerRestoredSubagentSummaries(copilotAgent, parent, turns);
			const reconstructedTitle = getStateManager(service).getSessionState(parent.toString())?.chats.find(chat => chat.resource === childChat)?.title;
			getStateManager(service).updateChatTitle(parent.toString(), childChat, 'My Custom Worker');
			await (service as unknown as { _registerRestoredSubagentSummaries(agent: IAgent, parentSession: URI, turns: readonly Turn[]): Promise<void> })._registerRestoredSubagentSummaries(copilotAgent, parent, turns);

			assert.deepStrictEqual({
				reconstructedTitle,
				titleAfterCustomRename: getStateManager(service).getSessionState(parent.toString())?.chats.find(chat => chat.resource === childChat)?.title,
			}, {
				reconstructedTitle: 'Summarize agent service',
				titleAfterCustomRename: 'My Custom Worker',
			});
		});

		test('legacy subagent reconstruction restores a persisted custom title', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, copilotAgent);
			const parent = await localService.createSession({ provider: 'copilot' });
			const childChat = buildSubagentChatUri(parent.toString(), 'tc-sub');
			await db.setMetadata(`customChatTitle:${childChat}`, 'Persisted Worker');
			copilotAgent.sessionMessages = [
				{ type: 'message', session: parent, role: 'user', messageId: 'msg-1', content: 'Delegate this', toolRequests: [] },
				{ type: 'message', session: parent, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session: parent, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent', subagentDescription: 'Generated Worker', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session: parent, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_complete', session: parent, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [] } },
			];

			await (localService as unknown as { _registerRestoredSubagentSummaries(agent: IAgent, parentSession: URI, turns: readonly Turn[]): Promise<void> })._registerRestoredSubagentSummaries(copilotAgent, parent, await copilotAgent.getSessionMessages(parent));

			assert.strictEqual(getStateManager(localService).getSessionState(parent.toString())?.chats.find(chat => chat.resource === childChat)?.title, 'Persisted Worker');
		});

		test('subscribing to a restored canonical subagent chat reconstructs it on demand', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const parent = session.toString();
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review this code', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found files' }] } },
			];

			const chatUri = buildSubagentChatUri(parent, 'tc-sub');
			const snapshot = await service.subscribe(URI.parse(chatUri), 'client-restored-subagent');

			assert.deepStrictEqual({
				resource: snapshot.resource,
				turnCount: getStateManager(service).getChatState(chatUri)?.turns.length,
				origin: getStateManager(service).getChatState(chatUri)?.origin,
				legacySessionExists: !!getStateManager(service).getSessionState(buildSubagentSessionUri(parent, 'tc-sub')),
			}, {
				resource: chatUri,
				turnCount: 1,
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(parent), toolCallId: 'tc-sub' },
				legacySessionExists: false,
			});
		});

		test('a restored subagent identifies the peer chat that actually spawned it', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			const parent = sessionResource.toString();
			// The parent transcript deliberately carries no `tc-sub` tool call:
			// the spawn edge lives on a peer chat, so falling back to the
			// default chat would misattribute the subagent.
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'main chat', toolRequests: [] },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'Ran ls' }, parentToolCallId: 'tc-sub' },
			];
			await service.restoreSession(sessionResource);

			const peerChat = buildChatUri(parent, 'peer-spawner');
			getStateManager(service).addChat(parent, peerChat, {
				title: 'Peer',
				turns: [{
					id: 'peer-turn', state: TurnState.Complete, usage: undefined,
					message: { text: 'delegate', origin: { kind: MessageKind.User } },
					responseParts: [{
						kind: ResponsePartKind.ToolCall,
						toolCall: {
							toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task',
							status: ToolCallStatus.Completed, confirmed: ToolCallConfirmationReason.NotNeeded,
							invocationMessage: 'Delegating...', success: true, pastTenseMessage: 'Delegated',
							content: [{ type: ToolResultContentType.Subagent, resource: buildSubagentChatUri(parent, 'tc-sub'), title: 'Find related files' }],
						},
					}],
				}],
			});

			const chatUri = buildSubagentChatUri(parent, 'tc-sub');
			await service.subscribe(URI.parse(chatUri), 'client-peer-spawned-subagent');

			const chatState = getStateManager(service).getChatState(chatUri);
			assert.deepStrictEqual({ origin: chatState?.origin, title: chatState?.title }, {
				origin: { kind: ChatOriginKind.Tool, chat: peerChat, toolCallId: 'tc-sub' },
				title: 'Find related files',
			});
		});

		test('inner assistant messages from subagent route via envelope agentId (fixture)', async () => {
			// Regression for the SDK migration away from the deprecated
			// `data.parentToolCallId` to the envelope-level `agentId`. Newer
			// session logs only tag subagent events with `agentId`, so the
			// reopen/replay path must resolve those back to the parent tool
			// call id — otherwise the subagent's assistant messages leak into
			// the main session as extra turns.
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session-agentid.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = getStateManager(service).getSessionState(sessionResource.toString());
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
			const childState = getStateManager(service).getSessionState(childSessionUri);
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
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
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
				childTurns: getStateManager(service).getSessionState(childSessionUri.toString())?.turns.length,
			}, {
				messageCalls: 1,
				childTurns: 1,
			});
		});

		test('restores an evicted subagent before applying a dispatched chat action', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
			const sessionResource = (await copilotAgent.listSessions())[0].session;
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found files' }] } },
			];
			await service.restoreSession(sessionResource);

			const childSession = URI.parse(buildSubagentSessionUri(sessionResource.toString(), 'tc-sub'));
			getStateManager(service).deleteSession(childSession.toString());
			const childChat = buildDefaultChatUri(childSession);
			service.dispatchAction(childChat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'continued-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'Continue', origin: { kind: MessageKind.User } },
			}, 'client-1', 1);

			for (let i = 0; i < 50 && getStateManager(service).getChatState(childChat.toString())?.activeTurn?.id !== 'continued-turn'; i++) {
				await timeout(0);
			}

			assert.strictEqual(getStateManager(service).getChatState(childChat.toString())?.activeTurn?.id, 'continued-turn');
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
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
			// Drop any tracking so only the scheme fallback can resolve the agent.
			getStateManager(service).deleteSession(session.toString());
			await service.restoreSession(session);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);

			const state = getStateManager(service).getSessionState(session.toString());
			assert.deepStrictEqual({
				created,
				inCatalog: !!state?.chats.some(c => c.resource.toString() === chatUri.toString()),
			}, {
				created: [{ session: session.toString(), chat: chatUri.toString() }],
				inCatalog: true,
			});
		});

		test('stamps the exhaustive host chat context on the provisioning boundaries', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const defaultChat = buildDefaultChatUri(session);
			const peerChat = buildChatUri(session, 'peer-1');
			await service.createChat(session, URI.parse(peerChat));

			const recorded = agent.chatContexts
				.filter(entry => entry.boundary === 'createChat')
				.map(entry => {
					const context = entry.context as IAgentChatContext;
					return {
						boundary: entry.boundary,
						chat: entry.chat.toString(),
						configurationResource: context.configurationResource.toString(),
						resource: context.resource.toString(),
					};
				});

			assert.deepStrictEqual(recorded, [
				{
					boundary: 'createChat',
					chat: defaultChat,
					configurationResource: session.toString(),
					// The session-backed chat's provider storage scope is the session.
					resource: session.toString(),
				},
				{
					boundary: 'createChat',
					chat: peerChat,
					configurationResource: session.toString(),
					resource: peerChat,
				},
			]);
		});

		test('routes a tracked session and registers the chat with its title in the catalog', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { title: 'Peer Chat' });

			const state = getStateManager(service).getSessionState(session.toString());
			assert.deepStrictEqual(
				state?.chats.find(c => c.resource.toString() === chatUri.toString())?.title,
				'Peer Chat',
			);
		});

		test('creates the backing chat before registering the chat in the catalog', async () => {
			let catalogHadChatDuringCreate: boolean | undefined;
			class MultiChatAgent extends MockAgent {
				override async createChat(session: URI, chat: URI): Promise<void> {
					const state = getStateManager(service).getSessionState(session.toString());
					catalogHadChatDuringCreate = !!state?.chats.some(c => c.resource.toString() === chat.toString());
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);

			assert.strictEqual(catalogHadChatDuringCreate, false);
		});

		test('throws when the provider does not support multiple chats', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));

			await assert.rejects(
				() => service.createChat(session, chatUri),
				/does not support multiple chats/,
			);
		});

		test('disposeChat removes the chat from the catalog and tears down the chat', async () => {
			const disposed: string[] = [];
			const cleanupStarted = new DeferredPromise<void>();
			const releaseCleanup = new DeferredPromise<void>();
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
				override async disposeChat(_session: URI, chat: URI): Promise<void> {
					disposed.push(chat.toString());
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri);
			const checkpointService = getCheckpointService(service);
			const originalDiscard = checkpointService.discardChatTurnStartCheckpoints.bind(checkpointService);
			disposables.add(toDisposable(() => checkpointService.discardChatTurnStartCheckpoints = originalDiscard));
			checkpointService.discardChatTurnStartCheckpoints = async (checkpointSession, checkpointChat) => {
				assert.deepStrictEqual({
					session: checkpointSession.toString(),
					chat: checkpointChat.toString(),
				}, {
					session: session.toString(),
					chat: chatUri.toString(),
				});
				cleanupStarted.complete();
				await releaseCleanup.p;
				await originalDiscard(checkpointSession, checkpointChat);
			};

			const disposing = service.disposeChat(session, chatUri);
			await cleanupStarted.p;
			assert.strictEqual(getStateManager(service).getSessionState(session.toString())?.chats.some(c => c.resource.toString() === chatUri.toString()), true);
			releaseCleanup.complete();
			await disposing;

			const state = getStateManager(service).getSessionState(session.toString());
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
				constructor(provider: 'copilot' = 'copilot') {
					super(provider);
					this.chats.getMessages = async (chat: URI) => {
						// Resolve in the reverse of catalog order so a resolution-order
						// append would scramble the catalog; the restore must keep a,b,c.
						const delays: Record<string, number> = { 'peer-a': 30, 'peer-b': 15, 'peer-c': 0 };
						await timeout(delays[parseChatUri(chat)?.chatId ?? ''] ?? 0);
						return [];
					};
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Seed the orchestrator catalog in a,b,c order via createChat.
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-a')));
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-b')));
			await localService.createChat(session, URI.parse(buildChatUri(session, 'peer-c')));

			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = getStateManager(localService).getSessionState(session.toString());
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
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			// Seed the source (default) chat with two turns and a title.
			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
				{ id: 't2', state: TurnState.Complete, message: { text: 'second', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			getStateManager(service).seedDefaultChatTurns(session.toString(), sourceTurns);
			getStateManager(service).updateChatTitle(session.toString(), buildDefaultChatUri(session.toString()), 'My Session');

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 't1' } });

			const newChatState = getStateManager(service).getChatState(chatUri.toString());
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
				forkSource: buildDefaultChatUri(session),
				forkTurnId: 't1',
				mappingSize: 1,
				mappedFromT1: newTurnIds[0],
				newTurnCount: 1,
				newTurnIsRemapped: true,
				title: 'Forked: My Session',
			});
		});

		test('fork records a Fork origin naming the exact source chat and host-visible turn', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(): Promise<void> { }
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			getStateManager(service).seedDefaultChatTurns(session.toString(), [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			]);

			const chatUri = URI.parse(buildChatUri(session, 'peer-fork-origin'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 't1' } });

			assert.deepStrictEqual(getStateManager(service).getChatState(chatUri.toString())?.origin, {
				kind: ChatOriginKind.Fork,
				chat: buildDefaultChatUri(session.toString()),
				turnId: 't1',
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
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			getStateManager(service).seedDefaultChatTurns(session.toString(), sourceTurns);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 'missing' } });

			const newChatState = getStateManager(service).getChatState(chatUri.toString());
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, agent);
			const { session } = await createAgentSession(agent);
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
			assert.deepStrictEqual(getStateManager(localService).getSessionState(sessionResource.toString())?.turns.map(t => t.id), ['real-1', 'local-1']);

			// Fork the default chat AT the local turn into a new peer chat.
			const peerUri = URI.parse(buildChatUri(sessionResource, 'peer-1'));
			await localService.createChat(sessionResource, peerUri, { fork: { source: URI.parse(defaultChatUri), turnId: 'local-1' } });

			const peerTurns = getStateManager(localService).getChatState(peerUri.toString())?.turns ?? [];
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
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await svc.createChat(session, chatUri);

			const beforeRestart = await svc.listSessions();

			// Simulate a host restart: a fresh service over the same persisted
			// databases, with a fresh agent still leaking the backing session.
			const restartAgent = disposables.add(new LeakyMultiChatAgent('copilot'));
			const restarted = disposables.add(createTestAgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(restarted, restartAgent);
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

		test('createSession carries client-owned _meta slots and drops unknown ones', async () => {
			const perSession = createPerSessionDataService();
			const agent = disposables.add(new MockAgent('copilot'));
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);

			const session = await svc.createSession({
				provider: 'copilot',
				workingDirectories: [URI.file('/repo')],
				_meta: {
					...withChatSurfaceMeta(withEphemeralSessionMeta(undefined, true), { surface: 'editorInline', languageId: 'typescript', targetUri: 'file:///repo/inline.ts' }),
					// Session `_meta` is a whitelist, so an unrecognized slot must not survive.
					'vscode.chat.unknownFutureSlot': { hello: 'world' },
				},
			});

			const state = getStateManager(svc).getSessionState(session.toString());
			assert.deepStrictEqual({
				ephemeral: readEphemeralSessionMeta(state ?? {}).isEphemeral,
				surface: readChatSurfaceMeta(state ?? {}),
				unknownSlot: state?._meta?.['vscode.chat.unknownFutureSlot'],
			}, {
				ephemeral: true,
				surface: { surface: 'editorInline', languageId: 'typescript', targetUri: 'file:///repo/inline.ts' },
				unknownSlot: undefined,
			});
		});

		test('ephemeral session teardown clears its discovery tombstone', async () => {
			const perSession = createPerSessionDataService();
			const agent = disposables.add(new MockAgent('copilot'));
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);
			const registry = (svc as unknown as { _sessionRegistry: AgentSessionRegistry })._sessionRegistry;

			const session = await svc.createSession({
				provider: 'copilot',
				_meta: withEphemeralSessionMeta(undefined, true),
			});
			const tombstonedBeforeDispose = await registry.isTombstoned(session);
			await svc.disposeSession(session);

			assert.deepStrictEqual({
				tombstonedBeforeDispose,
				tombstonedAfterDispose: await registry.isTombstoned(session),
			}, {
				tombstonedBeforeDispose: true,
				tombstonedAfterDispose: false,
			});
		});

		test('ephemeral sessions never appear in direct or overlay listSessions paths', async () => {
			const perSession = createPerSessionDataService();
			const overlaySession = AgentSession.uri('copilot', 'ephemeral-overlay-session');
			const directSession = AgentSession.uri('copilot', 'ephemeral-direct-session');
			class LeakyAgent extends MockAgent {
				override async listSessions(): Promise<IAgentSessionMetadata[]> {
					return [
						{ session: overlaySession, startTime: Date.now(), modifiedTime: Date.now() },
						{ session: directSession, startTime: Date.now(), modifiedTime: Date.now() },
					];
				}
			}

			const agent = disposables.add(new LeakyAgent('copilot'));
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(svc, agent);
			await svc.createSession({
				provider: 'copilot',
				session: overlaySession,
				_meta: withEphemeralSessionMeta(undefined, true),
			});
			await svc.createSession({
				provider: 'copilot',
				session: directSession,
				_meta: withEphemeralSessionMeta(undefined, true),
			});

			const firstList = await svc.listSessions();
			const registeredBeforeRestart = await svc.getRegisteredSessions();

			const restartedAgent = disposables.add(new LeakyAgent('copilot'));
			const restarted = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(restarted, restartedAgent);
			const afterRestart = await restarted.listSessions();

			assert.deepStrictEqual({
				overlayIncludesEphemeral: getStateManager(svc).getOverlaySessionSummaries().some(s => s.resource === overlaySession.toString()),
				directListIncludesEphemeral: firstList.some(s => s.session.toString() === directSession.toString()),
				registeredBeforeRestart: registeredBeforeRestart.map(s => s.toString()),
				restartedListIncludesEphemeral: afterRestart.some(s => s.session.toString() === overlaySession.toString() || s.session.toString() === directSession.toString()),
				registeredAfterRestart: (await restarted.getRegisteredSessions()).map(s => s.toString()),
			}, {
				overlayIncludesEphemeral: false,
				directListIncludesEphemeral: false,
				registeredBeforeRestart: [],
				restartedListIncludesEphemeral: false,
				registeredAfterRestart: [],
			});
		});

		test('createChat succeeds and persists the backing-session marker after one transient write failure', async () => {
			// A DB whose `setMetadata` can be told to fail for the peer-chat
			// backing marker key a configurable number of times, to simulate a
			// transient persistence failure that happens strictly after the
			// chat already exists.
			class FailingBackingMarkerDatabase extends TestSessionDatabase {
				private _remainingBackingWriteFailures = 0;
				failNextBackingWrites(count: number): void { this._remainingBackingWriteFailures = count; }
				override async setMetadata(key: string, value: string): Promise<void> {
					if (key === 'peerChatBacking' && this._remainingBackingWriteFailures > 0) {
						this._remainingBackingWriteFailures--;
						throw new Error('backing marker persistence failed');
					}
					return super.setMetadata(key, value);
				}
			}
			class BackedMultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<IAgentCreateChatResult> {
					return { providerData: 'blob', backingSession: AgentSession.uri(this.id, 'backing-sdk-id') };
				}
			}

			const db = new FailingBackingMarkerDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new BackedMultiChatAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));

			// Only the peer chat's backing-marker write should fail — not the
			// default chat's (already persisted above during createSession).
			db.failNextBackingWrites(1);

			// createChat must resolve successfully: the chat was already added to
			// the catalog and announced before the best-effort marker write is
			// attempted, so a marker-persistence failure must not diverge the
			// create result from what subscribers already observed.
			await svc.createChat(session, chatUri);

			const state = getStateManager(svc).getSessionState(session.toString());
			assert.deepStrictEqual({
				chatCreated: !!getStateManager(svc).getChatState(chatUri.toString()),
				inCatalog: !!state?.chats.some(c => c.resource.toString() === chatUri.toString()),
				markerPersisted: db.setMetadataCalls.some(c => c.key === 'peerChatBacking' && c.value === chatUri.toString()),
			}, {
				chatCreated: true,
				inCatalog: true,
				// A single transient failure is retried inline and succeeds.
				markerPersisted: true,
			});
		});

		test('createChat succeeds and in-process-suppresses the backing session when the marker write keeps failing', async () => {
			class FailingBackingMarkerDatabase extends TestSessionDatabase {
				private _remainingBackingWriteFailures = 0;
				failNextBackingWrites(count: number): void { this._remainingBackingWriteFailures = count; }
				override async setMetadata(key: string, value: string): Promise<void> {
					if (key === 'peerChatBacking' && this._remainingBackingWriteFailures > 0) {
						this._remainingBackingWriteFailures--;
						throw new Error('backing marker persistence failed');
					}
					return super.setMetadata(key, value);
				}
			}
			class BackedMultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<IAgentCreateChatResult> {
					return { providerData: 'blob', backingSession: AgentSession.uri(this.id, 'backing-sdk-id') };
				}
			}

			const db = new FailingBackingMarkerDatabase();
			const svc = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new BackedMultiChatAgent('copilot'));
			registerTestAgentProvider(svc, agent);
			const session = await svc.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			const backingSession = AgentSession.uri('copilot', 'backing-sdk-id');

			// Both the initial write and its retry fail: the marker never
			// persists durably for this backing session.
			db.failNextBackingWrites(2);

			await svc.createChat(session, chatUri);

			const state = getStateManager(svc).getSessionState(session.toString());
			assert.strictEqual(!!getStateManager(svc).getChatState(chatUri.toString()), true, 'chat should still be created');
			assert.strictEqual(!!state?.chats.some(c => c.resource.toString() === chatUri.toString()), true, 'chat should still be in the catalog');
			assert.strictEqual(db.setMetadataCalls.some(c => c.key === 'peerChatBacking' && c.value === chatUri.toString()), false, 'the marker never persisted durably');

			// Simulate the provider's own SDK-level store also enumerating this
			// backing session (as a real `listExternalChats` would), so a
			// subsequent backfill sweep would resurrect it as a standalone
			// top-level session if the in-process suppression did not protect it.
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(backingSession), backingSession);

			// Even without a durable marker, the in-process suppression keeps the
			// backing session out of both listSessions and the registry: it must
			// never resurface as a duplicate top-level session.
			const listed = (await svc.listSessions()).map(s => s.session.toString());
			assert.ok(!listed.includes(backingSession.toString()), 'the unpersisted backing session must not leak into listSessions');

			const registered = (await svc.getRegisteredSessions()).map(s => s.toString());
			assert.ok(!registered.includes(backingSession.toString()), 'the unpersisted backing session must not leak into the registry via backfill');
		});
	});

	suite('createChat side chats', () => {

		class SideChatAgent extends MockAgent {
			lastCreateOptions: IAgentCreateChatOptions | undefined;
			createChatResult: IAgentCreateChatResult | undefined;
			readonly chatMessages = new Map<string, readonly Turn[]>();
			materializeCalls = 0;
			override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
				this.lastCreateOptions = options;
				return this.createChatResult;
			}
			override async materializeChat(chat: URI): Promise<void> {
				// The default chat is always offered to materializeChat on restore
				// too; these tests are only concerned with peer-chat resolution.
				if (isDefaultChatUri(chat)) {
					return;
				}
				this.materializeCalls++;
			}
			override async getSessionMessages(chat: URI): Promise<readonly Turn[]> {
				return this.chatMessages.get(chat.toString()) ?? super.getSessionMessages(chat);
			}
		}

		function completedTurn(id: string, userText = 'user text', assistantText = 'assistant text'): Turn {
			return {
				id,
				state: TurnState.Complete,
				message: { text: userText, origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: `${id}-md`, content: assistantText }],
				usage: undefined,
			};
		}

		test('rejects a side chat whose source turn does not exist', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatUri = URI.parse(buildChatUri(session, 'side-1'));

			await assert.rejects(
				() => service.createChat(session, chatUri, { sideChat: { source: session, turnId: 'missing' } }),
				/side chat source turn/,
			);
		});

		test('rejects an empty side-chat selection snapshot', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			getStateManager(service).seedDefaultChatTurns(session.toString(), [completedTurn('t1')]);
			const chatUri = URI.parse(buildChatUri(session, 'side-1'));

			await assert.rejects(
				() => service.createChat(session, chatUri, { sideChat: { source: session, turnId: 't1', selection: { text: ' \n ' } } }),
				/selection text must be non-empty/,
			);
		});

		test('rejects a side chat whose source chat is in a different session', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const sessionA = await service.createSession({ provider: 'copilot' });
			const sessionB = await service.createSession({ provider: 'copilot' });
			getStateManager(service).seedDefaultChatTurns(sessionB.toString(), [completedTurn('t1')]);
			const chatUri = URI.parse(buildChatUri(sessionA, 'side-1'));

			await assert.rejects(
				() => service.createChat(sessionA, chatUri, { sideChat: { source: sessionB, turnId: 't1' } }),
				/does not belong to session/,
			);
		});

		test('creates a fresh peer with a SideChat origin and no copied source turns', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			getStateManager(service).seedDefaultChatTurns(session.toString(), [completedTurn('t1'), completedTurn('t2')]);
			const chatUri = URI.parse(buildChatUri(session, 'side-1'));
			const defaultChatUri = buildDefaultChatUri(session);
			const selection = { text: '  selected text  ', responsePartId: 'response-part-1' };

			await service.createChat(session, chatUri, { sideChat: { source: session, turnId: 't1', selection } });
			const state = getStateManager(service).getChatState(chatUri.toString());

			assert.deepStrictEqual({
				origin: state?.origin,
				copiedTurns: state?.turns.length,
				forkForwarded: agent.lastCreateOptions?.fork && {
					source: agent.lastCreateOptions.fork.source.toString(),
					turnId: agent.lastCreateOptions.fork.turnId,
					independentQueue: agent.lastCreateOptions.fork.independentQueue,
				},
			}, {
				origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: 't1', selection },
				copiedTurns: 0,
				forkForwarded: { source: defaultChatUri, turnId: 't1', independentQueue: true },
			});
		});

		test('creates a side chat from a completed local turn without losing its stable source turn identity', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const { session } = await createAgentSession(agent);
			const sessionResource = (await agent.listSessions())[0].session;
			const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'real-1', content: 'first question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'real-1-a', content: 'first answer', toolRequests: [] },
			];
			const localTurn: Turn = {
				id: 'local-1',
				state: TurnState.Complete,
				message: { text: '!command', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			};
			await db.insertLocalTurn({ turnId: 'local-1', chatUri: defaultChatUri, anchorTurnId: 'real-1', seq: 1, payload: JSON.stringify(localTurn) });
			await localService.restoreSession(sessionResource);
			const chatUri = URI.parse(buildChatUri(sessionResource, 'side-local'));

			await localService.createChat(sessionResource, chatUri, { sideChat: { source: URI.parse(defaultChatUri), turnId: 'local-1' } });

			assert.deepStrictEqual({
				origin: getStateManager(localService).getChatState(chatUri.toString())?.origin,
				forkForwarded: agent.lastCreateOptions?.fork && {
					source: agent.lastCreateOptions.fork.source.toString(),
					turnId: agent.lastCreateOptions.fork.turnId,
					independentQueue: agent.lastCreateOptions.fork.independentQueue,
				},
			}, {
				origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: 'local-1' },
				forkForwarded: {
					source: defaultChatUri,
					turnId: 'real-1',
					independentQueue: true,
				},
			});
		});

		test('creates a fresh side chat from the first active turn', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const sourceChat = buildDefaultChatUri(session);
			service.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'active-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'still running', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);
			getStateManager(service).dispatchServerAction(sourceChat, {
				type: ActionType.ChatResponsePart,
				turnId: 'active-turn',
				part: { kind: ResponsePartKind.Markdown, id: 'partial', content: 'partial answer' },
			});
			const chatUri = URI.parse(buildChatUri(session, 'side-active'));

			await service.createChat(session, chatUri, { sideChat: { source: URI.parse(sourceChat), turnId: 'active-turn' } });

			assert.deepStrictEqual({
				sourceActiveTurn: getStateManager(service).getChatState(sourceChat)?.activeTurn?.id,
				origin: getStateManager(service).getChatState(chatUri.toString())?.origin,
				forkForwarded: agent.lastCreateOptions?.fork
					? {
						source: agent.lastCreateOptions.fork.source.toString(),
						turnId: agent.lastCreateOptions.fork.turnId,
						independentQueue: agent.lastCreateOptions.fork.independentQueue,
					}
					: undefined,
			}, {
				sourceActiveTurn: 'active-turn',
				origin: { kind: ChatOriginKind.SideChat, chat: sourceChat, turnId: 'active-turn' },
				forkForwarded: undefined,
			});
		});

		test('creates a side chat from a later active turn without losing the current user question', async () => {
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const sourceChat = buildDefaultChatUri(session);
			getStateManager(service).seedDefaultChatTurns(session.toString(), [
				completedTurn('t1', 'first question', 'first answer'),
				completedTurn('t2', 'second question', 'second answer'),
			]);
			service.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'active-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'second question', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);
			getStateManager(service).dispatchServerAction(sourceChat, {
				type: ActionType.ChatResponsePart,
				turnId: 'active-turn',
				part: { kind: ResponsePartKind.Markdown, id: 'partial', content: 'partial answer' },
			});
			const chatUri = URI.parse(buildChatUri(session, 'side-active-later'));

			await service.createChat(session, chatUri, { sideChat: { source: URI.parse(sourceChat), turnId: 'active-turn' } });

			assert.deepStrictEqual({
				origin: getStateManager(service).getChatState(chatUri.toString())?.origin,
				forkForwarded: agent.lastCreateOptions?.fork && {
					source: agent.lastCreateOptions.fork.source.toString(),
					turnId: agent.lastCreateOptions.fork.turnId,
					independentQueue: agent.lastCreateOptions.fork.independentQueue,
				},
			}, {
				origin: { kind: ChatOriginKind.SideChat, chat: sourceChat, turnId: 'active-turn' },
				forkForwarded: {
					source: sourceChat,
					turnId: 't2',
					independentQueue: true,
				},
			});
		});

		test('skips trailing local turns while anchoring an active side chat', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const { session } = await createAgentSession(agent);
			const sessionResource = (await agent.listSessions())[0].session;
			const sourceChat = buildDefaultChatUri(sessionResource.toString());
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'real-1', content: 'first question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'real-1-a', content: 'first answer', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'real-2', content: 'second question', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'real-2-a', content: 'second answer', toolRequests: [] },
			];
			const localTurn: Turn = {
				id: 'local-turn',
				state: TurnState.Complete,
				message: { text: '!command', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			};
			await db.insertLocalTurn({ turnId: localTurn.id, chatUri: sourceChat, anchorTurnId: 'real-2', seq: 1, payload: JSON.stringify(localTurn) });
			await localService.restoreSession(sessionResource);
			localService.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'active-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'still running', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);
			const chatUri = URI.parse(buildChatUri(sessionResource, 'side-active-local'));

			await localService.createChat(sessionResource, chatUri, { sideChat: { source: URI.parse(sourceChat), turnId: 'active-turn' } });

			assert.deepStrictEqual({
				origin: getStateManager(localService).getChatState(chatUri.toString())?.origin,
				forkForwarded: agent.lastCreateOptions?.fork && {
					source: agent.lastCreateOptions.fork.source.toString(),
					turnId: agent.lastCreateOptions.fork.turnId,
					independentQueue: agent.lastCreateOptions.fork.independentQueue,
				},
			}, {
				origin: { kind: ChatOriginKind.SideChat, chat: sourceChat, turnId: 'active-turn' },
				forkForwarded: {
					source: sourceChat,
					turnId: 'real-2',
					independentQueue: true,
				},
			});
		});

		test('persists and restores the SideChat origin', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SideChatAgent('copilot'));
			agent.createChatResult = { inheritedTurnId: 'provider-turn' };
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			getStateManager(localService).seedDefaultChatTurns(session.toString(), [completedTurn('t1')]);
			const chatUri = URI.parse(buildChatUri(session, 'side-1'));
			const defaultChatUri = buildDefaultChatUri(session);
			const selection = { text: '  selected text  ', responsePartId: 'response-part-1' };
			await localService.createChat(session, chatUri, { sideChat: { source: session, turnId: 't1', selection } });

			let persistedEntry: { origin?: unknown; inheritedTurnId?: string } | undefined;
			for (let i = 0; i < 50; i++) {
				const raw = await db.getMetadata('peerChats');
				if (raw !== undefined) {
					const parsed = JSON.parse(raw) as { uri: string; origin?: unknown }[];
					persistedEntry = parsed.find(entry => entry.uri === chatUri.toString());
					if (persistedEntry?.origin) {
						break;
					}
				}
				await timeout(1);
			}

			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persistedOrigin: persistedEntry?.origin,
				persistedInheritedTurnId: persistedEntry?.inheritedTurnId,
				restoredOrigin: getStateManager(localService).getSessionState(session.toString())?.chats.find(chat => chat.resource === chatUri.toString())?.origin,
				restoredInheritedTurnId: getStateManager(localService).getChatInheritedTurnId(chatUri.toString()),
				restoredChatState: getStateManager(localService).getChatState(chatUri.toString()),
			}, {
				persistedOrigin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: 't1', selection },
				persistedInheritedTurnId: 'provider-turn',
				restoredOrigin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: 't1', selection },
				restoredInheritedTurnId: 'provider-turn',
				restoredChatState: undefined,
			});
		});

		test('resolves a restored peer side-chat source without resolving the target chat', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const source = URI.parse(buildChatUri(session, 'peer-source'));
			const target = URI.parse(buildChatUri(session, 'peer-side'));
			agent.chatMessages.set(source.toString(), [completedTurn('source-turn')]);
			await db.setMetadata('peerChats', JSON.stringify([{ uri: source.toString(), providerData: 'source-blob' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const resolvedChats: string[] = [];
			const resolveChatState = getStateManager(localService).resolveChatState.bind(getStateManager(localService));
			getStateManager(localService).resolveChatState = async chat => {
				resolvedChats.push(chat);
				return resolveChatState(chat);
			};
			await localService.createChat(session, target, { sideChat: { source, turnId: 'source-turn' } });

			assert.deepStrictEqual({
				materializeCalls: agent.materializeCalls,
				resolvedChats,
				forkSource: agent.lastCreateOptions?.fork?.source.toString(),
				sourceResolved: !!getStateManager(localService).getChatState(source.toString()),
			}, {
				materializeCalls: 1,
				resolvedChats: [source.toString()],
				forkSource: source.toString(),
				sourceResolved: true,
			});
		});

		test('hydrates a missing peer chat when resolving a generic Chat attachment', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new SideChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peerChat = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerChat);
			for (let i = 0; i < 50 && await db.getMetadata('peerChats') === undefined; i++) {
				await timeout(1);
			}
			agent.chatMessages.set(peerChat.toString(), [completedTurn('peer-turn', 'Remember X', 'Remembered')]);
			getStateManager(localService).removeChat(session.toString(), peerChat.toString());

			const sent = Event.toPromise(agent.onDidSendMessage);
			localService.dispatchAction(buildDefaultChatUri(session), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: {
					text: 'What was remembered?',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Chat,
						resource: peerChat.toString(),
						endTurn: 'peer-turn',
						label: 'Earlier chat',
					}],
				},
			}, 'client-1', 1);
			await sent;

			const attachment = agent.sendMessageCalls[0].attachments?.[0];
			assert.deepStrictEqual({
				peerHydrated: !!getStateManager(localService).getChatState(peerChat.toString()),
				type: attachment?.type,
				hasTranscript: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes('User: Remember X'),
			}, {
				peerHydrated: true,
				type: MessageAttachmentKind.Simple,
				hasTranscript: true,
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
			readonly legacyCreateChatCalls: URI[] = [];
			readonly chatCalls: { op: string; args: string[] }[] = [];
			readonly disposeChatErrors = new Map<string, Error>();

			// The legacy peer-chat method is present too; it must NOT be used
			// when the chats surface exists.
			override async createChat(_session: URI, chat: URI): Promise<void> {
				this.legacyCreateChatCalls.push(chat);
			}

			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: async (chat: URI, context: URI | IAgentChatContext, options?: IAgentCreateChatOptions) => {
					const { configurationResource } = resolveAgentChatContext(context, chat);
					if (options?.fork) {
						this.chatCalls.push({ op: 'fork', args: [configurationResource.toString(), chat.toString(), options.fork.source.toString(), options.fork.turnId] });
						return { providerData: 'pd-fork' };
					}
					if (this.sessionCreateCalls.some(created => created.toString() === configurationResource.toString())) {
						this.chatCalls.push({ op: 'createChat', args: [configurationResource.toString(), chat.toString(), options?.title ?? '', options?.model?.id ?? ''] });
						return { providerData: 'pd' };
					}
					const baseResult = await base.createChat(chat, context, options);
					if (baseResult) {
						this.chatCalls.push({ op: 'createChat', args: [configurationResource.toString(), chat.toString()] });
						this.sessionCreateCalls.push(configurationResource);
						return baseResult;
					}
					return baseResult;
				},
				disposeChat: async (chat: URI) => {
					this.chatCalls.push({ op: 'disposeChat', args: [chat.toString()] });
					const error = this.disposeChatErrors.get(chat.toString());
					if (error) {
						throw error;
					}
				},
				releaseChat: async (chat: URI) => {
					this.chatCalls.push({ op: 'releaseChat', args: [chat.toString()] });
				},
				sendMessage: async () => { },
				abort: async () => { },
				changeModel: async () => { },
				changeAgent: async () => { },
				getMessages: async (chat: URI) => {
					this.chatCalls.push({ op: 'getMessages', args: [chat.toString()] });
					return [];
				},
			}));
		}

		test('session provisioning and additional chats route through the chat surface', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);

			const session = await service.createSession({ provider: 'copilot', model: { id: 'model-1' } });
			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { title: 'Peer' });
			await service.disposeChat(session, chatUri);
			await service.disposeSession(session);

			const defaultChatUri = buildDefaultChatUri(session);
			assert.deepStrictEqual({
				sessionCreate: agent.sessionCreateCalls.map(s => s.toString()),
				legacyCreateChat: agent.legacyCreateChatCalls.length,
				chatOps: agent.chatCalls.map(c => c.op),
				createDefaultChatArgs: agent.chatCalls.filter(c => c.op === 'createChat')[0]?.args,
				peerChatArgs: agent.chatCalls.filter(c => c.op === 'createChat')[1]?.args,
				disposeChatArgs: agent.chatCalls.filter(c => c.op === 'disposeChat').map(c => c.args[0]),
			}, {
				sessionCreate: [session.toString()],
				legacyCreateChat: 0,
				chatOps: ['createChat', 'createChat', 'disposeChat', 'disposeChat'],
				createDefaultChatArgs: [session.toString(), defaultChatUri],
				peerChatArgs: [session.toString(), chatUri.toString(), 'Peer', ''],
				disposeChatArgs: [chatUri.toString(), defaultChatUri],
			});
		});

		test('collapsed session creation persists and restores exact default-chat provider data', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const calls: { op: string; providerData?: string }[] = [];
			class ExactDefaultChatAgent extends MockAgent {
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						if (!result) {
							return undefined;
						}
						return {
							...result,
							providerData: 'default-backing',
							backingSession: AgentSession.uri(this.id, 'sdk-default'),
						};
					},
					disposeChat: async () => { },
					releaseChat: async () => { },
					sendMessage: async () => { },
					abort: async () => { },
					changeModel: async () => { },
					changeAgent: async () => { },
					getMessages: async () => [],
				}));

				override async materializeChat(_chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
					calls.push({ op: 'materialize', providerData });
				}
			}
			const agent = disposables.add(new ExactDefaultChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persisted: await db.getMetadata('defaultChatProviderData'),
				calls,
			}, {
				persisted: 'default-backing',
				calls: [{ op: 'materialize', providerData: 'default-backing' }],
			});
		});

		/**
		 * An agent whose {@link IAgent.materializeChat} can recover a
		 * default-chat backing that was never persisted in the AH catalog
		 * (e.g. a legacy session created before AH tracked provider data).
		 * When offered `undefined` it returns a recovered result; when
		 * offered an already-canonical blob it just records the call and
		 * returns a *different* value, so tests can prove that a canonical
		 * blob is never overwritten by whatever the agent returns afterwards.
		 */
		class RecoveringDefaultChatAgent extends MockAgent {
			readonly materializeCalls: (string | undefined)[] = [];
			recoveryCalls = 0;
			async recoverLegacyChat(): Promise<IAgentCreateChatResult> {
				this.recoveryCalls++;
				return { providerData: 'recovered-backing', backingSession: AgentSession.uri(this.id, 'sdk-recovered') };
			}
			override async materializeChat(_chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
				this.materializeCalls.push(providerData);
				return { providerData: 'should-never-be-persisted' };
			}
		}

		test('host-restore-slice: restoring a legacy default chat recovers before canonical materialization and persists additively', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RecoveringDefaultChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			// Created without any default-chat provider data ever being
			// persisted — a stand-in for a legacy session.
			const session = await localService.createSession({ provider: 'copilot' });
			assert.strictEqual(await db.getMetadata('defaultChatProviderData'), undefined);
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persisted: await db.getMetadata('defaultChatProviderData'),
				recoveryCalls: agent.recoveryCalls,
				materializeCalls: agent.materializeCalls,
			}, {
				persisted: 'recovered-backing',
				recoveryCalls: 1,
				materializeCalls: ['recovered-backing'],
			});
		});

		test('external session restore uses materialization and never invokes legacy adoption or recovery', async () => {
			class ExternalRestoreAgent extends MockAgent {
				adoptionCalls = 0;
				recoveryCalls = 0;
				materializeContexts: IAgentChatContext[] = [];

				async ensureChatAdopted(): Promise<IAgentChatAdoptionResult> {
					this.adoptionCalls++;
					return { adopted: true, eligible: true };
				}

				async recoverLegacyChat(): Promise<IAgentCreateChatResult> {
					this.recoveryCalls++;
					return { providerData: 'legacy-backing' };
				}

				override async materializeChat(_chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
					assert.ok(!URI.isUri(context));
					this.materializeContexts.push(context);
					assert.strictEqual(providerData, undefined);
					return { providerData: 'external-backing' };
				}
			}

			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ExternalRestoreAgent('copilot'));
			const session = AgentSession.uri('copilot', 'external-restore');
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(AgentSession.id(session), session);
			registerTestAgentProvider(localService, agent);
			await localService.listSessions();
			getStateManager(localService).deleteSession(session.toString());

			await localService.restoreSession(session);

			assert.deepStrictEqual({
				adoptionCalls: agent.adoptionCalls,
				recoveryCalls: agent.recoveryCalls,
				hasExternalContext: agent.materializeContexts.map(context => Object.keys(context).includes('external')),
				persisted: await db.getMetadata('defaultChatProviderData'),
			}, {
				adoptionCalls: 0,
				recoveryCalls: 0,
				hasExternalContext: [false],
				persisted: 'external-backing',
			});
		});

		test('host-restore-slice: a second restore reads the recovered providerData directly and never re-recovers or re-persists it', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RecoveringDefaultChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			const persistedAfterFirstRestore = await db.getMetadata('defaultChatProviderData');

			// Simulate another restart: the previously-recovered blob is now
			// canonical, so this restore must offer it (not `undefined`) and
			// must not persist over it again.
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persistedAfterFirstRestore,
				persistedAfterSecondRestore: await db.getMetadata('defaultChatProviderData'),
				recoveryCalls: agent.recoveryCalls,
				materializeCalls: agent.materializeCalls,
			}, {
				persistedAfterFirstRestore: 'recovered-backing',
				persistedAfterSecondRestore: 'recovered-backing',
				recoveryCalls: 1,
				materializeCalls: ['recovered-backing', 'recovered-backing'],
			});
		});

		test('host-restore-slice: a canonical default-chat providerData blob is never rewritten by a recovered materializeChat result', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RecoveringDefaultChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			// Seed a canonical providerData blob directly, as if it had been
			// persisted by a normal (non-legacy) session creation.
			await db.setMetadata('defaultChatProviderData', 'canonical-backing');
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persisted: await db.getMetadata('defaultChatProviderData'),
				recoveryCalls: agent.recoveryCalls,
				materializeCalls: agent.materializeCalls,
			}, {
				// materializeChat is still offered the canonical blob and
				// returns a *different* value, but since providerData was
				// already defined the catalog must not be rewritten.
				persisted: 'canonical-backing',
				recoveryCalls: 0,
				materializeCalls: ['canonical-backing'],
			});
		});

		test('host-restore-slice: a default chat with neither a persisted nor a recovered backing restores its history without binding anything', async () => {
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			// The base mock has no `materializeChat` at all, so restore has
			// nothing to re-attach and no bind fallback to reach for.
			const agent = disposables.add(new MockAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({ provider: 'copilot' });
			agent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
			];
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			assert.deepStrictEqual({
				persisted: await db.getMetadata('defaultChatProviderData'),
				turns: getStateManager(localService).getSessionState(session.toString())?.turns.map(turn => turn.id),
			}, {
				persisted: undefined,
				turns: ['msg-1'],
			});
		});

		test('session disposal disposes every chat — peers first, the default chat last', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatA = URI.parse(buildChatUri(session, 'peer-a'));
			const chatB = URI.parse(buildChatUri(session, 'peer-b'));
			await service.createChat(session, chatA);
			await service.createChat(session, chatB);

			await service.disposeSession(session);

			assert.deepStrictEqual(
				agent.chatCalls.filter(call => call.op === 'disposeChat'),
				[
					{ op: 'disposeChat', args: [chatA.toString()] },
					{ op: 'disposeChat', args: [chatB.toString()] },
					{ op: 'disposeChat', args: [buildDefaultChatUri(session)] },
				],
			);
		});

		test('session disposal visits every chat before throwing the first error', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const chatA = URI.parse(buildChatUri(session, 'peer-a'));
			const chatB = URI.parse(buildChatUri(session, 'peer-b'));
			await service.createChat(session, chatA);
			await service.createChat(session, chatB);
			agent.disposeChatErrors.set(chatA.toString(), new Error('first peer disposal failed'));

			await assert.rejects(service.disposeSession(session), /first peer disposal failed/);

			assert.deepStrictEqual(agent.chatCalls.filter(call => call.op === 'disposeChat'), [
				{ op: 'disposeChat', args: [chatA.toString()] },
				{ op: 'disposeChat', args: [chatB.toString()] },
				{ op: 'disposeChat', args: [buildDefaultChatUri(session)] },
			]);
		});

		test('a create-time failure rolls back the exact default chat', async () => {
			// A session data service that cannot open a database makes the
			// default-chat backing write — the last step of provisioning —
			// throw, which is what drives the create-time rollback.
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createNullSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			class BackingChatSurfaceAgent extends ChatSurfaceAgent {
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						return result ? { ...result, providerData: 'pd-default' } : result;
					},
				}));
			}
			const agent = disposables.add(new BackingChatSurfaceAgent('copilot'));
			registerTestAgentProvider(localService, agent);

			await assert.rejects(localService.createSession({ provider: 'copilot' }));

			const session = agent.sessionCreateCalls[0];
			assert.deepStrictEqual({
				created: agent.sessionCreateCalls.length,
				// Creation only ever provisions the default chat, so the
				// rollback is its exact inverse: dispose that one chat.
				rollback: agent.chatCalls.filter(call => call.op === 'disposeChat'),
			}, {
				created: 1,
				rollback: [
					{ op: 'disposeChat', args: [buildDefaultChatUri(session)] },
				],
			});
		});

		test('fork routes to chats.fork with the resolved source chat', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const sourceTurns: Turn[] = [
				{ id: 't1', state: TurnState.Complete, message: { text: 'first', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined },
			];
			getStateManager(service).seedDefaultChatTurns(session.toString(), sourceTurns);

			const chatUri = URI.parse(buildChatUri(session, 'peer-1'));
			await service.createChat(session, chatUri, { fork: { source: session, turnId: 't1' } });

			const forkCall = agent.chatCalls.find(c => c.op === 'fork');
			assert.deepStrictEqual(forkCall?.args, [session.toString(), chatUri.toString(), buildDefaultChatUri(session), 't1']);
		});

		test('fork rejects a provider-spawned source before calling the provider', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const source = buildSubagentChatUri(session.toString(), 'tool-1');
			getStateManager(service).addChat(session.toString(), source, {
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(session), toolCallId: 'tool-1' },
				turns: [{ id: 't1', state: TurnState.Complete, message: { text: 'work', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined }],
			});

			const target = URI.parse(buildChatUri(session, 'peer-1'));
			await assert.rejects(
				service.createChat(session, target, { fork: { source: URI.parse(source), turnId: 't1' } }),
				/cannot fork provider-spawned chat/,
			);
			assert.strictEqual(agent.chatCalls.some(call => call.op === 'fork'), false);
		});

		test('restore reads the default chat via chats.getMessages on the default chat URI', async () => {
			const agent = disposables.add(new ChatSurfaceAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const { session } = await createAgentSession(agent);
			getStateManager(service).deleteSession(session.toString());

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
			override readonly onDidSpawnChat = this._onDidSpawnChat.event;

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
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const parentChat = URI.parse(buildDefaultChatUri(session.toString()));
			const spawned = URI.parse(buildChatUri(session, 'spawned-1'));
			agent.fireSpawn({
				session,
				chat: spawned,
				parent: { chat: parentChat, toolCallId: 'tc-task-1' },
				title: 'Explore',
			});

			const chatState = getStateManager(service).getChatState(spawned.toString());
			const sessionChats = (getStateManager(service).getSessionState(session.toString())?.chats ?? []).map(c => c.resource);
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

		test('onDidSpawnChat without a parent adds the chat with the plain user origin', async () => {
			const agent = disposables.add(new SpawnChannelAgent('copilot'));
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });

			const spawned = URI.parse(buildChatUri(session, 'spawned-2'));
			agent.fireSpawn({ session, chat: spawned });

			const chatState = getStateManager(service).getChatState(spawned.toString());
			assert.deepStrictEqual({
				// No spawn edge to record, but the catalog is exhaustive: every
				// chat carries an origin, so it falls back to the plain
				// user-created one rather than being left without provenance.
				origin: chatState?.origin,
				inCatalog: chatState !== undefined,
			}, {
				origin: { kind: ChatOriginKind.User },
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
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
				taskDescription: 'Review package.json structure',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			const chatState = getStateManager(service).getChatState(subagentUri);
			const matching = (getStateManager(service).getSessionState(session.toString())?.chats ?? []).filter(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				catalogEntries: matching.length,
				title: chatState?.title,
				origin: chatState?.origin,
				interactivity: chatState?.interactivity,
				hasStartedTurn: getStateManager(service).getActiveTurnId(subagentUri) !== undefined,
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
			registerTestAgentProvider(service, copilotAgent);
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
			const catalog = getStateManager(service).getSessionState(session.toString())?.chats ?? [];
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
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			assert.strictEqual(getStateManager(service).getChatState(subagentUri)?.title, 'Explore');
		});

		test('membership stays a single entry when the agent also mirrors the subagent onto onDidSpawnChat, regardless of order', async () => {
			// Mirror the real copilot/claude agents, which ALSO bridge their
			// subagent signals onto onDidSpawnChat. The orchestrator's
			// progress sequencer and the agent's spawn bridge both funnel to the
			// idempotent _onChatSpawned, so the catalog must gain exactly
			// one entry no matter which listener runs first.
			class BridgingSubagentAgent extends MockAgent {
				private readonly _onDidSpawnChat = new Emitter<IAgentSpawnChatEvent>();
				override readonly onDidSpawnChat = this._onDidSpawnChat.event;
				private readonly _bridge = this.onDidChatProgress(signal => {
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
			registerTestAgentProvider(service, agent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			agent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub',
				agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores',
			});

			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			const matching = (getStateManager(service).getSessionState(session.toString())?.chats ?? []).filter(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				catalogEntries: matching.length,
				origin: getStateManager(service).getChatState(subagentUri)?.origin,
				hasStartedTurn: getStateManager(service).getActiveTurnId(subagentUri) !== undefined,
			}, {
				catalogEntries: 1,
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tc-sub' },
				hasStartedTurn: true,
			});
		});

		test('an inner tool call arriving before subagent_started is buffered and drained onto the subagent chat', async () => {
			registerTestAgentProvider(service, copilotAgent);
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
			const subState = getStateManager(service).getSessionState(subagentUri);
			const innerOnSubagent = subState?.activeTurn?.responseParts.some(rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1');
			const innerOnParent = getStateManager(service).getSessionState(session.toString())?.activeTurn?.responseParts.some(rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1');
			assert.deepStrictEqual({ innerOnSubagent, innerOnParent }, { innerOnSubagent: true, innerOnParent: false });
		});

		test('a subagent chat survives subagent_completed (stays live and subscribable, its turn completed)', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });
			const parentChat = buildDefaultChatUri(session.toString());
			startParentTurn(session, 'turn-1');

			copilotAgent.fireProgress({ kind: 'subagent_started', chat: URI.parse(parentChat), toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });
			const subagentUri = buildSubagentChatUri(session.toString(), 'tc-sub');
			assert.ok(getStateManager(service).getChatState(subagentUri), 'precondition: subagent chat present after start');

			copilotAgent.fireProgress({ kind: 'subagent_completed', chat: URI.parse(parentChat), toolCallId: 'tc-sub' });

			const stillInCatalog = (getStateManager(service).getSessionState(session.toString())?.chats ?? []).some(c => c.resource === subagentUri);
			assert.deepStrictEqual({
				hasChatState: getStateManager(service).getChatState(subagentUri) !== undefined,
				stillInCatalog,
				hasActiveTurn: getStateManager(service).getActiveTurnId(subagentUri) !== undefined,
			}, {
				hasChatState: true,
				stillInCatalog: true,
				hasActiveTurn: false,
			});
		});

		test('a subagent tool call awaiting user confirmation does not time out before the user responds', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
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
			registerTestAgentProvider(service, copilotAgent);
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
			registerTestAgentProvider(service, copilotAgent);
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
			assert.strictEqual(getStateManager(service).getSnapshot(subagentUri), undefined, 'precondition: resource not registered yet');

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
				registerTestAgentProvider(service, copilotAgent);
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

		async function waitForMetadata(db: TestSessionDatabase, key: string, expected: string): Promise<void> {
			for (let i = 0; i < 50; i++) {
				if (await db.getMetadata(key) === expected) {
					return;
				}
				await timeout(0);
			}
			assert.fail(`Metadata '${key}' did not become '${expected}'`);
		}

		test('rolls back a new peer chat when its catalog entry cannot be persisted', async () => {
			class FailingPeerCatalogDatabase extends TestSessionDatabase {
				failPeerCatalogWrites = false;

				override async setMetadata(key: string, value: string): Promise<void> {
					if (this.failPeerCatalogWrites && key === 'peerChats') {
						throw new Error('peer catalog write failed');
					}
					await super.setMetadata(key, value);
				}
			}

			const db = new FailingPeerCatalogDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			class MultiChatAgent extends MockAgent {
				readonly disposedPeers: URI[] = [];
				override async createChat(): Promise<IAgentCreateChatResult> {
					return { providerData: 'peer-backing' };
				}
				override async disposeChat(_session: URI, chat: URI): Promise<void> {
					this.disposedPeers.push(chat);
				}
			}
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peer = URI.parse(buildChatUri(session, 'unpersisted-peer'));
			db.failPeerCatalogWrites = true;

			await assert.rejects(() => localService.createChat(session, peer), /peer catalog write failed/);

			assert.deepStrictEqual({
				chats: getStateManager(localService).getSessionState(session.toString())?.chats.map(chat => chat.resource.toString()),
				disposed: agent.disposedPeers.map(call => call.toString()),
			}, {
				chats: [buildDefaultChatUri(session)],
				disposed: [peer.toString()],
			});
		});

		test('marks a restored peer chat backing session on first materialize, keeping it out of the registered session list', async () => {
			// S2: `_materializeRestoredPeerChat` must persist the backing
			// marker for a *restored* peer chat's backing session, exactly as
			// create-time materialization does, so it does not leak into
			// `getRegisteredSessions()`/`listSessions()` once the provider's
			// own store starts enumerating it too.
			class BackedPeerChatAgent extends MockAgent {
				override async materializeChat(chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					return { providerData, backingSession: AgentSession.uri(this.id, 'restored-peer-backing-sdk-id') };
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new BackedPeerChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));

			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			// First access triggers `_materializeRestoredPeerChat`.
			await localService.subscribe(peerUri, 'peer-reader');

			assert.ok(db.setMetadataCalls.some(c => c.key === 'peerChatBacking'), 'the restored peer chat backing session must have been marked');

			// Simulate the provider's own store now also enumerating the
			// backing session (e.g. an SDK-side listSessions sweep).
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(
				AgentSession.id(AgentSession.uri('copilot', 'restored-peer-backing-sdk-id')),
				AgentSession.uri('copilot', 'restored-peer-backing-sdk-id'),
			);

			const registered = (await localService.listSessions()).map(s => s.session.toString());
			assert.ok(!registered.includes(AgentSession.uri('copilot', 'restored-peer-backing-sdk-id').toString()), 'the backing session must not leak into the registered session list');
		});

		test('persists a replacement backing reported after peer chat materialization', async () => {
			class RematerializingPeerAgent extends MockAgent {
				private readonly _materialized = new Emitter<IAgentMaterializeChatEvent>();
				override readonly onDidMaterializeChat = this._materialized.event;

				override async createChat(): Promise<IAgentCreateChatResult> {
					return { providerData: 'initial-backing' };
				}

				fireRematerialized(chat: URI, result: IAgentCreateChatResult): void {
					this._materialized.fire({ chat, result, workingDirectories: undefined, project: undefined });
				}

				override dispose(): void {
					this._materialized.dispose();
					super.dispose();
				}
			}

			const perSession = createPerSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, perSession.service, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RematerializingPeerAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: agent.id });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			const replacement = AgentSession.uri(agent.id, 'replacement-backing');

			agent.fireRematerialized(peerUri, { providerData: 'replacement-data', backingSession: replacement });
			const sessionDb = perSession.database(session);
			const backingDb = perSession.database(replacement);
			await waitForMetadata(backingDb, 'peerChatBacking', peerUri.toString());
			let catalog = await readCatalog(sessionDb);
			for (let i = 0; i < 50 && catalog.find(entry => entry.uri === peerUri.toString())?.providerData !== 'replacement-data'; i++) {
				await timeout(0);
				catalog = await readCatalog(sessionDb);
			}

			assert.deepStrictEqual({
				providerData: catalog.find(entry => entry.uri === peerUri.toString())?.providerData,
				backingMarker: await backingDb.getMetadata('peerChatBacking'),
			}, {
				providerData: 'replacement-data',
				backingMarker: peerUri.toString(),
			});
		});

		test('restores the snapshotted default chat title after the session is renamed', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(): Promise<void> { }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const sessionUri = session.toString();
			const defaultChat = buildDefaultChatUri(session);
			const peerChat = URI.parse(buildChatUri(session, 'peer'));
			localService.dispatchAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Default A' }, 'test-client', 1);
			await waitForMetadata(db, 'customTitle', 'Default A');

			await localService.createChat(session, peerChat);
			await waitForMetadata(db, `customChatTitle:${defaultChat}`, 'Default A');
			localService.dispatchAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Session B' }, 'test-client', 2);
			await waitForMetadata(db, 'customTitle', 'Session B');

			getStateManager(localService).deleteSession(sessionUri);
			await localService.restoreSession(session);

			const restored = getStateManager(localService).getSessionState(sessionUri);
			assert.deepStrictEqual({
				sessionTitle: restored?.title,
				defaultChatTitle: restored?.chats.find(chat => chat.resource === defaultChat)?.title,
			}, {
				sessionTitle: 'Session B',
				defaultChatTitle: 'Default A',
			});
		});

		test('restore registers peer-chat metadata in catalog order and loads history on first access', async () => {
			const calls: { call: string; uri: string; providerData?: string }[] = [];
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
					// The default chat is always offered to materializeChat on restore
					// too; this test only tracks peer-chat materialization.
					if (isDefaultChatUri(chat)) {
						return;
					}
					calls.push({ call: 'materialize', uri: chat.toString(), providerData });
				}
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					if (parseChatUri(session)?.chatId === 'peer-1') {
						calls.push({ call: 'getMessages', uri: session.toString() });
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			const peerOrigin = { kind: ChatOriginKind.SideChat, chat: buildDefaultChatUri(session), turnId: 'source-turn' };
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1', origin: peerOrigin }]));
			await db.setMetadata(`customChatTitle:${peerUri.toString()}`, 'Persisted Peer Title');
			await db.setChatDraft(peerUri, { text: 'Persisted draft', origin: { kind: MessageKind.User } });

			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = getStateManager(localService).getSessionState(session.toString());
			const restored = {
				calls: [...calls],
				chatIds: (state?.chats ?? []).map(chat => parseChatUri(chat.resource)?.chatId),
				summary: (() => {
					const summary = state?.chats.find(chat => chat.resource.toString() === peerUri.toString());
					return summary && { title: summary.title, origin: summary.origin };
				})(),
				chatState: getStateManager(localService).getChatState(peerUri.toString()),
			};
			await localService.subscribe(peerUri, 'first-peer-reader');
			const hydrated = getStateManager(localService).getChatState(peerUri.toString());

			assert.deepStrictEqual({
				restored,
				firstAccessCalls: calls,
				hydrated: hydrated && {
					title: hydrated.title,
					draft: hydrated.draft?.text,
					origin: hydrated.origin,
					turns: hydrated.turns.map(turn => turn.id),
				},
			}, {
				restored: {
					calls: [],
					chatIds: ['default', 'peer-1'],
					summary: {
						title: 'Persisted Peer Title',
						origin: peerOrigin,
					},
					chatState: undefined,
				},
				firstAccessCalls: [
					{ call: 'materialize', uri: peerUri.toString(), providerData: 'blob-1' },
					{ call: 'getMessages', uri: peerUri.toString() },
				],
				hydrated: {
					title: 'Persisted Peer Title',
					draft: 'Persisted draft',
					origin: peerOrigin,
					turns: ['peer-turn-1'],
				},
			});
		});

		test('coalesces concurrent first access for one restored peer chat', async () => {
			const materialization = new DeferredPromise<void>();
			let materializeCalls = 0;
			let historyCalls = 0;
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					// The default chat is always offered to materializeChat on
					// restore too; it must not block on the peer-chat gate below.
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
					await materialization.p;
				}
				override async getSessionMessages(session: URI): Promise<readonly Turn[]> {
					if (parseChatUri(session)?.chatId === 'peer-1') {
						historyCalls++;
					}
					return [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const first = localService.subscribe(peerUri, 'first-reader');
			const second = localService.subscribe(peerUri, 'second-reader');
			await timeout(0);
			const stateWhileBlocked = getStateManager(localService).getChatState(peerUri.toString());
			const snapshotWhileBlocked = getStateManager(localService).getSnapshot(peerUri.toString());
			materialization.complete();
			await Promise.all([first, second]);

			assert.deepStrictEqual({
				materializeCalls,
				historyCalls,
				stateWhileBlocked,
				snapshotWhileBlocked,
				stateAfterResolve: !!getStateManager(localService).getChatState(peerUri.toString()),
			}, {
				materializeCalls: 1,
				historyCalls: 1,
				stateWhileBlocked: undefined,
				snapshotWhileBlocked: undefined,
				stateAfterResolve: true,
			});
		});

		test('get_session_context resolves a restored peer chat before reading its transcript', async () => {
			let materializeCalls = 0;
			class MultiChatAgent extends MockAgent {
				serverToolHost: IAgentServerToolHost | undefined;
				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
				}
				override async getSessionMessages(chat: URI): Promise<readonly Turn[]> {
					if (parseChatUri(chat)?.chatId === 'peer-1') {
						return [{
							id: 'peer-turn-1',
							state: TurnState.Complete,
							message: { text: 'Remember this', origin: { kind: MessageKind.User } },
							responseParts: [{ kind: ResponsePartKind.Markdown, id: 'peer-response-1', content: 'Remembered' }],
							usage: undefined,
						}];
					}
					return [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const beforeContext = getStateManager(localService).getChatState(peerUri.toString());
			const result = await agent.serverToolHost!.executeTool(
				buildDefaultChatUri(session),
				SessionServerToolName.GetSessionContext,
				{ session: `agent-host-session://copilot/${AgentSession.id(session)}?chat=peer-1` },
			);

			assert.deepStrictEqual({
				beforeContext,
				materializeCalls,
				transcript: JSON.parse(result).transcript,
			}, {
				beforeContext: undefined,
				materializeCalls: 1,
				transcript: [{ turn: 1, state: 'complete', user: 'Remember this', assistant: 'Remembered' }],
			});
		});

		test('session creation tools inherit the calling chat model and session permissions', async () => {
			class ServerToolAgent extends MockAgent {
				readonly createSessionConfigs: (IAgentCreateSessionConfig | undefined)[] = [];
				readonly createChatOptions: (IAgentCreateChatOptions | undefined)[] = [];
				serverToolHost: IAgentServerToolHost | undefined;

				constructor(id: string) {
					super(id);
					// `MockAgent.getInheritedChatConfig` is typed as a zero-arg stub
					// (`(): undefined`) to satisfy `IAgent` on its own, so a same-name
					// class member here that actually reads `config` cannot satisfy
					// TypeScript's base-member override compatibility check. Attach the
					// real implementation as an own property instead of a class override.
					Object.assign(this, {
						getInheritedChatConfig: (config: Readonly<Record<string, unknown>> = {}): Record<string, unknown> | undefined => {
							const inherited: Record<string, unknown> = {};
							for (const key of [SessionConfigKey.AutoApprove, SessionConfigKey.Permissions, ClaudeSessionConfigKey.PermissionMode, CodexSessionConfigKey.PermissionsPreset]) {
								if (config[key] !== undefined) {
									inherited[key] = config[key];
								}
							}
							return inherited;
						},
					});
				}

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}

				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						if (result) {
							this.createSessionConfigs.push({ session: resolveAgentChatContext(context, chat).configurationResource, model: options?.model, workingDirectories: options?.workingDirectories, config: options?.config });
						}
						return result;
					},
				}));

				override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
					this.createChatOptions.push(options);
				}
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const sourceSession = await localService.createSession({ provider: 'copilot' });
			const sourceChat = URI.parse(buildChatUri(sourceSession, 'source-chat'));
			await localService.createChat(sourceSession, sourceChat);
			getStateManager(localService).setSessionConfig(sourceSession.toString(), {
				schema: { type: 'object', properties: {} },
				values: {
					[SessionConfigKey.AutoApprove]: 'autoApprove',
					[SessionConfigKey.Permissions]: { allow: ['shell'], deny: ['write'] },
					[ClaudeSessionConfigKey.PermissionMode]: 'bypassPermissions',
					[CodexSessionConfigKey.PermissionsPreset]: 'full-access',
					[SessionConfigKey.Mode]: 'plan',
				},
			});
			localService.dispatchAction(sourceChat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'source-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'Create more work', origin: { kind: MessageKind.User }, model: { id: 'source-model' } },
			}, 'test-client', 1);
			const sourceModelBeforeCreation = getStateManager(localService).getSessionState(sourceChat.toString())?.activeTurn?.message.model;
			const sessionUrisBeforeCreation = new Set(getStateManager(localService).getSessionUris());

			await agent.serverToolHost!.executeTool(sourceChat.toString(), SessionServerToolName.CreateSession, {
				relationship: 'independent',
				workspace: URI.file('/workspace').toString(),
				prompt: 'new session',
				title: 'New Session',
			});
			const createdSessionUri = getStateManager(localService).getSessionUris().find(uri => !sessionUrisBeforeCreation.has(uri));
			const delegatedMessage = createdSessionUri
				? getStateManager(localService).getChatState(buildDefaultChatUri(createdSessionUri))?.activeTurn?.message
				: undefined;
			await agent.serverToolHost!.executeTool(sourceChat.toString(), SessionServerToolName.CreateSession, {
				relationship: 'currentSession',
				prompt: 'new chat',
				title: 'New Chat',
			});

			assert.deepStrictEqual({
				sourceModelBeforeCreation,
				delegation: delegatedMessage && readAgentMessageDelegationMeta(delegatedMessage),
				sessionConfig: {
					...agent.createSessionConfigs.at(-1),
					session: agent.createSessionConfigs.at(-1)?.session?.scheme,
					workingDirectories: agent.createSessionConfigs.at(-1)?.workingDirectories?.map(uri => uri.toString()),
				},
				chatOptions: agent.createChatOptions.at(-1),
			}, {
				sourceModelBeforeCreation: { id: 'source-model' },
				delegation: {
					sourceSession: sourceSession.toString(),
					sourceChat: sourceChat.toString(),
					sourceTurnId: 'source-turn',
				},
				sessionConfig: {
					session: 'copilot',
					model: { id: 'source-model' },
					workingDirectories: [URI.file('/workspace').toString()],
					config: {
						[SessionConfigKey.AutoApprove]: 'autoApprove',
						[SessionConfigKey.Permissions]: { allow: ['shell'], deny: ['write'] },
						[ClaudeSessionConfigKey.PermissionMode]: 'bypassPermissions',
						[CodexSessionConfigKey.PermissionsPreset]: 'full-access',
					},
				},
				chatOptions: { title: 'New Chat', model: { id: 'source-model' } },
			});
		});

		test('session creation tools inherit pre-merge picker values when agent merge is enabled', async () => {
			class ServerToolAgent extends MockAgent {
				readonly createSessionConfigs: (IAgentCreateSessionConfig | undefined)[] = [];
				serverToolHost: IAgentServerToolHost | undefined;

				constructor(id: string) {
					super(id);
					Object.assign(this, {
						getInheritedChatConfig: (config: Readonly<Record<string, unknown>> = {}): Record<string, unknown> | undefined => {
							const inherited: Record<string, unknown> = {};
							for (const key of [SessionConfigKey.AutoApprove, SessionConfigKey.Mode, ClaudeSessionConfigKey.PermissionMode, CodexSessionConfigKey.PermissionsPreset]) {
								if (config[key] !== undefined) {
									inherited[key] = config[key];
								}
							}
							return inherited;
						},
					});
				}

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}

				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						if (result) {
							this.createSessionConfigs.push({ session: resolveAgentChatContext(context, chat).configurationResource, model: options?.model, workingDirectories: options?.workingDirectories, config: options?.config });
						}
						return result;
					},
				}));
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const sourceSession = await localService.createSession({ provider: 'copilot' });
			const sourceChat = buildDefaultChatUri(sourceSession);
			getStateManager(localService).setSessionConfig(sourceSession.toString(), {
				schema: { type: 'object', properties: {} },
				values: {
					[SessionConfigKey.AgentMerge]: { enabled: true },
					[SessionConfigKey.AgentMergeController]: {
						injectedConfiguration: {
							previous: {
								[SessionConfigKey.AutoApprove]: 'default',
								[SessionConfigKey.Mode]: 'interactive',
								[ClaudeSessionConfigKey.PermissionMode]: 'acceptEdits',
								[CodexSessionConfigKey.PermissionsPreset]: 'read-only',
							},
							applied: {
								[SessionConfigKey.AutoApprove]: 'assisted',
								[SessionConfigKey.Mode]: 'autopilot',
								[ClaudeSessionConfigKey.PermissionMode]: 'auto',
								[CodexSessionConfigKey.PermissionsPreset]: 'danger-full-access',
							},
						},
					},
					[SessionConfigKey.AutoApprove]: 'assisted',
					[SessionConfigKey.Mode]: 'autopilot',
					[ClaudeSessionConfigKey.PermissionMode]: 'auto',
					[CodexSessionConfigKey.PermissionsPreset]: 'danger-full-access',
				},
			});
			localService.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'source-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'create a child session', origin: { kind: MessageKind.User }, model: { id: 'source-model' } },
			}, 'test-client', 1);

			await agent.serverToolHost!.executeTool(sourceChat, SessionServerToolName.CreateSession, {
				relationship: 'independent',
				workspace: URI.file('/workspace').toString(),
				prompt: 'new session',
				title: 'New Session',
			});

			assert.deepStrictEqual(agent.createSessionConfigs.at(-1)?.config, {
				[SessionConfigKey.AutoApprove]: 'default',
				[SessionConfigKey.Mode]: 'interactive',
				[ClaudeSessionConfigKey.PermissionMode]: 'acceptEdits',
				[CodexSessionConfigKey.PermissionsPreset]: 'read-only',
			});
		});

		test('session creation tools preserve the provider default model on the active turn', async () => {
			class ServerToolAgent extends MockAgent {
				readonly createSessionConfigs: (IAgentCreateSessionConfig | undefined)[] = [];
				serverToolHost: IAgentServerToolHost | undefined;

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}

				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: async (chat, context, options) => {
						const result = await base.createChat(chat, context, options);
						if (result) {
							this.createSessionConfigs.push({ session: resolveAgentChatContext(context, chat).configurationResource, model: options?.model, workingDirectories: options?.workingDirectories, config: options?.config });
						}
						return result;
					},
				}));
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const sourceSession = await localService.createSession({ provider: 'copilot' });
			const sourceChat = buildDefaultChatUri(sourceSession);
			getStateManager(localService).dispatchServerAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'previous-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'previous', origin: { kind: MessageKind.User }, model: { id: 'previous-model' } },
			});
			getStateManager(localService).dispatchServerAction(sourceChat, {
				type: ActionType.ChatTurnComplete,
				turnId: 'previous-turn',
				duration: 1,
			});
			localService.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'active-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'use provider default', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);

			await agent.serverToolHost!.executeTool(sourceChat, SessionServerToolName.CreateSession, {
				relationship: 'independent',
				workspace: URI.file('/workspace').toString(),
				prompt: 'new session',
				title: 'New Session',
			});

			assert.strictEqual(agent.createSessionConfigs.at(-1)?.model, undefined);
		});

		test('session orchestration tools seed agent-originated turns', async () => {
			class ServerToolAgent extends MockAgent {
				serverToolHost: IAgentServerToolHost | undefined;

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}
			}

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(new TestSessionDatabase()), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const sourceSession = await localService.createSession({ provider: 'copilot' });
			const sourceChat = buildDefaultChatUri(sourceSession);
			const targetSession = await localService.createSession({ provider: 'copilot' });
			const targetChat = buildDefaultChatUri(targetSession);
			localService.dispatchAction(sourceChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'source-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'delegate this', origin: { kind: MessageKind.User } },
			}, 'test-client', 1);

			await agent.serverToolHost!.executeTool(sourceChat, SessionServerToolName.SendMessage, {
				session: targetSession.toString(),
				message: 'please take over',
			});

			const originOf = (chat: string) => getStateManager(localService).getSessionState(chat)?.activeTurn?.message.origin.kind;
			assert.deepStrictEqual({
				source: originOf(sourceChat),
				target: originOf(targetChat),
			}, {
				source: MessageKind.User,
				target: MessageKind.Agent,
			});
		});

		test('createChat resolves a restored peer fork source before creating the fork', async () => {
			let materializeCalls = 0;
			let providerForkTurnId: string | undefined;
			let providerForkSource: string | undefined;
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
				}
				override async createChat(_session: URI, _chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
					providerForkTurnId = options?.fork?.turnId;
					providerForkSource = options?.fork?.source.toString();
				}
				override async getSessionMessages(chat: URI): Promise<readonly Turn[]> {
					return parseChatUri(chat)?.chatId === 'peer-source'
						? [{
							id: 'source-turn',
							state: TurnState.Complete,
							message: { text: 'Remember this', origin: { kind: MessageKind.User } },
							responseParts: [{ kind: ResponsePartKind.Markdown, id: 'source-response-1', content: 'Remembered' }],
							usage: undefined,
						}]
						: [];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const source = URI.parse(buildChatUri(session, 'peer-source'));
			const target = URI.parse(buildChatUri(session, 'peer-fork'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: source.toString(), providerData: 'source-blob' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const resolvedChats: string[] = [];
			const resolveChatState = getStateManager(localService).resolveChatState.bind(getStateManager(localService));
			getStateManager(localService).resolveChatState = async chat => {
				resolvedChats.push(chat);
				return resolveChatState(chat);
			};
			await localService.createChat(session, target, { fork: { source, turnId: 'source-turn' } });

			assert.deepStrictEqual({
				materializeCalls,
				resolvedChats,
				providerForkTurnId,
				providerForkSource,
				sourceResolved: !!getStateManager(localService).getChatState(source.toString()),
				forkedTurnCount: getStateManager(localService).getChatState(target.toString())?.turns.length,
			}, {
				materializeCalls: 1,
				resolvedChats: [source.toString()],
				providerForkTurnId: 'source-turn',
				providerForkSource: source.toString(),
				sourceResolved: true,
				forkedTurnCount: 1,
			});
		});

		test('materializes distinct restored peer chats in parallel', async () => {
			const started = new Set<string>();
			const gates = new Map<string, DeferredPromise<void>>();
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					started.add(chat.toString());
					await gates.get(chat.toString())!.p;
				}
				override async getSessionMessages(): Promise<readonly Turn[]> { return []; }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const firstPeer = URI.parse(buildChatUri(session, 'peer-1'));
			const secondPeer = URI.parse(buildChatUri(session, 'peer-2'));
			gates.set(firstPeer.toString(), new DeferredPromise<void>());
			gates.set(secondPeer.toString(), new DeferredPromise<void>());
			await db.setMetadata('peerChats', JSON.stringify([
				{ uri: firstPeer.toString(), providerData: 'blob-1' },
				{ uri: secondPeer.toString(), providerData: 'blob-2' },
			]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const first = localService.subscribe(firstPeer, 'first-reader');
			const second = localService.subscribe(secondPeer, 'second-reader');
			for (let i = 0; i < 50 && started.size < 2; i++) {
				await timeout(0);
			}
			const startedBeforeCompletion = [...started].sort();
			gates.get(firstPeer.toString())!.complete();
			gates.get(secondPeer.toString())!.complete();
			await Promise.all([first, second]);

			assert.deepStrictEqual(startedBeforeCompletion, [firstPeer.toString(), secondPeer.toString()].sort());
		});

		test('keeps a peer chat visible and retries after failed materialization', async () => {
			let materializeCalls = 0;
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
					if (materializeCalls === 1) {
						throw new Error('first materialization failed');
					}
				}
				override async getSessionMessages(): Promise<readonly Turn[]> { return []; }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			await assert.rejects(() => localService.subscribe(peerUri, 'first-reader'), /first materialization failed/);
			const visibleAfterFailure = !!getStateManager(localService).getSessionState(session.toString())?.chats.some(chat => chat.resource.toString() === peerUri.toString());
			const stateAfterFailure = getStateManager(localService).getChatState(peerUri.toString());
			await localService.subscribe(peerUri, 'second-reader');

			assert.deepStrictEqual({
				materializeCalls,
				visibleAfterFailure,
				stateAfterFailure,
				stateAfterRetry: !!getStateManager(localService).getChatState(peerUri.toString()),
			}, {
				materializeCalls: 2,
				visibleAfterFailure: true,
				stateAfterFailure: undefined,
				stateAfterRetry: true,
			});
		});

		test('resolves a restored peer chat before applying a dispatched action', async () => {
			const materialization = new DeferredPromise<void>();
			let materializeCalls = 0;
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
					await materialization.p;
				}
				override async getSessionMessages(): Promise<readonly Turn[]> { return []; }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			localService.dispatchAction(peerUri.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'Hello', origin: { kind: MessageKind.User } },
			}, 'client-1', 1);
			for (let i = 0; i < 50 && materializeCalls === 0; i++) {
				await timeout(0);
			}
			const stateWhileBlocked = getStateManager(localService).getChatState(peerUri.toString());
			materialization.complete();
			for (let i = 0; i < 50 && getStateManager(localService).getChatState(peerUri.toString())?.activeTurn?.id !== 'turn-1'; i++) {
				await timeout(0);
			}
			const stateAfterResolution = getStateManager(localService).getChatState(peerUri.toString());

			assert.deepStrictEqual({
				materializeCalls,
				stateWhileBlocked,
				activeTurnAfterResolution: stateAfterResolution?.activeTurn?.id,
			}, {
				materializeCalls: 1,
				stateWhileBlocked: undefined,
				activeTurnAfterResolution: 'turn-1',
			});
		});

		test('restores an evicted session before applying a dispatched default-chat action', async () => {
			const restoration = new DeferredPromise<void>();
			let restoreCalls = 0;
			class RestoringAgent extends MockAgent {
				override async getSessionMessages(): Promise<readonly Turn[]> {
					restoreCalls++;
					await restoration.p;
					return [];
				}
			}
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RestoringAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const chat = buildDefaultChatUri(session);
			getStateManager(localService).deleteSession(session.toString());

			localService.dispatchAction(chat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'Hello after restart', origin: { kind: MessageKind.User } },
			}, 'client-1', 1);
			for (let i = 0; i < 50 && restoreCalls === 0; i++) {
				await timeout(0);
			}
			const stateWhileBlocked = getStateManager(localService).getChatState(chat.toString());
			restoration.complete();
			for (let i = 0; i < 50 && getStateManager(localService).getChatState(chat.toString())?.activeTurn?.id !== 'turn-1'; i++) {
				await timeout(0);
			}
			const stateAfterRestoration = getStateManager(localService).getChatState(chat.toString());

			assert.deepStrictEqual({
				restoreCalls,
				stateWhileBlocked,
				activeTurnAfterRestoration: stateAfterRestoration?.activeTurn?.id,
			}, {
				restoreCalls: 1,
				stateWhileBlocked: undefined,
				activeTurnAfterRestoration: 'turn-1',
			});
		});

		test('restores an evicted session before applying a dispatched session action', async () => {
			const restoration = new DeferredPromise<void>();
			let restoreCalls = 0;
			class RestoringAgent extends MockAgent {
				override async getSessionMessages(): Promise<readonly Turn[]> {
					restoreCalls++;
					await restoration.p;
					return [];
				}
			}
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new RestoringAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({
				provider: 'copilot',
				config: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
			});
			getStateManager(localService).deleteSession(session.toString());

			localService.dispatchAction(session.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { [SessionConfigKey.AutoApprove]: 'default' },
			}, 'client-1', 1);
			for (let i = 0; i < 50 && restoreCalls === 0; i++) {
				await timeout(0);
			}
			const stateWhileBlocked = getStateManager(localService).getSessionState(session.toString());
			restoration.complete();
			for (let i = 0; i < 50 && getStateManager(localService).getSessionState(session.toString())?.config?.values[SessionConfigKey.AutoApprove] !== 'default'; i++) {
				await timeout(0);
			}
			const stateAfterRestoration = getStateManager(localService).getSessionState(session.toString());

			assert.deepStrictEqual({
				restoreCalls,
				stateWhileBlocked,
				autoApproveAfterRestoration: stateAfterRestoration?.config?.values[SessionConfigKey.AutoApprove],
			}, {
				restoreCalls: 1,
				stateWhileBlocked: undefined,
				autoApproveAfterRestoration: 'default',
			});
		});

		test('invalidates a restored peer resolver when its parent session is disposed', async () => {
			const firstMaterialization = new DeferredPromise<void>();
			let materializeCalls = 0;
			class MultiChatAgent extends MockAgent {
				override async materializeChat(chat: URI): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializeCalls++;
					if (materializeCalls === 1) {
						await firstMaterialization.p;
					}
				}
				override async getSessionMessages(): Promise<readonly Turn[]> { return []; }
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = AgentSession.uri('copilot', 'reused-session');
			await localService.createSession({ provider: 'copilot', session });
			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await db.setMetadata('peerChats', JSON.stringify([{ uri: peerUri.toString(), providerData: 'blob-1' }]));
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const firstSubscribe = localService.subscribe(peerUri, 'first-reader');
			for (let i = 0; i < 50 && materializeCalls === 0; i++) {
				await timeout(0);
			}
			const firstSubscribeRejected = assert.rejects(firstSubscribe, /invalidated/);
			const dispose = localService.disposeSession(session);
			firstMaterialization.complete();
			await Promise.all([dispose, firstSubscribeRejected]);
			const stateAfterStaleResolution = getStateManager(localService).getChatState(peerUri.toString());

			await localService.createSession({ provider: 'copilot', session });
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			await localService.subscribe(peerUri, 'second-reader');

			assert.deepStrictEqual({
				materializeCalls,
				stateAfterStaleResolution,
				recreatedPeerState: !!getStateManager(localService).getChatState(peerUri.toString()),
			}, {
				materializeCalls: 2,
				stateAfterStaleResolution: undefined,
				recreatedPeerState: true,
			});
		});

		test('onDidChangeChatData re-persists the updated providerData blob', async () => {
			const onDidChangeChatData = disposables.add(new Emitter<IAgentChatDataChange>());
			const materializedProviderData: Array<string | undefined> = [];
			class MultiChatAgent extends MockAgent {
				override readonly onDidChangeChatData = onDidChangeChatData.event;
				override async createChat(_session: URI, _chat: URI): Promise<{ providerData?: string }> {
					return { providerData: 'v1' };
				}
				override async materializeChat(chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
					if (isDefaultChatUri(chat)) {
						return;
					}
					materializedProviderData.push(providerData);
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			const afterCreate = await readCatalog(db);
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			await localService.subscribe(peerUri, 'peer-reader');

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
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			await localService.subscribe(peerUri, 'restored-peer-reader');

			assert.deepStrictEqual({
				afterCreate: afterCreate.find(e => e.uri === peerUri.toString())?.providerData,
				afterChange: updated.find(e => e.uri === peerUri.toString())?.providerData,
				hydrated: !!getStateManager(localService).getChatState(peerUri.toString()),
				materializedProviderData,
			}, {
				afterCreate: 'v1',
				afterChange: 'v2',
				hydrated: true,
				materializedProviderData: ['v1', 'v2'],
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
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

		test('disposeChat ignores a provider-data update emitted during deletion', async () => {
			class UpdatingDisposeAgent extends MockAgent {
				private readonly _onDidUpdateChatData = new Emitter<{ chat: URI; providerData: string }>();
				override readonly onDidChangeChatData = this._onDidUpdateChatData.event;
				override async createChat(): Promise<IAgentCreateChatResult> {
					return { providerData: 'initial' };
				}
				override async disposeChat(_session: URI, chat: URI): Promise<void> {
					this._onDidUpdateChatData.fire({ chat, providerData: 'late-update' });
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new UpdatingDisposeAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peer = URI.parse(buildChatUri(session, 'peer-race'));
			await localService.createChat(session, peer);

			await localService.disposeChat(session, peer);

			assert.deepStrictEqual({
				catalog: await readCatalog(db),
				inMemory: getStateManager(localService).getSessionState(session.toString())?.chats.some(chat => chat.resource.toString() === peer.toString()),
			}, {
				catalog: [],
				inMemory: false,
			});
		});

		test('disposeChat preserves the chat when catalog removal fails so deletion can be retried', async () => {
			class FailingRemovalDatabase extends TestSessionDatabase {
				failRemoval = false;
				override async setMetadata(key: string, value: string): Promise<void> {
					if (this.failRemoval && key === 'peerChats' && value === '[]') {
						throw new Error('catalog removal failed');
					}
					await super.setMetadata(key, value);
				}
			}
			class MultiChatAgent extends MockAgent {
				override async createChat(): Promise<IAgentCreateChatResult> {
					return { providerData: 'initial' };
				}
				override async disposeChat(): Promise<void> { }
			}
			const db = new FailingRemovalDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new MultiChatAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const peer = URI.parse(buildChatUri(session, 'peer-retry'));
			await localService.createChat(session, peer);
			db.failRemoval = true;

			await assert.rejects(() => localService.disposeChat(session, peer), /catalog removal failed/);
			const retainedAfterFailure = getStateManager(localService).getSessionState(session.toString())?.chats.some(chat => chat.resource.toString() === peer.toString());
			db.failRemoval = false;
			await localService.disposeChat(session, peer);

			assert.deepStrictEqual({
				retainedAfterFailure,
				catalog: await readCatalog(db),
				inMemoryAfterRetry: getStateManager(localService).getSessionState(session.toString())?.chats.some(chat => chat.resource.toString() === peer.toString()),
			}, {
				retainedAfterFailure: true,
				catalog: [],
				inMemoryAfterRetry: false,
			});
		});

		// ---- BC1: one-time legacy `*.chats` migration on restore ----------

		test('legacy *.chats with no peerChats catalog migrates once into the orchestrator catalog', async () => {
			class LegacyAgent extends MockAgent {
				listLegacyCallCount = 0;
				override async createChat(): Promise<IAgentCreateChatResult | void> { }
				constructor(provider: 'copilot' = 'copilot') {
					super(provider);
					this.chats.getMessages = async (chat: URI) => {
						if (chat.scheme === 'ahp-chat') {
							return [{
								id: `${parseChatUri(chat)?.chatId}-turn`,
								state: TurnState.Complete,
								message: { text: 'legacy hi', origin: { kind: MessageKind.User } },
								responseParts: [],
								usage: undefined,
							}];
						}
						return [];
					};
				}
				override async materializeChat(_chat: URI, _context: URI | IAgentChatContext, _providerData?: string): Promise<void> { }
				async listLegacyChatBackings(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
					];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Seed a persisted title for one legacy chat so we can assert the
			// migration restores catalog metadata without loading history.
			const legacyAUri = URI.parse(buildChatUri(session, 'legacy-a'));
			const legacyBUri = URI.parse(buildChatUri(session, 'legacy-b'));
			await db.setMetadata(`customChatTitle:${legacyAUri.toString()}`, 'Legacy A Title');

			// No peerChats key exists (undefined catalog) -> migration runs.
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalogAfterFirst = await readCatalog(db);

			// Second restore: catalog now present -> legacy read not consulted again.
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const restoredState = getStateManager(localService).getSessionState(session.toString());
			assert.deepStrictEqual({
				legacyCalls: agent.listLegacyCallCount,
				catalog: catalogAfterFirst.map(e => ({ uri: e.uri, providerData: e.providerData })),
				aTitle: restoredState?.chats.find(chat => chat.resource === legacyAUri.toString())?.title,
				aState: getStateManager(localService).getChatState(legacyAUri.toString()),
				bState: getStateManager(localService).getChatState(legacyBUri.toString()),
			}, {
				legacyCalls: 1,
				catalog: [
					{ uri: legacyAUri.toString(), providerData: 'lp-a' },
					{ uri: legacyBUri.toString(), providerData: 'lp-b' },
				],
				aTitle: 'Legacy A Title',
				aState: undefined,
				bState: undefined,
			});
		});

		test('an empty ([]) peerChats catalog does not resurrect legacy chats', async () => {
			class LegacyAgent extends MockAgent {
				listLegacyCallCount = 0;
				async listLegacyChatBackings(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' }];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Known-empty catalog must be treated as "no peer chats", never migrated.
			await db.setMetadata('peerChats', '[]');
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = getStateManager(localService).getSessionState(session.toString());
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
				override async materializeChat(): Promise<void> { }
				async listLegacyChatBackings(session: URI): Promise<readonly IAgentLegacyChat[]> {
					this.listLegacyCallCount++;
					return [{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' }];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			const peerUri = URI.parse(buildChatUri(session, 'peer-1'));
			await localService.createChat(session, peerUri);
			await readCatalog(db);

			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);

			const state = getStateManager(localService).getSessionState(session.toString());
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
				override async materializeChat(): Promise<void> { }
				async listLegacyChatBackings(session: URI): Promise<readonly IAgentLegacyChat[]> {
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-c')), providerData: 'lp-c' },
					];
				}
			}
			const db = new TestSessionDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// Absent peerChats key => migration runs and must write the full set once.
			getStateManager(localService).deleteSession(session.toString());
			await localService.restoreSession(session);
			const catalog = await readCatalog(db);

			const restoredIds = (getStateManager(localService).getSessionState(session.toString())?.chats ?? [])
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
				override async materializeChat(): Promise<void> { }
				async listLegacyChatBackings(session: URI): Promise<readonly IAgentLegacyChat[]> {
					return [
						{ uri: URI.parse(buildChatUri(session, 'legacy-a')), providerData: 'lp-a' },
						{ uri: URI.parse(buildChatUri(session, 'legacy-b')), providerData: 'lp-b' },
					];
				}
			}
			const db = new FailingCatalogDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = disposables.add(new LegacyAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });

			// First restore: the single catalog write is rejected. Because the write
			// is all-or-nothing, the key must stay absent (never a proper subset).
			getStateManager(localService).deleteSession(session.toString());
			await assert.rejects(() => localService.restoreSession(session), /simulated catalog write failure/);
			const catalogAfterFailedWrite = await db.getMetadata('peerChats');

			// Second restore: catalog still absent => migration re-runs and now
			// persists the complete set.
			getStateManager(localService).deleteSession(session.toString());
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

	suite('rename server tools', () => {
		test('rename_chat replaces live and persisted default and peer chat titles', async () => {
			class RecordingTitleDatabase extends TestSessionDatabase {
				readonly finalRenamePersisted = new DeferredPromise<void>();
				finalRenameKey: string | undefined;

				override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
					await super.setMetadataValues(values);
					if (this.finalRenameKey && values[this.finalRenameKey] === 'Complete replacement peer chat title') {
						await this.finalRenamePersisted.complete();
					}
				}
			}
			class ServerToolAgent extends MockAgent {
				serverToolHost: IAgentServerToolHost | undefined;

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}
			}

			const db = new RecordingTitleDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(localService).updateRootConfig({ [AgentHostActiveAgentTitleGenerationConfigKey]: true });
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const sessionUri = session.toString();
			const defaultChat = buildDefaultChatUri(session);
			const peerChat = buildChatUri(sessionUri, 'peer-rename');
			db.finalRenameKey = `customChatTitle:${peerChat}`;
			getStateManager(localService).dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Previous user title' });
			await db.setMetadata('customTitle', 'Previous user title');
			await db.setMetadata('customTitleSource', 'user');

			const singleChatResult = await agent.serverToolHost!.executeTool(defaultChat, SessionServerToolName.RenameChat, {
				title: 'Single-chat title',
			});

			getStateManager(localService).addChat(sessionUri, peerChat, { title: 'Previous peer title' });
			getStateManager(localService).dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Multi-chat session title' });
			await db.setMetadata('customTitle', 'Multi-chat session title');
			await db.setMetadata('customTitleSource', 'user');
			await db.setMetadata(`customChatTitle:${peerChat}`, 'Previous peer title');
			await db.setMetadata(`customChatTitleSource:${peerChat}`, 'user');
			await timeout(0);
			getStateManager(localService).prepareSessionSummariesForListing([getStateManager(localService).getSessionSummary(sessionUri)!]);
			const summaryTitleChanged = new DeferredPromise<string>();
			disposables.add(localService.onDidNotification(notification => {
				if (notification.type === NotificationType.SessionSummaryChanged && notification.changes.title) {
					void summaryTitleChanged.complete(notification.changes.title);
				}
			}));

			const multiChatDefaultResult = await agent.serverToolHost!.executeTool(defaultChat, SessionServerToolName.RenameChat, {
				title: 'Complete replacement default chat title',
			});
			const chatResult = await agent.serverToolHost!.executeTool(defaultChat, SessionServerToolName.RenameChat, {
				chat: `agent-host-session://copilot/${AgentSession.id(session)}?chat=peer-rename`,
				title: 'Complete replacement peer chat title',
			});
			await db.finalRenamePersisted.p;
			const summaryTitleChange = await summaryTitleChanged.p;

			assert.deepStrictEqual({
				singleChatResult,
				multiChatDefaultResult,
				chatResult,
				liveSessionTitle: getStateManager(localService).getSessionState(sessionUri)?.title,
				liveDefaultChatTitle: getStateManager(localService).getChatState(defaultChat)?.title,
				liveChatTitle: getStateManager(localService).getChatState(peerChat)?.title,
				persistedSessionTitle: await db.getMetadata('customTitle'),
				persistedSessionSource: await db.getMetadata('customTitleSource'),
				persistedDefaultChatTitle: await db.getMetadata(`customChatTitle:${defaultChat}`),
				persistedDefaultChatSource: await db.getMetadata(`customChatTitleSource:${defaultChat}`),
				persistedChatTitle: await db.getMetadata(`customChatTitle:${peerChat}`),
				persistedChatSource: await db.getMetadata(`customChatTitleSource:${peerChat}`),
				summaryTitleChange,
			}, {
				singleChatResult: 'Renamed chat to "Single-chat title".',
				multiChatDefaultResult: 'Renamed chat to "Complete replacement default chat title".',
				chatResult: 'Renamed chat to "Complete replacement peer chat title".',
				liveSessionTitle: 'Complete replacement default chat title',
				liveDefaultChatTitle: 'Complete replacement default chat title',
				liveChatTitle: 'Complete replacement peer chat title',
				persistedSessionTitle: 'Complete replacement default chat title',
				persistedSessionSource: 'agent',
				persistedDefaultChatTitle: 'Complete replacement default chat title',
				persistedDefaultChatSource: 'agent',
				persistedChatTitle: 'Complete replacement peer chat title',
				persistedChatSource: 'agent',
				summaryTitleChange: 'Complete replacement default chat title',
			});
		});

		test('rename failures preserve live state and both persisted metadata values', async () => {
			class FailingTitleDatabase extends TestSessionDatabase {
				readonly allFailuresObserved = new DeferredPromise<void>();
				private failureCount = 0;

				override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
					if (Object.keys(values).some(key => key.startsWith('customTitle') || key.startsWith('customChatTitle'))) {
						if (++this.failureCount === 3) {
							await this.allFailuresObserved.complete();
						}
						throw new Error('title persistence failed');
					}
					return super.setMetadataValues(values);
				}
			}
			class ServerToolAgent extends MockAgent {
				serverToolHost: IAgentServerToolHost | undefined;

				setServerToolHost(host: IAgentServerToolHost): void {
					this.serverToolHost = host;
				}
			}

			const db = new FailingTitleDatabase();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			getConfigurationService(localService).updateRootConfig({ [AgentHostActiveAgentTitleGenerationConfigKey]: true });
			const agent = disposables.add(new ServerToolAgent('copilot'));
			registerTestAgentProvider(localService, agent);
			const session = await localService.createSession({ provider: 'copilot' });
			const sessionUri = session.toString();
			const defaultChat = buildDefaultChatUri(session);
			const peerChat = buildChatUri(sessionUri, 'peer-failure');
			getStateManager(localService).dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Original session' });
			await db.setMetadata('customTitle', 'Original session');
			await db.setMetadata('customTitleSource', 'user');

			await assert.rejects(
				async () => agent.serverToolHost!.executeTool(defaultChat, SessionServerToolName.RenameChat, { title: 'Session-backed title will fail' }),
				/title persistence failed/
			);

			getStateManager(localService).addChat(sessionUri, peerChat, { title: 'Original chat' });
			await db.setMetadata(`customChatTitle:${defaultChat}`, 'Original session');
			await db.setMetadata(`customChatTitleSource:${defaultChat}`, 'user');
			await db.setMetadata(`customChatTitle:${peerChat}`, 'Original chat');
			await db.setMetadata(`customChatTitleSource:${peerChat}`, 'user');

			await assert.rejects(
				async () => agent.serverToolHost!.executeTool(defaultChat, SessionServerToolName.RenameChat, { title: 'Chat-backed title will fail' }),
				/title persistence failed/
			);
			await assert.rejects(
				async () => agent.serverToolHost!.executeTool(buildDefaultChatUri(session), SessionServerToolName.RenameChat, {
					chat: `agent-host-session://copilot/${AgentSession.id(session)}?chat=peer-failure`,
					title: 'Chat will fail',
				}),
				/title persistence failed/
			);
			await db.allFailuresObserved.p;
			assert.deepStrictEqual({
				liveSession: getStateManager(localService).getSessionState(sessionUri)?.title,
				sessionTitle: await db.getMetadata('customTitle'),
				sessionSource: await db.getMetadata('customTitleSource'),
				liveDefaultChat: getStateManager(localService).getChatState(defaultChat)?.title,
				defaultChatTitle: await db.getMetadata(`customChatTitle:${defaultChat}`),
				defaultChatSource: await db.getMetadata(`customChatTitleSource:${defaultChat}`),
				liveChat: getStateManager(localService).getChatState(peerChat)?.title,
				chatTitle: await db.getMetadata(`customChatTitle:${peerChat}`),
				chatSource: await db.getMetadata(`customChatTitleSource:${peerChat}`),
			}, {
				liveSession: 'Original session',
				sessionTitle: 'Original session',
				sessionSource: 'user',
				liveDefaultChat: 'Original session',
				defaultChatTitle: 'Original session',
				defaultChatSource: 'user',
				liveChat: 'Original chat',
				chatTitle: 'Original chat',
				chatSource: 'user',
			});
		});
	});

	suite('session residency eviction', () => {

		function createResidencyTestService(limit: number, releaseRetryMs = 30_000, registerProvider = true, agent = new MockAgent('copilot'), sessionDataService = nullSessionDataService): { readonly service: AgentService; readonly agent: MockAgent } {
			const testService = disposables.add(createTestAgentService(
				new NullLogService(),
				fileService,
				sessionDataService,
				{ _serviceBrand: undefined } as IProductService,
				createNoopGitService(),
				undefined,
				undefined,
				undefined,
				undefined,
				globalThis.fetch,
				[],
				undefined,
				undefined,
				undefined,
				limit,
				releaseRetryMs,
			));
			disposables.add(toDisposable(() => agent.dispose()));
			if (registerProvider) {
				registerTestAgentProvider(testService, agent);
			}
			return { service: testService, agent };
		}

		async function createUsedSession(testService: AgentService, agent: MockAgent, complete = true): Promise<URI> {
			const session = await testService.createSession({ provider: agent.id });
			const chat = buildDefaultChatUri(session);
			getStateManager(testService).dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: `turn-${AgentSession.id(session)}`, startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } });
			if (complete) {
				getStateManager(testService).dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: `turn-${AgentSession.id(session)}`, duration: 1000 });
			}
			return session;
		}

		async function waitForResidency(predicate: () => boolean, message: string): Promise<void> {
			for (let attempt = 0; attempt < 100; attempt++) {
				if (predicate()) {
					return;
				}
				await timeout(0);
			}
			assert.fail(message);
		}

		setup(() => {
			const zeroCapacity = createResidencyTestService(0, 30_000, false);
			service = zeroCapacity.service;
			copilotAgent = zeroCapacity.agent;
		});

		class DelayedReleaseMockAgent extends MockAgent {
			readonly release = new DeferredPromise<void>();
			readonly events: string[] = [];

			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				releaseChat: async (chat, context) => {
					this.events.push('release:start');
					await base.releaseChat(chat, context);
					await this.release.p;
					this.events.push('release:end');
				},
			}));

			override async getChatMetadata(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatMetadata | undefined> {
				this.events.push('metadata');
				return super.getChatMetadata(chat, context);
			}
		}

		class DeferringReleaseMockAgent extends MockAgent {
			releaseAttempts = 0;

			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				canReleaseChat: async () => {
					this.releaseAttempts++;
					return this.releaseAttempts !== 1;
				},
				releaseChat: (chat, context) => base.releaseChat(chat, context),
			}));
		}

		class DelayedCanReleaseMockAgent extends MockAgent {
			readonly canRelease = new DeferredPromise<void>();
			readonly events: string[] = [];

			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				canReleaseChat: async () => {
					this.events.push('canRelease:start');
					await this.canRelease.p;
					this.events.push('canRelease:end');
					return true;
				},
				releaseChat: async (chat, context) => {
					this.events.push('release');
					await base.releaseChat(chat, context);
				},
			}));
		}

		test('deleting an evicted session disposes every persisted peer chat', async () => {
			class MultiChatAgent extends MockAgent {
				override async createChat(_session: URI, _chat: URI): Promise<void> { }
			}
			const agent = new MultiChatAgent('copilot');
			const residency = createResidencyTestService(1, 30_000, true, agent);
			const first = await createUsedSession(residency.service, residency.agent);
			const peer = URI.parse(buildChatUri(first, 'peer-1'));
			await residency.service.createChat(first, peer);
			const second = await createUsedSession(residency.service, residency.agent);
			await waitForResidency(() => getStateManager(residency.service).getSessionState(first.toString()) === undefined, 'first session was not evicted');

			await residency.service.disposeSession(first);

			assert.deepStrictEqual({
				residentSession: getStateManager(residency.service).getSessionState(second.toString()) !== undefined,
				disposedChats: residency.agent.chatContexts.filter(call => call.boundary === 'disposeChat').map(call => call.chat.toString()),
			}, {
				residentSession: true,
				disposedChats: [peer.toString(), buildDefaultChatUri(first)],
			});
		});

		test('serializes deletion behind an in-flight release preflight', async () => {
			const whenIdleStarted = new DeferredPromise<void>();
			const whenIdle = new DeferredPromise<void>();
			class DelayedIdleDatabase extends TestSessionDatabase {
				override async whenIdle(): Promise<void> {
					whenIdleStarted.complete();
					await whenIdle.p;
				}
			}
			const residency = createResidencyTestService(10, 30_000, true, new MockAgent('copilot'), createSessionDataService(new DelayedIdleDatabase()));
			const session = await createUsedSession(residency.service, residency.agent);
			getStateManager(residency.service).dispatchServerAction(session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
			await whenIdleStarted.p;

			const deletion = residency.service.disposeSession(session);
			whenIdle.complete();
			await deletion;

			assert.deepStrictEqual({
				releases: residency.agent.releaseSessionCalls.map(call => call.toString()),
				disposals: residency.agent.disposeSessionCalls.map(call => call.toString()),
			}, {
				releases: [],
				disposals: [session.toString()],
			});
		});

		test('an empty session created in this lifetime stays observable until GC fires', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const sessionResource = await service.createSession({ provider: 'copilot' });

			service.addSubscriber(sessionResource, 'client-1');
			service.unsubscribe(sessionResource, 'client-1');

			// Empty sessions are routed to the GC pipeline rather than the
			// eviction pipeline, so their state stays observable in the
			// grace window for a re-subscribe to find.
			assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'empty created session must remain observable for the GC grace window');
		});

		test('a session with an active turn is NOT evicted when its last subscriber drops', async () => {
			registerTestAgentProvider(service, copilotAgent);
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

			assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'active-turn session must not be evicted');
		});

		test('a session with an active peer chat is NOT evicted when its last subscriber drops', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				const peerChat = URI.parse(buildChatUri(sessionResource, 'peer-1'));
				getStateManager(service).addChat(sessionResource.toString(), peerChat.toString(), {});
				service.addSubscriber(sessionResource, 'client-1');
				service.dispatchAction(
					peerChat.toString(),
					{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
					'client-1', 1,
				);

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual({
					hasActiveTurn: getStateManager(service).hasActiveTurn(sessionResource.toString()),
					hasCachedState: getStateManager(service).getSessionState(sessionResource.toString()) !== undefined,
					releaseCalls: copilotAgent.releaseSessionCalls.length,
				}, {
					hasActiveTurn: true,
					hasCachedState: true,
					releaseCalls: 0,
				});
			});
		});

		test('a peer turn starting during the session data drain re-arms idle eviction', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const whenIdleStarted = new DeferredPromise<void>();
				const whenIdle = new DeferredPromise<void>();
				class DelayedIdleDatabase extends TestSessionDatabase {
					override async whenIdle(): Promise<void> {
						whenIdleStarted.complete();
						await whenIdle.p;
					}
				}
				const localService = disposables.add(createTestAgentService(
					new NullLogService(),
					fileService,
					createSessionDataService(new DelayedIdleDatabase()),
					{ _serviceBrand: undefined } as IProductService,
					createNoopGitService(),
					undefined,
					undefined,
					undefined,
					undefined,
					globalThis.fetch,
					[],
					undefined,
					undefined,
					undefined,
					0,
				));
				const agent = new MockAgent('copilot');
				disposables.add(toDisposable(() => agent.dispose()));
				registerTestAgentProvider(localService, agent);
				const sessionResource = await localService.createSession({ provider: 'copilot' });
				const defaultChat = buildDefaultChatUri(sessionResource);
				const peerChat = URI.parse(buildChatUri(sessionResource, 'peer-1'));
				getStateManager(localService).dispatchServerAction(defaultChat, { type: ActionType.ChatTurnStarted, turnId: 'initial-turn', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'initial', origin: { kind: MessageKind.User } } });
				getStateManager(localService).dispatchServerAction(defaultChat, { type: ActionType.ChatTurnComplete, turnId: 'initial-turn', duration: 1000 });
				getStateManager(localService).addChat(sessionResource.toString(), peerChat.toString(), {});
				localService.addSubscriber(sessionResource, 'client-1');
				localService.unsubscribe(sessionResource, 'client-1');

				await whenIdleStarted.p;
				localService.dispatchAction(
					peerChat.toString(),
					{ type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
					'client-1', 1,
				);
				whenIdle.complete();
				await Promise.resolve();
				localService.dispatchAction(
					peerChat.toString(),
					{ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
					'client-1', 2,
				);
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(getStateManager(localService).getSessionState(sessionResource.toString()), undefined);
			});
		});

		test('a provider can defer idle release without losing cached state', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DeferringReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(session);
				service.addSubscriber(session, 'client-1');
				service.unsubscribe(session, 'client-1');

				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual({
					releaseAttempts: agent.releaseAttempts,
					hasCachedState: getStateManager(service).getSessionState(session.toString()) !== undefined,
				}, {
					releaseAttempts: 1,
					hasCachedState: true,
				});

				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual({
					releaseAttempts: agent.releaseAttempts,
					hasCachedState: getStateManager(service).getSessionState(session.toString()) !== undefined,
				}, {
					releaseAttempts: 2,
					hasCachedState: false,
				});
			});
		});

		test('chat subscription cancels the root release retry until the chat unsubscribes', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DeferringReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				const chatResource = URI.parse(buildDefaultChatUri(session));
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(session);
				service.addSubscriber(session, 'client-session');
				service.unsubscribe(session, 'client-session');

				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(agent.releaseAttempts, 1);

				service.addSubscriber(chatResource, 'client-chat');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(agent.releaseAttempts, 1, 'the cancelled retry must not fire while a chat is subscribed');
				service.unsubscribe(chatResource, 'client-chat');
				await new Promise(resolve => setTimeout(resolve, 0));

				assert.deepStrictEqual({
					releaseAttempts: agent.releaseAttempts,
					hasCachedState: getStateManager(service).getSessionState(session.toString()) !== undefined,
				}, {
					releaseAttempts: 2,
					hasCachedState: false,
				});
			});
		});

		test('overlapping residency reconciliations preserve the original in-flight release', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DelayedReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				const chatResource = URI.parse(buildDefaultChatUri(session));
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(session);
				agent.events.length = 0;
				service.addSubscriber(session, 'client-session');
				service.unsubscribe(session, 'client-session');

				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual(agent.events, ['release:start']);

				service.addSubscriber(chatResource, 'client-chat');
				service.unsubscribe(chatResource, 'client-chat');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual(agent.events, ['release:start'], 'second reconciliation must not start another provider release');

				await agent.release.complete();
				await Promise.resolve();
				assert.deepStrictEqual(agent.events, ['release:start', 'release:end']);
			});
		});

		test('a restored idle session is evicted when its last subscriber drops', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Reconciliation is asynchronous, so state remains cached until release preflight runs.
				assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'session stays cached until release preflight');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString()), undefined, 'restored idle session should be evicted after reconciliation');
				assert.deepStrictEqual(
					copilotAgent.releaseSessionCalls.map(u => u.toString()),
					[sessionResource.toString()],
					'provider chat release should be invoked for the evicted root',
				);
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'eviction must not destructively dispose the session');
			});
		});

		test('idle eviction releases every catalog chat and never finalizes the session', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new MockAgent('copilot');
				disposables.add(toDisposable(() => agent.dispose()));
				const chatReleases: string[] = [];
				agent.chats.releaseChat = async chat => {
					chatReleases.push(chat.toString());
				};
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				];
				await service.restoreSession(session);
				const chat = URI.parse(buildChatUri(session, 'peer-1'));
				getStateManager(service).addChat(session.toString(), chat.toString(), {});
				service.addSubscriber(session, 'client-1');

				service.unsubscribe(session, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual({
					chatReleases,
					sessionReleases: agent.releaseSessionCalls.map(call => call.toString()),
					// Disposing the exact default chat reclaims durable,
					// session-scoped resources; a non-destructive release
					// must never dispose it.
					finalizations: agent.disposeSessionCalls.map(call => call.toString()),
				}, {
					chatReleases: [chat.toString(), buildDefaultChatUri(session)],
					sessionReleases: [],
					finalizations: [],
				});
			});
		});

		test('re-subscribing during release preflight cancels the release', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Reconnect before asynchronous release preflight completes.
				service.addSubscriber(sessionResource, 'client-2');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'session must stay cached when re-subscribed during release preflight');
				assert.strictEqual(copilotAgent.releaseSessionCalls.length, 0, 'chat release must not fire after preflight was cancelled');
			});
		});

		test('an evicted idle session restores losslessly on re-subscribe', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				copilotAgent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');
				const before = getStateManager(service).getSessionState(sessionResource.toString());
				assert.ok(before, 'session state present before eviction');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString()), undefined, 'session evicted after last subscriber drops');

				// Re-subscribe rehydrates from the preserved durable data.
				await service.subscribe(sessionResource, 'client-2');
				const after = getStateManager(service).getSessionState(sessionResource.toString());
				assert.ok(after, 'session restored on re-subscribe');
				// Response-part ids are freshly generated on each reconstruction, so
				// normalize them out before comparing the durable turn content.
				const normalizeTurns = (turns: ISessionWithDefaultChat['turns']) =>
					turns.map(turn => ({ ...turn, responseParts: turn.responseParts.map(part => ({ ...part, id: undefined })) }));
				assert.deepStrictEqual(normalizeTurns(after.turns), normalizeTurns(before.turns), 'restored turns match the pre-eviction state');
			});
		});

		test('subscription waits for provider release and restores evicted state', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DelayedReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				const sessions = await agent.listSessions();
				const sessionResource = sessions[0].session;

				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(sessionResource);
				await (service as unknown as { _sessionListReconciliation: Promise<void> })._sessionListReconciliation;
				agent.events.length = 0;
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				let subscriptionSettled = false;
				const subscription = service.subscribe(sessionResource, 'client-2').then(result => {
					subscriptionSettled = true;
					return result;
				});
				await Promise.resolve();
				assert.strictEqual(subscriptionSettled, false);
				await agent.release.complete();
				await subscription;
				assert.deepStrictEqual({
					events: agent.events,
					hasCachedState: getStateManager(service).getSessionState(sessionResource.toString()) !== undefined,
				}, {
					events: ['release:start', 'release:end', 'metadata'],
					hasCachedState: true,
				});
			});
		});

		test('inactive subscription is not registered after provider release', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DelayedReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(session);
				service.addSubscriber(session, 'client-1');
				service.unsubscribe(session, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				let isActive = true;
				const subscription = service.subscribe(session, 'client-2', () => isActive);
				isActive = false;
				await agent.release.complete();

				await assert.rejects(subscription, /Subscription cancelled/);
				const subscriptions = (service as unknown as { _subscriptions: { hasSubscribers(resource: URI): boolean } })._subscriptions;
				assert.strictEqual(subscriptions.hasSubscribers(session), false);
			});
		});

		test('failed subscription removes its subscriber registration', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const missingSession = URI.parse('copilot:/missing-session');

			await assert.rejects(service.subscribe(missingSession, 'client-1'));

			const subscriptions = (service as unknown as { _subscriptions: { hasSubscribers(resource: URI): boolean } })._subscriptions;
			assert.strictEqual(subscriptions.hasSubscribers(missingSession), false);
		});

		test('unsubscribe after service disposal does not schedule GC', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new MockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const session = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(session, 'client-1');

				service.dispose();
				service.unsubscribe(session, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual(agent.disposeSessionCalls, []);
			});
		});

		test('initial subscriber added during release preflight keeps cached state', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const agent = new DelayedCanReleaseMockAgent('copilot');
				registerTestAgentProvider(service, agent);
				const { session } = await createAgentSession(agent);
				agent.sessionMessages = [
					{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
					{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
				];
				await service.restoreSession(session);
				agent.events.length = 0;
				service.addSubscriber(session, 'client-1');
				service.unsubscribe(session, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				service.addSubscriber(session, 'client-2');
				await agent.canRelease.complete();
				await Promise.resolve();

				assert.deepStrictEqual({
					events: agent.events,
					hasCachedState: getStateManager(service).getSessionState(session.toString()) !== undefined,
				}, {
					events: ['canRelease:start', 'canRelease:end'],
					hasCachedState: true,
				});
			});
		});

		test('restored session is evicted after all subscribers drop', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
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
				assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'still subscribed by client-2');

				service.unsubscribe(sessionResource, 'client-2');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString()), undefined, 'evicted after last subscriber drops');
			});
		});

		test('subagent subscriber pins the parent session against eviction', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
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
				assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'parent must stay while child is subscribed');
				assert.ok(getStateManager(service).getSessionState(childUri.toString()), 'child still present');

				// Child drops — parent and child can now be evicted.
				service.unsubscribe(childUri, 'client-child');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString()), undefined, 'parent evicted after subagent drops');
				assert.strictEqual(getStateManager(service).getSessionState(childUri.toString()), undefined, 'child also evicted with parent');
			});
		});

		test('nested subagent subscriber pins ancestor session against eviction', async () => {
			registerTestAgentProvider(service, copilotAgent);
			const { session } = await createAgentSession(copilotAgent);
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

			assert.ok(getStateManager(service).getSessionState(sessionResource.toString()), 'ancestor parent must stay while nested child is subscribed');
			assert.ok(getStateManager(service).getSessionState(childUri.toString()), 'intermediate child still present');
		});

		test('depth-2 subagent unsubscribe evicts the root session state', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				// Regression: when a depth-2 subagent URI unsubscribes the eviction
				// must reach all the way to the root, not stop at the intermediate
				// parent and leave root state cached indefinitely.
				registerTestAgentProvider(service, copilotAgent);
				const { session } = await createAgentSession(copilotAgent);
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

				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString()), undefined, 'root state must be evicted when no subscribers remain');
			});
		});
	});

	// ---- handshake fast-path: uncommitted refresh on addSubscriber ----

	suite('addSubscriber triggers uncommitted refresh', () => {

		test('addSubscriber for <session>/changeset/uncommitted triggers the first git diff refresh', async () => {
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-refresh' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };

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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			registerTestAgentProvider(localService, copilotAgent);
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
			copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			registerTestAgentProvider(localService, copilotAgent);
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
			copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : undefined };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			registerTestAgentProvider(localService, copilotAgent);

			// Seed a session on the agent without calling
			// `localService.createSession` — mirrors a restored-from-disk
			// session not yet in the service's state manager.
			const { session } = await createAgentSession(copilotAgent);
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

		test('a default-chat subscriber pins an empty session after the root unsubscribes', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const session = await service.createSession({ provider: 'copilot' });
				const chat = URI.parse(buildDefaultChatUri(session));
				service.addSubscriber(session, 'session-client');
				service.addSubscriber(chat, 'chat-client');

				service.unsubscribe(session, 'session-client');
				await new Promise(resolve => setTimeout(resolve, 30_000));
				const residentForChat = getStateManager(service).getSessionState(session.toString()) !== undefined;
				service.unsubscribe(chat, 'chat-client');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual({
					residentForChat,
					disposals: copilotAgent.disposeSessionCalls.map(call => call.toString()),
				}, {
					residentForChat: true,
					disposals: [session.toString()],
				});
			});
		});

		test('an empty unsubscribed session is disposed after the grace period', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
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
				registerTestAgentProvider(service, copilotAgent);
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
				registerTestAgentProvider(service, copilotAgent);
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
				registerTestAgentProvider(service, copilotAgent);
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
				registerTestAgentProvider(service, copilotAgent);
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

		test('a restored session that loaded zero turns is never GC-disposed', () => {
			// Regression: GC used to key purely off "0 turns", but a restored
			// session can present as empty because its history FAILED to load.
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				await createAgentSession(copilotAgent);
				const sessions = await copilotAgent.listSessions();
				const sessionResource = sessions[0].session;

				// No messages => restores with zero turns, exactly as a failed
				// history load would look.
				copilotAgent.sessionMessages = [];
				await service.restoreSession(sessionResource);
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.deepStrictEqual({
					disposed: copilotAgent.disposeSessionCalls.map(u => u.toString()),
					released: copilotAgent.releaseSessionCalls.map(u => u.toString()),
				}, {
					disposed: [],
					released: [],
				});
			});
		});

		test('a session restored during the grace window is not GC-disposed', () => {
			// The rehydrated session is deliberately still empty, so that the
			// turns check cannot be what saves it — only draft status can.
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');

				await new Promise(resolve => setTimeout(resolve, 5_000));
				getStateManager(service).deleteSession(sessionResource.toString());
				copilotAgent.sessionMessages = [];
				await service.restoreSession(sessionResource);
				assert.strictEqual(getStateManager(service).isUnusedDraft(sessionResource.toString()), false, 'precondition: session is now durable state');

				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'a session restored mid-grace must not be GC-disposed');
			});
		});

		test('a session truncated back to zero turns is not GC-disposed', () => {
			// A session created in this process that has been used is durable
			// data — its worktree holds real work — even though a truncate
			// (checkpoint restore / first-message edit) empties its turns.
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				registerTestAgentProvider(service, copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				const chatUri = buildDefaultChatUri(sessionResource.toString());
				service.addSubscriber(sessionResource, 'client-1');
				service.dispatchAction(chatUri, { type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } }, 'client-1', 1);
				service.dispatchAction(chatUri, { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 }, 'client-1', 2);

				// Truncate every turn away, then drop the last subscriber.
				service.dispatchAction(chatUri, { type: ActionType.ChatTruncated }, 'client-1', 3);
				assert.strictEqual(getStateManager(service).getSessionState(sessionResource.toString())?.turns.length, 0, 'precondition: session now looks empty');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'a used session must not be GC-disposed after truncation');
			});
		});
	});

	suite('session config persistence', () => {

		test('createSession persists initial config values to the session DB', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			await localService.createSession({ provider: 'copilot' });

			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.strictEqual(persisted, undefined);
		});

		test('restoreSession defaults an external folder session with persisted config to folder isolation', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const workingDirectory = URI.file('/workspace/repo');
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => workingDirectory;
			gitService.revParse = async () => 'head';
			gitService.getCurrentBranch = async () => 'main';
			gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
			const localAgent = new MockAgent('codex');
			localAgent.sessionMetadataOverrides = { workingDirectories: [workingDirectory], project: undefined };
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			setTestAgentHostWorktreeIsolation(localService, disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/test' },
				gitService,
				sessionDataService,
				new NullLogService(),
			)));
			registerTestAgentProvider(localService, localAgent);

			await sessionDb.setMetadata('configValues', JSON.stringify({ autoApprove: 'autoApprove' }));
			const { session } = await createAgentSession(localAgent);
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(session);

			const values = getStateManager(localService).getSessionState(session.toString())?.config?.values;
			assert.deepStrictEqual({
				isolation: values?.[SessionConfigKey.Isolation],
				autoApprove: values?.autoApprove,
			}, {
				isolation: 'folder',
				autoApprove: 'autoApprove',
			});
		});

		test('restoreSession seeds the provider model into the default chat draft', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('codex');
			const model = { id: 'codex-model:openai:gpt-5.6-sol' };
			localAgent.sessionMetadataOverrides = { model } as typeof localAgent.sessionMetadataOverrides;
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);
			const { session } = await createAgentSession(localAgent);
			await sessionDb.setChatDraft(URI.parse(buildDefaultChatUri(session)), {
				text: 'unsent text',
				origin: { kind: MessageKind.User },
				model: { id: 'codex-model:vscode-proxy:gpt-5-mini', config: { thinkingLevel: 'medium' } },
			});
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(session);

			assert.deepStrictEqual(getStateManager(localService).getDefaultChatState(session.toString())?.draft, {
				text: 'unsent text',
				origin: { kind: MessageKind.User },
				model,
			});
		});

		test('restoreSession overlays persisted config values onto the resolved config', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			// Create a session on the agent backend (no config) so listSessions can find it
			const { session } = await createAgentSession(localAgent);
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Pre-seed persisted config values
			await sessionDb.setMetadata('configValues', JSON.stringify({ autoApprove: 'autoApprove' }));

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			const { session } = await createAgentSession(localAgent);
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

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
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

			const changesetSnapshot = getStateManager(localService).getSnapshot(`${sessionResource.toString()}/changeset/session`);
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			const { session } = await createAgentSession(localAgent);
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('diffs', '{ not valid json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
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

			const changesetSnapshot = getStateManager(localService).getSnapshot(`${sessionResource.toString()}/changeset/session`);
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
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			const session = await localService.createSession({ provider: 'copilot', config: { autoApprove: 'autoApprove' } });

			// Wait for the fire-and-forget persistence to flush
			await new Promise(r => setTimeout(r, 50));

			// Simulate a server restart: drop the in-memory state
			getStateManager(localService).removeSession(session.toString());

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			await localService.restoreSession(session);

			const state = getStateManager(localService).getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.config?.values, { autoApprove: 'autoApprove' });
		});

		test('restoreSession ignores malformed persisted configValues', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			const { session } = await createAgentSession(localAgent);
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('configValues', '{not json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			// Should not throw despite the malformed JSON
			await localService.restoreSession(sessionResource);

			const state = getStateManager(localService).getSessionState(sessionResource.toString());
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
			registerTestAgentProvider(service, copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectories: [sourceDir] });

			// The state manager should have the worktree path, not the source path
			const state = getStateManager(service).getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectories?.[0], worktreeDir.toString());
		});

		test('createSession falls back to config working directory when agent does not resolve', async () => {
			// Agent does not override the working directory (e.g. folder isolation)
			copilotAgent.resolvedWorkingDirectory = undefined;
			registerTestAgentProvider(service, copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectories: [sourceDir] });

			const state = getStateManager(service).getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectories?.[0], sourceDir.toString());
		});

		test('restoreSession uses agent working directory in state', async () => {
			// Agent returns the worktree path through listSessions
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.sessionMetadataOverrides = { workingDirectories: worktreeDir ? [worktreeDir] : undefined };
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Delete from state to simulate a server restart
			getStateManager(service).deleteSession(session.toString());
			assert.strictEqual(getStateManager(service).getSessionState(session.toString()), undefined);

			// Restore the session (simulates a client subscribing after restart)
			await service.restoreSession(session);

			const state = getStateManager(service).getSessionState(session.toString());
			assert.strictEqual(state?.workingDirectories?.[0], worktreeDir.toString());
		});

		test('pending worktree session defers git state and branch changes until materialization', async () => {
			class ProvisionalWorktreeAgent extends MockAgent {
				private readonly _onDidMaterializeChat = new Emitter<IAgentMaterializeChatEvent>();
				override readonly onDidMaterializeChat = this._onDidMaterializeChat.event;
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
				}));

				materialize(session: URI, workingDirectory: URI): void {
					this._onDidMaterializeChat.fire({
						chat: URI.parse(buildDefaultChatUri(session)),
						workingDirectories: [workingDirectory],
						project: undefined,
					});
				}

				override dispose(): void {
					this._onDidMaterializeChat.dispose();
					super.dispose();
				}
			}

			const sourceDir = URI.file('/source/repo');
			const worktreeDir = URI.file('/source/repo.worktrees/feature');
			const gitStateCalls: Array<{ resource: string; baseBranch: string | undefined }> = [];
			const diffCalls: string[] = [];
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => sourceDir;
			gitService.revParse = async () => 'head';
			gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'origin/main' });
			gitService.getCurrentBranch = async () => 'main';
			gitService.getBranches = async () => [{ ref: 'refs/heads/main', name: 'main', kind: GitRefType.Head }];
			gitService.getSessionGitState = async (resource, baseBranch) => {
				gitStateCalls.push({ resource: resource.toString(), baseBranch });
				return { branchName: 'feature', baseBranchName: 'main' };
			};
			gitService.computeSessionFileDiffs = async resource => {
				diffCalls.push(resource.toString());
				return [];
			};

			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const isolation = disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => { throw new Error('should not generate a branch'); } },
				gitService,
				nullSessionDataService,
				new NullLogService(),
			));
			setTestAgentHostWorktreeIsolation(localService, isolation);
			const agent = new ProvisionalWorktreeAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			registerTestAgentProvider(localService, agent);

			const session = await localService.createSession({
				provider: agent.id,
				workingDirectories: [sourceDir],
				config: {
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.Branch]: 'feature',
					[SessionConfigKey.WorktreeCreateNewBranch]: false,
				},
			});
			const branchChangeset = buildBranchChangesetUri(session.toString());
			localService.addSubscriber(URI.parse(branchChangeset), 'client-1');
			await timeout(0);

			const beforeMaterialization = {
				workingDirectory: getStateManager(localService).getSessionState(session.toString())?.workingDirectories?.[0],
				gitStateCalls: [...gitStateCalls],
				diffCalls: [...diffCalls],
			};

			isolation.clearPending(AgentSession.id(session));
			agent.materialize(session, worktreeDir);
			for (let i = 0; i < 20 && (gitStateCalls.length === 0 || diffCalls.length === 0); i++) {
				await timeout(0);
			}

			assert.deepStrictEqual({
				beforeMaterialization,
				afterMaterialization: {
					workingDirectory: getStateManager(localService).getSessionState(session.toString())?.workingDirectories?.[0],
					gitStateCalls,
					diffCalls: [...new Set(diffCalls)],
				},
			}, {
				beforeMaterialization: {
					workingDirectory: sourceDir.toString(),
					gitStateCalls: [],
					diffCalls: [],
				},
				afterMaterialization: {
					workingDirectory: worktreeDir.toString(),
					gitStateCalls: [{ resource: worktreeDir.toString(), baseBranch: undefined }],
					diffCalls: [worktreeDir.toString()],
				},
			});
			localService.unsubscribe(URI.parse(branchChangeset), 'client-1');
		});

		test('_resolveWorkingDirectoryBeforeSend returns the full set (index 0 + tail), or undefined when unset', async () => {
			const resolver = service as unknown as {
				_resolveWorkingDirectoryBeforeSend: (p: { session: string; chat: string; turnId: string; prompt: string }) => Promise<readonly URI[] | undefined>;
			};
			const resolve = (resource: string) => resolver._resolveWorkingDirectoryBeforeSend({ session: resource, chat: `${resource}/chat`, turnId: 't', prompt: 'hi' });
			const inject = (resource: string, dirs?: readonly URI[]) => getStateManager(service).restoreSession({
				resource,
				provider: 'copilot',
				title: 't',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: undefined,
				workingDirectories: dirs?.map(d => d.toString()),
			}, []);

			const a = URI.file('/roots/a');
			const b = URI.file('/roots/b');
			const c = URI.file('/roots/c');
			const multi = URI.from({ scheme: 'copilot', path: '/multi' }).toString();
			const single = URI.from({ scheme: 'copilot', path: '/single' }).toString();
			const none = URI.from({ scheme: 'copilot', path: '/none' }).toString();
			inject(multi, [a, b, c]);
			inject(single, [a]);
			inject(none, undefined);

			// No worktree isolation is configured, so index 0 resolves to itself and
			// the additional roots are preserved as-is; a session with no roots
			// resolves to `undefined` (the agent runs in its own scratch dir).
			const toStrings = (r: readonly URI[] | undefined) => r?.map(d => d.toString());
			assert.deepStrictEqual(
				[toStrings(await resolve(multi)), toStrings(await resolve(single)), toStrings(await resolve(none))],
				[[a, b, c].map(d => d.toString()), [a.toString()], undefined],
			);
		});

		test('first-send worktree failure warns and falls back to the original folder', async () => {
			const sourceDir = URI.file(mkdtempSync(`${tmpdir()}/agent-worktree-failure-`));
			disposables.add(toDisposable(() => {
				rmSync(sourceDir.fsPath, { recursive: true, force: true });
				rmSync(getWorktreesRoot(sourceDir).fsPath, { recursive: true, force: true });
			}));
			const database = new TestSessionDatabase();
			const sessionDataService = createSessionDataService(database);
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => sourceDir;
			gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
			gitService.addWorktree = async () => {
				throw new Error('git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found');
			};
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const isolation = disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/failure' },
				gitService,
				sessionDataService,
				new NullLogService(),
			));
			setTestAgentHostWorktreeIsolation(localService, isolation);

			const session = AgentSession.uri('copilot', 'worktree-failure');
			const sessionResource = session.toString();
			const chat = buildDefaultChatUri(sessionResource);
			getStateManager(localService).restoreSession({
				resource: sessionResource,
				provider: 'copilot',
				title: 'Worktree failure',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: undefined,
				workingDirectories: [sourceDir.toString()],
			}, []);
			getStateManager(localService).setSessionConfig(sessionResource, {
				schema: { type: 'object', properties: {} },
				values: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			});
			getStateManager(localService).dispatchServerAction(chat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'test', origin: { kind: MessageKind.User } },
			});
			isolation.notePending(AgentSession.id(session));

			const resolver = localService as unknown as {
				_resolveWorkingDirectoryBeforeSend: (params: { session: string; chat: string; turnId: string; prompt: string }) => Promise<readonly URI[] | undefined>;
			};
			const resolved = await resolver._resolveWorkingDirectoryBeforeSend({ session: sessionResource, chat, turnId: 'turn-1', prompt: 'test' });
			const chatState = getStateManager(localService).getChatState(chat);

			assert.deepStrictEqual({
				resolved: resolved?.map(uri => uri.toString()),
				activity: chatState?.activity,
				responseParts: chatState?.activeTurn?.responseParts,
				persistedFailure: JSON.parse((await database.getMetadata('copilot.worktree.creationFailure'))!),
			}, {
				resolved: [sourceDir.toString()],
				activity: undefined,
				responseParts: [{
					kind: ResponsePartKind.SystemNotification,
					content: 'Couldn\'t create the isolated worktree. This session is continuing in the original folder.\n\n`git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found`',
					_meta: { kind: 'worktreeCreationFailure', severity: 'warning' },
				}],
				persistedFailure: {
					sessionId: 'worktree-failure',
					diagnostic: 'git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found',
				},
			});
		});

		test('first-send worktree fallback warns when no repository root is resolved', async () => {
			const sourceDir = URI.file('/source/repo');
			const database = new TestSessionDatabase();
			const sessionDataService = createSessionDataService(database);
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async () => undefined;
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const isolation = disposables.add(new WorktreeIsolation(
				{ generateBranchName: async () => 'agents/fallback' },
				gitService,
				sessionDataService,
				new NullLogService(),
			));
			setTestAgentHostWorktreeIsolation(localService, isolation);

			const session = AgentSession.uri('copilot', 'worktree-fallback');
			const sessionResource = session.toString();
			const chat = buildDefaultChatUri(sessionResource);
			getStateManager(localService).restoreSession({
				resource: sessionResource,
				provider: 'copilot',
				title: 'Worktree fallback',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: undefined,
				workingDirectories: [sourceDir.toString()],
			}, []);
			getStateManager(localService).setSessionConfig(sessionResource, {
				schema: { type: 'object', properties: {} },
				values: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			});
			getStateManager(localService).dispatchServerAction(chat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'test', origin: { kind: MessageKind.User } },
			});
			isolation.notePending(AgentSession.id(session));

			const resolver = localService as unknown as {
				_resolveWorkingDirectoryBeforeSend: (params: { session: string; chat: string; turnId: string; prompt: string }) => Promise<readonly URI[] | undefined>;
			};
			const resolved = await resolver._resolveWorkingDirectoryBeforeSend({ session: sessionResource, chat, turnId: 'turn-1', prompt: 'test' });

			assert.deepStrictEqual({
				resolved: resolved?.map(uri => uri.toString()),
				responseParts: getStateManager(localService).getChatState(chat)?.activeTurn?.responseParts,
				persistedFailure: JSON.parse((await database.getMetadata('copilot.worktree.creationFailure'))!),
			}, {
				resolved: [sourceDir.toString()],
				responseParts: [{
					kind: ResponsePartKind.SystemNotification,
					content: 'Couldn\'t create the isolated worktree. This session is continuing in the original folder.',
					_meta: { kind: 'worktreeCreationFailure', severity: 'warning' },
				}],
				persistedFailure: { sessionId: 'worktree-fallback' },
			});
		});
	});

	test('provisional workspace session advertises Uncommitted Changes before materialization', async () => {
		class ProvisionalMockAgent extends MockAgent {
			override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
				createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
			}));
		}

		const workingDirectory = URI.file('/workspace');
		const gitCalls: string[] = [];
		const gitService = createNoopGitService();
		gitService.getSessionGitState = async resource => {
			gitCalls.push(resource.toString());
			return {
				hasGitHubRemote: false,
				branchName: 'main',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 1,
			};
		};
		gitService.computeSessionFileDiffs = async () => [];
		const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
		const provisionalAgent = new ProvisionalMockAgent('provisional');
		disposables.add(toDisposable(() => provisionalAgent.dispose()));
		registerTestAgentProvider(localService, provisionalAgent);

		const workspaceSession = await localService.createSession({
			provider: provisionalAgent.id,
			workingDirectories: workingDirectory ? [workingDirectory] : undefined,
		});
		const uncommittedUri = buildUncommittedChangesetUri(workspaceSession.toString());
		localService.addSubscriber(URI.parse(uncommittedUri), 'client-1');
		for (let i = 0; i < 100; i++) {
			if (getStateManager(localService).getChangesetState(uncommittedUri)?.operations?.some(operation => operation.id === 'commit')) {
				break;
			}
			await timeout(2);
		}

		const workspaceState = getStateManager(localService).getSessionState(workspaceSession.toString());
		assert.deepStrictEqual({
			lifecycle: workspaceState?.lifecycle,
			changesets: workspaceState?.changesets?.map(changeset => changeset.changeKind),
			gitCalls,
			hasCommit: getStateManager(localService).getChangesetState(uncommittedUri)?.operations?.some(operation => operation.id === 'commit'),
		}, {
			lifecycle: SessionLifecycle.Creating,
			changesets: ['uncommitted'],
			gitCalls: [workingDirectory.toString()],
			hasCommit: true,
		});
		localService.unsubscribe(URI.parse(uncommittedUri), 'client-1');

		const workspaceLessSession = await localService.createSession({ provider: provisionalAgent.id });
		assert.deepStrictEqual(
			getStateManager(localService).getSessionState(workspaceLessSession.toString())?.changesets ?? [],
			[],
		);
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
		function assertBackingChangesetsComputing(stateManager: ReturnType<typeof getStateManager>, sessionStr: string): void {
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
			registerTestAgentProvider(service, copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			const state = getStateManager(service).getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(getStateManager(service), sessionStr);
		});

		test('provisional session materialization preserves both halves', async () => {
			// Custom mock that returns `provisional: true` and exposes a hook
			// to fire `onDidMaterializeChat` later, simulating the
			// "session created in-memory now, persisted on first sendMessage"
			// flow that Copilot CLI / Claude actually use in production.
			class ProvisionalMockAgent extends MockAgent {
				private readonly _onDidMaterializeChat = new Emitter<IAgentMaterializeChatEvent>();
				override readonly onDidMaterializeChat = this._onDidMaterializeChat.event;
				override readonly chats: IAgentChats = withChatOverrides(getChatSurface(this), base => ({
					createChat: (chat, context, options) => createProvisionalChat(base, chat, context, options),
				}));
				materialize(session: URI, workingDirectory?: URI): void {
					this._onDidMaterializeChat.fire({ chat: URI.parse(buildDefaultChatUri(session)), workingDirectories: workingDirectory ? [workingDirectory] : undefined, project: undefined });
				}
			}

			const provisionalAgent = new ProvisionalMockAgent('copilot');
			disposables.add(toDisposable(() => provisionalAgent.dispose()));
			registerTestAgentProvider(service, provisionalAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			// Snapshot the create-time state BEFORE materialization.
			const stateBefore = getStateManager(service).getSessionState(sessionStr);
			assert.ok(stateBefore, 'provisional session should already have state');
			assert.deepStrictEqual(stateBefore!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(getStateManager(service), sessionStr);

			// `markSessionPersisted` (called from `_onDidMaterializeChat`)
			// re-spreads flattened session metadata. A future change to that spread
			// could drop the catalogue or invalidate the backing snapshots;
			// the post-materialization re-assertion is what catches it.
			provisionalAgent.materialize(session, URI.file('/wd'));

			const stateAfter = getStateManager(service).getSessionState(sessionStr);
			assert.ok(stateAfter, 'materialized session should still have state');
			assert.deepStrictEqual(stateAfter!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(getStateManager(service), sessionStr);
		});

		test('restoreSession with no persisted diffs seeds both halves in computing state', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(createTestAgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			registerTestAgentProvider(localService, localAgent);

			const { session } = await createAgentSession(localAgent);
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;
			const sessionStr = sessionResource.toString();

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = getStateManager(localService).getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(getStateManager(localService), sessionStr);
		});
	});

	suite('Agent Merge durable session monitoring', () => {

		function createAgentMergeService(sessionDb: TestSessionDatabase, orchestratorDb: IAgentHostDatabase): AgentService {
			const localService = disposables.add(createTestAgentService(
				new NullLogService(), fileService, createSessionDataService(sessionDb),
				{ _serviceBrand: undefined } as IProductService, createNoopGitService(),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, orchestratorDb,
			));
			getConfigurationService(localService).updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
			return localService;
		}

		async function createEnabledSession(sessionDb: TestSessionDatabase, orchestratorDb: IAgentHostDatabase): Promise<{ readonly localService: AgentService; readonly localAgent: MockAgent; readonly sessionResource: URI }> {
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			// Restore resolves a config only when the session has persisted
			// values; without one a `SessionConfigChanged` would be a no-op.
			await sessionDb.setMetadata('configValues', '{}');
			const localService = createAgentMergeService(sessionDb, orchestratorDb);
			registerTestAgentProvider(localService, localAgent);
			const { session } = await createAgentSession(localAgent);
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			const sessionResource = (await localAgent.listSessions())[0].session;
			await localService.restoreSession(sessionResource);
			getConfigurationService(localService).updateSessionConfig(sessionResource.toString(), { [SessionConfigKey.AgentMerge]: { enabled: true } });
			await localService.whenAgentMergeSessionsRestored();
			return { localService, localAgent, sessionResource };
		}

		test('an Agent-Merge-enabled session stays resident after its last subscriber drops and becomes MRU-eligible once disabled', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const orchestratorDb = new TestAgentHostOrchestratorDatabase();
				const { localService, sessionResource } = await createEnabledSession(new TestSessionDatabase(), orchestratorDb);
				const sessionStr = sessionResource.toString();
				localService.addSubscriber(sessionResource, 'client-1');

				localService.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 60_000));
				const residentWhileEnabled = getStateManager(localService).getSessionState(sessionStr) !== undefined;

				getConfigurationService(localService).updateSessionConfig(sessionStr, { [SessionConfigKey.AgentMerge]: { enabled: false } });
				await new Promise(resolve => setTimeout(resolve, 60_000));

				assert.deepStrictEqual({
					residentWhileEnabled,
					residentAfterDisable: getStateManager(localService).getSessionState(sessionStr) !== undefined,
					indexedAfterDisable: await orchestratorDb.listAgentMergeEnabledSessions(),
				}, {
					residentWhileEnabled: true,
					residentAfterDisable: true,
					indexedAfterDisable: [],
				});
			});
		});

		test('enabling records the session in the host index rather than in each session database', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const { sessionResource } = await createEnabledSession(new TestSessionDatabase(), orchestratorDb);

			assert.deepStrictEqual(await orchestratorDb.listAgentMergeEnabledSessions(), [sessionResource.toString()]);
		});

		test('a disable explains itself in the transcript without telling the agent', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const sessionDb = new TestSessionDatabase();
			const { localService, localAgent, sessionResource } = await createEnabledSession(sessionDb, orchestratorDb);
			const sessionStr = sessionResource.toString();
			const chat = buildDefaultChatUri(sessionStr);

			getConfigurationService(localService).updateSessionConfig(sessionStr, { [SessionConfigKey.AgentMerge]: { enabled: false } });
			await timeout(0);

			const turns = getStateManager(localService).getSessionState(chat)?.turns ?? [];
			const notice = turns[turns.length - 1];
			assert.deepStrictEqual({
				// The turn exists only to carry the notice, so its own message
				// stays out of the transcript.
				hiddenMessage: isMessageHiddenFromTranscript(notice.message),
				origin: notice.message.origin.kind,
				state: notice.state,
				responseParts: notice.responseParts,
				// The whole point of a server-only dispatch: the agent's context
				// must not gain host bookkeeping.
				sentToAgent: localAgent.sendMessageCalls.length,
				// The SDK transcript replayed on restore has never seen this turn,
				// so it only survives reload as a local turn.
				persistedLocally: (await sessionDb.getLocalTurns()).map(record => ({ chatUri: record.chatUri, turnId: record.turnId })),
			}, {
				hiddenMessage: true,
				origin: MessageKind.SystemNotification,
				state: TurnState.Complete,
				responseParts: [{
					kind: ResponsePartKind.SystemNotification,
					content: 'Agent Merge was turned off for this session.',
					_meta: { kind: 'agentMergeDisabled' },
				}],
				sentToAgent: 0,
				persistedLocally: [{ chatUri: chat.toString(), turnId: notice.id }],
			});
		});

		test('a persisted Agent-Merge-enabled session begins monitoring on a fresh host and becomes MRU-eligible once disabled', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const orchestratorDb = new TestAgentHostOrchestratorDatabase();
				const sessionDb = new TestSessionDatabase();
				const { localAgent, sessionResource } = await createEnabledSession(sessionDb, orchestratorDb);
				const sessionStr = sessionResource.toString();

				// A fresh host over the same durable state must resume monitoring
				// from the index alone.
				const restarted = createAgentMergeService(sessionDb, orchestratorDb);
				registerTestAgentProvider(restarted, localAgent);
				await restarted.whenAgentMergeSessionsRestored();
				const resumed = {
					materialized: getStateManager(restarted).getSessionState(sessionStr) !== undefined,
					// Distinguishes a genuine resume from a session that was
					// materialized and immediately disabled.
					enabled: readAgentMergeSessionState(getStateManager(restarted).getSessionState(sessionStr)?.config?.values)?.enabled,
					indexed: await orchestratorDb.listAgentMergeEnabledSessions(),
				};

				// Nothing ever subscribed, so only the monitoring pin is holding
				// this session resident; disabling must let it go.
				getConfigurationService(restarted).updateSessionConfig(sessionStr, { [SessionConfigKey.AgentMerge]: { enabled: false } });
				await new Promise(resolve => setTimeout(resolve, 60_000));

				assert.deepStrictEqual({
					resumed,
					residentAfterDisable: getStateManager(restarted).getSessionState(sessionStr) !== undefined,
				}, {
					resumed: { materialized: true, enabled: true, indexed: [sessionStr] },
					residentAfterDisable: true,
				});
			});
		});

		test('a notice raised mid-turn waits for the agent to finish so it survives restore', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const sessionDb = new TestSessionDatabase();
			const { localService, sessionResource } = await createEnabledSession(sessionDb, orchestratorDb);
			const sessionStr = sessionResource.toString();
			const chat = buildDefaultChatUri(sessionStr);
			const stateManager = getStateManager(localService);
			const turnsOf = () => stateManager.getSessionState(chat)?.turns ?? [];

			stateManager.dispatchServerAction(chat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'agent-turn',
				startedAt: new Date().toISOString(),
				message: { text: 'do the thing', origin: { kind: MessageKind.User } },
			});
			getConfigurationService(localService).updateSessionConfig(sessionStr, { [SessionConfigKey.AgentMerge]: { enabled: false } });
			await timeout(0);
			const duringTurn = {
				// The running turn must keep its own response stream: a notice
				// appended here would ride on a turn the provider owns.
				activeTurnParts: stateManager.getChatState(chat)?.activeTurn?.responseParts.length,
				persisted: (await sessionDb.getLocalTurns()).length,
			};

			stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatTurnComplete, turnId: 'agent-turn', duration: 1 });
			await timeout(0);

			const notice = turnsOf()[turnsOf().length - 1];
			assert.deepStrictEqual({
				duringTurn,
				afterTurn: {
					responseParts: notice.responseParts,
					anchoredTo: (await sessionDb.getLocalTurns()).map(record => record.anchorTurnId),
					persistedTurnIds: (await sessionDb.getLocalTurns()).map(record => record.turnId),
				},
			}, {
				duringTurn: { activeTurnParts: 0, persisted: 0 },
				afterTurn: {
					responseParts: [{
						kind: ResponsePartKind.SystemNotification,
						content: 'Agent Merge was turned off for this session.',
						_meta: { kind: 'agentMergeDisabled' },
					}],
					anchoredTo: ['agent-turn'],
					persistedTurnIds: [notice.id],
				},
			});
		});

		test('an archived session is dropped from the index instead of being restored', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const sessionDb = new TestSessionDatabase();
			const { localAgent, sessionResource } = await createEnabledSession(sessionDb, orchestratorDb);
			await sessionDb.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true');

			const restarted = createAgentMergeService(sessionDb, orchestratorDb);
			registerTestAgentProvider(restarted, localAgent);
			await restarted.whenAgentMergeSessionsRestored();

			assert.deepStrictEqual({
				materialized: getStateManager(restarted).getSessionState(sessionResource.toString()) !== undefined,
				indexed: await orchestratorDb.listAgentMergeEnabledSessions(),
			}, {
				materialized: false,
				indexed: [],
			});
		});

		test('archiving a session drops it from the index', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const { localService, sessionResource } = await createEnabledSession(new TestSessionDatabase(), orchestratorDb);

			getStateManager(localService).dispatchServerAction(sessionResource.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
			await localService.whenAgentMergeSessionsRestored();

			assert.deepStrictEqual(await orchestratorDb.listAgentMergeEnabledSessions(), []);
		});

		test('deleting a session drops it from the index', async () => {
			const orchestratorDb = new TestAgentHostOrchestratorDatabase();
			const { localService, sessionResource } = await createEnabledSession(new TestSessionDatabase(), orchestratorDb);

			await localService.disposeSession(sessionResource);

			assert.deepStrictEqual(await orchestratorDb.listAgentMergeEnabledSessions(), []);
		});

		test('an archived Agent-Merge session is released like any other idle session', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				const { localService, sessionResource } = await createEnabledSession(new TestSessionDatabase(), new TestAgentHostOrchestratorDatabase());
				const sessionStr = sessionResource.toString();
				localService.addSubscriber(sessionResource, 'client-1');
				// Archiving is the terminal state that must not keep the session pinned.
				getStateManager(localService).dispatchServerAction(sessionStr, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

				localService.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 60_000));

				assert.strictEqual(getStateManager(localService).getSessionState(sessionStr), undefined, 'an archived session must not stay pinned');
			});
		});
	});
});
