/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { isChatViewTitleActionContext } from '../../common/chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingSession } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { ChatMode } from '../../common/constants.js';
import { ChatViewId, IChatWidget } from '../chat.js';
import { EditingSessionAction } from '../chatEditing/chatEditingActions.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { CHAT_CATEGORY, handleCurrentEditingSession } from './chatActions.js';
import { clearChatEditor } from './chatClear.js';

export const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;
export const ACTION_ID_NEW_EDIT_SESSION = `workbench.action.chat.newEditSession`;
export const ChatDoneActionId = 'workbench.action.chat.done';

export interface INewEditSessionActionContext {
	/**
	 * An initial prompt to write to the chat.
	 */
	inputValue?: string;

	/**
	 * Selects opening in agent mode or not. If not set, the current mode is used.
	 * This is ignored when coming from a chat view title context.
	 */
	agentMode?: boolean;

	/**
	 * Whether the inputValue is partial and should wait for further user input. If false or not set, the prompt is sent immediately.
	 */
	isPartialQuery?: boolean;
}

export function registerNewChatActions() {
	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.newChat',
				title: localize2('chat.newChat.label', "New Chat"),
				icon: Codicon.plus,
				f1: false,
				precondition: ChatContextKeys.enabled,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			announceChatCleared(accessor.get(IAccessibilitySignalService));
			await clearChatEditor(accessor);
		}
	});

	registerAction2(class NewEditSessionAction extends EditingSessionAction {
		constructor() {
			super({
				id: ACTION_ID_NEW_EDIT_SESSION,
				title: localize2('chat.newEdits.label', "New Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.editingParticipantRegistered),
				f1: true,
				menu: [{
					id: MenuId.ChatContext,
					group: 'z_clear'
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', ChatViewId),
					group: 'navigation',
					order: -1
				}],
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					},
					when: ChatContextKeys.inChatSession
				}
			});
		}


		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, widget: IChatWidget, ...args: any[]) {
			const context: INewEditSessionActionContext | undefined = args[0];
			const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
			const dialogService = accessor.get(IDialogService);
			const chatService = accessor.get(IChatService);

			if (!(await handleCurrentEditingSession(editingSession, undefined, dialogService))) {
				return;
			}

			announceChatCleared(accessibilitySignalService);

			await editingSession.stop();
			widget.clear();
			await waitForChatSessionCleared(editingSession.chatSessionId, chatService);
			widget.attachmentModel.clear();
			widget.input.relatedFiles?.clear();
			widget.focusInput();

			if (!context) {
				return;
			}

			if (typeof context.agentMode === 'boolean') {
				widget.input.setChatMode(context.agentMode ? ChatMode.Agent : ChatMode.Edit);
			}

			if (context.inputValue) {
				if (context.isPartialQuery) {
					widget.setInput(context.inputValue);
				} else {
					widget.acceptInput(context.inputValue);
				}
			}
		}
	});
	CommandsRegistry.registerCommandAlias(ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION);

	registerAction2(class GlobalEditsDoneAction extends EditingSessionAction {
		constructor() {
			super({
				id: ChatDoneActionId,
				title: localize2('chat.done.label', "Done"),
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.editingParticipantRegistered),
				f1: false,
				menu: [{
					id: MenuId.ChatEditingWidgetToolbar,
					when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey.negate(), hasAppliedChatEditsContextKey, ChatContextKeys.editingParticipantRegistered),
					group: 'navigation',
					order: 0
				}]
			});
		}

		override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, widget: IChatWidget, ...args: any[]) {
			const context = args[0];
			const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
			if (isChatViewTitleActionContext(context)) {
				// Is running in the Chat view title
				announceChatCleared(accessibilitySignalService);
				if (widget) {
					widget.clear();
					widget.attachmentModel.clear();
					widget.focusInput();
				}
			} else {
				// Is running from f1 or keybinding
				announceChatCleared(accessibilitySignalService);
				widget.clear();
				widget.attachmentModel.clear();
				widget.focusInput();
			}
		}
	});

	registerAction2(class UndoChatEditInteractionAction extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.undoEdit',
				title: localize2('chat.undoEdit.label', "Undo Last Request"),
				category: CHAT_CATEGORY,
				icon: Codicon.discard,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanUndo, ChatContextKeys.enabled, ChatContextKeys.editingParticipantRegistered),
				f1: true,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', ChatViewId),
					group: 'navigation',
					order: -3
				}]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			await editingSession.undoInteraction();
		}
	});

	registerAction2(class RedoChatEditInteractionAction extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.redoEdit',
				title: localize2('chat.redoEdit.label', "Redo Last Request"),
				category: CHAT_CATEGORY,
				icon: Codicon.redo,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled, ChatContextKeys.editingParticipantRegistered),
				f1: true,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', ChatViewId),
					group: 'navigation',
					order: -2
				}]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			await editingSession.redoInteraction();
		}
	});
}

function announceChatCleared(accessibilitySignalService: IAccessibilitySignalService): void {
	accessibilitySignalService.playSignal(AccessibilitySignal.clear);
}

export async function waitForChatSessionCleared(sessionId: string, chatService: IChatService): Promise<void> {
	if (!chatService.getSession(sessionId)) {
		return;
	}

	// The ChatWidget just signals cancellation to its host viewpane or editor. Clearing the session is now async, we need to wait for it to finish.
	// This is expected to always happen.
	await raceTimeout(Event.toPromise(
		Event.filter(chatService.onDidDisposeSession, e => e.sessionId === sessionId),
	), 2000);
}
