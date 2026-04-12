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
var ChatContinueInSessionActionItem_1;
import { Codicon } from '../../../../../base/common/codicons.js';
import { h } from '../../../../../base/browser/dom.js';
import { Disposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IsSessionsWindowContext, ResourceContextKey } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { chatEditingWidgetFileStateContextKey } from '../../common/editing/chatEditingService.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../attachments/chatVariables.js';
import { ChatSendResult, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { ctxHasEditorModification } from '../chatEditing/chatEditingEditorContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from './chatActions.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
/**
 * Extracts the "owner/repo" name-with-owner from a git remote URL.
 * Supports HTTPS (https://github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git) formats.
 */
function extractNwoFromRemoteUrl(remoteUrl) {
    const match = remoteUrl.match(/(?:github\.com)[/:](?<owner>[^/]+)\/(?<repo>[^/.]+)/);
    if (match?.groups) {
        return `${match.groups.owner}/${match.groups.repo}`;
    }
    return undefined;
}
/**
 * Resolves GitHub NWO from a local git repository path by reading `.git/config`.
 * Handles both regular repos and git worktrees.
 */
async function resolveGitRemoteNwo(repoPath, fileService) {
    try {
        const gitPath = `${repoPath}/.git`;
        const gitUri = URI.file(gitPath);
        let configUri;
        try {
            const stat = await fileService.stat(gitUri);
            if (stat.isDirectory) {
                // Regular git repo
                configUri = URI.file(`${gitPath}/config`);
            }
            else {
                // Git worktree — .git is a file with "gitdir: <path>"
                const gitFile = await fileService.readFile(gitUri);
                const gitDir = gitFile.value.toString().trim().replace(/^gitdir:\s*/, '');
                // Resolve relative paths
                const resolvedGitDir = gitDir.startsWith('/')
                    ? gitDir
                    : `${repoPath}/${gitDir}`;
                // The config is in the common dir (parent of worktree git dirs)
                // e.g., gitdir points to /repo/.git/worktrees/name, config is at /repo/.git/config
                const commonDir = resolvedGitDir.replace(/\/worktrees\/[^/]+$/, '');
                configUri = URI.file(`${commonDir}/config`);
            }
        }
        catch {
            // .git doesn't exist
            return undefined;
        }
        const content = await fileService.readFile(configUri);
        const configText = content.value.toString();
        // Parse remote "origin" URL from git config
        const remoteMatch = configText.match(/\[remote\s+"origin"\][^[]*url\s*=\s*(.+)/m);
        if (remoteMatch?.[1]) {
            return extractNwoFromRemoteUrl(remoteMatch[1].trim());
        }
    }
    catch {
        // File not found or not readable
    }
    return undefined;
}
export var ActionLocation;
(function (ActionLocation) {
    ActionLocation["ChatWidget"] = "chatWidget";
    ActionLocation["Editor"] = "editor";
})(ActionLocation || (ActionLocation = {}));
export class ContinueChatInSessionAction extends Action2 {
    static { this.ID = 'workbench.action.chat.continueChatInSession'; }
    constructor() {
        super({
            id: ContinueChatInSessionAction.ID,
            title: localize2('continueChatInSession', "Continue Chat in..."),
            tooltip: localize('continueChatInSession', "Continue Chat in..."),
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.requestInProgress.negate(), ChatContextKeys.remoteJobCreating.negate(), ChatContextKeys.hasCanDelegateProviders),
            menu: [{
                    id: MenuId.ChatExecute,
                    group: 'navigation',
                    order: 3.4,
                    when: ContextKeyExpr.and(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.hasCanDelegateProviders),
                },
                {
                    id: MenuId.EditorContent,
                    group: 'continueIn',
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled), ContextKeyExpr.equals(ResourceContextKey.LangId.key, PROMPT_LANGUAGE_ID), ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, 0 /* ModifiedFileEntryState.Modified */), ctxHasEditorModification.negate(), ChatContextKeys.hasCanDelegateProviders),
                }
            ]
        });
    }
    async run() {
        // Handled by a custom action item
    }
}
let ChatContinueInSessionActionItem = ChatContinueInSessionActionItem_1 = class ChatContinueInSessionActionItem extends ActionWidgetDropdownActionViewItem {
    constructor(action, location, actionWidgetService, contextKeyService, keybindingService, chatSessionsService, instantiationService, openerService, telemetryService, scmService, workspaceContextService) {
        super(action, {
            actionProvider: ChatContinueInSessionActionItem_1.actionProvider(chatSessionsService, instantiationService, scmService, workspaceContextService, location),
            actionBarActions: ChatContinueInSessionActionItem_1.getActionBarActions(openerService),
            reporter: { id: 'ChatContinueInSession', name: 'ChatContinueInSession', includeOptions: true },
        }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.location = location;
        this.contextKeyService = contextKeyService;
    }
    static getActionBarActions(openerService) {
        const learnMoreUrl = 'https://aka.ms/vscode-continue-chat-in';
        return [{
                id: 'workbench.action.chat.continueChatInSession.learnMore',
                label: localize('chat.learnMore', "Learn More"),
                tooltip: localize('chat.learnMore', "Learn More"),
                class: undefined,
                enabled: true,
                run: async () => {
                    await openerService.open(URI.parse(learnMoreUrl));
                }
            }];
    }
    static actionProvider(chatSessionsService, instantiationService, scmService, workspaceContextService, location) {
        return {
            getActions: () => {
                const actions = [];
                const contributions = chatSessionsService.getAllChatSessionContributions();
                const folders = workspaceContextService.getWorkspace().folders;
                let hasGitRepo = false;
                if (folders.length > 0) {
                    for (const repo of scmService.repositories) {
                        if (repo.provider.rootUri && workspaceContextService.getWorkspaceFolder(repo.provider.rootUri)) {
                            hasGitRepo = true;
                            break;
                        }
                    }
                }
                // Continue in Background
                const backgroundContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Background);
                if (backgroundContrib && backgroundContrib.canDelegate) {
                    actions.push(this.toAction(AgentSessionProviders.Background, backgroundContrib, instantiationService, location));
                }
                // Continue in Cloud (disabled when no git repository)
                const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
                if (cloudContrib && cloudContrib.canDelegate) {
                    actions.push(this.toAction(AgentSessionProviders.Cloud, cloudContrib, instantiationService, location, hasGitRepo));
                }
                // Offer actions to enter setup if we have no contributions
                if (actions.length === 0) {
                    actions.push(this.toSetupAction(AgentSessionProviders.Background, instantiationService));
                    actions.push(this.toSetupAction(AgentSessionProviders.Cloud, instantiationService));
                }
                return actions;
            }
        };
    }
    static toAction(provider, contrib, instantiationService, location, enabled = true) {
        return {
            id: contrib.type,
            enabled,
            icon: getAgentSessionProviderIcon(provider),
            class: undefined,
            description: `@${contrib.name}`,
            label: getAgentSessionProviderName(provider),
            tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
            category: { label: localize('continueIn', "Continue In"), order: 0, showHeader: true },
            run: () => instantiationService.invokeFunction(accessor => {
                if (location === "editor" /* ActionLocation.Editor */) {
                    return new CreateRemoteAgentJobFromEditorAction().run(accessor, contrib);
                }
                return new CreateRemoteAgentJobAction().run(accessor, contrib);
            })
        };
    }
    static toSetupAction(provider, instantiationService) {
        return {
            id: provider,
            enabled: true,
            icon: getAgentSessionProviderIcon(provider),
            class: undefined,
            label: getAgentSessionProviderName(provider),
            tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
            category: { label: localize('continueIn', "Continue In"), order: 0, showHeader: true },
            run: () => instantiationService.invokeFunction(accessor => {
                const commandService = accessor.get(ICommandService);
                return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
            })
        };
    }
    renderLabel(element) {
        if (this.location === "editor" /* ActionLocation.Editor */) {
            const view = h('span.action-widget-delegate-label', [
                h('span', { className: ThemeIcon.asClassName(Codicon.forward) }),
                h('span', [localize('continueInEllipsis', "Continue in...")])
            ]);
            element.appendChild(view.root);
            return null;
        }
        else {
            const icon = this.contextKeyService.contextMatchesRules(ChatContextKeys.remoteJobCreating) ? Codicon.sync : Codicon.forward;
            element.classList.add(...ThemeIcon.asClassNameArray(icon));
            return super.renderLabel(element);
        }
    }
};
ChatContinueInSessionActionItem = ChatContinueInSessionActionItem_1 = __decorate([
    __param(2, IActionWidgetService),
    __param(3, IContextKeyService),
    __param(4, IKeybindingService),
    __param(5, IChatSessionsService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, ITelemetryService),
    __param(9, ISCMService),
    __param(10, IWorkspaceContextService)
], ChatContinueInSessionActionItem);
export { ChatContinueInSessionActionItem };
const NEW_CHAT_SESSION_ACTION_ID = 'workbench.action.chat.openNewSessionEditor';
export class CreateRemoteAgentJobAction {
    constructor() { }
    openUntitledEditor(commandService, continuationTarget) {
        commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
    }
    /**
     * Extracts the GitHub "owner/repo" NWO from the source session by checking
     * multiple data sources: chat model repoData, session metadata, and session options.
     */
    async extractRepoNwoFromSession(agentSessionsService, chatSessionsService, fileService, sessionResource, chatModel) {
        // 1. Try chat model's repoData (populated when local git repo exists)
        const repoData = chatModel.repoData;
        if (repoData?.remoteUrl) {
            const nwo = extractNwoFromRemoteUrl(repoData.remoteUrl);
            if (nwo) {
                return nwo;
            }
        }
        // 2. Try agent session metadata (populated by session providers)
        const agentSession = agentSessionsService.getSession(sessionResource);
        if (agentSession?.metadata) {
            const metadata = agentSession.metadata;
            // Cloud sessions set name/owner in metadata
            const owner = metadata.owner;
            const name = metadata.name;
            if (owner && name) {
                return `${owner}/${name}`;
            }
            // Background sessions may set repositoryNwo directly
            const repositoryNwo = metadata.repositoryNwo;
            if (repositoryNwo?.includes('/')) {
                return repositoryNwo;
            }
            // Background sessions may set repositoryUrl
            const repositoryUrl = metadata.repositoryUrl;
            if (repositoryUrl) {
                const nwo = extractNwoFromRemoteUrl(repositoryUrl);
                if (nwo) {
                    return nwo;
                }
            }
            // Background sessions set workingDirectoryPath — resolve git remote from it
            const workingDir = (metadata.workingDirectoryPath ?? metadata.repositoryPath ?? metadata.worktreePath);
            if (workingDir) {
                const nwo = await resolveGitRemoteNwo(workingDir, fileService);
                if (nwo) {
                    return nwo;
                }
            }
        }
        // 3. Try session options (repository picker selection)
        // Cloud sessions use 'repositories', sessions window uses 'repository'
        for (const optionId of ['repositories', 'repository']) {
            const repoOption = chatSessionsService.getSessionOption(sessionResource, optionId);
            if (repoOption) {
                const optionValue = typeof repoOption === 'string' ? repoOption : repoOption.id;
                if (optionValue) {
                    // Check if it's already a "owner/repo" NWO (exactly two segments)
                    const segments = optionValue.split('/').filter(Boolean);
                    if (segments.length === 2) {
                        return optionValue;
                    }
                    // Try extracting NWO from a URL
                    const nwo = extractNwoFromRemoteUrl(optionValue);
                    if (nwo) {
                        return nwo;
                    }
                    // Try parsing as URI (e.g. github-remote-file://github/owner/repo/...)
                    try {
                        const uri = URI.parse(optionValue);
                        if (uri.authority === 'github') {
                            const parts = uri.path.split('/').filter(Boolean);
                            if (parts.length >= 2) {
                                return `${parts[0]}/${parts[1]}`;
                            }
                        }
                    }
                    catch { /* ignore */ }
                    // Local filesystem path — resolve git remote
                    if (isAbsolute(optionValue)) {
                        const nwoFromGit = await resolveGitRemoteNwo(optionValue, fileService);
                        if (nwoFromGit) {
                            return nwoFromGit;
                        }
                    }
                }
            }
        }
        return undefined;
    }
    async run(accessor, continuationTarget, _widget) {
        const contextKeyService = accessor.get(IContextKeyService);
        const commandService = accessor.get(ICommandService);
        const widgetService = accessor.get(IChatWidgetService);
        const chatAgentService = accessor.get(IChatAgentService);
        const chatService = accessor.get(IChatService);
        const editorService = accessor.get(IEditorService);
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const chatSessionsService = accessor.get(IChatSessionsService);
        const fileService = accessor.get(IFileService);
        const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);
        try {
            remoteJobCreatingKey.set(true);
            const widget = _widget ?? widgetService.lastFocusedWidget;
            if (!widget || !widget.viewModel) {
                return this.openUntitledEditor(commandService, continuationTarget);
            }
            // todo@connor4312: remove 'as' cast
            const chatModel = widget.viewModel.model;
            if (!chatModel) {
                return;
            }
            const sessionResource = widget.viewModel.sessionResource;
            const chatRequests = chatModel.getRequests();
            let userPrompt = widget.getInput();
            if (!userPrompt) {
                if (!chatRequests.length) {
                    return this.openUntitledEditor(commandService, continuationTarget);
                }
                userPrompt = 'implement this.';
            }
            const attachedContext = widget.input.getAttachedAndImplicitContext();
            widget.input.acceptInput(true);
            // For inline editor mode, add selection or cursor information
            if (widget.location === ChatAgentLocation.EditorInline) {
                const activeEditor = editorService.activeTextEditorControl;
                if (activeEditor) {
                    const model = activeEditor.getModel();
                    let activeEditorUri = undefined;
                    if (model && isITextModel(model)) {
                        activeEditorUri = model.uri;
                    }
                    const selection = activeEditor.getSelection();
                    if (activeEditorUri && selection) {
                        attachedContext.add({
                            kind: 'file',
                            id: 'vscode.implicit.selection',
                            name: basename(activeEditorUri),
                            value: {
                                uri: activeEditorUri,
                                range: selection
                            },
                        });
                    }
                }
            }
            const continuationTargetType = continuationTarget.type;
            // When source and target session types differ in the sessions window,
            // open a new session of the target type with the prompt and context
            // instead of sending to the current (incompatible) session resource.
            const isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService);
            const sourceProvider = getAgentSessionProvider(sessionResource);
            if (isSessionsWindow && sourceProvider && sourceProvider !== continuationTargetType) {
                const isSidebar = isIChatViewViewContext(widget.viewContext);
                const actionId = isSidebar
                    ? `workbench.action.chat.openNewSessionSidebar.${continuationTargetType}`
                    : `${NEW_CHAT_SESSION_ACTION_ID}.${continuationTargetType}`;
                // Build conversation transcript from the source session to preserve context.
                // Truncate to avoid exceeding token limits of the target model.
                const maxTranscriptLength = 20_000;
                let transcript = chatRequests.map(req => {
                    const userMsg = `User: ${req.message.text}`;
                    const respMsg = req.response?.response ? `Assistant: ${req.response.response.getMarkdown()}` : '';
                    return respMsg ? `${userMsg}\n${respMsg}` : userMsg;
                }).join('\n\n');
                if (transcript.length > maxTranscriptLength) {
                    transcript = transcript.substring(transcript.length - maxTranscriptLength);
                }
                const delegationPrompt = transcript
                    ? `The following is the conversation history from a previous ${getAgentSessionProviderName(sourceProvider)} session. Continue working on it.\n\n${transcript}\n\nUser: ${userPrompt}`
                    : userPrompt;
                // Extract repository info from the source session to pass to the target session
                const initialSessionOptions = new Map();
                const repoNwo = await this.extractRepoNwoFromSession(agentSessionsService, chatSessionsService, fileService, sessionResource, chatModel);
                if (repoNwo) {
                    initialSessionOptions.set('repositories', repoNwo);
                }
                await commandService.executeCommand(actionId, {
                    prompt: delegationPrompt,
                    attachedContext: attachedContext.asArray(),
                    initialSessionOptions: initialSessionOptions.size > 0 ? initialSessionOptions : undefined,
                });
                return;
            }
            const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
            const instantiationService = accessor.get(IInstantiationService);
            const requestParser = instantiationService.createInstance(ChatRequestParser);
            // Add the request to the model first
            const parsedRequest = requestParser.parseChatRequestWithReferences(getDynamicVariablesForWidget(widget), getSelectedToolAndToolSetsForWidget(widget), userPrompt, ChatAgentLocation.Chat);
            const addedRequest = chatModel.addRequest(parsedRequest, { variables: attachedContext.asArray() }, 0, undefined, defaultAgent);
            await chatService.removeRequest(sessionResource, addedRequest.id);
            const sendResult = await chatService.sendRequest(sessionResource, userPrompt, {
                agentIdSilent: continuationTargetType,
                attachedContext: attachedContext.asArray(),
                userSelectedModelId: widget.input.currentLanguageModel,
                ...widget.getModeRequestOptions()
            });
            if (ChatSendResult.isSent(sendResult)) {
                await widget.handleDelegationExitIfNeeded(defaultAgent, sendResult.data.agent);
            }
        }
        catch (e) {
            console.error('[Delegation] Error creating remote coding agent job', e);
            throw e;
        }
        finally {
            remoteJobCreatingKey.set(false);
        }
    }
}
class CreateRemoteAgentJobFromEditorAction {
    constructor() { }
    async run(accessor, continuationTarget) {
        try {
            const editorService = accessor.get(IEditorService);
            const activeEditor = editorService.activeTextEditorControl;
            const commandService = accessor.get(ICommandService);
            if (!activeEditor) {
                return;
            }
            const model = activeEditor.getModel();
            if (!model || !isITextModel(model)) {
                return;
            }
            const uri = model.uri;
            const attachedContext = [toPromptFileVariableEntry(uri, PromptFileVariableKind.PromptFile, undefined, false, [])];
            const prompt = `Follow instructions in [${basename(uri)}](${uri.toString()}).`;
            await commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`, { prompt, attachedContext });
        }
        catch (e) {
            console.error('Error creating remote agent job from editor', e);
            throw e;
        }
    }
}
let ContinueChatInSessionActionRendering = class ContinueChatInSessionActionRendering extends Disposable {
    static { this.ID = 'chat.continueChatInSessionActionRendering'; }
    constructor(actionViewItemService, instantiationService) {
        super();
        const disposable = actionViewItemService.register(MenuId.EditorContent, ContinueChatInSessionAction.ID, (action, options, instantiationService2) => {
            if (!(action instanceof MenuItemAction)) {
                return undefined;
            }
            return instantiationService.createInstance(ChatContinueInSessionActionItem, action, "editor" /* ActionLocation.Editor */);
        });
        markAsSingleton(disposable);
    }
};
ContinueChatInSessionActionRendering = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService)
], ContinueChatInSessionActionRendering);
export { ContinueChatInSessionActionRendering };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRpbnVlSW5BY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0Q29udGludWVJbkFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFlLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDbkksT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDMUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFcEcsT0FBTyxFQUFFLGVBQWUsRUFB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