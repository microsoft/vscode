/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { language } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../../editor/browser/editorExtensions.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { Action2, ICommandPaletteOptions, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { ActiveEditorContext, IsCompactTitleBarContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { AUX_WINDOW_GROUP } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { SCMHistoryItemChangeRangeContentProvider, ScmHistoryItemChangeRangeUriFields } from '../../../scm/browser/scmHistoryChatContext.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { IChatAgentResult, IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IChatModel, IChatResponseModel } from '../../common/model/chatModel.js';
import { ChatMode, IChatMode, IChatModeService } from '../../common/chatModes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ISCMHistoryItemChangeRangeVariableEntry, ISCMHistoryItemChangeVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM } from '../../common/model/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/widget/chatWidgetHistoryService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelChatSelector, ILanguageModelsService } from '../../common/languageModels.js';
import { CopilotUsageExtensionFeatureId } from '../../common/languageModelStats.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput, showClearEditingSessionConfirmation } from '../widgetHosts/editor/chatEditorInput.js';
import { convertBufferToScreenshotVariable } from '../attachments/chatScreenshotContext.js';

export const CHAT_CATEGORY = localize2('chat.category', 'Chat');

export const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;
export const ACTION_ID_NEW_EDIT_SESSION = `workbench.action.chat.newEditSession`;
export const ACTION_ID_OPEN_CHAT = 'workbench.action.openChat';
export const CHAT_OPEN_ACTION_ID = 'workbench.action.chat.open';
export const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
export const CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID = 'workbench.action.chat.triggerSetupSupportAnonymousAction';
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
	 * A list of file URIs to attach to the chat as context.
	 */
	attachFiles?: (URI | { uri: URI; range: IRange })[];
	/**
	 * A list of source control history item changes to attach to the chat as context.
	 */
	attachHistoryItemChanges?: { uri: URI; historyItemId: string }[];
	/**
	 * A list of source control history item change ranges to attach to the chat as context.
	 */
	attachHistoryItemChangeRanges?: {
		start: { uri: URI; historyItemId: string };
		end: { uri: URI; historyItemId: string };
	}[];
	/**
	 * The mode ID or name to open the chat in.
	 */
	mode?: ChatModeKind | string;

	/**
	 * The language model selector to use for the chat.
	 * An Error will be thrown if there's no match. If there are multiple
	 * matches, the first match will be used.
	 *
	 * Examples:
	 *
	 * ```
	 * {
	 *   id: 'claude-sonnet-4',
	 *   vendor: 'copilot'
	 * }
	 * ```
	 *
	 * Use `claude-sonnet-4` from any vendor:
	 *
	 * ```
	 * {
	 *   id: 'claude-sonnet-4',
	 * }
	 * ```
	 */
	modelSelector?: ILanguageModelChatSelector;

	/**
	 * Wait to resolve the command until the chat response reaches a terminal state (complete, error, or pending user confirmation, etc.).
	 */
	blockOnResponse?: boolean;
}

export interface IChatViewOpenRequestEntry {
	request: string;
	response: string;
}

export const CHAT_CONFIG_MENU_ID = new MenuId('workbench.chat.menu.config');

const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';

abstract class OpenChatGlobalAction extends Action2 {
	constructor(overrides: Pick<ICommandPaletteOptions, 'keybinding' | 'title' | 'id' | 'menu'>, private readonly mode?: IChatMode) {
		super({
			...overrides,
			icon: Codicon.chatSparkle,
			f1: true,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.Setup.hidden.negate(),
				ChatContextKeys.Setup.disabled.negate()
			)
		});
	}

	override async run(accessor: ServicesAccessor, opts?: string | IChatViewOpenOptions): Promise<IChatAgentResult & { type?: 'confirmation' } | undefined> {
		opts = typeof opts === 'string' ? { query: opts } : opts;

		const chatService = accessor.get(IChatService);
		const widgetService = accessor.get(IChatWidgetService);
		const toolsService = accessor.get(ILanguageModelToolsService);
		const hostService = accessor.get(IHostService);
		const chatAgentService = accessor.get(IChatAgentService);
		const instaService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);
		const chatModeService = accessor.get(IChatModeService);
		const fileService = accessor.get(IFileService);
		const languageModelService = accessor.get(ILanguageModelsService);
		const scmService = accessor.get(ISCMService);

		let chatWidget = widgetService.lastFocusedWidget;
		// When this was invoked to switch to a mode via keybinding, and some chat widget is focused, use that one.
		// Otherwise, open the view.
		if (!this.mode || !chatWidget || !isAncestorOfActiveElement(chatWidget.domNode)) {
			chatWidget = await widgetService.revealWidget();
		}

		if (!chatWidget) {
			return;
		}

		const switchToMode = (opts?.mode ? chatModeService.findModeByName(opts?.mode) : undefined) ?? this.mode;
		if (switchToMode) {
			await this.handleSwitchToMode(switchToMode, chatWidget, instaService, commandService);
		}

		if (opts?.modelSelector) {
			const ids = await languageModelService.selectLanguageModels(opts.modelSelector, false);
			const id = ids.sort().at(0);
			if (!id) {
				throw new Error(`No language models found matching selector: ${JSON.stringify(opts.modelSelector)}.`);
			}

			const model = languageModelService.lookupLanguageModel(id);
			if (!model) {
				throw new Error(`Language model not loaded: ${id}.`);
			}

			chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id });
		}

		if (opts?.previousRequests?.length && chatWidget.viewModel) {
			for (const { request, response } of opts.previousRequests) {
				chatService.addCompleteRequest(chatWidget.viewModel.sessionResource, request, undefined, 0, { message: response });
			}
		}
		if (opts?.attachScreenshot) {
			const screenshot = await hostService.getScreenshot();
			if (screenshot) {
				chatWidget.attachmentModel.addContext(convertBufferToScreenshotVariable(screenshot));
			}
		}
		if (opts?.attachFiles) {
			for (const file of opts.attachFiles) {
				const uri = file instanceof URI ? file : file.uri;
				const range = file instanceof URI ? undefined : file.range;

				if (await fileService.exists(uri)) {
					chatWidget.attachmentModel.addFile(uri, range);
				}
			}
		}
		if (opts?.attachHistoryItemChanges) {
			for (const historyItemChange of opts.attachHistoryItemChanges) {
				const repository = scmService.getRepository(URI.file(historyItemChange.uri.path));
				const historyProvider = repository?.provider.historyProvider.get();
				if (!historyProvider) {
					continue;
				}

				const historyItem = await historyProvider.resolveHistoryItem(historyItemChange.historyItemId);
				if (!historyItem) {
					continue;
				}

				chatWidget.attachmentModel.addContext({
					id: historyItemChange.uri.toString(),
					name: `${basename(historyItemChange.uri)}`,
					value: historyItemChange.uri,
					historyItem: historyItem,
					kind: 'scmHistoryItemChange'
				} satisfies ISCMHistoryItemChangeVariableEntry);
			}
		}
		if (opts?.attachHistoryItemChangeRanges) {
			for (const historyItemChangeRange of opts.attachHistoryItemChangeRanges) {
				const repository = scmService.getRepository(URI.file(historyItemChangeRange.end.uri.path));
				const historyProvider = repository?.provider.historyProvider.get();
				if (!repository || !historyProvider) {
					continue;
				}

				const [historyItemStart, historyItemEnd] = await Promise.all([
					historyProvider.resolveHistoryItem(historyItemChangeRange.start.historyItemId),
					historyProvider.resolveHistoryItem(historyItemChangeRange.end.historyItemId),
				]);
				if (!historyItemStart || !historyItemEnd) {
					continue;
				}

				const uri = historyItemChangeRange.end.uri.with({
					scheme: SCMHistoryItemChangeRangeContentProvider.scheme,
					query: JSON.stringify({
						repositoryId: repository.id,
						start: historyItemStart.id,
						end: historyItemChangeRange.end.historyItemId
					} satisfies ScmHistoryItemChangeRangeUriFields)
				});

				chatWidget.attachmentModel.addContext({
					id: uri.toString(),
					name: `${basename(uri)}`,
					value: uri,
					historyItemChangeStart: {
						uri: historyItemChangeRange.start.uri,
						historyItem: historyItemStart
					},
					historyItemChangeEnd: {
						uri: historyItemChangeRange.end.uri,
						historyItem: {
							...historyItemEnd,
							displayId: historyItemChangeRange.end.historyItemId
						}
					},
					kind: 'scmHistoryItemChangeRange'
				} satisfies ISCMHistoryItemChangeRangeVariableEntry);
			}
		}

		let resp: Promise<IChatResponseModel | undefined> | undefined;

		if (opts?.query) {

			if (opts.isPartialQuery) {
				chatWidget.setInput(opts.query);
			} else {
				if (!chatWidget.viewModel) {
					await Event.toPromise(chatWidget.onDidChangeViewModel);
				}
				await waitForDefaultAgent(chatAgentService, chatWidget.input.currentModeKind);
				chatWidget.setInput(opts.query); // wait until the model is restored before setting the input, or it will be cleared when the model is restored
				resp = chatWidget.acceptInput();
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

		if (opts?.blockOnResponse) {
			const response = await resp;
			if (response) {
				await new Promise<void>(resolve => {
					const d = response.onDidChange(async () => {
						if (response.isComplete || response.isPendingConfirmation.get()) {
							d.dispose();
							resolve();
						}
					});
				});

				return { ...response.result, type: response.isPendingConfirmation.get() ? 'confirmation' : undefined };
			}
		}

		return undefined;
	}

	private async handleSwitchToMode(switchToMode: IChatMode, chatWidget: IChatWidget, instaService: IInstantiationService, commandService: ICommandService): Promise<void> {
		const currentMode = chatWidget.input.currentModeKind;

		if (switchToMode) {
			const model = chatWidget.viewModel?.model;
			const chatModeCheck = model ? await instaService.invokeFunction(handleModeSwitch, currentMode, switchToMode.kind, model.getRequests().length, model) : { needToClearSession: false };
			if (!chatModeCheck) {
				return;
			}
			chatWidget.input.setChatMode(switchToMode.id);

			if (chatModeCheck.needToClearSession) {
				await commandService.executeCommand(ACTION_ID_NEW_CHAT);
			}
		}
	}
}

async function waitForDefaultAgent(chatAgentService: IChatAgentService, mode: ChatModeKind): Promise<void> {
	const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
	if (defaultAgent) {
		return;
	}

	await Promise.race([
		Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
			return Boolean(defaultAgent);
		})),
		timeout(60_000).then(() => { throw new Error('Timed out waiting for default agent'); })
	]);
}

class PrimaryOpenChatGlobalAction extends OpenChatGlobalAction {
	constructor() {
		super({
			id: CHAT_OPEN_ACTION_ID,
			title: localize2('openChat', "Open Chat"),
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
			}]
		});
	}
}

export function getOpenChatActionIdForMode(mode: IChatMode): string {
	return `workbench.action.chat.open${mode.name.get()}`;
}

export abstract class ModeOpenChatGlobalAction extends OpenChatGlobalAction {
	constructor(mode: IChatMode, keybinding?: ICommandPaletteOptions['keybinding']) {
		super({
			id: getOpenChatActionIdForMode(mode),
			title: localize2('openChatMode', "Open Chat ({0})", mode.label.get()),
			keybinding
		}, mode);
	}
}

export function registerChatActions() {
	registerAction2(PrimaryOpenChatGlobalAction);
	registerAction2(class extends ModeOpenChatGlobalAction {
		constructor() { super(ChatMode.Ask); }
	});
	registerAction2(class extends ModeOpenChatGlobalAction {
		constructor() {
			super(ChatMode.Agent, {
				when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				linux: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI
				}
			},);
		}
	});
	registerAction2(class extends ModeOpenChatGlobalAction {
		constructor() { super(ChatMode.Edit); }
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
			const widgetService = accessor.get(IChatWidgetService);

			const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);

			if (viewsService.isViewVisible(ChatViewId)) {
				this.updatePartVisibility(layoutService, chatLocation, false);
			} else {
				this.updatePartVisibility(layoutService, chatLocation, true);
				(await widgetService.revealWidget())?.focusInput();
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


	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: ACTION_ID_OPEN_CHAT,
				title: localize2('interactiveSession.open', "New Chat Editor"),
				icon: Codicon.plus,
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatEditor)
				},
				menu: [{
					id: MenuId.ChatTitleBarMenu,
					group: 'b_new',
					order: 0
				}, {
					id: MenuId.ChatNewMenu,
					group: '2_new',
					order: 2
				}, {
					id: MenuId.EditorTitle,
					group: 'navigation',
					when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.lockedToCodingAgent.negate()),
					order: 1
				}],
			});
		}

		async run(accessor: ServicesAccessor) {
			const widgetService = accessor.get(IChatWidgetService);
			await widgetService.openSession(ChatEditorInput.getNewEditorUri(), undefined, { pinned: true } satisfies IChatEditorOptions);
		}
	});

	registerAction2(class NewChatWindowAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.newChatWindow`,
				title: localize2('interactiveSession.newChatWindow', "New Chat Window"),
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled,
				menu: [{
					id: MenuId.ChatTitleBarMenu,
					group: 'b_new',
					order: 1
				}, {
					id: MenuId.ChatNewMenu,
					group: '2_new',
					order: 3
				}]
			});
		}

		async run(accessor: ServicesAccessor) {
			const widgetService = accessor.get(IChatWidgetService);
			await widgetService.openSession(ChatEditorInput.getNewEditorUri(), AUX_WINDOW_GROUP, { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } } satisfies IChatEditorOptions);
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
		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const historyService = accessor.get(IChatWidgetHistoryService);
			historyService.clearHistory();
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
				widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem();
			}
		}
	});

	registerAction2(class FocusMostRecentlyFocusedChatAction extends EditorAction2 {
		constructor() {
			super({
				id: 'workbench.chat.action.focusLastFocused',
				title: localize2('actions.interactiveSession.focusLastFocused', 'Focus Last Focused Chat List Item'),
				precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
				category: CHAT_CATEGORY,
				keybinding: [
					// On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
					{
						when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
						weight: KeybindingWeight.EditorContrib + 1,
					},
					// On win/linux, ctrl+up can always focus the chat list
					{
						when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
						weight: KeybindingWeight.EditorContrib + 1,
					},
					{
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
						primary: KeyMod.CtrlCmd | KeyCode.DownArrow | KeyMod.Shift,
						weight: KeybindingWeight.WorkbenchContrib + 1,
					}
				]
			});
		}

		runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem(true);
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
		run(accessor: ServicesAccessor, ...args: unknown[]) {
			const widgetService = accessor.get(IChatWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});

	const nonEnterpriseCopilotUsers = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${defaultChat.completionsAdvancedSetting}.authProvider`, defaultChat.provider.enterprise.id));
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.manageSettings',
				title: localize2('manageChat', "Manage Chat"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ChatContextKeys.Entitlement.planFree,
						ChatContextKeys.Entitlement.planPro,
						ChatContextKeys.Entitlement.planProPlus
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
			extensionsWorkbenchService.openSearch(`@contribute:${CopilotUsageExtensionFeatureId}`);
		}
	});

	registerAction2(class ConfigureCopilotCompletions extends Action2 {

		constructor() {
			super({
				id: 'workbench.action.chat.configureCodeCompletions',
				title: localize2('configureCompletions', "Configure Inline Suggestions..."),
				precondition: ContextKeyExpr.and(
					ChatContextKeys.Setup.installed,
					ChatContextKeys.Setup.disabled.negate(),
					ChatContextKeys.Setup.untrusted.negate()
				),
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
				title: localize('upgradeChat', "Upgrade GitHub Copilot Plan")
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
				message = localize('chatQuotaExceeded', "You've reached your monthly chat messages quota. You still have free inline suggestions available.");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				message = localize('completionsQuotaExceeded', "You've reached your monthly inline suggestions quota. You still have free chat messages available.");
			} else {
				message = localize('chatAndCompletionsQuotaExceeded', "You've reached your monthly chat messages and inline suggestions quota.");
			}

			if (chatEntitlementService.quotas.resetDate) {
				const dateFormatter = chatEntitlementService.quotas.resetDateHasTime ? safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
				const quotaResetDate = new Date(chatEntitlementService.quotas.resetDate);
				message = [message, localize('quotaResetDate', "The allowance will reset on {0}.", dateFormatter.value.format(quotaResetDate))].join(' ');
			}

			const free = chatEntitlementService.entitlement === ChatEntitlement.Free;
			const upgradeToPro = free ? localize('upgradeToPro', "Upgrade to GitHub Copilot Pro (your first 30 days are free) for:\n- Unlimited inline suggestions\n- Unlimited chat messages\n- Access to premium models") : undefined;

			await dialogService.prompt({
				type: 'none',
				message: localize('copilotQuotaReached', "GitHub Copilot Quota Reached"),
				cancelButton: {
					label: localize('dismiss', "Dismiss"),
					run: () => { /* noop */ }
				},
				buttons: [
					{
						label: free ? localize('upgradePro', "Upgrade to GitHub Copilot Pro") : localize('upgradePlan', "Upgrade GitHub Copilot Plan"),
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

	registerAction2(class ResetTrustedToolsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.resetTrustedTools',
				title: localize2('resetTrustedTools', "Reset Tool Confirmations"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ChatContextKeys.enabled
			});
		}
		override run(accessor: ServicesAccessor): void {
			accessor.get(ILanguageModelToolsConfirmationService).resetToolAutoConfirmation();
			accessor.get(INotificationService).info(localize('resetTrustedToolsSuccess', "Tool confirmation preferences have been reset."));
		}
	});

	registerAction2(class UpdateInstructionsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.generateInstructions',
				title: localize2('generateInstructions', "Generate Workspace Instructions File"),
				shortTitle: localize2('generateInstructions.short', "Generate Chat Instructions"),
				category: CHAT_CATEGORY,
				icon: Codicon.sparkle,
				f1: true,
				precondition: ChatContextKeys.enabled,
				menu: {
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 11,
					group: '1_level'
				}
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const commandService = accessor.get(ICommandService);

			// Use chat command to open and send the query
			const query = `Analyze this codebase to generate or update \`.github/copilot-instructions.md\` for guiding AI coding agents.

Focus on discovering the essential knowledge that would help an AI agents be immediately productive in this codebase. Consider aspects like:
- The "big picture" architecture that requires reading multiple files to understand - major components, service boundaries, data flows, and the "why" behind structural decisions
- Critical developer workflows (builds, tests, debugging) especially commands that aren't obvious from file inspection alone
- Project-specific conventions and patterns that differ from common practices
- Integration points, external dependencies, and cross-component communication patterns

Source existing AI conventions from \`**/{.github/copilot-instructions.md,AGENT.md,AGENTS.md,CLAUDE.md,.cursorrules,.windsurfrules,.clinerules,.cursor/rules/**,.windsurf/rules/**,.clinerules/**,README.md}\` (do one glob search).

Guidelines (read more at https://aka.ms/vscode-instructions-docs):
- If \`.github/copilot-instructions.md\` exists, merge intelligently - preserve valuable content while updating outdated sections
- Write concise, actionable instructions (~20-50 lines) using markdown structure
- Include specific examples from the codebase when describing patterns
- Avoid generic advice ("write tests", "handle errors") - focus on THIS project's specific approaches
- Document only discoverable patterns, not aspirational practices
- Reference key files/directories that exemplify important patterns

Update \`.github/copilot-instructions.md\` for the user, then ask for feedback on any unclear or incomplete sections to iterate.`;

			await commandService.executeCommand('workbench.action.chat.open', {
				mode: 'agent',
				query: query,
			});
		}
	});

	registerAction2(class OpenChatFeatureSettingsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openFeatureSettings',
				title: localize2('openChatFeatureSettings', "Chat Settings"),
				shortTitle: localize('openChatFeatureSettings.short', "Chat Settings"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ChatContextKeys.enabled,
				menu: [{
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 15,
					group: '3_configure'
				},
				{
					id: MenuId.ChatWelcomeContext,
					group: '2_settings',
					order: 1
				}]
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const preferencesService = accessor.get(IPreferencesService);
			preferencesService.openSettings({ query: '@feature:chat ' });
		}
	});

	MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
		submenu: CHAT_CONFIG_MENU_ID,
		title: localize2('config.label', "Configure Chat"),
		group: 'navigation',
		when: ContextKeyExpr.equals('view', ChatViewId),
		icon: Codicon.gear,
		order: 6
	});
}

export function stringifyItem(item: IChatRequestViewModel | IChatResponseViewModel, includeName = true): string {
	if (isRequestVM(item)) {
		return (includeName ? `${item.username}: ` : '') + item.messageText;
	} else {
		return (includeName ? `${item.username}: ` : '') + item.response.toString();
	}
}


// --- Title Bar Chat Controls

const defaultChat = {
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { enterprise: { id: '' } },
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	completionsMenuCommand: product.defaultChatAgent?.completionsMenuCommand ?? '',
};

// Add next to the command center if command center is disabled
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Chat"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabled.negate()
		),
		ContextKeyExpr.has('config.chat.commandCenter.enabled')
	),
	order: 10001 // to the right of command center
});

// Add to the global title bar if command center is disabled
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	submenu: MenuId.ChatTitleBarMenu,
	title: localize('title4', "Chat"),
	group: 'navigation',
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.and(
		ChatContextKeys.supported,
		ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabled.negate()
		),
		ContextKeyExpr.has('config.chat.commandCenter.enabled'),
		ContextKeyExpr.has('config.window.commandCenter').negate(),
	),
	order: 1
});

registerAction2(class ToggleCopilotControl extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			'chat.commandCenter.enabled',
			localize('toggle.chatControl', 'Chat Controls'),
			localize('toggle.chatControlsDescription', "Toggle visibility of the Chat Controls in title bar"), 5,
			ContextKeyExpr.and(
				ContextKeyExpr.and(
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabled.negate()
				),
				IsCompactTitleBarContext.negate(),
				ChatContextKeys.supported
			)
		);
	}
});

export class CopilotTitleBarMenuRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotTitleBarMenuRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const disposable = actionViewItemService.register(MenuId.CommandCenter, MenuId.ChatTitleBarMenu, (action, options, instantiationService, windowId) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({
				id: 'copilot.titleBarMenuRendering.more',
				label: localize('more', "More..."),
				run() { }
			});

			const chatSentiment = chatEntitlementService.sentiment;
			const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
			const signedOut = chatEntitlementService.entitlement === ChatEntitlement.Unknown;
			const anonymous = chatEntitlementService.anonymous;
			const free = chatEntitlementService.entitlement === ChatEntitlement.Free;

			const isAuxiliaryWindow = windowId !== mainWindow.vscodeWindowId;
			let primaryActionId = isAuxiliaryWindow ? CHAT_OPEN_ACTION_ID : TOGGLE_CHAT_ACTION_ID;
			let primaryActionTitle = isAuxiliaryWindow ? localize('openChat', "Open Chat") : localize('toggleChat', "Toggle Chat");
			let primaryActionIcon = Codicon.chatSparkle;
			if (chatSentiment.installed && !chatSentiment.disabled) {
				if (signedOut && !anonymous) {
					primaryActionId = CHAT_SETUP_ACTION_ID;
					primaryActionTitle = localize('signInToChatSetup', "Sign in to use AI features...");
					primaryActionIcon = Codicon.chatSparkleError;
				} else if (chatQuotaExceeded && free) {
					primaryActionId = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
					primaryActionTitle = localize('chatQuotaExceededButton', "GitHub Copilot Free plan chat messages quota reached. Click for details.");
					primaryActionIcon = Codicon.chatSparkleWarning;
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
			chatEntitlementService.onDidChangeEntitlement,
			chatEntitlementService.onDidChangeAnonymous
		));

		// Reduces flicker a bit on reload/restart
		markAsSingleton(disposable);
	}
}

/**
 * Returns whether we can continue clearing/switching chat sessions, false to cancel.
 */
export async function handleCurrentEditingSession(model: IChatModel, phrase: string | undefined, dialogService: IDialogService): Promise<boolean> {
	return showClearEditingSessionConfirmation(model, dialogService, { messageOverride: phrase });
}

/**
 * Returns whether we can switch the agent, based on whether the user had to agree to clear the session, false to cancel.
 */
export async function handleModeSwitch(
	accessor: ServicesAccessor,
	fromMode: ChatModeKind,
	toMode: ChatModeKind,
	requestCount: number,
	model: IChatModel | undefined,
): Promise<false | { needToClearSession: boolean }> {
	if (!model?.editingSession || fromMode === toMode) {
		return { needToClearSession: false };
	}

	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);
	const needToClearEdits = (!configurationService.getValue(ChatConfiguration.Edits2Enabled) && (fromMode === ChatModeKind.Edit || toMode === ChatModeKind.Edit)) && requestCount > 0;
	if (needToClearEdits) {
		// If not using edits2 and switching into or out of edit mode, ask to discard the session
		const phrase = localize('switchMode.confirmPhrase', "Switching agents will end your current edit session.");

		const currentEdits = model.editingSession.entries.get();
		const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
		if (undecidedEdits.length > 0) {
			if (!await handleCurrentEditingSession(model, phrase, dialogService)) {
				return false;
			}

			return { needToClearSession: true };
		} else {
			const confirmation = await dialogService.confirm({
				title: localize('agent.newSession', "Start new session?"),
				message: localize('agent.newSessionMessage', "Changing the agent will end your current edit session. Would you like to change the agent?"),
				primaryButton: localize('agent.newSession.confirm', "Yes"),
				type: 'info'
			});
			if (!confirmation.confirmed) {
				return false;
			}

			return { needToClearSession: true };
		}
	}

	return { needToClearSession: false };
}

export interface IClearEditingSessionConfirmationOptions {
	titleOverride?: string;
	messageOverride?: string;
	isArchiveAction?: boolean;
}


// --- Chat Submenus in various Components

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	submenu: MenuId.ChatTextEditorMenu,
	group: '1_chat',
	order: 5,
	title: localize('generateCode', "Generate Code"),
	when: ContextKeyExpr.and(
		ChatContextKeys.Setup.hidden.negate(),
		ChatContextKeys.Setup.disabled.negate()
	)
});

// --- Chat Default Visibility

registerAction2(class ToggleDefaultVisibilityAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.toggleDefaultVisibility',
			title: localize2('chat.toggleDefaultVisibility.label', "Show View by Default"),
			toggled: ContextKeyExpr.equals('config.workbench.secondarySideBar.defaultVisibility', 'hidden').negate(),
			f1: false,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', ChatViewId),
					ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.AuxiliaryBar),
				),
				order: 0,
				group: '5_configure'
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const configurationService = accessor.get(IConfigurationService);

		const currentValue = configurationService.getValue<'hidden' | unknown>('workbench.secondarySideBar.defaultVisibility');
		configurationService.updateValue('workbench.secondarySideBar.defaultVisibility', currentValue !== 'hidden' ? 'hidden' : 'visible');
	}
});

registerAction2(class EditToolApproval extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.editToolApproval',
			title: localize2('chat.editToolApproval.label', "Manage Tool Approval"),
			metadata: {
				description: localize2('chat.editToolApproval.description', "Edit/manage the tool approval and confirmation preferences for AI chat agents."),
			},
			precondition: ChatContextKeys.enabled,
			f1: true,
			category: CHAT_CATEGORY,
		});
	}

	async run(accessor: ServicesAccessor, scope?: 'workspace' | 'profile' | 'session'): Promise<void> {
		const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
		const toolsService = accessor.get(ILanguageModelToolsService);
		confirmationService.manageConfirmationPreferences([...toolsService.getTools()], scope ? { defaultScope: scope } : undefined);
	}
});

registerAction2(class ToggleChatViewTitleAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.toggleChatViewTitle',
			title: localize2('chat.toggleChatViewTitle.label', "Show Chat Title"),
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewTitleEnabled}`, true),
			menu: {
				id: MenuId.ChatWelcomeContext,
				group: '1_modify',
				order: 2,
				when: ChatContextKeys.inChatEditor.negate()
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const chatViewTitleEnabled = configurationService.getValue<boolean>(ChatConfiguration.ChatViewTitleEnabled);
		await configurationService.updateValue(ChatConfiguration.ChatViewTitleEnabled, !chatViewTitleEnabled);
	}
});

registerAction2(class ToggleChatViewWelcomeAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.toggleChatViewWelcome',
			title: localize2('chat.toggleChatViewWelcome.label', "Show Welcome"),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewWelcomeEnabled}`, true),
			menu: {
				id: MenuId.ChatWelcomeContext,
				group: '1_modify',
				order: 3,
				when: ChatContextKeys.inChatEditor.negate()
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const chatViewWelcomeEnabled = configurationService.getValue<boolean>(ChatConfiguration.ChatViewWelcomeEnabled);
		await configurationService.updateValue(ChatConfiguration.ChatViewWelcomeEnabled, !chatViewWelcomeEnabled);
	}
});
