/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNowByDay, safeIntl } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { language } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IsCompactTitleBarContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { ChatEntitlement, ChatSentiment, IChatEntitlementService } from '../../common/chatEntitlementService.js';
import { extractAgentAndCommand } from '../../common/chatParserTypes.js';
import { IChatDetail, IChatService } from '../../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM } from '../../common/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/chatWidgetHistoryService.js';
import { ChatMode, validateChatMode } from '../../common/constants.js';
import { CopilotUsageExtensionFeatureId } from '../../common/languageModelStats.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { ChatViewId, IChatWidget, IChatWidgetService, showChatView, showCopilotView } from '../chat.js';
import { ctxHasRequestInProgress, ctxIsGlobalEditingSession } from '../chatEditing/chatEditingEditorContextKeys.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';
import { convertBufferToScreenshotVariable } from '../contrib/screenshot.js';
import { clearChatEditor } from './chatClear.js';

export const CHAT_CATEGORY = localize2('chat.category', 'Chat');

export const CHAT_OPEN_ACTION_ID = 'workbench.action.chat.open';
export const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';

export interface IChatViewOpenOptions {
	/**
	 * The query for chat.
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
	/**
	 * The mode to open the chat in.
	 */
	mode?: ChatMode;
}

export interface IChatViewOpenRequestEntry {
	request: string;
	response: string;
}

const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';

export function registerChatActions() {
	registerAction2(class OpenChatGlobalAction extends Action2 {

		constructor() {
			super({
				id: CHAT_OPEN_ACTION_ID,
				title: localize2('openChat', "Open Chat"),
				icon: Codicon.copilot,
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.Setup.hidden.negate(),
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
					mac: {
						primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
					}
				},
				menu: [{
					id: MenuId.ChatTitleBarMenu,
					group: 'a_open',
					order: 1
				}, {
					id: MenuId.ChatEditingEditorContent,
					when: ContextKeyExpr.and(ctxHasRequestInProgress, ctxIsGlobalEditingSession),
					group: 'navigate',
					order: 4,
				}]
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
			if (opts?.mode && validateChatMode(opts.mode)) {
				chatWidget.input.setChatMode(opts.mode);
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
				if (opts.query.startsWith('@') && (chatWidget.input.currentMode === ChatMode.Agent || chatService.edits2Enabled)) {
					chatWidget.input.setChatMode(ChatMode.Ask);
				}
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
							kind: 'tool'
						});
					}
				}
			}

			chatWidget.focusInput();
		}
	});

	registerAction2(class ToggleChatAction extends Action2 {
		constructor() {
			super({
				id: TOGGLE_CHAT_ACTION_ID,
				title: localize2('toggleChat', "Toggle Chat"),
				category: CHAT_CATEGORY
			});
		}

		async run(accessor: ServicesAccessor) {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			const viewsService = accessor.get(IViewsService);
			const viewDescriptorService = accessor.get(IViewDescriptorService);

			const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);

			if (viewsService.isViewVisible(ChatViewId)) {
				this.updatePartVisibility(layoutService, chatLocation, false);
			} else {
				this.updatePartVisibility(layoutService, chatLocation, true);
				(await showCopilotView(viewsService, layoutService))?.focusInput();
			}
		}

		private updatePartVisibility(layoutService: IWorkbenchLayoutService, location: ViewContainerLocation | null, visible: boolean): void {
			let part: Parts.PANEL_PART | Parts.SIDEBAR_PART | Parts.AUXILIARYBAR_PART | undefined;
			switch (location) {
				case ViewContainerLocation.Panel:
					part = Parts.PANEL_PART;
					break;
				case ViewContainerLocation.Sidebar:
					part = Parts.SIDEBAR_PART;
					break;
				case ViewContainerLocation.AuxiliaryBar:
					part = Parts.AUXILIARYBAR_PART;
					break;
			}

			if (part) {
				layoutService.setPartHidden(!visible, part);
			}
		}
	});

	registerAction2(class ChatHistoryAction extends Action2 {
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
			const dialogService = accessor.get(IDialogService);

			const view = await viewsService.openView<ChatViewPane>(ChatViewId);
			if (!view) {
				return;
			}

			const chatSessionId = view.widget.viewModel?.model.sessionId;
			if (!chatSessionId) {
				return;
			}

			const editingSession = view.widget.viewModel?.model.editingSession;
			if (editingSession) {
				const phrase = localize('switchChat.confirmPhrase', "Switching chats will end your current edit session.");
				if (!await handleCurrentEditingSession(editingSession, phrase, dialogService)) {
					return;
				}
			}

			const showPicker = async () => {
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

				const getPicks = async () => {
					const items = await chatService.getHistory();
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
				const picks = await getPicks();
				picker.items = picks;
				store.add(picker.onDidTriggerItemButton(async context => {
					if (context.button === openInEditorButton) {
						const options: IChatEditorOptions = { target: { sessionId: context.item.chat.sessionId }, pinned: true };
						editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, ACTIVE_GROUP);
						picker.hide();
					} else if (context.button === deleteButton) {
						chatService.removeHistoryEntry(context.item.chat.sessionId);
						picker.items = await getPicks();
					} else if (context.button === renameButton) {
						const title = await quickInputService.input({ title: localize('newChatTitle', "New chat title"), value: context.item.chat.title });
						if (title) {
							chatService.setChatSessionTitle(context.item.chat.sessionId, title);
						}

						// The quick input hides the picker, it gets disposed, so we kick it off from scratch
						await showPicker();
					}
				}));
				store.add(picker.onDidAccept(async () => {
					try {
						const item = picker.selectedItems[0];
						const sessionId = item.chat.sessionId;
						await view.loadSession(sessionId);
					} finally {
						picker.hide();
					}
				}));
				store.add(picker.onDidHide(() => store.dispose()));

				picker.show();
			};
			await showPicker();
		}
	});

	registerAction2(class OpenChatEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.openChat`,
				title: localize2('interactiveSession.open', "New Chat Editor"),
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled
			});
		}

		async run(accessor: ServicesAccessor) {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } satisfies IChatEditorOptions });
		}
	});


	registerAction2(class ChatAddAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.addParticipant',
				title: localize2('chatWith', "Chat with Extension"),
				icon: Codicon.mention,
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatInput,
					when: ChatContextKeys.chatMode.isEqualTo(ChatMode.Ask),
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
	});

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
			const chatService = accessor.get(IChatService);
			const instantiationService = accessor.get(IInstantiationService);
			const widgetService = accessor.get(IChatWidgetService);

			await chatService.clearAllHistoryEntries();

			widgetService.getAllWidgets().forEach(widget => {
				widget.clear();
			});

			// Clear all chat editors. Have to go this route because the chat editor may be in the background and
			// not have a ChatEditorInput.
			editorGroupsService.groups.forEach(group => {
				group.editors.forEach(editor => {
					if (editor instanceof ChatEditorInput) {
						instantiationService.invokeFunction(clearChatEditor, editor);
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

	const nonEnterpriseCopilotUsers = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${defaultChat.completionsAdvancedSetting}.authProvider`, defaultChat.enterpriseProviderId));
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.manageSettings',
				title: localize2('manageCopilot', "Manage Copilot"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ChatContextKeys.Entitlement.limited,
						ChatContextKeys.Entitlement.pro
					),
					nonEnterpriseCopilotUsers
				),
				menu: {
					id: MenuId.ChatTitleBarMenu,
					group: 'y_manage',
					order: 1,
					when: nonEnterpriseCopilotUsers
				}
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const openerService = accessor.get(IOpenerService);
			openerService.open(URI.parse(defaultChat.manageSettingsUrl));
		}
	});

	registerAction2(class ShowExtensionsUsingCopilot extends Action2 {

		constructor() {
			super({
				id: 'workbench.action.chat.showExtensionsUsingCopilot',
				title: localize2('showCopilotUsageExtensions', "Show Extensions using Copilot"),
				f1: true,
				category: EXTENSIONS_CATEGORY,
				precondition: ChatContextKeys.enabled
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
				precondition: ChatContextKeys.Setup.installed,
				menu: {
					id: MenuId.ChatTitleBarMenu,
					group: 'f_completions',
					order: 10,
				}
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand(defaultChat.completionsMenuCommand);
		}
	});

	registerAction2(class ShowQuotaExceededDialogAction extends Action2 {

		constructor() {
			super({
				id: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
				title: localize('upgradeChat', "Upgrade Copilot Plan")
			});
		}

		override async run(accessor: ServicesAccessor) {
			const chatEntitlementService = accessor.get(IChatEntitlementService);
			const commandService = accessor.get(ICommandService);
			const dialogService = accessor.get(IDialogService);
			const telemetryService = accessor.get(ITelemetryService);

			let message: string;
			const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
			const completionsQuotaExceeded = chatEntitlementService.quotas.completions?.percentRemaining === 0;
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				message = localize('chatQuotaExceeded', "You've reached your monthly chat requests quota. You still have free code completions available.");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				message = localize('completionsQuotaExceeded', "You've reached your monthly code completions quota. You still have free chat requests available.");
			} else {
				message = localize('chatAndCompletionsQuotaExceeded', "You've reached your monthly chat requests and code completions quota.");
			}

			if (chatEntitlementService.quotas.resetDate) {
				const dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
				const quotaResetDate = new Date(chatEntitlementService.quotas.resetDate);
				message = [message, localize('quotaResetDate', "The allowance will renew on {0}.", dateFormatter.format(quotaResetDate))].join(' ');
			}

			const limited = chatEntitlementService.entitlement === ChatEntitlement.Limited;
			const upgradeToPro = limited ? localize('upgradeToPro', "Upgrade to Copilot Pro (your first 30 days are free) for:\n- Unlimited code completions\n- Unlimited basic chat requests\n- Access to premium models") : undefined;

			await dialogService.prompt({
				type: 'none',
				message: localize('copilotQuotaReached', "Copilot Quota Reached"),
				cancelButton: {
					label: localize('dismiss', "Dismiss"),
					run: () => { /* noop */ }
				},
				buttons: [
					{
						label: limited ? localize('upgradePro', "Upgrade to Copilot Pro") : localize('upgradePlan', "Upgrade Copilot Plan"),
						run: () => {
							const commandId = 'workbench.action.chat.upgradePlan';
							telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'chat-dialog' });
							commandService.executeCommand(commandId);
						}
					},
				],
				custom: {
					icon: Codicon.copilotWarningLarge,
					markdownDetails: coalesce([
						{ markdown: new MarkdownString(message, true) },
						upgradeToPro ? { markdown: new MarkdownString(upgradeToPro, true) } : undefined
					])
				}
			});
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
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	completionsMenuCommand: product.defaultChatAgent?.completionsMenuCommand ?? '',
};

// Add next to the command center if command center is disabled
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Copilot"),
	icon: Codicon.copilot,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ChatContextKeys.Setup.hidden.negate(),
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
		ChatContextKeys.Setup.hidden.negate(),
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
			localize('toggle.chatControlsDescription', "Toggle visibility of the Copilot Controls in title bar"), 5,
			ContextKeyExpr.and(
				ChatContextKeys.Setup.hidden.negate(),
				IsCompactTitleBarContext.negate(),
				ChatContextKeys.supported
			)
		);
	}
});

registerAction2(class ResetTrustedToolsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.resetTrustedTools',
			title: localize2('resetTrustedTools', "Reset Tool Confirmations"),
			category: CHAT_CATEGORY,
			f1: true,
		});
	}
	override run(accessor: ServicesAccessor): void {
		accessor.get(ILanguageModelToolsService).resetToolAutoConfirmation();
		accessor.get(INotificationService).info(localize('resetTrustedToolsSuccess', "Tool confirmation preferences have been reset."));
	}
});

export class CopilotTitleBarMenuRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotTitleBarMenuRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const disposable = actionViewItemService.register(MenuId.CommandCenter, MenuId.ChatTitleBarMenu, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({
				id: 'copilot.titleBarMenuRendering.more',
				label: localize('more', "More..."),
				run() { }
			});

			const chatExtensionInstalled = chatEntitlementService.sentiment === ChatSentiment.Installed;
			const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
			const signedOut = chatEntitlementService.entitlement === ChatEntitlement.Unknown;
			const limited = chatEntitlementService.entitlement === ChatEntitlement.Limited;

			let primaryActionId = TOGGLE_CHAT_ACTION_ID;
			let primaryActionTitle = localize('toggleChat', "Toggle Chat");
			let primaryActionIcon = Codicon.copilot;
			if (chatExtensionInstalled) {
				if (signedOut) {
					primaryActionId = CHAT_SETUP_ACTION_ID;
					primaryActionTitle = localize('signInToChatSetup', "Sign in to use Copilot...");
					primaryActionIcon = Codicon.copilotNotConnected;
				} else if (chatQuotaExceeded && limited) {
					primaryActionId = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
					primaryActionTitle = localize('chatQuotaExceededButton', "Copilot Free plan chat requests quota reached. Click for details.");
					primaryActionIcon = Codicon.copilotWarning;
				}
			}
			return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, instantiationService.createInstance(MenuItemAction, {
				id: primaryActionId,
				title: primaryActionTitle,
				icon: primaryActionIcon,
			}, undefined, undefined, undefined, undefined), dropdownAction, action.actions, '', { ...options, skipTelemetry: true });
		}, Event.any(
			chatEntitlementService.onDidChangeSentiment,
			chatEntitlementService.onDidChangeQuotaExceeded,
			chatEntitlementService.onDidChangeEntitlement
		));

		// Reduces flicker a bit on reload/restart
		markAsSingleton(disposable);
	}
}

/**
 * Returns whether we can continue clearing/switching chat sessions, false to cancel.
 */
export async function handleCurrentEditingSession(currentEditingSession: IChatEditingSession, phrase: string | undefined, dialogService: IDialogService): Promise<boolean> {
	if (shouldShowClearEditingSessionConfirmation(currentEditingSession)) {
		return showClearEditingSessionConfirmation(currentEditingSession, dialogService, { messageOverride: phrase });
	}

	return true;
}

export interface IClearEditingSessionConfirmationOptions {
	titleOverride?: string;
	messageOverride?: string;
}

export async function showClearEditingSessionConfirmation(editingSession: IChatEditingSession, dialogService: IDialogService, options?: IClearEditingSessionConfirmationOptions): Promise<boolean> {
	const defaultPhrase = localize('chat.startEditing.confirmation.pending.message.default', "Starting a new chat will end your current edit session.");
	const defaultTitle = localize('chat.startEditing.confirmation.title', "Start new chat?");
	const phrase = options?.messageOverride ?? defaultPhrase;
	const title = options?.titleOverride ?? defaultTitle;

	const currentEdits = editingSession.entries.get();
	const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);

	const { result } = await dialogService.prompt({
		title,
		message: phrase + ' ' + localize('chat.startEditing.confirmation.pending.message.2', "Do you want to keep pending edits to {0} files?", undecidedEdits.length),
		type: 'info',
		cancelButton: true,
		buttons: [
			{
				label: localize('chat.startEditing.confirmation.acceptEdits', "Keep & Continue"),
				run: async () => {
					await editingSession.accept();
					return true;
				}
			},
			{
				label: localize('chat.startEditing.confirmation.discardEdits', "Undo & Continue"),
				run: async () => {
					await editingSession.reject();
					return true;
				}
			}
		],
	});

	return Boolean(result);
}

export function shouldShowClearEditingSessionConfirmation(editingSession: IChatEditingSession): boolean {
	const currentEdits = editingSession.entries.get();
	const currentEditCount = currentEdits.length;

	if (currentEditCount) {
		const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
		return !!undecidedEdits.length;
	}

	return false;
}
