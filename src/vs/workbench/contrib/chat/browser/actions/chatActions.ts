/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNowByDay } from '../../../../../base/common/date.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { clearChatEditor } from './chatClear.js';
import { CHAT_VIEW_ID, IChatWidget, IChatWidgetService, showChatView } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';
import { CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_INPUT_CURSOR_AT_TOP, CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_QUICK_CHAT } from '../../common/chatContextKeys.js';
import { IChatDetail, IChatService } from '../../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM } from '../../common/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/chatWidgetHistoryService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { toAction } from '../../../../../base/common/actions.js';
import { extractAgentAndCommand } from '../../common/chatParserTypes.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';

export interface IChatViewTitleActionContext {
	chatView: ChatViewPane;
}

export function isChatViewTitleActionContext(obj: unknown): obj is IChatViewTitleActionContext {
	return obj instanceof Object && 'chatView' in obj;
}

export const CHAT_CATEGORY = localize2('chat.category', 'Chat');
export const CHAT_OPEN_ACTION_ID = 'workbench.action.chat.open';

export interface IChatViewOpenOptions {
	/**
	 * The query for quick chat.
	 */
	query: string;
	/**
	 * Whether the query is partial and will await more input from the user.
	 */
	isPartialQuery?: boolean;
	/**
	 * Any previous chat requests and responses that should be shown in the chat view.
	 */
	previousRequests?: IChatViewOpenRequestEntry[];
}

export interface IChatViewOpenRequestEntry {
	request: string;
	response: string;
}

class OpenChatGlobalAction extends Action2 {
	constructor() {
		super({
			id: CHAT_OPEN_ACTION_ID,
			title: localize2('openChat', "Open Chat"),
			icon: Codicon.commentDiscussion,
			f1: true,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
				}
			},
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'open',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor, opts?: string | IChatViewOpenOptions): Promise<void> {
		opts = typeof opts === 'string' ? { query: opts } : opts;

		const chatService = accessor.get(IChatService);
		const chatWidget = await showChatView(accessor.get(IViewsService));
		if (!chatWidget) {
			return;
		}
		if (opts?.previousRequests?.length && chatWidget.viewModel) {
			for (const { request, response } of opts.previousRequests) {
				chatService.addCompleteRequest(chatWidget.viewModel.sessionId, request, undefined, 0, { message: response });
			}
		}
		if (opts?.query) {
			if (opts.isPartialQuery) {
				chatWidget.setInput(opts.query);
			} else {
				chatWidget.acceptInput(opts.query);
			}
		}

		chatWidget.focusInput();
	}
}

class ChatHistoryAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.chat.history`,
			title: localize2('chat.history.label', "Show Chats..."),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
				group: 'navigation',
				order: -1
			},
			category: CHAT_CATEGORY,
			icon: Codicon.history,
			f1: true,
			precondition: CONTEXT_CHAT_ENABLED
		});
	}

	async run(accessor: ServicesAccessor) {
		const chatService = accessor.get(IChatService);
		const quickInputService = accessor.get(IQuickInputService);
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);

		const showPicker = () => {
			const openInEditorButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.file),
				tooltip: localize('interactiveSession.history.editor', "Open in Editor"),
			};
			const deleteButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.x),
				tooltip: localize('interactiveSession.history.delete', "Delete"),
			};
			const renameButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.pencil),
				tooltip: localize('chat.history.rename', "Rename"),
			};

			interface IChatPickerItem extends IQuickPickItem {
				chat: IChatDetail;
			}

			const getPicks = () => {
				const items = chatService.getHistory();
				items.sort((a, b) => (b.lastMessageDate ?? 0) - (a.lastMessageDate ?? 0));

				let lastDate: string | undefined = undefined;
				const picks = items.flatMap((i): [IQuickPickSeparator | undefined, IChatPickerItem] => {
					const timeAgoStr = fromNowByDay(i.lastMessageDate, true, true);
					const separator: IQuickPickSeparator | undefined = timeAgoStr !== lastDate ? {
						type: 'separator', label: timeAgoStr,
					} : undefined;
					lastDate = timeAgoStr;
					return [
						separator,
						{
							label: i.title,
							description: i.isActive ? `(${localize('currentChatLabel', 'current')})` : '',
							chat: i,
							buttons: i.isActive ? [renameButton] : [
								renameButton,
								openInEditorButton,
								deleteButton,
							]
						}
					];
				});

				return coalesce(picks);
			};

			const store = new DisposableStore();
			const picker = store.add(quickInputService.createQuickPick<IChatPickerItem>({ useSeparators: true }));
			picker.placeholder = localize('interactiveSession.history.pick', "Switch to chat");
			const picks = getPicks();
			picker.items = picks;
			store.add(picker.onDidTriggerItemButton(async context => {
				if (context.button === openInEditorButton) {
					const options: IChatEditorOptions = { target: { sessionId: context.item.chat.sessionId }, pinned: true };
					editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, ACTIVE_GROUP);
					picker.hide();
				} else if (context.button === deleteButton) {
					chatService.removeHistoryEntry(context.item.chat.sessionId);
					picker.items = getPicks();
				} else if (context.button === renameButton) {
					const title = await quickInputService.input({ title: localize('newChatTitle', "New chat title"), value: context.item.chat.title });
					if (title) {
						chatService.setChatSessionTitle(context.item.chat.sessionId, title);
					}

					// The quick input hides the picker, it gets disposed, so we kick it off from scratch
					showPicker();
				}
			}));
			store.add(picker.onDidAccept(async () => {
				try {
					const item = picker.selectedItems[0];
					const sessionId = item.chat.sessionId;
					const view = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
					view.loadSession(sessionId);
				} finally {
					picker.hide();
				}
			}));
			store.add(picker.onDidHide(() => store.dispose()));

			picker.show();
		};
		showPicker();
	}
}

class OpenChatEditorAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.openChat`,
			title: localize2('interactiveSession.open', "Open Editor"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: CONTEXT_CHAT_ENABLED
		});
	}

	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } satisfies IChatEditorOptions });
	}
}


class ChatAddAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.addParticipant',
			title: localize2('chatWith', "Chat With Extension"),
			icon: Codicon.mention,
			f1: false,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const context: { widget?: IChatWidget } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const hasAgentOrCommand = extractAgentAndCommand(widget.parsedInput);
		if (hasAgentOrCommand?.agentPart || hasAgentOrCommand?.commandPart) {
			return;
		}

		const suggestCtrl = SuggestController.get(widget.inputEditor);
		if (suggestCtrl) {
			const curText = widget.inputEditor.getValue();
			const newValue = curText ? `@ ${curText}` : '@';
			if (!curText.startsWith('@')) {
				widget.inputEditor.setValue(newValue);
			}

			widget.inputEditor.setPosition(new Position(1, 2));
			suggestCtrl.triggerSuggest(undefined, true);
		}
	}
}

export function registerChatActions() {
	registerAction2(OpenChatGlobalAction);
	registerAction2(ChatHistoryAction);
	registerAction2(OpenChatEditorAction);
	registerAction2(ChatAddAction);

	registerAction2(class ClearChatInputHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.clearInputHistory',
				title: localize2('interactiveSession.clearHistory.label', "Clear Input History"),
				precondition: CONTEXT_CHAT_ENABLED,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const historyService = accessor.get(IChatWidgetHistoryService);
			historyService.clearHistory();
		}
	});

	registerAction2(class ClearChatHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.clearHistory',
				title: localize2('chat.clear.label', "Clear All Workspace Chats"),
				precondition: CONTEXT_CHAT_ENABLED,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const viewsService = accessor.get(IViewsService);

			const chatService = accessor.get(IChatService);
			chatService.clearAllHistoryEntries();

			const chatView = viewsService.getViewWithId(CHAT_VIEW_ID) as ChatViewPane | undefined;
			if (chatView) {
				chatView.widget.clear();
			}

			// Clear all chat editors. Have to go this route because the chat editor may be in the background and
			// not have a ChatEditorInput.
			editorGroupsService.groups.forEach(group => {
				group.editors.forEach(editor => {
					if (editor instanceof ChatEditorInput) {
						clearChatEditor(accessor, editor);
					}
				});
			});
		}
	});

	registerAction2(class FocusChatAction extends EditorAction2 {
		constructor() {
			super({
				id: 'chat.action.focus',
				title: localize2('actions.interactiveSession.focus', 'Focus Chat List'),
				precondition: ContextKeyExpr.and(CONTEXT_IN_CHAT_INPUT),
				category: CHAT_CATEGORY,
				keybinding: [
					// On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
					{
						when: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_CURSOR_AT_TOP, CONTEXT_IN_QUICK_CHAT.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					// On win/linux, ctrl+up can always focus the chat list
					{
						when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), CONTEXT_IN_QUICK_CHAT.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					{
						when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_QUICK_CHAT),
						primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
					}
				]
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

	registerAction2(class FocusChatInputAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.focusInput',
				title: localize2('interactiveSession.focusInput.label', "Focus Chat Input"),
				f1: false,
				keybinding: [
					{
						primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
						when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate(), CONTEXT_IN_QUICK_CHAT.negate()),
					},
					{
						when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate(), CONTEXT_IN_QUICK_CHAT),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.WorkbenchContrib,
					}
				]
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});
}

export function stringifyItem(item: IChatRequestViewModel | IChatResponseViewModel, includeName = true): string {
	if (isRequestVM(item)) {
		return (includeName ? `${item.username}: ` : '') + item.messageText;
	} else {
		return (includeName ? `${item.username}: ` : '') + item.response.toString();
	}
}


// --- command center chat

MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.ChatCommandCenter,
	title: localize('title4', "Chat"),
	icon: Codicon.commentDiscussion,
	when: ContextKeyExpr.and(CONTEXT_CHAT_ENABLED, ContextKeyExpr.has('config.chat.commandCenter.enabled')),
	order: 10001,
});

export class ChatCommandCenterRendering implements IWorkbenchContribution {

	static readonly ID = 'chat.commandCenterRendering';

	private readonly _store = new DisposableStore();

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatAgentService agentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextmenuService: IContextMenuService
	) {

		// TODO@jrieken this isn't proper
		const key = `submenuitem.${MenuId.ChatCommandCenter.id}`;

		this._store.add(actionViewItemService.register(MenuId.CommandCenter, key, (action, options) => {

			const agent = agentService.getDefaultAgent(ChatAgentLocation.Panel);
			if (!agent?.metadata.themeIcon) {
				return undefined;
			}

			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({ id: agent.id, label: agent.fullName ?? agent.name, run() { } });

			const primaryAction = instantiationService.createInstance(MenuItemAction, {
				id: CHAT_OPEN_ACTION_ID,
				title: agent.fullName ?? agent.name,
				icon: agent.metadata.themeIcon,
			}, undefined, undefined, undefined, undefined);

			return instantiationService.createInstance(
				DropdownWithPrimaryActionViewItem,
				primaryAction, dropdownAction, action.actions,
				'', options
			);

		}, agentService.onDidChangeAgents));
	}

	dispose() {
		this._store.dispose();
	}
}
