/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorAction2, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { runAccessibilityHelpAction } from 'vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatDetail, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleView';

export const CHAT_CATEGORY = { value: localize('chat.category', "Chat"), original: 'Chat' };

export function registerChatActions() {
	registerEditorAction(class ChatAcceptInput extends EditorAction {
		constructor() {
			super({
				id: 'chat.action.acceptInput',
				label: localize({ key: 'actions.chat.acceptInput', comment: ['Apply input from the chat input box'] }, "Accept Chat Input"),
				alias: 'Accept Chat Input',
				precondition: CONTEXT_IN_CHAT_INPUT,
				kbOpts: {
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Enter,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.acceptInput();
			}
		}
	});

	registerAction2(class ClearChatHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.clearHistory',
				title: {
					value: localize('interactiveSession.clearHistory.label', "Clear Input History"),
					original: 'Clear Input History'
				},
				precondition: CONTEXT_PROVIDER_EXISTS,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const historyService = accessor.get(IChatWidgetHistoryService);
			historyService.clearHistory();
		}
	});

	registerAction2(class FocusChatAction extends EditorAction2 {
		constructor() {
			super({
				id: 'chat.action.focus',
				title: { value: localize('actions.interactiveSession.focus', "Focus Chat List"), original: 'Focus Chat List' },
				precondition: CONTEXT_IN_CHAT_INPUT,
				category: CHAT_CATEGORY,
				keybinding: {
					when: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.focusLastMessage();
			}
		}
	});

	class ChatAccessibilityHelpContribution extends Disposable {
		static ID: 'chatAccessibilityHelpContribution';
		constructor() {
			super();
			this._register(AccessibilityHelpAction.addImplementation(105, 'panelChat', async accessor => {
				const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
				if (!codeEditor) {
					return;
				}
				runAccessibilityHelpAction(accessor, codeEditor, 'panelChat');
			}, CONTEXT_IN_CHAT_SESSION));
		}
	}

	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(ChatAccessibilityHelpContribution, LifecyclePhase.Eventually);

	registerAction2(class FocusChatInputAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.focusInput',
				title: {
					value: localize('interactiveSession.focusInput.label', "Focus Chat Input"),
					original: 'Focus Chat Input'
				},
				f1: false,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, ContextKeyExpr.not(EditorContextKeys.focus.key))
				}
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});
}

export function getOpenChatEditorAction(id: string, label: string, when?: string) {
	return class OpenChatEditor extends Action2 {
		constructor() {
			super({
				id: `workbench.action.openChat.${id}`,
				title: { value: localize('interactiveSession.open', "Open Editor ({0})", label), original: `Open Editor (${label})` },
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.deserialize(when)
			});
		}

		async run(accessor: ServicesAccessor) {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { providerId: id }, pinned: true } });
		}
	};
}

const getHistoryChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	viewId,
	id: `workbench.action.chat.${providerId}.history`,
	title: {
		value: localize('interactiveSession.history.label', "Show History"),
		original: 'Show History'
	},
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		group: 'navigation',
		order: 0
	},
	category: CHAT_CATEGORY,
	icon: Codicon.history,
	f1: false
});

export function getHistoryAction(viewId: string, providerId: string) {
	return class HistoryAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getHistoryChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const chatService = accessor.get(IChatService);
			const quickInputService = accessor.get(IQuickInputService);
			const editorService = accessor.get(IEditorService);
			const items = chatService.getHistory();
			const picks = items.map(i => (<IQuickPickItem & { chat: IChatDetail }>{
				label: i.title,
				chat: i,
				buttons: [{
					iconClass: ThemeIcon.asClassName(Codicon.x),
					tooltip: localize('interactiveSession.history.delete', "Delete"),
				}]
			}));
			const selection = await quickInputService.pick(picks,
				{
					placeHolder: localize('interactiveSession.history.pick', "Select a chat session to restore"),
					onDidTriggerItemButton: context => {
						chatService.removeHistoryEntry(context.item.chat.sessionId);
						context.removeItem();
					}
				});
			if (selection) {
				const sessionId = selection.chat.sessionId;
				await editorService.openEditor({
					resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId }, pinned: true }
				});
			}
		}
	};
}
