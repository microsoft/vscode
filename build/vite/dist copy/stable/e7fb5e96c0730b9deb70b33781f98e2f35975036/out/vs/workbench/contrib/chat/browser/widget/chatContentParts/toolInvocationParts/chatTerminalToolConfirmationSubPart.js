/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { append, h } from '../../../../../../../base/browser/dom.js';
import { Separator } from '../../../../../../../base/common/actions.js';
import { asArray } from '../../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ErrorNoTelemetry } from '../../../../../../../base/common/errors.js';
import { createCommandUri, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import Severity from '../../../../../../../base/common/severity.js';
import { isObject } from '../../../../../../../base/common/types.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../../actions/chatToolActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatCustomConfirmationWidget } from '../chatConfirmationWidget.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { CodeBlockPart } from '../codeBlockPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
export var TerminalToolConfirmationStorageKeys;
(function (TerminalToolConfirmationStorageKeys) {
    TerminalToolConfirmationStorageKeys["TerminalAutoApproveWarningAccepted"] = "chat.tools.terminal.autoApprove.warningAccepted";
})(TerminalToolConfirmationStorageKeys || (TerminalToolConfirmationStorageKeys = {}));
let ChatTerminalToolConfirmationSubPart = class ChatTerminalToolConfirmationSubPart extends BaseChatToolInvocationSubPart {
    constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, dialogService, keybindingService, languageService, configurationService, contextKeyService, chatWidgetService, preferencesService, storageService, terminalChatService, hoverService) {
        super(toolInvocation);
        this.context = context;
        this.renderer = renderer;
        this.editorPool = editorPool;
        this.currentWidthDelegate = currentWidthDelegate;
        this.codeBlockStartIndex = codeBlockStartIndex;
        this.instantiationService = instantiationService;
        this.dialogService = dialogService;
        this.keybindingService = keybindingService;
        this.languageService = languageService;
        this.configurationService = configurationService;
        this.contextKeyService = contextKeyService;
        this.chatWidgetService = chatWidgetService;
        this.preferencesService = preferencesService;
        this.storageService = storageService;
        this.terminalChatService = terminalChatService;
        this.codeblocks = [];
        const state = toolInvocation.state.get();
        if (state.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */ || !state.confirmationMessages?.title) {
            throw new Error('Confirmation messages are missing');
        }
        terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
        const { title, message, disclaimer, terminalCustomActions } = state.confirmationMessages;
        // Use pre-computed confirmation data from runInTerminalTool (cd prefix extraction happens there for localization)
        // Use presentationOverrides for display if available (e.g., extracted Python code)
        const initialContent = terminalData.presentationOverrides?.commandLine ?? terminalData.confirmation?.commandLine ?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
        const cdPrefix = terminalData.confirmation?.cdPrefix ?? '';
        // When presentationOverrides is set, the editor should be read-only since the displayed content
        // differs from the actual command (e.g., extracted Python code vs full python -c command)
        const isReadOnly = !!terminalData.presentationOverrides;
        const autoApproveEnabled = this.configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalContribSettingId.EnableAutoApprove */) === true;
        const autoApproveWarningAccepted = this.storageService.getBoolean("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, -1 /* StorageScope.APPLICATION */, false);
        let moreActions = undefined;
        if (autoApproveEnabled) {
            moreActions = [];
            if (!autoApproveWarningAccepted) {
                moreActions.push({
                    label: localize('autoApprove.enable', 'Enable Auto Approve...'),
                    data: {
                        type: 'enable'
                    }
                });
                moreActions.push(new Separator());
                if (terminalCustomActions) {
                    for (const action of terminalCustomActions) {
                        if (!(action instanceof Separator)) {
                            action.disabled = true;
                        }
                    }
                }
            }
            if (terminalCustomActions) {
                moreActions.push(...terminalCustomActions);
            }
            if (moreActions.length === 0) {
                moreActions = undefined;
            }
        }
        const codeBlockRenderOptions = {
            hideToolbar: true,
            reserveWidth: 19,
            verticalPadding: 5,
            editorOptions: {
                wordWrap: 'on',
                readOnly: isReadOnly,
                tabFocusMode: true,
                ariaLabel: typeof title === 'string' ? title : title.value
            }
        };
        const languageId = this.languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language ?? 'sh') ?? 'shellscript';
        const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
        const editor = this._register(this.editorPool.get(key));
        editor.object.render({
            codeBlockIndex: this.codeBlockStartIndex,
            element: this.context.element,
            languageId,
            text: initialContent,
            renderOptions: codeBlockRenderOptions,
            chatSessionResource: this.context.element.sessionResource
        }, this.currentWidthDelegate());
        const model = editor.object.editor.getModel();
        this.codeblocks.push({
            codeBlockIndex: this.codeBlockStartIndex,
            codemapperUri: undefined,
            elementId: this.context.element.id,
            focus: () => editor.object.focus(),
            ownerMarkdownPartId: this.codeblocksPartId,
            uri: model.uri,
            chatSessionResource: this.context.element.sessionResource
        });
        this._register(model.onDidChangeContent(() => {
            const currentValue = model.getValue();
            // Only set userEdited if the content actually differs from the initial value
            // Prepend cd prefix back if it was extracted for display
            if (currentValue !== initialContent) {
                terminalData.commandLine.userEdited = cdPrefix + currentValue;
            }
            else {
                terminalData.commandLine.userEdited = undefined;
            }
        }));
        const elements = h('.chat-confirmation-message-terminal', [
            h('.chat-confirmation-message-terminal-editor@editor'),
            h('.chat-confirmation-message-terminal-disclaimer@disclaimer'),
        ]);
        append(elements.editor, editor.object.element);
        this._register(hoverService.setupDelayedHover(elements.editor, {
            content: message || '',
            style: 1 /* HoverStyle.Pointer */,
            position: { hoverPosition: 0 /* HoverPosition.LEFT */ },
        }));
        const confirmWidget = this._register(this.instantiationService.createInstance((ChatCustomConfirmationWidget), this.context, {
            title,
            icon: Codicon.terminal,
            message: elements.root,
            buttons: this._createButtons(moreActions)
        }));
        if (terminalData.requestUnsandboxedExecution) {
            const reasonText = (terminalData.requestUnsandboxedExecutionReason && terminalData.requestUnsandboxedExecutionReason.trim())
                || localize('chat.terminal.unsandboxedExecution.defaultReason', "The model did not provide a reason for requesting unsandboxed execution.");
            const unsandboxedReasonMarkdown = new MarkdownString(undefined, { supportThemeIcons: true });
            unsandboxedReasonMarkdown.appendMarkdown(`$(${Codicon.info.id}) `);
            unsandboxedReasonMarkdown.appendText(reasonText);
            this._appendMarkdownPart(elements.disclaimer, unsandboxedReasonMarkdown, codeBlockRenderOptions);
        }
        if (disclaimer) {
            this._appendMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
        }
        const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
        hasToolConfirmationKey.set(true);
        this._register(toDisposable(() => hasToolConfirmationKey.reset()));
        this._register(confirmWidget.onDidClick(async (button) => {
            let doComplete = true;
            const data = button.data;
            let toolConfirmKind = 0 /* ToolConfirmKind.Denied */;
            if (typeof data === 'boolean') {
                if (data) {
                    toolConfirmKind = 4 /* ToolConfirmKind.UserAction */;
                    // Clear out any auto approve info since this was an explicit user action. This
                    // can happen when the auto approve feature is off.
                    if (terminalData.autoApproveInfo) {
                        terminalData.autoApproveInfo = undefined;
                    }
                }
            }
            else if (typeof data !== 'boolean') {
                switch (data.type) {
                    case 'enable': {
                        const optedIn = await this._showAutoApproveWarning();
                        if (optedIn) {
                            this.storageService.store("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                            // If this command would have been auto-approved, approve immediately
                            if (terminalData.autoApproveInfo) {
                                toolConfirmKind = 4 /* ToolConfirmKind.UserAction */;
                            }
                            // If this would not have been auto approved, enable the options and
                            // do not complete
                            else if (terminalCustomActions) {
                                for (const action of terminalCustomActions) {
                                    if (!(action instanceof Separator)) {
                                        action.disabled = false;
                                    }
                                }
                                confirmWidget.updateButtons(this._createButtons(terminalCustomActions));
                                doComplete = false;
                            }
                        }
                        else {
                            doComplete = false;
                        }
                        break;
                    }
                    case 'skip': {
                        toolConfirmKind = 5 /* ToolConfirmKind.Skipped */;
                        break;
                    }
                    case 'newRule': {
                        const newRules = asArray(data.rule);
                        // Group rules by scope
                        const sessionRules = newRules.filter(r => r.scope === 'session');
                        const workspaceRules = newRules.filter(r => r.scope === 'workspace');
                        const userRules = newRules.filter(r => r.scope === 'user');
                        // Handle session-scoped rules (temporary, in-memory only)
                        const chatSessionResource = this.context.element.sessionResource;
                        for (const rule of sessionRules) {
                            this.terminalChatService.addSessionAutoApproveRule(chatSessionResource, rule.key, rule.value);
                        }
                        // Handle workspace-scoped rules
                        if (workspaceRules.length > 0) {
                            const inspect = this.configurationService.inspect("chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */);
                            const oldValue = inspect.workspaceValue ?? {};
                            if (isObject(oldValue)) {
                                const newValue = { ...oldValue };
                                for (const rule of workspaceRules) {
                                    newValue[rule.key] = rule.value;
                                }
                                await this.configurationService.updateValue("chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */, newValue, 5 /* ConfigurationTarget.WORKSPACE */);
                            }
                            else {
                                this.preferencesService.openSettings({
                                    jsonEditor: true,
                                    target: 5 /* ConfigurationTarget.WORKSPACE */,
                                    revealSetting: { key: "chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */ },
                                });
                                throw new ErrorNoTelemetry(`Cannot add new rule, existing workspace setting is unexpected format`);
                            }
                        }
                        // Handle user-scoped rules
                        if (userRules.length > 0) {
                            const inspect = this.configurationService.inspect("chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */);
                            const oldValue = inspect.userValue ?? {};
                            if (isObject(oldValue)) {
                                const newValue = { ...oldValue };
                                for (const rule of userRules) {
                                    newValue[rule.key] = rule.value;
                                }
                                await this.configurationService.updateValue("chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */, newValue, 2 /* ConfigurationTarget.USER */);
                            }
                            else {
                                this.preferencesService.openSettings({
                                    jsonEditor: true,
                                    target: 2 /* ConfigurationTarget.USER */,
                                    revealSetting: { key: "chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */ },
                                });
                                throw new ErrorNoTelemetry(`Cannot add new rule, existing setting is unexpected format`);
                            }
                        }
                        function formatRuleLinks(rules, scope) {
                            return rules.map(e => {
                                if (scope === 'session') {
                                    return `\`${e.key}\``;
                                }
                                const target = scope === 'workspace' ? 5 /* ConfigurationTarget.WORKSPACE */ : 2 /* ConfigurationTarget.USER */;
                                const settingsUri = createCommandUri("workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalContribCommandId.OpenTerminalSettingsLink */, target);
                                return `[\`${e.key}\`](${settingsUri.toString()} "${localize('ruleTooltip', 'View rule in settings')}")`;
                            }).join(', ');
                        }
                        const mdTrustSettings = {
                            isTrusted: {
                                enabledCommands: ["workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalContribCommandId.OpenTerminalSettingsLink */]
                            }
                        };
                        const parts = [];
                        if (sessionRules.length > 0) {
                            parts.push(sessionRules.length === 1
                                ? localize('newRule.session', 'Session auto approve rule {0} added', formatRuleLinks(sessionRules, 'session'))
                                : localize('newRule.session.plural', 'Session auto approve rules {0} added', formatRuleLinks(sessionRules, 'session')));
                        }
                        if (workspaceRules.length > 0) {
                            parts.push(workspaceRules.length === 1
                                ? localize('newRule.workspace', 'Workspace auto approve rule {0} added', formatRuleLinks(workspaceRules, 'workspace'))
                                : localize('newRule.workspace.plural', 'Workspace auto approve rules {0} added', formatRuleLinks(workspaceRules, 'workspace')));
                        }
                        if (userRules.length > 0) {
                            parts.push(userRules.length === 1
                                ? localize('newRule.user', 'User auto approve rule {0} added', formatRuleLinks(userRules, 'user'))
                                : localize('newRule.user.plural', 'User auto approve rules {0} added', formatRuleLinks(userRules, 'user')));
                        }
                        if (parts.length > 0) {
                            terminalData.autoApproveInfo = new MarkdownString(parts.join(', '), mdTrustSettings);
                        }
                        toolConfirmKind = 4 /* ToolConfirmKind.UserAction */;
                        break;
                    }
                    case 'configure': {
                        this.preferencesService.openSettings({
                            target: 2 /* ConfigurationTarget.USER */,
                            query: `@id:${"chat.tools.terminal.autoApprove" /* TerminalContribSettingId.AutoApprove */}`,
                        });
                        doComplete = false;
                        break;
                    }
                    case 'sessionApproval': {
                        const sessionResource = this.context.element.sessionResource;
                        this.terminalChatService.setChatSessionAutoApproval(sessionResource, true);
                        const disableUri = createCommandUri("workbench.action.terminal.chat.disableSessionAutoApproval" /* TerminalContribCommandId.DisableSessionAutoApproval */, sessionResource);
                        const mdTrustSettings = {
                            isTrusted: {
                                enabledCommands: ["workbench.action.terminal.chat.disableSessionAutoApproval" /* TerminalContribCommandId.DisableSessionAutoApproval */]
                            }
                        };
                        terminalData.autoApproveInfo = new MarkdownString(`${localize('sessionApproval', 'All commands will be auto approved for this session')} ([${localize('sessionApproval.disable', 'Disable')}](${disableUri.toString()}))`, mdTrustSettings);
                        toolConfirmKind = 4 /* ToolConfirmKind.UserAction */;
                        break;
                    }
                }
            }
            if (doComplete) {
                IChatToolInvocation.confirmWith(toolInvocation, { type: toolConfirmKind });
                this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
            }
        }));
        this.domNode = confirmWidget.domNode;
    }
    _createButtons(moreActions) {
        const getLabelAndTooltip = (label, actionId, tooltipDetail = label) => {
            const tooltip = this.keybindingService.appendKeybinding(tooltipDetail, actionId);
            return { label, tooltip };
        };
        return [
            {
                ...getLabelAndTooltip(localize('tool.allow', "Allow"), AcceptToolConfirmationActionId),
                data: true,
                moreActions,
            },
            {
                ...getLabelAndTooltip(localize('tool.skip', "Skip"), SkipToolConfirmationActionId, localize('skip.detail', 'Proceed without executing this command')),
                data: { type: 'skip' },
                isSecondary: true,
            },
        ];
    }
    async _showAutoApproveWarning() {
        const promptResult = await this.dialogService.prompt({
            type: Severity.Info,
            message: localize('autoApprove.title', 'Enable terminal auto approve?'),
            buttons: [{
                    label: localize('autoApprove.button.enable', 'Enable'),
                    run: () => true
                }],
            cancelButton: true,
            custom: {
                icon: Codicon.shield,
                markdownDetails: [{
                        markdown: new MarkdownString(localize('autoApprove.markdown', 'This will enable a configurable subset of commands to run in the terminal autonomously. It provides *best effort protections* and assumes the agent is not acting maliciously.')),
                    }, {
                        markdown: new MarkdownString(`[${localize('autoApprove.markdown2', 'Learn more about the potential risks and how to avoid them.')}](https://code.visualstudio.com/docs/copilot/security#_security-considerations)`)
                    }],
            }
        });
        return promptResult.result === true;
    }
    _appendMarkdownPart(container, message, codeBlockRenderOptions) {
        const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, {
            kind: 'markdownContent',
            content: typeof message === 'string' ? new MarkdownString().appendMarkdown(message) : message
        }, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, undefined, this.currentWidthDelegate(), { codeBlockRenderOptions }));
        append(container, part.domNode);
    }
};
ChatTerminalToolConfirmationSubPart = __decorate([
    __param(7, IInstantiationService),
    __param(8, IDialogService),
    __param(9, IKeybindingService),
    __param(10, ILanguageService),
    __param(11, IConfigurationService),
    __param(12, IContextKeyService),
    __param(13, IChatWidgetService),
    __param(14, IPreferencesService),
    __param(15, IStorageService),
    __param(16, ITerminalChatService),
    __param(17, IHoverService)
], ChatTerminalToolConfirmationSubPart);
export { ChatTerminalToolConfirmationSubPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDekgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sUUFBUSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUs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