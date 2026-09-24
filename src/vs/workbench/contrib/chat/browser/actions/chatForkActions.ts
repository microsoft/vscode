/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService, ResponseModelState } from '../../common/chatService/chatService.js';
import { getChatSessionTelemetryContext } from '../../common/chatService/chatServiceTelemetry.js';
import type { ISerializableChatData } from '../../common/model/chatModel.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { IChatSessionRequestHistoryItem, IChatSessionsService } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatTreeItem, ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { chatUserInteractionTimingTracker, IChatUserInteractionTimer } from '../chatUserInteractionTelemetry.js';

export const ForkConversationActionId = 'workbench.action.chat.forkConversation';

export interface IForkConversationOptions {
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
		const window = DOM.getActiveWindow();
		const interaction = chatUserInteractionTimingTracker.start('fork', window);
		const chatWidgetService = accessor.get(IChatWidgetService);
		try {
			const resource = await this._run(accessor, interaction, ...args);
			if (!resource) {
				chatUserInteractionTimingTracker.cancel(interaction, 'notDispatched');
				return;
			}
			const widget = chatWidgetService.getWidgetBySessionResource(resource);
			if (!widget?.visible || !isEqual(widget.viewModel?.sessionResource, resource)) {
				chatUserInteractionTimingTracker.cancel(interaction, 'completedWithoutProgress');
				return;
			}
			chatUserInteractionTimingTracker.completeAfterRender(interaction, DOM.getWindow(widget.domNode), () => widget.visible && isEqual(widget.viewModel?.sessionResource, resource));
		} catch (error) {
			chatUserInteractionTimingTracker.cancel(interaction, isCancellationError(error) ? 'cancelled' : 'error');
			throw error;
		}
	}

	private async _run(accessor: ServicesAccessor, interaction: IChatUserInteractionTimer, ...args: unknown[]): Promise<URI | undefined> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);
		const chatService = accessor.get(IChatService);
		const chatSessionsService = accessor.get(IChatSessionsService);
		const forkedTitlePrefix = localize('chat.forked.titlePrefix', "Forked: ");

		// When invoked via /fork slash command, args[0] is a URI (sessionResource).
		// Fork at the last request in that session.
		if (URI.isUri(args[0])) {
			const sourceSessionResource = args[0];
			chatUserInteractionTimingTracker.setContext(interaction, getChatSessionTelemetryContext(sourceSessionResource));

			// Check if this is a contributed session that supports forking
			const contentProviderSchemes = chatSessionsService.getContentProviderSchemes();
			if (contentProviderSchemes.includes(getChatSessionType(sourceSessionResource))) {
				const forkedChat = await this._tryForkAsChat(instantiationService, sourceSessionResource, undefined);
				if (forkedChat) {
					return forkedChat;
				}
				return await this.forkContributedChatSession(sourceSessionResource, undefined, false, chatSessionsService, instantiationService);
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
			try {
				await timeout(0);
				await this._openForkedSession(instantiationService, chatModel.sessionResource, newSessionResource);
				return newSessionResource;
			} finally {
				modelRef.dispose();
			}
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
		chatUserInteractionTimingTracker.setContext(interaction, {
			...getChatSessionTelemetryContext(sessionResource),
			requestId: targetRequestId,
		});

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
			const forkedChat = await this._tryForkAsChat(instantiationService, sessionResource, request, options);
			if (forkedChat) {
				return forkedChat;
			}
			return await this.forkContributedChatSession(sessionResource, request, true, chatSessionsService, instantiationService, options);
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
			return newSessionResource;
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
	 * session. Returns the opened chat resource when it fully handled the fork;
	 * the default implementation returns `undefined`, so the standard
	 * session-creating fork path runs.
	 */
	protected async _tryForkAsChat(_instantiationService: IInstantiationService, _sourceSessionResource: URI, _request: IChatSessionRequestHistoryItem | undefined, _options?: IForkConversationOptions): Promise<URI | undefined> {
		return undefined;
	}

	private pendingFork = new Map<string, Promise<URI>>();

	private async forkContributedChatSession(sourceSessionResource: URI, request: IChatSessionRequestHistoryItem | undefined, openForkedSessionImmediately: boolean, chatSessionsService: IChatSessionsService, instantiationService: IInstantiationService, options?: IForkConversationOptions) {
		const pendingKey = `${sourceSessionResource.toString()}@${request?.id ?? 'full'}`;
		const pending = this.pendingFork.get(pendingKey);
		if (pending) {
			return pending;
		}

		const forkPromise = (async () => {
			const cts = new CancellationTokenSource();
			try {
				const forkedItem = await chatSessionsService.forkChatSession(sourceSessionResource, request, cts.token);
				const open = () => this._openForkedSession(instantiationService, sourceSessionResource, forkedItem.resource, options);
				if (!openForkedSessionImmediately) {
					await timeout(0);
				}
				await open();
				return forkedItem.resource;
			} finally {
				cts.dispose();
			}
		})();

		this.pendingFork.set(pendingKey, forkPromise);
		try {
			return await forkPromise;
		} finally {
			this.pendingFork.delete(pendingKey);
		}
	}
}
