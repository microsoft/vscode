/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';
const editingQueue = ChatContextKeys.editingRequestType.isEqualTo("q" /* ChatContextKeys.EditingRequestType.Queue */);
const editingSteer = ChatContextKeys.editingRequestType.isEqualTo("st" /* ChatContextKeys.EditingRequestType.Steer */);
const editingQueueOrSteer = ContextKeyExpr.or(editingQueue, editingSteer);
const queuingActionsPresent = ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.requestInProgress, editingQueueOrSteer), ChatContextKeys.editingRequestType.notEqualsTo("s" /* ChatContextKeys.EditingRequestType.Sent */));
const steerIsDefault = ContextKeyExpr.equals(`config.${ChatConfiguration.RequestQueueingDefaultAction}`, 'steer');
const queueIsDefault = steerIsDefault.negate();
// The effective default respects the editing context: when editing a queued/steer
// message, the default matches that message type regardless of the config setting.
const effectiveDefaultIsQueue = ContextKeyExpr.or(ContextKeyExpr.and(queueIsDefault, editingQueueOrSteer.negate()), editingQueue);
const effectiveDefaultIsSteer = ContextKeyExpr.or(ContextKeyExpr.and(steerIsDefault, editingQueueOrSteer.negate()), editingSteer);
function isRemovePendingRequestContext(context) {
    return !!context &&
        typeof context === 'object' &&
        'sessionResource' in context &&
        'pendingRequestId' in context &&
        URI.isUri(context.sessionResource) &&
        typeof context.pendingRequestId === 'string';
}
export class ChatQueueMessageAction extends Action2 {
    static { this.ID = 'workbench.action.chat.queueMessage'; }
    constructor() {
        super({
            id: ChatQueueMessageAction.ID,
            title: localize2('chat.queueMessage', "Add to Queue"),
            tooltip: localize('chat.queueMessage.tooltip', "Queue this message to send after the current request completes"),
            icon: Codicon.add,
            f1: false,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(queuingActionsPresent, ChatContextKeys.inputHasText),
            keybinding: [{
                    when: ContextKeyExpr.and(ChatContextKeys.inChatInput, queuingActionsPresent, effectiveDefaultIsSteer),
                    primary: 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 1
                }, {
                    when: ContextKeyExpr.and(ChatContextKeys.inChatInput, queuingActionsPresent, effectiveDefaultIsQueue),
                    primary: 3 /* KeyCode.Enter */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 1
                }],
        });
    }
    run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (!widget?.viewModel) {
            return;
        }
        const inputValue = widget.getInput();
        if (!inputValue.trim()) {
            return;
        }
        widget.acceptInput(undefined, { queue: "queued" /* ChatRequestQueueKind.Queued */ });
    }
}
export class ChatSteerWithMessageAction extends Action2 {
    static { this.ID = 'workbench.action.chat.steerWithMessage'; }
    constructor() {
        super({
            id: ChatSteerWithMessageAction.ID,
            title: localize2('chat.steerWithMessage', "Steer with Message"),
            tooltip: localize('chat.steerWithMessage.tooltip', "Send this message at the next opportunity, signaling the current request to yield"),
            icon: Codicon.arrowUp,
            f1: false,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(queuingActionsPresent, ChatContextKeys.inputHasText),
            keybinding: [{
                    when: ContextKeyExpr.and(ChatContextKeys.inChatInput, queuingActionsPresent, effectiveDefaultIsSteer),
                    primary: 3 /* KeyCode.Enter */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 1
                }, {
                    when: ContextKeyExpr.and(ChatContextKeys.inChatInput, queuingActionsPresent, effectiveDefaultIsQueue),
                    primary: 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 1
                }],
        });
    }
    run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (!widget?.viewModel) {
            return;
        }
        const inputValue = widget.getInput();
        if (!inputValue.trim()) {
            return;
        }
        widget.acceptInput(undefined, { queue: "steering" /* ChatRequestQueueKind.Steering */ });
    }
}
export class ChatRemovePendingRequestAction extends Action2 {
    static { this.ID = 'workbench.action.chat.removePendingRequest'; }
    constructor() {
        super({
            id: ChatRemovePendingRequestAction.ID,
            title: localize2('chat.removePendingRequest', "Remove from Queue"),
            icon: Codicon.close,
            f1: false,
            category: CHAT_CATEGORY,
            menu: [{
                    id: MenuId.ChatMessageTitle,
                    group: 'navigation',
                    order: 4,
                    when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.isPendingRequest)
                }]
        });
    }
    run(accessor, ...args) {
        const chatService = accessor.get(IChatService);
        const [context] = args;
        // Support both toolbar context (IChatRequestViewModel) and command context (IChatRemovePendingRequestContext)
        if (isRequestVM(context) && context.pendingKind) {
            chatService.removePendingRequest(context.sessionResource, context.id);
            return;
        }
        if (isRemovePendingRequestContext(context)) {
            chatService.removePendingRequest(context.sessionResource, context.pendingRequestId);
            return;
        }
    }
}
export class ChatSendPendingImmediatelyAction extends Action2 {
    static { this.ID = 'workbench.action.chat.sendPendingImmediately'; }
    constructor() {
        super({
            id: ChatSendPendingImmediatelyAction.ID,
            title: localize2('chat.sendPendingImmediately', "Send Immediately"),
            icon: Codicon.arrowUp,
            f1: false,
            category: CHAT_CATEGORY,
            menu: [{
                    id: MenuId.ChatMessageTitle,
                    group: 'navigation',
                    order: 3,
                    when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.isPendingRequest)
                }]
        });
    }
    async run(accessor, ...args) {
        const chatService = accessor.get(IChatService);
        const widgetService = accessor.get(IChatWidgetService);
        const [context] = args;
        if (!isRequestVM(context) || !context.pendingKind) {
            return;
        }
        const widget = widgetService.getWidgetBySessionResource(context.sessionResource);
        const model = widget?.viewModel?.model;
        if (!model) {
            return;
        }
        const pendingRequests = model.getPendingRequests();
        const targetIndex = pendingRequests.findIndex(r => r.request.id === context.id);
        if (targetIndex === -1) {
            return;
        }
        // Keep the target item's kind (queued vs steering)
        const targetRequest = pendingRequests[targetIndex];
        // Reorder: move target to front, keep others in their relative order
        const reordered = [
            { requestId: targetRequest.request.id, kind: targetRequest.kind },
            ...pendingRequests.filter((_, i) => i !== targetIndex).map(r => ({ requestId: r.request.id, kind: r.kind }))
        ];
        chatService.setPendingRequests(context.sessionResource, reordered);
        await chatService.cancelCurrentRequestForSession(context.sessionResource, 'queueRunNext');
        chatService.processPendingRequests(context.sessionResource);
    }
}
export class ChatRemoveAllPendingRequestsAction extends Action2 {
    static { this.ID = 'workbench.action.chat.removeAllPendingRequests'; }
    constructor() {
        super({
            id: ChatRemoveAllPendingRequestsAction.ID,
            title: localize2('chat.removeAllPendingRequests', "Remove All Queued"),
            icon: Codicon.clearAll,
            f1: false,
            category: CHAT_CATEGORY,
            menu: [{
                    id: MenuId.ChatContext,
                    group: 'navigation',
                    order: 3,
                    when: ChatContextKeys.hasPendingRequests,
                }],
        });
    }
    run(accessor, ...args) {
        const chatService = accessor.get(IChatService);
        const widgetService = accessor.get(IChatWidgetService);
        const [context] = args;
        const widget = (isRequestVM(context) && widgetService.getWidgetBySessionResource(context.sessionResource)) || widgetService.lastFocusedWidget;
        const model = widget?.viewModel?.model;
        if (!model) {
            return;
        }
        for (const pendingRequest of [...model.getPendingRequests()]) {
            chatService.removePendingRequest(model.sessionResource, pendingRequest.request.id);
        }
    }
}
export function registerChatQueueActions() {
    registerAction2(ChatQueueMessageAction);
    registerAction2(ChatSteerWithMessageAction);
    registerAction2(ChatRemovePendingRequestAction);
    registerAction2(ChatSendPendingImmediatelyAction);
    registerAction2(ChatRemoveAllPendingRequestsAction);
    // Register the queue submenu in the execute toolbar.
    // The custom ChatQueuePickerActionItem (registered via IActionViewItemService)
    // replaces the default rendering with a dropdown that shows hover descriptions.
    // We still need items in ChatExecuteQueue so the menu system treats it as non-empty.
    MenuRegistry.appendMenuItem(MenuId.ChatExecuteQueue, {
        command: { id: ChatQueueMessageAction.ID, title: localize2('chat.queueMessage', "Add to Queue"), icon: Codicon.add },
        group: 'navigation',
        order: 1,
    });
    MenuRegistry.appendMenuItem(MenuId.ChatExecuteQueue, {
        command: { id: ChatSteerWithMessageAction.ID, title: localize2('chat.steerWithMessage', "Steer with Message"), icon: Codicon.arrowUp },
        group: 'navigation',
        order: 2,
    });
    MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
        submenu: MenuId.ChatExecuteQueue,
        title: localize2('chat.queueSubmenu', "Queue"),
        icon: Codicon.listOrdered,
        when: ContextKeyExpr.and(queuingActionsPresent, ChatContextKeys.inputHasText),
        group: 'navigation',
        order: 4,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXVlQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRRdWV1ZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFekYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBd0IsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNoRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFakQsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsb0RBQTBDLENBQUM7QUFDNUcsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLGtCQUFrQixDQUFDLFNBQVMscURBQTBDLENBQUM7QUFDNUcsTUFBTSxtQkFBbUIsR0FBRyxjQUFjLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxZ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