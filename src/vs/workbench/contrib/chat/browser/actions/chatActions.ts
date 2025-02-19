/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNowByDay } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { ILocalizedString, localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { extractAgentAndCommand } from '../../common/chatParserTypes.js';
import { IChatDetail, IChatService } from '../../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM } from '../../common/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/chatWidgetHistoryService.js';
import { CopilotUsageExtensionFeatureId } from '../../common/languageModelStats.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { ChatViewId, IChatWidget, IChatWidgetService, showChatView } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { IChatQuotasService, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG, quotaToButtonMessage } from '../chatQuotasService.js';
import { ChatViewPane } from '../chatViewPane.js';
import { convertBufferToScreenshotVariable } from '../contrib/screenshot.js';
import { clearChatEditor } from './chatClear.js';

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
	 * A list of tools IDs with `canBeReferencedInPrompt` that will be resolved and attached if they exist.
	 */
	toolIds?: string[];
	/**
	 * Any previous chat requests and responses that should be shown in the chat view.
	 */
	previousRequests?: IChatViewOpenRequestEntry[];

	/**
	 * Whether a screenshot of the focused window should be taken and attached
	 */
	attachScreenshot?: boolean;
}

export interface IChatViewOpenRequestEntry {
	request: string;
	response: string;
}

class OpenChatGlobalAction extends Action2 {

	static readonly TITLE = localize2('openChat', "Open Chat");

	constructor() {
		super({
			id: CHAT_OPEN_ACTION_ID,
			title: OpenChatGlobalAction.TITLE,
			icon: Codicon.copilot,
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
				id: MenuId.ChatTitleBarMenu,
				group: 'a_open',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor, opts?: string | IChatViewOpenOptions): Promise<void> {
		opts = typeof opts === 'string' ? { query: opts } : opts;

		const chatService = accessor.get(IChatService);
		const toolsService = accessor.get(ILanguageModelToolsService);
		const viewsService = accessor.get(IViewsService);
		const hostService = accessor.get(IHostService);

		const chatWidget = await showChatView(viewsService);
		if (!chatWidget) {
			return;
		}
		if (opts?.previousRequests?.length && chatWidget.viewModel) {
			for (const { request, response } of opts.previousRequests) {
				chatService.addCompleteRequest(chatWidget.viewModel.sessionId, request, undefined, 0, { message: response });
			}
		}
		if (opts?.attachScreenshot) {
			const screenshot = await hostService.getScreenshot();
			if (screenshot) {
				chatWidget.attachmentModel.addContext(convertBufferToScreenshotVariable(screenshot));
			}
		}
		if (opts?.query) {
			if (opts.isPartialQuery) {
				chatWidget.setInput(opts.query);
			} else {
				chatWidget.acceptInput(opts.query);
			}
		}
		if (opts?.toolIds && opts.toolIds.length > 0) {
			for (const toolId of opts.toolIds) {
				const tool = toolsService.getTool(toolId);
				if (tool) {
					chatWidget.attachmentModel.addContext({
						id: tool.id,
						name: tool.displayName,
						fullName: tool.displayName,
						value: undefined,
						icon: ThemeIcon.isThemeIcon(tool.icon) ? tool.icon : undefined,
						isTool: true
					});
				}
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
				when: ContextKeyExpr.equals('view', ChatViewId),
				group: 'navigation',
				order: 2
			},
			category: CHAT_CATEGORY,
			icon: Codicon.history,
			f1: true,
			precondition: ChatContextKeys.enabled
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
					const view = await viewsService.openView(ChatViewId) as ChatViewPane;
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
			precondition: ChatContextKeys.enabled
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
			title: localize2('chatWith', "Chat with Extension"),
			icon: Codicon.mention,
			f1: false,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatInput,
				when: ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
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

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: 'update.showCurrentReleaseNotes',
		title: localize2('chat.releaseNotes.label', "Show Release Notes"),
	},
	when: ContextKeyExpr.equals('view', ChatViewId)
});

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
				precondition: ChatContextKeys.enabled,
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
				precondition: ChatContextKeys.enabled,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const viewsService = accessor.get(IViewsService);

			const chatService = accessor.get(IChatService);
			chatService.clearAllHistoryEntries();

			const chatView = viewsService.getViewWithId(ChatViewId) as ChatViewPane | undefined;
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
				precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
				category: CHAT_CATEGORY,
				keybinding: [
					// On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
					{
						when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					// On win/linux, ctrl+up can always focus the chat list
					{
						when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					{
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
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
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat.negate()),
					},
					{
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat),
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

	function registerOpenLinkAction(id: string, title: ILocalizedString, url: string, order: number, contextKey: ContextKeyExpression = ChatContextKeys.enabled): void {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id,
					title,
					category: CHAT_CATEGORY,
					f1: true,
					precondition: contextKey,
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'y_manage',
						order,
						when: contextKey
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				openerService.open(URI.parse(url));
			}
		});
	}

	const nonEnterpriseCopilotUsers = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${defaultChat.providerSetting}`, defaultChat.enterpriseProviderId));
	registerOpenLinkAction('workbench.action.chat.managePlan', localize2('managePlan', "Manage Copilot Plan"), defaultChat.managePlanUrl, 1, nonEnterpriseCopilotUsers);
	registerOpenLinkAction('workbench.action.chat.manageSettings', localize2('manageSettings', "Manage Copilot Settings"), defaultChat.manageSettingsUrl, 2, nonEnterpriseCopilotUsers);
	registerOpenLinkAction('workbench.action.chat.learnMore', localize2('learnMore', "Learn More"), defaultChat.documentationUrl, 3);

	registerAction2(class ShowExtensionsUsingCopilot extends Action2 {

		constructor() {
			super({
				id: 'workbench.action.chat.showExtensionsUsingCopilot',
				title: localize2('showCopilotUsageExtensions', "Show Extensions using Copilot"),
				f1: true,
				category: EXTENSIONS_CATEGORY,
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
			extensionsWorkbenchService.openSearch(`@feature:${CopilotUsageExtensionFeatureId}`);
		}
	});

	registerAction2(class ConfigureCopilotCompletions extends Action2 {

		constructor() {
			super({
				id: 'workbench.action.chat.configureCodeCompletions',
				title: localize2('configureCompletions', "Configure Code Completions..."),
				precondition: ChatContextKeys.enabled,
				menu: {
					id: MenuId.ChatTitleBarMenu,
					group: 'f_completions',
					order: 10,
				}
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand('github.copilot.toggleStatusMenu');
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


// --- Title Bar Copilot Controls

const defaultChat = {
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	managePlanUrl: product.defaultChatAgent?.managePlanUrl ?? '',
	enterpriseProviderId: product.defaultChatAgent?.enterpriseProviderId ?? '',
	providerSetting: product.defaultChatAgent?.providerSetting ?? '',
};

// Add next to the command center if command center is disabled
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Copilot"),
	icon: Codicon.copilot,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ContextKeyExpr.has('config.chat.commandCenter.enabled')
	),
	order: 10001 // to the right of command center
});

// Add to the global title bar if command center is disabled
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Copilot"),
	group: 'navigation',
	icon: Codicon.copilot,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ContextKeyExpr.has('config.chat.commandCenter.enabled'),
		ContextKeyExpr.has('config.window.commandCenter').negate(),
	),
	order: 1
});

registerAction2(class ToggleCopilotControl extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			'chat.commandCenter.enabled',
			localize('toggle.chatControl', 'Copilot Controls'),
			localize('toggle.chatControlsDescription', "Toggle visibility of the Copilot Controls in title bar"), 5, false,
			ChatContextKeys.supported
		);
	}
});

export class CopilotTitleBarMenuRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'copilot.titleBarMenuRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatAgentService agentService: IChatAgentService,
		@IChatQuotasService chatQuotasService: IChatQuotasService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const contextKeySet = new Set([ChatContextKeys.Setup.signedOut.key]);

		const disposable = actionViewItemService.register(MenuId.CommandCenter, MenuId.ChatTitleBarMenu, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({
				id: 'copilot.titleBarMenuRendering.more',
				label: localize('more', "More..."),
				run() { }
			});

			const chatExtensionInstalled = agentService.getAgents().some(agent => agent.isDefault);
			const { chatQuotaExceeded, completionsQuotaExceeded } = chatQuotasService.quotas;
			const signedOut = contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.signedOut.key) ?? false;

			let primaryActionId: string;
			let primaryActionTitle: string;
			let primaryActionIcon: ThemeIcon;
			if (!chatExtensionInstalled) {
				primaryActionId = 'workbench.action.chat.triggerSetup';
				primaryActionTitle = localize('triggerChatSetup', "Use AI Features with Copilot for Free...");
				primaryActionIcon = Codicon.copilot;
			} else {
				if (signedOut) {
					primaryActionId = CHAT_OPEN_ACTION_ID;
					primaryActionTitle = localize('signInToChatSetup', "Sign in to Use Copilot...");
					primaryActionIcon = Codicon.copilotWarning;
				} else if (chatQuotaExceeded || completionsQuotaExceeded) {
					primaryActionId = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
					primaryActionTitle = quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded });
					primaryActionIcon = Codicon.copilotWarning;
				} else {
					primaryActionId = CHAT_OPEN_ACTION_ID;
					primaryActionTitle = OpenChatGlobalAction.TITLE.value;
					primaryActionIcon = Codicon.copilot;
				}
			}
			return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, instantiationService.createInstance(MenuItemAction, {
				id: primaryActionId,
				title: primaryActionTitle,
				icon: primaryActionIcon,
			}, undefined, undefined, undefined, undefined), dropdownAction, action.actions, '', { ...options, skipTelemetry: true });
		}, Event.any(
			agentService.onDidChangeAgents,
			chatQuotasService.onDidChangeQuotas,
			Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(contextKeySet))
		));

		// Reduces flicker a bit on reload/restart
		markAsSingleton(disposable);
	}
}
