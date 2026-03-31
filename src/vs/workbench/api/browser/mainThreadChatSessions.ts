/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { IMarkdownString, MarkdownString, markdownStringEqual } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, IObservable, observableSignalFromEvent, observableValue } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { hasValidDiff, IAgentSession } from '../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService, isIChatViewViewContext } from '../../contrib/chat/browser/chat.js';
import { getInProgressSessionDescription } from '../../contrib/chat/browser/chatSessions/chatSessionDescription.js';
import { getSessionStatusForModel } from '../../contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatEditorOptions } from '../../contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { IChatRequestVariableEntry } from '../../contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { IChatContentInlineReference, IChatDetail, IChatProgress, IChatService, IChatSessionTiming } from '../../contrib/chat/common/chatService/chatService.js';
import { ChatSessionOptionsMap, ChatSessionStatus, IChatNewSessionRequest, IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionRequestHistoryItem, IChatSessionsService, ReadonlyChatSessionOptionsMap } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { IChatModel } from '../../contrib/chat/common/model/chatModel.js';
import { getChatSessionType, isUntitledChatSession } from '../../contrib/chat/common/model/chatUri.js';
import { IChatAgentRequest } from '../../contrib/chat/common/participants/chatAgents.js';
import { IChatArtifactsService } from '../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatTodoListService } from '../../contrib/chat/common/tools/chatTodoListService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { ChatSessionContentContextDto, ExtHostChatSessionsShape, ExtHostContext, IChatProgressDto, IChatSessionHistoryItemDto, IChatSessionItemsChange, IChatSessionRequestHistoryItemDto, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

function stringOrMarkdownEqual(a: string | IMarkdownString | undefined, b: string | IMarkdownString | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	if (typeof a === 'string' || typeof b === 'string') {
		return false;
	}
	return markdownStringEqual(a, b);
}

export class ObservableChatSession extends Disposable implements IChatSession {

	readonly sessionResource: URI;
	readonly providerHandle: number;
	readonly history: Array<IChatSessionHistoryItem>;
	title?: string;
	private _options?: ChatSessionOptionsMap;
	public get options(): ReadonlyChatSessionOptionsMap | undefined {
		return this._options ? new Map(this._options) : undefined;
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
	forkSession?: (request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>;

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

	initialize(token: CancellationToken, context: ChatSessionContentContextDto): Promise<void> {
		if (!this._initializationPromise) {
			this._initializationPromise = this._doInitializeContent(token, context);
		}
		return this._initializationPromise;
	}

	private async _doInitializeContent(token: CancellationToken, context: ChatSessionContentContextDto): Promise<void> {
		try {
			const sessionContent = await raceCancellationError(
				this._proxy.$provideChatSessionContent(this._providerHandle, this.sessionResource, context, token),
				token
			);

			this._options = sessionContent.options ? ChatSessionOptionsMap.fromRecord(sessionContent.options) : undefined;
			this.title = sessionContent.title;
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
						id: turn.id,
						modelId: turn.modelId,
						modeInstructions: turn.modeInstructions ? revive(turn.modeInstructions) : undefined,
					} satisfies IChatSessionRequestHistoryItem;
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

			if (sessionContent.hasForkHandler && !this.forkSession) {
				this.forkSession = async (request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => {
					const result = await this._proxy.$forkChatSession(this._providerHandle, this.sessionResource, request ? this.toRequestDto(request) : undefined, token);
					return revive(result) as IChatSessionItem;
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

	private toRequestDto(request: IChatSessionRequestHistoryItem): IChatSessionRequestHistoryItemDto {
		return {
			type: 'request',
			id: request.id,
			prompt: request.prompt,
			participant: request.participant,
			command: request.command,
			variableData: undefined,
			modelId: request.modelId,
			modeInstructions: request.modeInstructions,
		};
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

class MainThreadChatSessionItemController extends Disposable implements IChatSessionItemController {

	private readonly _proxy: ExtHostChatSessionsShape;
	private readonly _handle: number;

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	public readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private readonly _modelListeners = this._register(new DisposableResourceMap());

	private _isDisposed = false;

	constructor(
		proxy: ExtHostChatSessionsShape,
		chatSessionType: string,
		handle: number,
		@IChatService private readonly _chatService: IChatService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._proxy = proxy;
		this._handle = handle;

		// Update the chat session item based on on the actual model state
		// TODO: This should be based on the chat session content provider instead of the chat models directly
		// or bed moved into the chat session service so that all controllers get the same behavior.
		const addModelListeners = async (model: IChatModel) => {
			if (getChatSessionType(model.sessionResource) !== chatSessionType) {
				return;
			}

			await this.refresh(CancellationToken.None);
			if (this._isDisposed) {
				return;
			}

			this.tryUpdateItemForModel(model);

			const requestChangeListener = model.lastRequestObs.map(last => last?.response && observableSignalFromEvent('chatSessions.modelRequestChangeListener', last.response.onDidChange));
			const modelChangeListener = observableSignalFromEvent('chatSessions.modelChangeListener', model.onDidChange);
			this._modelListeners.set(model.sessionResource, autorun(reader => {
				requestChangeListener.read(reader)?.read(reader);
				modelChangeListener.read(reader);

				this.tryUpdateItemForModel(model);
			}));
		};

		this._register(_chatService.onDidCreateModel(model => addModelListeners(model)));
		for (const model of _chatService.chatModels.get()) {
			addModelListeners(model);
		}

		this._register(_chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._modelListeners.deleteAndDispose(sessionResource);
			}
		}));
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	private readonly _items = new ResourceMap<MainThreadChatSessionItem>();
	get items(): IChatSessionItem[] {
		return Array.from(this._items.values());
	}

	refresh(token: CancellationToken): Promise<void> {
		return this._proxy.$refreshChatSessionItems(this._handle, token);
	}

	async newChatSessionItem(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		const dto = await raceCancellationError(this._proxy.$newChatSessionItem(this._handle, {
			prompt: request.prompt,
			command: request.command,
			initialSessionOptions: request.initialSessionOptions ? ChatSessionOptionsMap.toStrValueArray(request.initialSessionOptions) : undefined,
		}, token), token);
		if (!dto) {
			return undefined;
		}
		const item = this.addOrUpdateItem(dto);
		return item;
	}

	async acceptChange(change: { readonly addedOrUpdated: readonly Dto<IChatSessionItem>[]; readonly removed: readonly URI[] }): Promise<void> {
		const addedOrUpdatedItems: MainThreadChatSessionItem[] = [];
		for (const item of change.addedOrUpdated) {
			addedOrUpdatedItems.push(await this.addOrUpdateItem(item));
		}
		for (const uri of change.removed) {
			this._items.delete(uri);
		}
		this._onDidChangeChatSessionItems.fire({
			addedOrUpdated: addedOrUpdatedItems,
			removed: change.removed,
		});
	}

	private async addOrUpdateItem(dto: Dto<IChatSessionItem>): Promise<MainThreadChatSessionItem> {
		const resource = URI.revive(dto.resource);
		warnOnUntitledSessionResource(resource, this._logService);

		const existing = this._items.get(resource);
		const updated = new MainThreadChatSessionItem(dto, this._chatService.getSession(resource), await this._chatService.getMetadataForSession(resource));
		if (existing?.isEqual(updated)) {
			return existing;
		}

		this._items.set(resource, updated);
		this._onDidChangeChatSessionItems.fire({
			addedOrUpdated: [updated],
		});
		return updated;
	}

	private async tryUpdateItemForModel(model: IChatModel): Promise<void> {
		const resource = model.sessionResource;
		const existing = this._items.get(resource);
		if (existing) {
			this.addOrUpdateItem(existing);
		}
	}

	async getNewChatSessionInputState(token: CancellationToken): Promise<readonly IChatSessionProviderOptionGroup[] | undefined> {
		const optionGroups = await this._proxy.$provideChatSessionInputState(this._handle, undefined, token);
		if (!optionGroups?.length) {
			return undefined;
		}
		return optionGroups;
	}
}

class MainThreadChatSessionItem implements IChatSessionItem {
	readonly resource: URI;

	readonly label: string;
	readonly iconPath?: ThemeIcon;
	readonly badge?: string | IMarkdownString;
	readonly description?: string | IMarkdownString;
	readonly status?: ChatSessionStatus;
	readonly tooltip?: string | IMarkdownString;
	readonly timing: IChatSessionTiming;
	readonly changes?: IChatSessionItem['changes'];
	readonly archived?: boolean;
	readonly metadata?: { readonly [key: string]: unknown };

	constructor(dto: Dto<IChatSessionItem>, model: IChatModel | undefined, detailOverrides: IChatDetail | undefined) {
		this.resource = URI.revive(dto.resource);
		this.label = dto.label;
		this.timing = dto.timing;
		this.iconPath = dto.iconPath;
		this.badge = reviveMarkdownString(dto.badge);
		this.tooltip = reviveMarkdownString(dto.tooltip);
		this.archived = dto.archived;
		this.metadata = dto.metadata;

		this.description = (model && getInProgressSessionDescription(model)) ?? reviveMarkdownString(dto.description);
		this.status = (model && getSessionStatusForModel(model)) ?? dto.status;

		this.changes = revive(dto.changes);

		// We can still get stats if there is no model or if fetching from model failed
		if (detailOverrides && !this.changes) {
			const diffs: IAgentSession['changes'] = {
				files: detailOverrides.stats?.fileCount || 0,
				insertions: detailOverrides.stats?.added || 0,
				deletions: detailOverrides.stats?.removed || 0
			};
			if (hasValidDiff(diffs)) {
				this.changes = diffs;
			}
		}
	}

	isEqual(other: MainThreadChatSessionItem): boolean {
		return isEqual(this.resource, other.resource)
			&& this.label === other.label
			&& this.description === other.description
			&& this.status === other.status
			&& this.timing.created === other.timing.created
			&& this.timing.lastRequestStarted === other.timing.lastRequestStarted
			&& this.timing.lastRequestEnded === other.timing.lastRequestEnded
			&& equals(this.changes, other.changes)
			&& equals(this.iconPath, other.iconPath)
			&& stringOrMarkdownEqual(this.badge, other.badge)
			&& stringOrMarkdownEqual(this.tooltip, other.tooltip)
			&& this.archived === other.archived
			&& equals(this.metadata, other.metadata);
	}
}


@extHostNamedCustomer(MainContext.MainThreadChatSessions)
export class MainThreadChatSessions extends Disposable implements MainThreadChatSessionsShape {
	private readonly _itemControllerRegistrations = this._register(new DisposableMap<number, IDisposable & {
		readonly chatSessionType: string;
		readonly controller: MainThreadChatSessionItemController;
	}>());
	private readonly _contentProvidersRegistrations = this._register(new DisposableMap<number>());
	private readonly _sessionTypeToHandle = new Map<string, number>();

	private readonly _activeSessions = new ResourceMap<ObservableChatSession>();
	private readonly _sessionDisposables = new ResourceMap<IDisposable>();

	private readonly _proxy: ExtHostChatSessionsShape;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatTodoListService private readonly _chatTodoListService: IChatTodoListService,
		@IChatArtifactsService private readonly _chatArtifactsService: IChatArtifactsService,
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);

		this._register(this._chatSessionsService.onDidChangeSessionOptions(({ sessionResource, updates }) => {
			warnOnUntitledSessionResource(sessionResource, this._logService);
			const handle = this._getHandleForSessionType(sessionResource.scheme);
			this._logService.trace(`[MainThreadChatSessions] onRequestNotifyExtension received: scheme '${sessionResource.scheme}', handle ${handle}, ${updates.size} update(s)`);
			if (handle !== undefined) {
				this.notifyOptionsChange(handle, sessionResource, updates);
			} else {
				this._logService.warn(`[MainThreadChatSessions] Cannot notify option change for scheme '${sessionResource.scheme}': no provider registered. Registered schemes: [${Array.from(this._sessionTypeToHandle.keys()).join(', ')}]`);
			}
		}));

		this._register(this._agentSessionsService.model.onDidChangeSessionArchivedState(session => {
			for (const [handle, { chatSessionType }] of this._itemControllerRegistrations) {
				if (chatSessionType === session.providerType) {
					warnOnUntitledSessionResource(session.resource, this._logService);
					this._proxy.$onDidChangeChatSessionItemState(handle, session.resource, session.isArchived());
				}
			}
		}));
	}

	private _getHandleForSessionType(chatSessionType: string): number | undefined {
		return this._sessionTypeToHandle.get(chatSessionType);
	}

	$registerChatSessionItemController(handle: number, chatSessionType: string): void {
		const disposables = new DisposableStore();

		const controller = disposables.add(this._instantiationService.createInstance(MainThreadChatSessionItemController, this._proxy, chatSessionType, handle));
		disposables.add(this._chatSessionsService.registerChatSessionItemController(chatSessionType, controller));

		this._itemControllerRegistrations.set(handle, {
			chatSessionType,
			controller,
			dispose: () => disposables.dispose(),
		});

		// Fetch initial input state for new/untitled sessions
		this._refreshControllerInputState(handle, chatSessionType);
	}

	private _refreshControllerInputState(handle: number, chatSessionType: string): void {
		this._proxy.$provideChatSessionInputState(handle, undefined, CancellationToken.None).then(optionGroups => {
			if (optionGroups?.length) {
				this._applyOptionGroups(handle, chatSessionType, optionGroups);
			}
		}).catch(err => this._logService.error('Error fetching chat session input state', err));
	}

	private _applyOptionGroups(handle: number, chatSessionType: string, optionGroups: readonly IChatSessionProviderOptionGroup[]): void {
		const groupsWithCallbacks = optionGroups.map(group => ({
			...group,
			onSearch: group.searchable ? async (query: string, token: CancellationToken) => {
				return await this._proxy.$invokeOptionGroupSearch(handle, group.id, query, token);
			} : undefined,
		}));
		this._chatSessionsService.setOptionGroupsForSessionType(chatSessionType, handle, groupsWithCallbacks);
	}

	private getController(handle: number): MainThreadChatSessionItemController {
		const registration = this._itemControllerRegistrations.get(handle);
		if (!registration) {
			throw new Error(`No chat session controller registered for handle ${handle}`);
		}
		return registration.controller;
	}

	async $updateChatSessionItems(controllerHandle: number, change: IChatSessionItemsChange): Promise<void> {
		const controller = this.getController(controllerHandle);
		controller.acceptChange({
			addedOrUpdated: change.addedOrUpdated,
			removed: change.removed.map(uri => URI.revive(uri))
		});
	}

	async $addOrUpdateChatSessionItem(controllerHandle: number, item: Dto<IChatSessionItem>): Promise<void> {
		const controller = this.getController(controllerHandle);
		controller.acceptChange({
			addedOrUpdated: [item],
			removed: []
		});
	}

	$onDidChangeChatSessionOptions(handle: number, sessionResourceComponents: UriComponents, updates: Record<string, string | IChatSessionProviderOptionItem>): void {
		const sessionResource = URI.revive(sessionResourceComponents);
		warnOnUntitledSessionResource(sessionResource, this._logService);
		this._chatSessionsService.updateSessionOptions(sessionResource, ChatSessionOptionsMap.fromRecord(updates));
	}

	async $onDidCommitChatSessionItem(handle: number, originalComponents: UriComponents, modifiedCompoennts: UriComponents): Promise<void> {
		const originalResource = URI.revive(originalComponents);
		const modifiedResource = URI.revive(modifiedCompoennts);

		this._logService.trace(`$onDidCommitChatSessionItem: handle(${handle}), original(${originalResource}), modified(${modifiedResource})`);
		const chatSessionType = this._itemControllerRegistrations.get(handle)?.chatSessionType;
		if (!chatSessionType) {
			this._logService.error(`No chat session type found for provider handle ${handle}`);
			return;
		}

		const originalEditor = this._editorService.editors.find(editor => editor.resource?.toString() === originalResource.toString());
		const originalModel = this._chatService.acquireExistingSession(originalResource);
		const contribution = this._chatSessionsService.getAllChatSessionContributions().find(c => c.type === chatSessionType);

		try {

			// Migrate todos from old session to new session
			this._chatTodoListService.migrateTodos(originalResource, modifiedResource);

			// Migrate artifacts from old session to new session
			this._chatArtifactsService.getArtifacts(originalResource).migrate(this._chatArtifactsService.getArtifacts(modifiedResource));

			// Eagerly invoke debug providers for Copilot CLI sessions so the real
			// session appears in the debug panel immediately after the untitled →
			// real swap. Without this, the untitled session is filtered out (it
			// only has a "Load Hooks" event) and the real session has no events
			// until someone navigates to it — which can't happen because it's
			// not listed.
			if (chatSessionType === 'copilotcli') {
				// Fire-and-forget: don't block the editor swap. Errors are
				// handled internally by invokeProviders via onUnexpectedError.
				this._chatDebugService.invokeProviders(modifiedResource).catch(() => { /* handled internally */ });
			}

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
					? { editingSession: originalEditor.transferOutEditingSession(), inputState: originalModel?.object?.inputModel.toJSON() }
					: undefined;

				await this._editorService.replaceEditors([{
					editor: originalEditor,
					replacement: {
						resource: modifiedResource,
						options,
					},
				}], originalGroup);

				// Re-send queued requests from the original session on the committed session
				this._resendPendingRequests(originalResource, modifiedResource);
				return;
			}

			// If chat editor is in the side panel, then those are not listed as editors.
			// In that case we need to transfer editing session using the original model.
			if (originalModel) {
				newSession.transferredState = {
					editingSession: originalModel.object.editingSession,
					inputState: originalModel.object.inputModel.toJSON()
				};
			}

			const chatViewWidget = this._chatWidgetService.getWidgetBySessionResource(originalResource);
			if (chatViewWidget && isIChatViewViewContext(chatViewWidget.viewContext)) {
				await this._chatWidgetService.openSession(modifiedResource, undefined, { preserveFocus: true });
			} else {
				// Loading the session to ensure the session is created and editing session is transferred.
				const ref = await this._chatService.acquireOrLoadSession(modifiedResource, ChatAgentLocation.Chat, CancellationToken.None);
				ref?.dispose();
			}

			// Re-send queued requests from the original session on the committed session
			this._resendPendingRequests(originalResource, modifiedResource);

			// Notify listeners that the session has been committed
			this._chatSessionsService.fireSessionCommitted(originalResource, modifiedResource);
		} finally {
			originalModel?.dispose();
		}
	}

	/**
	 * Re-sends pending and in-flight requests from the original session on the committed session.
	 */
	private _resendPendingRequests(originalResource: URI, modifiedResource: URI): void {
		this._chatService.migrateRequests(originalResource, modifiedResource);
	}

	private async _provideChatSessionContent(providerHandle: number, sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		warnOnUntitledSessionResource(sessionResource, this._logService);

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
			const initialSessionOptions = this._chatSessionsService.getSessionOptions(sessionResource);
			await session.initialize(token, {
				initialSessionOptions: initialSessionOptions ? [...initialSessionOptions].map(([optionId, value]) => ({ optionId, value: typeof value === 'string' ? value : value?.id })) : undefined,
			});
			if (session.options) {
				for (const [_, handle] of this._sessionTypeToHandle) {
					if (handle === providerHandle) {
						for (const [optionId, value] of session.options) {
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

	$unregisterChatSessionItemController(handle: number): void {
		this._itemControllerRegistrations.deleteAndDispose(handle);
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
		warnOnUntitledSessionResource(resource, this._logService);

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

	$updateChatSessionInputState(controllerHandle: number, optionGroups: readonly IChatSessionProviderOptionGroup[]): void {
		const registration = this._itemControllerRegistrations.get(controllerHandle);
		if (!registration) {
			this._logService.warn(`No controller found for handle ${controllerHandle} when updating input state`);
			return;
		}

		this._applyOptionGroups(controllerHandle, registration.chatSessionType, optionGroups);
	}

	private _refreshProviderOptions(handle: number, chatSessionScheme: string): void {
		this._proxy.$provideChatSessionProviderOptions(handle, CancellationToken.None).then(options => {
			if (options?.optionGroups && options.optionGroups.length) {
				const groupsWithCallbacks = options.optionGroups.map(group => ({
					...group,
					onSearch: group.searchable ? async (query: string, token: CancellationToken) => {
						return await this._proxy.$invokeOptionGroupSearch(handle, group.id, query, token);
					} : undefined,
				}));
				this._chatSessionsService.setOptionGroupsForSessionType(chatSessionScheme, handle, groupsWithCallbacks);
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



	/**
	 * Notify the extension about option changes for a session
	 */
	async notifyOptionsChange(handle: number, sessionResource: URI, updates: ReadonlyMap<string, string | IChatSessionProviderOptionItem | undefined>): Promise<void> {
		this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: starting proxy call for handle ${handle}, sessionResource ${sessionResource}`);
		try {
			await this._proxy.$provideHandleOptionsChange(handle, sessionResource, Object.fromEntries(updates), CancellationToken.None);
			this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: proxy call completed for handle ${handle}, sessionResource ${sessionResource}`);
		} catch (error) {
			this._logService.error(`[MainThreadChatSessions] notifyOptionsChange: error for handle ${handle}, sessionResource ${sessionResource}:`, error);
		}
	}
}

function warnOnUntitledSessionResource(resource: URI, logService: ILogService): void {
	if (isUntitledChatSession(resource)) {
		logService.warn(`[MainThreadChatSessions] untitled-style sessionResource detected ${resource.toString()}`);
	}
}

function reviveMarkdownString(value: string | IMarkdownString | undefined): string | MarkdownString | undefined {
	if (!value) {
		return undefined;
	}

	// If it's already a string, return as-is
	if (typeof value === 'string') {
		return value;
	}

	// If it's a serialized IMarkdownString, revive it to MarkdownString
	if (typeof value === 'object' && 'value' in value) {
		return MarkdownString.lift(value);
	}

	return undefined;
}
