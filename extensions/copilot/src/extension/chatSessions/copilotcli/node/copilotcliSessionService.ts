/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AutoModeSessionManager as SDKAutoModeSessionManager, AutoModeSessionResult, internal, LocalSession, LocalSessionMetadata, Session, SessionContext, SessionEvent, SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import { createReadStream } from 'node:fs';
import { devNull } from 'node:os';
import { createInterface } from 'node:readline';
import type { ChatCustomAgent, ChatRequest, ChatSessionItem } from 'vscode';
import { IChatDebugFileLoggerService } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { RelativePattern } from '../../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../../platform/log/common/logService';
import { deriveCopilotCliOTelEnv } from '../../../../platform/otel/common/agentOTelEnv';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { IPromptsService } from '../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { disposableTimeout, raceCancellation, raceCancellationError, SequencerByKey, ThrottledDelayer } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { Disposable, DisposableMap, IDisposable, IReference, RefCountedDisposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { basename, dirname, joinPath } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestTurn2, ChatResponseTurn2, ChatSessionStatus, Uri } from '../../../../vscodeTypes';
import { IPromptVariablesService } from '../../../prompt/node/promptVariablesService';
import { IAgentSessionsWorkspace } from '../../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore, RequestDetails, StoredModeInstructions } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { isUntitledSessionId } from '../../common/utils';
import { emptyWorkspaceInfo, getWorkingDirectory, IWorkspaceInfo } from '../../common/workspaceInfo';
import { buildChatHistoryFromEvents, RequestIdDetails, stripReminders } from '../common/copilotCLITools';
import { ICustomSessionTitleService } from '../common/customSessionTitleService';
import { IChatDelegationSummaryService } from '../common/delegationSummaryService';
import { SessionIdForCLI } from '../common/utils';
import { getCopilotCLISessionDir } from './cliHelpers';
import { formatModelDetails, getAgentFileNameFromFilePath, ICopilotCLIAgents, ICopilotCLIModels, ICopilotCLISDK, isEnabledForCopilotCLI } from './copilotCli';
import { CopilotCliBridgeSpanProcessor } from './copilotCliBridgeSpanProcessor';
import { CopilotCLISession, ICopilotCLISession } from './copilotcliSession';
import { ICopilotCLISkills } from './copilotCLISkills';
import { ICopilotCLIMCPHandler, McpServerMappings, remapCustomAgentTools } from './mcpHandler';
import { INTEGRATION_ID } from '../../../../platform/endpoint/common/licenseAgreement';


const COPILOT_CLI_WORKSPACE_JSON_FILE_KEY = 'github.copilot.cli.workspaceSessionFile';
const AUTO_MODE_REFRESH_LEAD_TIME_MS = 300 * 1000;
export const COPILOT_CLI_CHAT_PANEL_SYSTEM_MESSAGE = 'You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code.';

type SDKPackage = Awaited<ReturnType<ICopilotCLISDK['getPackage']>>;
type AutoModeResolveArgs = Parameters<SDKAutoModeSessionManager['resolve']>[0];
type AutoModeResolveResult = Awaited<ReturnType<SDKAutoModeSessionManager['resolve']>>;
type AutoModeListener = Parameters<SDKAutoModeSessionManager['subscribe']>[0];

class AutoModeSessionManagerCompat {

	private current: AutoModeSessionResult | undefined;
	private previousConcreteModel: string | undefined;
	private inflight: Promise<AutoModeResolveResult> | undefined;
	private readonly listeners = new Set<AutoModeListener>();

	constructor(private readonly sdkPackage: Pick<SDKPackage, 'AutoModeUnavailableError' | 'AutoModeUnsupportedError' | 'acquireAutoModeSession' | 'isAutoModel' | 'refreshAutoModeSession'>) { }

	recordPreviousConcreteModel(modelId: string | undefined): void {
		if (modelId && !this.sdkPackage.isAutoModel(modelId)) {
			this.previousConcreteModel = modelId;
		}
	}

	getLastResolved(): string | undefined {
		return this.current?.selectedModel;
	}

	getDiscountPercent(): number | undefined {
		const discountedCosts = this.current?.discountedCosts;
		if (!discountedCosts) {
			return undefined;
		}

		const selectedModelDiscount = this.current?.selectedModel ? discountedCosts[this.current.selectedModel] : undefined;
		if (selectedModelDiscount !== undefined) {
			return Math.round(selectedModelDiscount * 100);
		}

		const allDiscounts = Object.values(discountedCosts);
		if (allDiscounts.length === 0) {
			return undefined;
		}

		return Math.round((allDiscounts.reduce((sum, discount) => sum + discount, 0) / allDiscounts.length) * 100);
	}

	getPreviousConcreteModel(): string | undefined {
		return this.previousConcreteModel;
	}

	subscribe(listener: AutoModeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async resolve(args: AutoModeResolveArgs): Promise<AutoModeResolveResult> {
		if (this.isFresh() && this.current) {
			const current = this.current;
			this.applySessionToken(args.settings, current.sessionToken);
			return { modelId: current.selectedModel, sessionToken: current.sessionToken };
		}

		if (this.inflight) {
			const resolved = await this.inflight;
			if (resolved) {
				this.applySessionToken(args.settings, resolved.sessionToken);
			}

			return resolved;
		}

		this.inflight = this.doResolve(args).finally(() => {
			this.inflight = undefined;
		});

		return this.inflight;
	}

	clear(settings?: AutoModeResolveArgs['settings']): void {
		this.current = undefined;
		if (settings) {
			this.clearSessionToken(settings);
		}
		this.notify();
	}

	handleModelChange(prevModel: string | undefined, nextModel: string, settings?: AutoModeResolveArgs['settings']): void {
		if (this.sdkPackage.isAutoModel(nextModel) && !this.sdkPackage.isAutoModel(prevModel)) {
			this.recordPreviousConcreteModel(prevModel);
		} else if (!this.sdkPackage.isAutoModel(nextModel) && this.sdkPackage.isAutoModel(prevModel)) {
			this.clear(settings);
		}
	}

	private notify(): void {
		const resolvedModel = this.current?.selectedModel;
		const discountPercent = this.getDiscountPercent();
		for (const listener of this.listeners) {
			try {
				listener(resolvedModel, discountPercent);
			} catch {
				// Ignore listener failures to mirror the SDK manager behavior.
			}
		}
	}

	private async doResolve(args: AutoModeResolveArgs): Promise<AutoModeResolveResult> {
		const { logger, settings } = args;

		if (this.current) {
			try {
				const refreshed = await this.sdkPackage.refreshAutoModeSession({ ...args, existingToken: this.current.sessionToken });
				this.current = refreshed;
				this.applySessionToken(settings, refreshed.sessionToken);
				this.notify();
				return { modelId: refreshed.selectedModel, sessionToken: refreshed.sessionToken };
			} catch (error) {
				if (this.isUnauthorizedError(error)) {
					logger.debug('Auto-mode refresh unauthorized; acquiring a new session');
				} else if (error instanceof this.sdkPackage.AutoModeUnsupportedError) {
					logger.debug(`Auto-mode refresh unsupported: ${error.message}`);
					this.current = undefined;
					this.notify();
					return undefined;
				} else if (error instanceof this.sdkPackage.AutoModeUnavailableError) {
					logger.debug(`Auto-mode unavailable during refresh: ${error.message}`);
					this.current = undefined;
					this.notify();
					return undefined;
				} else {
					logger.debug(`Auto-mode refresh failed; reusing last token until expiry: ${this.formatError(error)}`);
					this.applySessionToken(settings, this.current.sessionToken);
					return { modelId: this.current.selectedModel, sessionToken: this.current.sessionToken };
				}
			}
		}

		try {
			const acquired = await this.sdkPackage.acquireAutoModeSession(args);
			this.current = acquired;
			this.applySessionToken(settings, acquired.sessionToken);
			this.notify();
			logger.debug(`Auto-mode session acquired: selected_model=${acquired.selectedModel}${acquired.expiresAt ? ` expires_at=${acquired.expiresAt}` : ''}`);
			return { modelId: acquired.selectedModel, sessionToken: acquired.sessionToken };
		} catch (error) {
			if (error instanceof this.sdkPackage.AutoModeUnsupportedError) {
				logger.debug(`Auto-mode unsupported: ${error.message}`);
				return undefined;
			}

			if (error instanceof this.sdkPackage.AutoModeUnavailableError) {
				logger.debug(`Auto-mode unavailable: ${error.message}`);
				return undefined;
			}

			logger.debug(`Auto-mode acquire failed: ${this.formatError(error)}`);
			return undefined;
		}
	}

	private isFresh(): boolean {
		return this.current ? (this.current.expiresAt ? this.current.expiresAt * 1000 - Date.now() > AUTO_MODE_REFRESH_LEAD_TIME_MS : true) : false;
	}

	private isUnauthorizedError(error: unknown): error is { kind: 'unauthorized' } {
		return typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'unauthorized';
	}

	private applySessionToken(settings: AutoModeResolveArgs['settings'], sessionToken: string): void {
		if (!settings) {
			return;
		}

		settings.api ??= {};
		settings.api.copilot ??= {};
		settings.api.copilot.capiSessionToken = sessionToken;
	}

	private clearSessionToken(settings: AutoModeResolveArgs['settings']): void {
		if (settings?.api?.copilot) {
			delete settings.api.copilot.capiSessionToken;
		}
	}

	private formatError(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}

export interface ICopilotCLISessionItem {
	readonly id: string;
	readonly label: string;
	readonly timing: ChatSessionItem['timing'];
	readonly status?: ChatSessionStatus;
	readonly workingDirectory?: Uri;
}
export type ExtendedChatRequest = ChatRequest & { prompt: string };
export type ISessionOptions = {
	model?: string;
	reasoningEffort?: string;
	workspace: IWorkspaceInfo;
	agent?: SweCustomAgent;
	debugTargetSessionIds?: readonly string[];
	mcpServerMappings?: McpServerMappings;
	additionalWorkspaces?: IWorkspaceInfo[];
	sessionParentId?: string;
};
export type IGetSessionOptions = ISessionOptions & { sessionId: string };
export type ICreateSessionOptions = ISessionOptions & { sessionId?: string };

export interface ICopilotCLISessionService {
	readonly _serviceBrand: undefined;

	/**
	 * @deprecated Kept only for non-controller API
	 */
	onDidChangeSessions: Event<void>;
	onDidDeleteSession: Event<string>;
	onDidChangeSession: Event<ICopilotCLISessionItem>;
	onDidCreateSession: Event<ICopilotCLISessionItem>;

	getSessionWorkingDirectory(sessionId: string): Uri | undefined;

	// Session metadata querying
	getSessionItem(sessionId: string, token: CancellationToken): Promise<ICopilotCLISessionItem | undefined>;
	getSessionTitle(sessionId: string, token: CancellationToken): Promise<string>;
	getAllSessions(token: CancellationToken): Promise<readonly ICopilotCLISessionItem[]>;

	// SDK session management
	createNewSessionId(): string;
	isNewSessionId(sessionId: string): boolean;
	deleteSession(sessionId: string): Promise<void>;

	// Session rename
	renameSession(sessionId: string, title: string): Promise<void>;
	updateSessionSummary(sessionId: string, title: string): Promise<void>;

	// Session wrapper tracking
	getSession(options: IGetSessionOptions, token: CancellationToken): Promise<IReference<ICopilotCLISession> | undefined>;
	createSession(options: ICreateSessionOptions, token: CancellationToken): Promise<IReference<ICopilotCLISession>>;
	getChatHistory(options: { sessionId: string; workspace: IWorkspaceInfo }, token: CancellationToken): Promise<(ChatRequestTurn2 | ChatResponseTurn2)[]>;
	forkSession(options: { sessionId: string; requestId: string | undefined; workspace: IWorkspaceInfo }, token: CancellationToken): Promise<string>;
	tryGetPartialSessionHistory(sessionId: string): Promise<readonly (ChatRequestTurn2 | ChatResponseTurn2)[] | undefined>;
}

export const ICopilotCLISessionService = createServiceIdentifier<ICopilotCLISessionService>('ICopilotCLISessionService');

export class CopilotCLISessionService extends Disposable implements ICopilotCLISessionService {
	declare _serviceBrand: undefined;

	private _sessionManager: Lazy<Promise<internal.LocalSessionManager>>;
	private _sessionWrappers = new DisposableMap<string, RefCountedSession>();
	private readonly _partialSessionHistories = new Map<string, readonly (ChatRequestTurn2 | ChatResponseTurn2)[]>();


	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	public readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _onDidDeleteSession = this._register(new Emitter<string>());
	public readonly onDidDeleteSession = this._onDidDeleteSession.event;

	private readonly _onDidChangeSession = this._register(new Emitter<ICopilotCLISessionItem>());
	public readonly onDidChangeSession = this._onDidChangeSession.event;
	private readonly _onDidCreateSession = this._register(new Emitter<ICopilotCLISessionItem>());
	public readonly onDidCreateSession = this._onDidCreateSession.event;

	private readonly _onDidCloseSession = this._register(new Emitter<string>());

	private sessionMutexForGetSession = new Map<string, Mutex>();

	private readonly _sessionTracker: CopilotCLISessionWorkspaceTracker;
	private readonly _sessionWorkingDirectories = new Map<string, Uri | undefined>();
	private readonly _onDidChangeSessionsThrottler = this._register(new ThrottledDelayer<void>(500));
	private readonly _cachedSessionItems = new Map<string, ICopilotCLISessionItem>();
	private readonly _sessionsBeingCreatedViaFork = new Set<string>();
	private readonly _newSessionIds = new Set<string>();
	/** Bridge processor that forwards SDK native OTel spans to the debug panel. */
	private _bridgeProcessor: CopilotCliBridgeSpanProcessor | undefined;
	/** Whether we've attempted to install the bridge (only try once). */
	private _bridgeInstalled = false;
	private showExternalSessions: boolean;
	private _customAgentLookupChanged: boolean = false;
	private _customAgentLookupRebuild: Promise<void> | undefined;
	private readonly _customAgentLookup = new Map<string, [ChatCustomAgent, Lazy<Promise<string>>]>();
	constructor(
		@ILogService protected readonly logService: ILogService,
		@ICopilotCLISDK private readonly copilotCLISDK: ICopilotCLISDK,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@INativeEnvService private readonly nativeEnv: INativeEnvService,
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@ICopilotCLIMCPHandler private readonly mcpHandler: ICopilotCLIMCPHandler,
		@ICopilotCLIAgents private readonly agents: ICopilotCLIAgents,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ICustomSessionTitleService private readonly customSessionTitleService: ICustomSessionTitleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICopilotCLISkills private readonly copilotCLISkills: ICopilotCLISkills,
		@IChatDelegationSummaryService private readonly _delegationSummaryService: IChatDelegationSummaryService,
		@IChatSessionMetadataStore private readonly _chatSessionMetadataStore: IChatSessionMetadataStore,
		@IAgentSessionsWorkspace private readonly _agentSessionsWorkspace: IAgentSessionsWorkspace,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IChatSessionWorktreeService private readonly worktreeManager: IChatSessionWorktreeService,
		@IOTelService private readonly _otelService: IOTelService,
		@IPromptVariablesService private readonly _promptVariablesService: IPromptVariablesService,
		@IChatDebugFileLoggerService private readonly _debugFileLogger: IChatDebugFileLoggerService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ICopilotCLIModels private readonly _copilotCLIModels: ICopilotCLIModels,
	) {
		super();
		this.showExternalSessions = this.configurationService.getConfig(ConfigKey.Advanced.CLIShowExternalSessions);
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.Advanced.CLIShowExternalSessions.fullyQualifiedId)) {
				this.showExternalSessions = this.configurationService.getConfig(ConfigKey.Advanced.CLIShowExternalSessions);
			}
		}));
		this._register(this._promptsService.onDidChangeCustomAgents(() => {
			this._customAgentLookupChanged = true;
			if (this._cachedSessionItems.size > 0) {
				void this.createCustomAgentLookup();
			}
		}));
		this.monitorSessionFiles();
		this._sessionManager = new Lazy<Promise<internal.LocalSessionManager>>(async () => {
			try {
				const sdkPackage = await this.getSDKPackage();
				const { internal, createLocalFeatureFlagService } = sdkPackage;
				// Always enable SDK OTel so the debug panel receives native spans via the bridge.
				// When user OTel is disabled, we force file exporter to /dev/null so the SDK
				// creates OtelSessionTracker (for debug panel) but doesn't export to any collector.
				if (!process.env['COPILOT_OTEL_ENABLED']) {
					process.env['COPILOT_OTEL_ENABLED'] = 'true';
				}
				// Default content capture to 'true' for the debug panel. When user OTel
				// is enabled, their captureContent setting overrides this default below.
				// When user OTel is disabled, the default gives debug panel content.
				// If the user explicitly set the env var, respect their choice.
				if (!process.env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT']) {
					process.env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] = 'true';
				}
				if (this._otelService.config.enabled) {
					const otelEnv = deriveCopilotCliOTelEnv(this._otelService.config);
					for (const [key, value] of Object.entries(otelEnv)) {
						process.env[key] = value;
					}
					// When user OTel is enabled, their captureContent config takes
					// precedence over the debug-panel default set above.
					process.env['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'] = String(this._otelService.config.captureContent);
				} else {
					// User OTel disabled: ensure SDK doesn't export to any external collector.
					// Use file exporter to /dev/null so the SDK creates OtelSessionTracker
					// (for debug panel) but writes spans nowhere.
					process.env['COPILOT_OTEL_EXPORTER_TYPE'] = 'file';
					process.env['COPILOT_OTEL_FILE_EXPORTER_PATH'] = devNull;
				}
				return new internal.LocalSessionManager({
					featureFlagService: createLocalFeatureFlagService(),
					telemetryService: new internal.NoopTelemetryService(),
					autoModeManager: this.createAutoModeManager(sdkPackage),
				}, { flushDebounceMs: undefined, settings: undefined, version: undefined });
			}
			catch (error) {
				this.logService.error(`Failed to initialize Copilot CLI Session Manager: ${error}`);
				throw error;
			}
		});
		this._sessionTracker = this.instantiationService.createInstance(CopilotCLISessionWorkspaceTracker);
	}

	private async getSDKPackage(): Promise<SDKPackage> {
		return this.copilotCLISDK.getPackage();
	}

	private createAutoModeManager(sdkPackage: SDKPackage): SDKAutoModeSessionManager {
		if (typeof sdkPackage.AutoModeSessionManager === 'function') {
			try {
				return new sdkPackage.AutoModeSessionManager();
			} catch (error) {
				if (!(error instanceof TypeError)) {
					throw error;
				}
			}
		}

		this.logService.warn('Failed to construct SDK AutoModeSessionManager, using compatibility fallback.');
		return new AutoModeSessionManagerCompat(sdkPackage) as unknown as SDKAutoModeSessionManager;
	}

	getSessionWorkingDirectory(sessionId: string): Uri | undefined {
		return this._sessionWorkingDirectories.get(sessionId);
	}

	private triggerSessionsChangeEvent() {
		// If we're busy fetching sessions, then do not trigger change event as we'll trigger one after we're done fetching sessions.
		if (this._isGettingSessions > 0) {
			return;
		}

		this._onDidChangeSessionsThrottler.trigger(() => Promise.resolve(this._onDidChangeSessions.fire()));
	}

	public createNewSessionId(): string {
		const sessionId = generateUuid();
		this._newSessionIds.add(sessionId);
		return sessionId;
	}

	public isNewSessionId(sessionId: string): boolean {
		return this._newSessionIds.has(sessionId);
	}

	protected monitorSessionFiles() {
		try {
			const sessionDir = joinPath(this.nativeEnv.userHome, '.copilot', 'session-state');
			const watcher = this._register(this.fileSystem.createFileSystemWatcher(new RelativePattern(sessionDir, '**/*.jsonl')));
			this._register(watcher.onDidCreate(async (e) => {
				const sessionId = extractSessionIdFromEventPath(sessionDir, e);
				if (sessionId && this._sessionsBeingCreatedViaFork.has(sessionId)) {
					return;
				}
				this.triggerSessionsChangeEvent();
				const sessionItem = sessionId ? await this.getSessionItemImpl(sessionId, 'disk', CancellationToken.None) : undefined;
				if (sessionItem) {
					this._onDidChangeSession.fire(sessionItem);
				}
			}));
			this._register(watcher.onDidDelete(e => {
				const sessionId = extractSessionIdFromEventPath(sessionDir, e);
				if (sessionId) {
					this._cachedSessionItems.delete(sessionId);
					this._onDidDeleteSession.fire(sessionId);
				}
				this.triggerSessionsChangeEvent();
			}));
			this._register(watcher.onDidChange((e) => {
				// If we're busy fetching sessions, then do not trigger change event as we'll trigger one after we're done fetching sessions.
				if (this._isGettingSessions > 0) {
					return;
				}

				const sessionId = extractSessionIdFromEventPath(sessionDir, e);
				if (sessionId && this._sessionsBeingCreatedViaFork.has(sessionId)) {
					return;
				}

				// If we're already working on a session that we're aware of then no need to trigger a refresh.
				if (Array.from(this._sessionWrappers.keys()).some(sessionId => e.path.includes(sessionId))) {
					return;
				}
				if (sessionId) {
					this.triggerOnDidChangeSessionItem(sessionId, 'fileSystemChange');
				}
				this.triggerSessionsChangeEvent();
			}));
		} catch (error) {
			this.logService.error(`Failed to monitor Copilot CLI session files: ${error}`);
		}
	}
	async getSessionManager() {
		return this._sessionManager.value;
	}

	private _sessionChangeNotifierByKey = new SequencerByKey<string>();
	private triggerOnDidChangeSessionItem(sessionId: string, reason: 'fileSystemChange' | 'statusChange') {
		this._sessionChangeNotifierByKey.queue(sessionId, async () => {
			// lets wait for 500ms, as we could get a lot of change events in a short period of time.
			// E.g. if you have a session running in integrated terminal, then its possible we will see a lot of updates.
			// In such cases its best to just delay (throttle) by 500ms (we get that via the sequncer and this delay)
			if (reason === 'fileSystemChange') {
				await new Promise<void>(resolve => disposableTimeout(resolve, 500, this._store));
				// If already getting all sessions, no point in triggering individual change event.
				if (this._isGettingSessions > 0) {
					return;
				}
			}

			const sessionItem = await this.getSessionItemImpl(sessionId, reason === 'statusChange' ? 'inMemorySession' : 'disk', CancellationToken.None);
			if (sessionItem) {
				this._onDidChangeSession.fire(sessionItem);
			}
		}).catch(error => {
			this.logService.error(`Failed to trigger session change event for session ${sessionId}: ${error}`);
		});
	}

	/**
	 * This can be very expensive, as this involves loading all of the sessions.
	 * TODO @DonJayamanne We need to try to use SDK to open a session and get the details.
	 */
	public async getSessionItem(sessionId: string, token: CancellationToken): Promise<ICopilotCLISessionItem | undefined> {
		return this.getSessionItemImpl(sessionId, 'inMemorySession', token);
	}

	public async getSessionItemImpl(sessionId: string, source: 'inMemorySession' | 'disk', token: CancellationToken): Promise<ICopilotCLISessionItem | undefined> {
		const wrappedSession = this._sessionWrappers.get(sessionId);
		// Give preference to the session we have in memory, as this contains the latest information.
		if (wrappedSession && (source === 'inMemorySession' || wrappedSession.object.status === ChatSessionStatus.InProgress)) {
			const item = await this.constructSessionItemFromWrappedSession(wrappedSession, token);
			if (item) {
				return item;
			}
		}

		// // We can get the item from cache, as the ICopilotCLISessionItem doesn't store anything that changes.
		// // Except the title
		// let item = this._cachedSessionItems.get(sessionId);
		// if (item) {
		// 	// Since this was a change event for an existing session, we must get the latest title.
		// 	const label = await this.getSessionTitle(sessionId, CancellationToken.None);
		// 	const sessionItem = Object.assign({}, item, { label });
		// 	return sessionItem;
		// }

		const sessionManager = await raceCancellation(this.getSessionManager(), token);
		const metadata = sessionManager ? await raceCancellationError(sessionManager.getSessionMetadata({ sessionId }), token) : undefined;
		if (!metadata || token.isCancellationRequested) {
			return;
		}
		await this._sessionTracker.initialize();
		return await this.constructSessionItem(metadata, token);
	}

	public async getSessionTitle(sessionId: string, token: CancellationToken): Promise<string> {
		const sessionManager = await this.getSessionManager();
		const metadata = await sessionManager.getSessionMetadata({ sessionId });
		return this.getSessionTitleImpl(sessionId, metadata, token);
	}

	/**
	 * Single source of truth for both `getSessionTitle()` (editor/header) and
	 * `_getAllSessions()` (sidebar list) so the two surfaces never diverge.
	 *
	 * Precedence:
	 *   1. Explicit renamed title — active wrapper title, SDK `name`, or legacy custom title.
	 *   2. Cached derived label in `_sessionLabels` (from a previous history scan).
	 *   3. Clean metadata `summary` (rejected if it looks truncated).
	 *   4. First user message from session history (cached on success).
	 *   5. Raw metadata `summary` as a display-only last resort (not cached).
	 *
	 * Pending prompts are intentionally excluded here for established sessions.
	 * They are only used for brand-new sessions that have not been persisted yet
	 * via the wrapper-only fallback in `_getAllSessions()` / `constructSessionItemFromWrappedSession()`.
	 */
	private async getSessionTitleImpl(sessionId: string, metadata: LocalSessionMetadata | undefined, token: CancellationToken): Promise<string> {
		const explicitTitle =
			this._sessionWrappers.get(sessionId)?.object.title ??
			metadata?.name ??
			await this.customSessionTitleService.getCustomSessionTitle(sessionId);
		if (explicitTitle) {
			return explicitTitle;
		}

		const cached = this._sessionLabels.get(sessionId);
		if (cached) {
			return cached;
		}

		const summarizedTitle = labelFromPrompt(metadata?.summary ?? '');
		if (summarizedTitle && !summarizedTitle.endsWith('...') && !summarizedTitle.includes('<')) {
			return summarizedTitle;
		}

		const firstUserMessage = await this.getFirstUserMessageFromSession(sessionId, token);
		const fromHistory = labelFromPrompt(firstUserMessage ?? '');
		if (fromHistory) {
			this._sessionLabels.set(sessionId, fromHistory);
			return fromHistory;
		}

		return metadata?.summary ?? '';
	}


	private _getAllSessionsProgress: Promise<readonly ICopilotCLISessionItem[]> | undefined;
	private _isGettingSessions: number = 0;
	async getAllSessions(token: CancellationToken): Promise<readonly ICopilotCLISessionItem[]> {
		if (!this._getAllSessionsProgress) {
			this._getAllSessionsProgress = this._getAllSessions(token);
		}
		return this._getAllSessionsProgress.finally(() => {
			this._getAllSessionsProgress = undefined;
		});
	}

	private _sessionLabels: Map<string, string> = new Map();

	async _getAllSessions(token: CancellationToken): Promise<readonly ICopilotCLISessionItem[]> {
		this._isGettingSessions++;
		try {
			const sessionManager = await raceCancellationError(this.getSessionManager(), token);
			const sessionMetadataList = await raceCancellationError(sessionManager.listSessions(), token);

			await this._sessionTracker.initialize();

			// Convert SessionMetadata to ICopilotCLISession
			const diskSessions: ICopilotCLISessionItem[] = coalesce(await Promise.all(
				sessionMetadataList.map(async (metadata): Promise<ICopilotCLISessionItem | undefined> => {
					const workingDirectory = metadata.context?.cwd ? URI.file(metadata.context.cwd) : undefined;
					this._sessionWorkingDirectories.set(metadata.sessionId, workingDirectory);
					if (!await this.shouldShowSession(metadata.sessionId, metadata.context)) {
						return;
					}
					const id = metadata.sessionId;
					const startTime = metadata.startTime.getTime();
					const endTime = metadata.modifiedTime.getTime();
					const label = await this.getSessionTitleImpl(metadata.sessionId, metadata, token);
					if (!label) {
						return;
					}
					return {
						id,
						label,
						timing: { created: startTime, startTime, endTime },
						workingDirectory
					};
				})
			));

			const diskSessionIds = new Set(diskSessions.map(s => s.id));
			// If we have a new session that has started, then return that as well.
			// Possible SDK has not yet persisted it to disk.
			const newSessions = coalesce(await Promise.all(Array.from(this._sessionWrappers.values())
				.filter(session => !diskSessionIds.has(session.object.sessionId))
				.filter(session => session.object.status === ChatSessionStatus.InProgress)
				.map(async (session): Promise<ICopilotCLISessionItem | undefined> => {
					const label = session.object.title ?? await this.customSessionTitleService.getCustomSessionTitle(session.object.sessionId) ?? labelFromPrompt(session.object.pendingPrompt ?? '');
					if (!label) {
						return;
					}

					const createTime = Date.now();
					return {
						id: session.object.sessionId,
						label,
						status: session.object.status,
						timing: { created: createTime, startTime: createTime },
					};
				})));

			// Merge with cached sessions (new sessions not yet persisted by SDK)
			const allSessions = diskSessions
				.map((session): ICopilotCLISessionItem => {
					return {
						...session,
						status: this._sessionWrappers.get(session.id)?.object?.status
					};
				}).concat(newSessions);

			allSessions.forEach(session => this._cachedSessionItems.set(session.id, session));
			return allSessions;
		} catch (error) {
			this.logService.error(`Failed to get all sessions: ${error}`);
			throw error;
		} finally {
			this._isGettingSessions--;
		}
	}

	private async constructSessionItem(metadata: LocalSessionMetadata, token: CancellationToken): Promise<ICopilotCLISessionItem | undefined> {
		const sessionItem = await this.constructSessionItemImpl(metadata, token);
		if (sessionItem) {
			this._cachedSessionItems.set(metadata.sessionId, sessionItem);
		}
		return sessionItem;
	}

	private async constructSessionItemFromWrappedSession(session: RefCountedSession, token: CancellationToken): Promise<ICopilotCLISessionItem | undefined> {
		const label = (await this.getSessionTitle(session.object.sessionId, token)) || this._cachedSessionItems.get(session.object.sessionId)?.label || labelFromPrompt(session.object.pendingPrompt ?? '');
		const createTime = Date.now();
		return {
			id: session.object.sessionId,
			label,
			status: session.object.status,
			timing: this._cachedSessionItems.get(session.object.sessionId)?.timing ?? { created: createTime, startTime: createTime },
		};
	}

	private async constructSessionItemImpl(metadata: LocalSessionMetadata, token: CancellationToken): Promise<ICopilotCLISessionItem | undefined> {
		const workingDirectory = metadata.context?.cwd ? URI.file(metadata.context.cwd) : undefined;
		this._sessionWorkingDirectories.set(metadata.sessionId, workingDirectory);
		const shouldShowSession = await this.shouldShowSession(metadata.sessionId, metadata.context);
		if (!shouldShowSession) {
			return undefined;
		}

		const id = metadata.sessionId;
		const startTime = metadata.startTime.getTime();
		const endTime = metadata.modifiedTime.getTime();
		const label = await this.getSessionTitleImpl(metadata.sessionId, metadata, token) ?? labelFromPrompt(metadata.summary ?? '');

		if (label) {
			return {
				id,
				label,
				timing: { created: startTime, startTime, endTime },
				workingDirectory,
				status: this._sessionWrappers.get(id)?.object?.status
			};
		}
	}

	public async createSession(options: ICreateSessionOptions, token: CancellationToken): Promise<RefCountedSession> {
		const resource = options.sessionId ? SessionIdForCLI.getResource(options.sessionId) : URI.from({ scheme: 'copilot-cli', path: `mcp-gateway-${generateUuid()}` });
		const { mcpConfig: mcpServers, disposable: mcpGateway } = await this.mcpHandler.loadMcpConfig(resource);
		try {
			const sessionOptions = await this.createSessionsOptions({ ...options, mcpServers });
			const sessionManager = await raceCancellationError(this.getSessionManager(), token);
			const sdkSession = await sessionManager.createSession({ ...sessionOptions, sessionId: options.sessionId });
			const wasNewSession = this._newSessionIds.delete(sdkSession.sessionId);
			// After the first session creation, the SDK's OTel TracerProvider is
			// initialized. Install the bridge processor so SDK-native spans flow
			// to the debug panel.
			this._installBridgeIfNeeded();

			const promises: Promise<unknown>[] = [];
			if (wasNewSession) {
				promises.push(this.customSessionTitleService.getCustomSessionTitle(sdkSession.sessionId).then(stagedTitle => {
					if (stagedTitle) {
						sdkSession.updateSessionSummary(stagedTitle);
					}
				}));
			}
			promises.push(sessionManager.loadDeferredRepoHooks(sdkSession));
			await Promise.all(promises);

			if (sessionOptions.copilotUrl) {
				sdkSession.setAuthInfo({
					type: 'hmac',
					hmac: 'empty',
					host: 'https://github.com',
					copilotUser: {
						endpoints: {
							api: sessionOptions.copilotUrl
						}
					}
				});
			}
			this.logService.trace(`[CopilotCLISession] Created new CopilotCLI session ${sdkSession.sessionId}.`);

			const session = this.createCopilotSession(sdkSession, options.workspace, options.agent?.name, sessionManager);
			session.object.add(mcpGateway);

			// Set origin
			void this._chatSessionMetadataStore.setSessionOrigin(session.object.sessionId);

			// Set session parent id
			if (options.sessionParentId) {
				void this._chatSessionMetadataStore.setSessionParentId(session.object.sessionId, options.sessionParentId);
			}

			return session;
		}
		catch (error) {
			mcpGateway.dispose();
			throw error;
		}
	}

	/**
	 * Install the bridge SpanProcessor on the SDK's global TracerProvider.
	 * Called once after the first session creation (when the SDK provider is ready).
	 */
	private _installBridgeIfNeeded(): void {
		if (this._bridgeInstalled) {
			return;
		}
		this._bridgeInstalled = true;

		try {
			// The SDK registered its BasicTracerProvider as the global provider.
			// In OTel SDK v2, addSpanProcessor() was removed from BasicTracerProvider.
			// We access the internal MultiSpanProcessor._spanProcessors array to inject
			// our bridge. This is the same pattern the SDK itself uses in forceFlush().
			const api = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
			const globalProvider = api.trace.getTracerProvider();

			// Navigate: ProxyTracerProvider._delegate → BasicTracerProvider._activeSpanProcessor → MultiSpanProcessor._spanProcessors
			const delegate = (globalProvider as unknown as Record<string, unknown>)._delegate ?? globalProvider;
			const activeProcessor = (delegate as unknown as Record<string, unknown>)._activeSpanProcessor as Record<string, unknown> | undefined;
			const processorArray = activeProcessor?._spanProcessors;

			if (Array.isArray(processorArray)) {
				this._bridgeProcessor = new CopilotCliBridgeSpanProcessor(this._otelService);
				processorArray.push(this._bridgeProcessor);
				this.logService.info('[CopilotCLISession] Bridge SpanProcessor installed on SDK TracerProvider');
			} else {
				this.logService.warn('[CopilotCLISession] Could not access SDK TracerProvider internals — debug panel will not show SDK spans');
			}
		} catch (err) {
			this.logService.warn(`[CopilotCLISession] Failed to install bridge SpanProcessor: ${err}`);
		}
	}

	private async shouldShowSession(sessionId: string, context?: SessionContext): Promise<boolean> {
		if (isUntitledSessionId(sessionId)) {
			return true;
		}

		if (!this.showExternalSessions) {
			const sessionOrigin = await this._chatSessionMetadataStore.getSessionOrigin(sessionId);
			if (sessionOrigin !== 'vscode') {
				return false;
			}
		}
		// If we're in an empty workspace then show all sessions.
		if (this.workspaceService.getWorkspaceFolders().length === 0) {
			return true;
		}
		if (this._agentSessionsWorkspace.isAgentSessionsWorkspace) {
			return true;
		}
		// This session was started from a specified workspace (e.g. multiroot, untitled or other), hence continue showing it.
		const sessionTrackerVisibility = this._sessionTracker.shouldShowSession(sessionId);
		if (sessionTrackerVisibility.isWorkspaceSession) {
			return true;
		}
		// Possible we have the workspace info in cli metadata.
		if (context && (
			(context.cwd && this.workspaceService.getWorkspaceFolder(URI.file(context.cwd))) ||
			(context.gitRoot && this.workspaceService.getWorkspaceFolder(URI.file(context.gitRoot)))
		)) {
			return true;
		}
		// If we have a workspace folder for this and the workspace folder belongs to one of the open workspace folders, show it.
		const workspaceFolder = await this.workspaceFolderService.getSessionWorkspaceFolder(sessionId);
		if (workspaceFolder && this.workspaceService.getWorkspaceFolder(workspaceFolder)) {
			return true;
		}
		// If we have a git worktree and the worktree's repo belongs to one of the workspace folders, show it.
		const worktree = await this.worktreeManager.getWorktreeProperties(sessionId);
		if (worktree && this.workspaceService.getWorkspaceFolder(URI.file(worktree.repositoryPath))) {
			return true;
		}
		// If this is an old global session, show it if we don't have specific data to exclude it.
		if (sessionTrackerVisibility.isOldGlobalSession && !workspaceFolder && !worktree && (this.workspaceService.getWorkspaceFolders().length === 0 || this._agentSessionsWorkspace.isAgentSessionsWorkspace)) {
			return true;
		}
		return false;
	}

	protected async createSessionsOptions(options: ICreateSessionOptions & { mcpServers?: SessionOptions['mcpServers'] }): Promise<Readonly<SessionOptions>> {
		const [agentInfos, skillLocations] = await Promise.all([
			this.agents.getAgents(),
			this.copilotCLISkills.getSkillsLocations(CancellationToken.None),
		]);
		const customAgents = agentInfos.map(i => i.agent);
		const variablesContext = this._promptVariablesService.buildTemplateVariablesContext(options.sessionId, options.debugTargetSessionIds);
		const systemMessage: NonNullable<SessionOptions['systemMessage']> = {
			mode: 'customize',
			sections: {
				identity: {
					action: 'replace',
					content: COPILOT_CLI_CHAT_PANEL_SYSTEM_MESSAGE,
				},
			},
		};
		if (variablesContext) {
			systemMessage.content = variablesContext;
		}

		const allOptions: SessionOptions = {
			clientName: 'vscode',
			integrationId: INTEGRATION_ID
		};

		const workingDirectory = getWorkingDirectory(options.workspace);
		if (workingDirectory) {
			allOptions.workingDirectory = workingDirectory.fsPath;
		}
		if (options.model) {
			allOptions.model = options.model as unknown as SessionOptions['model'];
		}
		if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
			allOptions.mcpServers = options.mcpServers;
		}
		if (skillLocations.length > 0) {
			allOptions.skillDirectories = skillLocations.map(uri => uri.fsPath);
		}
		if (options.mcpServerMappings?.size && customAgents && options.mcpServers) {
			remapCustomAgentTools(customAgents, options.mcpServerMappings, options.mcpServers, options.agent);
		}
		if (options.agent) {
			allOptions.selectedCustomAgent = options.agent;
		}
		if (customAgents.length > 0) {
			allOptions.customAgents = customAgents;
		}
		allOptions.enableStreaming = true;
		const copilotUrl = this.configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl) || undefined;
		if (copilotUrl) {
			allOptions.copilotUrl = copilotUrl;
		}
		allOptions.systemMessage = systemMessage;
		allOptions.sessionCapabilities = new Set(['plan-mode', 'memory', 'cli-documentation', 'ask-user', 'interactive-mode', 'system-notifications']);
		if (options.reasoningEffort && this.configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled)) {
			allOptions.reasoningEffort = options.reasoningEffort;
		}

		return allOptions as Readonly<SessionOptions>;
	}

	public async getSession(options: IGetSessionOptions, token: CancellationToken): Promise<RefCountedSession | undefined> {
		// https://github.com/microsoft/vscode/issues/276573
		const lock = this.sessionMutexForGetSession.get(options.sessionId) ?? new Mutex();
		this.sessionMutexForGetSession.set(options.sessionId, lock);
		const lockDisposable = await lock.acquire(token);
		try {
			{
				const session = this._sessionWrappers.get(options.sessionId);
				if (session) {
					this.logService.trace(`[CopilotCLISession] Reusing CopilotCLI session ${options.sessionId}.`);
					this._partialSessionHistories.delete(options.sessionId);
					session.acquire();
					if (options.agent) {
						await session.object.sdkSession.selectCustomAgent(options.agent.name);
					} else {
						session.object.sdkSession.clearCustomAgent();
					}
					return session;
				}
			}

			const [sessionManager, { mcpConfig: mcpServers, disposable: mcpGateway }] = await Promise.all([
				raceCancellationError(this.getSessionManager(), token),
				this.mcpHandler.loadMcpConfig(SessionIdForCLI.getResource(options.sessionId)),
			]);
			try {
				const sessionOptions = await this.createSessionsOptions({ ...options, mcpServers });

				const sdkSession = await sessionManager.getSession({ ...sessionOptions, sessionId: options.sessionId }, true);
				if (!sdkSession) {
					this.logService.error(`[CopilotCLISession] CopilotCLI failed to get session ${options.sessionId}.`);
					return undefined;
				}
				await sessionManager.loadDeferredRepoHooks(sdkSession);
				const session = this.createCopilotSession(sdkSession, options.workspace, options.agent?.name, sessionManager);
				session.object.add(mcpGateway);
				return session;
			}
			catch (error) {
				mcpGateway.dispose();
				throw error;
			}
		} finally {
			lockDisposable?.dispose();
		}
	}
	public async getChatHistory({ sessionId, workspace }: { sessionId: string; workspace: IWorkspaceInfo }, token: CancellationToken): Promise<(ChatRequestTurn2 | ChatResponseTurn2)[]> {
		const { history } = await this.getChatHistoryImpl({ sessionId, workspace }, token);
		return history;
	}

	private async getChatHistoryImpl({ sessionId, workspace }: { sessionId: string; workspace: IWorkspaceInfo }, token: CancellationToken): Promise<{ history: (ChatRequestTurn2 | ChatResponseTurn2)[]; events: readonly SessionEvent[] }> {
		const requestDetailsPromise = this._chatSessionMetadataStore.getRequestDetails(sessionId);
		const agentIdPromise = this._chatSessionMetadataStore.getSessionAgent(sessionId);
		const sessionManager = await raceCancellation(this.getSessionManager(), token);

		if (!sessionManager || token.isCancellationRequested) {
			requestDetailsPromise.catch(error => {/** */ });
			agentIdPromise.catch(error => {/** */ });
			return { history: [], events: [] };
		}

		let events: readonly SessionEvent[] = [];
		let modelId: string | undefined = undefined;

		// Try to shutdown session as soon as possible.
		const existingSession = this._sessionWrappers.get(sessionId)?.object?.sdkSession;
		if (existingSession) {
			modelId = await existingSession.getSelectedModel();
			events = existingSession.getEvents();
		} else {
			let shutdown = Promise.resolve();
			try {
				const session = await sessionManager.getSession({ sessionId }, false);
				if (!session) {
					return { history: [], events: [] };
				}
				modelId = await session.getSelectedModel();
				events = session.getEvents();
				shutdown = sessionManager.closeSession(sessionId).catch(error => {
					this.logService.error(`[CopilotCLISession] Failed to close session ${sessionId} after fetching chat history: ${error}`);
				});
			} finally {
				await shutdown;
			}
		}

		const [agentId, storedDetails] = await Promise.all([agentIdPromise, requestDetailsPromise]);

		// Build lookup from copilotRequestId → RequestDetails for the callback
		const legacyMappings: RequestDetails[] = [];
		const detailsByCopilotId = new Map<string, RequestIdDetails>();
		const defaultModeInstructions = agentId ? await this.resolveAgentModeInstructions(agentId) : undefined;

		await Promise.all(storedDetails.map(async d => {
			if (d.copilotRequestId) {
				const turnAgentId = d.modeInstructions?.uri || d.agentId;
				const modeInstructions = (d.modeInstructions ?? (turnAgentId ? await this.resolveAgentModeInstructions(turnAgentId) : defaultModeInstructions)) ?? defaultModeInstructions;
				detailsByCopilotId.set(d.copilotRequestId, { requestId: d.vscodeRequestId, toolIdEditMap: d.toolIdEditMap, modeInstructions, responseModelId: d.responseModelId });
			}
		}));
		const getVSCodeRequestId = (sdkRequestId: string) => {
			const stored = detailsByCopilotId.get(sdkRequestId);
			if (stored) {
				return stored;
			}
			const mapping = this.copilotCLISDK.getRequestId(sdkRequestId);
			if (mapping) {
				detailsByCopilotId.set(sdkRequestId, mapping);
				legacyMappings.push({
					copilotRequestId: sdkRequestId,
					vscodeRequestId: mapping.requestId,
					toolIdEditMap: mapping.toolIdEditMap,
				});
			}
			return mapping;
		};

		const modelDetailsById = this.configurationService.getConfig(ConfigKey.Advanced.CLIModelDetailsEnabled)
			? await this.getModelDetailsById()
			: undefined;
		const history = buildChatHistoryFromEvents(sessionId, modelId, events, getVSCodeRequestId, this._delegationSummaryService, this.logService, getWorkingDirectory(workspace), defaultModeInstructions, modelDetailsById);

		if (legacyMappings.length > 0) {
			void this._chatSessionMetadataStore.updateRequestDetails(sessionId, legacyMappings).catch(error => {
				this.logService.error(`[CopilotCLISession] Failed to update chat session metadata store with legacy mappings for session ${sessionId}`, error);
			});
		}
		return { history, events };
	}

	private createCustomAgentLookup(): Promise<void> {
		if (!this._customAgentLookupChanged && this._customAgentLookup.size) {
			return Promise.resolve();
		}
		if (this._customAgentLookupRebuild) {
			return this._customAgentLookupRebuild;
		}
		this._customAgentLookupRebuild = (async () => {
			this._customAgentLookupChanged = false;
			try {
				const agents = await this._promptsService.getCustomAgents(CancellationToken.None);

				for (const agent of agents) {
					if (!agent.enabled || !isEnabledForCopilotCLI(agent)) {
						continue;
					}
					const keys = coalesce([
						agent.name?.trim(),
						agent.uri.toString(),
						getAgentFileNameFromFilePath(agent.uri),
					]);

					const lazyContent = new Lazy(() => this._promptsService.parseFile(agent.uri, CancellationToken.None).then(parsed => parsed.body?.getContent() ?? ''));
					for (const key of keys) {
						this._customAgentLookup.set(key, [agent, lazyContent]);
					}
				}
			} catch (error) {
				this._customAgentLookupChanged = true;
				throw error;
			}
		})().finally(() => { this._customAgentLookupRebuild = undefined; });
		return this._customAgentLookupRebuild;
	}

	private async resolveAgentModeInstructions(agentId: string | undefined): Promise<StoredModeInstructions | undefined> {
		if (!agentId) {
			return undefined;
		}
		let agentEntry = this._customAgentLookup.get(agentId);
		if (!agentEntry || this._customAgentLookupChanged) {
			await this.createCustomAgentLookup();
			agentEntry = this._customAgentLookup.get(agentId);
		}
		if (!agentEntry) {
			return undefined;
		}
		const [agent, lazyContent] = agentEntry;
		return {
			uri: agent.uri.toString(),
			name: agent.name?.trim() || agentId,
			content: await lazyContent.value,
		};
	}

	private async getModelDetailsById(): Promise<ReadonlyMap<string, string>> {
		const models = await this._copilotCLIModels.getModels().catch(ex => {
			this.logService.error(ex, 'Failed to get models');
			return [];
		});
		const detailsById = new Map<string, string>();
		for (const model of models) {
			detailsById.set(model.id.trim().toLowerCase(), formatModelDetails(model));
		}
		return detailsById;
	}


	/**
	 * Fork an existing session using the SDK's `forkSession` API.
	 *
	 * The SDK handles copying the event log and (optionally) truncating to a boundary event.
	 * This method additionally stores VS Code-specific workspace metadata and custom title.
	 *
	 * Returns the id of the forked session.
	 */
	public async forkSession({ sessionId, requestId, workspace }: { sessionId: string; requestId: string | undefined; workspace: IWorkspaceInfo }, token: CancellationToken): Promise<string> {
		// Resolve the SDK event ID boundary for truncation BEFORE forking.
		// We need the source session's history and request details to translate the VS Code requestId
		// into the SDK event ID that the SDK's forkSession accepts.
		const [sessionManager, title, { history, events: originalSessionEvents }] = await Promise.all([
			raceCancellationError(this.getSessionManager(), token),
			this.getSessionTitle(sessionId, token),
			requestId ? this.getChatHistoryImpl({ sessionId, workspace }, token) : Promise.resolve({ history: [], events: [] }),
		]);

		let toEventId: string | undefined;
		if (requestId) {
			const requestToTruncateTo = history.find(event => event instanceof ChatRequestTurn2 && event.id === requestId);
			if (requestToTruncateTo) {
				const storedDetails = await this._chatSessionMetadataStore.getRequestDetails(sessionId);
				const translatedSDKEvent = storedDetails.find(d => d.vscodeRequestId === requestToTruncateTo.id || d.copilotRequestId === requestToTruncateTo.id)?.copilotRequestId;
				const sdkEvent = originalSessionEvents.find(e => e.type === 'user.message' && e.id === requestToTruncateTo.id)?.id;
				toEventId = translatedSDKEvent ?? sdkEvent;
				if (!toEventId) {
					this.logService.warn(`[CopilotCLISession] Cannot find SDK event id for request id ${requestId} in session ${sessionId}. Will fork without truncation.`);
				}
			} else {
				this.logService.warn(`[CopilotCLISession] Failed to find request ${requestId} in session ${sessionId} history. Will fork without truncation.`);
			}
		}

		const { sessionId: newSessionId } = await sessionManager.forkSession(sessionId, toEventId);
		this._sessionsBeingCreatedViaFork.add(newSessionId);
		try {
			const forkedTitlePrefix = l10n.t("Forked: ");
			const customTitle = title.startsWith(forkedTitlePrefix) ? title : l10n.t("Forked: {0}", title);
			await this._chatSessionMetadataStore.storeForkedSessionMetadata(sessionId, newSessionId, customTitle);

			this._onDidChangeSessions.fire();
			this._onDidCreateSession.fire({
				id: newSessionId,
				label: customTitle,
				timing: { created: Date.now(), startTime: Date.now() },
				workingDirectory: getWorkingDirectory(workspace)
			});

			return newSessionId;
		} finally {
			this._sessionsBeingCreatedViaFork.delete(newSessionId);
		}
	}
	public async tryGetPartialSessionHistory(sessionId: string): Promise<readonly (ChatRequestTurn2 | ChatResponseTurn2)[] | undefined> {
		const cached = this._partialSessionHistories.get(sessionId);
		if (cached) {
			return cached;
		}

		try {
			const events = await readSessionEventsFile(sessionId);

			const sessionStartEvent = events.find((event): event is Extract<SessionEvent, { type: 'session.start' }> => event.type === 'session.start');
			const workingDirectory = sessionStartEvent?.data.context?.cwd;
			if (workingDirectory) {
				this._sessionWorkingDirectories.set(sessionId, URI.file(workingDirectory));
			}

			const history = buildChatHistoryFromEvents(sessionId, undefined, events, () => undefined, this._delegationSummaryService, this.logService, workingDirectory ? URI.file(workingDirectory) : undefined);
			this._partialSessionHistories.set(sessionId, history);
			return history;
		} catch (error) {
			this.logService.warn(`[CopilotCLISession] Failed to reconstruct partial session ${sessionId}: ${error}`);
			return undefined;
		}
	}

	private async getFirstUserMessageFromSession(sessionId: string, token: CancellationToken): Promise<string | undefined> {
		const cached = await this._chatSessionMetadataStore.getSessionFirstUserMessage(sessionId);
		if (typeof cached === 'string') {
			return cached;
		}

		let firstUserMessage: string | undefined;
		try {
			const events = await raceCancellation(readSessionEventsFile(sessionId, 'user.message'), token);
			if (events?.length) {
				// Find the first user message and use that as the title.
				firstUserMessage = events.find((msg: SessionEvent) => msg.type === 'user.message')?.data.content;
			}
		} catch (error) {
			this.logService.warn(`[CopilotCLISession] Failed to get session title for session ${sessionId}: ${error}`);
		}

		if (!firstUserMessage) {
			try {
				const { events } = await this.getChatHistoryImpl({ sessionId, workspace: emptyWorkspaceInfo() }, token);
				firstUserMessage = events.find((msg: SessionEvent) => msg.type === 'user.message')?.data.content;
			} catch (error) {
				this.logService.warn(`[CopilotCLISession] Failed to load session for first user message ${sessionId}: ${error}`);
			}
		}

		this._chatSessionMetadataStore.setSessionFirstUserMessage(sessionId, firstUserMessage ?? '').catch(err => {
			this.logService.warn(`[CopilotCLISession] Failed to store first user message for session ${sessionId}: ${err}`);
		});

		return firstUserMessage;
	}

	private createCopilotSession(sdkSession: Session, workspaceInfo: IWorkspaceInfo, agentName: string | undefined, sessionManager: internal.LocalSessionManager): RefCountedSession {
		sdkSession.setPermissionsRequired(true);
		const session = this.instantiationService.createInstance(CopilotCLISession, workspaceInfo, agentName, sdkSession, []);
		this._debugFileLogger.startSession(session.sessionId).catch(err => {
			this.logService.error('[CopilotCLISession] Failed to start debug log session', err);
		});
		session.add(toDisposable(() => {
			this._debugFileLogger.endSession(session.sessionId).catch(err => {
				this.logService.error('[CopilotCLISession] Failed to end debug log session', err);
			});
		}));
		// Wire the bridge processor so the session can register traceId → sessionId mappings
		session.setBridgeProcessor(this._bridgeProcessor);
		// Wire SDK trace context updater so the session can propagate traceparent to SDK spans
		const otelLifecycle = sessionManager.otel;
		if (otelLifecycle) {
			session.setSdkTraceContextUpdater((traceparent, tracestate) =>
				otelLifecycle.updateParentTraceContext(sdkSession.sessionId, traceparent, tracestate));
		}
		session.add(session.onDidChangeStatus(() => {
			this.triggerOnDidChangeSessionItem(sdkSession.sessionId, 'statusChange');
			this._onDidChangeSessions.fire();
		}));
		session.add(toDisposable(() => {
			this._sessionWrappers.deleteAndLeak(sdkSession.sessionId);
			this.sessionMutexForGetSession.delete(sdkSession.sessionId);
			(async () => {
				if (sdkSession.isAbortable()) {
					await sdkSession.abort().catch(error => {
						this.logService.error(`Failed to abort session ${sdkSession.sessionId}: ${error}`);
					});
				}
				await sessionManager.closeSession(sdkSession.sessionId).catch(error => {
					this.logService.error(`Failed to close session ${sdkSession.sessionId}: ${error}`);
				});
				this._onDidCloseSession.fire(sdkSession.sessionId);
			})();
		}));

		const refCountedSession = new RefCountedSession(session);
		this._sessionWrappers.set(sdkSession.sessionId, refCountedSession);
		return refCountedSession;
	}

	public async deleteSession(sessionId: string): Promise<void> {
		this._sessionLabels.delete(sessionId);
		this._partialSessionHistories.delete(sessionId);
		this._sessionWorkingDirectories.delete(sessionId);
		try {
			{
				const session = this._sessionWrappers.get(sessionId);
				if (session) {
					session.dispose();
					this.logService.warn(`Delete an active session ${sessionId}.`);
				}
			}

			// Delete from session manager first
			const sessionManager = await this.getSessionManager();
			await sessionManager.deleteSession(sessionId);

		} catch (error) {
			this.logService.error(`Failed to delete session ${sessionId}: ${error}`);
		} finally {
			this._sessionWrappers.deleteAndLeak(sessionId);
			// Possible the session was deleted in another vscode session or the like.
			this._onDidChangeSessions.fire();
			this._onDidDeleteSession.fire(sessionId);
		}
	}

	private async updateSdkSessionMetadata(sessionId: string, title: string, operation: (sdkSession: LocalSession) => Promise<void>): Promise<void> {
		let sessionManager: internal.LocalSessionManager | undefined;
		let shouldCloseSession = false;
		const sdkSession = (this._sessionWrappers.get(sessionId)?.object.sdkSession as LocalSession | undefined) ?? await (async () => {
			sessionManager = await this.getSessionManager();
			const session = await sessionManager.getSession({ sessionId }, true) as LocalSession | undefined;
			shouldCloseSession = !!session;
			return session;
		})();

		if (!sdkSession) {
			// SDK session not yet materialized (e.g. brand-new VS Code sessionId).
			// Stage locally; `createSession` syncs it into the SDK once the session is created.
			await this.customSessionTitleService.setCustomSessionTitle(sessionId, title);
			return;
		}

		try {
			await operation(sdkSession);
		} finally {
			if (shouldCloseSession && sessionManager) {
				await sessionManager.closeSession(sessionId).catch(error => {
					this.logService.error(`[CopilotCLISession] Failed to close session ${sessionId} after updating title metadata: ${error}`);
				});
			}
		}
	}

	public async renameSession(sessionId: string, title: string): Promise<void> {
		await this.updateSdkSessionMetadata(sessionId, title, sdkSession => sdkSession.renameSession(title));
		this._sessionLabels.delete(sessionId);
		this._onDidChangeSessions.fire();
	}

	public async updateSessionSummary(sessionId: string, title: string): Promise<void> {
		await this.updateSdkSessionMetadata(sessionId, title, sdkSession => sdkSession.updateSessionSummary(title));
		// Invalidate the derived-label cache so a subsequent title resolution
		// can pick up the freshly-written summary instead of returning a stale
		// label that was extracted from session history on a prior pass.
		this._sessionLabels.delete(sessionId);
		this._onDidChangeSessions.fire();
	}
}

async function readSessionEventsFile(sessionId: string, findFirstEventType?: string): Promise<SessionEvent[]> {
	const sessionDirPath = getCopilotCLISessionDir(sessionId);
	const sessionDir = URI.file(sessionDirPath);
	const eventsFile = joinPath(sessionDir, 'events.jsonl');

	const events: SessionEvent[] = [];
	const stream = createReadStream(eventsFile.fsPath, { encoding: 'utf8' });
	const reader = createInterface({
		input: stream,
		crlfDelay: Infinity,
	});
	try {
		for await (const line of reader) {
			if (line.trim().length === 0) {
				continue;
			}
			const sessionEvent = JSON.parse(line) as SessionEvent;
			events.push(sessionEvent);
			if (findFirstEventType && sessionEvent.type === findFirstEventType) {
				break;
			}
		}
	} finally {
		reader.close();
		stream.close();
	}

	return events;
}

export class CopilotCLISessionWorkspaceTracker {
	private readonly _initializeSessionStorageFiles: Lazy<Promise<{ global: Uri; workspace: Uri }>>;
	private _oldGlobalSessions?: Set<string>;
	private readonly _workspaceSessions = new Set<string>();
	constructor(
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		this._initializeSessionStorageFiles = new Lazy<Promise<{ global: Uri; workspace: Uri }>>(async () => {
			const globalFile = joinPath(this.context.globalStorageUri, 'copilot.cli.oldGlobalSessions.json');
			let workspaceFile = joinPath(this.context.globalStorageUri, 'copilot.cli.workspaceSessions.json');
			// If we have workspace folders, track workspace sessions separately. Otherwise treat them as global sessions.
			if (this.workspaceService.getWorkspaceFolders().length) {
				let workspaceFileName = this.context.workspaceState.get<string | undefined>(COPILOT_CLI_WORKSPACE_JSON_FILE_KEY);
				if (!workspaceFileName) {
					workspaceFileName = `copilot.cli.workspaceSessions.${generateUuid()}.json`;
					await this.context.workspaceState.update(COPILOT_CLI_WORKSPACE_JSON_FILE_KEY, workspaceFileName);
				}
				workspaceFile = joinPath(this.context.globalStorageUri, workspaceFileName);
			}

			await Promise.all([
				// Load old sessions
				(async () => {
					const oldSessions = await this.fileSystem.readFile(globalFile).then(c => new TextDecoder().decode(c).split(',')).catch(() => undefined);
					if (oldSessions) {
						this._oldGlobalSessions = new Set<string>(oldSessions);
					}
				})(),
				// Load workspace sessions
				(async () => {
					const workspaceSessions = this.workspaceService.getWorkspaceFolders().length ?
						await this.fileSystem.readFile(workspaceFile).then(c => new TextDecoder().decode(c).split(',')).catch(() => []) : [];
					workspaceSessions.forEach(s => this._workspaceSessions.add(s));
				})(),
			]);

			return { global: globalFile, workspace: workspaceFile };
		});
		void this._initializeSessionStorageFiles.value;
	}

	public async initialize(): Promise<void> {
		await this._initializeSessionStorageFiles.value;
	}

	/**
	 * InitializeOldSessions should have been called before this.
	 */
	public shouldShowSession(sessionId: string): { isOldGlobalSession?: boolean; isWorkspaceSession?: boolean } {
		return {
			isOldGlobalSession: this._oldGlobalSessions?.has(sessionId),
			isWorkspaceSession: this._workspaceSessions.has(sessionId),
		};
	}
}

function labelFromPrompt(prompt: string): string {
	// Strip system reminders from the prompt
	return stripReminders(prompt);
}

/**
 * Extracts the session ID from a deleted events.jsonl file path.
 * Expected path format: <sessionDir>/<sessionId>/events.jsonl
 */
function extractSessionIdFromEventPath(sessionDir: URI, deletedFileUri: URI): string | undefined {
	if (basename(deletedFileUri) !== 'events.jsonl') {
		return undefined;
	}
	const parentDir = dirname(deletedFileUri);
	const parentOfParent = dirname(parentDir);
	if (parentOfParent.path !== sessionDir.path) {
		return undefined;
	}
	return basename(parentDir);
}

export class Mutex {
	private _locked = false;
	private readonly _acquireQueue: (() => void)[] = [];

	isLocked(): boolean {
		return this._locked;
	}

	// Acquire the lock; resolves with a release function you MUST call.
	acquire(token: CancellationToken): Promise<IDisposable | undefined> {
		return raceCancellation(new Promise<IDisposable | undefined>(resolve => {
			const tryAcquire = () => {
				if (token.isCancellationRequested) {
					resolve(undefined);
					return;
				}
				if (!this._locked) {
					this._locked = true;
					resolve(toDisposable(() => this._release()));
				} else {
					this._acquireQueue.push(tryAcquire);
				}
			};
			tryAcquire();
		}), token);
	}

	private _release(): void {
		if (!this._locked) {
			// already unlocked
			return;
		}
		this._locked = false;
		const next = this._acquireQueue.shift();
		if (next) {
			next();
		}
	}
}

export class RefCountedSession extends RefCountedDisposable implements IReference<CopilotCLISession> {
	constructor(public readonly object: CopilotCLISession) {
		super(object);
	}
	dispose(): void {
		this.release();
	}
}
