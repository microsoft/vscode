/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatRequestQueueKind, IChatService } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

const queueingEnabledCondition = ContextKeyExpr.equals(`config.${ChatConfiguration.RequestQueueingEnabled}`, true);
const requestInProgressOrPendingToolCall = ContextKeyExpr.or(ChatContextKeys.requestInProgress, ChatContextKeys.Editing.hasToolConfirmation);

const queuingActionsPresent = ContextKeyExpr.and(
	queueingEnabledCondition,
	ContextKeyExpr.or(requestInProgressOrPendingToolCall, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.QueueOrSteer)),
	ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Sent),
);

export interface IChatRemovePendingRequestContext {
	sessionResource: URI;
	pendingRequestId: string;
}

function isRemovePendingRequestContext(context: unknown): context is IChatRemovePendingRequestContext {
	return !!context &&
		typeof context === 'object' &&
		'sessionResource' in context &&
		'pendingRequestId' in context &&
		URI.isUri((context as IChatRemovePendingRequestContext).sessionResource) &&
		typeof (context as IChatRemovePendingRequestContext).pendingRequestId === 'string';
}

export class ChatQueueMessageAction extends Action2 {
	static readonly ID = 'workbench.action.chat.queueMessage';

	constructor() {
		super({
			id: ChatQueueMessageAction.ID,
			title: localize2('chat.queueMessage', "Add to Queue"),
			tooltip: localize('chat.queueMessage.tooltip', "Queue this message to send after the current request completes"),
			icon: Codicon.add,
			f1: false,
			category: CHAT_CATEGORY,

			precondition: ContextKeyExpr.and(
				queuingActionsPresent,
				ChatContextKeys.inputHasText,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					queuingActionsPresent,
				),
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib + 1
			},
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (!widget?.viewModel) {
			return;
		}

		const inputValue = widget.getInput();
		if (!inputValue.trim()) {
			return;
		}

		widget.acceptInput(undefined, { queue: ChatRequestQueueKind.Queued });
	}
}

export class ChatSteerWithMessageAction extends Action2 {
	static readonly ID = 'workbench.action.chat.steerWithMessage';

	constructor() {
		super({
			id: ChatSteerWithMessageAction.ID,
			title: localize2('chat.steerWithMessage', "Steer with Message"),
			tooltip: localize('chat.steerWithMessage.tooltip', "Send this message at the next opportunity, signaling the current request to yield"),
			icon: Codicon.arrowRight,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				queuingActionsPresent,
				ChatContextKeys.inputHasText,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					queuingActionsPresent,
				),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib + 1
			},
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (!widget?.viewModel) {
			return;
		}

		const inputValue = widget.getInput();
		if (!inputValue.trim()) {
			return;
		}

		widget.acceptInput(undefined, { queue: ChatRequestQueueKind.Steering });
	}
}

export class ChatRemovePendingRequestAction extends Action2 {
	static readonly ID = 'workbench.action.chat.removePendingRequest';

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
				when: ContextKeyExpr.and(
					queueingEnabledCondition,
					ChatContextKeys.isRequest,
					ChatContextKeys.isPendingRequest
				)
			}]
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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
	static readonly ID = 'workbench.action.chat.sendPendingImmediately';

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
				when: ContextKeyExpr.and(
					queueingEnabledCondition,
					ChatContextKeys.isRequest,
					ChatContextKeys.isPendingRequest
				)
			}]
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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
		chatService.cancelCurrentRequestForSession(context.sessionResource);
		chatService.processPendingRequests(context.sessionResource);
	}
}

export class ChatRemoveAllPendingRequestsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.removeAllPendingRequests';

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
				when: ContextKeyExpr.and(
					queueingEnabledCondition,
					ChatContextKeys.hasPendingRequests
				)
			}]
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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

export function registerChatQueueActions(): void {
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
		command: { id: ChatSteerWithMessageAction.ID, title: localize2('chat.steerWithMessage', "Steer with Message"), icon: Codicon.arrowRight },
		group: 'navigation',
		order: 2,
	});

	MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
		submenu: MenuId.ChatExecuteQueue,
		title: localize2('chat.queueSubmenu', "Queue"),
		icon: Codicon.listOrdered,
		when: queuingActionsPresent,
		group: 'navigation',
		order: 4,
	});
}
