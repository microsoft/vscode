/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatRequestQueueKind, IChatService } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

const queueingEnabledCondition = ContextKeyExpr.equals(`config.${ChatConfiguration.RequestQueueingEnabled}`, true);

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
			icon: Codicon.add,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				queueingEnabledCondition,
				ChatContextKeys.requestInProgress,
				ChatContextKeys.inputHasText
			),
			menu: [{
				id: MenuId.ChatExecuteQueue,
				group: 'navigation',
				order: 1,
			}]
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
			icon: Codicon.arrowRight,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				queueingEnabledCondition,
				ChatContextKeys.requestInProgress,
				ChatContextKeys.inputHasText
			),
			menu: [{
				id: MenuId.ChatExecuteQueue,
				group: 'navigation',
				order: 2,
			}]
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
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const chatService = accessor.get(IChatService);
		const [context] = args;
		if (!isRemovePendingRequestContext(context)) {
			return;
		}

		chatService.removePendingRequest(context.sessionResource, context.pendingRequestId);
	}
}

export function registerChatQueueActions(): void {
	registerAction2(ChatQueueMessageAction);
	registerAction2(ChatSteerWithMessageAction);
	registerAction2(ChatRemovePendingRequestAction);

	// Register the queue submenu as a split button dropdown in the execute toolbar
	// This shows "Add to Queue" / "Steer with Message" when a request is in progress and input has text
	MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
		submenu: MenuId.ChatExecuteQueue,
		title: localize2('chat.queueSubmenu', "Queue"),
		icon: Codicon.listOrdered,
		when: ContextKeyExpr.and(
			queueingEnabledCondition,
			ChatContextKeys.requestInProgress,
			ChatContextKeys.inputHasText
		),
		group: 'navigation',
		order: 3,
		isSplitButton: { togglePrimaryAction: true }
	});
}
