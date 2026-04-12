/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
export function registerChatForkActions() {
    registerAction2(class ForkConversationAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.forkConversation',
                title: localize2('chat.forkConversation.label', "Fork Conversation"),
                tooltip: localize2('chat.forkConversation.tooltip', "Fork conversation from this point"),
                f1: false,
                category: CHAT_CATEGORY,
                icon: Codicon.repoForked,
                precondition: ChatContextKeys.enabled,
                menu: [
                    {
                        id: MenuId.ChatMessageCheckpoint,
                        group: 'navigation',
                        order: 3,
                        when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.isFirstRequest.negate(), ContextKeyExpr.or(ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.chatSessionSupportsFork))
                    }
                ]
            });
            this.pendingFork = new Map();
        }
        async run(accessor, ...args) {
            const chatWidgetService = accessor.get(IChatWidgetService);
            const chatService = accessor.get(IChatService);
            const chatSessionsService = accessor.get(IChatSessionsService);
            const forkedTitlePrefix = localize('chat.forked.titlePrefix', "Forked: ");
            // When invoked via /fork slash command, args[0] is a URI (sessionResource).
            // Fork at the last request in that session.
            if (URI.isUri(args[0])) {
                const sourceSessionResource = args[0];
                // Check if this is a contributed session that supports forking
                const contentProviderSchemes = chatSessionsService.getContentProviderSchemes();
                if (contentProviderSchemes.includes(sourceSessionResource.scheme)) {
                    return await this.forkContributedChatSession(sourceSessionResource, undefined, false, chatSessionsService, chatWidgetService);
                }
                const chatModel = chatService.getSession(sourceSessionResource);
                if (!chatModel) {
                    return;
                }
                const serializedData = chatModel.toJSON();
                if (serializedData.requests.length === 0) {
                    return;
                }
                const cleanData = revive(JSON.parse(JSON.stringify(serializedData)));
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
                        req.modelState = { value: 1 /* ResponseModelState.Complete */, completedAt: forkTimestamp + index };
                    }
                }
                const modelRef = chatService.loadSessionFromData(cleanData, 'ChatForkActions#forkCleanSession');
                // Defer navigation until after the slash command flow completes.
                const newSessionResource = modelRef.object.sessionResource;
                setTimeout(async () => {
                    try {
                        await chatWidgetService.openSession(newSessionResource, ChatViewPaneTarget);
                    }
                    finally {
                        modelRef.dispose();
                    }
                }, 0);
                return;
            }
            // When invoked from the checkpoint menu, args[0] is a ChatTreeItem.
            const arg = args[0];
            let item = isChatTreeItem(arg)
                ? arg
                : isChatTreeItem(arg?.element)
                    ? arg.element
                    : isChatTreeItem(arg?.context)
                        ? arg.context
                        : isChatTreeItem(arg?.item)
                            ? arg.item
                            : undefined;
            const widget = (item && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
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
            if (contentProviderSchemes.includes(sessionResource.scheme)) {
                const contributedSession = await chatSessionsService.getOrCreateChatSession(sessionResource, CancellationToken.None);
                let request = contributedSession.history.find((entry) => entry.type === 'request' && entry.id === targetRequestId);
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
                return await this.forkContributedChatSession(sessionResource, request, true, chatSessionsService, chatWidgetService);
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
            })));
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
                    req.modelState = { value: 1 /* ResponseModelState.Complete */, completedAt: forkedTimestamp + index };
                }
            }
            const modelRef = chatService.loadSessionFromData(forkedData, 'ChatForkActions#forkSession');
            if (!modelRef) {
                return;
            }
            // Navigate to the new session in the chat view pane
            try {
                const newSessionResource = modelRef.object.sessionResource;
                await chatWidgetService.openSession(newSessionResource, ChatViewPaneTarget);
            }
            finally {
                modelRef.dispose();
            }
        }
        async forkContributedChatSession(sourceSessionResource, request, openForkedSessionImmediately, chatSessionsService, chatWidgetService) {
            const pendingKey = `${sourceSessionResource.toString()}@${request?.id ?? 'full'}`;
            const pending = this.pendingFork.get(pendingKey);
            if (pending) {
                return pending;
            }
            const forkPromise = forkContributedChatSession(sourceSessionResource, request, openForkedSessionImmediately, chatSessionsService, chatWidgetService);
            this.pendingFork.set(pendingKey, forkPromise);
            try {
                await forkPromise;
            }
            finally {
                this.pendingFork.delete(pendingKey);
            }
        }
    });
}
async function forkContributedChatSession(sourceSessionResource, request, openForkedSessionImmediately, chatSessionsService, chatWidgetService) {
    const cts = new CancellationTokenSource();
    try {
        const forkedItem = await chatSessionsService.forkChatSession(sourceSessionResource, request, cts.token);
        if (openForkedSessionImmediately) {
            await chatWidgetService.openSession(forkedItem.resource, ChatViewPaneTarget);
        }
        else {
            setTimeout(async () => {
                await chatWidgetService.openSession(forkedItem.resource, ChatViewPaneTarget);
            }, 0);
        }
    }
    finally {
        cts.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEZvcmtBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEZvcmtBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUV6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0YsT0FBTyxFQUFFLFlBQVksRUFBc0IsTUFBTSx5Q0FBeUMsQ0FBQztBQUUzRixPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRyxPQUFPLEVBQWtDLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDM0csT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2pELE9BQU8sRUFBZ0Isa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENB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