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
var BuiltinDynamicCompletions_1, ToolCompletions_1;
import { coalesce } from '../../../../../../../base/common/arrays.js';
import { decodeBase64 } from '../../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { StopWatch } from '../../../../../../../base/common/stopwatch.js';
import { isPatternInWord } from '../../../../../../../base/common/filters.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { assertType } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { getCodeEditor, isCodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { SymbolKinds } from '../../../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { IOutlineModelService } from '../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { localize } from '../../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { FileKind, IFileService } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { Extensions as WorkbenchExtensions } from '../../../../../../common/contributions.js';
import { isDiffEditorInput } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../../../../services/history/common/history.js';
import { ISearchService } from '../../../../../../services/search/common/search.js';
import { McpPromptArgumentPick } from '../../../../../mcp/browser/mcpPromptArgumentPick.js';
import { IMcpService, McpResourceURI } from '../../../../../mcp/common/mcpTypes.js';
import { searchFilesAndFolders } from '../../../../../search/browser/searchChatContext.js';
import { IChatAgentNameService, IChatAgentService, getFullyQualifiedId } from '../../../../common/participants/chatAgents.js';
import { getAttachableImageExtension } from '../../../../common/model/chatModel.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from '../../../../common/requestParser/chatParserTypes.js';
import { IChatSlashCommandService } from '../../../../common/participants/chatSlashCommands.js';
import { ChatAgentLocation, ChatModeKind, isSupportedChatFileScheme } from '../../../../common/constants.js';
import { isToolSet } from '../../../../common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { ChatSubmitAction } from '../../../actions/chatExecuteActions.js';
import { IChatWidgetService } from '../../../chat.js';
import { resizeImage } from '../../../chatImageUtils.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { IChatService } from '../../../../common/chatService/chatService.js';
import { IChatDebugService } from '../../../../common/chatDebugService.js';
import { createDebugEventsAttachment } from '../../../chatDebug/chatDebugAttachment.js';
import { getPromptFileType } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { computeCompletionRanges, escapeForCharClass, isEmptyUpToCompletionWord } from './chatInputCompletionUtils.js';
import { getAgentSessionProviderIcon, AgentSessionProviders } from '../../../agentSessions/agentSessions.js';
/**
 * Regex matching a slash command word (e.g. `/foo`). Uses `\p{L}` for Unicode
 * letter matching, consistent with `isValidSlashCommandName`.
 */
const SlashCommandWord = /\/[\p{L}0-9_.:-]*/gu;
/**
 * Regex matching an agent-or-slash command word (e.g. `@agent` or `/cmd`).
 */
const AgentOrSlashCommandWord = /(@|\/)[\p{L}0-9_.:-]*/gu;
let SlashCommandCompletions = class SlashCommandCompletions extends Disposable {
    constructor(languageFeaturesService, chatWidgetService, chatSlashCommandService, promptsService, chatService, chatSessionsService, mcpService) {
        super();
        this.languageFeaturesService = languageFeaturesService;
        this.chatWidgetService = chatWidgetService;
        this.chatSlashCommandService = chatSlashCommandService;
        this.promptsService = promptsService;
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'globalSlashCommands',
            triggerCharacters: [chatSubcommandLeader],
            provideCompletionItems: async (model, position, _context, _token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return null;
                }
                let customAgentTarget = undefined;
                if (widget.lockedAgentId) {
                    const sessionResource = widget.viewModel.model.sessionResource;
                    customAgentTarget = (sessionResource ? chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource)) : undefined) ?? Target.Undefined;
                }
                const range = computeCompletionRanges(model, position, SlashCommandWord);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const parsedRequest = widget.parsedInput.parts;
                const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
                if (usedAgent) {
                    // No (classic) global slash commands when an agent is used
                    return;
                }
                const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
                if (!slashCommands) {
                    return null;
                }
                return {
                    suggestions: slashCommands
                        .filter(c => {
                        // silent commands are client-side only... so they're not "attaching anything"
                        // so this check can be scoped to when the command _does_ attach something before
                        // checking if the widget supports attachments at all
                        if (!c.silent && !widget.attachmentCapabilities.supportsPromptAttachments) {
                            return false;
                        }
                        if (c.when && !widget.scopedContextKeyService.contextMatchesRules(c.when)) {
                            return false;
                        }
                        if (!widget.lockedAgentId) {
                            return true;
                        }
                        if (c.modes && c.modes.length && !c.modes.includes(ChatModeKind.Agent)) {
                            return false;
                        }
                        if (c.targets && customAgentTarget && !c.targets.includes(customAgentTarget)) {
                            return false;
                        }
                        return true;
                    })
                        .map((c, i) => {
                        const withSlash = `/${c.command}`;
                        return {
                            label: { label: withSlash, description: c.detail },
                            insertText: c.executeImmediately ? '' : `${withSlash} `,
                            documentation: c.detail,
                            range,
                            sortText: c.sortText ?? 'a'.repeat(i + 1),
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway,
                            command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
                        };
                    })
                };
            }
        }));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'globalSlashCommandsAt',
            triggerCharacters: [chatAgentLeader],
            provideCompletionItems: async (model, position, _context, _token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return null;
                }
                const range = computeCompletionRanges(model, position, /@\w*/g);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
                if (!slashCommands) {
                    return null;
                }
                if (widget.lockedAgentId) {
                    return null;
                }
                return {
                    suggestions: slashCommands
                        .filter(c => !c.when || widget.scopedContextKeyService.contextMatchesRules(c.when))
                        .map((c, i) => {
                        const withSlash = `${chatSubcommandLeader}${c.command}`;
                        return {
                            label: { label: withSlash, description: c.detail },
                            insertText: c.executeImmediately ? '' : `${withSlash} `,
                            documentation: c.detail,
                            range,
                            filterText: `${chatAgentLeader}${c.command}`,
                            sortText: c.sortText ?? 'z'.repeat(i + 1),
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway,
                            command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
                        };
                    })
                };
            }
        }));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'promptSlashCommands',
            triggerCharacters: [chatSubcommandLeader],
            provideCompletionItems: async (model, position, _context, token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return null;
                }
                const range = computeCompletionRanges(model, position, SlashCommandWord);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const parsedRequest = widget.parsedInput.parts;
                const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
                if (usedAgent) {
                    // No (classic) global slash commands when an agent is used
                    return;
                }
                const promptCommands = await this.promptsService.getPromptSlashCommands(token);
                if (promptCommands.length === 0) {
                    return null;
                }
                if (widget.lockedAgentId && !widget.attachmentCapabilities.supportsPromptAttachments) {
                    return null;
                }
                // Filter out commands that are not user-invocable (hidden from / menu)
                const userInvocableCommands = promptCommands
                    .filter(c => {
                    if (widget.lockedAgentId) {
                        // Exclude extension-provided prompt files for locked agents.
                        if (c.extension) {
                            return false;
                        }
                        // Exclude hooks as those don't work in locked agent scenarios.
                        try {
                            const promptType = getPromptFileType(c.uri);
                            if (promptType && promptType === PromptsType.hook) {
                                return false;
                            }
                        }
                        catch {
                        }
                    }
                    return true;
                })
                    .filter(c => c.userInvocable)
                    .filter(c => !c.when || widget.scopedContextKeyService.contextMatchesRules(c.when));
                if (userInvocableCommands.length === 0) {
                    return null;
                }
                return {
                    suggestions: userInvocableCommands.map((c, i) => {
                        const label = `/${c.name}`;
                        const description = c.description;
                        return {
                            label: { label, description },
                            insertText: `${label} `,
                            documentation: c.description,
                            range,
                            sortText: 'a'.repeat(i + 1),
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway,
                        };
                    })
                };
            }
        }));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'mcpPromptSlashCommands',
            triggerCharacters: [chatSubcommandLeader],
            provideCompletionItems: async (model, position, _context, _token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return null;
                }
                // regex is the opposite of `mcpPromptReplaceSpecialChars` found in `mcpTypes.ts`
                const range = computeCompletionRanges(model, position, /\/[\p{L}0-9_.-]*/gu);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                if (widget.lockedAgentId) {
                    return null;
                }
                return {
                    suggestions: mcpService.servers.get().flatMap(server => server.prompts.get().map((prompt) => {
                        const label = `/mcp.${prompt.id}`;
                        return {
                            label: { label, description: prompt.description },
                            command: {
                                id: StartParameterizedPromptAction.ID,
                                title: prompt.name,
                                arguments: [model, server, prompt, `${label} `],
                            },
                            insertText: `${label} `,
                            range,
                            kind: 18 /* CompletionItemKind.Text */,
                        };
                    }))
                };
            }
        }));
    }
};
SlashCommandCompletions = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IChatWidgetService),
    __param(2, IChatSlashCommandService),
    __param(3, IPromptsService),
    __param(4, IChatService),
    __param(5, IChatSessionsService),
    __param(6, IMcpService)
], SlashCommandCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, 4 /* LifecyclePhase.Eventually */);
let AgentCompletions = class AgentCompletions extends Disposable {
    constructor(languageFeaturesService, chatWidgetService, chatAgentService, chatAgentNameService, chatSessionsService) {
        super();
        this.languageFeaturesService = languageFeaturesService;
        this.chatWidgetService = chatWidgetService;
        this.chatAgentService = chatAgentService;
        this.chatAgentNameService = chatAgentNameService;
        this.chatSessionsService = chatSessionsService;
        const subCommandProvider = {
            _debugDisplayName: 'chatAgentSubcommand',
            triggerCharacters: [chatSubcommandLeader],
            provideCompletionItems: async (model, position, _context, token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return;
                }
                const range = computeCompletionRanges(model, position, SlashCommandWord);
                if (!range) {
                    return;
                }
                const usedAgent = this.getCurrentAgentForWidget(widget);
                if (!usedAgent || usedAgent.command) {
                    // Only one allowed
                    return;
                }
                return {
                    suggestions: usedAgent.agent.slashCommands.map((c, i) => {
                        const withSlash = `/${c.name}`;
                        return {
                            label: withSlash,
                            insertText: `${withSlash} `,
                            documentation: c.description,
                            range,
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway
                        };
                    })
                };
            }
        };
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, subCommandProvider));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'chatAgentAndSubcommand',
            triggerCharacters: [chatAgentLeader],
            provideCompletionItems: async (model, position, _context, token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                const viewModel = widget?.viewModel;
                if (!widget || !viewModel) {
                    return;
                }
                if (widget.lockedAgentId) {
                    return null;
                }
                const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const agents = this.chatAgentService.getAgents()
                    .filter(a => a.locations.includes(widget.location));
                // Filter out chatSessions contributions for slash command completions
                const chatSessionContributions = this.chatSessionsService.getAllChatSessionContributions();
                const chatSessionAgentIds = new Set(chatSessionContributions.map(contribution => contribution.type));
                const agentsForSlashCommands = agents.filter(a => !chatSessionAgentIds.has(a.id));
                // When the input is only `/`, items are sorted by sortText.
                // When typing, filterText is used to score and sort.
                // The same list is refiltered/ranked while typing.
                const getFilterText = (agent, command) => {
                    // This is hacking the filter algorithm to make @terminal /explain match worse than @workspace /explain by making its match index later in the string.
                    // When I type `/exp`, the workspace one should be sorted over the terminal one.
                    const dummyPrefix = agent.id === 'github.copilot.terminalPanel' ? `0000` : ``;
                    return `${chatAgentLeader}${dummyPrefix}${agent.name}.${command}`;
                };
                const justAgents = agents
                    .filter(a => !a.isDefault)
                    .filter(a => !chatSessionAgentIds.has(a.id))
                    .map(agent => {
                    const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
                    const detail = agent.description;
                    return {
                        label: isDupe ?
                            { label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } :
                            agentLabel,
                        documentation: detail,
                        filterText: `${chatAgentLeader}${agent.name}`,
                        insertText: `${agentLabel} `,
                        range,
                        kind: 18 /* CompletionItemKind.Text */,
                        sortText: `${chatAgentLeader}${agent.name}`,
                        command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] },
                    };
                });
                return {
                    suggestions: justAgents.concat(coalesce(agentsForSlashCommands.flatMap(agent => agent.slashCommands.map((c, i) => {
                        if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
                            return;
                        }
                        const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
                        const label = `${agentLabel} ${chatSubcommandLeader}${c.name}`;
                        const item = {
                            label: isDupe ?
                                { label, description: c.description, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined } :
                                label,
                            documentation: c.description,
                            filterText: getFilterText(agent, c.name),
                            commitCharacters: [' '],
                            insertText: label + ' ',
                            range,
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway
                            sortText: `x${chatAgentLeader}${agent.name}${c.name}`,
                            command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] },
                        };
                        if (agent.isDefault) {
                            // default agent isn't mentioned nor inserted
                            const label = `${chatSubcommandLeader}${c.name}`;
                            item.label = label;
                            item.insertText = `${label} `;
                            item.documentation = c.description;
                        }
                        return item;
                    }))))
                };
            }
        }));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'chatAgentAndSubcommand',
            triggerCharacters: [chatSubcommandLeader],
            provideCompletionItems: async (model, position, _context, token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                const viewModel = widget?.viewModel;
                if (!widget || !viewModel) {
                    return;
                }
                if (widget.lockedAgentId) {
                    return null;
                }
                const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
                if (!range) {
                    return null;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const agents = this.chatAgentService.getAgents()
                    .filter(a => a.locations.includes(widget.location) && a.modes.includes(widget.input.currentModeKind))
                    // Filter out chatSessions contributions for slash command completions
                    .filter(a => !this.chatSessionsService.getChatSessionContribution(a.id));
                return {
                    suggestions: coalesce(agents.flatMap(agent => agent.slashCommands.map((c, i) => {
                        if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
                            return;
                        }
                        const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
                        const withSlash = `${chatSubcommandLeader}${c.name}`;
                        const extraSortText = agent.id === 'github.copilot.terminalPanel' ? `z` : ``;
                        const sortText = `${chatSubcommandLeader}${extraSortText}${agent.name}${c.name}`;
                        const item = {
                            label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined },
                            commitCharacters: [' '],
                            insertText: `${agentLabel} ${withSlash} `,
                            documentation: `(${agentLabel}) ${c.description ?? ''}`,
                            range,
                            kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway
                            sortText,
                            command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] },
                        };
                        if (agent.isDefault) {
                            // default agent isn't mentioned nor inserted
                            const label = `${chatSubcommandLeader}${c.name}`;
                            item.label = label;
                            item.insertText = `${label} `;
                            item.documentation = c.description;
                        }
                        return item;
                    })))
                };
            }
        }));
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'installChatExtensions',
            triggerCharacters: [chatAgentLeader],
            provideCompletionItems: async (model, position, _context, token) => {
                if (!model.getLineContent(1).startsWith(chatAgentLeader)) {
                    return;
                }
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (widget?.location !== ChatAgentLocation.Chat || widget.input.currentModeKind !== ChatModeKind.Ask) {
                    return;
                }
                if (widget.lockedAgentId) {
                    return null;
                }
                const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
                if (!range) {
                    return;
                }
                if (!isEmptyUpToCompletionWord(model, range)) {
                    // No text allowed before the completion
                    return;
                }
                const label = localize('installLabel', "Install Chat Extensions...");
                const item = {
                    label,
                    insertText: '',
                    range,
                    kind: 18 /* CompletionItemKind.Text */, // The icons are disabled here anyway
                    command: { id: 'workbench.extensions.search', title: '', arguments: ['@tag:chat-participant'] },
                    filterText: chatAgentLeader + label,
                    sortText: 'zzz'
                };
                return {
                    suggestions: [item]
                };
            }
        }));
    }
    getCurrentAgentForWidget(widget) {
        if (widget.lockedAgentId) {
            const usedAgent = this.chatAgentService.getAgent(widget.lockedAgentId);
            return usedAgent && { agent: usedAgent };
        }
        const parsedRequest = widget.parsedInput.parts;
        const usedAgentIdx = parsedRequest.findIndex((p) => p instanceof ChatRequestAgentPart);
        if (usedAgentIdx < 0) {
            return;
        }
        const usedAgent = parsedRequest[usedAgentIdx];
        const usedOtherCommand = parsedRequest.find(p => p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashPromptPart);
        if (usedOtherCommand) {
            // Only one allowed
            return {
                agent: usedAgent.agent,
                command: usedOtherCommand instanceof ChatRequestAgentSubcommandPart ? usedOtherCommand.command.name : undefined
            };
        }
        for (const partAfterAgent of parsedRequest.slice(usedAgentIdx + 1)) {
            // Could allow text after 'position'
            if (!(partAfterAgent instanceof ChatRequestTextPart) || !partAfterAgent.text.trim().match(/^(\/[\p{L}0-9_.:-]*)?$/u)) {
                // No text allowed between agent and subcommand
                return;
            }
        }
        return { agent: usedAgent.agent };
    }
    getAgentCompletionDetails(agent) {
        const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
        const agentLabel = `${chatAgentLeader}${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
        const isDupe = isAllowed && this.chatAgentService.agentHasDupeName(agent.id);
        return { label: agentLabel, isDupe };
    }
};
AgentCompletions = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IChatWidgetService),
    __param(2, IChatAgentService),
    __param(3, IChatAgentNameService),
    __param(4, IChatSessionsService)
], AgentCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, 4 /* LifecyclePhase.Eventually */);
class AssignSelectedAgentAction extends Action2 {
    static { this.ID = 'workbench.action.chat.assignSelectedAgent'; }
    constructor() {
        super({
            id: AssignSelectedAgentAction.ID,
            title: '' // not displayed
        });
    }
    async run(accessor, ...args) {
        const arg = args[0];
        if (!arg || !arg.widget || !arg.agent) {
            return;
        }
        if (!arg.agent.modes.includes(arg.widget.input.currentModeKind)) {
            arg.widget.input.setChatMode(arg.agent.modes[0]);
        }
        arg.widget.lastSelectedAgent = arg.agent;
    }
}
registerAction2(AssignSelectedAgentAction);
class StartParameterizedPromptAction extends Action2 {
    static { this.ID = 'workbench.action.chat.startParameterizedPrompt'; }
    constructor() {
        super({
            id: StartParameterizedPromptAction.ID,
            title: '' // not displayed
        });
    }
    async run(accessor, model, server, prompt, textToReplace) {
        if (!model || !prompt) {
            return;
        }
        const instantiationService = accessor.get(IInstantiationService);
        const notificationService = accessor.get(INotificationService);
        const widgetService = accessor.get(IChatWidgetService);
        const fileService = accessor.get(IFileService);
        const chatWidget = await widgetService.revealWidget(true);
        if (!chatWidget) {
            return;
        }
        const lastPosition = model.getFullModelRange().collapseToEnd();
        const getPromptIndex = () => model.findMatches(textToReplace, true, false, true, null, false)[0];
        const replaceTextWith = (value) => model.applyEdits([{
                range: getPromptIndex()?.range || lastPosition,
                text: value,
            }]);
        const store = new DisposableStore();
        const cts = store.add(new CancellationTokenSource());
        store.add(chatWidget.input.startGenerating());
        store.add(model.onDidChangeContent(() => {
            if (getPromptIndex()) {
                cts.cancel(); // cancel if the user deletes their prompt
            }
        }));
        model.changeDecorations(accessor => {
            const id = accessor.addDecoration(lastPosition, {
                description: 'mcp-prompt-spinner',
                showIfCollapsed: true,
                after: {
                    content: ' ',
                    inlineClassNameAffectsLetterSpacing: true,
                    inlineClassName: ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, 'spin')) + ' chat-prompt-spinner',
                }
            });
            store.add(toDisposable(() => {
                model.changeDecorations(a => a.removeDecoration(id));
            }));
        });
        const pick = store.add(instantiationService.createInstance(McpPromptArgumentPick, prompt));
        try {
            // start the server if not already running so that it's ready to resolve
            // the prompt instantly when the user finishes picking arguments.
            await server.start();
            const args = await pick.createArgs();
            if (!args) {
                replaceTextWith('');
                return;
            }
            let messages;
            try {
                messages = await prompt.resolve(args, cts.token);
            }
            catch (e) {
                if (!cts.token.isCancellationRequested) {
                    notificationService.error(localize('mcp.prompt.error', "Error resolving prompt: {0}", String(e)));
                }
                replaceTextWith('');
                return;
            }
            const toAttach = [];
            const attachBlob = async (mimeType, contents, uriStr, isText = false) => {
                let validURI;
                if (uriStr) {
                    for (const uri of [URI.parse(uriStr), McpResourceURI.fromServer(server.definition, uriStr)]) {
                        try {
                            validURI ||= await fileService.exists(uri) ? uri : undefined;
                        }
                        catch {
                            // ignored
                        }
                    }
                }
                if (isText) {
                    if (validURI) {
                        toAttach.push({
                            id: generateUuid(),
                            kind: 'file',
                            value: validURI,
                            name: basename(validURI),
                        });
                    }
                    else {
                        toAttach.push({
                            id: generateUuid(),
                            kind: 'generic',
                            value: contents,
                            name: localize('mcp.prompt.resource', 'Prompt Resource'),
                        });
                    }
                }
                else if (mimeType && getAttachableImageExtension(mimeType)) {
                    const resized = await resizeImage(contents)
                        .catch(() => decodeBase64(contents).buffer);
                    chatWidget.attachmentModel.addContext({
                        id: generateUuid(),
                        name: localize('mcp.prompt.image', 'Prompt Image'),
                        fullName: localize('mcp.prompt.image', 'Prompt Image'),
                        value: resized,
                        kind: 'image',
                        references: validURI && [{ reference: validURI, kind: 'reference' }],
                    });
                }
                else if (validURI) {
                    toAttach.push({
                        id: generateUuid(),
                        kind: 'file',
                        value: validURI,
                        name: basename(validURI),
                    });
                }
                else {
                    // not a valid resource/resource URI
                }
            };
            const hasMultipleRoles = messages.some(m => m.role !== messages[0].role);
            let input = '';
            for (const message of messages) {
                switch (message.content.type) {
                    case 'text':
                        if (input) {
                            input += '\n\n';
                        }
                        if (hasMultipleRoles) {
                            input += `--${message.role.toUpperCase()}\n`;
                        }
                        input += message.content.text;
                        break;
                    case 'resource':
                        if ('text' in message.content.resource) {
                            await attachBlob(message.content.resource.mimeType, message.content.resource.text, message.content.resource.uri, true);
                        }
                        else {
                            await attachBlob(message.content.resource.mimeType, message.content.resource.blob, message.content.resource.uri);
                        }
                        break;
                    case 'image':
                    case 'audio':
                        await attachBlob(message.content.mimeType, message.content.data);
                        break;
                }
            }
            if (toAttach.length) {
                chatWidget.attachmentModel.addContext(...toAttach);
            }
            replaceTextWith(input);
        }
        finally {
            store.dispose();
        }
    }
}
registerAction2(StartParameterizedPromptAction);
class ReferenceArgument {
    constructor(widget, variable) {
        this.widget = widget;
        this.variable = variable;
    }
}
let BuiltinDynamicCompletions = class BuiltinDynamicCompletions extends Disposable {
    static { BuiltinDynamicCompletions_1 = this; }
    static { this.addReferenceCommand = '_addReferenceCmd'; }
    static { this.addDebugEventsSnapshotCommand = '_addDebugEventsSnapshotCmd'; }
    static { this.VariableNameDef = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, 'g'); } // MUST be using `g`-flag
    constructor(historyService, workspaceContextService, searchService, labelService, languageFeaturesService, chatWidgetService, outlineService, editorService, configurationService, codeEditorService, chatAgentService, instantiationService, chatDebugService, chatSessionsService) {
        super();
        this.historyService = historyService;
        this.workspaceContextService = workspaceContextService;
        this.searchService = searchService;
        this.labelService = labelService;
        this.languageFeaturesService = languageFeaturesService;
        this.chatWidgetService = chatWidgetService;
        this.outlineService = outlineService;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.codeEditorService = codeEditorService;
        this.chatAgentService = chatAgentService;
        this.instantiationService = instantiationService;
        this.chatDebugService = chatDebugService;
        this.chatSessionsService = chatSessionsService;
        // File/Folder completions in one go and m
        const fileWordPattern = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, 'g');
        this.registerVariableCompletions('fileAndFolder', async ({ widget, range }, token) => {
            if (!widget.supportsFileReferences) {
                return;
            }
            const result = { suggestions: [] };
            // If locked to an agent that doesn't support file attachments, skip
            if (widget.lockedAgentId) {
                const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
                if (agent && !agent.capabilities?.supportsFileAttachments) {
                    return result;
                }
            }
            await this.addFileAndFolderEntries(widget, result, range, token);
            return result;
        }, fileWordPattern);
        // Selection completion
        this.registerVariableCompletions('selection', ({ widget, range }, token) => {
            if (!widget.supportsFileReferences) {
                return;
            }
            if (widget.location === ChatAgentLocation.EditorInline) {
                return;
            }
            const active = this.findActiveCodeEditor();
            if (!isCodeEditor(active)) {
                return;
            }
            const currentResource = active.getModel()?.uri;
            const currentSelection = active.getSelection();
            if (!currentSelection || !currentResource || currentSelection.isEmpty()) {
                return;
            }
            const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
            const basename = this.labelService.getUriBasenameLabel(currentResource);
            const text = `${typedLeader}file:${basename}:${currentSelection.startLineNumber}-${currentSelection.endLineNumber}`;
            const fullRangeText = `:${currentSelection.startLineNumber}:${currentSelection.startColumn}-${currentSelection.endLineNumber}:${currentSelection.endColumn}`;
            const description = this.labelService.getUriLabel(currentResource, { relative: true }) + fullRangeText;
            const result = { suggestions: [] };
            result.suggestions.push({
                label: { label: `${typedLeader}selection`, description },
                filterText: `${typedLeader}selection`,
                insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
                range,
                kind: 18 /* CompletionItemKind.Text */,
                sortText: 'z',
                command: {
                    id: BuiltinDynamicCompletions_1.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
                            id: 'vscode.selection',
                            isFile: true,
                            range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
                            data: { range: currentSelection, uri: currentResource }
                        })]
                }
            });
            return result;
        });
        // Symbol completions
        this.registerVariableCompletions('symbol', ({ widget, range, position, model }, token) => {
            if (!widget.supportsFileReferences) {
                return null;
            }
            const result = { suggestions: [] };
            const range2 = computeCompletionRanges(model, position, new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, 'g'), true);
            if (range2) {
                this.addSymbolEntries(widget, result, range2, token);
            }
            return result;
        });
        // Session Reference completion
        const sessionWordPattern = new RegExp(`${chatVariableLeader}[^\\s]*`, 'g');
        this.registerVariableCompletions('sessionReference', async ({ widget, range }, token) => {
            if (widget.location !== ChatAgentLocation.Chat) {
                return;
            }
            const typedWord = range.varWord?.word ?? '';
            const sessionPrefix = `${chatVariableLeader}session`;
            const result = { suggestions: [] };
            if (typedWord.toLowerCase().startsWith(`${sessionPrefix}:`)) {
                // User has typed #session: — fetch all sessions and show them inline
                const allSessions = [];
                const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.Claude];
                for await (const group of this.chatSessionsService.getChatSessionItems(sessionProviderFilter, token)) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
                    for (const item of group.items) {
                        allSessions.push({
                            title: item.label,
                            sessionResource: item.resource,
                            lastMessageDate: item.timing.lastRequestEnded ?? item.timing.created,
                            icon: item.iconPath ?? providerIcon,
                        });
                    }
                }
                const currentSessionResource = widget.viewModel?.sessionResource;
                const filteredSessions = allSessions
                    .filter(s => !currentSessionResource || s.sessionResource.toString() !== currentSessionResource.toString())
                    .sort((a, b) => b.lastMessageDate - a.lastMessageDate);
                for (const session of filteredSessions) {
                    const text = `${sessionPrefix}:${session.title}`;
                    const dateStr = new Date(session.lastMessageDate).toLocaleString();
                    result.suggestions.push({
                        label: { label: session.title, description: dateStr },
                        filterText: `${sessionPrefix}:${session.title}`,
                        insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
                        range,
                        kind: 18 /* CompletionItemKind.Text */,
                        sortText: `z${String(Number.MAX_SAFE_INTEGER - session.lastMessageDate).padStart(20, '0')}`,
                        command: {
                            id: BuiltinDynamicCompletions_1.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
                                    id: session.sessionResource.toString(),
                                    icon: session.icon,
                                    range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
                                    data: session.sessionResource
                                })]
                        }
                    });
                }
            }
            else {
                // User typed # or #s etc — show single #session entry that inserts #session: and re-triggers suggest
                result.suggestions.push({
                    label: { label: sessionPrefix, description: localize('session.description', 'Attach a chat session') },
                    filterText: sessionPrefix,
                    insertText: `${sessionPrefix}:`,
                    range,
                    kind: 18 /* CompletionItemKind.Text */,
                    sortText: 'z',
                    command: { id: 'editor.action.triggerSuggest', title: '' },
                });
            }
            return result;
        }, sessionWordPattern);
        // Debug Events Snapshot completion
        this.registerVariableCompletions('debugEventsSnapshot', ({ widget, range }) => {
            if (widget.location !== ChatAgentLocation.Chat) {
                return;
            }
            const sessionResource = widget.viewModel?.sessionResource;
            if (!sessionResource || this.chatDebugService.getEvents(sessionResource).length === 0) {
                return;
            }
            const text = `${chatVariableLeader}debugEventsSnapshot`;
            const result = { suggestions: [] };
            result.suggestions.push({
                label: { label: text, description: localize('debugEventsSnapshot.description', 'Attach debug events snapshot') },
                filterText: text,
                insertText: '',
                range,
                kind: 18 /* CompletionItemKind.Text */,
                sortText: 'z',
                command: {
                    id: BuiltinDynamicCompletions_1.addDebugEventsSnapshotCommand, title: '', arguments: [widget]
                }
            });
            return result;
        });
        this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions_1.addReferenceCommand, (_services, arg) => {
            assertType(arg instanceof ReferenceArgument);
            return this.cmdAddReference(arg);
        }));
        this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions_1.addDebugEventsSnapshotCommand, async (_services, widget) => {
            const sessionResource = widget.viewModel?.sessionResource;
            if (!sessionResource) {
                return;
            }
            const attachment = await createDebugEventsAttachment(sessionResource, this.chatDebugService);
            widget.attachmentModel.addContext(attachment);
        }));
    }
    findActiveCodeEditor() {
        const codeEditor = this.codeEditorService.getActiveCodeEditor();
        if (codeEditor) {
            const model = codeEditor.getModel();
            if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
                return undefined;
            }
            if (model) {
                return codeEditor;
            }
        }
        for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
            const codeEditor = getCodeEditor(codeOrDiffEditor);
            if (!codeEditor) {
                continue;
            }
            const model = codeEditor.getModel();
            if (model) {
                return codeEditor;
            }
        }
        return undefined;
    }
    registerVariableCompletions(debugName, provider, wordPattern = BuiltinDynamicCompletions_1.VariableNameDef) {
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: `chatVarCompletions-${debugName}`,
            triggerCharacters: [chatVariableLeader, chatAgentLeader],
            provideCompletionItems: async (model, position, context, token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget) {
                    return;
                }
                const range = computeCompletionRanges(model, position, wordPattern, true);
                if (range) {
                    return provider({ model, position, widget, range, context }, token);
                }
                return;
            }
        }));
    }
    async addFileAndFolderEntries(widget, result, info, token) {
        const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
        const makeCompletionItem = (resource, kind, description, boostPriority) => {
            const basename = this.labelService.getUriBasenameLabel(resource);
            const text = `${typedLeader}file:${basename}`;
            const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
            const labelDescription = description
                ? localize('fileEntryDescription', '{0} ({1})', uriLabel, description)
                : uriLabel;
            // keep files above other completions
            const sortText = boostPriority ? ' ' : '!';
            return {
                label: { label: basename, description: labelDescription },
                filterText: `${basename} ${typedLeader}${basename} ${uriLabel}`,
                insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
                range: info,
                kind: kind === FileKind.FILE ? 20 /* CompletionItemKind.File */ : 23 /* CompletionItemKind.Folder */,
                sortText,
                command: {
                    id: BuiltinDynamicCompletions_1.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
                            id: resource.toString(),
                            isFile: kind === FileKind.FILE,
                            isDirectory: kind === FileKind.FOLDER,
                            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
                            data: resource
                        })]
                }
            };
        };
        let pattern;
        if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
            pattern = info.varWord.word.toLowerCase().slice(1); // remove leading # or @
        }
        const seen = new ResourceSet();
        const len = result.suggestions.length;
        // HISTORY
        // always take the last N items
        for (const [i, item] of this.historyService.getHistory().entries()) {
            const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
            if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, resource.scheme))) {
                // ignore editors without a resource
                continue;
            }
            if (pattern) {
                // use pattern if available
                const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
                const basename = this.labelService.getUriBasenameLabel(resource).toLowerCase();
                const combined = `${basename} ${uriLabel}`;
                if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
                    continue;
                }
            }
            seen.add(resource);
            const newLen = result.suggestions.push(makeCompletionItem(resource, FileKind.FILE, i === 0 ? localize('activeFile', 'Active file') : undefined, i === 0));
            if (newLen - len >= 5) {
                break;
            }
        }
        // SEARCH
        // use file search when having a pattern
        if (pattern) {
            const cacheKey = this.updateCacheKey();
            const workspaces = this.workspaceContextService.getWorkspace().folders.map(folder => folder.uri);
            for (const workspace of workspaces) {
                const { folders, files } = await searchFilesAndFolders(workspace, pattern, true, token, cacheKey.key, this.configurationService, this.searchService);
                for (const file of files) {
                    if (!seen.has(file)) {
                        result.suggestions.push(makeCompletionItem(file, FileKind.FILE));
                        seen.add(file);
                    }
                }
                for (const folder of folders) {
                    if (!seen.has(folder)) {
                        result.suggestions.push(makeCompletionItem(folder, FileKind.FOLDER));
                        seen.add(folder);
                    }
                }
            }
        }
        // mark results as incomplete because further typing might yield
        // in more search results
        result.incomplete = true;
    }
    addSymbolEntries(widget, result, info, token) {
        const timeoutMs = 100;
        const stopwatch = new StopWatch();
        const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
        const makeSymbolCompletionItem = (symbolItem, pattern) => {
            const text = `${typedLeader}sym:${symbolItem.name}`;
            const resource = symbolItem.location.uri;
            const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
            const sortText = pattern ? '{' /* after z */ : '|' /* after { */;
            return {
                label: { label: symbolItem.name, description: uriLabel },
                filterText: `${typedLeader}${symbolItem.name}`,
                insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
                range: info,
                kind: SymbolKinds.toCompletionKind(symbolItem.kind),
                sortText,
                command: {
                    id: BuiltinDynamicCompletions_1.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
                            id: `vscode.symbol/${JSON.stringify(symbolItem.location)}`,
                            fullName: symbolItem.name,
                            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
                            data: symbolItem.location,
                            icon: SymbolKinds.toIcon(symbolItem.kind)
                        })]
                }
            };
        };
        let pattern;
        if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
            pattern = info.varWord.word.toLowerCase().slice(1); // remove leading # or @
        }
        const symbolsToAdd = [];
        for (const outlineModel of this.outlineService.getCachedModels()) {
            const symbols = outlineModel.asListOfDocumentSymbols();
            for (const symbol of symbols) {
                symbolsToAdd.push({ symbol, uri: outlineModel.uri });
            }
        }
        let timedOut = false;
        for (const symbol of symbolsToAdd) {
            if (stopwatch.elapsed() > timeoutMs || token.isCancellationRequested) {
                timedOut = true;
                break;
            }
            result.suggestions.push(makeSymbolCompletionItem({ ...symbol.symbol, location: { uri: symbol.uri, range: symbol.symbol.range } }, pattern ?? ''));
        }
        result.incomplete = !!pattern || timedOut;
    }
    updateCacheKey() {
        if (this.cacheKey && Date.now() - this.cacheKey.time > 60000) {
            this.searchService.clearCache(this.cacheKey.key);
            this.cacheKey = undefined;
        }
        if (!this.cacheKey) {
            this.cacheKey = {
                key: generateUuid(),
                time: Date.now()
            };
        }
        this.cacheKey.time = Date.now();
        return this.cacheKey;
    }
    cmdAddReference(arg) {
        // invoked via the completion command
        arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
    }
};
BuiltinDynamicCompletions = BuiltinDynamicCompletions_1 = __decorate([
    __param(0, IHistoryService),
    __param(1, IWorkspaceContextService),
    __param(2, ISearchService),
    __param(3, ILabelService),
    __param(4, ILanguageFeaturesService),
    __param(5, IChatWidgetService),
    __param(6, IOutlineModelService),
    __param(7, IEditorService),
    __param(8, IConfigurationService),
    __param(9, ICodeEditorService),
    __param(10, IChatAgentService),
    __param(11, IInstantiationService),
    __param(12, IChatDebugService),
    __param(13, IChatSessionsService)
], BuiltinDynamicCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, 4 /* LifecyclePhase.Eventually */);
let ToolCompletions = class ToolCompletions extends Disposable {
    static { ToolCompletions_1 = this; }
    static { this.VariableNameDef = new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, 'g'); } // MUST be using `g`-flag
    constructor(languageFeaturesService, chatWidgetService, chatAgentService) {
        super();
        this.languageFeaturesService = languageFeaturesService;
        this.chatWidgetService = chatWidgetService;
        this.chatAgentService = chatAgentService;
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'chatVariables',
            triggerCharacters: [chatVariableLeader, chatAgentLeader],
            provideCompletionItems: async (model, position, _context, _token) => {
                const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget) {
                    return null;
                }
                // If locked to an agent that doesn't support tool attachments, skip
                if (widget.lockedAgentId) {
                    const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
                    if (agent && !agent.capabilities?.supportsToolAttachments) {
                        return null;
                    }
                }
                const range = computeCompletionRanges(model, position, ToolCompletions_1.VariableNameDef, true);
                if (!range) {
                    return null;
                }
                const usedNames = new Set();
                for (const part of widget.parsedInput.parts) {
                    if (part instanceof ChatRequestToolPart) {
                        usedNames.add(part.toolName);
                    }
                    else if (part instanceof ChatRequestToolSetPart) {
                        usedNames.add(part.name);
                    }
                }
                const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
                const pattern = range.varWord?.word ? range.varWord.word.toLowerCase().slice(1) : '';
                const suggestions = [];
                const iter = widget.input.selectedToolsModel.entriesMap.get();
                for (const [item, enabled] of iter) {
                    if (!enabled) {
                        continue;
                    }
                    let detail;
                    let documentation;
                    let name;
                    if (isToolSet(item)) {
                        detail = item.description;
                        name = item.referenceName;
                    }
                    else {
                        const source = item.source;
                        detail = localize('tool_source_completion', "{0}: {1}", source.label, item.displayName);
                        name = item.toolReferenceName ?? item.displayName;
                        documentation = item.userDescription ?? item.modelDescription;
                    }
                    if (usedNames.has(name)) {
                        continue;
                    }
                    if (pattern) {
                        const lowerName = name.toLowerCase();
                        if (!isPatternInWord(pattern, 0, pattern.length, lowerName, 0, lowerName.length)) {
                            continue;
                        }
                    }
                    const withLeader = `${typedLeader}${name}`;
                    suggestions.push({
                        label: withLeader,
                        range,
                        detail,
                        documentation,
                        filterText: `${typedLeader}${name}`,
                        insertText: withLeader + ' ',
                        kind: 27 /* CompletionItemKind.Tool */,
                    });
                }
                return { suggestions };
            }
        }));
    }
};
ToolCompletions = ToolCompletions_1 = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IChatWidgetService),
    __param(2, IChatAgentService)
], ToolCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ToolCompletions, 4 /* LifecyclePhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0Q29tcGxldGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRDb21wbGV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDMUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3hFLE9BQU8sRUFBZSxhQUFhLEVBQUUsWUFBWSxFQUFF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