/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { autorun, IObservable, observableValue } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { hasValidDiff, IAgentSession } from '../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ChatViewPaneTarget, IChatWidgetService, isIChatViewViewContext } from '../../contrib/chat/browser/chat.js';
import { IChatEditorOptions } from '../../contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { awaitStatsForSession } from '../../contrib/chat/common/chat.js';
import { IChatAgentRequest } from '../../contrib/chat/common/participants/chatAgents.js';
import { IChatModel } from '../../contrib/chat/common/model/chatModel.js';
import { IChatContentInlineReference, IChatProgress, IChatService, ResponseModelState } from '../../contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionItemProvider, IChatSessionProviderOptionItem, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { IChatRequestVariableEntry } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostChatSessionsShape, ExtHostContext, IChatProgressDto, IChatSessionHistoryItemDto, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

export class ObservableChatSession extends Disposable implements IChatSession {

	readonly sessionResource: URI;
	readonly providerHandle: number;
	readonly history: Array<IChatSessionHistoryItem>;
	private _options?: Record<string, string | IChatSessionProviderOptionItem>;
	public get options(): Record<string, string | IChatSessionProviderOptionItem> | undefined {
		return this._options;
	}
	private readonly _progressObservable = observableValue<IChatProgress[]>(this, []);
	private readonly _isCompleteObservable = observableValue<boolean>(this, false);

	private readonly _onWillDispose = new Emitter<void>();
	readonly onWillDispose = this._onWillDispose.event;

	private readonly _pendingProgressChunks = new Map<string, IChatProgress[]>();
	private _isInitialized = false;
	private _interruptionWasCanceled = false;
	private _disposalPending = false;

	private _initializationPromise?: Promise<void>;

	interruptActiveResponseCallback?: () => Promise<boolean>;
	requestHandler?: (
		request: IChatAgentRequest,
		progress: (progress: IChatProgress[]) => void,
		history: any[],
		token: CancellationToken
	) => Promise<void>;

	private readonly _proxy: ExtHostChatSessionsShape;
	private readonly _providerHandle: number;
	private readonly _logService: ILogService;
	private readonly _dialogService: IDialogService;

	get progressObs(): IObservable<IChatProgress[]> {
		return this._progressObservable;
	}

	get isCompleteObs(): IObservable<boolean> {
		return this._isCompleteObservable;
	}

	constructor(
		resource: URI,
		providerHandle: number,
		proxy: ExtHostChatSessionsShape,
		logService: ILogService,
		dialogService: IDialogService
	) {
		super();

		this.sessionResource = resource;
		this.providerHandle = providerHandle;
		this.history = [];
		this._proxy = proxy;
		this._providerHandle = providerHandle;
		this._logService = logService;
		this._dialogService = dialogService;
	}

	initialize(token: CancellationToken): Promise<void> {
		if (!this._initializationPromise) {
			this._initializationPromise = this._doInitializeContent(token);
		}
		return this._initializationPromise;
	}

	private async _doInitializeContent(token: CancellationToken): Promise<void> {
		try {
			const sessionContent = await raceCancellationError(
				this._proxy.$provideChatSessionContent(this._providerHandle, this.sessionResource, token),
				token
			);

			this._options = sessionContent.options;
			this.history.length = 0;
			this.history.push(...sessionContent.history.map((turn: IChatSessionHistoryItemDto) => {
				if (turn.type === 'request') {
					const variables = turn.variableData?.variables.map(v => {
						const entry = {
							...v,
							value: revive(v.value)
						};
						return entry as IChatRequestVariableEntry;
					});

					return {
						type: 'request' as const,
						prompt: turn.prompt,
						participant: turn.participant,
						command: turn.command,
						variableData: variables ? { variables } : undefined,
						id: turn.id
					};
				}

				return {
					type: 'response' as const,
					parts: turn.parts.map((part: IChatProgressDto) => revive(part) as IChatProgress),
					participant: turn.participant
				};
			}));

			if (sessionContent.hasActiveResponseCallback && !this.interruptActiveResponseCallback) {
				this.interruptActiveResponseCallback = async () => {
					const confirmInterrupt = () => {
						if (this._disposalPending) {
							this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
							this._disposalPending = false;
						}
						this._proxy.$interruptChatSessionActiveResponse(this._providerHandle, this.sessionResource, 'ongoing');
						return true;
					};

					if (sessionContent.supportsInterruption) {
						// If the session supports hot reload, interrupt without confirmation
						return confirmInterrupt();
					}

					// Prompt the user to confirm interruption
					return this._dialogService.confirm({
						message: localize('interruptActiveResponse', 'Are you sure you want to interrupt the active session?')
					}).then(confirmed => {
						if (confirmed.confirmed) {
							// User confirmed interruption - dispose the session content on extension host
							return confirmInterrupt();
						} else {
							// When user cancels the interruption, fire an empty progress message to keep the session alive
							// This matches the behavior of the old implementation
							this._addProgress([{
								kind: 'progressMessage',
								content: { value: '', isTrusted: false }
							}]);
							// Set flag to prevent completion when extension host calls handleProgressComplete
							this._interruptionWasCanceled = true;
							// User canceled interruption - cancel the deferred disposal
							if (this._disposalPending) {
								this._logService.info(`Canceling deferred disposal for session ${this.sessionResource} (user canceled interruption)`);
								this._disposalPending = false;
							}
							return false;
						}
					});
				};
			}

			if (sessionContent.hasRequestHandler && !this.requestHandler) {
				this.requestHandler = async (
					request: IChatAgentRequest,
					progress: (progress: IChatProgress[]) => void,
					history: any[],
					token: CancellationToken
				) => {
					// Clear previous progress and mark as active
					this._progressObservable.set([], undefined);
					this._isCompleteObservable.set(false, undefined);

					// Set up reactive progress observation before starting the request
					let lastProgressLength = 0;
					const progressDisposable = autorun(reader => {
						const progressArray = this._progressObservable.read(reader);
						const isComplete = this._isCompleteObservable.read(reader);

						if (progressArray.length > lastProgressLength) {
							const newProgress = progressArray.slice(lastProgressLength);
							progress(newProgress);
							lastProgressLength = progressArray.length;
						}

						if (isComplete) {
							progressDisposable.dispose();
						}
					});

					try {
						await this._proxy.$invokeChatSessionRequestHandler(this._providerHandle, this.sessionResource, request, history, token);

						// Only mark as complete if there's no active response callback
						// Sessions with active response callbacks should only complete when explicitly told to via handleProgressComplete
						if (!this._isCompleteObservable.get() && !this.interruptActiveResponseCallback) {
							this._markComplete();
						}
					} catch (error) {
						const errorProgress: IChatProgress = {
							kind: 'progressMessage',
							content: { value: `Error: ${error instanceof Error ? error.message : String(error)}`, isTrusted: false }
						};

						this._addProgress([errorProgress]);
						this._markComplete();
						throw error;
					} finally {
						// Ensure progress observation is cleaned up
						progressDisposable.dispose();
					}
				};
			}

			this._isInitialized = true;

			// Process any pending progress chunks
			const hasActiveResponse = sessionContent.hasActiveResponseCallback;
			const hasRequestHandler = sessionContent.hasRequestHandler;
			const hasAnyCapability = hasActiveResponse || hasRequestHandler;

			for (const [requestId, chunks] of this._pendingProgressChunks) {
				this._logService.debug(`Processing ${chunks.length} pending progress chunks for session ${this.sessionResource}, requestId ${requestId}`);
				this._addProgress(chunks);
			}
			this._pendingProgressChunks.clear();

			// If session has no active response callback and no request handler, mark it as complete
			if (!hasAnyCapability) {
				this._isCompleteObservable.set(true, undefined);
			}

		} catch (error) {
			this._logService.error(`Failed to initialize chat session ${this.sessionResource}:`, error);
			throw error;
		}
	}

	/**
	 * Handle progress chunks coming from the extension host.
	 * If the session is not initialized yet, the chunks will be queued.
	 */
	handleProgressChunk(requestId: string, progress: IChatProgress[]): void {
		if (!this._isInitialized) {
			const existing = this._pendingProgressChunks.get(requestId) || [];
			this._pendingProgressChunks.set(requestId, [...existing, ...progress]);
			this._logService.debug(`Queuing ${progress.length} progress chunks for session ${this.sessionResource}, requestId ${requestId} (session not initialized)`);
			return;
		}

		this._addProgress(progress);
	}

	/**
	 * Handle progress completion from the extension host.
	 */
	handleProgressComplete(requestId: string): void {
		// Clean up any pending chunks for this request
		this._pendingProgressChunks.delete(requestId);

		if (this._isInitialized) {
			// Don't mark as complete if user canceled the interruption
			if (!this._interruptionWasCanceled) {
				this._markComplete();
			} else {
				// Reset the flag and don't mark as complete
				this._interruptionWasCanceled = false;
			}
		}
	}

	private _addProgress(progress: IChatProgress[]): void {
		const currentProgress = this._progressObservable.get();
		this._progressObservable.set([...currentProgress, ...progress], undefined);
	}

	private _markComplete(): void {
		if (!this._isCompleteObservable.get()) {
			this._isCompleteObservable.set(true, undefined);
		}
	}

	override dispose(): void {
		this._onWillDispose.fire();
		this._onWillDispose.dispose();
		this._pendingProgressChunks.clear();

		// If this session has an active response callback and disposal is happening,
		// defer the actual session content disposal until we know the user's choice
		if (this.interruptActiveResponseCallback && !this._interruptionWasCanceled) {
			this._disposalPending = true;
			// The actual disposal will happen in the interruption callback based on user's choice
		} else {
			// No active response callback or user already canceled interruption - dispose immediately
			this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
		}
		super.dispose();
	}
}

@extHostNamedCustomer(MainContext.MainThreadChatSessions)
export class MainThreadChatSessions extends Disposable implements MainThreadChatSessionsShape {
	private readonly _itemProvidersRegistrations = this._register(new DisposableMap<number, IDisposable & {
		readonly provider: IChatSessionItemProvider;
		readonly onDidChangeItems: Emitter<void>;
	}>());
	private readonly _contentProvidersRegistrations = this._register(new DisposableMap<number>());
	private readonly _sessionTypeToHandle = new Map<string, number>();

	private readonly _activeSessions = new ResourceMap<ObservableChatSession>();
	private readonly _sessionDisposables = new ResourceMap<IDisposable>();

	private readonly _proxy: ExtHostChatSessionsShape;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		this._chatSessionsService.setOptionsChangeCallback(async (sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem }>) => {
			const handle = this._getHandleForSessionType(sessionResource.scheme);
			if (handle !== undefined) {
				await this.notifyOptionsChange(handle, sessionResource, updates);
			}
		});
	}

	private _getHandleForSessionType(chatSessionType: string): number | undefined {
		return this._sessionTypeToHandle.get(chatSessionType);
	}

	$registerChatSessionItemProvider(handle: number, chatSessionType: string): void {
		// Register the provider handle - this tracks that a provider exists
		const disposables = new DisposableStore();
		const changeEmitter = disposables.add(new Emitter<void>());
		const provider: IChatSessionItemProvider = {
			chatSessionType,
			onDidChangeChatSessionItems: Event.debounce(changeEmitter.event, (_, e) => e, 200),
			provideChatSessionItems: (token) => this._provideChatSessionItems(handle, token),
		};
		disposables.add(this._chatSessionsService.registerChatSessionItemProvider(provider));

		this._itemProvidersRegistrations.set(handle, {
			dispose: () => disposables.dispose(),
			provider,
			onDidChangeItems: changeEmitter,
		});

		disposables.add(this._chatSessionsService.registerChatModelChangeListeners(
			this._chatService,
			chatSessionType,
			() => changeEmitter.fire()
		));
	}


	$onDidChangeChatSessionItems(handle: number): void {
		this._itemProvidersRegistrations.get(handle)?.onDidChangeItems.fire();
	}

	$onDidChangeChatSessionOptions(handle: number, sessionResourceComponents: UriComponents, updates: ReadonlyArray<{ optionId: string; value: string }>): void {
		const sessionResource = URI.revive(sessionResourceComponents);

		this._chatSessionsService.notifySessionOptionsChange(sessionResource, updates);
	}

	async $onDidCommitChatSessionItem(handle: number, originalComponents: UriComponents, modifiedCompoennts: UriComponents): Promise<void> {
		const originalResource = URI.revive(originalComponents);
		const modifiedResource = URI.revive(modifiedCompoennts);

		this._logService.trace(`$onDidCommitChatSessionItem: handle(${handle}), original(${originalResource}), modified(${modifiedResource})`);
		const chatSessionType = this._itemProvidersRegistrations.get(handle)?.provider.chatSessionType;
		if (!chatSessionType) {
			this._logService.error(`No chat session type found for provider handle ${handle}`);
			return;
		}

		const originalEditor = this._editorService.editors.find(editor => editor.resource?.toString() === originalResource.toString());
		const originalModel = this._chatService.getSession(originalResource);
		const contribution = this._chatSessionsService.getAllChatSessionContributions().find(c => c.type === chatSessionType);

		// Find the group containing the original editor
		const originalGroup =
			this.editorGroupService.groups.find(group => group.editors.some(editor => isEqual(editor.resource, originalResource)))
			?? this.editorGroupService.activeGroup;

		const options: IChatEditorOptions = {
			title: {
				preferred: originalEditor?.getName() || undefined,
				fallback: localize('chatEditorContributionName', "{0}", contribution?.displayName),
			}
		};

		// Prefetch the chat session content to make the subsequent editor swap quick
		const newSession = await this._chatSessionsService.getOrCreateChatSession(
			URI.revive(modifiedResource),
			CancellationToken.None,
		);

		if (originalEditor) {
			newSession.transferredState = originalEditor instanceof ChatEditorInput
				? { editingSession: originalEditor.transferOutEditingSession(), inputState: originalModel?.inputModel.toJSON() }
				: undefined;

			this._editorService.replaceEditors([{
				editor: originalEditor,
				replacement: {
					resource: modifiedResource,
					options,
				},
			}], originalGroup);
			return;
		}

		// If chat editor is in the side panel, then those are not listed as editors.
		// In that case we need to transfer editing session using the original model.
		if (originalModel) {
			newSession.transferredState = {
				editingSession: originalModel.editingSession,
				inputState: originalModel.inputModel.toJSON()
			};
		}

		const chatViewWidget = this._chatWidgetService.getWidgetBySessionResource(originalResource);
		if (chatViewWidget && isIChatViewViewContext(chatViewWidget.viewContext)) {
			await this._chatWidgetService.openSession(modifiedResource, ChatViewPaneTarget, { preserveFocus: true });
		} else {
			// Loading the session to ensure the session is created and editing session is transferred.
			const ref = await this._chatService.loadSessionForResource(modifiedResource, ChatAgentLocation.Chat, CancellationToken.None);
			ref?.dispose();
		}
	}

	private async _provideChatSessionItems(handle: number, token: CancellationToken): Promise<IChatSessionItem[]> {
		try {
			// Get all results as an array from the RPC call
			const sessions = await this._proxy.$provideChatSessionItems(handle, token);
			return Promise.all(sessions.map(async session => {
				const uri = URI.revive(session.resource);
				const model = this._chatService.getSession(uri);
				if (model) {
					session = await this.handleSessionModelOverrides(model, session);
				}

				// We can still get stats if there is no model or if fetching from model failed
				if (!session.changes || !model) {
					const stats = (await this._chatService.getMetadataForSession(uri))?.stats;
					// TODO: we shouldn't be converting this, the types should match
					const diffs: IAgentSession['changes'] = {
						files: stats?.fileCount || 0,
						insertions: stats?.added || 0,
						deletions: stats?.removed || 0
					};
					if (hasValidDiff(diffs)) {
						session.changes = diffs;
					}
				}

				return {
					...session,
					changes: revive(session.changes),
					resource: uri,
					iconPath: session.iconPath,
					tooltip: session.tooltip ? this._reviveTooltip(session.tooltip) : undefined,
				} satisfies IChatSessionItem;
			}));
		} catch (error) {
			this._logService.error('Error providing chat sessions:', error);
		}
		return [];
	}

	private async handleSessionModelOverrides(model: IChatModel, session: Dto<IChatSessionItem>): Promise<Dto<IChatSessionItem>> {
		// Override desciription if there's an in-progress count
		const inProgress = model.getRequests().filter(r => r.response && !r.response.isComplete);
		if (inProgress.length) {
			session.description = this._chatSessionsService.getInProgressSessionDescription(model);
		}

		// Override changes
		// TODO: @osortega we don't really use statistics anymore, we need to clarify that in the API
		if (!(session.changes instanceof Array)) {
			const modelStats = await awaitStatsForSession(model);
			if (modelStats) {
				session.changes = {
					files: modelStats.fileCount,
					insertions: modelStats.added,
					deletions: modelStats.removed
				};
			}
		}

		// Override status if the models needs input
		if (model.lastRequest?.response?.state === ResponseModelState.NeedsInput) {
			session.status = ChatSessionStatus.NeedsInput;
		}

		return session;
	}

	private async _provideChatSessionContent(providerHandle: number, sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		let session = this._activeSessions.get(sessionResource);

		if (!session) {
			session = new ObservableChatSession(
				sessionResource,
				providerHandle,
				this._proxy,
				this._logService,
				this._dialogService
			);
			this._activeSessions.set(sessionResource, session);
			const disposable = session.onWillDispose(() => {
				this._activeSessions.delete(sessionResource);
				this._sessionDisposables.get(sessionResource)?.dispose();
				this._sessionDisposables.delete(sessionResource);
			});
			this._sessionDisposables.set(sessionResource, disposable);
		}

		try {
			await session.initialize(token);
			if (session.options) {
				for (const [_, handle] of this._sessionTypeToHandle) {
					if (handle === providerHandle) {
						for (const [optionId, value] of Object.entries(session.options)) {
							this._chatSessionsService.setSessionOption(sessionResource, optionId, value);
						}
						break;
					}
				}
			}
			return session;
		} catch (error) {
			session.dispose();
			this._logService.error(`Error providing chat session content for handle ${providerHandle} and resource ${sessionResource.toString()}:`, error);
			throw error;
		}
	}

	$unregisterChatSessionItemProvider(handle: number): void {
		this._itemProvidersRegistrations.deleteAndDispose(handle);
	}

	$registerChatSessionContentProvider(handle: number, chatSessionScheme: string): void {
		const provider: IChatSessionContentProvider = {
			provideChatSessionContent: (resource, token) => this._provideChatSessionContent(handle, resource, token)
		};

		this._sessionTypeToHandle.set(chatSessionScheme, handle);
		this._contentProvidersRegistrations.set(handle, this._chatSessionsService.registerChatSessionContentProvider(chatSessionScheme, provider));
		this._refreshProviderOptions(handle, chatSessionScheme);
	}

	$unregisterChatSessionContentProvider(handle: number): void {
		this._contentProvidersRegistrations.deleteAndDispose(handle);
		for (const [sessionType, h] of this._sessionTypeToHandle) {
			if (h === handle) {
				this._sessionTypeToHandle.delete(sessionType);
				break;
			}
		}

		// dispose all sessions from this provider and clean up its disposables
		for (const [key, session] of this._activeSessions) {
			if (session.providerHandle === handle) {
				session.dispose();
				this._activeSessions.delete(key);
			}
		}
	}

	async $handleProgressChunk(handle: number, sessionResource: UriComponents, requestId: string, chunks: (IChatProgressDto | [IChatProgressDto, number])[]): Promise<void> {
		const resource = URI.revive(sessionResource);
		const observableSession = this._activeSessions.get(resource);
		if (!observableSession) {
			this._logService.warn(`No session found for progress chunks: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
			return;
		}

		const chatProgressParts: IChatProgress[] = chunks.map(chunk => {
			const [progress] = Array.isArray(chunk) ? chunk : [chunk];
			return revive(progress) as IChatProgress;
		});

		observableSession.handleProgressChunk(requestId, chatProgressParts);
	}

	$handleProgressComplete(handle: number, sessionResource: UriComponents, requestId: string) {
		const resource = URI.revive(sessionResource);
		const observableSession = this._activeSessions.get(resource);
		if (!observableSession) {
			this._logService.warn(`No session found for progress completion: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
			return;
		}

		observableSession.handleProgressComplete(requestId);
	}

	$handleAnchorResolve(handle: number, sesssionResource: UriComponents, requestId: string, requestHandle: string, anchor: Dto<IChatContentInlineReference>): void {
		// throw new Error('Method not implemented.');
	}

	$onDidChangeChatSessionProviderOptions(handle: number): void {
		let sessionType: string | undefined;
		for (const [type, h] of this._sessionTypeToHandle) {
			if (h === handle) {
				sessionType = type;
				break;
			}
		}

		if (!sessionType) {
			this._logService.warn(`No session type found for chat session content provider handle ${handle} when refreshing provider options`);
			return;
		}

		this._refreshProviderOptions(handle, sessionType);
	}

	private _refreshProviderOptions(handle: number, chatSessionScheme: string): void {
		this._proxy.$provideChatSessionProviderOptions(handle, CancellationToken.None).then(options => {
			if (options?.optionGroups && options.optionGroups.length) {
				this._chatSessionsService.setOptionGroupsForSessionType(chatSessionScheme, handle, options.optionGroups);
			}
		}).catch(err => this._logService.error('Error fetching chat session options', err));
	}

	override dispose(): void {
		for (const session of this._activeSessions.values()) {
			session.dispose();
		}
		this._activeSessions.clear();

		for (const disposable of this._sessionDisposables.values()) {
			disposable.dispose();
		}
		this._sessionDisposables.clear();

		super.dispose();
	}

	private _reviveTooltip(tooltip: string | IMarkdownString | undefined): string | MarkdownString | undefined {
		if (!tooltip) {
			return undefined;
		}

		// If it's already a string, return as-is
		if (typeof tooltip === 'string') {
			return tooltip;
		}

		// If it's a serialized IMarkdownString, revive it to MarkdownString
		if (typeof tooltip === 'object' && 'value' in tooltip) {
			return MarkdownString.lift(tooltip);
		}

		return undefined;
	}

	/**
	 * Notify the extension about option changes for a session
	 */
	async notifyOptionsChange(handle: number, sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string | IChatSessionProviderOptionItem | undefined }>): Promise<void> {
		try {
			await this._proxy.$provideHandleOptionsChange(handle, sessionResource, updates, CancellationToken.None);
		} catch (error) {
			this._logService.error(`Error notifying extension about options change for handle ${handle}, sessionResource ${sessionResource}:`, error);
		}
	}
}
