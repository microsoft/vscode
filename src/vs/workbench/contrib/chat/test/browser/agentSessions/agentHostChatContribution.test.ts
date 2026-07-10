/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { constObservable, derived, ISettableObservable, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentCreateSessionConfig, IAgentHostService, IAgentSessionMetadata, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ChatInputRequestWithPlanReview } from '../../../../../../platform/agentHost/common/agentHostPlanReview.js';
import { AgentFeedbackAttachmentDisplayKind, AgentFeedbackAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js';
import { BrowserViewAttachmentDisplayKind, BrowserViewAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/browserViewAttachments.js';
import { ActionType, isSessionAction, isChatAction, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type ChatAction, type TerminalAction, type INotification, type IToolCallConfirmedAction, type ITurnStartedAction, type ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IStateSnapshot } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { CustomizationType, McpAuthRequiredReason, McpServerStatus, type ClientPluginCustomization, type ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, SessionLifecycle, SessionStatus, TurnState, ToolCallStatus, ToolCallConfirmationReason, ToolCallContributorKind, createSessionState, createChatState, createDefaultChatSummary, buildChatUri, buildDefaultChatUri, parseDefaultChatUri, isAhpChatChannel, createActiveTurn, isAhpRootChannel, PolicyState, ResponsePartKind, ROOT_STATE_URI, StateComponents, buildSubagentChatUri, ToolResultContentType, MessageAttachmentKind, MessageKind, type SessionState, type SessionSummary, type ChatState, type ISessionWithDefaultChat, RootState, type ToolCallState, type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CompletionItemKind as AhpCompletionItemKind, type CompletionsParams, type CompletionsResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { sessionReducer, chatReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IProgress, IProgressNotificationOptions, IProgressService, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ChatRequestQueueKind, ElicitationState, IChatService, IChatMarkdownContent, IChatMcpAuthenticationRequired, IChatProgress, IChatSubagentToolInvocationData, IChatTerminalToolInvocationData, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, IChatUsage, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatDebugService } from '../../../common/chatDebugService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IChatResponseFileChangesService } from '../../../browser/chatResponseFileChangesService.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IChatSessionsService, type IChatSession, type IChatSessionItemController, type IChatSessionRequestHistoryItem, type IChatSessionsExtensionPoint } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostContribution, AgentHostSessionHandler } from '../../../browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionListContribution } from '../../../browser/agentSessions/agentHost/agentHostSessionListContribution.js';
import { AgentHostSessionListController } from '../../../browser/agentSessions/agentHost/agentHostSessionListController.js';
import { AgentHostSessionListStore, type IAgentHostSessionListConnection } from '../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { OpenAgentHostFolderPickerAction } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.js';
import { MenuId, MenuRegistry, isIMenuItem, type IMenuItem } from '../../../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { type ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { SyncedCustomizationBundler } from '../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostMcpServer } from '../../../../../../sessions/common/agentHostSessionsProvider.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import type { IChatModel, IChatModelInputState, IChatPendingRequest, IChatRequestModel, IInputModel } from '../../../common/model/chatModel.js';
import { convertBufferToScreenshotVariable } from '../../../browser/attachments/chatScreenshotContext.js';
import { AgentHostCompletionReferenceKind, ChatPasteAttachmentMetadata, toAgentHostCompletionVariableEntry, type IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { messageAttachmentsToVariableData } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { AgentHostSessionReferenceAttachmentDisplayKind, AgentHostSessionReferenceAttachmentMetadataKey, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind, toSessionReferenceModelRepresentation } from '../../../browser/agentSessions/agentHost/agentHostSessionReferenceAttachment.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';

// ---- Mock agent host service ------------------------------------------------

/**
 * A {@link SessionState} that may additionally carry the conversation fields
 * which, under multi-chat, live on the default {@link ChatState}. Tests seed
 * these on the session for convenience; the mock connection splits them onto
 * the default-chat subscription when serving {@link StateComponents.Chat}.
 */
type SeededSessionState = SessionState & Partial<Pick<ISessionWithDefaultChat, 'turns' | 'activeTurn' | 'steeringMessage' | 'queuedMessages' | 'inputRequests' | 'draft'>>;

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;
	override readonly onAgentHostExit = Event.None;
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}

	private readonly _authenticationPending: ISettableObservable<boolean> = observableValue('authenticationPending', false);
	override readonly authenticationPending: IObservable<boolean> = this._authenticationPending;
	override setAuthenticationPending(pending: boolean): void {
		this._authenticationPending.set(pending, undefined);
	}

	override readonly initializeResult = constObservable(undefined);

	// Track live subscriptions so fireAction can route to them. A subscription
	// may hold a SessionState (for session channels) or a ChatState (for the
	// per-session default chat channel).
	private readonly _liveSubscriptions = new Map<string, { state: SessionState | ChatState; emitter: Emitter<SessionState | ChatState>; onWillApply: Emitter<ActionEnvelope>; onDidApply: Emitter<ActionEnvelope> }>();

	private _nextId = 1;
	private readonly _sessions = new Map<string, IAgentSessionMetadata>();
	public createSessionCalls: IAgentCreateSessionConfig[] = [];
	public disposedSessions: URI[] = [];
	public failNextSubscriptionFor = new Set<string>();
	public agents = [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', requiresAuth: true }];

	// ---- Pending→error subscription support (repro for #5242) --------------
	// Models a subscription that is first observed *pending* (value === undefined)
	// and later transitions to an error via the real `BaseAgentSubscription.setError`
	// semantics: it fires `onDidError` but NOT `onDidChange`. This is the exact
	// shape that strands an awaiter which only listens to `onDidChange`.
	private readonly _pendingErrorSubs = new Map<string, { onDidChange: Emitter<unknown>; onDidError: Emitter<Error>; error: Error | undefined }>();

	/** Register a subscription for `resource` that starts pending (no snapshot, no error). */
	public makePendingErrorSub(resource: string): void {
		this._pendingErrorSubs.set(resource, { onDidChange: new Emitter<unknown>(), onDidError: new Emitter<Error>(), error: undefined });
	}

	/**
	 * Transition a registered pending subscription to error, mirroring real
	 * `setError`: set the error value and fire `onDidError` only (never
	 * `onDidChange`). Then clear the pending registration and seed healthy
	 * session state so a subsequent re-subscribe succeeds (models the race
	 * finally resolving once the backend registers the session).
	 */
	public firePendingSubError(resource: string, err: Error): void {
		const entry = this._pendingErrorSubs.get(resource);
		if (!entry) {
			throw new Error(`No pending-error sub registered for ${resource}`);
		}
		entry.error = err;
		entry.onDidError.fire(err);
		this._pendingErrorSubs.delete(resource);
	}

	private _buildPendingErrorSub<T>(entry: { onDidChange: Emitter<unknown>; onDidError: Emitter<Error>; error: Error | undefined }): IAgentSubscription<T> {
		return {
			get value() { return entry.error as T | Error | undefined; },
			get verifiedValue() { return undefined; },
			onDidChange: entry.onDidChange.event as Event<T>,
			onDidError: entry.onDidError.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	/**
	 * If set, the next {@link createSession} call seeds the session summary's
	 * `workingDirectory` to this URI instead of echoing back
	 * `config.workingDirectory`. Used to simulate the server resolving the
	 * working directory to a worktree path that differs from the requested
	 * directory.
	 */
	public nextResolvedWorkingDirectory?: URI;

	override async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()];
	}

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		if (config) {
			this.createSessionCalls.push(config);
		}
		const session = config?.session ?? AgentSession.uri('copilot', `sdk-session-${this._nextId++}`);
		this._sessions.set(session.toString(), { session, startTime: Date.now(), modifiedTime: Date.now() });
		// Simulate the server's eager active-client claim: if the caller
		// provided activeClient, seed the session state so subscribers see it.
		if (config?.activeClient) {
			const summary: SessionSummary = {
				resource: session.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectory: (this.nextResolvedWorkingDirectory ?? config.workingDirectory)?.toString(),
			};
			const state: SessionState = {
				...this._withDefaultChatCatalog(createSessionState(summary), session.toString()),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [config.activeClient],
			};
			this.sessionStates.set(session.toString(), state);
		}
		this.nextResolvedWorkingDirectory = undefined;
		return session;
	}

	override async disposeSession(session: URI): Promise<void> { this.disposedSessions.push(session); }
	async shutdown(): Promise<void> { }
	override async restartAgentHost(): Promise<void> { }

	// Protocol methods
	public override readonly clientId = 'test-window-1';
	public dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction; clientId: string; clientSeq: number }[] = [];

	/** Returns dispatched actions filtered to turn-related types only
	 *  (excludes lifecycle actions like activeClientSet). */
	get turnActions() {
		return this.dispatchedActions.filter(d => d.action.type === 'chat/turnStarted');
	}
	public sessionStates = new Map<string, SeededSessionState>();
	async subscribe(resource: URI): Promise<IStateSnapshot> {
		const resourceStr = resource.toString();
		const existingState = this.sessionStates.get(resourceStr);
		if (existingState) {
			return { resource: resourceStr, state: this._withDefaultChatCatalog(existingState, resourceStr), fromSeq: 0 };
		}
		// Root state subscription
		if (isAhpRootChannel(resourceStr)) {
			return {
				resource: resourceStr,
				state: {
					agents: this.agents.map(a => ({ provider: a.provider, displayName: a.displayName, description: a.description, models: [] })),
					activeSessions: 0
				},
				fromSeq: 0,
			};
		}
		const summary: SessionSummary = {
			resource: resourceStr,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		};
		return {
			resource: resourceStr,
			state: { ...this._withDefaultChatCatalog(createSessionState(summary), resourceStr), lifecycle: SessionLifecycle.Ready },
			fromSeq: 0,
		};
	}
	unsubscribe(_resource: URI): void { }
	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.dispatchedActions.push({ channel, action, clientId, clientSeq });
	}
	private _nextSeq = 1;
	nextClientSeq(): number {
		return this._nextSeq++;
	}

	private _rootStateValue: RootState | undefined = undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();

	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const onDidChangeEmitter = this._rootStateOnDidChange;
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: onDidChangeEmitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	/** Test helper: set rootState value and fire onDidChange. */
	setRootState(state: RootState): void {
		this._rootStateValue = state;
		this._rootStateOnDidChange.fire(state);
	}

	public authenticateCalls: { resource: string; scopes?: readonly string[]; token: string }[] = [];
	override async authenticate(params: { resource: string; scopes?: readonly string[]; token: string }): Promise<{ authenticated: boolean }> {
		this.authenticateCalls.push({ resource: params.resource, scopes: params.scopes, token: params.token });
		return { authenticated: true };
	}
	override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const resourceStr = resource.toString();
		const pendingEntry = this._pendingErrorSubs.get(resourceStr);
		if (pendingEntry) {
			return { object: this._buildPendingErrorSub<T>(pendingEntry), dispose: () => { } };
		}
		const emitter = new Emitter<T>();
		const onWillApply = new Emitter<ActionEnvelope>();
		const onDidApply = new Emitter<ActionEnvelope>();

		if (this.failNextSubscriptionFor.delete(resourceStr)) {
			const error = new Error(`Session not found on backend: ${resourceStr}`);
			return {
				object: {
					get value() { return error; },
					get verifiedValue() { return undefined; },
					onDidChange: emitter.event,
					onWillApplyAction: onWillApply.event,
					onDidApplyAction: onDidApply.event,
				},
				dispose: () => {
					emitter.dispose();
					onWillApply.dispose();
					onDidApply.dispose();
				},
			};
		}

		// Hydrate synchronously with a default state. For a default-chat channel
		// serve a ChatState carrying the conversation fields the test seeded on
		// the owning session; otherwise serve the SessionState.
		const sessionForChat = parseDefaultChatUri(resourceStr);
		let initialState: SessionState | ChatState;
		if (sessionForChat !== undefined) {
			initialState = this._buildDefaultChatState(sessionForChat, resourceStr);
		} else {
			const existingState = this.sessionStates.get(resourceStr);
			if (existingState) {
				initialState = this._withDefaultChatCatalog(existingState, resourceStr);
			} else {
				const summary: SessionSummary = {
					resource: resourceStr,
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				};
				initialState = { ...this._withDefaultChatCatalog(createSessionState(summary), resourceStr), lifecycle: SessionLifecycle.Ready };
			}
		}

		// Register in live subscriptions so fireAction can route to it
		const entry = { state: initialState, emitter: emitter as unknown as Emitter<SessionState | ChatState>, onWillApply, onDidApply };
		this._liveSubscriptions.set(resourceStr, entry);

		const self = this;
		const sub: IAgentSubscription<T> = {
			get value() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
			get verifiedValue() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
			onDidChange: emitter.event,
			onWillApplyAction: entry.onWillApply.event,
			onDidApplyAction: entry.onDidApply.event,
		};
		return {
			object: sub,
			dispose: () => {
				this._liveSubscriptions.delete(resourceStr);
				emitter.dispose();
				onWillApply.dispose();
				onDidApply.dispose();
			},
		};
	}
	override getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		const pendingEntry = this._pendingErrorSubs.get(resource.toString());
		if (pendingEntry) {
			return this._buildPendingErrorSub<T>(pendingEntry);
		}
		const entry = this._liveSubscriptions.get(resource.toString());
		if (!entry) {
			return undefined;
		}
		const self = this;
		return {
			get value() { return self._liveSubscriptions.get(resource.toString())?.state as unknown as T; },
			get verifiedValue() { return self._liveSubscriptions.get(resource.toString())?.state as unknown as T; },
			onDidChange: entry.emitter.event as unknown as Event<T>,
			onWillApplyAction: entry.onWillApply.event,
			onDidApplyAction: entry.onDidApply.event,
		} satisfies IAgentSubscription<T>;
	}
	/**
	 * Test helper: inflight `createSession` promises keyed by resource. Tests use this to model the eager-create race
	 * (sessions provider's `eagerCreate` IIFE has fired `createSession` but its continuation hasn't yet opened the
	 * state subscription).
	 */
	public readonly inflightCreates = new Map<string, Promise<unknown>>();
	override getInflightSessionCreate(resource: URI): Promise<unknown> | undefined {
		return this.inflightCreates.get(resource.toString());
	}

	override dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action, clientId: this.clientId, clientSeq: this._nextSeq++ });
		// Apply state-management actions optimistically so state-dependent
		// logic (e.g. customization re-dispatch) sees the correct activeClient.
		// Turn lifecycle actions (turnStarted, toolCallConfirmed, etc.) are applied
		// later via fireAction when the server echoes them back.
		if (isSessionAction(action) && (
			action.type === 'session/activeClientSet'
			|| action.type === 'session/activeClientRemoved'
		)) {
			const entry = this._liveSubscriptions.get(channel.toString());
			if (entry) {
				const noop = () => { };
				entry.state = sessionReducer(entry.state as SessionState, action as Parameters<typeof sessionReducer>[1], noop);
				entry.emitter.fire(entry.state);
			}
		}
	}

	// Test helpers
	fireAction(envelope: ActionEnvelope): void {
		this._onDidAction.fire(envelope);
		// Route the action to the matching live subscription, applying the
		// appropriate reducer. Chat actions (turns/tools/input) belong to the
		// session's default-chat channel: producers may address them to either
		// the session URI (compat) or the chat URI, so resolve the chat channel
		// and emit there — mirroring the server's behaviour. Session actions
		// target the session channel directly.
		const noop = () => { };
		if (isChatAction(envelope.action)) {
			const chatUri = isAhpChatChannel(envelope.channel) ? envelope.channel : buildDefaultChatUri(envelope.channel);
			const entry = this._liveSubscriptions.get(chatUri);
			if (entry) {
				entry.onWillApply.fire(envelope);
				entry.state = chatReducer(entry.state as ChatState, envelope.action as Parameters<typeof chatReducer>[1], noop);
				entry.emitter.fire(entry.state);
				entry.onDidApply.fire(envelope);
			}
		} else if (isSessionAction(envelope.action)) {
			const entry = this._liveSubscriptions.get(envelope.channel);
			if (entry) {
				entry.onWillApply.fire(envelope);
				entry.state = sessionReducer(entry.state as SessionState, envelope.action as Parameters<typeof sessionReducer>[1], noop);
				entry.emitter.fire(entry.state);
				entry.onDidApply.fire(envelope);
			}
		}
	}

	/**
	 * Builds the default-chat {@link ChatState} for a session, seeded with any
	 * conversation fields a test attached to the session's {@link SeededSessionState}.
	 */
	private _buildDefaultChatState(sessionUriStr: string, chatUriStr: string): ChatState {
		const seeded = this.sessionStates.get(chatUriStr) ?? this.sessionStates.get(sessionUriStr);
		const sessionSummary: SessionSummary = {
			resource: sessionUriStr,
			provider: seeded?.provider ?? 'copilot',
			title: seeded?.title ?? 'Test',
			status: seeded?.status ?? SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectory: seeded?.workingDirectory,
			project: seeded?.project,
		};
		const chatSummary = createDefaultChatSummary(sessionSummary, chatUriStr);
		return {
			...createChatState(chatSummary),
			turns: seeded?.turns ?? [],
			activeTurn: seeded?.activeTurn,
			steeringMessage: seeded?.steeringMessage,
			queuedMessages: seeded?.queuedMessages,
			inputRequests: seeded?.inputRequests,
			draft: seeded?.draft,
		};
	}

	private _withDefaultChatCatalog<T extends SessionState>(state: T, resource: string): T {
		if (state.defaultChat && state.chats.length > 0) {
			return state;
		}
		const summary: SessionSummary = {
			resource,
			provider: state.provider,
			title: state.title,
			status: state.status,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectory: state.workingDirectory,
			project: state.project,
		};
		const chatUri = buildDefaultChatUri(resource);
		const additionalChats = [...this.sessionStates.keys()]
			.filter(uri => uri !== chatUri && parseDefaultChatUri(uri) === resource)
			.map(uri => createDefaultChatSummary(summary, uri));
		return {
			...state,
			defaultChat: chatUri,
			chats: [createDefaultChatSummary(summary, chatUri), ...additionalChats],
		};
	}

	addSession(meta: IAgentSessionMetadata): void {
		this._sessions.set(meta.session.toString(), meta);
	}

	fireNotification(notification: INotification): void {
		this._onDidNotification.fire(notification);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._rootStateOnDidChange.dispose();
	}
}

// ---- Minimal service mocks --------------------------------------------------

class MockChatAgentService extends mock<IChatAgentService>() {
	declare readonly _serviceBrand: undefined;

	registeredAgents = new Map<string, { data: IChatAgentData; impl: IChatAgentImplementation }>();

	override registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation) {
		this.registeredAgents.set(data.id, { data, impl: agentImpl });
		return toDisposable(() => this.registeredAgents.delete(data.id));
	}
}

class MockChatWidgetService extends mock<IChatWidgetService>() {
	declare readonly _serviceBrand: undefined;

	readonly clearQuestionCarouselCalls: { sessionResource: URI; responseId: string | undefined; resolveId: string | undefined }[] = [];
	readonly clearPlanReviewCalls: { sessionResource: URI; responseId: string | undefined; resolveId: string | undefined }[] = [];
	private readonly _widgets = new Map<string, ReturnType<IChatWidgetService['getWidgetBySessionResource']>>();

	setWidgetForSession(sessionResource: URI, implicitContextValues?: readonly Partial<IChatRequestVariableEntry>[]): void {
		// eslint-disable-next-line local/code-no-any-casts
		this._widgets.set(sessionResource.toString(), {
			input: {
				clearQuestionCarousel: (responseId?: string, resolveId?: string) => {
					this.clearQuestionCarouselCalls.push({ sessionResource, responseId, resolveId });
				},
				implicitContext: implicitContextValues ? { values: implicitContextValues } : undefined,
				clearPlanReview: (responseId?: string, resolveId?: string) => {
					this.clearPlanReviewCalls.push({ sessionResource, responseId, resolveId });
				},
			},
		} as any);
	}

	override getWidgetBySessionResource(sessionResource: URI): ReturnType<IChatWidgetService['getWidgetBySessionResource']> {
		return this._widgets.get(sessionResource.toString());
	}
}

class MockModelService extends mock<IModelService>() {
	private readonly _models = new Map<string, ITextModel>();

	constructor(private readonly _disposables: DisposableStore) {
		super();
	}

	setModelContent(uri: URI, content: string): void {
		this._models.set(uri.toString(), this._disposables.add(createTextModel(content, null, undefined, uri)));
	}

	override getModel(uri: URI): ITextModel | null {
		return this._models.get(uri.toString()) ?? null;
	}
}

class MockWorkingCopyService extends mock<IWorkingCopyService>() {
	private readonly _dirty = new Set<string>();

	setDirty(uri: URI, dirty: boolean): void {
		if (dirty) {
			this._dirty.add(uri.toString());
		} else {
			this._dirty.delete(uri.toString());
		}
	}

	override isDirty(resource: URI): boolean {
		return this._dirty.has(resource.toString());
	}
}

// ---- Helpers ----------------------------------------------------------------

function createTestServices(disposables: DisposableStore, workingDirectoryResolver?: { resolve(sessionResource: URI): URI | undefined; isNewSession?: (sessionResource: URI) => boolean }, authServiceOverride?: Partial<IAuthenticationService>, languageModels?: ReadonlyMap<string, ILanguageModelChatMetadata>, provisionalServiceOverride?: Partial<IAgentHostUntitledProvisionalSessionService>, isSessionsWindow = false, languageModelToolsServiceOverride?: Partial<ILanguageModelToolsService>, configOverrides?: Record<string, unknown>, chatSessionsServiceOverride?: Partial<IChatSessionsService>, chatDebugServiceOverride?: Partial<IChatDebugService>, remoteAgentHostServiceOverride?: Partial<IRemoteAgentHostService>, customizationServiceOverride?: IAgentHostCustomizationService) {
	const instantiationService = disposables.add(new TestInstantiationService());

	const agentHostService = new MockAgentHostService();
	disposables.add(toDisposable(() => agentHostService.dispose()));

	const chatAgentService = new MockChatAgentService();
	const chatWidgetService = new MockChatWidgetService();
	const chatSessionContributions: IChatSessionsExtensionPoint[] = [];
	const chatSessionItemControllers: { type: string; controller: IChatSessionItemController }[] = [];
	const openerService: { openedUrls: (string | URI)[]; openShouldFail: boolean; openResult: boolean } & Partial<IOpenerService> = {
		openedUrls: [],
		openShouldFail: false,
		openResult: true,
		async open(target: string | URI) {
			this.openedUrls.push(target);
			if (this.openShouldFail) {
				throw new Error('open failed');
			}
			return this.openResult;
		},
	};

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IProductService, { quality: 'insider' });
	instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Free, quotas: {} } as Partial<IChatEntitlementService> as IChatEntitlementService);
	instantiationService.stub(IChatAgentService, chatAgentService);
	instantiationService.stub(IChatWidgetService, chatWidgetService);
	instantiationService.stub(IFileService, TestFileService);
	instantiationService.stub(ILabelService, MockLabelService);
	instantiationService.stub(IPathService, new class extends mock<IPathService>() {
		override userHome(options: { preferLocal: true }): URI;
		override userHome(options?: { preferLocal: boolean }): Promise<URI>;
		override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
			const userHome = URI.file('/home/test-user');
			return options?.preferLocal ? userHome : Promise.resolve(userHome);
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, { connections: [], ...remoteAgentHostServiceOverride });
	const modelService = new MockModelService(disposables);
	const workingCopyService = new MockWorkingCopyService();
	instantiationService.stub(IModelService, modelService);
	instantiationService.stub(IWorkingCopyService, workingCopyService);
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionItemController: (type, controller) => {
			const entry = { type, controller };
			chatSessionItemControllers.push(entry);
			return toDisposable(() => {
				const index = chatSessionItemControllers.indexOf(entry);
				if (index >= 0) {
					chatSessionItemControllers.splice(index, 1);
				}
			});
		},
		registerChatSessionContentProvider: () => toDisposable(() => { }),
		registerChatSessionContribution: contribution => {
			chatSessionContributions.push(contribution);
			return toDisposable(() => { });
		},
		getOrCreateChatSession: async sessionResource => upcastPartial<IChatSession>({
			sessionResource,
			onWillDispose: Event.None,
			history: [],
			dispose: () => { },
		}),
		...chatSessionsServiceOverride,
	});
	instantiationService.stub(IChatDebugService, {
		getEvents: () => [],
		invokeProviders: async () => { },
		resolveEvent: async () => undefined,
		...chatDebugServiceOverride,
	});
	instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
	instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None, ...authServiceOverride });
	instantiationService.stub(ILanguageModelsService, {
		deltaLanguageModelChatProviderDescriptors: () => { },
		registerLanguageModelProvider: () => toDisposable(() => { }),
		lookupLanguageModel: (modelId: string) => languageModels?.get(modelId),
	});
	instantiationService.stub(IConfigurationService, {
		onDidChangeConfiguration: Event.None,
		getValue: (...args: any[]) => {
			const key = args[0];
			if (typeof key === 'string') {
				if (configOverrides && Object.hasOwn(configOverrides, key)) {
					return configOverrides[key];
				}
				if (key === 'chat.agentHost.clientTools') {
					return [];
				}
			}
			return true;
		},
	});
	instantiationService.stub(ILanguageModelToolsService, {
		observeTools: () => observableValue('tools', []),
		onDidChangeTools: Event.None,
		getTools: () => [],
		_serviceBrand: undefined,
		...languageModelToolsServiceOverride,
	});
	instantiationService.stub(IOutputService, { getChannel: () => undefined });
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: true });
	instantiationService.stub(IProgressService, { withProgress: <R,>(_options: IProgressNotificationOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>) => task({ report: () => { } }) });
	instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null, onDidChangeWorkspaceFolders: Event.None });
	const trustController: { result: boolean | undefined; workspaceTrustCalls: number; resourcesTrustCalls: number } = { result: true, workspaceTrustCalls: 0, resourcesTrustCalls: 0 };
	instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
		override async requestWorkspaceTrust(): Promise<boolean | undefined> {
			trustController.workspaceTrustCalls++;
			return trustController.result;
		}
		override async requestResourcesTrust(): Promise<boolean | undefined> {
			trustController.resourcesTrustCalls++;
			return trustController.result;
		}
	});
	instantiationService.stub(IChatEditingService, {
		registerEditingSessionProvider: () => toDisposable(() => { }),
	});
	instantiationService.stub(IChatResponseFileChangesService, {
		registerProvider: () => toDisposable(() => { }),
	});
	const chatModels = new Map<string, IChatModel>();
	const onDidCreateModel = disposables.add(new Emitter<IChatModel>());
	const chatService = {
		getSession: (sessionResource: URI) => chatModels.get(sessionResource.toString()),
		onDidCreateModel: onDidCreateModel.event,
		onDidDisposeSession: Event.None,
		setSession(sessionResource: URI, model: IChatModel) {
			chatModels.set(sessionResource.toString(), model);
			onDidCreateModel.fire(model);
		},
		removePendingRequestCalls: [] as { sessionResource: URI; requestId: string }[],
		removePendingRequest(sessionResource: URI, requestId: string) {
			this.removePendingRequestCalls.push({ sessionResource, requestId });
		},
	};
	instantiationService.stub(IChatService, chatService);
	instantiationService.stub(IAgentHostFileSystemService, {
		registerAuthority: () => toDisposable(() => { }),
		ensureSyncedCustomizationProvider: () => { },
	});
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ICustomizationHarnessService, {
		registerExternalHarness: () => toDisposable(() => { }),
	});
	instantiationService.stub(IAgentPluginService, {
		plugins: observableValue('plugins', []),
	});
	instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;
		override readonly onDidChangeAgentInstructions = Event.None;

		override async listPromptFilesForStorage() {
			return [];
		}
	}());
	instantiationService.stub(ITerminalChatService, {
		onDidContinueInBackground: Event.None,
		registerTerminalInstanceWithToolSession: () => { },
		getAhpCommandSource: () => undefined,
	});
	instantiationService.stub(IAgentHostTerminalService, {
		reviveTerminal: async () => undefined!,
		createTerminalForEntry: async () => undefined,
		profiles: observableValue('test', []),
		getProfileForConnection: () => undefined,
		registerEntry: () => ({ dispose() { } }),
	});
	instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, {
		registerResolver: () => toDisposable(() => { }),
		resolve: sessionResource => workingDirectoryResolver?.resolve(sessionResource),
		isNewSession: sessionResource => workingDirectoryResolver?.isNewSession?.(sessionResource) ?? sessionResource.path.substring(1).startsWith('new-'),
	});
	instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow } as Partial<IWorkbenchEnvironmentService>);
	instantiationService.stub(IAgentHostCustomizationService, customizationServiceOverride ?? new NullAgentHostCustomizationService());
	instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
		onDidChange: Event.None,
		get: () => undefined,
		waitForPending: async () => undefined,
		getOrCreate: async () => undefined,
		tryRebind: async () => undefined,
		disposeSession: async () => { },
		...provisionalServiceOverride,
	} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService);
	instantiationService.stub(IAgentHostImportConversationStore, {
		set: () => { },
		take: () => undefined,
		rename: () => { },
	} as Partial<IAgentHostImportConversationStore> as IAgentHostImportConversationStore);
	const newSessionFolderService = disposables.add(new AgentHostNewSessionFolderService(chatService as Partial<IChatService> as IChatService, instantiationService.get(IWorkspaceContextService)));
	instantiationService.stub(IAgentHostNewSessionFolderService, newSessionFolderService);
	const customizationsByType = new Map<string, IObservable<readonly ClientPluginCustomization[]>>();
	const seedActiveClient = (sessionType: string, entry: { customizations: IObservable<readonly ClientPluginCustomization[]> }): IDisposable => {
		customizationsByType.set(sessionType, entry.customizations);
		return toDisposable(() => {
			if (customizationsByType.get(sessionType) === entry.customizations) {
				customizationsByType.delete(sessionType);
			}
		});
	};
	const activeClientService: IAgentHostActiveClientService = {
		_serviceBrand: undefined,
		registerForAgent: (sessionType) => {
			// Tests that exercise customization changes seed entries via
			// `seedActiveClient` directly. This stub just records an empty
			// entry so the contribution flow completes.
			const inner = seedActiveClient(sessionType, {
				customizations: constObservable<readonly ClientPluginCustomization[]>([]),
			});
			return {
				syncProvider: {
					onDidChange: Event.None,
					isDisabled: () => false,
					setDisabled: () => { },
				},
				bundler: new class extends mock<SyncedCustomizationBundler>() {
					override getOrigin() { return undefined; }
				},
				dispose: () => inner.dispose(),
			};
		},
		getActiveClient: (sessionType: string, clientId: string) => ({
			clientId,
			tools: [],
			customizations: [...(customizationsByType.get(sessionType)?.get() ?? [])],
		}),
		getCustomizations: (sessionType: string) => derived(reader => customizationsByType.get(sessionType)?.read(reader) ?? []),
		getClientTools: () => constObservable<readonly ToolDefinition[]>([]),
	};
	instantiationService.stub(IAgentHostActiveClientService, activeClientService);
	instantiationService.stub(IOpenerService, openerService as IOpenerService);

	return { instantiationService, agentHostService, chatAgentService, chatWidgetService, chatService, openerService, activeClientService, seedActiveClient, chatSessionContributions, chatSessionItemControllers, newSessionFolderService, trustController, modelService, workingCopyService };
}

function createSessionListStore(disposables: DisposableStore, instantiationService: TestInstantiationService, connection: IAgentHostSessionListConnection): AgentHostSessionListStore {
	return disposables.add(instantiationService.createInstance(AgentHostSessionListStore, connection));
}

function createSessionListController(disposables: DisposableStore, instantiationService: TestInstantiationService, connection: IAgentHostSessionListConnection, sessionType = 'agent-host-copilot', provider = 'copilot', description: string | undefined = undefined): AgentHostSessionListController {
	const sessionListStore = createSessionListStore(disposables, instantiationService, connection);
	return disposables.add(instantiationService.createInstance(AgentHostSessionListController, sessionType, provider, sessionListStore, description, 'local'));
}

function createContribution(disposables: DisposableStore, opts?: { authServiceOverride?: Partial<IAuthenticationService>; workingDirectoryResolver?: { resolve(sessionResource: URI): URI | undefined; isNewSession?: (sessionResource: URI) => boolean }; languageModels?: ReadonlyMap<string, ILanguageModelChatMetadata>; provisionalServiceOverride?: Partial<IAgentHostUntitledProvisionalSessionService>; languageModelToolsServiceOverride?: Partial<ILanguageModelToolsService>; configOverrides?: Record<string, unknown>; provider?: string; chatSessionsServiceOverride?: Partial<IChatSessionsService>; chatDebugServiceOverride?: Partial<IChatDebugService>; remoteAgentHostServiceOverride?: Partial<IRemoteAgentHostService>; customizationServiceOverride?: IAgentHostCustomizationService }) {
	const { instantiationService, agentHostService, chatAgentService, chatWidgetService, chatService, openerService, trustController, modelService, workingCopyService } = createTestServices(disposables, opts?.workingDirectoryResolver, opts?.authServiceOverride, opts?.languageModels, opts?.provisionalServiceOverride, false, opts?.languageModelToolsServiceOverride, opts?.configOverrides, opts?.chatSessionsServiceOverride, opts?.chatDebugServiceOverride, opts?.remoteAgentHostServiceOverride, opts?.customizationServiceOverride);

	const listController = createSessionListController(disposables, instantiationService, agentHostService);
	const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
		provider: opts?.provider ?? 'copilot',
		agentId: 'agent-host-copilot',
		sessionType: 'agent-host-copilot',
		fullName: 'Agent Host - Copilot',
		description: 'Copilot SDK agent running in the local agent host process',
		connection: agentHostService,
		connectionAuthority: 'local',
		isNewSession: sessionResource => listController.isNewSession(sessionResource),
	}));
	const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));

	return { contribution, listController, sessionHandler, agentHostService, chatAgentService, chatWidgetService, chatService, instantiationService, openerService, trustController, modelService, workingCopyService };
}

function makeRequest(overrides: Partial<{ message: string; sessionResource: URI; variables: IChatAgentRequest['variables']; userSelectedModelId: string; modelConfiguration: Record<string, unknown>; agentHostSessionConfig: Record<string, string>; agentId: string; requestId: string }> = {}): IChatAgentRequest {
	return upcastPartial<IChatAgentRequest>({
		sessionResource: overrides.sessionResource ?? URI.from({ scheme: 'untitled', path: '/chat-1' }),
		requestId: overrides.requestId ?? 'req-1',
		agentId: overrides.agentId ?? 'agent-host-copilot',
		message: overrides.message ?? 'Hello',
		variables: overrides.variables ?? { variables: [] },
		location: ChatAgentLocation.Chat,
		userSelectedModelId: overrides.userSelectedModelId,
		modelConfiguration: overrides.modelConfiguration,
		agentHostSessionConfig: overrides.agentHostSessionConfig,
	});
}

/** Extract the text value from a string or IMarkdownString. */
function textOf(value: string | IMarkdownString | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : value.value;
}

/**
 * Start a turn through the state-driven flow. Creates a chat session,
 * invokes the agent (non-blocking), and waits for the first action
 * to be dispatched. Returns helpers to fire server action envelopes.
 */
async function startTurn(
	sessionHandler: AgentHostSessionHandler,
	agentHostService: MockAgentHostService,
	chatAgentService: MockChatAgentService,
	ds: DisposableStore,
	overrides?: Partial<{
		message: string;
		sessionResource: URI;
		variables: IChatAgentRequest['variables'];
		userSelectedModelId: string;
		modelConfiguration: Record<string, unknown>;
		agentHostSessionConfig: Record<string, string>;
		cancellationToken: CancellationToken;
		agentId: string;
	}>,
) {
	const agentId = overrides?.agentId ?? 'agent-host-copilot';
	const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: agentId, path: '/new-turntest' });
	const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
	ds.add(toDisposable(() => chatSession.dispose()));

	// Clear any lifecycle actions (e.g. activeClientSet from customization setup)
	// so tests only see turn-related dispatches.
	agentHostService.dispatchedActions.length = 0;

	const collected: IChatProgress[][] = [];
	const seq = { v: 1 };

	const registered = chatAgentService.registeredAgents.get(agentId);
	assert.ok(registered, `${agentId} agent should be registered`);

	const turnPromise = registered.impl.invoke(
		makeRequest({
			message: overrides?.message ?? 'Hello',
			sessionResource,
			variables: overrides?.variables,
			userSelectedModelId: overrides?.userSelectedModelId,
			modelConfiguration: overrides?.modelConfiguration,
			agentHostSessionConfig: overrides?.agentHostSessionConfig,
			agentId,
		}),
		(parts) => collected.push(parts),
		[],
		overrides?.cancellationToken ?? CancellationToken.None,
	);

	await timeout(10);

	// Filter for turn-related dispatches only (skip activeClientSet etc.)
	const turnDispatches = agentHostService.dispatchedActions.filter(d => d.action.type === 'chat/turnStarted');
	const lastDispatch = turnDispatches[turnDispatches.length - 1] ?? agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
	const session = lastDispatch?.channel.toString();
	const turnId = (lastDispatch?.action as ITurnStartedAction)?.turnId;

	const fire = (action: SessionAction | ChatAction) => {
		agentHostService.fireAction({ channel: session!, action, serverSeq: seq.v++, origin: undefined });
	};

	// Echo the turnStarted action to clear the pending write-ahead entry.
	// Without this, the optimistic state replay would re-add activeTurn after
	// the server's turnComplete clears it, preventing the turn from finishing.
	if (lastDispatch) {
		agentHostService.fireAction({
			channel: lastDispatch.channel.toString(),
			action: lastDispatch.action,
			serverSeq: seq.v++,
			origin: { clientId: agentHostService.clientId, clientSeq: lastDispatch.clientSeq },
		});
	}

	return { turnPromise, collected, chatSession, session, turnId, fire };
}

async function startDynamicAgentTurn(
	chatAgentService: MockChatAgentService,
	agentHostService: MockAgentHostService,
	agentId: string,
	overrides?: Partial<{
		message: string;
		sessionResource: URI;
		variables: IChatAgentRequest['variables'];
		userSelectedModelId: string;
		agentHostSessionConfig: Record<string, string>;
		cancellationToken: CancellationToken;
	}>,
) {
	const registered = chatAgentService.registeredAgents.get(agentId);
	assert.ok(registered);
	const sessionResource = overrides?.sessionResource ?? URI.from({ scheme: agentId, path: '/new-turntest' });
	const collected: IChatProgress[][] = [];
	const seq = { v: 1 };

	agentHostService.dispatchedActions.length = 0;
	const turnPromise = registered.impl.invoke(
		makeRequest({
			message: overrides?.message ?? 'Hello',
			sessionResource,
			variables: overrides?.variables,
			userSelectedModelId: overrides?.userSelectedModelId,
			agentHostSessionConfig: overrides?.agentHostSessionConfig,
			agentId,
		}),
		parts => collected.push(parts),
		[],
		overrides?.cancellationToken ?? CancellationToken.None,
	);

	await timeout(10);

	const turnDispatches = agentHostService.dispatchedActions.filter(d => d.action.type === 'chat/turnStarted');
	const lastDispatch = turnDispatches[turnDispatches.length - 1] ?? agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
	const session = lastDispatch?.channel.toString();
	const turnId = (lastDispatch?.action as ITurnStartedAction)?.turnId;
	const fire = (action: SessionAction | ChatAction) => {
		agentHostService.fireAction({ channel: session!, action, serverSeq: seq.v++, origin: undefined });
	};

	if (lastDispatch) {
		agentHostService.fireAction({
			channel: lastDispatch.channel.toString(),
			action: lastDispatch.action,
			serverSeq: seq.v++,
			origin: { clientId: agentHostService.clientId, clientSeq: lastDispatch.clientSeq },
		});
	}

	return { turnPromise, collected, session, turnId, fire };
}

suite('AgentHostChatContribution', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Registration ---------------------------------------------------

	suite('registration', () => {

		test('registers agent', () => {
			const { chatAgentService } = createContribution(disposables);

			assert.ok(chatAgentService.registeredAgents.has('agent-host-copilot'));
		});
	});

	// ---- Download progress notification (editor window) -----------------

	suite('download progress', () => {

		function createWithProgressRecorder(isSessionsWindow: boolean) {
			// AI features must be enabled (AIDisabled === false) or the download
			// progress handler suppresses the notification; the default config
			// stub returns `true` for every key, so override just this one.
			const services = createTestServices(disposables, undefined, undefined, undefined, undefined, isSessionsWindow, undefined, { [ChatConfiguration.AIDisabled]: false });
			const openedTitles: (string | undefined)[] = [];
			services.instantiationService.stub(IProgressService, {
				withProgress: <R,>(options: IProgressNotificationOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>) => {
					openedTitles.push(options.title);
					return task({ report: () => { } });
				},
			});
			disposables.add(services.instantiationService.createInstance(AgentHostContribution));
			return { agentHostService: services.agentHostService, openedTitles };
		}

		test('editor window renders SDK download progress from root/progress notifications', () => {
			const { agentHostService, openedTitles } = createWithProgressRecorder(false);

			agentHostService.fireNotification({ type: 'root/progress', channel: 'ahp-root://root', progressToken: 'claude', progress: 0, total: 1000, message: 'Downloading Claude agent' });

			assert.deepStrictEqual(openedTitles, ['Downloading Claude agent']);
		});

		test('sessions window does not render download progress via the chat contribution', () => {
			const { agentHostService, openedTitles } = createWithProgressRecorder(true);

			agentHostService.fireNotification({ type: 'root/progress', channel: 'ahp-root://root', progressToken: 'claude', progress: 0, total: 1000, message: 'Downloading Claude agent' });

			assert.strictEqual(openedTitles.length, 0);
		});
	});

	// ---- Request attachments --------------------------------------------

	suite('request attachments', () => {

		test('sends accepted agent-host skill and command completions as ranged simple attachments', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const message = 'use /author-contributions\n/rename Title';
			const skillStart = message.indexOf('/author-contributions');
			const commandStart = message.indexOf('/rename');
			const skillMeta = {
				providerPayload: 'skill-metadata',
				displayName: 'author-contributions',
				description: 'Summarize author contributions',
			};
			const commandMeta = {
				providerPayload: 'command-metadata',
				description: 'Rename this chat',
			};

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message,
				variables: {
					variables: [
						{
							...toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/author-contributions', 'file:///skills/author-contributions/SKILL.md', skillMeta),
							range: { start: skillStart, endExclusive: skillStart + '/author-contributions'.length },
						},
						{
							...toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/rename', 'rename', commandMeta),
							range: { start: commandStart, endExclusive: commandStart + '/rename'.length },
						},
					],
				},
			});

			const turnStarted = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnStarted.message.attachments, [
				{
					type: MessageAttachmentKind.Simple,
					label: '/author-contributions',
					displayKind: 'skill',
					range: {
						start: { line: 0, character: skillStart },
						end: { line: 0, character: skillStart + '/author-contributions'.length },
					},
					_meta: skillMeta,
				},
				{
					type: MessageAttachmentKind.Simple,
					label: '/rename',
					displayKind: 'command',
					range: {
						start: { line: 1, character: 0 },
						end: { line: 1, character: '/rename'.length },
					},
					_meta: commandMeta,
				},
			]);

			fire({ type: 'chat/turnComplete', session: session!, turnId: turnId! } as ChatAction);
			await turnPromise;
		});

		test('sends paste variables as paste simple attachments', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue',
				variables: {
					variables: [{
						kind: 'paste',
						id: 'transcript',
						name: 'Previous conversation',
						value: 'Transcript text',
						code: 'Transcript text',
						language: 'markdown',
						pastedLines: 'Previous conversation',
						fileName: 'Previous conversation',
						copiedFrom: undefined,
					}],
				},
			});

			const turnStarted = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnStarted.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: 'Previous conversation',
				modelRepresentation: 'Transcript text',
			}]);

			fire({ type: 'chat/turnComplete', session: session!, turnId: turnId! } as ChatAction);
			await turnPromise;
		});

		test('preserves workspace context as a hidden workspace variable on history replay', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue',
				variables: {
					variables: [{
						kind: 'workspace',
						id: 'workspace',
						name: 'workspace',
						value: 'Workspace context',
					}],
				},
			});

			const turnStarted = agentHostService.turnActions[0].action as ITurnStartedAction;
			const attachments = turnStarted.message.attachments;
			const replayedVariables = messageAttachmentsToVariableData(attachments, 'test')?.variables;
			assert.deepStrictEqual({
				attachments,
				replayedVariables,
			}, {
				attachments: [{
					type: MessageAttachmentKind.Simple,
					label: 'workspace',
					modelRepresentation: 'Workspace context',
					displayKind: 'workspace',
				}],
				replayedVariables: [{
					kind: 'workspace',
					id: 'workspace',
					name: 'workspace',
					value: 'Workspace context',
					_meta: undefined,
				}],
			});

			fire({ type: 'chat/turnComplete', session: session!, turnId: turnId! } as ChatAction);
			await turnPromise;
		});

		test('sends agent feedback variables as annotations attachments referencing each comment', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/feedback-send' });
			const annotationsResource = URI.parse('ahp-session:/feedback-send/annotations');
			const feedbackFile = URI.file('/workspace/foo.ts');
			const feedbackFile2 = URI.file('/workspace/bar.ts');
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: '/act-on-feedback',
				sessionResource,
				variables: {
					variables: [{
						kind: 'agentFeedback',
						id: 'agentFeedback:' + sessionResource.toString(),
						name: '2 comments',
						value: 'Feedback text for the model',
						sessionResource,
						annotationsResource,
						feedbackItems: [{
							id: 'feedback-1',
							text: 'Please simplify this.',
							resourceUri: feedbackFile,
							range: { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 },
							replies: ['Agreed'],
						}, {
							id: 'feedback-2',
							text: 'Rename this.',
							resourceUri: feedbackFile2,
							range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
						}],
					}],
				},
			});

			const turnStarted = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnStarted.message.attachments, [{
				type: MessageAttachmentKind.Annotations,
				label: '2 comments',
				displayKind: AgentFeedbackAttachmentDisplayKind,
				resource: annotationsResource.toString(),
				annotationIds: ['feedback-1'],
				_meta: {
					[AgentFeedbackAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						feedbackItems: [{
							id: 'feedback-1',
							text: 'Please simplify this.',
							resourceUri: feedbackFile.toString(),
							range: {
								start: { line: 1, character: 2 },
								end: { line: 3, character: 4 },
							},
							replies: ['Agreed'],
						}],
					},
				},
			}, {
				type: MessageAttachmentKind.Annotations,
				label: '2 comments',
				displayKind: AgentFeedbackAttachmentDisplayKind,
				resource: annotationsResource.toString(),
				annotationIds: ['feedback-2'],
				_meta: {
					[AgentFeedbackAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						feedbackItems: [{
							id: 'feedback-2',
							text: 'Rename this.',
							resourceUri: feedbackFile2.toString(),
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 4 },
							},
						}],
					},
				},
			}]);

			fire({ type: 'chat/turnComplete', session: session!, turnId: turnId! } as ChatAction);
			await turnPromise;
		});

		test('sends agent feedback variables as a simple attachment when no annotations channel is known', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/feedback-send-fallback' });
			const feedbackFile = URI.file('/workspace/foo.ts');
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: '/act-on-feedback',
				sessionResource,
				variables: {
					variables: [{
						kind: 'agentFeedback',
						id: 'agentFeedback:' + sessionResource.toString(),
						name: '1 comment',
						value: 'Feedback text for the model',
						sessionResource,
						feedbackItems: [{
							id: 'feedback-1',
							text: 'Please simplify this.',
							resourceUri: feedbackFile,
							range: { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 },
							replies: ['Agreed'],
						}],
					}],
				},
			});

			const turnStarted = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnStarted.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: '1 comment',
				modelRepresentation: 'Feedback text for the model',
				displayKind: AgentFeedbackAttachmentDisplayKind,
				_meta: {
					[AgentFeedbackAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						feedbackItems: [{
							id: 'feedback-1',
							text: 'Please simplify this.',
							resourceUri: feedbackFile.toString(),
							range: {
								start: { line: 1, character: 2 },
								end: { line: 3, character: 4 },
							},
							replies: ['Agreed'],
						}],
					},
				},
			}]);

			fire({ type: 'chat/turnComplete', session: session!, turnId: turnId! } as ChatAction);
			await turnPromise;
		});

		test('restores tagged simple paste attachments as paste variable entries', () => {
			const variableData = messageAttachmentsToVariableData([{
				type: MessageAttachmentKind.Simple,
				label: 'Previous conversation',
				modelRepresentation: 'conversation transcript',
				_meta: {
					[ChatPasteAttachmentMetadata.Kind]: 'paste',
					[ChatPasteAttachmentMetadata.Language]: 'markdown',
					[ChatPasteAttachmentMetadata.FileName]: 'Previous conversation',
					[ChatPasteAttachmentMetadata.PastedLines]: 'Previous conversation',
				},
			}], 'test');

			assert.deepStrictEqual(variableData?.variables.map(variable => ({
				kind: variable.kind,
				name: variable.name,
				value: variable.value,
				code: variable.kind === 'paste' ? variable.code : undefined,
				language: variable.kind === 'paste' ? variable.language : undefined,
				pastedLines: variable.kind === 'paste' ? variable.pastedLines : undefined,
				fileName: variable.kind === 'paste' ? variable.fileName : undefined,
			})), [{
				kind: 'paste',
				name: 'Previous conversation',
				value: 'conversation transcript',
				code: 'conversation transcript',
				language: 'markdown',
				pastedLines: 'Previous conversation',
				fileName: 'Previous conversation',
			}]);
		});

		test('restores paste displayKind simple attachments as generic variable entries', () => {
			const variableData = messageAttachmentsToVariableData([{
				type: MessageAttachmentKind.Simple,
				label: 'Previous conversation',
				displayKind: 'paste',
				modelRepresentation: 'conversation transcript',
			}], 'test');

			assert.deepStrictEqual(variableData?.variables.map(variable => ({
				kind: variable.kind,
				name: variable.name,
				value: variable.value,
				code: variable.kind === 'paste' ? variable.code : undefined,
				language: variable.kind === 'paste' ? variable.language : undefined,
				pastedLines: variable.kind === 'paste' ? variable.pastedLines : undefined,
				fileName: variable.kind === 'paste' ? variable.fileName : undefined,
			})), [{
				kind: 'generic',
				name: 'Previous conversation',
				value: 'conversation transcript',
				code: undefined,
				language: undefined,
				pastedLines: undefined,
				fileName: undefined,
			}]);
		});

		test('restores session reference simple attachments as session reference variable entries', () => {
			const sessionResource = URI.from({ scheme: 'copilotcli', path: '/session-123' });
			const variableData = messageAttachmentsToVariableData([{
				type: MessageAttachmentKind.Simple,
				label: 'Review session',
				displayKind: AgentHostSessionReferenceAttachmentDisplayKind,
				modelRepresentation: toSessionReferenceModelRepresentation('Review session', sessionResource),
				_meta: {
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						sessionID: sessionResource.toString(),
					},
				},
			}, {
				type: MessageAttachmentKind.Resource,
				label: 'Review session trajectory',
				displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
				uri: URI.file('/home/test-user/.copilot/session-state/session-123/events.jsonl').toString(),
				_meta: {
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						sessionID: sessionResource.toString(),
					},
				},
			}], 'test');

			assert.deepStrictEqual(variableData?.variables.map(variable => ({
				kind: variable.kind,
				id: variable.id,
				name: variable.name,
				value: URI.isUri(variable.value) ? variable.value.toString() : variable.value,
			})), [{
				kind: 'sessionReference',
				id: sessionResource.toString(),
				name: 'Review session',
				value: sessionResource.toString(),
			}]);
		});

		test('session reference simple attachments without metadata restore as generic variable entries', () => {
			const variableData = messageAttachmentsToVariableData([{
				type: MessageAttachmentKind.Simple,
				label: 'Review session',
				displayKind: AgentHostSessionReferenceAttachmentDisplayKind,
				modelRepresentation: 'session text',
			}], 'test');

			assert.deepStrictEqual(variableData?.variables.map(variable => ({
				kind: variable.kind,
				name: variable.name,
				value: variable.value,
			})), [{
				kind: 'generic',
				name: 'Review session',
				value: 'session text',
			}]);
		});
	});

	suite('draft', () => {
		test('hydrates chat input state from AHP draft', async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ id: 'opus-4.7', name: 'Opus 4.7' })],
			]);
			const { sessionHandler, agentHostService } = createContribution(disposables, { languageModels });
			const backendSession = AgentSession.uri('copilot', 'draft-session');
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/draft-session' });

			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Draft',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				draft: {
					text: 'draft\ntext',
					origin: { kind: MessageKind.User },
					model: { id: 'opus-4.7' },
					agent: { uri: 'agent://reviewer' },
				},
			});

			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);

			assert.deepStrictEqual({
				inputText: chatSession.transferredState?.inputState?.inputText,
				model: chatSession.transferredState?.inputState?.selectedModel?.identifier,
				mode: chatSession.transferredState?.inputState?.mode,
				selections: chatSession.transferredState?.inputState?.selections,
			}, {
				inputText: 'draft\ntext',
				model: 'agent-host-copilot:opus-4.7',
				mode: { id: 'agent://reviewer', kind: ChatModeKind.Agent },
				selections: [{
					selectionStartLineNumber: 2,
					selectionStartColumn: 5,
					positionLineNumber: 2,
					positionColumn: 5,
				}],
			});
		});

		test('hydrates chat input attachments from AHP draft', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const backendSession = AgentSession.uri('copilot', 'draft-attachments');
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/draft-attachments' });

			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Draft Attachments',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				draft: {
					text: 'draft text',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: URI.file('/tmp/example.ts').toString(),
						label: 'example.ts',
						displayKind: 'document',
					}, {
						type: MessageAttachmentKind.Simple,
						label: 'Pasted context',
						modelRepresentation: 'const x = 1;',
						_meta: {
							[ChatPasteAttachmentMetadata.Kind]: 'paste',
							[ChatPasteAttachmentMetadata.Language]: 'typescript',
							[ChatPasteAttachmentMetadata.FileName]: 'example.ts',
							[ChatPasteAttachmentMetadata.PastedLines]: '1 line',
						},
					}, {
						type: MessageAttachmentKind.EmbeddedResource,
						label: 'Screenshot',
						contentType: 'image/png',
						data: encodeBase64(VSBuffer.fromString('png')),
					}],
				},
			});

			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.deepStrictEqual(chatSession.transferredState?.inputState?.attachments.map(variable => ({
				kind: variable.kind,
				name: variable.name,
				value: URI.isUri(variable.value)
					? variable.value.toString()
					: variable.value instanceof Uint8Array
						? new TextDecoder().decode(variable.value)
						: variable.value,
				code: variable.kind === 'paste' ? variable.code : undefined,
				language: variable.kind === 'paste' ? variable.language : undefined,
			})), [{
				kind: 'file',
				name: 'example.ts',
				value: 'file:///tmp/example.ts',
				code: undefined,
				language: undefined,
			}, {
				kind: 'paste',
				name: 'Pasted context',
				value: 'const x = 1;',
				code: 'const x = 1;',
				language: 'typescript',
			}, {
				kind: 'image',
				name: 'Screenshot',
				value: 'png',
				code: undefined,
				language: undefined,
			}]);
		});

		test('creates an empty draft from the last request selection when none exists', async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ id: 'opus-4.7', name: 'Opus 4.7' })],
			]);
			const { sessionHandler, agentHostService } = createContribution(disposables, { languageModels });
			const backendSession = AgentSession.uri('copilot', 'last-selection-session');
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/last-selection-session' });

			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Last Selection',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
				turns: [{
					id: 'turn-1',
					message: {
						text: 'previous request',
						origin: { kind: MessageKind.User },
						model: { id: 'opus-4.7' },
						agent: { uri: 'agent://reviewer' },
					},
					responseParts: [],
					usage: undefined,
					state: TurnState.Complete,
				}],
			});

			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.deepStrictEqual({
				inputText: chatSession.transferredState?.inputState?.inputText,
				model: chatSession.transferredState?.inputState?.selectedModel?.identifier,
				mode: chatSession.transferredState?.inputState?.mode,
				draftAction: agentHostService.dispatchedActions.find(d => d.action.type === ActionType.ChatDraftChanged)?.action,
			}, {
				inputText: '',
				model: 'agent-host-copilot:opus-4.7',
				mode: { id: 'agent://reviewer', kind: ChatModeKind.Agent },
				draftAction: {
					type: ActionType.ChatDraftChanged,
					draft: {
						text: '',
						origin: { kind: MessageKind.User },
						model: { id: 'opus-4.7' },
						agent: { uri: 'agent://reviewer' },
					},
				},
			});
		});

		test('debounces chat input state into AHP draft', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const modelMetadata = upcastPartial<ILanguageModelChatMetadata>({ id: 'opus-4.7', name: 'Opus 4.7' });
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', modelMetadata],
			]);
			const { sessionHandler, agentHostService, chatService } = createContribution(disposables, { languageModels });
			const backendSession = AgentSession.uri('copilot', 'draft-sync');
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/draft-sync' });

			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Draft Sync',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [],
				chats: [],
			});

			const inputState = observableValue<IChatModelInputState | undefined>('test.inputState', {
				attachments: [],
				mode: { id: 'agent://reviewer', kind: ChatModeKind.Agent },
				selectedModel: { identifier: 'agent-host-copilot:opus-4.7', metadata: modelMetadata },
				inputText: 'draft body',
				selections: [],
				contrib: {},
			});
			const inputModel = upcastPartial<IInputModel>({
				state: inputState,
				setState(state: Partial<IChatModelInputState>): void {
					inputState.set({
						attachments: [],
						mode: { id: 'agent', kind: ChatModeKind.Agent },
						selectedModel: undefined,
						inputText: '',
						selections: [],
						contrib: {},
						...inputState.get(),
						...state,
					}, undefined);
				},
				clearState(): void {
					inputState.set(undefined, undefined);
				},
				toJSON: () => undefined,
			});
			const chatModel = upcastPartial<IChatModel>({
				sessionResource,
				inputModel,
				onDidChangePendingRequests: Event.None,
				getPendingRequests: () => [],
			});

			chatService.setSession(sessionResource, chatModel);
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));
			agentHostService.dispatchedActions.length = 0;

			await timeout(499);
			assert.strictEqual(agentHostService.dispatchedActions.length, 0);

			await timeout(1);
			assert.deepStrictEqual(agentHostService.dispatchedActions.map(d => ({ channel: d.channel, action: d.action })), [{
				channel: buildDefaultChatUri(backendSession.toString()),
				action: {
					type: ActionType.ChatDraftChanged,
					draft: {
						text: 'draft body',
						origin: { kind: MessageKind.User },
						model: { id: 'opus-4.7' },
						agent: { uri: 'agent://reviewer' },
					},
				},
			}]);

		}));
	});

	// ---- Session disposal -----------------------------------------------

	suite('disposal', () => {

		test('fires onWillDispose before session is disposed', async () => {
			const { sessionHandler } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/dispose-test' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// `onWillDispose` is consumed by `ContributedChatSessionData` in
			// `ChatSessionsService` to evict disposed sessions from its cache.
			// If this event does not fire (e.g. because the emitter was
			// disposed before `.fire()` ran during teardown), the service
			// would hand out the disposed `IChatSession` to subsequent
			// `getOrCreateChatSession` callers.
			let fired = 0;
			disposables.add(chatSession.onWillDispose(() => { fired++; }));

			chatSession.dispose();

			assert.strictEqual(fired, 1, 'onWillDispose should fire exactly once when the session is disposed');
		});

		test('disposing one chat does not tear down a sibling peer chat subscription (peer chat never loads after reload)', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/multi' });
			const backendSession = AgentSession.uri('copilot', 'multi');
			const peerResource = URI.from({ scheme: 'agent-host-copilot', path: '/multi', fragment: 'peer-1' });
			const peerChatUri = URI.parse(buildChatUri(backendSession.toString(), 'peer-1'));
			const summary: SessionSummary = {
				resource: backendSession.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			const defaultChatUri = buildDefaultChatUri(backendSession.toString());
			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				defaultChat: defaultChatUri,
				chats: [
					createDefaultChatSummary(summary, defaultChatUri),
					createDefaultChatSummary(summary, peerChatUri.toString()),
				],
			});

			// Open the session's default chat and an additional peer chat.
			const defaultSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			const peerSession = await sessionHandler.provideChatSessionContent(peerResource, CancellationToken.None);
			disposables.add(toDisposable(() => peerSession.dispose()));

			assert.ok(agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, peerChatUri), 'peer chat subscription should be live after it is opened');

			// Closing the default chat must NOT dispose the still-open peer
			// chat's subscription. The regression left the peer chat's
			// `provideChatSessionContent` awaiting a dead subscription, so it
			// never resolved and the chat stayed stuck on a loading spinner.
			defaultSession.dispose();

			assert.ok(agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, peerChatUri), 'peer chat subscription must stay live after the sibling default chat is disposed');
			assert.ok(agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession), 'shared session subscription must stay live while the peer chat is still open');
		});
	});

	// ---- Session list (IChatSessionItemController) ----------------------

	suite('session list', () => {

		test('refresh populates items from agent host', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'bbb'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 2);
			assert.strictEqual(listController.items[0].label, 'My session');
			assert.strictEqual(listController.items[1].label, 'Session bbb');
			assert.strictEqual(listController.items[0].resource.scheme, 'agent-host-copilot');
			assert.strictEqual(listController.items[0].resource.path, '/aaa');
		});

		test('refresh fires onDidChangeChatSessionItems', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			let fired = false;
			disposables.add(listController.onDidChangeChatSessionItems(() => { fired = true; }));

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'x'), startTime: 1000, modifiedTime: 2000 });
			await listController.refresh(CancellationToken.None);

			assert.ok(fired);
		});

		test('refresh handles error gracefully', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.listSessions = async () => { throw new Error('fail'); };

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 0);
		});

		test('refresh marks archived sessions as archived items', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({
				session: AgentSession.uri('copilot', 'archived'),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'Archived session',
				isArchived: true,
			});

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 1);
			assert.strictEqual(listController.items[0].archived, true);
		});

		test('refresh skips listSessions RPC after first successful call', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => { listCalls++; return originalListSessions(); };

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 1);

			// Subsequent refresh should not re-fetch — the cache is kept in
			// sync via notify/sessionAdded etc.
			await listController.refresh(CancellationToken.None);
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 1);
		});

		test('refresh shares an in-flight listSessions RPC', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			const releaseListSessions = disposables.add(new Emitter<void>());
			const released = Event.toPromise(releaseListSessions.event);
			agentHostService.listSessions = async () => {
				listCalls++;
				await released;
				return originalListSessions();
			};

			const firstRefresh = listController.refresh(CancellationToken.None);
			const secondRefresh = listController.refresh(CancellationToken.None);
			await timeout(0);
			assert.strictEqual(listCalls, 1);

			releaseListSessions.fire();
			await Promise.all([firstRefresh, secondRefresh]);

			assert.deepStrictEqual({
				listCalls,
				labels: listController.items.map(item => item.label),
			}, {
				listCalls: 1,
				labels: ['My session'],
			});
		});

		test('controllers sharing a connection coalesce their listSessions RPCs', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'Copilot session' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			const releaseListSessions = disposables.add(new Emitter<void>());
			const released = Event.toPromise(releaseListSessions.event);
			agentHostService.listSessions = async () => {
				listCalls++;
				await released;
				return originalListSessions();
			};

			// One shared store, two controllers for different providers — the
			// agent host should only be asked to enumerate sessions once.
			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const copilotController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));
			const otherController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-other', 'other', sessionListStore, undefined, 'local'));

			const refreshCopilot = copilotController.refresh(CancellationToken.None);
			const refreshOther = otherController.refresh(CancellationToken.None);
			await timeout(0);
			assert.strictEqual(listCalls, 1);

			releaseListSessions.fire();
			await Promise.all([refreshCopilot, refreshOther]);

			assert.deepStrictEqual({
				listCalls,
				copilot: copilotController.items.map(item => item.label),
				other: otherController.items.map(item => item.label),
			}, {
				listCalls: 1,
				copilot: ['Copilot session'],
				other: [],
			});
		});

		test('shared session list store keeps same raw id separate by provider', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'same'), startTime: 1000, modifiedTime: 2000, summary: 'Copilot session' });
			agentHostService.addSession({ session: AgentSession.uri('other', 'same'), startTime: 3000, modifiedTime: 4000, summary: 'Other session' });

			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const copilotController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));
			const otherController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-other', 'other', sessionListStore, undefined, 'local'));

			await Promise.all([
				copilotController.refresh(CancellationToken.None),
				otherController.refresh(CancellationToken.None),
			]);

			const notification: INotification = {
				type: 'root/sessionRemoved',
				channel: 'ahp-root://',
				session: AgentSession.uri('other', 'same').toString(),
			};
			agentHostService.fireNotification(notification);

			assert.deepStrictEqual({
				copilot: copilotController.items.map(item => item.label),
				other: otherController.items.map(item => item.label),
			}, {
				copilot: ['Copilot session'],
				other: [],
			});
		});

		test('sessionRemoved during initial refresh does not let stale listSessions response resurrect the session', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const staleSession = { session: AgentSession.uri('copilot', 'removed-before-cache'), startTime: 1000, modifiedTime: 2000, summary: 'Stale session' };
			let listCalls = 0;
			const releaseListSessions = disposables.add(new Emitter<void>());
			const released = Event.toPromise(releaseListSessions.event);
			agentHostService.listSessions = async () => {
				listCalls++;
				if (listCalls === 1) {
					await released;
					return [staleSession];
				}
				return [];
			};

			const listController = createSessionListController(disposables, instantiationService, agentHostService);
			const refresh = listController.refresh(CancellationToken.None);
			await timeout(0);
			assert.strictEqual(listCalls, 1);

			const notification: INotification = {
				type: 'root/sessionRemoved',
				channel: 'ahp-root://',
				session: AgentSession.uri('copilot', 'removed-before-cache').toString(),
			};
			agentHostService.fireNotification(notification);
			releaseListSessions.fire();
			await refresh;

			assert.deepStrictEqual({
				listCalls,
				items: listController.items.map(item => item.label),
			}, {
				listCalls: 2,
				items: [],
			});
		});

		test('shared session list notifications project only to matching provider controllers', () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const copilotController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));
			const otherController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-other', 'other', sessionListStore, undefined, 'local'));
			const copilotEvents: string[][] = [];
			const otherEvents: string[][] = [];
			disposables.add(copilotController.onDidChangeChatSessionItems(delta => copilotEvents.push((delta.addedOrUpdated ?? []).map(item => item.label))));
			disposables.add(otherController.onDidChangeChatSessionItems(delta => otherEvents.push((delta.addedOrUpdated ?? []).map(item => item.label))));

			agentHostService.fireNotification({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary: {
					resource: AgentSession.uri('other', 'notify').toString(),
					provider: 'other',
					title: 'Other notification',
					status: SessionStatus.Idle,
					createdAt: new Date(1000).toISOString(),
					modifiedAt: new Date(2000).toISOString(),
				},
			} as INotification);

			agentHostService.fireNotification({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary: {
					resource: AgentSession.uri('copilot', 'notify').toString(),
					provider: 'copilot',
					title: 'Copilot notification',
					status: SessionStatus.Idle,
					createdAt: new Date(3000).toISOString(),
					modifiedAt: new Date(4000).toISOString(),
				},
			} as INotification);

			assert.deepStrictEqual({
				copilotItems: copilotController.items.map(item => item.label),
				otherItems: otherController.items.map(item => item.label),
				copilotEvents,
				otherEvents,
			}, {
				copilotItems: ['Copilot notification'],
				otherItems: ['Other notification'],
				copilotEvents: [['Copilot notification']],
				otherEvents: [['Other notification']],
			});
		});

		test('summaryChanged notification emits only the changed item and reflects the update', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'a'), startTime: 1000, modifiedTime: 2000, summary: 'A' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'b'), startTime: 1000, modifiedTime: 2000, summary: 'B' });

			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));

			await listController.refresh(CancellationToken.None);

			const events: string[][] = [];
			disposables.add(listController.onDidChangeChatSessionItems(delta => events.push((delta.addedOrUpdated ?? []).map(item => AgentSession.id(item.resource)))));

			agentHostService.fireNotification({
				type: 'root/sessionSummaryChanged',
				channel: 'ahp-root://',
				session: AgentSession.uri('copilot', 'b').toString(),
				changes: { title: 'B updated' },
			} as INotification);

			assert.deepStrictEqual({
				// The change event for a single summary change carries only the
				// changed item, not the whole provider list.
				events,
				labels: [...listController.items.map(item => item.label)].sort(),
			}, {
				events: [['b']],
				labels: ['A', 'B updated'],
			});
		});

		test('sessionRemoved notification removes only the matching item', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'a'), startTime: 1000, modifiedTime: 2000, summary: 'A' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'b'), startTime: 1000, modifiedTime: 2000, summary: 'B' });

			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));

			await listController.refresh(CancellationToken.None);

			const removedEvents: string[] = [];
			disposables.add(listController.onDidChangeChatSessionItems(delta => {
				for (const resource of delta.removed ?? []) {
					removedEvents.push(AgentSession.id(resource));
				}
			}));

			agentHostService.fireNotification({
				type: 'root/sessionRemoved',
				channel: 'ahp-root://',
				session: AgentSession.uri('copilot', 'a').toString(),
			} as INotification);

			assert.deepStrictEqual({
				labels: listController.items.map(item => item.label),
				removedEvents,
			}, {
				labels: ['B'],
				removedEvents: ['a'],
			});
		});

		test('refresh keeps both sessions after the backend list reorders (order not significant)', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'a'), startTime: 1000, modifiedTime: 2000, summary: 'A' });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'b'), startTime: 1000, modifiedTime: 2000, summary: 'B' });

			const sessionListStore = createSessionListStore(disposables, instantiationService, agentHostService);
			const listController = disposables.add(instantiationService.createInstance(AgentHostSessionListController, 'agent-host-copilot', 'copilot', sessionListStore, undefined, 'local'));

			await listController.refresh(CancellationToken.None);
			assert.deepStrictEqual([...listController.items.map(item => item.label)].sort(), ['A', 'B']);

			// Backend now returns the same sessions in reverse order. Item order is
			// not significant (consumers re-sort), so the refresh must keep both
			// sessions present without losing or duplicating either.
			const original = await agentHostService.listSessions();
			agentHostService.listSessions = async () => [original[1], original[0]];

			sessionListStore.resetCache();
			await listController.refresh(CancellationToken.None);

			assert.deepStrictEqual([...listController.items.map(item => item.label)].sort(), ['A', 'B']);
		});

		test('refresh retries listSessions if the first call failed', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => {
				listCalls++;
				if (listCalls === 1) {
					throw new Error('fail');
				}
				return originalListSessions();
			};

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'My session' });

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);
			assert.strictEqual(listController.items.length, 0);

			// Failure must not mark the cache valid; the next refresh retries.
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 2);
			assert.strictEqual(listController.items.length, 1);
		});

		test('agent host restart invalidates cache so next refresh re-fetches', async () => {
			const { instantiationService, agentHostService, chatSessionItemControllers } = createTestServices(disposables);
			disposables.add(instantiationService.createInstance(AgentHostSessionListContribution));

			agentHostService.setRootState({
				agents: [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', models: [] }],
				activeSessions: 0,
			});
			assert.strictEqual(chatSessionItemControllers.length, 1);
			const listController = chatSessionItemControllers[0].controller;

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'aaa'), startTime: 1000, modifiedTime: 2000, summary: 'Before restart' });

			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => { listCalls++; return originalListSessions(); };

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);

			// Subsequent refresh uses cache — no new RPC.
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 1);

			agentHostService.fireAgentHostStart();

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listCalls, 2);
		});

		test('agent host restart during refresh does not let stale listSessions response mark cache valid', async () => {
			const { instantiationService, agentHostService, chatSessionItemControllers } = createTestServices(disposables);
			disposables.add(instantiationService.createInstance(AgentHostSessionListContribution));

			agentHostService.setRootState({
				agents: [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', models: [] }],
				activeSessions: 0,
			});
			assert.strictEqual(chatSessionItemControllers.length, 1);
			const listController = chatSessionItemControllers[0].controller;

			let listCalls = 0;
			const releaseListSessions = disposables.add(new Emitter<void>());
			const released = Event.toPromise(releaseListSessions.event);
			agentHostService.listSessions = async () => {
				listCalls++;
				if (listCalls === 1) {
					await released;
					return [{ session: AgentSession.uri('copilot', 'stale-before-restart'), startTime: 1000, modifiedTime: 2000, summary: 'Stale session' }];
				}
				return [{ session: AgentSession.uri('copilot', 'fresh-after-restart'), startTime: 3000, modifiedTime: 4000, summary: 'Fresh session' }];
			};

			const refresh = listController.refresh(CancellationToken.None);
			await timeout(0);
			assert.strictEqual(listCalls, 1);

			agentHostService.fireAgentHostStart();
			releaseListSessions.fire();
			await refresh;

			assert.deepStrictEqual({
				listCalls,
				items: listController.items.map(item => item.label),
			}, {
				listCalls: 2,
				items: ['Fresh session'],
			});
		});

		test('refresh filters out sessions whose workingDirectory is not in any workspace folder', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const workspaceFolder = URI.file('/workspace/root');
			instantiationService.stub(IWorkspaceContextService, {
				getWorkspace: () => ({ id: '', folders: [{ uri: workspaceFolder, name: 'root', index: 0, toResource: () => workspaceFolder }] }),
				getWorkspaceFolder: () => null,
				onDidChangeWorkspaceFolders: Event.None,
			});

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'in-ws'), startTime: 1000, modifiedTime: 2000, summary: 'In workspace', workingDirectory: URI.file('/workspace/root/sub') });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'out-ws'), startTime: 1000, modifiedTime: 2000, summary: 'Outside workspace', workingDirectory: URI.file('/other/place') });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'no-wd'), startTime: 1000, modifiedTime: 2000, summary: 'No working directory' });

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			await listController.refresh(CancellationToken.None);

			assert.deepStrictEqual(listController.items.map(item => item.label), ['In workspace']);
		});

		test('refresh does not filter when no workspace folders are open', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'a'), startTime: 1000, modifiedTime: 2000, summary: 'A', workingDirectory: URI.file('/any/path') });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'b'), startTime: 1000, modifiedTime: 2000, summary: 'B' });

			await listController.refresh(CancellationToken.None);

			assert.strictEqual(listController.items.length, 2);
		});

		test('workspace folder change re-fetches and updates the filtered session list', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const workspaceFolder = URI.file('/workspace/root');
			let folders: { uri: URI; name: string; index: number; toResource: () => URI }[] = [];
			const onDidChangeWorkspaceFolders = disposables.add(new Emitter<{ readonly added: never[]; readonly removed: never[]; readonly changed: never[] }>());
			instantiationService.stub(IWorkspaceContextService, {
				getWorkspace: () => ({ id: '', folders: [...folders] }),
				getWorkspaceFolder: () => null,
				onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			});

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'in-ws'), startTime: 1000, modifiedTime: 2000, summary: 'In workspace', workingDirectory: URI.file('/workspace/root/sub') });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'out-ws'), startTime: 1000, modifiedTime: 2000, summary: 'Outside workspace', workingDirectory: URI.file('/other/place') });

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			// Initially: no folders → no filter → both sessions visible.
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listController.items.length, 2);

			// Open a workspace folder → only the in-workspace session should remain.
			folders = [{ uri: workspaceFolder, name: 'root', index: 0, toResource: () => workspaceFolder }];
			let listCalls = 0;
			const originalListSessions = agentHostService.listSessions.bind(agentHostService);
			agentHostService.listSessions = async () => { listCalls++; return originalListSessions(); };
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
			await timeout(0);

			assert.deepStrictEqual({
				listCalls,
				labels: listController.items.map(item => item.label),
			}, {
				listCalls: 1,
				labels: ['In workspace'],
			});
		});

		test('sessionAdded notification filters out sessions outside the workspace', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const workspaceFolder = URI.file('/workspace/root');
			instantiationService.stub(IWorkspaceContextService, {
				getWorkspace: () => ({ id: '', folders: [{ uri: workspaceFolder, name: 'root', index: 0, toResource: () => workspaceFolder }] }),
				getWorkspaceFolder: () => null,
				onDidChangeWorkspaceFolders: Event.None,
			});

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listController.items.length, 0);

			// Simulate a remote session being added in another workspace.
			agentHostService.fireNotification({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary: {
					resource: AgentSession.uri('copilot', 'foreign').toString(),
					provider: 'copilot',
					title: 'Foreign workspace session',
					status: SessionStatus.Idle,
					createdAt: new Date(1000).toISOString(),
					modifiedAt: new Date(2000).toISOString(),
					workingDirectory: URI.file('/other/workspace').toString(),
				},
			} as INotification);

			assert.strictEqual(listController.items.length, 0);

			// And one in our workspace should be included.
			agentHostService.fireNotification({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary: {
					resource: AgentSession.uri('copilot', 'local').toString(),
					provider: 'copilot',
					title: 'Local session',
					status: SessionStatus.Idle,
					createdAt: new Date(1000).toISOString(),
					modifiedAt: new Date(2000).toISOString(),
					workingDirectory: URI.file('/workspace/root/sub').toString(),
				},
			} as INotification);

			assert.deepStrictEqual(listController.items.map(item => item.label), ['Local session']);
		});

		test('deleteChatSessionItem disposes the corresponding backend session and removes it from the cached items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { listController, agentHostService } = createContribution(disposables);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'session-to-delete'), startTime: 1000, modifiedTime: 2000, summary: 'Doomed' });
			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listController.items.length, 1);

			const itemResource = listController.items[0].resource;
			const removalEvents: URI[] = [];
			disposables.add(listController.onDidChangeChatSessionItems(delta => {
				if (delta.removed) {
					removalEvents.push(...delta.removed);
				}
			}));
			await listController.deleteChatSessionItem(itemResource, CancellationToken.None);

			assert.deepStrictEqual(agentHostService.disposedSessions.map(s => s.toString()), [AgentSession.uri('copilot', 'session-to-delete').toString()]);
			assert.strictEqual(listController.items.length, 0);
			assert.deepStrictEqual(removalEvents.map(r => r.toString()), [itemResource.toString()]);
		}));

		test('newChatSessionItem creates final-looking resource used for requested backend session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { listController, sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const item = await listController.newChatSessionItem({ prompt: 'Hello from controller' }, CancellationToken.None);
			assert.ok(item);
			assert.strictEqual(item.resource.scheme, 'agent-host-copilot');
			assert.ok(!item.resource.path.substring(1).startsWith('untitled-'));
			assert.strictEqual(listController.isNewSession(item.resource), true);
			assert.strictEqual(listController.items.some(existing => existing.resource.toString() === item.resource.toString()), false);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hello from controller',
				sessionResource: item.resource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].session?.toString(), AgentSession.uri('copilot', item.resource.path.substring(1)).toString());

			await listController.refresh(CancellationToken.None);
			assert.strictEqual(listController.isNewSession(item.resource), false);
			assert.strictEqual(listController.items.some(existing => existing.resource.toString() === item.resource.toString()), true);
		}));

		test('newChatSessionItem rebinds untitled provisional to real resource so chip-selected config survives first send', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const workspaceFolder = URI.from({ scheme: 'file', path: '/workspace/root' });
			instantiationService.stub(IWorkspaceContextService, {
				getWorkspace: () => ({ id: '', folders: [{ uri: workspaceFolder, name: 'root', index: 0, toResource: () => workspaceFolder }] }),
				getWorkspaceFolder: () => null,
				onDidChangeWorkspaceFolders: Event.None,
			});

			const rebindCalls: { oldResource: URI; newResource: URI; provider: string; workingDirectory: URI | undefined }[] = [];
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
				onDidChange: Event.None,
				get: () => undefined,
				waitForPending: async () => undefined,
				getOrCreate: async () => undefined,
				tryRebind: async (oldResource: URI, newResource: URI, provider: string, workingDirectory: URI | undefined) => {
					rebindCalls.push({ oldResource, newResource, provider, workingDirectory });
					return newResource;
				},
				disposeSession: async () => { },
			} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService);

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			const untitledResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc' });
			const item = await listController.newChatSessionItem({ prompt: 'Hello', untitledResource }, CancellationToken.None);

			assert.ok(item);
			assert.deepStrictEqual(rebindCalls, [{
				oldResource: untitledResource,
				newResource: item.resource,
				provider: 'copilot',
				workingDirectory: workspaceFolder,
			}]);
		}));

		test('newChatSessionItem skips rebind when no untitled provisional resource is provided', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			let rebindCalls = 0;
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
				onDidChange: Event.None,
				get: () => undefined,
				waitForPending: async () => undefined,
				getOrCreate: async () => undefined,
				tryRebind: async () => { rebindCalls++; return undefined; },
				disposeSession: async () => { },
			} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService);

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			const item = await listController.newChatSessionItem({ prompt: 'Hello' }, CancellationToken.None);
			assert.ok(item);
			assert.strictEqual(rebindCalls, 0);
		}));

		test('newChatSessionItem routes the store-selected folder as the working directory in multi-root windows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, newSessionFolderService } = createTestServices(disposables);

			const folderA = URI.from({ scheme: 'file', path: '/workspace/a' });
			const folderB = URI.from({ scheme: 'file', path: '/workspace/b' });
			instantiationService.stub(IWorkspaceContextService, {
				getWorkspace: () => ({
					id: '', folders: [
						{ uri: folderA, name: 'a', index: 0, toResource: () => folderA },
						{ uri: folderB, name: 'b', index: 1, toResource: () => folderB },
					]
				}),
				getWorkspaceFolder: () => null,
				onDidChangeWorkspaceFolders: Event.None,
			});

			const rebindCalls: { workingDirectory: URI | undefined }[] = [];
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
				onDidChange: Event.None,
				get: () => undefined,
				waitForPending: async () => undefined,
				getOrCreate: async () => undefined,
				tryRebind: async (_old: URI, newResource: URI, _provider: string, workingDirectory: URI | undefined) => {
					rebindCalls.push({ workingDirectory });
					return newResource;
				},
				disposeSession: async () => { },
			} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService);

			const listController = createSessionListController(disposables, instantiationService, agentHostService);

			const untitledResource = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-route' });
			// User picked folder B via the chip before sending the first message.
			newSessionFolderService.setFolder(untitledResource, folderB);

			const item = await listController.newChatSessionItem({ prompt: 'Hello', untitledResource }, CancellationToken.None);
			assert.ok(item);
			assert.deepStrictEqual(rebindCalls, [{ workingDirectory: folderB }]);
		}));

		test('folder picker is visible only in multi-root agent-host editor windows', () => {
			const item = MenuRegistry.getMenuItems(MenuId.ChatInputSecondary)
				.find((i): i is IMenuItem => isIMenuItem(i) && i.command.id === OpenAgentHostFolderPickerAction.ID);
			assert.ok(item, 'folder picker menu item is registered');
			const when = item.when;
			assert.ok(when, 'folder picker menu item has a when clause');

			const evalWhen = (values: Record<string, ContextKeyValue>) => when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
			const agentHost = {
				[ChatContextKeys.lockedCodingAgentId.key]: 'agent-host-copilot',
				[ChatContextKeys.chatIsAgentHostSession.key]: true,
			};

			assert.deepStrictEqual({
				multiRootEditor: evalWhen({ ...agentHost, workspaceFolderCount: 2, isSessionsWindow: false }),
				singleFolder: evalWhen({ ...agentHost, workspaceFolderCount: 1, isSessionsWindow: false }),
				sessionsWindow: evalWhen({ ...agentHost, workspaceFolderCount: 2, isSessionsWindow: true }),
				nonAgentHost: evalWhen({ [ChatContextKeys.lockedCodingAgentId.key]: 'copilot', [ChatContextKeys.chatIsAgentHostSession.key]: false, workspaceFolderCount: 2, isSessionsWindow: false }),
			}, {
				multiRootEditor: true,
				singleFolder: false,
				sessionsWindow: false,
				nonAgentHost: false,
			});
		});
	});

	// ---- Session ID resolution in _invokeAgent --------------------------

	suite('session ID resolution', () => {

		test('requests backend session for provider-owned new resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { message: 'Hello' });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual(agentHostService.turnActions[0].action.type, 'chat/turnStarted');
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).message.text, 'Hello');
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			assert.strictEqual(AgentSession.id(URI.parse(parentSession)), 'new-turntest');
		}));

		test('reuses SDK session for same resource on second message', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/new-reuse' });
			const chatSession = await sessionHandler.provideChatSessionContent(resource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First turn
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'First', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			// Echo the turnStarted to clear pending write-ahead
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: { type: 'chat/turnComplete', turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Second turn
			const turn2Promise = registered.impl.invoke(
				makeRequest({ message: 'Second', sessionResource: resource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch2 = agentHostService.turnActions[1];
			const action2 = dispatch2.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: dispatch2.channel.toString(), action: dispatch2.action, serverSeq: 3, origin: { clientId: agentHostService.clientId, clientSeq: dispatch2.clientSeq } });
			agentHostService.fireAction({ channel: dispatch2.channel.toString(), action: { type: 'chat/turnComplete', turnId: action2.turnId } as ChatAction, serverSeq: 4, origin: undefined });
			await turn2Promise;

			assert.strictEqual(agentHostService.turnActions.length, 2);
			assert.strictEqual(
				agentHostService.turnActions[0].channel.toString(),
				agentHostService.turnActions[1].channel.toString(),
			);
		}));

		test('uses sessionId from agent-host scheme resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-42' }),
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			assert.strictEqual(AgentSession.id(URI.parse(parentSession)), 'existing-session-42');
		}));

		test('recovers from stale failed subscription before first send', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/existing-subscribe-retry' });
			const backendSession = AgentSession.uri('copilot', 'existing-subscribe-retry');
			const { agentHostService, chatAgentService } = createContribution(disposables, {
				provisionalServiceOverride: {
					get: resource => resource.toString() === sessionResource.toString() ? backendSession : undefined,
				},
			});
			agentHostService.failNextSubscriptionFor.add(backendSession.toString());

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Recovered', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);

			const dispatch = agentHostService.turnActions[0];
			const action = dispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: action.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.deepStrictEqual(agentHostService.turnActions.map(d => (d.action as ITurnStartedAction).message.text), ['Recovered']);
		}));

		test('recovers when session subscription errors AFTER being observed pending (repro #5242 hang)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Regression for the agent-host-copilotcli session-subscribe race
			// (issue #5242): the client observes the session subscription while
			// it is still pending (value === undefined), then the subscribe
			// resolves to `-32603 Session not found on backend`, which flips the
			// subscription into an error state via `setError` — firing
			// `onDidError` but NOT `onDidChange`. A hydration await that listens
			// only to `onDidChange` never wakes and the turn hangs for the full
			// harness timeout. The handler must instead settle on the error and
			// recover (create-and-subscribe), not park forever.
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/pending-then-error-race' });
			const backendSession = AgentSession.uri('copilot', 'pending-then-error-race');
			const { agentHostService, chatAgentService } = createContribution(disposables, {
				provisionalServiceOverride: {
					get: resource => resource.toString() === sessionResource.toString() ? backendSession : undefined,
				},
			});
			// The session's subscription is observed *pending* — no snapshot yet.
			agentHostService.makePendingErrorSub(backendSession.toString());

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Hello', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			// Let the handler reach the hydration await on the pending subscription.
			await timeout(10);

			// The subscribe now fails: flip to error (fires onDidError only, like real setError).
			agentHostService.firePendingSubError(backendSession.toString(), new Error(`Session not found on backend: ${backendSession.toString()}`));
			await timeout(10);

			// The handler must have progressed past the hydration await and started
			// the turn. On the buggy (onDidChange-only) await this dispatch never
			// happens — the turn hangs — and this assertion fails.
			const dispatch = agentHostService.turnActions[0];
			assert.ok(dispatch, 'turn must start after the subscription errors; handler hung waiting on onDidChange (issue #5242)');
			const action = dispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: action.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.deepStrictEqual(agentHostService.turnActions.map(d => (d.action as ITurnStartedAction).message.text), ['Hello']);
		}));

		test('rejects generic contributed-chat untitled resource', async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			await assert.rejects(
				() => sessionHandler.provideChatSessionContent(URI.from({ scheme: 'agent-host-copilot', path: '/untitled-abc123' }), CancellationToken.None),
				/created by the sessions provider/
			);
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
			assert.strictEqual(chatAgentService.registeredAgents.has('agent-host-copilot'), true);
		});
		test('passes raw model id extracted from language model identifier', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'claude-sonnet-4-20250514' });
		}));

		test('passes selected model configuration through create session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'agent-host-copilot:claude-sonnet-4-20250514',
				modelConfiguration: { thinkingLevel: 'high', contextSize: 272000 },
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'claude-sonnet-4-20250514', config: { thinkingLevel: 'high', contextSize: 272000 } });
		}));

		test('passes model id as-is when no vendor prefix', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'gpt-4o',
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].model, { id: 'gpt-4o' });
		}));

		test('drops foreign vendor model id (issue #319583)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// When a user picks a model in another mode (e.g. the in-extension
			// `copilotcli` participant), then switches to the agent-host mode,
			// the stale `${vendor}/${id}` identifier can leak in as
			// `userSelectedModelId`. The handler must drop it and fall back
			// to the agent's default model, not forward an unknown id to
			// `session.create`.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hi',
				userSelectedModelId: 'copilotcli/claude-sonnet-4.6',
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].model, undefined);
		}));

		test('does not create backend session eagerly for untitled sessions', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-deferred' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			// No backend session should have been created yet
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
		});
	});

	// ---- Workspace trust gating -----------------------------------------

	suite('workspace trust', () => {

		test('aborts the turn without creating a session when trust is declined', async () => {
			const { sessionHandler, agentHostService, chatAgentService, trustController } = createContribution(disposables);
			trustController.result = false;

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/trust-declined' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const result = await registered.impl.invoke(
				makeRequest({ message: 'Hello', sessionResource }),
				() => { }, [], CancellationToken.None,
			);

			assert.deepStrictEqual(result, {});
			assert.strictEqual(agentHostService.createSessionCalls.length, 0);
			assert.strictEqual(trustController.workspaceTrustCalls + trustController.resourcesTrustCalls, 1);
		});

		test('prompts for workspace trust before creating a session on first send', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, trustController } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { message: 'Hi' });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(trustController.workspaceTrustCalls + trustController.resourcesTrustCalls, 1);
		}));
	});

	// ---- Progress event → chat progress conversion ----------------------

	suite('progress routing', () => {

		test('delta events become markdownContent progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/responsePart', session, turnId, part: { kind: 'markdown', id: 'md-1', content: 'hello ' } } as ChatAction);
			fire({ type: 'chat/delta', session, turnId, partId: 'md-1', content: 'world' } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			// Events may be coalesced by the throttler, so check total content
			const markdownParts = collected.flat().filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'hello world');
		}));

		test('system notification response parts become live system notifications', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: 'chat/responsePart',
				session,
				turnId,
				part: { kind: ResponsePartKind.SystemNotification, content: 'Background command completed' },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const notifications = collected.flat().filter(part => part.kind === 'systemNotification');
			assert.deepStrictEqual(notifications.map(part => part.content.value), ['Background command completed']);
		}));

		test('live turn marks chat session complete after turnComplete', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, chatSession, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(chatSession.isCompleteObs?.get(), true, 'should be complete after turn finishes');
		}));

		test('live turn returns model credit details from usage', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ name: 'Opus 4.7', pricing: '15x' })],
			]);
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { languageModels });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/usage', session, turnId, usage: { model: 'opus-4.7', _meta: { cost: 1.5 } } } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			const result = await turnPromise;

			assert.strictEqual(result.details, 'Opus 4.7 • 1.5 credits');
		}));

		test('cancelled turn still returns model credit details from accumulated usage', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ name: 'Opus 4.7', pricing: '15x' })],
			]);
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { languageModels });

			const cts = disposables.add(new CancellationTokenSource());
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { cancellationToken: cts.token });

			// Usage (credits) accumulated before the user interrupts the turn.
			fire({ type: 'chat/usage', session, turnId, usage: { model: 'opus-4.7', _meta: { cost: 1.5 } } } as ChatAction);

			// User cancels mid-flight before the turn reaches a terminal state.
			cts.cancel();

			const result = await turnPromise;

			assert.strictEqual(result.details, 'Opus 4.7 • 1.5 credits');
		}));

		test('live turn renders zero-cost usage as 0 credits instead of multiplier', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ name: 'Opus 4.7', pricing: '15x' })],
			]);
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { languageModels });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/usage', session, turnId, usage: { model: 'opus-4.7', _meta: { cost: 0 } } } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			const result = await turnPromise;

			assert.strictEqual(result.details, 'Opus 4.7 • 0 credits');
		}));

		test('slug-normalised billed id resolves without suffix (e.g. claude-sonnet-4-6 → claude-sonnet-4.6)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// The Claude SDK reports dashed slugs (4-6) but models register with dotted versions (4.6).
			// The lookup normalises the last -digit segment so it resolves directly — no "(billed-id)" suffix.
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:claude-sonnet-4.6', upcastPartial<ILanguageModelChatMetadata>({ name: 'Claude Sonnet 4.6', pricing: '1x' })],
			]);
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { languageModels });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/usage', session, turnId, usage: { model: 'claude-sonnet-4-6', _meta: { cost: 1 } } } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			const result = await turnPromise;

			assert.strictEqual(result.details, 'Claude Sonnet 4.6 • 1 credit');
		}));

		test('unregistered billed id shows model-id suffix (e.g. Auto billed as raptor-mini)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Free accounts only have "Auto" registered; usage.model reports the concrete model.
			// The billed id "raptor-mini" is unregistered so the suffix appears.
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:auto', upcastPartial<ILanguageModelChatMetadata>({ name: 'Auto' })],
			]);
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { languageModels });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables,
				{ userSelectedModelId: 'agent-host-copilot:auto' });

			fire({ type: 'chat/usage', session, turnId, usage: { model: 'raptor-mini', _meta: { cost: 1 } } } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			const result = await turnPromise;

			assert.strictEqual(result.details, 'Auto (raptor-mini) • 1 credit');
		}));

		test('live turn emits token usage as chat usage progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/usage', session, turnId, usage: { inputTokens: 1200, outputTokens: 300, model: 'gpt-5' } } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const usageParts = collected.flat().filter((p): p is IChatUsage => p.kind === 'usage');
			assert.deepStrictEqual(
				usageParts.map(part => ({ kind: part.kind, promptTokens: part.promptTokens, completionTokens: part.completionTokens })),
				[{ kind: 'usage', promptTokens: 1200, completionTokens: 300 }],
			);
		}));

		test('subagent credits surface on the subagent tool without re-aggregating into parent usage', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Parent turn reports its own usage. For hosts that fold subagent usage
			// into the parent turn aggregate, this value already includes the subagent;
			// the client emits it as-is and never re-adds subagent credits itself.
			fire({ type: 'chat/usage', session, turnId, usage: { inputTokens: 500, outputTokens: 100, model: 'gpt-5', _meta: { cost: 2.0 } } } as ChatAction);

			// Spawn a subagent tool call.
			const parentToolCallId = 'tc-sub-cost';
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			const childSessionUri = buildSubagentChatUri(parentSession, parentToolCallId);
			fire({
				type: 'chat/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'research' },
			} as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as ChatAction);
			fire({
				type: 'chat/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{ type: ToolResultContentType.Subagent, resource: childSessionUri, title: 'Subagent' }],
			} as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: parentToolCallId,
				result: { success: true, pastTenseMessage: 'Spawned subagent' },
			} as ChatAction);

			await timeout(50);

			// Child session reports usage with credits.
			const childTurnId = 'child-turn-1';
			const fireChild = (action: SessionAction | ChatAction) => {
				agentHostService.fireAction({ channel: childSessionUri, action, serverSeq: 1000, origin: undefined });
			};
			fireChild({
				type: 'chat/turnStarted',
				turnId: childTurnId,
				message: { text: '', origin: { kind: MessageKind.User } },
			} as ChatAction);
			fireChild({
				type: 'chat/usage', session: childSessionUri, turnId: childTurnId,
				usage: { inputTokens: 800, outputTokens: 200, model: 'gpt-5', _meta: { cost: 5.0 } },
			} as ChatAction);

			await timeout(50);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			// The parent session cost is emitted as-is — the client does not re-add the
			// subagent's credits (the host folds them into the parent turn aggregate when
			// applicable, so re-aggregating here would double-count).
			const usageParts = collected.flat().filter((p): p is IChatUsage => p.kind === 'usage');
			const lastUsage = usageParts.at(-1);
			assert.ok(lastUsage, 'should have emitted usage');
			assert.strictEqual(lastUsage!.copilotCredits, 2.0, 'parent session cost is not re-aggregated on the client');

			// The subagent's own credits are recorded on its tool call so they can be
			// shown on the subagent tool's hover.
			const subagentInvocation = collected.flat()
				.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation')
				.find(p => p.toolSpecificData?.kind === 'subagent');
			assert.ok(subagentInvocation, 'should have a subagent tool invocation');
			assert.strictEqual(
				(subagentInvocation!.toolSpecificData as IChatSubagentToolInvocationData).credits,
				5.0,
				'subagent credits should be recorded on the subagent tool',
			);
		}));

		test('tool_start events become toolInvocation progress', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-1', toolName: 'read_file', displayName: 'Read File' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-1', invocationMessage: 'Reading file', confirmed: 'not-needed' } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('tool_complete event transitions toolInvocation to completed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-2', toolName: 'bash', displayName: 'Bash' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-2', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-2',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(invocation.toolCallId, 'tc-2');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('tool_complete with failure sets error state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-3', toolName: 'bash', displayName: 'Bash' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-3', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-3',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'text', text: 'command not found' }], error: { message: 'command not found' } },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('malformed toolArguments does not throw', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-bad', toolName: 'bash', displayName: 'Bash' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-bad', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual(collected[0][0].kind, 'toolInvocation');
		}));

		test('outstanding tool invocations are completed on idle', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// tool_start without tool_complete
			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-orphan', toolName: 'bash', displayName: 'Bash' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-orphan', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			const invocation = collected[0][0] as IChatToolInvocation;
			assert.strictEqual(invocation.kind, 'toolInvocation');
			assert.strictEqual(IChatToolInvocation.isComplete(invocation), true);
		}));

		test('events from other sessions are ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Delta from a different session — will be ignored (session not subscribed)
			agentHostService.fireAction({
				channel: AgentSession.uri('copilot', 'other-session').toString(),
				action: { type: 'chat/delta', turnId, partId: 'md-other', content: 'wrong' } as ChatAction,
				serverSeq: 100,
				origin: undefined,
			});
			fire({ type: 'chat/responsePart', turnId, part: { kind: 'markdown', id: 'md-1', content: 'right' } } as ChatAction);
			fire({ type: 'chat/turnComplete', turnId } as ChatAction);

			await turnPromise;

			assert.strictEqual(collected.length, 1);
			assert.strictEqual((collected[0][0] as IChatMarkdownContent).content.value, 'right');
		}));

		test('plan-review input request renders a plan review instead of a question carousel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const request: ChatInputRequestWithPlanReview = {
				id: 'plan-1',
				planReview: {
					title: 'Review Plan',
					content: '## Plan summary',
					canProvideFeedback: true,
					answerQuestionId: 'action',
					planUri: URI.file('/sessions/abc/plan.md').toString(),
					actions: [
						{ id: 'interactive', label: 'Implement Plan', default: true },
						{ id: 'autopilot', label: 'Implement with Autopilot', permissionLevel: 'autopilot' },
					],
				},
				questions: [{
					kind: ChatInputQuestionKind.SingleSelect,
					id: 'action',
					message: 'How would you like to proceed?',
					options: [{ id: 'interactive', label: 'Implement Plan' }],
				}],
			};
			fire({ type: ActionType.ChatInputRequested, request } as ChatAction);
			await timeout(10);

			const parts = collected.flat();
			const review = parts.find(part => part.kind === 'planReview') as ChatPlanReviewData | undefined;
			assert.ok(review instanceof ChatPlanReviewData, 'input request should render plan review data');
			assert.strictEqual(parts.some(part => part.kind === 'questionCarousel'), false, 'plan review requests should not also render a question carousel');
			assert.strictEqual(review.title, 'Review Plan');
			assert.strictEqual(review.content, '## Plan summary');
			assert.ok(review.planUri);
			assert.strictEqual(URI.revive(review.planUri).toString(), URI.file('/sessions/abc/plan.md').toString());
			assert.deepStrictEqual(review.actions, [
				{ id: 'interactive', label: 'Implement Plan', default: true },
				{ id: 'autopilot', label: 'Implement with Autopilot', permissionLevel: 'autopilot' },
			]);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('plan-review approval dispatches accepted selected answer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const request: ChatInputRequestWithPlanReview = {
				id: 'plan-1',
				planReview: {
					title: 'Review Plan',
					content: 'Plan',
					canProvideFeedback: true,
					answerQuestionId: 'action',
					actions: [{ id: 'interactive', label: 'Implement Plan', default: true }],
				},
				questions: [{ kind: ChatInputQuestionKind.SingleSelect, id: 'action', message: 'How?', options: [{ id: 'interactive', label: 'Implement Plan' }] }],
			};
			fire({ type: ActionType.ChatInputRequested, request } as ChatAction);
			await timeout(10);

			const review = collected.flat().find(part => part.kind === 'planReview') as ChatPlanReviewData;
			assert.ok(review);
			agentHostService.dispatchedActions.length = 0;
			review.completion.complete({ rejected: false, action: 'Implement Plan', actionId: 'interactive' });
			await timeout(10);

			const completion = agentHostService.dispatchedActions.find(d => d.action.type === ActionType.ChatInputCompleted)?.action;
			assert.deepStrictEqual(completion, {
				type: ActionType.ChatInputCompleted,
				requestId: 'plan-1',
				response: ChatInputResponseKind.Accept,
				answers: {
					action: {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
					},
				},
			});

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('plan-review feedback dispatches accepted text answer for revision', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const request: ChatInputRequestWithPlanReview = {
				id: 'plan-1',
				planReview: {
					title: 'Review Plan',
					content: 'Plan',
					canProvideFeedback: true,
					answerQuestionId: 'action',
					actions: [{ id: 'interactive', label: 'Implement Plan', default: true }],
				},
				questions: [{ kind: ChatInputQuestionKind.SingleSelect, id: 'action', message: 'How?', options: [{ id: 'interactive', label: 'Implement Plan' }] }],
			};
			fire({ type: ActionType.ChatInputRequested, request } as ChatAction);
			await timeout(10);

			const review = collected.flat().find(part => part.kind === 'planReview') as ChatPlanReviewData;
			assert.ok(review);
			agentHostService.dispatchedActions.length = 0;
			review.completion.complete({ rejected: false, feedback: 'Please add tests', feedbackOverall: 'Please add tests' });
			await timeout(10);

			const completion = agentHostService.dispatchedActions.find(d => d.action.type === ActionType.ChatInputCompleted)?.action;
			assert.deepStrictEqual(completion, {
				type: ActionType.ChatInputCompleted,
				requestId: 'plan-1',
				response: ChatInputResponseKind.Accept,
				answers: {
					action: {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Text, value: 'Please add tests' },
					},
				},
			});

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('plan-review completion from another client clears local plan review without redispatching', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-plan-review-test' });
			chatWidgetService.setWidgetForSession(sessionResource);
			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			const request: ChatInputRequestWithPlanReview = {
				id: 'plan-1',
				planReview: {
					title: 'Review Plan',
					content: 'Plan',
					canProvideFeedback: true,
					answerQuestionId: 'action',
					actions: [{ id: 'autopilot', label: 'Implement with Autopilot', permissionLevel: 'autopilot' }],
				},
				questions: [{ kind: ChatInputQuestionKind.SingleSelect, id: 'action', message: 'How?', options: [{ id: 'autopilot', label: 'Implement with Autopilot' }] }],
			};
			fire({ type: ActionType.ChatInputRequested, request } as ChatAction);
			await timeout(10);

			const review = collected.flat().find(part => part.kind === 'planReview') as ChatPlanReviewData;
			assert.ok(review);
			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'plan-1',
				response: ChatInputResponseKind.Accept,
				answers: {
					action: {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
					},
				},
			} as ChatAction);
			await timeout(10);

			assert.strictEqual(review.isUsed, true);
			assert.deepStrictEqual(review.data, { rejected: false, action: 'Implement with Autopilot', actionId: 'autopilot' });
			assert.deepStrictEqual(await review.completion.p, { rejected: false, action: 'Implement with Autopilot', actionId: 'autopilot' });
			assert.deepStrictEqual(chatWidgetService.clearPlanReviewCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'plan-1' },
			]);
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.ChatInputCompleted), false);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('plan-review cancellation clears docked widget even when review was already dismissed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/dismissed-plan-review-test' });
			chatWidgetService.setWidgetForSession(sessionResource);
			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			const request: ChatInputRequestWithPlanReview = {
				id: 'plan-1',
				planReview: {
					title: 'Review Plan',
					content: 'Plan',
					canProvideFeedback: true,
					answerQuestionId: 'action',
					actions: [{ id: 'interactive', label: 'Implement Plan', default: true }],
				},
				questions: [{ kind: ChatInputQuestionKind.SingleSelect, id: 'action', message: 'How?', options: [{ id: 'interactive', label: 'Implement Plan' }] }],
			};
			fire({ type: ActionType.ChatInputRequested, request } as ChatAction);
			await timeout(10);

			const review = collected.flat().find(part => part.kind === 'planReview') as ChatPlanReviewData;
			assert.ok(review);
			review.dismiss();
			assert.strictEqual(review.isUsed, true);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;

			assert.deepStrictEqual(chatWidgetService.clearPlanReviewCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'plan-1' },
			]);
		}));

		test('input request completion from another client clears local question carousel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: ChatInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}, {
						kind: ChatInputQuestionKind.SingleSelect,
						id: 'question-2',
						message: 'Which color?',
						options: [{ id: 'blue', label: 'Blue' }],
					}],
				},
			} as ChatAction);
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');
			assert.strictEqual(carousel.resolveId, 'input-1');

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'input-1',
				response: ChatInputResponseKind.Accept,
				answers: {
					'question-1': {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Text, value: 'from another client' },
					},
					'question-2': {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Selected, value: 'blue', freeformValues: ['cerulean'] },
					},
				},
			} as ChatAction);
			await timeout(10);

			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'input-1' },
			]);
			assert.strictEqual(carousel.isUsed, true);
			assert.deepStrictEqual(carousel.data, {
				'question-1': 'from another client',
				'question-2': { selectedValue: 'blue', freeformValue: 'cerulean' },
			});
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');
			assert.deepStrictEqual((await carousel.completion.p).answers, {
				'question-1': 'from another client',
				'question-2': { selectedValue: 'blue', freeformValue: 'cerulean' },
			});
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.ChatInputCompleted), false);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('input request completion echo applies authoritative answers after local submit', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-local-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: ChatInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}],
				},
			} as ChatAction);
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');

			const submittedAnswers = { 'question-1': 'local answer' };
			carousel.data = submittedAnswers;
			carousel.isUsed = true;
			carousel.completion.complete({ answers: submittedAnswers });
			await timeout(10);

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'input-1',
				response: ChatInputResponseKind.Accept,
				answers: {
					'question-1': {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Text, value: 'accepted answer' },
					},
				},
			} as ChatAction);
			await timeout(10);

			assert.deepStrictEqual(carousel.data, { 'question-1': 'accepted answer' });
			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls, []);
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.ChatInputCompleted), false);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('input request cancellation does not show draft answers as submitted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-cancelled-input-request-test' });
			chatWidgetService.setWidgetForSession(sessionResource);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'input-1',
					message: 'Need more information',
					questions: [{
						kind: ChatInputQuestionKind.Text,
						id: 'question-1',
						message: 'What should I use?',
						required: true,
					}],
					answers: {
						'question-1': {
							state: ChatInputAnswerState.Draft,
							value: { kind: ChatInputAnswerValueKind.Text, value: 'draft answer' },
						},
					},
				},
			} as ChatAction);
			await timeout(10);

			const carousel = collected.flat().find(part => part.kind === 'questionCarousel');
			assert.ok(carousel, 'input request should render a question carousel');

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'input-1',
				response: ChatInputResponseKind.Cancel,
			} as ChatAction);
			await timeout(10);

			assert.strictEqual(carousel.isUsed, true);
			assert.deepStrictEqual(carousel.data, {});
			assert.ok(carousel instanceof ChatQuestionCarouselData, 'AgentHost input request should use runtime carousel data');
			assert.strictEqual((await carousel.completion.p).answers, undefined);
			assert.deepStrictEqual(chatWidgetService.clearQuestionCarouselCalls.map(call => ({ responseId: call.responseId, resolveId: call.resolveId })), [
				{ responseId: undefined, resolveId: 'input-1' },
			]);
			assert.strictEqual(agentHostService.dispatchedActions.some(dispatched => dispatched.action.type === ActionType.ChatInputCompleted), false);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url-style input request renders an elicitation part with the URL', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'url-1',
					message: 'Please authorize',
					url: 'https://example.com/auth?token=abc',
				},
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart | undefined;
			assert.ok(part, 'url input request should render an elicitation part');
			assert.ok(part instanceof ChatElicitationRequestPart);
			assert.strictEqual(textOf(part.title), 'Authorization Required');
			const messageText = textOf(part.message) ?? '';
			// `appendText` converts spaces to `&nbsp;`, so check for individual words.
			assert.ok(messageText.includes('authorize'), 'message should include the request message');
			assert.ok(messageText.includes('https://example.com/auth?token=abc'), 'message should include the URL');
			assert.ok(part.acceptButtonLabel.includes('example.com'), 'accept button should reference the URL authority');
			assert.strictEqual(collected.flat().some(p => p.kind === 'questionCarousel'), false, 'url-style requests must not also render a question carousel');

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url input request accept opens URL and dispatches Accept', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, openerService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'url-1',
					url: 'https://example.com/auth',
				},
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part);

			agentHostService.dispatchedActions.length = 0;
			await part.accept(true);
			await timeout(10);

			assert.deepStrictEqual(openerService.openedUrls.map(String), ['https://example.com/auth']);
			assert.strictEqual(part.state.get(), ElicitationState.Accepted);
			const completions = agentHostService.dispatchedActions.filter(d => d.action.type === ActionType.ChatInputCompleted);
			assert.strictEqual(completions.length, 1);
			assert.deepStrictEqual({
				requestId: (completions[0].action as { requestId: string }).requestId,
				response: (completions[0].action as { response: ChatInputResponseKind }).response,
			}, { requestId: 'url-1', response: ChatInputResponseKind.Accept });

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url input request decline dispatches Decline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'url-1',
					url: 'https://example.com/auth',
				},
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part?.reject);

			agentHostService.dispatchedActions.length = 0;
			await part.reject!();
			await timeout(10);

			const completions = agentHostService.dispatchedActions.filter(d => d.action.type === ActionType.ChatInputCompleted);
			assert.strictEqual(completions.length, 1);
			assert.strictEqual((completions[0].action as { response: ChatInputResponseKind }).response, ChatInputResponseKind.Decline);
			assert.strictEqual(part.state.get(), ElicitationState.Rejected);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url input request accept failure dispatches Decline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, openerService } = createContribution(disposables);
			openerService.openShouldFail = true;

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: { id: 'url-1', url: 'https://example.com/auth' },
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part);

			agentHostService.dispatchedActions.length = 0;
			await part.accept(true);
			await timeout(10);

			const completions = agentHostService.dispatchedActions.filter(d => d.action.type === ActionType.ChatInputCompleted);
			assert.strictEqual(completions.length, 1);
			assert.strictEqual((completions[0].action as { response: ChatInputResponseKind }).response, ChatInputResponseKind.Decline);
			assert.strictEqual(part.state.get(), ElicitationState.Rejected);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url input request opener returning false dispatches Decline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, openerService } = createContribution(disposables);
			openerService.openResult = false;

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: { id: 'url-1', url: 'https://example.com/auth' },
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part);

			agentHostService.dispatchedActions.length = 0;
			await part.accept(true);
			await timeout(10);

			const completions = agentHostService.dispatchedActions.filter(d => d.action.type === ActionType.ChatInputCompleted);
			assert.strictEqual(completions.length, 1);
			assert.strictEqual((completions[0].action as { response: ChatInputResponseKind }).response, ChatInputResponseKind.Decline);
			assert.strictEqual(part.state.get(), ElicitationState.Rejected);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;
		}));

		test('url input request abandoned at turn end dispatches Cancel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: { id: 'url-1', url: 'https://example.com/auth' },
			} as ChatAction);
			await timeout(10);

			agentHostService.dispatchedActions.length = 0;
			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;

			const completions = agentHostService.dispatchedActions.filter(d => d.action.type === ActionType.ChatInputCompleted);
			assert.strictEqual(completions.length, 1);
			assert.deepStrictEqual({
				requestId: (completions[0].action as { requestId: string }).requestId,
				response: (completions[0].action as { response: ChatInputResponseKind }).response,
			}, { requestId: 'url-1', response: ChatInputResponseKind.Cancel });
		}));

		test('url input request completion from another client does not redispatch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: { id: 'url-1', url: 'https://example.com/auth' },
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part);

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'url-1',
				response: ChatInputResponseKind.Accept,
			} as ChatAction);
			await timeout(10);

			assert.strictEqual(part.state.get(), ElicitationState.Accepted);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.dispatchedActions.some(d => d.action.type === ActionType.ChatInputCompleted), false);
		}));

		test('url input request server-side dismissal rejects the part and does not redispatch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({
				type: ActionType.ChatInputRequested,
				request: { id: 'url-1', url: 'https://example.com/auth' },
			} as ChatAction);
			await timeout(10);

			const part = collected.flat().find(p => (p as { kind?: string }).kind === 'elicitation2') as ChatElicitationRequestPart;
			assert.ok(part);

			agentHostService.dispatchedActions.length = 0;
			fire({
				type: ActionType.ChatInputCompleted,
				requestId: 'url-1',
				response: ChatInputResponseKind.Cancel,
			} as ChatAction);
			await timeout(10);

			assert.strictEqual(part.state.get(), ElicitationState.Rejected);

			fire({ type: ActionType.ChatTurnComplete, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.dispatchedActions.some(d => d.action.type === ActionType.ChatInputCompleted), false);
		}));
	});

	// ---- Cancellation -----------------------------------------------------

	suite('cancellation', () => {

		test('cancellation resolves the agent invoke', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'chat/turnCancelled'));
		}));

		test('cancellation force-completes outstanding tool invocations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-cancel', toolName: 'bash', displayName: 'Bash' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-cancel', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);

			cts.cancel();
			await turnPromise;

			// The tool invocation may or may not have been emitted before cancellation
			// (the throttler can coalesce events). If it was emitted, it should be complete.
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			for (const inv of toolInvocations) {
				assert.strictEqual(IChatToolInvocation.isComplete(inv as IChatToolInvocation), true);
			}
		}));

		test('cancellation calls abortSession on the agent host service', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			// Cancellation now dispatches session/turnCancelled action
			assert.ok(agentHostService.dispatchedActions.some(a => a.action.type === 'chat/turnCancelled'));
		}));

		test('cancellation marks chat session complete', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, chatSession } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			cts.cancel();
			await turnPromise;

			assert.strictEqual(chatSession.isCompleteObs?.get(), true, 'chat session should be marked complete after cancellation');
		}));

		test('cancellation after natural completion does not dispatch turnCancelled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				cancellationToken: cts.token,
			});

			// Turn completes naturally on its own.
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			// Now the request's cancellation token fires (e.g. ChatService
			// cancelling a long-disposed token, or a stale 'stop' click). We
			// must NOT dispatch turnCancelled for an already-finished turn.
			const beforeCancelCount = agentHostService.dispatchedActions.filter(a => a.action.type === 'chat/turnCancelled').length;
			cts.cancel();
			const afterCancelCount = agentHostService.dispatchedActions.filter(a => a.action.type === 'chat/turnCancelled').length;
			assert.strictEqual(afterCancelCount, beforeCancelCount, 'turnCancelled should not be dispatched after natural completion');
		}));
	});

	// ---- Error events -------------------------------------------------------

	suite('error events', () => {

		test('error event renders error message and finishes the request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			agentHostService.fireAction({
				channel: session,
				action: {
					type: 'chat/error',
					turnId,
					error: { errorType: 'test_error', message: 'Something went wrong' },
				} as ChatAction,
				serverSeq: 99,
				origin: undefined,
			});

			const result = await turnPromise;

			// The error is surfaced as the agent result's errorDetails (so the
			// chat renders a proper error / quota upgrade affordance) rather
			// than an inline markdown progress part.
			assert.strictEqual(result.errorDetails?.message, 'Error: (test_error) Something went wrong');
			assert.ok(!collected.flat().some(p => p.kind === 'markdownContent' && (p as IChatMarkdownContent).content.value.includes('Something went wrong')), 'Error should not be duplicated as a markdown progress part');
		}));
	});

	// ---- Permission requests -----------------------------------------------

	suite('permission requests', () => {

		test('permission_request event shows confirmation and responds when confirmed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Simulate a tool call requiring confirmation via toolCallStart + toolCallReady
			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-perm-1', toolName: 'shell', displayName: 'Shell' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-perm-1',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as ChatAction);

			await timeout(10);

			// The tool call should have produced a ChatToolInvocation in WaitingForConfirmation state
			// After toolCallStart (Streaming) and toolCallReady without confirmed (PendingConfirmation),
			// the handler emits two progress events — we want the last one (with confirmation).
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			assert.ok(toolInvocations.length >= 1, 'Should have received tool confirmation progress');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			assert.strictEqual(permInvocation.kind, 'toolInvocation');

			// Confirm the tool
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });

			await timeout(10);

			// The handler should have dispatched session/toolCallConfirmed
			assert.ok(agentHostService.dispatchedActions.some(
				a => {
					if (a.action.type !== 'chat/toolCallConfirmed') {
						return false;
					}
					const action = a.action as IToolCallConfirmedAction;
					return action.toolCallId === 'tc-perm-1' && action.approved === true;
				}
			));

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('permission_request denied when user skips', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-perm-2', toolName: 'write', displayName: 'Write File' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-perm-2',
				invocationMessage: 'Write to /tmp/test.txt',
			} as ChatAction);

			await timeout(10);

			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			// Deny the permission
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.Denied });

			await timeout(10);

			assert.ok(agentHostService.dispatchedActions.some(
				a => {
					if (a.action.type !== 'chat/toolCallConfirmed') {
						return false;
					}
					const action = a.action as IToolCallConfirmedAction;
					return action.toolCallId === 'tc-perm-2' && action.approved === false;
				}
			));

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('shell permission shows input-style confirmation data with toolInput', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-perm-shell', toolName: 'shell', displayName: 'Shell' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-perm-shell',
				invocationMessage: 'echo hello', toolInput: 'echo hello',
			} as ChatAction);

			await timeout(10);
			const toolInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			const permInvocation = toolInvocations[toolInvocations.length - 1] as IChatToolInvocation;
			assert.strictEqual(permInvocation.toolSpecificData?.kind, 'input');
			const inputData = permInvocation.toolSpecificData as IChatToolInputInvocationData;
			assert.deepStrictEqual(inputData.rawInput, { input: 'echo hello' });

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('read permission shows input-style confirmation data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-perm-read', toolName: 'read_file', displayName: 'Read File' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-perm-read',
				invocationMessage: 'Read file contents', toolInput: '/workspace/file.ts',
			} as ChatAction);

			await timeout(10);
			const permInvocation = collected[0][0] as IChatToolInvocation;

			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('local confirmation does not race with pending tc.status: no spurious re-confirm before server echo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Regression for a bug where the per-tool-call autorun read both
			// `part$` AND `invocation.state` and used a state-comparison check
			// to detect Running → PendingConfirmation re-confirmation. After
			// the user locally confirmed, `invocation.state` flipped to
			// `Executing` while `tc.status` was still `PendingConfirmation`
			// (server hadn't echoed yet), and the autorun spuriously emitted
			// a third confirmation invocation and dispatched a duplicate
			// `session/toolCallConfirmed`. The fix detects re-confirmation
			// from a `tc.status` *transition*, not from invocation-state
			// comparison.
			//
			// Baseline (bug-free) flow for a tool needing initial confirmation:
			//   toolCallStart      → emit placeholder invocation (count=1)
			//   toolCallReady      → status: Streaming → PendingConfirmation,
			//                        settle placeholder, emit confirm invocation (count=2)
			//   user confirms      → invocation.state: WaitingForConfirmation → Executing
			//                        (count must NOT change — this is the regression)
			//   server echoes      → tc.status: PendingConfirmation → Running (count=2)
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-race', toolName: 'shell', displayName: 'Shell' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-race',
				invocationMessage: 'echo hi', toolInput: 'echo hi',
			} as ChatAction);
			await timeout(10);

			const beforeConfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			const permInvocation = beforeConfirm[beforeConfirm.length - 1];
			assert.strictEqual(permInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);

			// User confirms locally. This synchronously flips the invocation
			// state from WaitingForConfirmation → Executing. The buggy
			// autorun would re-fire here (because invocation.state was a
			// dependency) and, finding tc.status still PendingConfirmation,
			// spuriously emit yet another confirmation invocation.
			IChatToolInvocation.confirmWith(permInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			const afterLocalConfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			assert.strictEqual(afterLocalConfirm.length, beforeConfirm.length, 'no spurious invocation should be emitted by local confirm before server echoes');

			// Exactly one toolCallConfirmed dispatch (with approved: true).
			const confirmedDispatches = agentHostService.dispatchedActions.filter(a => {
				if (a.action.type !== 'chat/toolCallConfirmed') {
					return false;
				}
				const action = a.action as IToolCallConfirmedAction;
				return action.toolCallId === 'tc-race';
			});
			assert.strictEqual(confirmedDispatches.length, 1, 'exactly one session/toolCallConfirmed should be dispatched');
			assert.strictEqual((confirmedDispatches[0].action as IToolCallConfirmedAction).approved, true);

			// Echo the confirmation so the reducer transitions tc → Running,
			// then complete the turn cleanly.
			agentHostService.fireAction({
				channel: confirmedDispatches[0].channel.toString(),
				action: confirmedDispatches[0].action,
				serverSeq: 100,
				origin: { clientId: agentHostService.clientId, clientSeq: confirmedDispatches[0].clientSeq },
			});
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-race',
				result: { success: true, pastTenseMessage: 'Ran echo hi', content: [{ type: 'text', text: 'hi\n' }] },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			// Final invariant: still the same number of invocations as right
			// after toolCallReady — no extra invocations from the server echo
			// or completion either.
			const finalInvocations = collected.flat().filter(p => p.kind === 'toolInvocation');
			assert.strictEqual(finalInvocations.length, beforeConfirm.length, 'no extra invocations across the full turn');
		}));

		test('genuine re-confirmation (Running → PendingConfirmation) emits a fresh confirmation invocation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Companion to the regression test above: the *legitimate* case
			// where the server bounces a tool call back to PendingConfirmation
			// (e.g. result confirmation after an edit). Here we DO want a
			// fresh invocation and a second `session/toolCallConfirmed`
			// dispatch.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-recon', toolName: 'shell', displayName: 'Shell' } as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-recon',
				invocationMessage: 'echo hi', toolInput: 'echo hi',
			} as ChatAction);
			await timeout(10);

			const firstInvocation = (collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[]).pop()!;
			assert.strictEqual(firstInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);

			IChatToolInvocation.confirmWith(firstInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			// Echo the confirmation so tc transitions PendingConfirmation → Running.
			const firstConfirm = agentHostService.dispatchedActions.find(a => {
				if (a.action.type !== 'chat/toolCallConfirmed') {
					return false;
				}
				return (a.action as IToolCallConfirmedAction).toolCallId === 'tc-recon';
			})!;
			agentHostService.fireAction({
				channel: firstConfirm.channel.toString(),
				action: firstConfirm.action,
				serverSeq: 100,
				origin: { clientId: agentHostService.clientId, clientSeq: firstConfirm.clientSeq },
			});
			await timeout(10);

			const invocationCountAfterRunning = collected.flat().filter(p => p.kind === 'toolInvocation').length;

			// Server bounces the call back to PendingConfirmation via a
			// second `toolCallReady` without `confirmed`. The reducer
			// transitions Running → PendingConfirmation.
			fire({
				type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-recon',
				invocationMessage: 'Confirm execution', toolInput: 'echo hi',
			} as ChatAction);
			await timeout(10);

			// We now expect a *fresh* invocation in WaitingForConfirmation.
			const invocationsAfterReconfirm = collected.flat().filter(p => p.kind === 'toolInvocation') as IChatToolInvocation[];
			assert.strictEqual(invocationsAfterReconfirm.length, invocationCountAfterRunning + 1, 'a fresh invocation should be emitted on Running → PendingConfirmation transition');
			const reconfirmInvocation = invocationsAfterReconfirm[invocationsAfterReconfirm.length - 1];
			assert.strictEqual(reconfirmInvocation.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
			assert.notStrictEqual(reconfirmInvocation, firstInvocation);

			// User confirms the re-confirmation; expect a second toolCallConfirmed dispatch.
			IChatToolInvocation.confirmWith(reconfirmInvocation, { type: ToolConfirmKind.UserAction });
			await timeout(10);

			const allConfirms = agentHostService.dispatchedActions.filter(a => {
				if (a.action.type !== 'chat/toolCallConfirmed') {
					return false;
				}
				return (a.action as IToolCallConfirmedAction).toolCallId === 'tc-recon';
			});
			assert.strictEqual(allConfirms.length, 2, 'two toolCallConfirmed dispatches expected (initial + reconfirmation)');

			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-recon',
				result: { success: true, pastTenseMessage: 'Done', content: [{ type: 'text', text: 'hi\n' }] },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));
	});

	// ---- History loading ---------------------------------------------------

	suite('history loading', () => {

		test('loads user and assistant messages into history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'sess-1');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: { text: 'What is 2+2?', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: '4' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/sess-1' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);

			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.strictEqual(request.prompt, 'What is 2+2?');
			}

			const response = session.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				assert.strictEqual(response.parts.length, 1);
				assert.strictEqual((response.parts[0] as IChatMarkdownContent).content.value, '4');
			}
		});

		test('restores agent feedback attachments into request history variable data', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/feedback-history' });
			const feedbackFile = URI.file('/workspace/foo.ts');
			const sessionUri = AgentSession.uri('copilot', 'feedback-history');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: {
						text: '/act-on-feedback',
						origin: { kind: MessageKind.User },
						attachments: [{
							type: MessageAttachmentKind.Simple,
							label: 'Feedback',
							displayKind: AgentFeedbackAttachmentDisplayKind,
							modelRepresentation: 'Feedback text for the model',
							_meta: {
								[AgentFeedbackAttachmentMetadataKey]: {
									sessionResource: sessionResource.toString(),
									feedbackItems: [{
										id: 'feedback-1',
										text: 'Please simplify this.',
										resourceUri: feedbackFile.toString(),
										range: {
											start: { line: 1, character: 2 },
											end: { line: 3, character: 4 },
										},
									}],
								},
							},
						}],
					},
					responseParts: [],
					usage: undefined,
					state: TurnState.Complete,
				}],
			} as SessionState);

			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);
			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.ok(request.variableData);
				const variables = request.variableData.variables;
				const feedbackVariable = variables[0];
				assert.strictEqual(feedbackVariable.kind, 'agentFeedback');
				assert.deepStrictEqual({
					...feedbackVariable,
					sessionResource: feedbackVariable.sessionResource.toString(),
					feedbackItems: feedbackVariable.feedbackItems.map(item => ({
						...item,
						resourceUri: item.resourceUri.toString(),
					})),
				}, {
					kind: 'agentFeedback',
					id: feedbackVariable.id,
					name: 'Feedback',
					value: 'Feedback text for the model',
					sessionResource: sessionResource.toString(),
					feedbackItems: [{
						id: 'feedback-1',
						text: 'Please simplify this.',
						resourceUri: feedbackFile.toString(),
						range: { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 },
					}],
					_meta: {
						[AgentFeedbackAttachmentMetadataKey]: {
							sessionResource: sessionResource.toString(),
							feedbackItems: [{
								id: 'feedback-1',
								text: 'Please simplify this.',
								resourceUri: feedbackFile.toString(),
								range: {
									start: { line: 1, character: 2 },
									end: { line: 3, character: 4 },
								},
							}],
						},
					},
				});
			}
		});

		test('restores agent feedback annotations attachments as one aggregated request variable', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/feedback-annotations-history' });
			const annotationsResource = 'ahp-session:/feedback-annotations-history/annotations';
			const feedbackFile = URI.file('/workspace/foo.ts');
			const feedbackFile2 = URI.file('/workspace/bar.ts');
			const sessionUri = AgentSession.uri('copilot', 'feedback-annotations-history');
			const makeAnnotationAttachment = (id: string, text: string, resourceUri: string) => ({
				type: MessageAttachmentKind.Annotations,
				label: '2 comments',
				displayKind: AgentFeedbackAttachmentDisplayKind,
				resource: annotationsResource,
				annotationIds: [id],
				_meta: {
					[AgentFeedbackAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						feedbackItems: [{
							id,
							text,
							resourceUri,
							range: { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } },
						}],
					},
				},
			});
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: {
						text: '/act-on-feedback',
						origin: { kind: MessageKind.User },
						attachments: [
							makeAnnotationAttachment('feedback-1', 'Please simplify this.', feedbackFile.toString()),
							makeAnnotationAttachment('feedback-2', 'Rename this.', feedbackFile2.toString()),
						],
					},
					responseParts: [],
					usage: undefined,
					state: TurnState.Complete,
				}],
			} as SessionState);

			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.ok(request.variableData);
				const variables = request.variableData.variables;
				assert.strictEqual(variables.length, 1);
				const feedbackVariable = variables[0];
				assert.strictEqual(feedbackVariable.kind, 'agentFeedback');
				assert.deepStrictEqual({
					kind: feedbackVariable.kind,
					name: feedbackVariable.name,
					sessionResource: feedbackVariable.sessionResource.toString(),
					annotationsResource: feedbackVariable.annotationsResource?.toString(),
					feedbackItems: feedbackVariable.feedbackItems.map(item => ({
						id: item.id,
						text: item.text,
						resourceUri: item.resourceUri.toString(),
						range: item.range,
					})),
				}, {
					kind: 'agentFeedback',
					name: '2 comments',
					sessionResource: sessionResource.toString(),
					annotationsResource,
					feedbackItems: [{
						id: 'feedback-1',
						text: 'Please simplify this.',
						resourceUri: feedbackFile.toString(),
						range: { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 },
					}, {
						id: 'feedback-2',
						text: 'Rename this.',
						resourceUri: feedbackFile2.toString(),
						range: { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 },
					}],
				});
			}
		});

		test('restores agent host completion attachments as hidden request variables', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/completion-history' });
			const sessionUri = AgentSession.uri('copilot', 'completion-history');
			const skillMeta = {
				uri: 'file:///skills/agent-host-docs/SKILL.md',
				displayName: 'agent-host-docs',
				description: 'Use this skill when working on Agent Host code',
			};
			const commandMeta = {
				command: 'rename',
				description: 'Rename this chat',
			};

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: {
						text: '/agent-host-docs please check this\n/rename Title',
						origin: { kind: MessageKind.User },
						attachments: [
							{
								type: MessageAttachmentKind.Simple,
								label: '/agent-host-docs',
								displayKind: 'skill',
								_meta: skillMeta,
							},
							{
								type: MessageAttachmentKind.Simple,
								label: '/rename',
								displayKind: 'command',
								_meta: commandMeta,
							},
						],
					},
					responseParts: [],
					usage: undefined,
					state: TurnState.Complete,
				}],
			} as SessionState);

			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const request = session.history[0];
			assert.strictEqual(request.type, 'request');
			if (request.type === 'request') {
				assert.deepStrictEqual(request.variableData?.variables.map(variable => ({
					kind: variable.kind,
					id: variable.id,
					name: variable.name,
					value: variable.value,
					_meta: variable._meta,
				})), [
					toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/agent-host-docs', skillMeta.uri, skillMeta),
					toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/rename', 'rename', commandMeta),
				]);
			}
		});

		test('untitled sessions have empty history', async () => {
			const { sessionHandler } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-xyz' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 0);
		});

		test('history requests get per-turn modelId from usage or message model', async () => {
			const languageModels = new Map<string, ILanguageModelChatMetadata>([
				['agent-host-copilot:opus-4.7', upcastPartial<ILanguageModelChatMetadata>({ name: 'Opus 4.7', pricing: '15x' })],
				['agent-host-copilot:sonnet-4.6', upcastPartial<ILanguageModelChatMetadata>({ name: 'Sonnet 4.6', pricing: '2x' })],
			]);
			const { sessionHandler, agentHostService } = createContribution(disposables, { languageModels });

			const sessionUri = AgentSession.uri('copilot', 'sess-models');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({
					resource: sessionUri.toString(), provider: 'copilot', title: 'Test',
					status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				turns: [
					{
						id: 'turn-1',
						message: { text: 'Q1', origin: { kind: MessageKind.User } },
						responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'A1' }],
						usage: { model: 'opus-4.7', _meta: { cost: 1.5 } },
						state: TurnState.Complete,
					},
					{
						id: 'turn-2',
						message: { text: 'Q2', origin: { kind: MessageKind.User }, model: { id: 'sonnet-4.6' } },
						responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-2', content: 'A2' }],
						usage: undefined,
						state: TurnState.Complete,
					},
				],
				activeTurn: {
					id: 'turn-active',
					message: { text: 'Q3', origin: { kind: MessageKind.User }, model: { id: 'sonnet-4.6' } },
					responseParts: [],
					usage: { _meta: { cost: 1 } },
				},
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/sess-models' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const requests = session.history.filter((h): h is IChatSessionRequestHistoryItem => h.type === 'request');
			assert.deepStrictEqual(
				requests.map(r => ({ prompt: r.prompt, modelId: r.modelId })),
				[
					{ prompt: 'Q1', modelId: 'agent-host-copilot:opus-4.7' },
					{ prompt: 'Q2', modelId: 'agent-host-copilot:sonnet-4.6' },
					{ prompt: 'Q3', modelId: 'agent-host-copilot:sonnet-4.6' },
				],
			);

			const responses = session.history.filter(h => h.type === 'response');
			assert.deepStrictEqual(
				responses.map(r => r.details),
				['Opus 4.7 • 1.5 credits', 'Sonnet 4.6 · 2x', 'Sonnet 4.6 • 1 credit'],
			);

			const activeResponse = session.history[session.history.length - 1];
			assert.strictEqual(activeResponse.type, 'response');
			if (activeResponse.type === 'response') {
				assert.strictEqual(activeResponse.parts.length, 0);
			}
		});
	});

	// ---- Tool invocation rendering -----------------------------------------

	suite('tool invocation rendering', () => {

		test('bash tool renders as terminal command block with output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-shell', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-shell', invocationMessage: 'Running `echo hello`', toolInput: 'echo hello', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-shell',
				result: { success: true, pastTenseMessage: 'Ran `echo hello`', content: [{ type: 'terminal', resource: 'agenthost-terminal:///tc-shell-term' }, { type: 'text', text: 'hello\n' }] },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				kind: invocation.kind,
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				dataKind: termData.kind,
				commandLine: termData.commandLine.original,
				language: termData.language,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				kind: 'toolInvocation',
				invocationMessage: 'Running `echo hello`',
				pastTenseMessage: undefined,
				dataKind: 'terminal',
				commandLine: 'echo hello',
				language: 'shellscript',
				outputText: 'hello\r\n',
				exitCode: 0,
			});
		}));

		test('bash tool failure sets exit code 1 and error output', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-fail', toolName: 'bash', displayName: 'Bash', _meta: { toolKind: 'terminal', language: 'shellscript' } } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-fail', invocationMessage: 'Running `bad_cmd`', toolInput: 'bad_cmd', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-fail',
				result: { success: false, pastTenseMessage: '"Bash" failed', content: [{ type: 'terminal', resource: 'agenthost-terminal:///tc-fail-term' }, { type: 'text', text: 'command not found: bad_cmd' }], error: { message: 'command not found: bad_cmd' } },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			const termData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
			assert.deepStrictEqual({
				pastTenseMessage: invocation.pastTenseMessage,
				outputText: termData.terminalCommandOutput?.text,
				exitCode: termData.terminalCommandState?.exitCode,
			}, {
				pastTenseMessage: undefined,
				outputText: 'command not found: bad_cmd',
				exitCode: 1,
			});
		}));

		test('generic tool has invocation message and no toolSpecificData', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-gen', toolName: 'custom_tool', displayName: 'custom_tool' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-gen', invocationMessage: 'Using "custom_tool"', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-gen',
				result: { success: true, pastTenseMessage: 'Used "custom_tool"' },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Using "custom_tool"',
				pastTenseMessage: 'Used "custom_tool"',
				toolSpecificData: undefined,
			});
		}));

		test('bash tool without arguments has no terminal data', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-noargs', toolName: 'bash', displayName: 'Bash', toolKind: 'terminal' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-noargs', invocationMessage: 'Running Bash command', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-noargs',
				result: { success: true, pastTenseMessage: 'Ran Bash command' },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
				toolSpecificData: invocation.toolSpecificData,
			}, {
				invocationMessage: 'Running Bash command',
				pastTenseMessage: 'Ran Bash command',
				toolSpecificData: undefined,
			});
		}));

		test('view tool shows file path in messages', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			fire({ type: 'chat/toolCallStart', session, turnId, toolCallId: 'tc-view', toolName: 'view', displayName: 'View File' } as ChatAction);
			fire({ type: 'chat/toolCallReady', session, turnId, toolCallId: 'tc-view', invocationMessage: 'Reading /tmp/test.txt', confirmed: 'not-needed' } as ChatAction);
			fire({
				type: 'chat/toolCallComplete', session, turnId, toolCallId: 'tc-view',
				result: { success: true, pastTenseMessage: 'Read /tmp/test.txt' },
			} as ChatAction);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);

			await turnPromise;

			const invocation = collected[0][0] as IChatToolInvocation;
			assert.deepStrictEqual({
				invocationMessage: textOf(invocation.invocationMessage),
				pastTenseMessage: textOf(invocation.pastTenseMessage),
			}, {
				invocationMessage: 'Reading /tmp/test.txt',
				pastTenseMessage: 'Read /tmp/test.txt',
			});
		}));
	});

	// ---- History with tool events ----------------------------------------

	suite('history with tool events', () => {

		test('tool_start and tool_complete appear as toolInvocationSerialized in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'tool-hist');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: { text: 'run ls', origin: { kind: MessageKind.User } },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: {
							status: 'completed' as const, toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash',
							invocationMessage: 'Running `ls`', toolInput: 'ls', _meta: { toolKind: 'terminal', language: 'shellscript' },
							confirmed: 'not-needed' as const, success: true, pastTenseMessage: 'Ran `ls`', content: [{ type: 'terminal' as const, resource: 'agenthost-terminal:///tc-1-term' }, { type: 'text' as const, text: 'file1\nfile2' }],
						}
					}],
					usage: undefined,
				}],
			} as SessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/tool-hist' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// request, response
			assert.strictEqual(chatSession.history.length, 2);

			const response = chatSession.history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type === 'response') {
				assert.strictEqual(response.parts.length, 1);
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.toolCallId, 'tc-1');
				assert.strictEqual(toolPart.isComplete, true);
				// Terminal tool has output and exit code
				assert.strictEqual(toolPart.toolSpecificData?.kind, 'terminal');
				const termData = toolPart.toolSpecificData as IChatTerminalToolInvocationData;
				assert.strictEqual(termData.terminalCommandOutput?.text, 'file1\r\nfile2');
				assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
			}
		});

		test('orphaned tool_start is marked complete in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'orphan-tool');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: { text: 'do something', origin: { kind: MessageKind.User } },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: { status: 'completed' as const, toolCallId: 'tc-orphan', toolName: 'read_file', displayName: 'Read File', invocationMessage: 'Reading file', confirmed: 'not-needed' as const, success: false, pastTenseMessage: 'Reading file' },
					}],
					usage: undefined,
				}],
			} as SessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/orphan-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 2);
			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(toolPart.kind, 'toolInvocationSerialized');
				assert.strictEqual(toolPart.isComplete, true);
			}
		});

		test('non-terminal tool_complete sets pastTenseMessage in history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'generic-tool');

			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-1',
					message: { text: 'search', origin: { kind: MessageKind.User } },
					state: TurnState.Complete,
					responseParts: [{
						kind: 'toolCall' as const, toolCall: { status: 'completed' as const, toolCallId: 'tc-g', toolName: 'grep', displayName: 'Grep', invocationMessage: 'Searching...', confirmed: 'not-needed' as const, success: true, pastTenseMessage: 'Searched for pattern' },
					}],
					usage: undefined,
				}],
			} as SessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/generic-tool' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const response = chatSession.history[1];
			if (response.type === 'response') {
				const toolPart = response.parts[0] as IChatToolInvocationSerialized;
				assert.strictEqual(textOf(toolPart.pastTenseMessage), 'Searched for pattern');
				assert.strictEqual(toolPart.toolSpecificData, undefined);
			}
		});

		test('empty session produces empty history', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'empty-sess');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [],
			} as SessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/empty-sess' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(chatSession.history.length, 0);
		});
	});

	// ---- Server error handling ----------------------------------------------

	suite('server error handling', () => {

		test('server-side error resolves the agent invoke without throwing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Simulate a server-side error (e.g. sendMessage failure on the server)
			agentHostService.fireAction({
				channel: session,
				action: {
					type: 'chat/error',
					turnId,
					error: { errorType: 'connection_error', message: 'connection lost' },
				} as ChatAction,
				serverSeq: 99,
				origin: undefined,
			});

			await turnPromise;
		}));
	});

	// ---- Session list provider filtering --------------------------------

	suite('session list provider filtering', () => {

		test('filters sessions to only the matching provider', async () => {
			const { listController, agentHostService } = createContribution(disposables);

			// Add sessions from both providers (use a non-copilot scheme to test filtering)
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-1'), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: URI.from({ scheme: 'other-provider', path: '/cl-1' }), startTime: 1000, modifiedTime: 2000 });
			agentHostService.addSession({ session: AgentSession.uri('copilot', 'cp-2'), startTime: 3000, modifiedTime: 4000 });

			await listController.refresh(CancellationToken.None);

			// The list controller is configured for 'copilot', so only copilot sessions
			assert.strictEqual(listController.items.length, 2);
			assert.ok(listController.items.every(item => item.resource.scheme === 'agent-host-copilot'));
		});
	});

	// ---- Language model provider ----------------------------------------

	suite('language model provider', () => {

		test('maps models with correct metadata', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, maxPromptTokens: 128000, supportsVision: true, _meta: { multiplierNumeric: 1.5 } },
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].identifier, 'agent-host-copilot:gpt-4o');
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
			assert.strictEqual(models[0].metadata.maxInputTokens, 128000);
			assert.strictEqual(models[0].metadata.capabilities?.vision, true);
			assert.strictEqual(models[0].metadata.pricing, '1.5x');
			assert.strictEqual(models[0].metadata.multiplierNumeric, 1.5);
			assert.strictEqual(models[0].metadata.targetChatSessionType, 'agent-host-copilot');
		});

		test('maps cost metadata from _meta onto model metadata', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{
					provider: 'copilot', id: 'claude-sonnet', name: 'Claude Sonnet', maxContextWindow: 200000, supportsVision: false,
					_meta: {
						multiplierNumeric: 1,
						inputCost: 3,
						cacheCost: 1,
						outputCost: 15,
						longContextInputCost: 6,
						longContextOutputCost: 22.5,
						priceCategory: 'medium',
					},
				},
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			const metadata = models[0].metadata;
			assert.deepStrictEqual({
				inputCost: metadata.inputCost,
				cacheCost: metadata.cacheCost,
				outputCost: metadata.outputCost,
				longContextInputCost: metadata.longContextInputCost,
				longContextCacheCost: metadata.longContextCacheCost,
				longContextOutputCost: metadata.longContextOutputCost,
				priceCategory: metadata.priceCategory,
			}, {
				inputCost: 3,
				cacheCost: 1,
				outputCost: 15,
				longContextInputCost: 6,
				longContextCacheCost: undefined,
				longContextOutputCost: 22.5,
				priceCategory: 'medium',
			});
		});

		test('filters out disabled models', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{ provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', maxContextWindow: 128000, supportsVision: false, policyState: PolicyState.Enabled },
				{ provider: 'copilot', id: 'gpt-3.5', name: 'GPT-3.5', maxContextWindow: 16000, supportsVision: false, policyState: PolicyState.Disabled },
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].metadata.name, 'GPT-4o');
		});

		test('maps model config schema to picker configuration schema', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));
			provider.updateModels([
				{
					provider: 'copilot',
					id: 'claude-sonnet-4.5',
					name: 'Claude Sonnet 4.5',
					maxContextWindow: 128000,
					supportsVision: false,
					configSchema: {
						type: 'object',
						properties: {
							thinkingLevel: {
								type: 'string',
								title: 'Thinking Level',
								default: 'medium',
								enum: ['low', 'medium', 'high'],
								enumLabels: ['Low', 'Medium', 'High'],
							},
						},
					},
				},
			]);

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.deepStrictEqual(models[0].metadata.configurationSchema?.properties?.thinkingLevel, {
				type: 'string',
				title: 'Thinking Level',
				description: undefined,
				default: 'medium',
				enum: ['low', 'medium', 'high'],
				enumItemLabels: ['Low', 'Medium', 'High'],
				enumDescriptions: undefined,
				readOnly: undefined,
				group: 'navigation',
			});
		});

		test('returns empty when no models set', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));

			const models = await provider.provideLanguageModelChatInfo({}, CancellationToken.None);

			assert.strictEqual(models.length, 0);
		});

		test('sendChatRequest throws', async () => {
			const provider = disposables.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot'));

			await assert.rejects(() => provider.sendChatRequest(), /do not support direct chat requests/);
		});
	});

	// ---- Attachment context conversion --------------------------------------

	suite('attachment context', () => {

		test('file variable with file:// URI becomes file attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this file',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts') }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/workspace/test.ts').toString(), label: 'test.ts', displayKind: 'document' },
			]);
		}));

		test('screenshot variable becomes embedded image attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const screenshotBuffer = VSBuffer.fromString('screenshot bytes');

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'describe this screenshot',
				variables: {
					variables: [
						convertBufferToScreenshotVariable(screenshotBuffer),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{
					type: MessageAttachmentKind.EmbeddedResource,
					label: 'Screenshot',
					displayKind: 'image',
					data: encodeBase64(screenshotBuffer),
					contentType: 'image/png',
				},
			]);
		}));

		test('browser view variable becomes a model-readable browser attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const browserUri = URI.from({ scheme: 'vscode-browser', path: '/page-1' });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'inspect this page',
				variables: {
					variables: [
						upcastPartial({
							kind: 'browserView',
							id: browserUri.toString(),
							name: 'Example page',
							value: browserUri,
							browserId: 'page-1',
							modelDescription: 'Browser page: Example. The pageId is "page-1".',
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: 'Example page',
				modelRepresentation: 'Browser page: Example. The pageId is "page-1".',
				displayKind: BrowserViewAttachmentDisplayKind,
				_meta: { [BrowserViewAttachmentMetadataKey]: { browserId: 'page-1', browserUri: browserUri.toString() } },
			}]);

			const replayedVariables = messageAttachmentsToVariableData(turnAction.message.attachments, 'test')?.variables;
			assert.strictEqual(replayedVariables?.length, 1);
			assert.strictEqual(replayedVariables?.[0].value?.toString(), browserUri.toString());
			assert.deepStrictEqual({ ...replayedVariables?.[0], value: undefined }, {
				kind: 'browserView',
				id: browserUri.toString(),
				name: 'Example page',
				value: undefined,
				browserId: 'page-1',
				modelDescription: 'Browser page: Example. The pageId is "page-1".',
				_meta: { [BrowserViewAttachmentMetadataKey]: { browserId: 'page-1', browserUri: browserUri.toString() } },
			});
		}));

		test('preserves _meta from variable entry on outgoing attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this file',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'test.ts', value: URI.file('/workspace/test.ts'), _meta: { provider: 'fs', score: 0.42 } }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/workspace/test.ts').toString(), label: 'test.ts', displayKind: 'document', _meta: { provider: 'fs', score: 0.42 } },
			]);
		}));

		test('local agent host Copilot CLI session reference becomes simple and trajectory attachments', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionReference = URI.from({ scheme: 'agent-host-copilotcli', path: '/session-123' });
			const trajectoryUri = URI.file('/home/test-user/.copilot/session-state/session-123/events.jsonl');

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue #review',
				variables: {
					variables: [
						upcastPartial({
							kind: 'sessionReference',
							id: sessionReference.toString(),
							name: 'Review session',
							value: sessionReference,
							range: { start: 9, endExclusive: 16 },
							_meta: { source: 'test' },
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: 'Review session',
				modelRepresentation: toSessionReferenceModelRepresentation('Review session', sessionReference, trajectoryUri.fsPath),
				displayKind: AgentHostSessionReferenceAttachmentDisplayKind,
				range: {
					start: { line: 0, character: 9 },
					end: { line: 0, character: 16 },
				},
				_meta: {
					source: 'test',
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionReference.toString(),
						sessionID: sessionReference.toString(),
					},
				},
			}, {
				type: MessageAttachmentKind.Resource,
				uri: trajectoryUri.toString(),
				label: 'Review session trajectory',
				displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
				_meta: {
					source: 'test',
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionReference.toString(),
						sessionID: sessionReference.toString(),
					},
				},
			}]);
		}));

		test('extension host Copilot CLI session reference becomes simple and trajectory attachments', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionReference = URI.from({ scheme: 'copilotcli', path: '/session-123' });
			const trajectoryUri = URI.file('/home/test-user/.copilot/session-state/session-123/events.jsonl');

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue #review',
				variables: {
					variables: [
						upcastPartial({
							kind: 'sessionReference',
							id: sessionReference.toString(),
							name: 'Review session',
							value: sessionReference,
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: 'Review session',
				modelRepresentation: toSessionReferenceModelRepresentation('Review session', sessionReference, trajectoryUri.fsPath),
				displayKind: AgentHostSessionReferenceAttachmentDisplayKind,
				_meta: {
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionReference.toString(),
						sessionID: sessionReference.toString(),
					},
				},
			}, {
				type: MessageAttachmentKind.Resource,
				uri: trajectoryUri.toString(),
				label: 'Review session trajectory',
				displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
				_meta: {
					[AgentHostSessionReferenceAttachmentMetadataKey]: {
						sessionResource: sessionReference.toString(),
						sessionID: sessionReference.toString(),
					},
				},
			}]);
		}));

		test('remote agent host Copilot CLI session reference becomes simple and trajectory attachments', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				remoteAgentHostServiceOverride: {
					connections: [upcastPartial({ address: 'remote.example', name: 'remote.example', clientId: 'remote-client', status: { kind: 'connected' }, defaultDirectory: '/home/remote-user' })],
				},
			});
			const sessionReference = URI.from({ scheme: 'remote-remote.example-copilotcli', path: '/session-123' });
			const trajectoryPath = '/home/remote-user/.copilot/session-state/session-123/events.jsonl';

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue #review',
				variables: {
					variables: [
						upcastPartial({
							kind: 'sessionReference',
							id: sessionReference.toString(),
							name: 'Remote review session',
							value: sessionReference,
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			const attachment = turnAction.message.attachments?.[0];
			assert.strictEqual(attachment?.type, MessageAttachmentKind.Simple);
			assert.strictEqual(attachment.modelRepresentation, toSessionReferenceModelRepresentation('Remote review session', sessionReference, trajectoryPath));
			const trajectoryAttachment = turnAction.message.attachments?.[1];
			assert.strictEqual(trajectoryAttachment?.type, MessageAttachmentKind.Resource);
			assert.strictEqual(trajectoryAttachment.uri, URI.file(trajectoryPath).toString());
			assert.strictEqual(trajectoryAttachment.displayKind, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind);
		}));

		test('unsupported session reference variable is dropped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionReference = URI.from({ scheme: 'claude-code', path: '/session-123' });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue #review',
				variables: {
					variables: [
						upcastPartial({
							kind: 'sessionReference',
							id: sessionReference.toString(),
							name: 'Review session',
							value: sessionReference,
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('malformed session reference variable is dropped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'continue this',
				variables: {
					variables: [
						upcastPartial({ kind: 'sessionReference', id: 'bad-session', name: 'Bad session', value: 'not a uri' as never }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('agent feedback variable becomes a simple attachment when no annotations channel is known', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/feedback-test' });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: '/act-on-feedback',
				sessionResource,
				variables: {
					variables: [
						upcastPartial({
							kind: 'agentFeedback',
							id: 'feedback-var',
							name: 'Feedback',
							value: 'Feedback text for the model',
							sessionResource,
							feedbackItems: [{
								id: 'feedback-1',
								text: 'Please simplify this.',
								resourceUri: URI.file('/workspace/foo.ts'),
								range: new Range(2, 3, 4, 5),
								codeSelection: 'const value = compute();',
								diffHunks: '@@ -1 +1 @@',
								sourcePRReviewCommentId: 'thread-1',
							}],
							_meta: { source: 'test' },
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [{
				type: MessageAttachmentKind.Simple,
				label: 'Feedback',
				modelRepresentation: 'Feedback text for the model',
				displayKind: AgentFeedbackAttachmentDisplayKind,
				_meta: {
					source: 'test',
					[AgentFeedbackAttachmentMetadataKey]: {
						sessionResource: sessionResource.toString(),
						feedbackItems: [{
							id: 'feedback-1',
							text: 'Please simplify this.',
							resourceUri: URI.file('/workspace/foo.ts').toString(),
							range: {
								start: { line: 1, character: 2 },
								end: { line: 3, character: 4 },
							},
						}],
					},
				},
			}]);
		}));

		test('directory variable with file:// URI becomes directory attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this dir',
				variables: {
					variables: [
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'src', value: URI.file('/workspace/src') }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/workspace/src').toString(), label: 'src', displayKind: 'directory' },
			]);
		}));

		test('implicit selection variable becomes selection attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'explain this',
				variables: {
					variables: [
						upcastPartial({ kind: 'implicit', id: 'v-implicit', name: 'selection', isFile: true as const, isSelection: true, uri: URI.file('/workspace/foo.ts'), enabled: true, value: { uri: URI.file('/workspace/foo.ts'), range: new Range(2, 3, 4, 5) } }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{
					type: MessageAttachmentKind.Resource,
					uri: URI.file('/workspace/foo.ts').toString(),
					label: 'selection',
					displayKind: 'selection',
					selection: {
						range: {
							start: { line: 1, character: 2 },
							end: { line: 3, character: 4 },
						},
					},
				},
			]);
		}));

		test('file variable with location value becomes selection attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'explain this selected range',
				variables: {
					variables: [
						upcastPartial({
							kind: 'file',
							id: 'v-file-selection',
							name: 'foo.ts:2-4',
							value: { uri: URI.file('/workspace/foo.ts'), range: new Range(2, 3, 4, 5) },
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{
					type: MessageAttachmentKind.Resource,
					uri: URI.file('/workspace/foo.ts').toString(),
					label: 'foo.ts:2-4',
					displayKind: 'selection',
					selection: {
						range: {
							start: { line: 1, character: 2 },
							end: { line: 3, character: 4 },
						},
					},
				},
			]);
		}));

		test('implicit visible code location becomes document attachment without selection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'explain this',
				variables: {
					variables: [
						upcastPartial({
							kind: 'implicit',
							id: 'v-implicit-visible-code',
							name: 'visible code',
							isFile: true as const,
							isSelection: false,
							uri: URI.file('/workspace/foo.ts'),
							enabled: true,
							value: { uri: URI.file('/workspace/foo.ts'), range: new Range(2, 3, 4, 5) },
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{
					type: MessageAttachmentKind.Resource,
					uri: URI.file('/workspace/foo.ts').toString(),
					label: 'visible code',
					displayKind: 'document',
				},
			]);
		}));

		test('active editor implicit context is not forwarded when the setting is disabled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables, {
				configOverrides: { [ChatConfiguration.ImplicitContextActiveEditor]: false },
			});
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-implicit-disabled' });
			const fileUri = URI.file('/workspace/foo.ts');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('active editor implicit context is forwarded as a document attachment for agent sessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-implicit-active-editor' });
			const fileUri = URI.file('/workspace/foo.ts');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			]);
		}));

		test('active editor implicit context is not duplicated when also attached explicitly', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-implicit-dedup' });
			const fileUri = URI.file('/workspace/foo.ts');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: fileUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			]);
		}));

		test('active editor implicit selection is forwarded even when the same file is attached as a document', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-implicit-selection-dedup' });
			const fileUri = URI.file('/workspace/foo.ts');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.selection', name: 'foo.ts', isSelection: true, uri: fileUri, value: { uri: fileUri, range: new Range(2, 1, 4, 10) } },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this selection?',
				sessionResource,
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: fileUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'selection', selection: { range: { start: { line: 1, character: 0 }, end: { line: 3, character: 9 } } } },
			]);
		}));

		test('active editor implicit context is not forwarded for untitled editors on non-Copilot-CLI backends', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService } = createContribution(disposables);
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-implicit-untitled' });
			const untitledUri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'Untitled-1', isSelection: false, uri: untitledUri, value: untitledUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('active editor implicit context for an untitled editor is inlined for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-untitled' });
			const untitledUri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			modelService.setModelContent(untitledUri, 'console.log("draft")');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'Untitled-1', isSelection: false, uri: untitledUri, value: untitledUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'Untitled-1', displayKind: 'document', data: encodeBase64(VSBuffer.fromString('console.log("draft")')), contentType: 'text/plain' },
			]);
		}));

		test('active editor implicit context for a dirty saved file is inlined for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-dirty' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'edited but not saved');
			workingCopyService.setDirty(fileUri, true);
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'foo.ts', displayKind: 'document', data: encodeBase64(VSBuffer.fromString('edited but not saved')), contentType: 'text/plain' },
			]);
		}));

		test('active editor implicit selection in an unsaved editor preserves the selection range when inlined for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-dirty-selection' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'first line\nsecond line\nthird line\nfourth line content');
			workingCopyService.setDirty(fileUri, true);
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.selection', name: 'foo.ts', isSelection: true, uri: fileUri, value: { uri: fileUri, range: new Range(2, 1, 4, 10) } },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this selection?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'foo.ts', displayKind: 'selection', data: encodeBase64(VSBuffer.fromString('second line\nthird line\nfourth li')), contentType: 'text/plain', selection: { range: { start: { line: 1, character: 0 }, end: { line: 3, character: 9 } } } },
			]);
		}));

		test('active editor implicit context for a clean saved file is forwarded as a path for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-clean' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'saved content');
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			]);
		}));

		test('active editor implicit context over the size cap is dropped for an untitled editor on the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-untitled-toolarge' });
			const untitledUri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			modelService.setModelContent(untitledUri, 'x'.repeat(1024 * 1024 + 1));
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'Untitled-1', isSelection: false, uri: untitledUri, value: untitledUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('active editor implicit context over the size cap falls back to a path for a dirty saved file on the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-implicit-dirty-toolarge' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'x'.repeat(1024 * 1024 + 1));
			workingCopyService.setDirty(fileUri, true);
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			]);
		}));

		test('non-file URI variables (e.g. untitled documents) are forwarded as attachments', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const uri = URI.from({ scheme: 'untitled', path: '/foo' });

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'untitled', value: uri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: uri.toString(), label: 'untitled', displayKind: 'document' },
			]);
		}));

		test('explicitly attached untitled editor is inlined for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, modelService } = createContribution(disposables, { provider: 'copilotcli' });
			const untitledUri = URI.from({ scheme: 'untitled', path: '/Untitled-1' });
			modelService.setModelContent(untitledUri, 'console.log("draft")');

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'Untitled-1', value: untitledUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'Untitled-1', displayKind: 'document', data: encodeBase64(VSBuffer.fromString('console.log("draft")')), contentType: 'text/plain' },
			]);
		}));

		test('explicitly attached dirty saved file is inlined for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'edited but not saved');
			workingCopyService.setDirty(fileUri, true);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: fileUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'foo.ts', displayKind: 'document', data: encodeBase64(VSBuffer.fromString('edited but not saved')), contentType: 'text/plain' },
			]);
		}));

		test('explicitly attached clean saved file is forwarded as a path for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, modelService } = createContribution(disposables, { provider: 'copilotcli' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'saved content');

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: fileUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			]);
		}));

		test('explicitly attached unsaved file is not duplicated by the active editor for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatWidgetService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/copilot-explicit-implicit-dedup' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'edited but not saved');
			workingCopyService.setDirty(fileUri, true);
			chatWidgetService.setWidgetForSession(sessionResource, [
				{ kind: 'implicit', id: 'vscode.implicit.file', name: 'foo.ts', isSelection: false, uri: fileUri, value: fileUri },
			]);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'what\'s in this file?',
				sessionResource,
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: fileUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'foo.ts', displayKind: 'document', data: encodeBase64(VSBuffer.fromString('edited but not saved')), contentType: 'text/plain' },
			]);
		}));

		test('inlined unsaved attachment preserves _meta and selection for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, modelService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			const fileUri = URI.file('/workspace/foo.ts');
			modelService.setModelContent(fileUri, 'first line\nsecond line\nthird line\nfourth line content');
			workingCopyService.setDirty(fileUri, true);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: { uri: fileUri, range: new Range(2, 1, 4, 10) }, _meta: { provider: 'fs', score: 0.42 } }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.EmbeddedResource, label: 'foo.ts', displayKind: 'selection', data: encodeBase64(VSBuffer.fromString('second line\nthird line\nfourth li')), contentType: 'text/plain', selection: { range: { start: { line: 1, character: 0 }, end: { line: 3, character: 9 } } }, _meta: { provider: 'fs', score: 0.42 } },
			]);
		}));

		test('dirty non-file resource that cannot be inlined is dropped for the Copilot CLI backend', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, workingCopyService } = createContribution(disposables, { provider: 'copilotcli' });
			// A dirty resource with no loaded text model (e.g. a notebook cell or remote URI) can't be inlined; for the
			// CLI a non-file path is unreadable, so it must be dropped rather than forwarded as a broken path.
			const remoteUri = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/remote/foo.ts' });
			workingCopyService.setDirty(remoteUri, true);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'check this',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'foo.ts', value: remoteUri }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('tool variables are skipped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'use tools',
				variables: {
					variables: [
						upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		test('mixed variables extracts only supported types', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'mixed',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/workspace/a.ts') }),
						upcastPartial({ kind: 'tool', id: 'v-tool', name: 'myTool', value: { id: 'tool-1' } }),
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/workspace/lib') }),
						upcastPartial({ kind: 'file', id: 'v-file', name: 'remote.ts', value: URI.from({ scheme: 'vscode-remote', path: '/remote/file.ts' }) }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/workspace/a.ts').toString(), label: 'a.ts', displayKind: 'document' },
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/workspace/lib').toString(), label: 'lib', displayKind: 'directory' },
				{ type: MessageAttachmentKind.Resource, uri: 'vscode-remote:/remote/file.ts', label: 'remote.ts', displayKind: 'document' },
			]);
		}));

		test('no variables results in no attachments argument', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'Hello',
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.strictEqual(turnAction.message.attachments, undefined);
		}));

		// ---- Working-directory rebasing -----------------------------------
		// On the first turn of a worktree-isolated session, the workbench
		// resolves attachments under the original workspace folder, but the
		// agent server has resolved its working directory to a freshly
		// created worktree path. The handler rebases attachment URIs so the
		// agent receives URIs under its own working directory.

		test('rebases file/directory/selection attachments under requested working dir onto resolved working dir', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const requestedDir = URI.file('/source');
			const resolvedDir = URI.file('/worktree');
			const expectedSelectionUri = URI.file('/worktree/sub/foo.ts');
			const feedbackUri = URI.file('/source/commented.ts');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => requestedDir },
			});
			agentHostService.nextResolvedWorkingDirectory = resolvedDir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'rebase me',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/source/a.ts') }),
						upcastPartial({ kind: 'directory', id: 'v-dir', name: 'lib', value: URI.file('/source/lib') }),
						upcastPartial({
							kind: 'implicit',
							id: 'v-implicit',
							name: 'selection',
							isFile: true as const,
							isSelection: true,
							uri: URI.file('/source/sub/foo.ts'),
							enabled: true,
							value: { uri: URI.file('/source/sub/foo.ts'), range: new Range(2, 3, 4, 5) },
						}),
						upcastPartial({
							kind: 'agentFeedback',
							id: 'v-feedback',
							name: 'Feedback',
							value: 'Feedback text for the model',
							sessionResource: URI.from({ scheme: 'agent-host-copilot', path: '/new-turntest' }),
							feedbackItems: [{
								id: 'feedback-1',
								text: 'Please simplify this.',
								resourceUri: feedbackUri,
								range: new Range(6, 1, 6, 8),
								codeSelection: 'compute',
							}],
						}),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/worktree/a.ts').toString(), label: 'a.ts', displayKind: 'document' },
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/worktree/lib').toString(), label: 'lib', displayKind: 'directory' },
				{
					type: MessageAttachmentKind.Resource,
					uri: expectedSelectionUri.toString(),
					label: 'selection',
					displayKind: 'selection',
					selection: {
						range: {
							start: { line: 1, character: 2 },
							end: { line: 3, character: 4 },
						},
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					label: 'Feedback',
					modelRepresentation: 'Feedback text for the model',
					displayKind: AgentFeedbackAttachmentDisplayKind,
					_meta: {
						[AgentFeedbackAttachmentMetadataKey]: {
							sessionResource: 'agent-host-copilot:/new-turntest',
							feedbackItems: [{
								id: 'feedback-1',
								text: 'Please simplify this.',
								resourceUri: feedbackUri.toString(),
								range: {
									start: { line: 5, character: 0 },
									end: { line: 5, character: 7 },
								},
							}],
						},
					},
				},
			]);
		}));

		test('does not rebase when requested and resolved working dirs match', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const dir = URI.file('/source');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => dir },
			});
			agentHostService.nextResolvedWorkingDirectory = dir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'no rebase',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'a.ts', value: URI.file('/source/a.ts') }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/source/a.ts').toString(), label: 'a.ts', displayKind: 'document' },
			]);
		}));

		test('attachments outside the requested working dir pass through unchanged', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const requestedDir = URI.file('/source');
			const resolvedDir = URI.file('/worktree');
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				workingDirectoryResolver: { resolve: () => requestedDir },
			});
			agentHostService.nextResolvedWorkingDirectory = resolvedDir;

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, {
				message: 'outside',
				variables: {
					variables: [
						upcastPartial({ kind: 'file', id: 'v-file', name: 'elsewhere.ts', value: URI.file('/elsewhere/elsewhere.ts') }),
					],
				},
			});
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.turnActions.length, 1);
			const turnAction = agentHostService.turnActions[0].action as ITurnStartedAction;
			assert.deepStrictEqual(turnAction.message.attachments, [
				{ type: MessageAttachmentKind.Resource, uri: URI.file('/elsewhere/elsewhere.ts').toString(), label: 'elsewhere.ts', displayKind: 'document' },
			]);
		}));
	});

	// ---- AgentHostContribution discovery ---------------------------------

	suite('dynamic discovery', () => {

		test('setting gate prevents registration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService } = createTestServices(disposables);
			instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: false });

			const contribution = disposables.add(instantiationService.createInstance(AgentHostContribution));
			// Contribution should exist but not have registered any agents
			assert.ok(contribution);
			// Let async work settle
			await timeout(10);
		}));

		test('local agent contribution advertises image attachments', () => {
			const { instantiationService, agentHostService, chatSessionContributions, chatSessionItemControllers } = createTestServices(disposables);
			disposables.add(instantiationService.createInstance(AgentHostContribution));

			agentHostService.setRootState({
				agents: [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', models: [] }],
				activeSessions: 0,
			});

			assert.deepStrictEqual(chatSessionContributions.map(c => ({ type: c.type, supportsImageAttachments: c.capabilities?.supportsImageAttachments })), [
				{ type: 'agent-host-copilot', supportsImageAttachments: true },
			]);
			assert.deepStrictEqual(chatSessionItemControllers.map(c => c.type), []);
		});

		test('session list contribution registers item controller in editor window', () => {
			const { instantiationService, agentHostService, chatSessionItemControllers } = createTestServices(disposables);
			disposables.add(instantiationService.createInstance(AgentHostSessionListContribution));

			agentHostService.setRootState({
				agents: [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', models: [] }],
				activeSessions: 0,
			});

			assert.deepStrictEqual(chatSessionItemControllers.map(c => c.type), ['agent-host-copilot']);
		});

		test('session list contribution does not register item controller in sessions window', () => {
			const { instantiationService, agentHostService, chatSessionItemControllers } = createTestServices(disposables, undefined, undefined, undefined, undefined, true);
			disposables.add(instantiationService.createInstance(AgentHostSessionListContribution));

			agentHostService.setRootState({
				agents: [{ provider: 'copilot' as const, displayName: 'Agent Host - Copilot', description: 'test', models: [] }],
				activeSessions: 0,
			});

			assert.deepStrictEqual(chatSessionItemControllers.map(c => c.type), []);
		});

		test('local agent contribution uses advertised display name', () => {
			const services = createTestServices(disposables);
			disposables.add(services.instantiationService.createInstance(AgentHostContribution));

			services.agentHostService.setRootState({
				agents: [{ provider: 'testagent', displayName: 'Test Agent', description: 'test', models: [] }],
				activeSessions: 0,
			});

			assert.strictEqual(services.chatSessionContributions[0].displayName, 'Test Agent');
		});
	});

	// ---- IAgentConnection unification -------------------------------------

	suite('IAgentConnection config', () => {

		test('handler uses custom extensionId from config', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'remote-test-copilot',
				sessionType: 'remote-test-copilot',
				fullName: 'Remote Copilot',
				description: 'Remote agent',
				connection: agentHostService,
				connectionAuthority: 'local',
				extensionId: 'vscode.remote-agent-host',
				extensionDisplayName: 'Remote Agent Host',
			}));

			const registered = chatAgentService.registeredAgents.get('remote-test-copilot');
			assert.ok(registered);
			assert.strictEqual(registered.data.extensionId.value, 'vscode.remote-agent-host');
			assert.strictEqual(registered.data.extensionDisplayName, 'Remote Agent Host');
		});

		test('handler defaults extensionId when not provided', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'default-ext-test',
				sessionType: 'default-ext-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const registered = chatAgentService.registeredAgents.get('default-ext-test');
			assert.ok(registered);
			assert.strictEqual(registered.data.extensionId.value, 'vscode.agent-host');
			assert.strictEqual(registered.data.extensionDisplayName, 'Agent Host');
		});

		test('handler uses resolveWorkingDirectory callback', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-test',
				sessionType: 'workdir-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
				resolveWorkingDirectory: () => URI.file('/custom/working/dir'),
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-test' });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), URI.file('/custom/working/dir').toString());
		}));

		test('handler forwards request session config to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'config-test',
				sessionType: 'config-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const { turnPromise, session, turnId, fire } = await startDynamicAgentTurn(chatAgentService, agentHostService, 'config-test', { message: 'Add Agent Host session configuration flow', agentHostSessionConfig: config });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.deepStrictEqual(agentHostService.createSessionCalls[0].config, config);
		}));

		test('handler forwards request session config via SessionConfigChanged on eager-create path', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			// Pre-seed an eagerly-created backend session so the handler
			// hits the eager-create branch in `_invokeAgent` (the one that
			// dispatches `SessionConfigChanged` instead of calling
			// `createSession` with the config inline).
			const sessionUri = AgentSession.uri('copilot', 'eager-config');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/eager-config' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const config = { isolation: 'worktree', branch: 'main' };
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Fix worktree branch hint propagation', sessionResource, agentHostSessionConfig: config }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const turnDispatch = agentHostService.turnActions[0];
			const turnAction = turnDispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: turnDispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: turnDispatch.clientSeq } });
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: turnAction.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			const configChanged = agentHostService.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged);
			assert.ok(configChanged, 'expected a SessionConfigChanged dispatch');
			assert.deepStrictEqual((configChanged!.action as { config: Record<string, unknown> }).config, config);
		}));

		test('handler does not clobber picker-set session config on eager-create path', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Repro for the VS Code chat-input picker bug: the user picks
			// "Worktree" via the chip, the picker dispatches
			// SessionConfigChanged({ isolation: 'worktree' }) directly
			// against the provisional backend, then sends a message. The
			// handler's eager-create branch must NOT overwrite that with
			// the workbench default (`isolation: 'folder'`) and must NOT
			// use replace-semantics. The Agents window flow (where
			// `agentHostSessionConfig` is supplied on the request) must
			// still continue to work.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'eager-picker');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [],
				config: {
					schema: { type: 'object', properties: {} },
					values: { isolation: 'worktree' },
				},
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/eager-picker' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			// No `agentHostSessionConfig` on the request — this models the
			// VS Code workbench path where the picker dispatches directly.
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Pick worktree and send', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const turnDispatch = agentHostService.turnActions[0];
			const turnAction = turnDispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: turnDispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: turnDispatch.clientSeq } });
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: turnAction.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			const configChanged = agentHostService.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged) as { action: { config: Record<string, unknown>; replace?: boolean } } | undefined;
			// Either no dispatch (preferred) or a dispatch that does NOT
			// include `isolation` and is NOT a replace.
			if (configChanged) {
				assert.strictEqual(configChanged.action.replace, undefined, 'must not use replace-semantics for picker-set state');
				assert.ok(!Object.prototype.hasOwnProperty.call(configChanged.action.config, 'isolation'), `picker-set isolation must not be overwritten, got ${JSON.stringify(configChanged.action.config)}`);
			}
		}));

		test('handler awaits in-flight eager createSession before falling through to a duplicate create (issue #319764)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Repro for the worktree-vs-folder race: the sessions provider's `eagerCreate` IIFE has fired
			// `createSession` (~0.5-1s, reads git state) but its continuation hasn't yet opened the state
			// subscription. If `_invokeAgent` peeks at the unmanaged subscription right now it would find nothing
			// and fall through to `_createAndSubscribe`, racing a second `createSession` that ends up clobbering
			// the user's `folder` pick with the host default `worktree`. The fix gates the peek on
			// `getInflightSessionCreate` so the IIFE's continuation runs first and opens the subscription.
			const { agentHostService, chatAgentService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'new-race');
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-race' });

			// Seed the state the eager-created session will hydrate to once its subscription opens. This is what
			// the IIFE will surface via `getSubscription` in step (3) below.
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Test', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [],
			});

			// (1) Model the in-flight eager createSession.
			let resolveInflight!: () => void;
			const inflight = new Promise<void>(r => { resolveInflight = r; });
			agentHostService.inflightCreates.set(sessionUri.toString(), inflight);

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'go', sessionResource, agentHostSessionConfig: { isolation: 'folder' } }),
				() => { }, [], CancellationToken.None,
			);

			// (2) Yield microtasks. The handler should be parked on `await inflight` — no createSession fired yet.
			await timeout(0);
			assert.strictEqual(agentHostService.createSessionCalls.length, 0, 'handler must not fall through to createSession while eager create is in flight');

			// (3) Mimic the eagerCreate IIFE's continuation: open the subscription, then resolve the inflight.
			disposables.add(agentHostService.getSubscription(StateComponents.Session, sessionUri));
			resolveInflight();

			// (4) Drive the turn to completion. Handler should take the eager-create branch and NOT call createSession.
			await timeout(10);
			const turnDispatch = agentHostService.turnActions[0];
			const turnAction = turnDispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: turnDispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: turnDispatch.clientSeq } });
			agentHostService.fireAction({ channel: turnDispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: turnAction.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 0, 'no duplicate createSession should have been issued; eager-create branch should have been taken');
			const configChanged = agentHostService.dispatchedActions.find(d => d.action.type === ActionType.SessionConfigChanged);
			assert.ok(configChanged, 'eager-create branch should have dispatched SessionConfigChanged with the user pick');
			assert.deepStrictEqual((configChanged!.action as { config: Record<string, unknown> }).config, { isolation: 'folder' });
		}));

		test('handler uses registered working directory resolver', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const resolvedWorkingDirectory = URI.file('/resolved/working/dir');
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables, {
				resolve: () => resolvedWorkingDirectory,
			});

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-resolver-test',
				sessionType: 'workdir-resolver-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-resolver-test' });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), resolvedWorkingDirectory.toString());
		}));

		test('handler passes vscode-agent-host URI as-is to createSession', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			// The workspace repository URI in the Sessions app is a
			// vscode-agent-host:// URI. It must be passed through unchanged
			// because the connection's createSession already converts it via
			// fromAgentHostUri before sending to the remote server.
			const agentHostUri = URI.from({
				scheme: 'vscode-agent-host',
				authority: 'my-server',
				path: '/home/user/project',
				query: '_ah=eyJzY2hlbWUiOiJmaWxlIn0',
			});

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'workdir-agenthost-test',
				sessionType: 'workdir-agenthost-test',
				fullName: 'Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'my-server',
				resolveWorkingDirectory: () => agentHostUri,
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, { agentId: 'workdir-agenthost-test' });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			assert.strictEqual(agentHostService.createSessionCalls.length, 1);
			assert.strictEqual(agentHostService.createSessionCalls[0].workingDirectory?.toString(), agentHostUri.toString());
		}));

		test('list controller includes description in items', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = createSessionListController(disposables, instantiationService, agentHostService, 'remote-test', 'copilot', 'My Remote Host');

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-1'), startTime: 1000, modifiedTime: 2000, summary: 'Test session' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, 'My Remote Host');
		});

		test('list controller omits description when undefined', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = createSessionListController(disposables, instantiationService, agentHostService);

			agentHostService.addSession({ session: AgentSession.uri('copilot', 'sess-2'), startTime: 1000, modifiedTime: 2000, summary: 'Test' });
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.strictEqual(controller.items[0].description, undefined);
		});

		test('list controller surfaces only working directory in metadata (git state is now per-session state, not summary)', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);

			const controller = createSessionListController(disposables, instantiationService, agentHostService);

			const workingDirectory = URI.file('/repo/work');
			agentHostService.addSession({
				session: AgentSession.uri('copilot', 'sess-git'),
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'With git',
				workingDirectory,
			});
			await controller.refresh(CancellationToken.None);

			assert.strictEqual(controller.items.length, 1);
			assert.deepStrictEqual(controller.items[0].metadata, {
				workingDirectoryPath: workingDirectory.fsPath,
			});
		});

		test('handler works with any IAgentConnection, not just IAgentHostService', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);

			// Create handler with agentHostService as IAgentConnection (not IAgentHostService)
			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'connection-test',
				sessionType: 'connection-test',
				fullName: 'Connection Test',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			// Verify it registered an agent
			assert.ok(chatAgentService.registeredAgents.has('connection-test'));

			// Verify it can run a turn through the IAgentConnection path
			const { turnPromise, turnId, fire } = await startTurn(handler, agentHostService, chatAgentService, disposables, {
				message: 'Test message',
				agentId: 'connection-test',
			});

			fire({ type: 'chat/delta', turnId, content: 'Response' } as ChatAction);
			fire({ type: 'chat/turnComplete', turnId } as ChatAction);
			await turnPromise;

			// Turn dispatched via connection.dispatchAction
			assert.strictEqual(agentHostService.turnActions.length, 1);
			assert.strictEqual((agentHostService.turnActions[0].action as ITurnStartedAction).message.text, 'Test message');
		}));
	});

	// ---- Reconnection to active turn ----------------------------------------

	suite('reconnection to active turn', () => {

		function makeSessionStateWithActiveTurn(sessionUri: string, overrides?: Partial<{ streamingText: string; reasoning: string; systemNotification: string }>): SeededSessionState {
			const summary: SessionSummary = {
				resource: sessionUri,
				provider: 'copilot',
				title: 'Active Session',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			const activeTurnParts = [];
			const reasoningText = overrides?.reasoning ?? '';
			if (reasoningText) {
				activeTurnParts.push({ kind: ResponsePartKind.Reasoning as const, id: 'reasoning-1', content: reasoningText });
			}
			if (overrides?.systemNotification) {
				activeTurnParts.push({ kind: ResponsePartKind.SystemNotification as const, content: overrides.systemNotification });
			}
			activeTurnParts.push({ kind: ResponsePartKind.Markdown as const, id: 'md-active', content: overrides?.streamingText ?? 'Partial response so far' });
			return {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-completed',
					message: { text: 'First message', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown as const, id: 'md-1', content: 'First response' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
				activeTurn: {
					...createActiveTurn('turn-active', { text: 'Second message', origin: { kind: MessageKind.User } }),
					responseParts: activeTurnParts,
				},
			};
		}

		test('loads completed turns as history and active turn request/response', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-1');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-1' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			// Should have: completed turn (request + response) + active turn (request + empty response) = 4
			assert.strictEqual(session.history.length, 4);
			assert.strictEqual(session.history[0].type, 'request');
			if (session.history[0].type === 'request') {
				assert.strictEqual(session.history[0].prompt, 'First message');
			}
			assert.strictEqual(session.history[2].type, 'request');
			if (session.history[2].type === 'request') {
				assert.strictEqual(session.history[2].prompt, 'Second message');
			}
			// Active turn response should be an empty placeholder
			assert.strictEqual(session.history[3].type, 'response');
			if (session.history[3].type === 'response') {
				assert.strictEqual(session.history[3].parts.length, 0);
			}
		});

		test('sets isCompleteObs to false and populates progressObs for active turn', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-2');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-2' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.isCompleteObs?.get(), false, 'Should not be complete when active turn exists');
			const progress = session.progressObs?.get() ?? [];
			assert.ok(progress.length > 0, 'Should have initial progress from active turn');
			// Should contain the streaming text as markdown
			const markdownPart = progress.find(p => p.kind === 'markdownContent') as IChatMarkdownContent | undefined;
			assert.ok(markdownPart, 'Should have markdown content from streaming text');
			assert.strictEqual(markdownPart!.content.value, 'Partial response so far');
		});

		test('does not duplicate system notification progress when reconnecting', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);
			const sessionUri = AgentSession.uri('copilot', 'reconnect-system-notification');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString(), {
				systemNotification: 'Background command completed',
			}));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-system-notification' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const notifications = (session.progressObs?.get() ?? []).filter(part => part.kind === 'systemNotification');
			assert.deepStrictEqual(notifications.map(part => part.content.value), ['Background command completed']);
		});

		test('provides interruptActiveResponseCallback when reconnecting', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-3');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-3' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.ok(session.interruptActiveResponseCallback, 'Should provide interrupt callback');
		});

		test('interrupt callback dispatches turnCancelled action', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-cancel');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-cancel' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.ok(session.interruptActiveResponseCallback);
			const result = await session.interruptActiveResponseCallback!();
			assert.strictEqual(result, true);

			// Should have dispatched a turnCancelled action
			const cancelAction = agentHostService.dispatchedActions.find(d => d.action.type === 'chat/turnCancelled');
			assert.ok(cancelAction, 'Should dispatch session/turnCancelled');
		});

		test('streams new text deltas into progressObs after reconnection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-stream');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString(), { streamingText: 'Before' });
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-stream' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const initialLen = (session.progressObs?.get() ?? []).length;

			// Fire a delta action to simulate the server streaming more text
			agentHostService.fireAction({
				channel: sessionUri.toString(), action: { type: 'chat/delta', turnId: 'turn-active', partId: 'md-active', content: ' and more' } as ChatAction,
				serverSeq: 1,
				origin: undefined,
			});

			await timeout(10);

			const progress = session.progressObs?.get() ?? [];
			assert.ok(progress.length > initialLen, 'Should have appended new progress items');
			// The last markdown part should be the delta
			const lastMarkdown = [...progress].reverse().find(p => p.kind === 'markdownContent') as IChatMarkdownContent;
			assert.ok(lastMarkdown, 'Should have a new markdown delta');
			assert.strictEqual(lastMarkdown.content.value, ' and more');
		}));

		test('marks session complete when turn finishes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-complete');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString()));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-complete' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.isCompleteObs?.get(), false);

			// Fire turnComplete to finish the active turn
			agentHostService.fireAction({
				channel: sessionUri.toString(), action: { type: 'chat/turnComplete', turnId: 'turn-active' } as ChatAction,
				serverSeq: 1,
				origin: undefined,
			});

			await timeout(10);

			assert.strictEqual(session.isCompleteObs?.get(), true, 'Should be complete after turnComplete');
		}));

		test('handles active turn with running tool call', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-tool');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
			sessionState.activeTurn!.responseParts.push({
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					toolCallId: 'tc-running',
					toolName: 'bash',
					displayName: 'Bash',
					invocationMessage: 'Running command',
					status: ToolCallStatus.Running,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-tool' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const toolInvocation = progress.find(p => p.kind === 'toolInvocation') as IChatToolInvocation | undefined;
			assert.ok(toolInvocation, 'Should have a live tool invocation in progress');
			assert.strictEqual(toolInvocation!.toolCallId, 'tc-running');
		});

		test('handles active turn with pending tool confirmation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-perm');
			const sessionState = makeSessionStateWithActiveTurn(sessionUri.toString());
			sessionState.activeTurn!.responseParts.push({
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					toolCallId: 'tc-pending',
					toolName: 'bash',
					displayName: 'Bash',
					invocationMessage: 'Run command',
					confirmationTitle: 'Clean up',
					toolInput: 'rm -rf /tmp/test',
					status: ToolCallStatus.PendingConfirmation,
				},
			});
			agentHostService.sessionStates.set(sessionUri.toString(), sessionState);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-perm' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const permInvocation = progress.find(p => p.kind === 'toolInvocation') as IChatToolInvocation | undefined;
			assert.ok(permInvocation, 'Should have a live permission request in progress');

			// Complete the turn so the awaitConfirmation promise and its internal
			// DisposableStore are cleaned up before test teardown.
			agentHostService.fireAction({
				channel: sessionUri.toString(), action: { type: 'chat/turnComplete', turnId: 'turn-active' } as ChatAction,
				serverSeq: 1,
				origin: undefined,
			});
			await timeout(10);
		}));

		test('no active turn loads completed history only with isComplete true', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'no-active-turn');
			agentHostService.sessionStates.set(sessionUri.toString(), {
				...createSessionState({ resource: sessionUri.toString(), provider: 'copilot', title: 'Done', status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }),
				lifecycle: SessionLifecycle.Ready,
				turns: [{
					id: 'turn-done',
					message: { text: 'Hello', origin: { kind: MessageKind.User } },
					responseParts: [{ kind: ResponsePartKind.Markdown as const, id: 'md-1', content: 'Hi' }],
					usage: undefined,
					state: TurnState.Complete,
				}],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/no-active-turn' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			assert.strictEqual(session.history.length, 2);
			assert.strictEqual(session.isCompleteObs?.get(), true);
			assert.deepStrictEqual(session.progressObs?.get(), []);
		});

		test('includes reasoning in initial progress', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionUri = AgentSession.uri('copilot', 'reconnect-reasoning');
			agentHostService.sessionStates.set(sessionUri.toString(), makeSessionStateWithActiveTurn(sessionUri.toString(), {
				streamingText: 'text',
				reasoning: 'Let me think...',
			}));

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/reconnect-reasoning' });
			const session = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => session.dispose()));

			const progress = session.progressObs?.get() ?? [];
			const thinking = progress.find(p => p.kind === 'thinking');
			assert.ok(thinking, 'Should have thinking progress from reasoning');
			const markdown = progress.find(p => p.kind === 'markdownContent') as IChatMarkdownContent;
			assert.ok(markdown);
			assert.strictEqual(markdown.content.value, 'text');
		});
	});

	// ---- Server-initiated turns -------------------------------------------

	suite('server-initiated turns', () => {
		function createPendingChatModel(sessionResource: URI, pendingRequests: IChatPendingRequest[]): { model: IChatModel; firePendingRequestsChanged(): void } {
			const onDidChangePendingRequests = disposables.add(new Emitter<void>());
			return {
				model: upcastPartial<IChatModel>({
					sessionResource,
					onDidChangePendingRequests: onDidChangePendingRequests.event,
					getPendingRequests: () => pendingRequests,
				}),
				firePendingRequestsChanged: () => onDidChangePendingRequests.fire(),
			};
		}

		test('syncs queued messages added to restored active sessions', async () => {
			const { sessionHandler, agentHostService, chatService } = createContribution(disposables);

			const backendSession = AgentSession.uri('copilot', 'restored-pending-sync');
			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.InProgress,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				activeTurn: createActiveTurn('active-turn-1', { text: 'Working', origin: { kind: MessageKind.User } }),
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/restored-pending-sync' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const pendingRequests: IChatPendingRequest[] = [];
			const chatModel = createPendingChatModel(sessionResource, pendingRequests);
			chatService.setSession(sessionResource, chatModel.model);

			agentHostService.dispatchedActions.length = 0;
			const text = 'Run the queued follow-up';
			const request = upcastPartial<IChatRequestModel>({ id: 'queued-request-1', message: { text, parts: [] } });
			pendingRequests.push({ request, kind: ChatRequestQueueKind.Queued, sendOptions: {} });
			chatModel.firePendingRequestsChanged();

			const action = agentHostService.dispatchedActions.map(d => d.action).find((action): action is Extract<SessionAction, { type: ActionType.ChatPendingMessageSet }> => action.type === ActionType.ChatPendingMessageSet);
			assert.ok(action, 'queued message should be dispatched to the agent host');
			assert.deepStrictEqual(action, {
				type: ActionType.ChatPendingMessageSet,
				kind: 'queued',
				id: 'queued-request-1',
				message: { text, origin: { kind: MessageKind.User } },
			});
		});

		test('syncs text updates for existing queued pending messages', async () => {
			const { sessionHandler, agentHostService, chatService } = createContribution(disposables);

			const backendSession = AgentSession.uri('copilot', 'pending-text-update');
			agentHostService.sessionStates.set(backendSession.toString(), {
				...createSessionState({
					resource: backendSession.toString(),
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				}),
				lifecycle: SessionLifecycle.Ready,
				queuedMessages: [{ id: 'queued-request-1', message: { text: 'old queued text', origin: { kind: MessageKind.User } } }],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/pending-text-update' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			agentHostService.dispatchedActions.length = 0;
			const text = 'new queued text';
			const pendingRequests: IChatPendingRequest[] = [{
				request: upcastPartial<IChatRequestModel>({ id: 'queued-request-1', message: { text, parts: [] } }),
				kind: ChatRequestQueueKind.Queued,
				sendOptions: {},
			}];
			const chatModel = createPendingChatModel(sessionResource, pendingRequests);
			chatService.setSession(sessionResource, chatModel.model);

			const action = agentHostService.dispatchedActions.map(d => d.action).find((action): action is Extract<SessionAction, { type: ActionType.ChatPendingMessageSet }> => action.type === ActionType.ChatPendingMessageSet);
			assert.ok(action, 'queued message text update should be dispatched to the agent host');
			assert.deepStrictEqual(action, {
				type: ActionType.ChatPendingMessageSet,
				kind: 'queued',
				id: 'queued-request-1',
				message: { text, origin: { kind: MessageKind.User } },
			});
		});

		test('detects server-initiated turn and fires onDidStartServerRequest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			// Create and subscribe a session
			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-turn' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Hello', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			// Echo + complete the first turn
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Now simulate a server-initiated turn (e.g. from a consumed queued message)
			const serverTurnId = 'server-turn-1';
			const serverRequestEvents: { prompt: string }[] = [];
			disposables.add(chatSession.onDidStartServerRequest!(e => serverRequestEvents.push(e)));

			agentHostService.fireAction({
				channel: session,
				action: {
					type: 'chat/turnStarted',
					turnId: serverTurnId,
					message: { text: 'queued message text', origin: { kind: MessageKind.User } },
				} as ChatAction,
				serverSeq: 3,
				origin: undefined, // Server-originated — no client origin
			});

			await timeout(10);

			// onDidStartServerRequest should have fired
			assert.strictEqual(serverRequestEvents.length, 1);
			assert.strictEqual(serverRequestEvents[0].prompt, 'queued message text');

			// isCompleteObs should be false (turn in progress)
			assert.strictEqual(chatSession.isCompleteObs!.get(), false);
		}));

		test('server-initiated turn streams progress through progressObs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-progress' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// Normal turn to create backend session
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-progress';
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnStarted', session, turnId: serverTurnId, message: { text: 'auto queued', origin: { kind: MessageKind.User } } } as ChatAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Stream a response part + delta
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-srv', content: 'Hello ' } } as ChatAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/delta', session, turnId: serverTurnId, partId: 'md-srv', content: 'world' } as ChatAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(50);

			// Progress should be in progressObs
			const progress = chatSession.progressObs!.get();
			const markdownParts = progress.filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'Hello world');

			// Complete the turn
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnComplete', session, turnId: serverTurnId } as ChatAction,
				serverSeq: 6, origin: undefined,
			});
			await timeout(10);

			assert.strictEqual(chatSession.isCompleteObs!.get(), true);
		}));

		test('disposing chat session does not call disposeSession on connection', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/existing-session-1' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// Dispose the chat session (simulates user navigating away)
			chatSession.dispose();

			// disposeSession must NOT be called — the backend session should persist
			assert.strictEqual(agentHostService.disposedSessions.length, 0,
				'Disposing the UI chat session should not dispose the backend session');
		});

		test('client-dispatched turns are not treated as server-initiated', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-no-dupe' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const serverRequestEvents: { prompt: string }[] = [];
			disposables.add(chatSession.onDidStartServerRequest!(e => serverRequestEvents.push(e)));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// Normal client turn — should NOT fire onDidStartServerRequest
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Client turn', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch = agentHostService.turnActions[0];
			const action = dispatch.action as ITurnStartedAction;
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: dispatch.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId: action.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turnPromise;

			assert.strictEqual(serverRequestEvents.length, 0, 'Client-dispatched turns should not trigger onDidStartServerRequest');
		}));

		test('server-initiated turn does not duplicate tool calls on repeated state changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-tool-dedup' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Server-initiated turn
			const serverTurnId = 'server-turn-tool-dedup';
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnStarted', session, turnId: serverTurnId, message: { text: 'queued', origin: { kind: MessageKind.User } } } as ChatAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Tool start + ready (auto-confirmed)
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/toolCallStart', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', toolName: 'bash', displayName: 'Bash' } as ChatAction,
				serverSeq: 4, origin: undefined,
			});
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/toolCallReady', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', invocationMessage: 'Running Bash', confirmed: 'not-needed' } as ChatAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(50);

			// Tool complete
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/toolCallComplete', session, turnId: serverTurnId, toolCallId: 'tc-srv-1', result: { success: true, pastTenseMessage: 'Ran Bash' } } as ChatAction,
				serverSeq: 6, origin: undefined,
			});
			await timeout(50);

			// Fire additional state changes that might cause re-processing
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-after', content: 'Done.' } } as ChatAction,
				serverSeq: 7, origin: undefined,
			});
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnComplete', session, turnId: serverTurnId } as ChatAction,
				serverSeq: 8, origin: undefined,
			});
			await timeout(50);

			// Count tool invocations in progressObs — should be exactly 1
			const progress = chatSession.progressObs!.get();
			const toolInvocations = progress.filter(p => p.kind === 'toolInvocation');
			assert.strictEqual(toolInvocations.length, 1, 'Tool call should not be duplicated');
		}));

		test('server-initiated turn picks up markdown arriving with turnStarted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-server-md-initial' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			// Clear lifecycle actions so only turn dispatches are counted
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;

			// First, do a normal turn so the backend session is created
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Fire turnStarted followed immediately by a response part.
			// In production, these can arrive in rapid succession from the
			// WebSocket, and the immediate reconciliation in
			// _trackServerTurnProgress ensures content already in the state
			// is not missed.
			const serverTurnId = 'server-turn-md-initial';
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnStarted', session, turnId: serverTurnId, message: { text: 'queued', origin: { kind: MessageKind.User } } } as ChatAction,
				serverSeq: 3, origin: undefined,
			});
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/responsePart', session, turnId: serverTurnId, part: { kind: 'markdown', id: 'md-init', content: 'Initial text' } } as ChatAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(50);

			// The markdown should appear in progressObs
			const progress = chatSession.progressObs!.get();
			const markdownParts = progress.filter((p): p is IChatMarkdownContent => p.kind === 'markdownContent');
			const totalContent = markdownParts.map(p => p.content.value).join('');
			assert.strictEqual(totalContent, 'Initial text', 'Markdown arriving with/right after turnStarted should be picked up');

			// Complete the turn
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnComplete', session, turnId: serverTurnId } as ChatAction,
				serverSeq: 5, origin: undefined,
			});
			await timeout(10);

			assert.strictEqual(chatSession.isCompleteObs!.get(), true);
		}));

		test('removes consumed queued message from chat model when server-initiated turn appears', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-queue-removal' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			agentHostService.dispatchedActions.length = 0;

			// First, do a normal turn so the backend session exists.
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Add a queued message to the protocol state so it's tracked.
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/pendingMessageSet', session, kind: 'queued', id: 'q-1', message: { text: 'will be consumed', origin: { kind: MessageKind.User } } } as ChatAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);

			// Now the server consumes it: a server-initiated turn appears
			// and the queued message disappears in the same state change.
			chatService.removePendingRequestCalls.length = 0;
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/turnStarted', session, turnId: 'server-turn-q', message: { text: 'will be consumed', origin: { kind: MessageKind.User } }, queuedMessageId: 'q-1' } as ChatAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(10);

			// The handler should have removed the consumed queued request from the chat model.
			const removedQueueIds = chatService.removePendingRequestCalls.filter(c => c.requestId === 'q-1');
			assert.strictEqual(removedQueueIds.length, 1, 'consumed queued message should be removed from chat model');
		}));

		test('removes steering message from chat model when steering id changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService, chatService } = createContribution(disposables);

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/new-steering-removal' });
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			agentHostService.dispatchedActions.length = 0;

			// Backend session is created via a normal turn.
			const turn1Promise = registered.impl.invoke(
				makeRequest({ message: 'Init', sessionResource }),
				() => { }, [], CancellationToken.None,
			);
			await timeout(10);
			const dispatch1 = agentHostService.turnActions[0];
			const action1 = dispatch1.action as ITurnStartedAction;
			const session = dispatch1.channel.toString();
			agentHostService.fireAction({ channel: dispatch1.channel.toString(), action: dispatch1.action, serverSeq: 1, origin: { clientId: agentHostService.clientId, clientSeq: dispatch1.clientSeq } });
			agentHostService.fireAction({ channel: session, action: { type: 'chat/turnComplete', session, turnId: action1.turnId } as ChatAction, serverSeq: 2, origin: undefined });
			await turn1Promise;

			// Set a steering message on the protocol state.
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/pendingMessageSet', session, kind: 'steering', id: 'steer-1', message: { text: 'be more careful', origin: { kind: MessageKind.User } } } as ChatAction,
				serverSeq: 3, origin: undefined,
			});
			await timeout(10);
			chatService.removePendingRequestCalls.length = 0;

			// Steering message is consumed by the agent.
			agentHostService.fireAction({
				channel: session,
				action: { type: 'chat/pendingMessageRemoved', session, kind: 'steering', id: 'steer-1' } as ChatAction,
				serverSeq: 4, origin: undefined,
			});
			await timeout(10);

			const removed = chatService.removePendingRequestCalls.filter(c => c.requestId === 'steer-1');
			assert.strictEqual(removed.length, 1, 'previously-set steering message should be removed from chat model when it is cleared');
		}));
	});

	// ---- Customizations dispatch ------------------------------------------

	suite('customizations', () => {

		test('dispatches activeClientSet when a new session is created', async () => {
			const { instantiationService, agentHostService, chatAgentService, seedActiveClient } = createTestServices(disposables);

			const customizations = observableValue<ClientPluginCustomization[]>('customizations', [
				{ type: CustomizationType.Plugin, id: 'file:///plugin-a', uri: 'file:///plugin-a', name: 'Plugin A', enabled: true },
			]);
			disposables.add(seedActiveClient('agent-host-copilot', { customizations }));

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			// The active-client claim is now threaded through createSession
			// rather than dispatched separately, so assert on createSessionCalls.
			const createCall = agentHostService.createSessionCalls.at(-1);
			assert.ok(createCall?.activeClient, 'createSession should carry activeClient');
			assert.strictEqual(createCall!.activeClient!.clientId, agentHostService.clientId);
			assert.ok(Array.isArray(createCall!.activeClient!.tools), 'activeClient.tools should be a defined array');
			assert.strictEqual(createCall!.activeClient!.customizations?.length, 1);
			assert.strictEqual(createCall!.activeClient!.customizations?.[0].uri, 'file:///plugin-a');
		});

		test('re-dispatches activeClientSet when customizations observable changes', async () => {
			const { instantiationService, agentHostService, chatAgentService, seedActiveClient } = createTestServices(disposables);

			const customizations = observableValue<ClientPluginCustomization[]>('customizations', []);
			disposables.add(seedActiveClient('agent-host-copilot', { customizations }));

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			// Create a session first
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			agentHostService.dispatchedActions.length = 0;

			// Update customizations
			customizations.set([
				{ type: CustomizationType.Plugin, id: 'file:///plugin-b', uri: 'file:///plugin-b', name: 'Plugin B', enabled: true },
			], undefined);

			const activeClientAction = agentHostService.dispatchedActions.find(
				d => d.action.type === 'session/activeClientSet'
			);
			assert.ok(activeClientAction, 'should re-dispatch activeClientSet on change');
			const ac = activeClientAction!.action as { activeClient: { customizations?: ClientPluginCustomization[] } };
			assert.strictEqual(ac.activeClient.customizations?.length, 1);
			assert.strictEqual(ac.activeClient.customizations?.[0].uri, 'file:///plugin-b');
		});

		test('does not dispatch activeClientSet when an existing session is restored and this client is already active', async () => {
			const { instantiationService, agentHostService } = createTestServices(disposables);
			const sessionResource = AgentSession.uri('copilot', 'existing-session');
			const summary: SessionSummary = {
				resource: sessionResource.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			agentHostService.sessionStates.set(sessionResource.toString(), {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [{
					clientId: agentHostService.clientId,
					tools: [],
					customizations: [],
				}],
			});

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));

			assert.strictEqual(
				agentHostService.dispatchedActions.filter(d => d.action.type === 'session/activeClientSet').length,
				0,
			);
		});

		test('dispatches activeClientSet on first turn when restoring a session where another client is active', async () => {
			const { instantiationService, agentHostService, chatAgentService } = createTestServices(disposables);
			const sessionResource = AgentSession.uri('copilot', 'existing-session');
			const summary: SessionSummary = {
				resource: sessionResource.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			agentHostService.sessionStates.set(sessionResource.toString(), {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [{
					clientId: 'other-client',
					tools: [],
				}],
			});

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			// Opening the session does NOT claim the active-client slot. The
			// claim is deferred to the first turn so simply browsing a
			// session in another window doesn't dispossess a client that's
			// actively running a turn there.
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));
			assert.strictEqual(
				agentHostService.dispatchedActions.filter(d => d.action.type === 'session/activeClientSet').length,
				0,
				'no dispatch expected on session open',
			);

			// Starting a turn claims active-client for this connection.
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const activeClientActions = agentHostService.dispatchedActions.filter(d => d.action.type === 'session/activeClientSet');
			assert.strictEqual(activeClientActions.length, 1);
			assert.strictEqual(activeClientActions[0].channel, sessionResource.toString());
		});

		test('dispatches activeClientSet on first turn when restoring a session where current client customizations are stale', async () => {
			const { instantiationService, agentHostService, chatAgentService, seedActiveClient } = createTestServices(disposables);
			const customizations = observableValue<ClientPluginCustomization[]>('customizations', [
				{ type: CustomizationType.Plugin, id: 'file:///plugin-new', uri: 'file:///plugin-new', name: 'Plugin New', enabled: true },
			]);
			disposables.add(seedActiveClient('agent-host-copilot', { customizations }));
			const sessionResource = AgentSession.uri('copilot', 'existing-session');
			const summary: SessionSummary = {
				resource: sessionResource.toString(),
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			agentHostService.sessionStates.set(sessionResource.toString(), {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeClients: [{
					clientId: agentHostService.clientId,
					tools: [],
					customizations: [{ type: CustomizationType.Plugin, id: 'file:///plugin-old', uri: 'file:///plugin-old', name: 'Plugin Old', enabled: true }],
				}],
			});

			const sessionHandler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Agent Host - Copilot',
				description: 'test',
				connection: agentHostService,
				connectionAuthority: 'local',
			}));

			// Opening the session does NOT re-claim with fresh customizations.
			const chatSession = await sessionHandler.provideChatSessionContent(sessionResource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));
			assert.strictEqual(
				agentHostService.dispatchedActions.filter(d => d.action.type === 'session/activeClientSet').length,
				0,
				'no dispatch expected on session open',
			);

			// The fresh customization set is published on first turn.
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables, { sessionResource });
			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const activeClientActions = agentHostService.dispatchedActions.filter(d => d.action.type === 'session/activeClientSet');
			assert.strictEqual(activeClientActions.length, 1);
			const activeClientAction = activeClientActions[0].action as { type: string; activeClient: { customizations?: ClientPluginCustomization[] } };
			assert.strictEqual(activeClientAction.type, 'session/activeClientSet');
			assert.deepStrictEqual(activeClientAction.activeClient.customizations, [
				{ type: CustomizationType.Plugin, id: 'file:///plugin-new', uri: 'file:///plugin-new', name: 'Plugin New', enabled: true },
			]);
		});
	});

	// ---- Subagent grouping ----------------------------------------------

	suite('subagent grouping', () => {

		/**
		 * Build a child session state containing a single inner tool call in the running state.
		 */
		function makeChildState(childUri: string, innerToolCallId: string, contributor?: ToolCallState['contributor']): SeededSessionState {
			const summary: SessionSummary = {
				resource: childUri,
				provider: 'copilot',
				title: 'Subagent',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			};
			const innerTool: ToolCallState = {
				toolCallId: innerToolCallId,
				toolName: 'read_file',
				displayName: 'Read File',
				status: ToolCallStatus.Running,
				invocationMessage: 'Reading file',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				contributor,
			} as ToolCallState;
			const activeTurn = createActiveTurn('child-turn-1', { text: 'do work', origin: { kind: MessageKind.User } });
			activeTurn.responseParts.push({ kind: ResponsePartKind.ToolCall, toolCall: innerTool });
			return {
				...createSessionState(summary),
				lifecycle: SessionLifecycle.Ready,
				activeTurn,
			};
		}

		test('inner subagent tool calls are forwarded with subAgentInvocationId set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			// Pre-populate the child subagent session state BEFORE the parent tool
			// call fires, so that when the handler subscribes to it the inner tool
			// is already present.
			const parentToolCallId = 'tc-parent-task';
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			const childSessionUri = buildSubagentChatUri(parentSession, parentToolCallId);
			agentHostService.sessionStates.set(childSessionUri, makeChildState(childSessionUri, 'tc-child-1'));

			// Fire the parent task tool call with toolKind=subagent metadata.
			fire({
				type: 'chat/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'do some work', subagentAgentName: 'helper' },
			} as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as ChatAction);
			fire({
				type: 'chat/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{ type: ToolResultContentType.Subagent, resource: childSessionUri, title: 'Subagent' }],
			} as ChatAction);

			// Allow the throttler/observation flow to flush.
			await timeout(50);

			// Flatten all progress emissions and find tool invocations.
			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');

			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);
			const child = toolInvocations.find(t => t.toolCallId === 'tc-child-1');

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent', 'parent should have subagent toolSpecificData');
			assert.strictEqual(parent!.subAgentInvocationId, undefined, 'parent should not have a subAgentInvocationId');
			assert.strictEqual((parent!.toolSpecificData as IChatSubagentToolInvocationData).isActive, true);

			assert.ok(child, 'inner child tool invocation should be forwarded into parent session progress');
			assert.strictEqual(child!.subAgentInvocationId, parentToolCallId, 'child should be tagged with parent tool call id for grouping');

			agentHostService.fireAction({
				channel: childSessionUri,
				action: { type: 'chat/turnComplete', turnId: 'child-turn-1' } as ChatAction,
				serverSeq: 1001,
				origin: undefined,
			});
			await timeout(50);
			assert.strictEqual((parent!.toolSpecificData as IChatSubagentToolInvocationData).isActive, false);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('inner subagent tool calls fired AFTER parent observation are also grouped', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);

			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const parentToolCallId = 'tc-parent-task';
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			const childSessionUri = buildSubagentChatUri(parentSession, parentToolCallId);
			agentHostService.sessionStates.set(childSessionUri, makeChildState(childSessionUri, 'tc-child-1'));

			// Fire the parent task tool — this should cause the handler to subscribe
			// to the (still-empty) child subagent session.
			fire({
				type: 'chat/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'do work', subagentAgentName: 'helper' },
			} as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as ChatAction);
			fire({
				type: 'chat/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{ type: ToolResultContentType.Subagent, resource: childSessionUri, title: 'Subagent' }],
			} as ChatAction);

			// Allow the subscription to be set up.
			await timeout(50);

			// NOW fire the child session lifecycle: turnStarted, then a tool call.
			const childTurnId = 'child-turn-1';
			const childToolCallId = 'tc-child-1';
			const fireChild = (action: SessionAction | ChatAction) => {
				agentHostService.fireAction({ channel: childSessionUri, action, serverSeq: 1000, origin: undefined });
			};
			fireChild({
				type: 'chat/turnStarted',
				turnId: childTurnId,
				message: { text: '', origin: { kind: MessageKind.User } },
			} as ChatAction);
			fireChild({
				type: 'chat/toolCallStart', session: childSessionUri, turnId: childTurnId,
				toolCallId: childToolCallId, toolName: 'read_file', displayName: 'Read File',
			} as ChatAction);
			fireChild({
				type: 'chat/toolCallReady', session: childSessionUri, turnId: childTurnId,
				toolCallId: childToolCallId, invocationMessage: 'Reading file',
				confirmed: 'not-needed',
			} as ChatAction);

			await timeout(50);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');

			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);
			const child = toolInvocations.find(t => t.toolCallId === childToolCallId);

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent');
			assert.strictEqual(parent!.subAgentInvocationId, undefined);

			assert.ok(child, 'child tool invocation fired after subscription should be forwarded');
			assert.strictEqual(child!.subAgentInvocationId, parentToolCallId, 'child should be tagged for grouping');
		}));

		test('client-provided subagent tool calls retain the parent grouping id', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let capturedSubagentInvocationId: string | undefined;
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, {
				languageModelToolsServiceOverride: {
					getToolByName: () => ({ id: 'vscode_readSkill', source: ToolDataSource.Internal, displayName: 'Read skill', modelDescription: 'Reads a skill' }),
					beginToolCall: options => {
						capturedSubagentInvocationId = options.subagentInvocationId;
						return undefined;
					},
				},
			});
			const { turnPromise, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);
			const parentToolCallId = 'tc-parent-task';
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			const childSessionUri = buildSubagentChatUri(parentSession, parentToolCallId);
			agentHostService.sessionStates.set(childSessionUri, makeChildState(childSessionUri, 'tc-child-skill', {
				kind: ToolCallContributorKind.Client,
				clientId: agentHostService.clientId,
			}));

			fire({
				type: 'chat/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'review code' },
			} as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as ChatAction);
			fire({
				type: 'chat/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{ type: ToolResultContentType.Subagent, resource: childSessionUri, title: 'Subagent' }],
			} as ChatAction);

			await timeout(50);
			assert.strictEqual(capturedSubagentInvocationId, parentToolCallId);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;
		}));

		test('parent subagent agentName is updated when subagent content arrives later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Repro for the missing-agent-name bug: when the parent task tool
			// fires without `subagentAgentName` in `_meta` (e.g. the agent host
			// did not extract it from args), the renderer should still pick up
			// the agent name once the SDK emits a `subagent_started` event,
			// which lands as a Subagent content block on the parent tool call.
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const { turnPromise, collected, session, turnId, fire } = await startTurn(sessionHandler, agentHostService, chatAgentService, disposables);

			const parentToolCallId = 'tc-parent-task';

			// Parent task tool fires WITHOUT subagentAgentName meta — only description.
			fire({
				type: 'chat/toolCallStart', session, turnId,
				toolCallId: parentToolCallId, toolName: 'task', displayName: 'Task',
				_meta: { toolKind: 'subagent', subagentDescription: 'Exploring codebase structure' },
			} as ChatAction);
			fire({
				type: 'chat/toolCallReady', session, turnId,
				toolCallId: parentToolCallId, invocationMessage: 'Spawning subagent',
				confirmed: 'not-needed',
			} as ChatAction);

			await timeout(50);

			// Now the SDK emits subagent_started → handler dispatches a content
			// change with a Subagent content block carrying the agent name.
			const parentSession = parseDefaultChatUri(session);
			assert.ok(parentSession);
			fire({
				type: 'chat/toolCallContentChanged', session, turnId,
				toolCallId: parentToolCallId,
				content: [{
					type: ToolResultContentType.Subagent,
					resource: buildSubagentChatUri(parentSession, parentToolCallId),
					title: 'Subagent',
					agentName: 'explore',
				}],
			} as ChatAction);

			await timeout(50);

			fire({ type: 'chat/turnComplete', session, turnId } as ChatAction);
			await turnPromise;

			const allParts = collected.flat();
			const toolInvocations = allParts.filter((p): p is IChatToolInvocation => p.kind === 'toolInvocation');
			const parent = toolInvocations.find(t => t.toolCallId === parentToolCallId);

			assert.ok(parent, 'parent task tool invocation should be emitted');
			assert.strictEqual(parent!.toolSpecificData?.kind, 'subagent', 'parent should have subagent toolSpecificData');
			assert.strictEqual(
				(parent!.toolSpecificData as { kind: 'subagent'; agentName?: string }).agentName,
				'explore',
				'parent toolSpecificData.agentName must be updated from the Subagent content block'
			);
		}));

	});

	// ---- Auth dedupe ------------------------------------------------------

	suite('auth dedupe', () => {

		const protectedAgents = (): AgentInfo[] => [{
			provider: 'copilot',
			displayName: 'Agent Host - Copilot',
			description: 'test',
			models: [],
			protectedResources: [{
				resource: 'https://api.github.com',
				resource_name: 'GitHub',
				authorization_servers: ['https://github.com/login/oauth'],
				scopes_supported: ['read:user'],
				required: true,
			}],
		}];

		function tokenAuthService(tokenRef: { current: string }): Partial<IAuthenticationService> {
			// Always returns whatever token is in tokenRef.current. Returning a session
			// for the exact-scope `getSessions` call short-circuits the superset fallback.
			return {
				onDidChangeSessions: Event.None,
				getOrActivateProviderIdForServer: async () => 'github',
				getSessions: (async (_providerId: string, scopes?: ReadonlyArray<string>) => {
					if (scopes !== undefined) {
						return [{ scopes: [...scopes], accessToken: tokenRef.current }];
					}
					return [];
				}) as unknown as IAuthenticationService['getSessions'],
			};
		}

		test('does not re-authenticate when token unchanged across rootState changes', async () => {
			const tokenRef = { current: 'tok-1' };
			const { agentHostService } = createContribution(disposables, { authServiceOverride: tokenAuthService(tokenRef) });

			// First rootState — kicks off the eager auth pass.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			assert.deepStrictEqual(agentHostService.authenticateCalls, [{ resource: 'https://api.github.com', scopes: ['read:user'], token: 'tok-1' }]);

			// Repeated rootState changes with the same token must not re-fire authenticate.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 1 });
			await timeout(0);
			assert.deepStrictEqual(agentHostService.authenticateCalls, [{ resource: 'https://api.github.com', scopes: ['read:user'], token: 'tok-1' }]);
		});

		test('re-authenticates when token rotates, then dedupes again', async () => {
			const tokenRef = { current: 'tok-1' };
			const { agentHostService } = createContribution(disposables, { authServiceOverride: tokenAuthService(tokenRef) });

			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			// Token rotates externally; next rootState change must push it through.
			tokenRef.current = 'tok-2';
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			// Subsequent passes with the new token must dedupe again.
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 1 });
			await timeout(0);

			assert.deepStrictEqual(agentHostService.authenticateCalls, [
				{ resource: 'https://api.github.com', scopes: ['read:user'], token: 'tok-1' },
				{ resource: 'https://api.github.com', scopes: ['read:user'], token: 'tok-2' },
			]);
		});

		test('skips authenticate when no token is resolvable', async () => {
			const noTokenService: Partial<IAuthenticationService> = {
				onDidChangeSessions: Event.None,
				getOrActivateProviderIdForServer: async () => undefined,
				getSessions: (async () => []) as unknown as IAuthenticationService['getSessions'],
			};
			const { agentHostService } = createContribution(disposables, { authServiceOverride: noTokenService });

			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);
			agentHostService.setRootState({ agents: protectedAgents(), activeSessions: 0 });
			await timeout(0);

			assert.deepStrictEqual(agentHostService.authenticateCalls, []);
		});
	});

	// ---- MCP auth prompt dedupe (per conversation) ----------------------

	suite('mcp auth prompt', () => {

		// A customization service whose MCP server statuses and change events the
		// test drives directly, so the handler's reconcile pass — which prunes a
		// server from the per-conversation surfaced set once it reaches Ready —
		// can be exercised deterministically.
		class TestMcpCustomizationService extends NullAgentHostCustomizationService {
			private readonly _onDidChange = new Emitter<void>();
			override readonly onDidChangeCustomizations = this._onDidChange.event;
			mcpServers: readonly IAgentHostMcpServer[] = [];
			override getMcpServers(): readonly IAgentHostMcpServer[] {
				return this.mcpServers;
			}
			fireChange(): void {
				this._onDidChange.fire();
			}
			dispose(): void {
				this._onDidChange.dispose();
			}
		}

		// An MCP server customization stuck in the auth-required state. Empty
		// `authorization_servers` keeps the auto-grant probe off the network so it
		// resolves to "not authenticated" and the server stays pending.
		const authRequiredCustomization = () => ({
			type: CustomizationType.McpServer,
			id: 'mcp-1',
			name: 'GitHub MCP',
			enabled: true,
			uri: URI.parse('https://example.com/mcp'),
			state: {
				kind: McpServerStatus.AuthRequired,
				reason: McpAuthRequiredReason.Required,
				resource: { resource: 'https://example.com/mcp', authorization_servers: [] },
				requiredScopes: ['read:user'],
			},
		});

		// Runs one turn on `resource` to completion, optionally pushing session
		// customizations mid-turn, and returns the auth-prompt parts emitted.
		async function runTurn(
			sessionHandler: AgentHostSessionHandler,
			agentHostService: MockAgentHostService,
			chatAgentService: MockChatAgentService,
			resource: URI,
			seq: { v: number },
			opts?: { customizations?: unknown[] },
		): Promise<IChatMcpAuthenticationRequired[]> {
			const chatSession = await sessionHandler.provideChatSessionContent(resource, CancellationToken.None);
			disposables.add(toDisposable(() => chatSession.dispose()));
			agentHostService.dispatchedActions.length = 0;

			const registered = chatAgentService.registeredAgents.get('agent-host-copilot')!;
			const collected: IChatProgress[][] = [];
			const turnPromise = registered.impl.invoke(
				makeRequest({ message: 'Hello', sessionResource: resource, requestId: `turn-${seq.v}` }),
				parts => collected.push(parts),
				[],
				CancellationToken.None,
			);
			await timeout(10);

			const dispatch = agentHostService.turnActions[agentHostService.turnActions.length - 1];
			const turnId = (dispatch.action as ITurnStartedAction).turnId;
			// Echo turnStarted to clear the pending write-ahead entry.
			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: dispatch.action, serverSeq: seq.v++, origin: { clientId: agentHostService.clientId, clientSeq: dispatch.clientSeq } });

			if (opts?.customizations) {
				const sessionChannel = parseDefaultChatUri(dispatch.channel.toString())!;
				agentHostService.fireAction({
					channel: sessionChannel,
					action: { type: ActionType.SessionCustomizationsChanged, customizations: opts.customizations } as unknown as SessionAction,
					serverSeq: seq.v++,
					origin: undefined,
				});
			}
			// Let the async auto-grant filter resolve and the prompt part emit.
			await timeout(50);

			const promptParts = collected.flat().filter((p): p is IChatMcpAuthenticationRequired => p.kind === 'mcpAuthenticationRequired');

			agentHostService.fireAction({ channel: dispatch.channel.toString(), action: { type: 'chat/turnComplete', turnId } as ChatAction, serverSeq: seq.v++, origin: undefined });
			await turnPromise;
			return promptParts;
		}

		test('surfaces an unauthenticated server once, then suppresses it on the next turn', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables);
			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/mcp-auth-1' });
			const seq = { v: 1 };

			// Turn 1: server needs auth → the prompt surfaces it.
			const turn1 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq, { customizations: [authRequiredCustomization()] });
			assert.deepStrictEqual(turn1.flatMap(p => p.servers.get().map(s => s.name)), ['GitHub MCP']);

			// Turn 2: still needs auth, but was already prompted → no new prompt.
			const turn2 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq);
			assert.deepStrictEqual(turn2.flatMap(p => p.servers.get()), []);
		}));

		test('re-surfaces a server that reaches Ready and then needs auth again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const customizationService = disposables.add(new TestMcpCustomizationService());
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { customizationServiceOverride: customizationService });
			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/mcp-auth-2' });
			const seq = { v: 1 };

			const turn1 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq, { customizations: [authRequiredCustomization()] });
			const serverId = turn1[0].servers.get()[0].id;

			// Server authenticates and reaches Ready → reconcile clears suppression.
			customizationService.mcpServers = [upcastPartial<IAgentHostMcpServer>({ id: serverId, status: McpServerStatus.Ready })];
			customizationService.fireChange();

			// Turn 2: auth is required again → the prompt surfaces once more.
			const turn2 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq);
			assert.deepStrictEqual(turn2.flatMap(p => p.servers.get().map(s => s.name)), ['GitHub MCP']);
		}));

		test('keeps a server suppressed when it leaves auth-required without reaching Ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const customizationService = disposables.add(new TestMcpCustomizationService());
			const { sessionHandler, agentHostService, chatAgentService } = createContribution(disposables, { customizationServiceOverride: customizationService });
			const resource = URI.from({ scheme: 'agent-host-copilot', path: '/mcp-auth-3' });
			const seq = { v: 1 };

			const turn1 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq, { customizations: [authRequiredCustomization()] });
			const serverId = turn1[0].servers.get()[0].id;

			// Server transitions to a non-ready state (error) → it was not actioned,
			// so it stays suppressed.
			customizationService.mcpServers = [upcastPartial<IAgentHostMcpServer>({ id: serverId, status: McpServerStatus.Error })];
			customizationService.fireChange();

			const turn2 = await runTurn(sessionHandler, agentHostService, chatAgentService, resource, seq);
			assert.deepStrictEqual(turn2.flatMap(p => p.servers.get()), []);
		}));
	});

	// ---- Chat input completions delegation -----------------------------

	suite('provideChatInputCompletions', () => {

		test('forwards text/offset to the agent host and maps file attachments back to chat input items', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			const calls: CompletionsParams[] = [];
			(agentHostService as unknown as { completions: (p: CompletionsParams) => Promise<CompletionsResult> }).completions = async (params) => {
				calls.push(params);
				return {
					items: [
						{
							insertText: '@foo.ts',
							rangeStart: 4,
							rangeEnd: 8,
							attachment: {
								type: MessageAttachmentKind.Resource,
								uri: 'file:///workspace/foo.ts',
								label: 'foo.ts',
								displayKind: 'document',
								_meta: { provider: 'fs', score: 0.42 },
							},
						},
					],
				};
			};

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/abc' });
			const result = await sessionHandler.provideChatInputCompletions(
				sessionResource,
				{ text: 'see @foo', offset: 8 },
				CancellationToken.None,
			);

			assert.strictEqual(calls.length, 1);
			assert.strictEqual(calls[0].kind, AhpCompletionItemKind.UserMessage);
			assert.strictEqual(calls[0].text, 'see @foo');
			assert.strictEqual(calls[0].offset, 8);
			assert.deepStrictEqual(result, {
				items: [
					{
						insertText: '@foo.ts',
						start: { lineNumber: 1, column: 5 },
						end: { lineNumber: 1, column: 9 },
						attachment: {
							kind: 'resource',
							uri: URI.parse('file:///workspace/foo.ts'),
							displayName: 'foo.ts',
							isDirectory: false,
							_meta: { provider: 'fs', score: 0.42 },
						},
					},
				],
			});
		});

		test('skips attachments of unsupported kinds', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			(agentHostService as unknown as { completions: (p: CompletionsParams) => Promise<CompletionsResult> }).completions = async () => ({
				items: [
					{
						insertText: '@dir/',
						attachment: {
							type: MessageAttachmentKind.Resource,
							uri: 'file:///workspace/dir',
							label: 'dir',
							displayKind: 'directory',
						},
					},
					{
						insertText: '@image.png',
						attachment: {
							type: MessageAttachmentKind.EmbeddedResource,
							label: 'image.png',
							data: 'AAAA',
							contentType: 'image/png',
						},
					},
				],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/abc' });
			const result = await sessionHandler.provideChatInputCompletions(
				sessionResource,
				{ text: '@', offset: 1 },
				CancellationToken.None,
			);

			assert.strictEqual(result?.items.length, 1);
			assert.strictEqual(result?.items[0].attachment?.kind, 'resource');
			assert.strictEqual(result?.items[0].attachment?.isDirectory, true);
			assert.strictEqual(result?.items[0].attachment?.uri.toString(), 'file:///workspace/dir');
		});

		test('preserves skill completion metadata', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			(agentHostService as unknown as { completions: (p: CompletionsParams) => Promise<CompletionsResult> }).completions = async () => ({
				items: [
					{
						insertText: '/agent-host-docs ',
						rangeStart: 0,
						rangeEnd: 1,
						attachment: {
							type: MessageAttachmentKind.Simple,
							label: '/agent-host-docs',
							_meta: {
								uri: 'file:///skills/agent-host-docs/SKILL.md',
								displayName: 'Agent Host Docs',
								description: 'Use this skill when working on Agent Host code',
							},
						},
					},
				],
			});

			const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/abc' });
			const result = await sessionHandler.provideChatInputCompletions(
				sessionResource,
				{ text: '/', offset: 1 },
				CancellationToken.None,
			);

			assert.deepStrictEqual(result, {
				items: [
					{
						insertText: '/agent-host-docs ',
						start: { lineNumber: 1, column: 1 },
						end: { lineNumber: 1, column: 2 },
						attachment: {
							kind: 'skill',
							uri: URI.parse('file:///skills/agent-host-docs/SKILL.md'),
							displayName: 'Agent Host Docs',
							description: 'Use this skill when working on Agent Host code',
							_meta: {
								uri: 'file:///skills/agent-host-docs/SKILL.md',
								displayName: 'Agent Host Docs',
								description: 'Use this skill when working on Agent Host code',
							},
						},
					},
				],
			});
		});

		test('returns undefined when the request is cancelled', async () => {
			const { sessionHandler, agentHostService } = createContribution(disposables);

			(agentHostService as unknown as { completions: (p: CompletionsParams) => Promise<CompletionsResult> }).completions = async () => ({ items: [] });

			const cts = new CancellationTokenSource();
			cts.cancel();
			const result = await sessionHandler.provideChatInputCompletions(
				URI.from({ scheme: 'agent-host-copilot', path: '/abc' }),
				{ text: '', offset: 0 },
				cts.token,
			);
			cts.dispose();
			assert.strictEqual(result, undefined);
		});
	});
});
