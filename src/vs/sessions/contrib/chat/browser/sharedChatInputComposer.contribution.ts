/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatExecuteActionContext } from '../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SharedChatInputComposer } from '../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { ChatInputCanScheduleContext, ChatInputSupportsBackgroundContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SessionsViewGroupingContext } from '../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { SEND_IN_BACKGROUND_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SessionsGrouping } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { IScheduledChatsService } from '../../../../workbench/contrib/sessions/browser/scheduledChatsService.js';
import { SharedChatInputComposerContribution, registerSharedChatInputComposerToolbar } from '../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposerToolbar.js';

registerSharedChatInputComposerToolbar();

export class SendInBackgroundAction extends Action2 {
	constructor() {
		super({
			id: SEND_IN_BACKGROUND_COMMAND_ID,
			title: localize2('sessionsSharedChatInput.sendInBackground', "Send in Background"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(
				IsSessionsWindowContext,
				ChatContextKeys.enabled,
				ChatInputSupportsBackgroundContext,
				ChatContextKeys.inputHasSendableContent,
				ChatContextKeys.inputBlocked.negate(),
				ChatContextKeys.chatSessionOptionsValid,
			),
			keybinding: [{
				primary: KeyMod.Alt | KeyCode.Enter,
				when: ChatContextKeys.inChatInput,
				weight: KeybindingWeight.SessionsContrib,
			}, {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, SessionsViewGroupingContext.isEqualTo(SessionsGrouping.Inbox)),
				weight: KeybindingWeight.SessionsContrib,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
		if (widget) {
			await SharedChatInputComposer.getBackgroundComposer(widget)?.submit(true);
		}
	}
}

registerAction2(SendInBackgroundAction);

export class SendLaterAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.sendLater',
			title: localize2('sessions.sendLater', "Send Later..."),
			category: CHAT_CATEGORY,
			icon: Codicon.clock,
			f1: true,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ChatInputCanScheduleContext, ChatContextKeys.inputHasSendableContent, ChatContextKeys.inputBlocked.negate()),
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'navigation',
				order: 99,
				when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SESSIONS_SEND_LATER_ENABLED_SETTING}`, true), ChatInputCanScheduleContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
		if (widget) {
			const notificationService = accessor.get(INotificationService);
			try {
				const composer = SharedChatInputComposer.getBackgroundComposer(widget);
				if (composer) {
					await composer.schedule();
				} else {
					await accessor.get(IScheduledChatsService).scheduleChatInput(widget);
				}
			} catch (error) {
				if (!isCancellationError(error)) {
					notificationService.error(toErrorMessage(error));
				}
			}
		}
	}
}

registerAction2(SendLaterAction);

// Register before restoration: adding a factory later does not refresh existing toolbars.
registerWorkbenchContribution2(SharedChatInputComposerContribution.ID, SharedChatInputComposerContribution, WorkbenchPhase.BlockRestore);
