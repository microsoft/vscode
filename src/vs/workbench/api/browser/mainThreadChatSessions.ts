/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { autorun, IObservable, observableValue } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ChatViewId } from '../../contrib/chat/browser/chat.js';
import { ChatViewPane } from '../../contrib/chat/browser/chatViewPane.js';
import { IChatAgentRequest } from '../../contrib/chat/common/chatAgents.js';
import { IChatContentInlineReference, IChatProgress } from '../../contrib/chat/common/chatService.js';
import { ChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatSessionUri } from '../../contrib/chat/common/chatUri.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroup, IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { ExtHostChatSessionsShape, ExtHostContext, IChatProgressDto, IChatSessionHistoryItemDto, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

export class ObservableChatSession extends Disposable implements ChatSession {
	static generateSessionKey(providerHandle: number, sessionId: string) {
		return `${providerHandle}_${sessionId}`;
	}

	readonly sessionId: string;
	readonly providerHandle: number;
	readonly history: Array<IChatSessionHistoryItem>;

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

	get sessionKey(): string {
		return ObservableChatSession.generateSessionKey(this.providerHandle, this.sessionId);
	}

	get progressObs(): IObservable<IChatProgress[]> {
		return this._progressObservable;
	}

	get isCompleteObs(): IObservable<boolean> {
		return this._isCompleteObservable;
	}

	constructor(
		id: string,
		providerHandle: number,
		proxy: ExtHostChatSessionsShape,
		logService: ILogService,
		dialogService: IDialogService
	) {
		super();

		this.sessionId = id;
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
				this._proxy.$provideChatSessionContent(this._providerHandle, this.sessionId, token),
				token
			);

			this.history.length = 0;
			this.history.push(...sessionContent.history.map((turn: IChatSessionHistoryItemDto) => {
				if (turn.type === 'request') {
					return { type: 'request' as const, prompt: turn.prompt, participant: turn.participant };
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
							this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionId);
							this._disposalPending = false;
						}
						this._proxy.$interruptChatSessionActiveResponse(this._providerHandle, this.sessionId, 'ongoing');
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
								this._logService.info(`Canceling deferred disposal for session ${this.sessionId} (user canceled interruption)`);
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
						await this._proxy.$invokeChatSessionRequestHandler(this._providerHandle, this.sessionId, request, history, token);

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
				this._logService.debug(`Processing ${chunks.length} pending progress chunks for session ${this.sessionId}, requestId ${requestId}`);
				this._addProgress(chunks);
			}
			this._pendingProgressChunks.clear();

			// If session has no active response callback and no request handler, mark it as complete
			if (!hasAnyCapability) {
				this._isCompleteObservable.set(true, undefined);
			}

		} catch (error) {
			this._logService.error(`Failed to initialize chat session ${this.sessionId}:`, error);
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
			this._logService.debug(`Queuing ${progress.length} progress chunks for session ${this.sessionId}, requestId ${requestId} (session not initialized)`);
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
			this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionId);
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

	private readonly _activeSessions = new Map<string, ObservableChatSession>();
	private readonly _sessionDisposables = new Map<string, IDisposable>();

	private readonly _proxy: ExtHostChatSessionsShape;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ILogService private readonly _logService: ILogService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);
	}

	$registerChatSessionItemProvider(handle: number, chatSessionType: string): void {
		// Register the provider handle - this tracks that a provider exists
		const disposables = new DisposableStore();
		const changeEmitter = disposables.add(new Emitter<void>());

		const provider: IChatSessionItemProvider = {
			chatSessionType,
			onDidChangeChatSessionItems: changeEmitter.event,
			provideChatSessionItems: (token) => this._provideChatSessionItems(handle, token),
			provideNewChatSessionItem: (options, token) => this._provideNewChatSessionItem(handle, options, token)
		};
		disposables.add(this._chatSessionsService.registerChatSessionItemProvider(provider));

		this._itemProvidersRegistrations.set(handle, {
			dispose: () => disposables.dispose(),
			provider,
			onDidChangeItems: changeEmitter,
		});
	}

	$onDidChangeChatSessionItems(handle: number): void {
		this._itemProvidersRegistrations.get(handle)?.onDidChangeItems.fire();
	}

	$onDidCommitChatSessionItem(handle: number, original: string, modified: string): void {
		this._logService.trace(`$onDidCommitChatSessionItem: handle(${handle}), original(${original}), modified(${modified})`);
		const chatSessionType = this._itemProvidersRegistrations.get(handle)?.provider.chatSessionType;
		if (!chatSessionType) {
			this._logService.error(`No chat session type found for provider handle ${handle}`);
			return;
		}
		const originalResource = ChatSessionUri.forSession(chatSessionType, original);
		const modifiedResource = ChatSessionUri.forSession(chatSessionType, modified);
		const originalEditor = this._editorService.editors.find(editor => editor.resource?.toString() === originalResource.toString());

		// Find the group containing the original editor
		let originalGroup: IEditorGroup | undefined;
		for (const group of this.editorGroupService.groups) {
			if (group.editors.some(editor => editor.resource?.toString() === originalResource.toString())) {
				originalGroup = group;
				break;
			}
		}
		if (!originalGroup) {
			originalGroup = this.editorGroupService.activeGroup;
		}

		if (originalEditor) {
			// Prefetch the chat session content to make the subsequent editor swap quick
			this._chatSessionsService.provideChatSessionContent(
				chatSessionType,
				modified,
				CancellationToken.None,
			).then(() => {
				this._editorService.replaceEditors([{
					editor: originalEditor,
					replacement: {
						resource: modifiedResource,
						options: {}
					},
				}], originalGroup);
			});
		} else {
			this._logService.warn(`Original chat session editor not found for resource ${originalResource.toString()}`);
			this._editorService.openEditor({ resource: modifiedResource }, originalGroup);
		}
	}

	private async _provideChatSessionItems(handle: number, token: CancellationToken): Promise<IChatSessionItem[]> {
		try {
			// Get all results as an array from the RPC call
			const sessions = await this._proxy.$provideChatSessionItems(handle, token);
			return sessions.map(session => ({
				...session,
				id: session.id,
				iconPath: session.iconPath,
				tooltip: session.tooltip ? this._reviveTooltip(session.tooltip) : undefined
			}));
		} catch (error) {
			this._logService.error('Error providing chat sessions:', error);
		}
		return [];
	}

	private async _provideNewChatSessionItem(handle: number, options: { request: IChatAgentRequest; metadata?: any }, token: CancellationToken): Promise<IChatSessionItem> {
		try {
			const chatSessionItem = await this._proxy.$provideNewChatSessionItem(handle, options, token);
			if (!chatSessionItem) {
				throw new Error('Extension failed to create chat session');
			}
			return {
				...chatSessionItem,
				id: chatSessionItem.id,
				iconPath: chatSessionItem.iconPath,
				tooltip: chatSessionItem.tooltip ? this._reviveTooltip(chatSessionItem.tooltip) : undefined,
			};
		} catch (error) {
			this._logService.error('Error creating chat session:', error);
			throw error;
		}
	}

	private async _provideChatSessionContent(providerHandle: number, id: string, token: CancellationToken): Promise<ChatSession> {
		const sessionKey = ObservableChatSession.generateSessionKey(providerHandle, id);
		let session = this._activeSessions.get(sessionKey);

		if (!session) {
			session = new ObservableChatSession(
				id,
				providerHandle,
				this._proxy,
				this._logService,
				this._dialogService
			);
			this._activeSessions.set(sessionKey, session);
			const disposable = session.onWillDispose(() => {
				this._activeSessions.delete(sessionKey);
				this._sessionDisposables.get(sessionKey)?.dispose();
				this._sessionDisposables.delete(sessionKey);
			});
			this._sessionDisposables.set(sessionKey, disposable);
		}

		try {
			await session.initialize(token);
			return session;
		} catch (error) {
			session.dispose();
			this._logService.error(`Error providing chat session content for handle ${providerHandle} and id ${id}:`, error);
			throw error;
		}
	}

	$unregisterChatSessionItemProvider(handle: number): void {
		this._itemProvidersRegistrations.deleteAndDispose(handle);
	}

	$registerChatSessionContentProvider(handle: number, chatSessionType: string): void {
		const provider: IChatSessionContentProvider = {
			provideChatSessionContent: (id, token) => this._provideChatSessionContent(handle, id, token)
		};

		this._contentProvidersRegistrations.set(handle, this._chatSessionsService.registerChatSessionContentProvider(chatSessionType, provider));
	}

	$unregisterChatSessionContentProvider(handle: number): void {
		this._contentProvidersRegistrations.deleteAndDispose(handle);
		// dispose all sessions from this provider and clean up its disposables
		for (const [key, session] of this._activeSessions) {
			if (session.providerHandle === handle) {
				session.dispose();
				this._activeSessions.delete(key);
			}
		}
	}

	async $handleProgressChunk(handle: number, sessionId: string, requestId: string, chunks: (IChatProgressDto | [IChatProgressDto, number])[]): Promise<void> {
		const sessionKey = ObservableChatSession.generateSessionKey(handle, sessionId);
		const observableSession = this._activeSessions.get(sessionKey);

		const chatProgressParts: IChatProgress[] = chunks.map(chunk => {
			const [progress] = Array.isArray(chunk) ? chunk : [chunk];
			return revive(progress) as IChatProgress;
		});

		if (observableSession) {
			observableSession.handleProgressChunk(requestId, chatProgressParts);
		} else {
			this._logService.warn(`No session found for progress chunks: handle ${handle}, sessionId ${sessionId}, requestId ${requestId}`);
		}
	}

	$handleProgressComplete(handle: number, sessionId: string, requestId: string) {
		const sessionKey = ObservableChatSession.generateSessionKey(handle, sessionId);
		const observableSession = this._activeSessions.get(sessionKey);

		if (observableSession) {
			observableSession.handleProgressComplete(requestId);
		} else {
			this._logService.warn(`No session found for progress completion: handle ${handle}, sessionId ${sessionId}, requestId ${requestId}`);
		}
	}

	$handleAnchorResolve(handle: number, sessionId: string, requestId: string, requestHandle: string, anchor: Dto<IChatContentInlineReference>): void {
		// throw new Error('Method not implemented.');
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

	async $showChatSession(chatSessionType: string, sessionId: string, position: EditorGroupColumn | undefined): Promise<void> {
		const sessionUri = ChatSessionUri.forSession(chatSessionType, sessionId);

		if (typeof position === 'undefined') {
			const chatPanel = await this._viewsService.openView<ChatViewPane>(ChatViewId);
			await chatPanel?.loadSession(sessionUri);
		} else {
			await this._editorService.openEditor({
				resource: sessionUri,
				options: { pinned: true },
			}, position);
		}
	}
}
