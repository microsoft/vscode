/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { language } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorAction2 } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { SCMHistoryItemChangeRangeContentProvider } from '../../../scm/browser/scmHistoryChatContext.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatMode, IChatModeService } from '../../common/chatModes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/widget/chatWidgetHistoryService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { AICustomizationManagementCommands } from '../aiCustomization/aiCustomizationManagement.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { CopilotUsageExtensionFeatureId } from '../../common/languageModelStats.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, isToolSet } from '../../common/tools/languageModelToolsService.js';
import { ChatViewId, IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { ChatEditorInput, showClearEditingSessionConfirmation } from '../widgetHosts/editor/chatEditorInput.js';
import { convertBufferToScreenshotVariable } from '../attachments/chatScreenshotContext.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
export const CHAT_CATEGORY = localize2('chat.category', 'Chat');
export const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;
export const ACTION_ID_NEW_EDIT_SESSION = `workbench.action.chat.newEditSession`;
export const ACTION_ID_OPEN_CHAT = 'workbench.action.openChat';
export const CHAT_OPEN_ACTION_ID = 'workbench.action.chat.open';
export const CHAT_SETUP_ACTION_ID = 'workbench.action.chat.triggerSetup';
export const CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID = 'workbench.action.chat.triggerSetupSupportAnonymousAction';
const TOGGLE_CHAT_ACTION_ID = 'workbench.action.chat.toggle';
export const GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID = 'workbench.action.chat.generateAgentInstructions';
export const GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID = 'workbench.action.chat.generateOnDemandInstructions';
export const GENERATE_PROMPT_COMMAND_ID = 'workbench.action.chat.generatePrompt';
export const GENERATE_SKILL_COMMAND_ID = 'workbench.action.chat.generateSkill';
export const GENERATE_AGENT_COMMAND_ID = 'workbench.action.chat.generateAgent';
export const GENERATE_HOOK_COMMAND_ID = 'workbench.action.chat.generateHook';
export const INSERT_FORK_CONVERSATION_COMMAND_ID = 'workbench.action.chat.insertForkConversationCommand';
export const INSERT_TROUBLESHOOT_COMMAND_ID = 'workbench.action.chat.insertTroubleshootCommand';
const defaultChat = {
    manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
    provider: product.defaultChatAgent?.provider ?? { enterprise: { id: '' } },
    completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
    completionsMenuCommand: product.defaultChatAgent?.completionsMenuCommand ?? '',
};
export const CHAT_CONFIG_MENU_ID = new MenuId('workbench.chat.menu.config');
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';
class OpenChatGlobalAction extends Action2 {
    constructor(overrides, mode) {
        super({
            ...overrides,
            icon: Codicon.chatSparkle,
            f1: true,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate())
        });
        this.mode = mode;
    }
    async run(accessor, opts) {
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
        const logService = accessor.get(ILogService);
        const configurationService = accessor.get(IConfigurationService);
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
            const ids = await languageModelService.selectLanguageModels(opts.modelSelector);
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
        if (opts?.toolsInclude || opts?.toolsExclude) {
            const model = chatWidget.input.selectedLanguageModel.get()?.metadata;
            const allTools = Array.from(toolsService.getTools(model));
            const allToolSets = Array.from(toolsService.getToolSetsForModel(model));
            const result = computeToolEnablementMap({
                allTools,
                allToolSets,
                toolsInclude: opts.toolsInclude,
                toolsExclude: opts.toolsExclude,
            });
            for (const identifier of result.unknownIdentifiers) {
                logService.warn(`Tool filtering: Unknown identifier '${identifier}' - no matching tool or toolset found.`);
            }
            chatWidget.input.selectedToolsModel.set(result.enablementMap, true);
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
                });
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
                    })
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
                });
            }
        }
        let resp;
        if (opts?.query) {
            if (opts.isPartialQuery) {
                chatWidget.input.showScrollbarUntilAccept();
                chatWidget.setInput(opts.query);
            }
            else {
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
                const autoReplyEnabled = configurationService.getValue(ChatConfiguration.AutoReply);
                await new Promise(resolve => {
                    const d = response.onDidChange(async () => {
                        if (response.isComplete) {
                            d.dispose();
                            resolve();
                            return;
                        }
                        const pendingConfirmation = response.isPendingConfirmation.get();
                        if (pendingConfirmation) {
                            // Check if the pending confirmation is a question carousel that will be auto-replied.
                            // Only question carousels are auto-replied; other confirmation types (tool approvals,
                            // elicitations, etc.) should cause us to resolve immediately.
                            const hasPendingQuestionCarousel = response.response.value.some(part => part.kind === 'questionCarousel' && !part.isUsed);
                            if (autoReplyEnabled && hasPendingQuestionCarousel) {
                                // Auto-reply will handle this question carousel, keep waiting
                                return;
                            }
                            d.dispose();
                            resolve();
                        }
                    });
                });
                const confirmationInfo = getPendingConfirmationInfo(response);
                if (confirmationInfo) {
                    return { ...response.result, ...confirmationInfo };
                }
                return { ...response.result };
            }
        }
        return undefined;
    }
    async handleSwitchToMode(switchToMode, chatWidget, instaService, commandService) {
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
async function waitForDefaultAgent(chatAgentService, mode) {
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
/**
 * Extracts detailed information about the pending confirmation from a chat response.
 * Returns undefined if there is no pending confirmation.
 */
function getPendingConfirmationInfo(response) {
    for (const part of response.response.value) {
        if (part.kind === 'toolInvocation') {
            const state = part.state.get();
            if (state.type === 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                return {
                    type: 'confirmation',
                    kind: 'toolInvocation',
                    toolId: part.toolId,
                };
            }
            if (state.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                return {
                    type: 'confirmation',
                    kind: 'toolPostApproval',
                    toolId: part.toolId,
                };
            }
        }
        if (part.kind === 'confirmation' && !part.isUsed) {
            return {
                type: 'confirmation',
                kind: 'confirmation',
                title: part.title,
                data: part.data,
            };
        }
        if (part.kind === 'questionCarousel' && !part.isUsed) {
            return {
                type: 'confirmation',
                kind: 'questionCarousel',
                questions: part.questions,
            };
        }
        if (part.kind === 'elicitation2' && part.state.get() === "pending" /* ElicitationState.Pending */) {
            const title = part.title;
            return {
                type: 'confirmation',
                kind: 'elicitation',
                title: typeof title === 'string' ? title : title.value,
            };
        }
    }
    return undefined;
}
class PrimaryOpenChatGlobalAction extends OpenChatGlobalAction {
    constructor() {
        super({
            id: CHAT_OPEN_ACTION_ID,
            title: localize2('openChat', "Open Chat"),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 39 /* KeyCode.KeyI */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 39 /* KeyCode.KeyI */
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
export function getOpenChatActionIdForMode(mode) {
    return `workbench.action.chat.open${mode.name.get()}`;
}
export class ModeOpenChatGlobalAction extends OpenChatGlobalAction {
    constructor(mode, keybinding) {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */,
                linux: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */
                }
            });
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
        async run(accessor) {
            const layoutService = accessor.get(IWorkbenchLayoutService);
            const viewsService = accessor.get(IViewsService);
            const viewDescriptorService = accessor.get(IViewDescriptorService);
            const widgetService = accessor.get(IChatWidgetService);
            const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
            const chatVisible = viewsService.isViewVisible(ChatViewId);
            if (chatVisible) {
                this.updatePartVisibility(layoutService, chatLocation, false);
            }
            else {
                this.updatePartVisibility(layoutService, chatLocation, true);
                (await widgetService.revealWidget())?.focusInput();
            }
        }
        updatePartVisibility(layoutService, location, visible) {
            let part;
            switch (location) {
                case 1 /* ViewContainerLocation.Panel */:
                    part = "workbench.parts.panel" /* Parts.PANEL_PART */;
                    break;
                case 0 /* ViewContainerLocation.Sidebar */:
                    part = "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
                    break;
                case 2 /* ViewContainerLocation.AuxiliaryBar */:
                    part = "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
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
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
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
                        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('copilot'), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('new-session'), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('comment')),
                        order: 1
                    }],
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), ACTIVE_GROUP, { pinned: true });
        }
    });
    registerAction2(class NewChatEditorCopilotIconAction extends Action2 {
        constructor() {
            super({
                id: ACTION_ID_OPEN_CHAT + '.copilotIcon',
                title: localize2('interactiveSession.open', "New Chat Editor"),
                icon: Codicon.copilot,
                f1: false,
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: MenuId.EditorTitle,
                        group: 'navigation',
                        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo('copilot')),
                        order: 1
                    }],
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), ACTIVE_GROUP, { pinned: true });
        }
    });
    registerAction2(class NewChatEditorNewSessionIconAction extends Action2 {
        constructor() {
            super({
                id: ACTION_ID_OPEN_CHAT + '.newSessionIcon',
                title: localize2('interactiveSession.open', "New Chat Editor"),
                icon: Codicon.newSession,
                f1: false,
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: MenuId.EditorTitle,
                        group: 'navigation',
                        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo('new-session')),
                        order: 1
                    }],
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), ACTIVE_GROUP, { pinned: true });
        }
    });
    registerAction2(class NewChatEditorCommentIconAction extends Action2 {
        constructor() {
            super({
                id: ACTION_ID_OPEN_CHAT + '.commentIcon',
                title: localize2('interactiveSession.open', "New Chat Editor"),
                icon: Codicon.comment,
                f1: false,
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                menu: [{
                        id: MenuId.EditorTitle,
                        group: 'navigation',
                        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo('comment')),
                        order: 1
                    }],
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), ACTIVE_GROUP, { pinned: true });
        }
    });
    registerAction2(class NewChatEditorToSideAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.openChatToSide',
                title: localize2('interactiveSession.openToSide', "New Chat Editor to the Side"),
                f1: true,
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), SIDE_GROUP, { pinned: true });
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
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            await widgetService.openSession(LocalChatSessionUri.getNewSessionUri(), AUX_WINDOW_GROUP, { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } });
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
        async run(accessor, ...args) {
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
                        primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                        weight: 100 /* KeybindingWeight.EditorContrib */,
                    },
                    // On win/linux, ctrl+up can always focus the chat list
                    {
                        when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
                        primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                        weight: 100 /* KeybindingWeight.EditorContrib */,
                    },
                    {
                        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
                        primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    }
                ]
            });
        }
        runEditorCommand(accessor, editor) {
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
                        primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */ | 1024 /* KeyMod.Shift */,
                        weight: 100 /* KeybindingWeight.EditorContrib */ + 1,
                    },
                    // On win/linux, ctrl+up can always focus the chat list
                    {
                        when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
                        primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */ | 1024 /* KeyMod.Shift */,
                        weight: 100 /* KeybindingWeight.EditorContrib */ + 1,
                    },
                    {
                        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
                        primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */ | 1024 /* KeyMod.Shift */,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    }
                ]
            });
        }
        runEditorCommand(accessor, editor) {
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
                        primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat.negate()),
                    },
                    {
                        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat),
                        primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    }
                ]
            });
        }
        run(accessor, ...args) {
            const widgetService = accessor.get(IChatWidgetService);
            widgetService.lastFocusedWidget?.focusInput();
        }
    });
    registerAction2(class FocusTodosViewAction extends Action2 {
        static { this.ID = 'workbench.action.chat.focusTodosView'; }
        constructor() {
            super({
                id: FocusTodosViewAction.ID,
                title: localize2('interactiveSession.focusTodosView.label', "Toggle Focus Between TODOs and Input"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
                keybinding: [{
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                        primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 50 /* KeyCode.KeyT */,
                        when: ContextKeyExpr.or(ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent)), ContextKeyExpr.and(ChatContextKeys.inChatTodoList, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent))),
                    }]
            });
        }
        run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            const widget = widgetService.lastFocusedWidget;
            if (!widget || !widget.toggleTodosViewFocus()) {
                alert(localize('chat.todoList.focusUnavailable', "No agent todos to focus right now."));
            }
        }
    });
    registerAction2(class FocusQuestionCarouselAction extends Action2 {
        static { this.ID = 'workbench.action.chat.focusQuestionCarousel'; }
        constructor() {
            super({
                id: FocusQuestionCarouselAction.ID,
                title: localize2('interactiveSession.focusQuestionCarousel.label', "Chat: Toggle Focus Between Question and Input"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ChatContextKeys.inChatSession,
                keybinding: [{
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */,
                        when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
                    }]
            });
        }
        run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            const widget = widgetService.lastFocusedWidget;
            if (!widget || !widget.toggleQuestionCarouselFocus()) {
                alert(localize('chat.questionCarousel.focusUnavailable', "No chat question to focus right now."));
            }
        }
    });
    registerAction2(class PreviousQuestionCarouselQuestionAction extends Action2 {
        static { this.ID = 'workbench.action.chat.previousQuestion'; }
        constructor() {
            super({
                id: PreviousQuestionCarouselQuestionAction.ID,
                title: localize2('interactiveSession.previousQuestion.label', "Chat: Previous Question"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
                keybinding: [{
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 512 /* KeyMod.Alt */ | 46 /* KeyCode.KeyP */,
                        when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel),
                    }]
            });
        }
        run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            widgetService.lastFocusedWidget?.navigateToPreviousQuestion();
        }
    });
    registerAction2(class NextQuestionCarouselQuestionAction extends Action2 {
        static { this.ID = 'workbench.action.chat.nextQuestion'; }
        constructor() {
            super({
                id: NextQuestionCarouselQuestionAction.ID,
                title: localize2('interactiveSession.nextQuestion.label', "Chat: Next Question"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
                keybinding: [{
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 512 /* KeyMod.Alt */ | 44 /* KeyCode.KeyN */,
                        when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel),
                    }]
            });
        }
        run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            widgetService.lastFocusedWidget?.navigateToNextQuestion();
        }
    });
    registerAction2(class FocusTipAction extends Action2 {
        static { this.ID = 'workbench.action.chat.focusTip'; }
        constructor() {
            super({
                id: FocusTipAction.ID,
                title: localize2('interactiveSession.focusTip.label', "Chat: Toggle Focus Between Tip and Input"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ChatContextKeys.inChatSession,
                keybinding: [{
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 90 /* KeyCode.Slash */,
                        when: ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.inChatTip),
                    }]
            });
        }
        run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            const widget = widgetService.lastFocusedWidget;
            if (!widget || !widget.toggleTipFocus()) {
                alert(localize('chat.tip.focusUnavailable', "No chat tip."));
            }
        }
    });
    registerAction2(class ShowContextUsageAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.showContextUsage',
                title: localize2('interactiveSession.showContextUsage.label', "Show Context Window Usage"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ChatContextKeys.enabled,
            });
        }
        async run(accessor) {
            const widgetService = accessor.get(IChatWidgetService);
            const widget = widgetService.lastFocusedWidget ?? (await widgetService.revealWidget());
            widget?.input.showContextUsageDetails();
        }
    });
    registerAction2(class ToggleShowContextUsageAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.toggleShowContextUsage',
                title: localize2('chat.showContextUsage', "Show Context Usage"),
                category: CHAT_CATEGORY,
                toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatContextUsageEnabled}`, true),
                menu: {
                    id: MenuId.ChatWelcomeContext,
                    group: '1_display',
                    order: 1,
                    when: ChatContextKeys.inChatEditor.negate()
                }
            });
        }
        async run(accessor) {
            const configurationService = accessor.get(IConfigurationService);
            const currentValue = configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled);
            await configurationService.updateValue(ChatConfiguration.ChatContextUsageEnabled, !currentValue);
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
                precondition: ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.Entitlement.planFree, ChatContextKeys.Entitlement.planEdu, ChatContextKeys.Entitlement.planPro, ChatContextKeys.Entitlement.planProPlus), nonEnterpriseCopilotUsers),
                menu: {
                    id: MenuId.ChatTitleBarMenu,
                    group: 'y_manage',
                    order: 1,
                    when: nonEnterpriseCopilotUsers
                }
            });
        }
        async run(accessor) {
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
        async run(accessor) {
            const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
            extensionsWorkbenchService.openSearch(`@contribute:${CopilotUsageExtensionFeatureId}`);
        }
    });
    registerAction2(class ConfigureCopilotCompletions extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.configureCodeCompletions',
                title: localize2('configureCompletions', "Configure Inline Suggestions..."),
                precondition: ContextKeyExpr.and(ChatContextKeys.Setup.installed, ChatContextKeys.Setup.disabled.negate(), ChatContextKeys.Setup.untrusted.negate()),
                menu: {
                    id: MenuId.ChatTitleBarMenu,
                    group: 'f_completions',
                    order: 10,
                }
            });
        }
        async run(accessor) {
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
        async run(accessor) {
            const chatEntitlementService = accessor.get(IChatEntitlementService);
            const commandService = accessor.get(ICommandService);
            const dialogService = accessor.get(IDialogService);
            const telemetryService = accessor.get(ITelemetryService);
            let message;
            const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
            const completionsQuotaExceeded = chatEntitlementService.quotas.completions?.percentRemaining === 0;
            if (chatQuotaExceeded && !completionsQuotaExceeded) {
                message = localize('chatQuotaExceeded', "You've reached your monthly chat messages quota. You still have free inline suggestions available.");
            }
            else if (completionsQuotaExceeded && !chatQuotaExceeded) {
                message = localize('completionsQuotaExceeded', "You've reached your monthly inline suggestions quota. You still have free chat messages available.");
            }
            else {
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
                    run: () => { }
                },
                buttons: [
                    {
                        label: free ? localize('upgradePro', "Upgrade to GitHub Copilot Pro") : localize('upgradePlan', "Upgrade GitHub Copilot Plan"),
                        run: () => {
                            const commandId = 'workbench.action.chat.upgradePlan';
                            telemetryService.publicLog2('workbenchActionExecuted', { id: commandId, from: 'chat-dialog' });
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
        run(accessor) {
            accessor.get(ILanguageModelToolsConfirmationService).resetToolAutoConfirmation();
            accessor.get(INotificationService).info(localize('resetTrustedToolsSuccess', "Tool confirmation preferences have been reset."));
        }
    });
    registerAction2(class GenerateInstructionsAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
                title: localize2('generateInstructions', "Generate Agent Instructions"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/init',
                isPartialQuery: false,
            });
        }
    });
    registerAction2(class GenerateInstructionAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
                title: localize2('generateOnDemandInstructions', "Generate On-Demand Instructions"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/create-instructions ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class GeneratePromptAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_PROMPT_COMMAND_ID,
                title: localize2('generatePrompt', "Generate Prompt File"),
                shortTitle: localize2('generatePrompt.short', "Generate Prompt"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/create-prompt ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class GenerateSkillAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_SKILL_COMMAND_ID,
                title: localize2('generateSkill', "Generate Skill"),
                shortTitle: localize2('generateSkill.short', "Generate Skill"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/create-skill ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class GenerateAgentAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_AGENT_COMMAND_ID,
                title: localize2('generateAgent', "Generate Custom Agent"),
                shortTitle: localize2('generateAgent.short', "Generate Agent"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/create-agent ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class GenerateHookAction extends Action2 {
        constructor() {
            super({
                id: GENERATE_HOOK_COMMAND_ID,
                title: localize2('generateHook', "Generate Hook"),
                shortTitle: localize2('generateHook.short', "Generate Hook"),
                category: CHAT_CATEGORY,
                icon: Codicon.sparkle,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                mode: 'agent',
                query: '/create-hook ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class InsertForkConversationSlashCommandAction extends Action2 {
        constructor() {
            super({
                id: INSERT_FORK_CONVERSATION_COMMAND_ID,
                title: localize2('insertForkConversationSlashCommand', "Insert Fork Command"),
                shortTitle: localize2('insertForkConversationSlashCommand.short', "Insert /fork"),
                category: CHAT_CATEGORY,
                icon: Codicon.repoForked,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                query: '/fork ',
                isPartialQuery: true,
            });
        }
    });
    registerAction2(class InsertTroubleshootSlashCommandAction extends Action2 {
        constructor() {
            super({
                id: INSERT_TROUBLESHOOT_COMMAND_ID,
                title: localize2('insertTroubleshootSlashCommand', "Insert Troubleshoot Command"),
                shortTitle: localize2('insertTroubleshootSlashCommand.short', "Insert /troubleshoot"),
                category: CHAT_CATEGORY,
                f1: true,
                precondition: ChatContextKeys.enabled
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand('workbench.action.chat.open', {
                query: '/troubleshoot ',
                isPartialQuery: true,
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
                    },
                    {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`)),
                        order: 15,
                        group: '3_configure'
                    }]
            });
        }
        async run(accessor) {
            const preferencesService = accessor.get(IPreferencesService);
            preferencesService.openSettings({ query: '@feature:chat ' });
        }
    });
    // When customizations menu is enabled, show a direct gear action to open the Customizations editor
    MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
        command: {
            id: AICustomizationManagementCommands.OpenEditor,
            title: localize2('openChatCustomizations', "Open Customizations"),
            category: CHAT_CATEGORY,
            icon: Codicon.gear
        },
        group: 'navigation',
        when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`)),
        order: 6
    });
    // When customizations menu is disabled, show the legacy gear submenu
    MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
        submenu: CHAT_CONFIG_MENU_ID,
        title: localize2('config.label', "Configure Chat"),
        group: 'navigation',
        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ContextKeyExpr.has(`config.${ChatConfiguration.ChatCustomizationMenuEnabled}`).negate()),
        icon: Codicon.gear,
        order: 6
    });
}
export function stringifyItem(item, includeName = true) {
    if (isRequestVM(item)) {
        return (includeName ? `${item.username}: ` : '') + item.messageText;
    }
    else {
        return (includeName ? `${item.username}: ` : '') + item.response.toString();
    }
}
/**
 * Computes the tool enablement map based on include/exclude filters.
 *
 * Resolution algorithm:
 * 1. If `toolsInclude` is specified, start with only those tools/toolsets enabled
 * 2. If `toolsExclude` is specified, remove those tools/toolsets
 * 3. Explicit tool references in `toolsInclude` override toolset exclusions
 * 4. Explicit tool exclusions always win
 * 5. Toolset enablement is calculated based on whether all member tools are enabled
 *
 * @throws Error if filtering results in zero enabled tools
 */
export function computeToolEnablementMap(options) {
    const { allTools, allToolSets, toolsInclude, toolsExclude } = options;
    const enablementMap = new Map();
    const matchedIdentifiers = new Set();
    // Helper to check if a tool matches any identifier (by id or toolReferenceName)
    const toolMatches = (tool, identifiers) => {
        if (identifiers.has(tool.id)) {
            matchedIdentifiers.add(tool.id);
            return true;
        }
        if (tool.toolReferenceName && identifiers.has(tool.toolReferenceName)) {
            matchedIdentifiers.add(tool.toolReferenceName);
            return true;
        }
        return false;
    };
    // Helper to check if a toolset matches any identifier (by id or referenceName)
    const toolSetMatches = (toolSet, identifiers) => {
        if (identifiers.has(toolSet.id)) {
            matchedIdentifiers.add(toolSet.id);
            return true;
        }
        if (identifiers.has(toolSet.referenceName)) {
            matchedIdentifiers.add(toolSet.referenceName);
            return true;
        }
        return false;
    };
    // Track which tools are explicitly referenced in toolsInclude
    const explicitlyIncludedTools = new Set();
    // Step 1: Build initial set based on toolsInclude
    if (toolsInclude) {
        const includeSet = new Set(toolsInclude);
        // First, process toolsets - if a toolset matches, enable all its tools
        for (const toolSet of allToolSets) {
            if (toolSetMatches(toolSet, includeSet)) {
                for (const tool of toolSet.getTools()) {
                    enablementMap.set(tool, true);
                }
            }
        }
        // Then process individual tools
        for (const tool of allTools) {
            if (toolMatches(tool, includeSet)) {
                enablementMap.set(tool, true);
                explicitlyIncludedTools.add(tool);
            }
            else if (!enablementMap.has(tool)) {
                enablementMap.set(tool, false);
            }
        }
        // Also process tools from toolsets that may not be in allTools
        for (const toolSet of allToolSets) {
            for (const tool of toolSet.getTools()) {
                if (toolMatches(tool, includeSet)) {
                    enablementMap.set(tool, true);
                    explicitlyIncludedTools.add(tool);
                }
                else if (!enablementMap.has(tool)) {
                    enablementMap.set(tool, false);
                }
            }
        }
    }
    else {
        // No toolsInclude specified - start with all tools enabled
        for (const tool of allTools) {
            enablementMap.set(tool, true);
        }
        for (const toolSet of allToolSets) {
            for (const tool of toolSet.getTools()) {
                enablementMap.set(tool, true);
            }
        }
    }
    // Step 2: Remove tools matching toolsExclude
    if (toolsExclude) {
        const excludeSet = new Set(toolsExclude);
        // First, process toolsets - if a toolset matches, disable all its tools
        // (unless explicitly included as individual tools)
        for (const toolSet of allToolSets) {
            if (toolSetMatches(toolSet, excludeSet)) {
                for (const tool of toolSet.getTools()) {
                    // Explicit tool reference overrides toolset exclusion
                    if (!explicitlyIncludedTools.has(tool)) {
                        enablementMap.set(tool, false);
                    }
                }
            }
        }
        // Then process individual tools - explicit exclusion always wins
        for (const tool of allTools) {
            if (toolMatches(tool, excludeSet)) {
                enablementMap.set(tool, false);
            }
        }
        for (const toolSet of allToolSets) {
            for (const tool of toolSet.getTools()) {
                if (toolMatches(tool, excludeSet)) {
                    enablementMap.set(tool, false);
                }
            }
        }
    }
    // Collect unknown identifiers
    const allIdentifiers = new Set([...(toolsInclude ?? []), ...(toolsExclude ?? [])]);
    const unknownIdentifiers = [];
    for (const identifier of allIdentifiers) {
        if (!matchedIdentifiers.has(identifier)) {
            unknownIdentifiers.push(identifier);
        }
    }
    // Validate at least one tool is enabled
    const enabledToolCount = Array.from(enablementMap.entries()).filter(([item, enabled]) => enabled && !isToolSet(item)).length;
    if (enabledToolCount === 0) {
        throw new Error('Tool filtering resulted in zero enabled tools. At least one tool must be enabled.');
    }
    // Calculate toolset enablement based on whether all member tools are enabled
    for (const toolSet of allToolSets) {
        const toolSetTools = Array.from(toolSet.getTools());
        const allToolsEnabled = toolSetTools.length > 0 && toolSetTools.every(t => enablementMap.get(t) === true);
        enablementMap.set(toolSet, allToolsEnabled);
    }
    return { enablementMap, unknownIdentifiers };
}
/**
 * Returns whether we can continue clearing/switching chat sessions, false to cancel.
 */
export async function handleCurrentEditingSession(model, phrase, dialogService) {
    return showClearEditingSessionConfirmation(model, dialogService, { messageOverride: phrase });
}
/**
 * Returns whether we can switch the agent, based on whether the user had to agree to clear the session, false to cancel.
 */
export async function handleModeSwitch(accessor, fromMode, toMode, requestCount, model) {
    if (!model?.editingSession || fromMode === toMode) {
        return { needToClearSession: false };
    }
    const dialogService = accessor.get(IDialogService);
    const needToClearEdits = (fromMode === ChatModeKind.Edit || toMode === ChatModeKind.Edit) && requestCount > 0;
    if (needToClearEdits) {
        // Switching into or out of edit mode, ask to discard the session
        const phrase = localize('switchMode.confirmPhrase', "Switching agents will end your current edit session.");
        const currentEdits = model.editingSession.entries.get();
        const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === 0 /* ModifiedFileEntryState.Modified */);
        if (undecidedEdits.length > 0) {
            if (!await handleCurrentEditingSession(model, phrase, dialogService)) {
                return false;
            }
            return { needToClearSession: true };
        }
        else {
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
/**
 * Clears the current chat session and starts a new one, preserving
 * the session type (e.g. Claude, Cloud, Background) for non-local sessions
 * in the sidebar.
 */
export async function clearChatSessionPreservingType(widget, viewsService, sessionType) {
    const currentResource = widget.viewModel?.model.sessionResource;
    const newSessionType = sessionType ?? (currentResource ? getChatSessionType(currentResource) : localChatSessionType);
    if (isIChatViewViewContext(widget.viewContext) && newSessionType !== localChatSessionType) {
        // For the sidebar, we need to explicitly load a session with the same type
        const newResource = URI.from({ scheme: newSessionType, path: `/untitled-${generateUuid()}` });
        const view = await viewsService.openView(ChatViewId);
        await view.loadSession(newResource);
    }
    else {
        // For the editor, widget.clear() already preserves the session type via clearChatEditor
        await widget.clear();
    }
}
// --- Chat Submenus in various Components
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    submenu: MenuId.ChatTextEditorMenu,
    group: '1_chat',
    order: 5,
    title: localize('generateCode', "Generate Code"),
    when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate())
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
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ChatViewId), ChatContextKeys.panelLocation.isEqualTo(2 /* ViewContainerLocation.AuxiliaryBar */)),
                order: 0,
                group: '5_configure'
            },
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const currentValue = configurationService.getValue('workbench.secondarySideBar.defaultVisibility');
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
    async run(accessor, scope) {
        const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
        const toolsService = accessor.get(ILanguageModelToolsService);
        confirmationService.manageConfirmationPreferences([...toolsService.getAllToolsIncludingDisabled()], scope ? { defaultScope: scope } : undefined);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQTBCLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0ksT0FBTyxF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