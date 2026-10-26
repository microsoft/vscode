/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService, ResponseModelState } from '../../common/chatService/chatService.js';
import type { ISerializableChatData } from '../../common/model/chatModel.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatSessionForkError, IChatSessionForkOptions, IChatSessionRequestHistoryItem, IChatSessionsService } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatTreeItem, ChatViewPaneTarget, IChatWidgetService } from '../chat.js';

export const ForkConversationActionId = 'workbench.action.chat.forkConversation';

export interface IForkConversationOptions extends IChatSessionForkOptions {
	readonly toSide?: boolean;
}

export class ForkConversationAction extends Action2 {
	constructor() {
		super({
			id: ForkConversationActionId,
			title: localize2('chat.forkConversation.label', "Fork Conversation"),
			tooltip: localize2('chat.forkConversation.tooltip', "Fork conversation from this point"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.repoForked,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.readOnly.negate()),
			menu: [
				{
					id: MenuId.ChatMessageCheckpoint,
					group: 'navigation',
					order: 3,
					when: ContextKeyExpr.and(
						ChatContextKeys.isRequest,
						ChatContextKeys.isFirstRequest.negate(),
						ContextKeyExpr.or(
							ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession),
							ChatContextKeys.chatSessionSupportsFork
						),
						ChatContextKeys.readOnly.negate()
					)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);
		const chatService = accessor.get(IChatService);
		const chatSessionsService = accessor.get(IChatSessionsService);
		const forkedTitlePrefix = localize('chat.forked.titlePrefix', "Forked: ");

		// When invoked via /fork slash command, args[0] is a URI (sessionResource).
		// Fork at the last request in that session.
		if (URI.isUri(args[0])) {
			const sourceSessionResource = args[0];
			const options = typeof args[1] === 'object' && args[1] !== null ? args[1] as IForkConversationOptions : undefined;

			// Check if this is a contributed session that supports forking
			const contentProviderSchemes = chatSessionsService.getContentProviderSchemes();
			if (contentProviderSchemes.includes(getChatSessionType(sourceSessionResource))) {
				try {
					if (await this._tryForkAsChat(instantiationService, sourceSessionResource, undefined, options)) {
						return;
					}
					return await this.forkContributedChatSession(sourceSessionResource, undefined, false, chatSessionsService, instantiationService, options);
				} catch (error) {
					await this._handleForkPromptError(error, sourceSessionResource, instantiationService, options);
					throw error;
				}
			}

			const chatModel = chatService.getSession(sourceSessionResource);
			if (!chatModel) {
				return;
			}

			const serializedData = chatModel.toJSON();
			if (serializedData.requests.length === 0) {
				return;
			}

			const cleanData = revive(JSON.parse(JSON.stringify(serializedData))) as ISerializableChatData;
			cleanData.sessionId = generateUuid();
			const forkTimestamp = Date.now();
			cleanData.creationDate = forkTimestamp;
			cleanData.customTitle = chatModel.title.startsWith(forkedTitlePrefix)
				? chatModel.title
				: localize('chat.forked.title', "Forked: {0}", chatModel.title);
			for (const [index, req] of cleanData.requests.entries()) {
				req.shouldBeRemovedOnSend = undefined;
				req.isHidden = undefined;
				// Generate fresh IDs so the tree doesn't reuse stale DOM from the source session
				req.requestId = generateUuid();
				req.responseId = req.responseId ? generateUuid() : undefined;
				req.timestamp = forkTimestamp + index;
				if (req.response) {
					req.modelState = { value: ResponseModelState.Complete, completedAt: forkTimestamp + index };
				}
			}

			const modelRef = chatService.loadSessionFromData(cleanData, 'ChatForkActions#forkCleanSession', 'currentSession');

			// Defer navigation until after the slash command flow completes.
			const newSessionResource = modelRef.object.sessionResource;
			setTimeout(async () => {
				try {
					await this._openForkedSession(instantiationService, chatModel.sessionResource, newSessionResource);
				} finally {
					modelRef.dispose();
				}
			}, 0);
			return;
		}

		// When invoked from the checkpoint menu, args[0] is a ChatTreeItem.
		const arg = args[0] as (IForkConversationOptions & { element?: unknown; context?: unknown; item?: unknown }) | undefined;
		const options: IForkConversationOptions | undefined = arg?.toSide === true ? { toSide: true } : undefined;
		let item: ChatTreeItem | undefined = isChatTreeItem(arg)
			? arg
			: isChatTreeItem(arg?.element)
				? arg.element
				: isChatTreeItem(arg?.context)
					? arg.context
					: isChatTreeItem(arg?.item)
						? arg.item
						: undefined;
		const widget = item ? chatWidgetService.getWidgetBySessionResource(item.sessionResource) : chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		const sessionResource = widget?.viewModel?.sessionResource ?? (isChatTreeItem(item) ? item.sessionResource : undefined);
		if (!sessionResource) {
			return;
		}

		// Get all requests and find the target request index
		const targetRequestId = isRequestVM(item) ? item.id : isResponseVM(item) ? item.requestId : undefined;
		if (!targetRequestId) {
			return;
		}

		// Check if this is a contributed session that supports forking
		const contentProviderSchemes = chatSessionsService.getContentProviderSchemes();
		if (contentProviderSchemes.includes(getChatSessionType(sessionResource))) {
			const contributedSession = await chatSessionsService.getOrCreateChatSession(sessionResource, CancellationToken.None);
			let request = contributedSession.history.find((entry): entry is IChatSessionRequestHistoryItem => entry.type === 'request' && entry.id === targetRequestId);
			if (!request) {
				const chatModel = chatService.getSession(sessionResource);
				const serializedData = chatModel?.toJSON();
				for (const [, entry] of serializedData?.requests.entries() ?? []) {
					if (entry.requestId === targetRequestId) {
						request = {
							id: entry.requestId,
							type: 'request',
							prompt: typeof entry.message === 'string' ? entry.message : entry.message.text,
							participant: entry.agent?.id ?? '',
							variableData: entry.variableData,
							modelId: entry.modelId,
						};
						break;
					}
				}
			}
			try {
				if (await this._tryForkAsChat(instantiationService, sessionResource, request, options)) {
					return;
				}
				return await this.forkContributedChatSession(sessionResource, request, true, chatSessionsService, instantiationService, options);
			} catch (error) {
				await this._handleForkPromptError(error, sessionResource, instantiationService, options);
				throw error;
			}
		}

		const chatModel = chatService.getSession(sessionResource);
		if (!chatModel) {
			return;
		}

		// Export the full session data and truncate to include only requests up to and including the target
		const serializedData = chatModel.toJSON();
		const isRequestItem = isRequestVM(item);
		let targetIndex = -1;
		if (widget?.viewModel) {
			let requestIndex = -1;
			for (const entry of widget.viewModel.getItems()) {
				if (isRequestVM(entry)) {
					requestIndex += 1;
				}
				if (entry.id === item?.id) {
					targetIndex = isRequestVM(entry) ? Math.max(0, requestIndex - 1) : requestIndex;
					break;
				}
			}
		}
		if (targetIndex < 0) {
			const requestIndex = chatModel.getRequests().findIndex(r => r.id === targetRequestId);
			targetIndex = isRequestItem ? Math.max(0, requestIndex - 1) : requestIndex;
		}
		if (targetIndex < 0) {
			return;
		}

		const forkedData = revive(JSON.parse(JSON.stringify({
			...serializedData,
			requests: serializedData.requests.slice(0, targetIndex + 1),
		}))) as ISerializableChatData;
		forkedData.sessionId = generateUuid();
		const forkedTimestamp = Date.now();
		forkedData.creationDate = forkedTimestamp;
		forkedData.customTitle = chatModel.title.startsWith(forkedTitlePrefix)
			? chatModel.title
			: localize('chat.forked.title', "Forked: {0}", chatModel.title);
		for (const [index, req] of forkedData.requests.entries()) {
			req.shouldBeRemovedOnSend = undefined;
			req.isHidden = undefined;
			// Generate fresh IDs so the tree doesn't reuse stale DOM from the source session
			req.requestId = generateUuid();
			req.responseId = req.responseId ? generateUuid() : undefined;
			req.timestamp = forkedTimestamp + index;
			if (req.response) {
				req.modelState = { value: ResponseModelState.Complete, completedAt: forkedTimestamp + index };
			}
		}

		const modelRef = chatService.loadSessionFromData(forkedData, 'ChatForkActions#forkSession', 'currentSession');

		if (!modelRef) {
			return;
		}

		// Navigate to the new session in the chat view pane
		try {
			const newSessionResource = modelRef.object.sessionResource;
			await this._openForkedSession(instantiationService, chatModel.sessionResource, newSessionResource, options);
		} finally {
			modelRef.dispose();
		}
	}

	protected async _openForkedSession(instantiationService: IInstantiationService, parentSessionResource: URI, forkedSessionResource: URI, _options?: IForkConversationOptions): Promise<void> {
		await instantiationService.invokeFunction(async accessor => {
			const chatWidgetService = accessor.get(IChatWidgetService);
			await chatWidgetService.openSession(forkedSessionResource, ChatViewPaneTarget, { sessionTypeSelectionReason: 'currentSession' });
		});
	}

	/**
	 * Hook for surfaces (the Agents window) that prefer to fork a multi-chat
	 * session into a new peer chat in the same session rather than a brand-new
	 * session. Returns `true` when it fully handled the fork; the default
	 * implementation does nothing and returns `false`, so the standard
	 * session-creating fork path runs.
	 */
	protected async _tryForkAsChat(_instantiationService: IInstantiationService, _sourceSessionResource: URI, _request: IChatSessionRequestHistoryItem | undefined, _options?: IForkConversationOptions): Promise<boolean> {
		return false;
	}

	private readonly pendingForks = new Set<{ readonly key: string; readonly context: object | undefined; readonly promise: Promise<void> }>();

	private async forkContributedChatSession(sourceSessionResource: URI, request: IChatSessionRequestHistoryItem | undefined, openForkedSessionImmediately: boolean, chatSessionsService: IChatSessionsService, instantiationService: IInstantiationService, options?: IForkConversationOptions) {
		const title = options?.title?.trim() || undefined;
		const forkOptions: IChatSessionForkOptions | undefined = title || options?.initialMessage
			? { ...(title ? { title } : {}), ...(options?.initialMessage ? { initialMessage: options.initialMessage } : {}), ...(options?.sourceRequestId ? { sourceRequestId: options.sourceRequestId } : {}) }
			: undefined;
		const initialMessage = options?.initialMessage;
		const pendingKey = JSON.stringify([sourceSessionResource.toString(), request?.id, options?.sourceRequestId, title, initialMessage?.text, initialMessage?.textOffset]);
		const context = initialMessage?.requestOptions ?? initialMessage;
		for (const pending of this.pendingForks) {
			if (pending.key === pendingKey && pending.context === context) {
				return pending.promise;
			}
		}

		const forkPromise = (async () => {
			const cts = new CancellationTokenSource();
			try {
				const forkedItem = await chatSessionsService.forkChatSession(sourceSessionResource, request, cts.token, forkOptions);
				const open = () => this._openForkedSession(instantiationService, sourceSessionResource, forkedItem.resource, options);
				if (openForkedSessionImmediately || options?.initialMessage) {
					try {
						await open();
					} catch (error) {
						if (options?.initialMessage) {
							throw new ChatSessionForkError(forkedItem.resource, error);
						}
						throw error;
					}
				} else {
					setTimeout(open, 0);
				}
			} finally {
				cts.dispose();
			}
		})();

		const pending = { key: pendingKey, context, promise: forkPromise };
		this.pendingForks.add(pending);
		try {
			await forkPromise;
		} finally {
			this.pendingForks.delete(pending);
		}
	}

	private async _handleForkPromptError(error: unknown, sourceSessionResource: URI, instantiationService: IInstantiationService, options: IForkConversationOptions | undefined): Promise<void> {
		if (!options?.initialMessage || isCancellationError(error)) {
			return;
		}
		if (error instanceof ChatSessionForkError) {
			await instantiationService.invokeFunction(accessor => {
				const notificationService = accessor.get(INotificationService);
				notificationService.prompt(
					Severity.Warning,
					localize('chat.forkInitialMessageUnknown', "The fork request outcome is unknown: {0}. Inspect the target before sending the prompt again.", toErrorMessage(error.cause)),
					[{
						label: localize('chat.fork.inspectTarget', "Inspect Target"),
						run: async () => {
							try {
								await this._openForkedSession(instantiationService, sourceSessionResource, error.target, options);
							} catch (openError) {
								notificationService.error(localize('chat.fork.inspectTargetFailed', "The forked chat could not be opened: {0}.", toErrorMessage(openError)));
							}
						}
					}]
				);
			});
			return;
		}
		await instantiationService.invokeFunction(accessor => {
			accessor.get(INotificationService).error(localize('chat.forkInitialMessageFailed', "The fork could not be created: {0}.", toErrorMessage(error)));
		});
	}
}
