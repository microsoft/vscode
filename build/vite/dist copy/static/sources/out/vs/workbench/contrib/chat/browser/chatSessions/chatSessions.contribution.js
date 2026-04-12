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
import { sep } from '../../../../../base/common/path.js';
import { AsyncIterableProducer, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import * as resources from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { isDark } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatSessionOptionsMap, IChatSessionsService, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../chat.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';
import { BugIndicatingError, isCancellationError } from '../../../../../base/common/errors.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
import { slashReg } from '../../common/requestParser/chatRequestParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatSessions',
    jsonSchema: {
        description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: false,
            properties: {
                type: {
                    description: localize('chatSessionsExtPoint.chatSessionType', 'Unique identifier for the type of chat session.'),
                    type: 'string',
                },
                name: {
                    description: localize('chatSessionsExtPoint.name', 'Name of the dynamically registered chat participant (eg: @agent). Must not contain whitespace.'),
                    type: 'string',
                    pattern: '^[\\w-]+$'
                },
                displayName: {
                    description: localize('chatSessionsExtPoint.displayName', 'A longer name for this item which is used for display in menus.'),
                    type: 'string',
                },
                description: {
                    description: localize('chatSessionsExtPoint.description', 'Description of the chat session for use in menus and tooltips.'),
                    type: 'string'
                },
                when: {
                    description: localize('chatSessionsExtPoint.when', 'Condition which must be true to show this item.'),
                    type: 'string'
                },
                icon: {
                    description: localize('chatSessionsExtPoint.icon', 'Icon identifier (codicon ID) for the chat session editor tab. For example, "{0}" or "{1}".', '$(github)', '$(cloud)'),
                    anyOf: [{
                            type: 'string'
                        },
                        {
                            type: 'object',
                            properties: {
                                light: {
                                    description: localize('icon.light', 'Icon path when a light theme is used'),
                                    type: 'string'
                                },
                                dark: {
                                    description: localize('icon.dark', 'Icon path when a dark theme is used'),
                                    type: 'string'
                                }
                            }
                        }]
                },
                order: {
                    description: localize('chatSessionsExtPoint.order', 'Order in which this item should be displayed.'),
                    type: 'integer'
                },
                alternativeIds: {
                    description: localize('chatSessionsExtPoint.alternativeIds', 'Alternative identifiers for backward compatibility.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                welcomeTitle: {
                    description: localize('chatSessionsExtPoint.welcomeTitle', 'Title text to display in the chat welcome view for this session type.'),
                    type: 'string'
                },
                welcomeMessage: {
                    description: localize('chatSessionsExtPoint.welcomeMessage', 'Message text (supports markdown) to display in the chat welcome view for this session type.'),
                    type: 'string'
                },
                welcomeTips: {
                    description: localize('chatSessionsExtPoint.welcomeTips', 'Tips text (supports markdown and theme icons) to display in the chat welcome view for this session type.'),
                    type: 'string'
                },
                inputPlaceholder: {
                    description: localize('chatSessionsExtPoint.inputPlaceholder', 'Placeholder text to display in the chat input box for this session type.'),
                    type: 'string'
                },
                capabilities: {
                    description: localize('chatSessionsExtPoint.capabilities', 'Optional capabilities for this chat session.'),
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        supportsFileAttachments: {
                            description: localize('chatSessionsExtPoint.supportsFileAttachments', 'Whether this chat session supports attaching files or file references.'),
                            type: 'boolean'
                        },
                        supportsToolAttachments: {
                            description: localize('chatSessionsExtPoint.supportsToolAttachments', 'Whether this chat session supports attaching tools or tool references.'),
                            type: 'boolean'
                        },
                        supportsMCPAttachments: {
                            description: localize('chatSessionsExtPoint.supportsMCPAttachments', 'Whether this chat session supports attaching MCP resources.'),
                            type: 'boolean'
                        },
                        supportsImageAttachments: {
                            description: localize('chatSessionsExtPoint.supportsImageAttachments', 'Whether this chat session supports attaching images.'),
                            type: 'boolean'
                        },
                        supportsSearchResultAttachments: {
                            description: localize('chatSessionsExtPoint.supportsSearchResultAttachments', 'Whether this chat session supports attaching search results.'),
                            type: 'boolean'
                        },
                        supportsInstructionAttachments: {
                            description: localize('chatSessionsExtPoint.supportsInstructionAttachments', 'Whether this chat session supports attaching instructions.'),
                            type: 'boolean'
                        },
                        supportsSourceControlAttachments: {
                            description: localize('chatSessionsExtPoint.supportsSourceControlAttachments', 'Whether this chat session supports attaching source control changes.'),
                            type: 'boolean'
                        },
                        supportsProblemAttachments: {
                            description: localize('chatSessionsExtPoint.supportsProblemAttachments', 'Whether this chat session supports attaching problems.'),
                            type: 'boolean'
                        },
                        supportsSymbolAttachments: {
                            description: localize('chatSessionsExtPoint.supportsSymbolAttachments', 'Whether this chat session supports attaching symbols.'),
                            type: 'boolean'
                        },
                        supportsPromptAttachments: {
                            description: localize('chatSessionsExtPoint.supportsPromptAttachments', 'Whether this chat session supports attaching prompts.'),
                            type: 'boolean'
                        },
                        supportsHandOffs: {
                            description: localize('chatSessionsExtPoint.supportsHandOffs', 'Whether this chat session supports hand-off prompts.'),
                            type: 'boolean'
                        }
                    }
                },
                commands: {
                    markdownDescription: localize('chatCommandsDescription', "Commands available for this chat session, which the user can invoke with a `/`."),
                    type: 'array',
                    items: {
                        additionalProperties: false,
                        type: 'object',
                        defaultSnippets: [{ body: { name: '', description: '' } }],
                        required: ['name'],
                        properties: {
                            name: {
                                description: localize('chatCommand', "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                                type: 'string'
                            },
                            description: {
                                description: localize('chatCommandDescription', "A description of this command."),
                                type: 'string'
                            },
                            when: {
                                description: localize('chatCommandWhen', "A condition which must be true to enable this command."),
                                type: 'string'
                            },
                        }
                    }
                },
                canDelegate: {
                    description: localize('chatSessionsExtPoint.canDelegate', 'Whether delegation is supported. Default is false. Note that enabling this is experimental and may not be respected at all times.'),
                    type: 'boolean',
                    default: false
                },
                customAgentTarget: {
                    description: localize('chatSessionsExtPoint.customAgentTarget', 'When set, the chat session will show a filtered mode picker that prefers custom agents whose target property matches this value. Custom agents without a target property are still shown in all session types. This enables the use of standard agent/mode with contributed sessions.'),
                    type: 'string'
                },
                requiresCustomModels: {
                    description: localize('chatSessionsExtPoint.requiresCustomModels', 'When set, the chat session will show a filtered model picker that prefers custom models. This enables the use of standard model picker with contributed sessions.'),
                    type: 'boolean',
                    default: false
                },
                autoAttachReferences: {
                    description: localize('chatSessionsExtPoint.autoAttachReferences', 'Whether to automatically attach instruction files to chat requests for this session type.'),
                    type: 'boolean',
                    default: false
                },
                useRequestToPopulateBuiltInPickers: {
                    description: localize('chatSessionsExtPoint.useRequestToPopulateBuiltInPickers', 'Whether to use ChatRequestTurn2 to populate built-in pickers such as the Agent and Model pickers.'),
                    type: 'boolean',
                    default: false
                }
            },
            required: ['type', 'name', 'displayName', 'description'],
        }
    },
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            yield `onChatSession:${contrib.type}`;
        }
    }
});
class ContributedChatSessionData extends Disposable {
    getOption(optionId) {
        return this._optionsCache.get(optionId);
    }
    getAllOptions() {
        return this._optionsCache.entries();
    }
    setOption(optionId, value) {
        this._optionsCache.set(optionId, value);
    }
    constructor(session, chatSessionType, resource, options, onWillDispose) {
        super();
        this.session = session;
        this.chatSessionType = chatSessionType;
        this.resource = resource;
        this.options = options;
        this.onWillDispose = onWillDispose;
        this._optionsCache = new Map(options);
        this._register(this.session.onWillDispose(() => {
            this.onWillDispose(this.resource);
        }));
    }
}
let ChatSessionsService = class ChatSessionsService extends Disposable {
    get onDidChangeInProgress() { return this._onDidChangeInProgress.event; }
    get onDidChangeContentProviderSchemes() { return this._onDidChangeContentProviderSchemes.event; }
    get onDidChangeSessionOptions() { return this._onDidChangeSessionOptions.event; }
    get onDidChangeOptionGroups() { return this._onDidChangeOptionGroups.event; }
    constructor(_logService, _chatAgentService, _extensionService, _contextKeyService, _menuService, _themeService, _labelService) {
        super();
        this._logService = _logService;
        this._chatAgentService = _chatAgentService;
        this._extensionService = _extensionService;
        this._contextKeyService = _contextKeyService;
        this._menuService = _menuService;
        this._themeService = _themeService;
        this._labelService = _labelService;
        this._itemControllers = new Map();
        this._contributions = new Map();
        this._contributionDisposables = this._register(new DisposableMap());
        this._contentProviders = new Map();
        this._alternativeIdMap = new Map();
        this._contextKeys = new Set();
        this._onDidChangeItemsProviders = this._register(new Emitter());
        this.onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;
        this._onDidChangeSessionItems = this._register(new Emitter());
        this.onDidChangeSessionItems = this._onDidChangeSessionItems.event;
        this._onDidCommitSession = this._register(new Emitter());
        this.onDidCommitSession = this._onDidCommitSession.event;
        this._onDidChangeAvailability = this._register(new Emitter());
        this.onDidChangeAvailability = this._onDidChangeAvailability.event;
        this._onDidChangeInProgress = this._register(new Emitter());
        this._onDidChangeContentProviderSchemes = this._register(new Emitter());
        this._onDidChangeSessionOptions = this._register(new Emitter());
        this._onDidChangeOptionGroups = this._register(new Emitter());
        this.inProgressMap = new Map();
        this._sessionTypeOptions = new Map();
        this._sessions = new ResourceMap();
        this._resourceAliases = new ResourceMap(); // real resource -> untitled resource
        this._customizationsProviders = new Map();
        this._onDidChangeCustomizations = this._register(new Emitter());
        this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
        this._hasCanDelegateProvidersKey = ChatContextKeys.hasCanDelegateProviders.bindTo(this._contextKeyService);
        this._register(extensionPoint.setHandler(extensions => {
            for (const ext of extensions) {
                if (!isProposedApiEnabled(ext.description, 'chatSessionsProvider')) {
                    continue;
                }
                if (!Array.isArray(ext.value)) {
                    continue;
                }
                for (const contribution of ext.value) {
                    this._register(this.registerContribution(contribution, ext.description));
                }
            }
        }));
        // Listen for context changes and re-evaluate contributions
        this._register(Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(this._contextKeys))(() => {
            this._evaluateAvailability();
        }));
        const builtinSessionProviders = [AgentSessionProviders.Local];
        const contributedSessionProviders = observableFromEvent(this.onDidChangeAvailability, () => Array.from(this._contributions.keys()).filter(key => this._contributionDisposables.has(key))).recomputeInitiallyAndOnChange(this._store);
        this._register(autorun(reader => {
            const activatedProviders = contributedSessionProviders.read(reader);
            // Register in-place actions for built-in enum providers
            for (const provider of builtinSessionProviders) {
                reader.store.add(registerNewSessionInPlaceAction(provider, getAgentSessionProviderName(provider)));
            }
            for (const type of activatedProviders) {
                // TODO: Remove hardcoded providers from core
                const knownProvider = getAgentSessionProvider(type);
                if (knownProvider) {
                    // Well-known provider — use hardcoded name
                    reader.store.add(registerNewSessionInPlaceAction(type, getAgentSessionProviderName(knownProvider)));
                }
                else {
                    // Extension-contributed — use contribution metadata
                    const contrib = this._contributions.get(type);
                    if (contrib) {
                        reader.store.add(registerNewSessionInPlaceAction(type, contrib.contribution.displayName ?? contrib.contribution.name ?? type));
                    }
                }
            }
        }));
        this._register(this._labelService.registerFormatter({
            scheme: Schemas.copilotPr,
            formatting: {
                label: '${authority}${path}',
                separator: sep,
                stripPathStartingSeparator: true,
            }
        }));
    }
    reportInProgress(chatSessionType, count) {
        if (!this._itemControllers.has(chatSessionType)) {
            this._logService.warn(`Attempted to report in-progress status for unknown chat session type '${chatSessionType}'`);
        }
        this.inProgressMap.set(chatSessionType, count);
        this._onDidChangeInProgress.fire();
    }
    getInProgress() {
        return Array.from(this.inProgressMap.entries()).map(([chatSessionType, count]) => ({ chatSessionType, count }));
    }
    async updateInProgressStatus(chatSessionType) {
        try {
            const items = [];
            for await (const result of this.getChatSessionItems([chatSessionType], CancellationToken.None)) {
                items.push(...result.items);
            }
            const inProgress = items.filter(item => item.status && isSessionInProgressStatus(item.status));
            this.reportInProgress(chatSessionType, inProgress.length);
        }
        catch (error) {
            this._logService.warn(`Failed to update in-progress status for chat session type '${chatSessionType}':`, error);
        }
    }
    registerContribution(contribution, ext) {
        this._logService.trace(`[ChatSessionsService] registerContribution called for type='${contribution.type}', canDelegate=${contribution.canDelegate}, when='${contribution.when}', extension='${ext.identifier.value}'`);
        if (this._contributions.has(contribution.type)) {
            this._logService.trace(`[ChatSessionsService] registerContribution: type='${contribution.type}' already registered, skipping`);
            return Disposable.None;
        }
        // Track context keys from the when condition
        if (contribution.when) {
            const whenExpr = ContextKeyExpr.deserialize(contribution.when);
            if (whenExpr) {
                for (const key of whenExpr.keys()) {
                    this._contextKeys.add(key);
                }
            }
        }
        this._contributions.set(contribution.type, { contribution, extension: ext });
        // Register alternative IDs if provided
        if (contribution.alternativeIds) {
            for (const altId of contribution.alternativeIds) {
                if (this._alternativeIdMap.has(altId)) {
                    this._logService.warn(`Alternative ID '${altId}' is already mapped to '${this._alternativeIdMap.get(altId)}'. Remapping to '${contribution.type}'.`);
                }
                this._alternativeIdMap.set(altId, contribution.type);
            }
        }
        this._evaluateAvailability();
        return {
            dispose: () => {
                this._contributions.delete(contribution.type);
                // Remove alternative ID mappings
                if (contribution.alternativeIds) {
                    for (const altId of contribution.alternativeIds) {
                        if (this._alternativeIdMap.get(altId) === contribution.type) {
                            this._alternativeIdMap.delete(altId);
                        }
                    }
                }
                this._contributionDisposables.deleteAndDispose(contribution.type);
                this._updateHasCanDelegateProvidersContextKey();
            }
        };
    }
    _isContributionAvailable(contribution) {
        if (!contribution.when) {
            return true;
        }
        const whenExpr = ContextKeyExpr.deserialize(contribution.when);
        return !whenExpr || this._contextKeyService.contextMatchesRules(whenExpr);
    }
    /**
     * Resolves a session type to its primary type, checking for alternative IDs.
     * @param sessionType The session type or alternative ID to resolve
     * @returns The primary session type, or undefined if not found or not available
     */
    _resolveToPrimaryType(sessionType) {
        // Try to find the primary type first
        const contribution = this._contributions.get(sessionType)?.contribution;
        if (contribution) {
            // If the contribution is available, use it
            if (this._isContributionAvailable(contribution)) {
                return sessionType;
            }
            // If not available, fall through to check for alternatives
        }
        // Check if this is an alternative ID, or if the primary type is not available
        const primaryType = this._alternativeIdMap.get(sessionType);
        if (primaryType) {
            const altContribution = this._contributions.get(primaryType)?.contribution;
            if (altContribution && this._isContributionAvailable(altContribution)) {
                return primaryType;
            }
        }
        return undefined;
    }
    _registerMenuItems(contribution, extensionDescription) {
        // If provider registers anything for the create submenu, let it fully control the creation
        const contextKeyService = this._contextKeyService.createOverlay([
            ['chatSessionType', contribution.type]
        ]);
        const rawMenuActions = this._menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, contextKeyService);
        const menuActions = rawMenuActions.map(value => value[1]).flat();
        const disposables = new DisposableStore();
        // Mirror all create submenu actions into the global Chat New menu
        for (let i = 0; i < menuActions.length; i++) {
            const action = menuActions[i];
            if (action instanceof MenuItemAction) {
                // TODO: This is an odd way to do this, but the best we can do currently
                if (i === 0 && !contribution.canDelegate) {
                    disposables.add(registerNewSessionExternalAction(contribution.type, contribution.displayName, action.item.id));
                }
                else {
                    disposables.add(MenuRegistry.appendMenuItem(MenuId.ChatNewMenu, {
                        command: action.item,
                        group: '4_externally_contributed',
                    }));
                }
            }
        }
        return {
            dispose: () => disposables.dispose()
        };
    }
    _registerCommands(contribution) {
        const isAvailableInSessionTypePicker = isAgentSessionProviderType(contribution.type);
        return combinedDisposable(registerAction2(class OpenChatSessionAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.chat.openSessionWithPrompt.${contribution.type}`,
                    title: localize2('interactiveSession.openSessionWithPrompt', "New {0} with Prompt", contribution.displayName),
                    category: CHAT_CATEGORY,
                    icon: Codicon.plus,
                    f1: false,
                    precondition: ChatContextKeys.enabled
                });
            }
            async run(accessor, chatOptions) {
                const chatService = accessor.get(IChatService);
                const promptsService = accessor.get(IPromptsService);
                const toolsService = accessor.get(ILanguageModelToolsService);
                const { type } = contribution;
                if (chatOptions) {
                    let attachedContext = chatOptions.attachedContext;
                    const resource = URI.revive(chatOptions.resource);
                    const ref = await chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatSessionsContribution#sendPrompt');
                    try {
                        const promptFile = await resolvePromptSlashCommand(chatOptions.prompt, promptsService, toolsService);
                        if (promptFile) {
                            attachedContext = [promptFile, ...(attachedContext ?? [])];
                        }
                        const result = await chatService.sendRequest(resource, chatOptions.prompt, { agentIdSilent: type, attachedContext });
                        if (result.kind === 'queued') {
                            await result.deferred;
                        }
                        else if (result.kind === 'sent') {
                            await result.data.responseCompletePromise;
                        }
                    }
                    finally {
                        ref?.dispose();
                    }
                }
            }
        }), 
        // Creates a chat editor
        registerAction2(class OpenNewChatSessionEditorAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.chat.openNewSessionEditor.${contribution.type}`,
                    title: localize2('interactiveSession.openNewSessionEditor', "New {0} Session", contribution.displayName),
                    category: CHAT_CATEGORY,
                    icon: Codicon.plus,
                    f1: true,
                    precondition: ChatContextKeys.enabled,
                });
            }
            async run(accessor, chatOptions) {
                const { type, displayName } = contribution;
                await openChatSession(accessor, { type, displayName, position: ChatSessionPosition.Editor }, chatOptions);
            }
        }), 
        // New chat in sidebar chat (+ button)
        registerAction2(class OpenNewChatSessionSidebarAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.chat.openNewSessionSidebar.${contribution.type}`,
                    title: localize2('interactiveSession.openNewSessionSidebar', "New {0} Session", contribution.displayName),
                    category: CHAT_CATEGORY,
                    icon: Codicon.plus,
                    f1: false, // Hide from Command Palette
                    precondition: ChatContextKeys.enabled,
                    menu: !isAvailableInSessionTypePicker ? {
                        id: MenuId.ChatNewMenu,
                        group: '3_new_special',
                    } : undefined,
                });
            }
            async run(accessor, chatOptions) {
                const { type, displayName } = contribution;
                await openChatSession(accessor, { type, displayName, position: ChatSessionPosition.Sidebar }, chatOptions);
            }
        }));
    }
    _evaluateAvailability() {
        const newlyEnabledChatSessionTypes = new Set();
        const newlyDisabledChatSessionTypes = new Set();
        const disposedChatSessions = new ResourceSet();
        for (const { contribution, extension } of this._contributions.values()) {
            const isCurrentlyRegistered = this._contributionDisposables.has(contribution.type);
            const shouldBeRegistered = this._isContributionAvailable(contribution);
            this._logService.trace(`[ChatSessionsService] _evaluateAvailability: type='${contribution.type}', isCurrentlyRegistered=${isCurrentlyRegistered}, shouldBeRegistered=${shouldBeRegistered}, when='${contribution.when}'`);
            if (isCurrentlyRegistered && !shouldBeRegistered) {
                // Disable the contribution by disposing its disposable store
                this._contributionDisposables.deleteAndDispose(contribution.type);
                // Also dispose any cached sessions for this contribution
                for (const sessionResource of this._disposeSessionsForContribution(contribution.type)) {
                    disposedChatSessions.add(sessionResource);
                }
                newlyDisabledChatSessionTypes.add(contribution.type);
            }
            else if (!isCurrentlyRegistered && shouldBeRegistered) {
                // Enable the contribution by registering it
                if (extension) {
                    this._enableContribution(contribution, extension);
                }
                newlyEnabledChatSessionTypes.add(contribution.type);
            }
        }
        if (newlyEnabledChatSessionTypes.size > 0 || newlyDisabledChatSessionTypes.size > 0) {
            this._onDidChangeAvailability.fire();
            for (const chatSessionType of [...newlyEnabledChatSessionTypes, ...newlyDisabledChatSessionTypes]) {
                this._onDidChangeItemsProviders.fire({ chatSessionType });
            }
            if (disposedChatSessions.size > 0) {
                this._onDidChangeSessionItems.fire({ removed: Array.from(disposedChatSessions) });
            }
        }
        this._updateHasCanDelegateProvidersContextKey();
    }
    _enableContribution(contribution, ext) {
        this._logService.trace(`[ChatSessionsService] _enableContribution: type='${contribution.type}', canDelegate=${contribution.canDelegate}`);
        const disposableStore = new DisposableStore();
        this._contributionDisposables.set(contribution.type, disposableStore);
        if (contribution.canDelegate) {
            disposableStore.add(this._registerAgent(contribution, ext));
            disposableStore.add(this._registerCommands(contribution));
        }
        disposableStore.add(this._registerMenuItems(contribution, ext));
    }
    /**
     * Disposes of all sessions that belong to a contribution
     *
     * @returns List of session resources that were disposed.
     */
    _disposeSessionsForContribution(contributionId) {
        // Find and dispose all sessions that belong to this contribution
        const sessionsToDispose = [];
        for (const [sessionResource, sessionData] of this._sessions) {
            if (sessionData.chatSessionType === contributionId) {
                sessionsToDispose.push(sessionResource);
            }
        }
        if (sessionsToDispose.length > 0) {
            this._logService.info(`Disposing ${sessionsToDispose.length} cached sessions for contribution '${contributionId}' due to when clause change`);
        }
        for (const sessionKey of sessionsToDispose) {
            const sessionData = this._sessions.get(sessionKey);
            if (sessionData) {
                sessionData.dispose(); // This will call _onWillDisposeSession and clean up
            }
        }
        return sessionsToDispose;
    }
    _registerAgent(contribution, ext) {
        const storedIcon = this.getContributionIcon(ext, contribution);
        const icons = ThemeIcon.isThemeIcon(storedIcon)
            ? { themeIcon: storedIcon, icon: undefined, iconDark: undefined }
            : storedIcon
                ? { icon: storedIcon.light, iconDark: storedIcon.dark }
                : { themeIcon: Codicon.sendToRemoteAgent };
        const id = contribution.type;
        const agentData = {
            id,
            name: contribution.name,
            fullName: contribution.displayName,
            description: contribution.description,
            isDefault: false,
            isCore: false,
            isDynamic: true,
            slashCommands: contribution.commands ?? [],
            locations: [ChatAgentLocation.Chat],
            modes: [ChatModeKind.Agent, ChatModeKind.Ask],
            disambiguation: [],
            metadata: {
                ...icons,
            },
            capabilities: contribution.capabilities,
            canAccessPreviousChatHistory: true,
            extensionId: ext.identifier,
            extensionVersion: ext.version,
            extensionDisplayName: ext.displayName || ext.name,
            extensionPublisherId: ext.publisher,
        };
        return this._chatAgentService.registerAgent(id, agentData);
    }
    getAllChatSessionContributions() {
        return Array.from(this._contributions.values())
            .filter(entry => this._isContributionAvailable(entry.contribution))
            .map(entry => this.resolveChatSessionContribution(entry.extension, entry.contribution));
    }
    _updateHasCanDelegateProvidersContextKey() {
        const hasCanDelegate = this.getAllChatSessionContributions().filter(c => c.canDelegate);
        const canDelegateEnabled = hasCanDelegate.length > 0;
        this._logService.trace(`[ChatSessionsService] hasCanDelegateProvidersAvailable=${canDelegateEnabled} (${hasCanDelegate.map(c => c.type).join(', ')})`);
        this._hasCanDelegateProvidersKey.set(canDelegateEnabled);
    }
    getChatSessionContribution(chatSessionType) {
        const entry = this._contributions.get(chatSessionType);
        if (!entry) {
            return undefined;
        }
        if (!this._isContributionAvailable(entry.contribution)) {
            return undefined;
        }
        return this.resolveChatSessionContribution(entry.extension, entry.contribution);
    }
    resolveChatSessionContribution(ext, contribution) {
        return {
            ...contribution,
            icon: this.resolveIconForCurrentColorTheme(this.getContributionIcon(ext, contribution)),
        };
    }
    getContributionIcon(ext, contribution) {
        if (!contribution.icon) {
            return undefined;
        }
        if (typeof contribution.icon === 'string') {
            return contribution.icon.startsWith('$(') && contribution.icon.endsWith(')')
                ? ThemeIcon.fromString(contribution.icon)
                : ThemeIcon.fromId(contribution.icon);
        }
        return {
            dark: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.dark) : URI.parse(contribution.icon.dark),
            light: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.light) : URI.parse(contribution.icon.light)
        };
    }
    resolveIconForCurrentColorTheme(rawIcon) {
        if (!rawIcon) {
            return undefined;
        }
        if (ThemeIcon.isThemeIcon(rawIcon)) {
            return rawIcon;
        }
        else if (isDark(this._themeService.getColorTheme().type)) {
            return rawIcon.dark;
        }
        else {
            return rawIcon.light;
        }
    }
    registerChatSessionContribution(contribution) {
        if (this._contributions.has(contribution.type)) {
            return { dispose: () => { } };
        }
        this._contributions.set(contribution.type, { contribution, extension: undefined });
        this._onDidChangeAvailability.fire();
        return toDisposable(() => {
            this._contributions.delete(contribution.type);
            this._onDidChangeAvailability.fire();
        });
    }
    async activateChatSessionItemProvider(chatViewType) {
        await this.doActivateChatSessionItemController(chatViewType);
    }
    async doActivateChatSessionItemController(chatViewType) {
        await this._extensionService.whenInstalledExtensionsRegistered();
        const resolvedType = this._resolveToPrimaryType(chatViewType);
        if (resolvedType) {
            chatViewType = resolvedType;
        }
        const contribution = this._contributions.get(chatViewType)?.contribution;
        if (contribution && !this._isContributionAvailable(contribution)) {
            return false;
        }
        if (this._itemControllers.has(chatViewType)) {
            return true;
        }
        await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);
        const controller = this._itemControllers.get(chatViewType);
        return !!controller;
    }
    async canResolveChatSession(sessionType) {
        await this._extensionService.whenInstalledExtensionsRegistered();
        const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
        const contribution = this._contributions.get(resolvedType)?.contribution;
        if (contribution && !this._isContributionAvailable(contribution)) {
            return false;
        }
        if (this._contentProviders.has(sessionType)) {
            return true;
        }
        await this._extensionService.activateByEvent(`onChatSession:${sessionType}`);
        return this._contentProviders.has(sessionType);
    }
    async tryActivateControllers(providersToResolve) {
        await Promise.all(this.getAllChatSessionContributions().map(async (contrib) => {
            if (providersToResolve && !providersToResolve.includes(contrib.type)) {
                return; // skip: not considered for resolving
            }
            if (!await this.doActivateChatSessionItemController(contrib.type)) {
                // We requested this provider but it is not available
                if (providersToResolve?.includes(contrib.type)) {
                    this._logService.trace(`[ChatSessionsService] No enabled provider found for chat session type ${contrib.type}`);
                }
            }
        }));
    }
    getChatSessionItems(providersToResolve, token) {
        return new AsyncIterableProducer(async (writer) => {
            // First, make sure contributed controller are active
            await raceCancellationError(this.tryActivateControllers(providersToResolve), token);
            // Then actually resolve items for all active controllers
            await Promise.all(Array.from(this._itemControllers, async ([chatSessionType, controllerEntry]) => {
                const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
                if (providersToResolve && !providersToResolve.includes(resolvedType)) {
                    return; // skip: not considered for resolving
                }
                try {
                    await raceCancellationError(controllerEntry.initialRefresh, token); // Ensure initial refresh is complete before accessing items
                    const providerSessions = controllerEntry.controller.items;
                    this._logService.trace(`[ChatSessionsService] Resolved ${providerSessions.length} sessions for provider ${resolvedType}`);
                    writer.emitOne({ chatSessionType: resolvedType, items: providerSessions });
                }
                catch (err) {
                    if (!isCancellationError(err)) {
                        // Log error but continue with other providers
                        this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
                    }
                }
            }));
        });
    }
    async refreshChatSessionItems(providersToResolve, token) {
        await this.tryActivateControllers(providersToResolve);
        await Promise.all(Array.from(this._itemControllers).map(async ([chatSessionType, controllerEntry]) => {
            const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
            if (providersToResolve && !providersToResolve.includes(resolvedType)) {
                return; // skip: not considered for resolving
            }
            try {
                await controllerEntry.controller.refresh(token);
            }
            catch (err) {
                if (!isCancellationError(err)) {
                    // Log error but continue with other providers
                    this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
                }
            }
        }));
    }
    getRegisteredChatSessionItemProviders() {
        return [...new Set(Array.from(this._itemControllers.keys()).map(key => this._resolveToPrimaryType(key) ?? key))];
    }
    registerChatSessionItemController(chatSessionType, controller) {
        const disposables = new DisposableStore();
        // Register and trigger an initial refresh to populate the provider's items
        const initialRefreshCts = disposables.add(new CancellationTokenSource());
        this._itemControllers.set(chatSessionType, { controller, initialRefresh: controller.refresh(initialRefreshCts.token) });
        this._onDidChangeItemsProviders.fire({ chatSessionType });
        disposables.add(controller.onDidChangeChatSessionItems(e => {
            this._onDidChangeSessionItems.fire(e);
            this.updateInProgressStatus(chatSessionType);
        }));
        return {
            dispose: () => {
                initialRefreshCts.cancel();
                disposables.dispose();
                const controller = this._itemControllers.get(chatSessionType);
                if (controller) {
                    this._itemControllers.delete(chatSessionType);
                    this._onDidChangeItemsProviders.fire({ chatSessionType });
                }
                // Remove any in-progress tracking for this provider since it's no longer available
                this.updateInProgressStatus(chatSessionType);
            }
        };
    }
    registerChatSessionContentProvider(chatSessionType, provider) {
        if (this._contentProviders.has(chatSessionType)) {
            throw new Error(`Content provider for ${chatSessionType} is already registered.`);
        }
        this._contentProviders.set(chatSessionType, provider);
        this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });
        return {
            dispose: () => {
                this._contentProviders.delete(chatSessionType);
                this._onDidChangeContentProviderSchemes.fire({ added: [], removed: [chatSessionType] });
                // Remove all sessions that were created by this provider
                for (const [key, session] of this._sessions) {
                    if (session.chatSessionType === chatSessionType) {
                        session.dispose();
                        this._sessions.delete(key);
                    }
                }
            }
        };
    }
    registerCustomizationsProvider(chatSessionType, provider) {
        this._customizationsProviders.set(chatSessionType, provider);
        const onChangeDisposable = provider.onDidChangeCustomizations(() => {
            this._onDidChangeCustomizations.fire({ chatSessionType });
        });
        return toDisposable(() => {
            onChangeDisposable.dispose();
            if (this._customizationsProviders.get(chatSessionType) === provider) {
                this._customizationsProviders.delete(chatSessionType);
            }
        });
    }
    hasCustomizationsProvider(chatSessionType) {
        return this._customizationsProviders.has(chatSessionType);
    }
    async getCustomizations(chatSessionType, token) {
        const provider = this._customizationsProviders.get(chatSessionType);
        if (!provider) {
            return undefined;
        }
        return provider.provideCustomizations(token);
    }
    async createNewChatSessionItem(chatSessionType, request, token) {
        const controllerData = this._itemControllers.get(chatSessionType);
        if (!controllerData) {
            return undefined;
        }
        await controllerData.initialRefresh;
        return controllerData.controller.newChatSessionItem?.(request, token);
    }
    async getOrCreateChatSession(sessionResource, token) {
        {
            const existingSessionData = this._sessions.get(sessionResource);
            if (existingSessionData) {
                return existingSessionData.session;
            }
        }
        if (!(await raceCancellationError(this.canResolveChatSession(sessionResource.scheme), token))) {
            throw Error(`Can not find provider for ${sessionResource}`);
        }
        // Check again after async provider resolution
        {
            const existingSessionData = this._sessions.get(sessionResource);
            if (existingSessionData) {
                return existingSessionData.session;
            }
        }
        const resolvedType = this._resolveToPrimaryType(sessionResource.scheme) || sessionResource.scheme;
        const provider = this._contentProviders.get(resolvedType);
        if (!provider) {
            throw Error(`Can not find provider for ${sessionResource}`);
        }
        let session;
        const newSessionOptionGroups = await this.getNewChatSessionInputState(resolvedType);
        if (isUntitledChatSession(sessionResource) && newSessionOptionGroups) {
            const options = new Map();
            for (const group of newSessionOptionGroups) {
                const selected = group.selected ?? group.items.find(item => item.default) ?? group.items[0];
                if (selected) {
                    options.set(group.id, selected);
                }
            }
            session = {
                sessionResource: sessionResource,
                onWillDispose: Event.None,
                history: [],
                options: options.size > 0 ? options : undefined,
                dispose: () => { }
            };
        }
        else {
            session = await raceCancellationError(provider.provideChatSessionContent(sessionResource, token), token);
        }
        if (session.options) {
            for (const [optionId, value] of session.options) {
                this.setSessionOption(sessionResource, optionId, value);
            }
        }
        // Make sure another session wasn't created while we were awaiting the provider
        {
            const existingSessionData = this._sessions.get(sessionResource);
            if (existingSessionData) {
                session.dispose();
                return existingSessionData.session;
            }
        }
        const sessionData = new ContributedChatSessionData(session, sessionResource.scheme, sessionResource, session.options, resource => {
            sessionData.dispose();
            this._sessions.delete(resource);
        });
        this._sessions.set(sessionResource, sessionData);
        // Make sure any listeners are aware of the new session and its options
        if (session.options) {
            this._onDidChangeSessionOptions.fire({ sessionResource, updates: session.options });
        }
        return session;
    }
    hasAnySessionOptions(sessionResource) {
        const session = this._sessions.get(this._resolveResource(sessionResource));
        return !!session && !!session.options && session.options.size > 0;
    }
    getSessionOptions(sessionResource) {
        const session = this._sessions.get(this._resolveResource(sessionResource));
        if (!session) {
            return undefined;
        }
        const result = new Map();
        for (const [key, value] of session.getAllOptions()) {
            result.set(key, typeof value === 'string' ? value : value.id);
        }
        return result.size > 0 ? result : undefined;
    }
    getSessionOption(sessionResource, optionId) {
        const session = this._sessions.get(this._resolveResource(sessionResource));
        return session?.getOption(optionId);
    }
    setSessionOption(sessionResource, optionId, value) {
        return this.updateSessionOptions(sessionResource, new Map([[optionId, value]]));
    }
    updateSessionOptions(sessionResource, updates) {
        const session = this._sessions.get(this._resolveResource(sessionResource));
        if (!session) {
            return false;
        }
        let didChange = false;
        for (const [optionId, value] of updates) {
            const existingValue = session.getOption(optionId);
            if (existingValue !== value) {
                session.setOption(optionId, value);
                didChange = true;
            }
        }
        if (didChange) {
            this._onDidChangeSessionOptions.fire({ sessionResource, updates: updates });
        }
        return didChange;
    }
    /**
     * Resolve a resource through the alias map. If the resource is a real
     * resource that has been aliased to an untitled resource, return the
     * untitled resource (the canonical key in {@link _sessions}).
     */
    _resolveResource(resource) {
        return this._resourceAliases.get(resource) ?? resource;
    }
    registerSessionResourceAlias(untitledResource, realResource) {
        this._resourceAliases.set(realResource, untitledResource);
    }
    fireSessionCommitted(original, committed) {
        this._onDidCommitSession.fire({ original, committed });
    }
    /**
     * Store option groups for a session type
     */
    setOptionGroupsForSessionType(chatSessionType, handle, optionGroups) {
        if (optionGroups) {
            this._sessionTypeOptions.set(chatSessionType, optionGroups);
        }
        else {
            this._sessionTypeOptions.delete(chatSessionType);
        }
        this._onDidChangeOptionGroups.fire(chatSessionType);
    }
    /**
     * Get available option groups for a session type
     */
    getOptionGroupsForSessionType(chatSessionType) {
        return this._sessionTypeOptions.get(chatSessionType);
    }
    async getNewChatSessionInputState(chatSessionType) {
        const controllerData = this._itemControllers.get(chatSessionType);
        if (controllerData?.controller.getNewChatSessionInputState) {
            const groups = await controllerData.controller.getNewChatSessionInputState(CancellationToken.None);
            if (groups?.length) {
                this._sessionTypeOptions.set(chatSessionType, [...groups]);
                this._onDidChangeOptionGroups.fire(chatSessionType);
            }
            return groups;
        }
        const groups = this._sessionTypeOptions.get(chatSessionType);
        if (!groups?.length) {
            return undefined;
        }
        return groups;
    }
    /**
     * Get the capabilities for a specific session type
     */
    getCapabilitiesForSessionType(chatSessionType) {
        const contribution = this._contributions.get(chatSessionType)?.contribution;
        return contribution?.capabilities;
    }
    /**
     * Get the customAgentTarget for a specific session type.
     * When set, the mode picker should show filtered custom agents matching this target.
     */
    getCustomAgentTargetForSessionType(chatSessionType) {
        const contribution = this._contributions.get(chatSessionType)?.contribution;
        return contribution?.customAgentTarget ?? Target.Undefined;
    }
    requiresCustomModelsForSessionType(chatSessionType) {
        const contribution = this._contributions.get(chatSessionType)?.contribution;
        return !!contribution?.requiresCustomModels;
    }
    supportsDelegationForSessionType(chatSessionType) {
        const contribution = this._contributions.get(chatSessionType)?.contribution;
        return contribution?.supportsDelegation !== false;
    }
    sessionSupportsFork(sessionResource) {
        const session = this._sessions.get(sessionResource)
            // Try to resolve in case an alias was used
            ?? this._sessions.get(this._resolveResource(sessionResource));
        return !!session?.session.forkSession;
    }
    async forkChatSession(sessionResource, request, token) {
        const session = this._sessions.get(sessionResource)
            // Try to resolve in case an alias was used
            ?? this._sessions.get(this._resolveResource(sessionResource));
        if (!session?.session.forkSession) {
            throw new Error(`Session ${sessionResource.toString()} does not support forking`);
        }
        return session.session.forkSession(request, token);
    }
    getContentProviderSchemes() {
        return Array.from(this._contentProviders.keys());
    }
};
ChatSessionsService = __decorate([
    __param(0, ILogService),
    __param(1, IChatAgentService),
    __param(2, IExtensionService),
    __param(3, IContextKeyService),
    __param(4, IMenuService),
    __param(5, IThemeService),
    __param(6, ILabelService)
], ChatSessionsService);
export { ChatSessionsService };
registerSingleton(IChatSessionsService, ChatSessionsService, 1 /* InstantiationType.Delayed */);
function registerNewSessionInPlaceAction(type, displayName) {
    return registerAction2(class NewChatSessionInPlaceAction extends Action2 {
        constructor() {
            super({
                id: `workbench.action.chat.openNewChatSessionInPlace.${type}`,
                title: localize2('interactiveSession.openNewChatSessionInPlace', "New {0} Session", displayName),
                category: CHAT_CATEGORY,
                f1: false,
                precondition: ChatContextKeys.enabled,
            });
        }
        // Expected args: [chatSessionPosition: 'sidebar' | 'editor']
        async run(accessor, ...args) {
            if (args.length === 0) {
                throw new BugIndicatingError('Expected chat session position argument');
            }
            const chatSessionPosition = args[0];
            if (chatSessionPosition !== ChatSessionPosition.Sidebar && chatSessionPosition !== ChatSessionPosition.Editor) {
                throw new BugIndicatingError(`Invalid chat session position argument: ${chatSessionPosition}`);
            }
            await openChatSession(accessor, { type: type, displayName: localize('chat', "Chat"), position: chatSessionPosition, replaceEditor: true });
        }
    });
}
function registerNewSessionExternalAction(type, displayName, commandId) {
    return registerAction2(class NewChatSessionExternalAction extends Action2 {
        constructor() {
            super({
                id: `workbench.action.chat.openNewChatSessionExternal.${type}`,
                title: localize2('interactiveSession.openNewChatSessionExternal', "New {0} Session", displayName),
                category: CHAT_CATEGORY,
                f1: false,
                precondition: ChatContextKeys.enabled,
            });
        }
        async run(accessor) {
            const commandService = accessor.get(ICommandService);
            await commandService.executeCommand(commandId);
        }
    });
}
export var ChatSessionPosition;
(function (ChatSessionPosition) {
    ChatSessionPosition["Editor"] = "editor";
    ChatSessionPosition["Sidebar"] = "sidebar";
})(ChatSessionPosition || (ChatSessionPosition = {}));
async function openChatSession(accessor, openOptions, chatSendOptions) {
    const viewsService = accessor.get(IViewsService);
    const chatService = accessor.get(IChatService);
    const chatSessionService = accessor.get(IChatSessionsService);
    const logService = accessor.get(ILogService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const promptsService = accessor.get(IPromptsService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    // Determine resource to open
    const resource = getResourceForNewChatSession(openOptions);
    // Open chat session
    try {
        switch (openOptions.position) {
            case ChatSessionPosition.Sidebar: {
                const view = await viewsService.openView(ChatViewId);
                if (openOptions.type === AgentSessionProviders.Local) {
                    await view.widget.clear();
                }
                else {
                    await view.loadSession(resource);
                }
                view.focus();
                break;
            }
            case ChatSessionPosition.Editor: {
                const options = {
                    override: ChatEditorInput.EditorID,
                    pinned: true,
                    title: {
                        fallback: localize('chatEditorContributionName', "{0}", openOptions.displayName),
                    }
                };
                if (openOptions.replaceEditor) {
                    // TODO: Do not rely on active editor
                    const activeEditor = editorGroupService.activeGroup.activeEditor;
                    if (!activeEditor || !(activeEditor instanceof ChatEditorInput)) {
                        throw new Error('No active chat editor to replace');
                    }
                    await editorService.replaceEditors([{ editor: activeEditor, replacement: { resource, options } }], editorGroupService.activeGroup);
                }
                else {
                    await editorService.openEditor({ resource, options });
                }
                break;
            }
            default: assertNever(openOptions.position, `Unknown chat session position: ${openOptions.position}`);
        }
    }
    catch (e) {
        logService.error(`Failed to open '${openOptions.type}' chat session with openOptions: ${JSON.stringify(openOptions)}`, e);
        return;
    }
    // Send initial prompt if provided
    if (chatSendOptions) {
        try {
            // Set initial session options on the model before sending the request,
            // so that the contributed session provider can read them.
            if (chatSendOptions.initialSessionOptions) {
                chatSessionService.updateSessionOptions(resource, normalizeSessionOptions(chatSendOptions.initialSessionOptions));
            }
            let attachedContext = chatSendOptions.attachedContext;
            const promptFile = await resolvePromptSlashCommand(chatSendOptions.prompt, promptsService, toolsService);
            if (promptFile) {
                attachedContext = [promptFile, ...(attachedContext ?? [])];
            }
            await chatService.sendRequest(resource, chatSendOptions.prompt, { agentIdSilent: openOptions.type, attachedContext });
        }
        catch (e) {
            logService.error(`Failed to send initial request to '${openOptions.type}' chat session with contextOptions: ${JSON.stringify(chatSendOptions)}`, e);
        }
    }
}
/**
 * Normalizes session options that may arrive in one of three runtime shapes
 * into a proper `ReadonlyChatSessionOptionsMap`:
 *
 * - **Map** — returned as-is.
 * - **Array** of `{optionId, value}` objects — e.g. from command arguments
 *   that bypass static type checking.
 * - **Plain record** (`Record<string, string | IChatSessionProviderOptionItem>`)
 *   — e.g. from JSON deserialization across process boundaries where a Map
 *   loses its prototype.
 */
function normalizeSessionOptions(options) {
    if (options instanceof Map) {
        return options;
    }
    if (Array.isArray(options)) {
        return new Map(options.map(o => [o.optionId, o.value]));
    }
    // Plain object fallback (e.g. from JSON deserialization)
    return ChatSessionOptionsMap.fromRecord(options);
}
/**
 * Returns the variable entry for a slash command if the prompt starts with a slash command that can be resolved to a prompt file, otherwise returns undefined.
 */
async function resolvePromptSlashCommand(prompt, promptsService, toolsService) {
    const slashMatch = prompt.match(slashReg);
    // starts with a slash command, add the corresponding prompt file to the context if it exists
    if (slashMatch) {
        // need to resolve the slash command to get the prompt file
        const slashCommand = await promptsService.resolvePromptSlashCommand(slashMatch[1], CancellationToken.None);
        if (slashCommand) {
            const parseResult = slashCommand.parsedPromptFile;
            // add the prompt file to the context
            const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
            const toolReferences = toolsService.toToolReferences(refs);
            return toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true, toolReferences);
        }
    }
    return undefined;
}
export function getResourceForNewChatSession(options) {
    const isRemoteSession = options.type !== AgentSessionProviders.Local;
    if (isRemoteSession) {
        return URI.from({
            scheme: options.type,
            path: `/untitled-${generateUuid()}`,
        });
    }
    const isEditorPosition = options.position === ChatSessionPosition.Editor;
    if (isEditorPosition) {
        return ChatEditorInput.getNewEditorUri();
    }
    return LocalChatSessionUri.getNewSessionUri();
}
function isAgentSessionProviderType(type) {
    return Object.values(AgentSessionProviders).includes(type);
}
export function getSessionStatusForModel(model) {
    if (model.requestInProgress.get()) {
        return 2 /* ChatSessionStatus.InProgress */;
    }
    const lastRequest = model.getRequests().at(-1);
    if (lastRequest?.response) {
        if (lastRequest.response.state === 4 /* ResponseModelState.NeedsInput */) {
            return 3 /* ChatSessionStatus.NeedsInput */;
        }
        else if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails?.code === 'canceled') {
            return 1 /* ChatSessionStatus.Completed */;
        }
        else if (lastRequest.response.result?.errorDetails) {
            return 0 /* ChatSessionStatus.Failed */;
        }
        else if (lastRequest.response.isComplete) {
            return 1 /* ChatSessionStatus.Completed */;
        }
        else {
            return 2 /* ChatSessionStatus.InProgress */;
        }
    }
    return undefined;
}
export function chatResponseStateToSessionStatus(state) {
    switch (state) {
        case 2 /* ResponseModelState.Cancelled */:
        case 1 /* ResponseModelState.Complete */:
            return 1 /* ChatSessionStatus.Completed */;
        case 3 /* ResponseModelState.Failed */:
            return 0 /* ChatSessionStatus.Failed */;
        case 0 /* ResponseModelState.Pending */:
            return 2 /* ChatSessionStatus.InProgress */;
        case 4 /* ResponseModelState.NeedsInput */:
            return 3 /* ChatSessionStatus.NeedsInput */;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BKLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sS0FBSyxTQUFTLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFD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