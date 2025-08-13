/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ChatViewId } from '../../contrib/chat/browser/chat.js';
import { ChatViewPane } from '../../contrib/chat/browser/chatViewPane.js';
import { IChatAgentRequest } from '../../contrib/chat/common/chatAgents.js';
import { IChatContentInlineReference, IChatProgress } from '../../contrib/chat/common/chatService.js';
import { ChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatSessionUri } from '../../contrib/chat/common/chatUri.js';
import { EditorGroupColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { ExtHostChatSessionsShape, ExtHostContext, IChatProgressDto, MainContext, MainThreadChatSessionsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatSessions)
export class MainThreadChatSessions extends Disposable implements MainThreadChatSessionsShape {
	private readonly _itemProvidersRegistrations = this._register(new DisposableMap<number, IDisposable & {
		readonly provider: IChatSessionItemProvider;
		readonly onDidChangeItems: Emitter<void>;
	}>());
	private readonly _contentProvidersRegistrations = this._register(new DisposableMap<number>());

	// Store progress emitters for active sessions: key is `${handle}_${sessionId}_${requestId}`
	private readonly _activeProgressEmitters = new Map<string, Emitter<IChatProgress[]>>();

	// Store completion emitters for sessions: key is `${handle}_${sessionId}_${requestId}`
	private readonly _completionEmitters = new Map<string, Emitter<void>>();

	// Store pending progress chunks for sessions that haven't set up emitters yet
	private readonly _pendingProgressChunks = new Map<string, (IChatProgressDto | [IChatProgressDto, number])[]>();

	private readonly _proxy: ExtHostChatSessionsShape;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
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
			provideChatSessionItems: (token) => this._provideChatSessionItems(handle, token)
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

	private async _provideChatSessionItems(handle: number, token: CancellationToken): Promise<IChatSessionItem[]> {
		try {
			// Get all results as an array from the RPC call
			const sessions = await this._proxy.$provideChatSessionItems(handle, token);
			return sessions.map(session => ({
				...session,
				id: session.id,
				iconPath: session.iconPath ? this._reviveIconPath(session.iconPath) : undefined,
				tooltip: session.tooltip ? this._reviveTooltip(session.tooltip) : undefined
			}));
		} catch (error) {
			this._logService.error('Error providing chat sessions:', error);
		}
		return [];
	}

	private async _provideChatSessionContent(providerHandle: number, id: string, token: CancellationToken): Promise<ChatSession> {
		try {
			const sessionContent = await raceCancellationError(this._proxy.$provideChatSessionContent(providerHandle, id, token), token);

			const progressEmitter = new Emitter<IChatProgress[]>;
			const completionEmitter = new Emitter<void>();
			let progressEvent: Event<IChatProgress[]> | undefined = undefined;
			let interruptActiveResponseCallback: (() => Promise<boolean>) | undefined = undefined;
			if (sessionContent.hasActiveResponseCallback) {
				const requestId = 'ongoing';
				// set progress
				progressEvent = progressEmitter.event;
				// store the event emitter using a key that combines handle and session id
				const progressKey = `${providerHandle}_${id}_${requestId}`;
				interruptActiveResponseCallback = async () => {
					return this._dialogService.confirm({
						message: localize('interruptActiveResponse', 'Are you sure you want to interrupt the active session?')
					}).then(confirmed => {
						if (confirmed.confirmed) {
							this._proxy.$interruptChatSessionActiveResponse(providerHandle, id, requestId);
							return true;
						} else {
							progressEmitter.fire([{
								kind: 'progressMessage',
								content: { value: '' }
							}]);
							return false;
						}
					});
				};
				this._activeProgressEmitters.set(progressKey, progressEmitter);
				this._completionEmitters.set(progressKey, completionEmitter);
			}

			let requestHandler: ((request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any, token: CancellationToken) => Promise<void>) | undefined;

			if (sessionContent.hasRequestHandler) {
				requestHandler = async (request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any, token: CancellationToken) => {
					const progressKey = `${providerHandle}_${id}_${request.requestId}`;
					const _progressEmitter = new Emitter<IChatProgress[]>;
					this._activeProgressEmitters.set(progressKey, _progressEmitter);
					_progressEmitter.event(e => {
						progress(e);
					});

					await this._proxy.$invokeChatSessionRequestHandler(providerHandle, id, request, [], token);
				};
			}

			const onWillDisposeEventEmitter = new Emitter<void>();

			return {
				id: sessionContent.id,
				onWillDispose: onWillDisposeEventEmitter.event,
				history: sessionContent.history.map(turn => {
					if (turn.type === 'request') {
						return { type: 'request', prompt: turn.prompt };
					}

					return {
						type: 'response',
						parts: turn.parts.map(part => revive(part) as IChatProgress)
					};
				}),
				progressEvent: progressEvent,
				requestHandler: requestHandler,
				interruptActiveResponseCallback: interruptActiveResponseCallback,
				dispose: () => {
					onWillDisposeEventEmitter.fire();
					onWillDisposeEventEmitter.dispose();
					progressEmitter.dispose();
					completionEmitter.dispose();
					this._proxy.$disposeChatSessionContent(providerHandle, sessionContent.id);
				},
			};
		} catch (error) {
			this._logService.error(`Error providing chat session content for handle ${providerHandle} and id ${id}:`, error);
			throw error; // Re-throw to propagate the error
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
	}

	async $handleProgressChunk(handle: number, sessionId: string, requestId: string, chunks: (IChatProgressDto | [IChatProgressDto, number])[]): Promise<void> {
		const progressKey = `${handle}_${sessionId}_${requestId}`;
		const progressEmitter = this._activeProgressEmitters.get(progressKey);

		if (!progressEmitter) {
			// If the progress emitter hasn't been set up yet, store the chunks for later
			const existingChunks = this._pendingProgressChunks.get(progressKey) || [];
			this._pendingProgressChunks.set(progressKey, [...existingChunks, ...chunks]);
			this._logService.debug(`Storing pending progress chunks for handle ${handle}, sessionId ${sessionId}, requestId ${requestId}`);
			return;
		}

		// First, flush any pending chunks that were stored before the emitter was ready
		const pendingChunks = this._pendingProgressChunks.get(progressKey);
		if (pendingChunks && pendingChunks.length > 0) {
			this._logService.debug(`Flushing ${pendingChunks.length} pending progress chunks for handle ${handle}, sessionId ${sessionId}, requestId ${requestId}`);

			const pendingProgressParts: IChatProgress[] = pendingChunks.map(chunk => {
				const [progress] = Array.isArray(chunk) ? chunk : [chunk];
				return revive(progress) as IChatProgress;
			});

			progressEmitter.fire(pendingProgressParts);
			this._pendingProgressChunks.delete(progressKey);
		}

		// Then emit the current chunks
		const chatProgressParts: IChatProgress[] = chunks.map(chunk => {
			const [progress] = Array.isArray(chunk) ? chunk : [chunk];
			return revive(progress) as IChatProgress;
		});

		progressEmitter.fire(chatProgressParts);
	}

	$handleProgressComplete(handle: number, sessionId: string, requestId: string) {
		const progressKey = `${handle}_${sessionId}_${requestId}`;
		const progressEmitter = this._activeProgressEmitters.get(progressKey);
		const completionEmitter = this._completionEmitters.get(progressKey);

		if (!progressEmitter) {
			this._logService.warn(`No progress emitter found for handle ${handle} and requestId ${requestId}`);
			return;
		}

		// TODO: Fire a completion event through the progress emitter
		const completionProgress: IChatProgress = {
			kind: 'progressMessage',
			content: { value: 'Session completed', isTrusted: false }
		};
		progressEmitter.fire([completionProgress]);

		// Fire completion event if someone is listening
		if (completionEmitter) {
			completionEmitter.fire();
		}

		// Clean up the emitters and any pending chunks
		progressEmitter.dispose();
		completionEmitter?.dispose();
		this._activeProgressEmitters.delete(progressKey);
		this._completionEmitters.delete(progressKey);
		this._pendingProgressChunks.delete(progressKey);
	}

	$handleAnchorResolve(handle: number, sessionId: string, requestId: string, requestHandle: string, anchor: Dto<IChatContentInlineReference>): void {
		// throw new Error('Method not implemented.');
	}

	override dispose(): void {
		// Clean up all active progress emitters
		for (const emitter of this._activeProgressEmitters.values()) {
			emitter.dispose();
		}
		this._activeProgressEmitters.clear();

		// Clean up all completion emitters
		for (const emitter of this._completionEmitters.values()) {
			emitter.dispose();
		}
		this._completionEmitters.clear();

		// Clean up all pending progress chunks
		this._pendingProgressChunks.clear();

		super.dispose();
	}

	private _reviveIconPath(
		iconPath: UriComponents | { light: UriComponents; dark: UriComponents } | { id: string; color?: { id: string } | undefined })
		: IChatSessionItem['iconPath'] {
		if (!iconPath) {
			return undefined;
		}

		// Handle ThemeIcon (has id property)
		if (typeof iconPath === 'object' && 'id' in iconPath) {
			return iconPath; // ThemeIcon doesn't need conversion
		}

		// handle single URI
		if (typeof iconPath === 'object' && 'scheme' in iconPath) {
			return URI.revive(iconPath);
		}

		// Handle light/dark theme icons
		if (typeof iconPath === 'object' && ('light' in iconPath && 'dark' in iconPath)) {
			return {
				light: URI.revive(iconPath.light),
				dark: URI.revive(iconPath.dark)
			};
		}
		return undefined;
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
