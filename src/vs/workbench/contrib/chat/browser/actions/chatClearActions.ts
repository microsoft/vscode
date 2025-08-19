/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
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
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatEditingSession } from '../../common/chatEditingService.js';
import { ChatModeKind } from '../../common/constants.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../chat.js';
import { EditingSessionAction } from '../chatEditing/chatEditingActions.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION, CHAT_CATEGORY, handleCurrentEditingSession } from './chatActions.js';
import { clearChatEditor } from './chatClear.js';

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
	// This action was previously used for the editor gutter toolbar, but now ACTION_ID_NEW_CHAT is also used for that scenario
	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.newChat',
				title: localize2('chat.newChat.label', "New Chat"),
				icon: Codicon.plus,
				f1: false,
				precondition: ChatContextKeys.enabled,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			announceChatCleared(accessor.get(IAccessibilitySignalService));
			await clearChatEditor(accessor);
		}
	});

	registerAction2(class NewChatAction extends EditingSessionAction {
		constructor() {
			super({
				id: ACTION_ID_NEW_CHAT,
				title: localize2('chat.newEdits.label', "New Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled),
				f1: true,
				menu: [
					{
						id: MenuId.ChatContext,
						group: 'z_clear'
					},
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ChatViewId),
						group: 'navigation',
						order: -1
					},
					...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
						id,
						group: 'navigation',
						when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
						order: 1
					}))
				],
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 1,
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.KeyN,
						secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
					},
					when: ChatContextKeys.inChatSession
				}
			});
		}


		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, widget: IChatWidget, ...args: any[]) {
			const context: INewEditSessionActionContext | undefined = args[0];
			const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
			const dialogService = accessor.get(IDialogService);

			if (!(await handleCurrentEditingSession(editingSession, undefined, dialogService))) {
				return;
			}

			announceChatCleared(accessibilitySignalService);

			await editingSession.stop();
			widget.clear();
			await widget.waitForReady();
			widget.attachmentModel.clear(true);
			widget.input.relatedFiles?.clear();
			widget.focusInput();

			if (!context) {
				return;
			}

			if (typeof context.agentMode === 'boolean') {
				widget.input.setChatMode(context.agentMode ? ChatModeKind.Agent : ChatModeKind.Edit);
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
	CommandsRegistry.registerCommandAlias(ACTION_ID_NEW_EDIT_SESSION, ACTION_ID_NEW_CHAT);


	registerAction2(class UndoChatEditInteractionAction extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.undoEdit',
				title: localize2('chat.undoEdit.label', "Undo Last Request"),
				category: CHAT_CATEGORY,
				icon: Codicon.discard,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanUndo, ChatContextKeys.enabled),
				f1: true,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', ChatViewId),
					group: 'navigation',
					order: -3,
					isHiddenByDefault: true
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
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
				f1: true,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ChatViewId),
						group: 'navigation',
						order: -2,
						isHiddenByDefault: true
					}
				]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			const widget = accessor.get(IChatWidgetService);
			await editingSession.redoInteraction();
			widget.lastFocusedWidget?.viewModel?.model.setCheckpoint(undefined);
		}
	});

	registerAction2(class RedoChatCheckpoints extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.redoEdit2',
				title: localize2('chat.redoEdit.label2', "Redo"),
				tooltip: localize2('chat.redoEdit.tooltip', "Reapply discarded workspace changes and chat"),
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
				f1: true,
				menu: [{
					id: MenuId.ChatMessageRestoreCheckpoint,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ChatContextKeys.lockedToCodingAgent.negate()),
					group: 'navigation',
					order: -1
				}]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			const widget = accessor.get(IChatWidgetService);

			while (editingSession.canRedo.get()) {
				await editingSession.redoInteraction();
			}

			const currentWidget = widget.lastFocusedWidget;
			const requestText = currentWidget?.viewModel?.model.checkpoint?.message.text;

			// if the input has the same text that we just restored, clear it.
			if (currentWidget?.inputEditor.getValue() === requestText) {
				currentWidget?.input.setValue('', false);
			}

			currentWidget?.viewModel?.model.setCheckpoint(undefined);
			currentWidget?.focusInput();
		}
	});
}

function announceChatCleared(accessibilitySignalService: IAccessibilitySignalService): void {
	accessibilitySignalService.playSignal(AccessibilitySignal.clear);
}
