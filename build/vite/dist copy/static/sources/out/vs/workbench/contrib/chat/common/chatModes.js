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
var ChatModeService_1;
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isUriComponents, URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IChatAgentService } from './participants/chatAgents.js';
import { ChatContextKeys } from './actions/chatContextKeys.js';
import { ChatConfiguration, ChatModeKind } from './constants.js';
import { IPromptsService, isCustomAgentVisibility, PromptsStorage } from './promptSyntax/service/promptsService.js';
import { PromptFileSource, Target } from './promptSyntax/promptTypes.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { isString } from '../../../../base/common/types.js';
import { isTarget } from './promptSyntax/languageProviders/promptFileAttributes.js';
export const IChatModeService = createDecorator('chatModeService');
let ChatModeService = class ChatModeService extends Disposable {
    static { ChatModeService_1 = this; }
    static { this.CUSTOM_MODES_STORAGE_KEY = 'chat.customModes'; }
    constructor(promptsService, chatAgentService, contextKeyService, logService, storageService, configurationService) {
        super();
        this.promptsService = promptsService;
        this.chatAgentService = chatAgentService;
        this.logService = logService;
        this.storageService = storageService;
        this.configurationService = configurationService;
        this._customModeInstances = new Map();
        this._onDidChangeChatModes = this._register(new Emitter());
        this.onDidChangeChatModes = this._onDidChangeChatModes.event;
        this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);
        this.agentModeDisabledByPolicy = ChatContextKeys.Modes.agentModeDisabledByPolicy.bindTo(contextKeyService);
        // Initialize the policy context key
        this.updateAgentModePolicyContextKey();
        // Load cached modes from storage first
        this.loadCachedModes();
        void this.refreshCustomPromptModes(true);
        this._register(this.promptsService.onDidChangeCustomAgents(() => {
            void this.refreshCustomPromptModes(true);
        }));
        this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));
        // Listen for configuration changes that affect agent mode policy
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
                this.updateAgentModePolicyContextKey();
                this._onDidChangeChatModes.fire();
            }
        }));
        // Ideally we can get rid of the setting to disable agent mode?
        let didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
        this._register(this.chatAgentService.onDidChangeAgents(() => {
            if (didHaveToolsAgent !== this.chatAgentService.hasToolsAgent) {
                didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
                this._onDidChangeChatModes.fire();
            }
        }));
    }
    loadCachedModes() {
        try {
            const cachedCustomModes = this.storageService.getObject(ChatModeService_1.CUSTOM_MODES_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
            if (cachedCustomModes) {
                this.deserializeCachedModes(cachedCustomModes);
            }
        }
        catch (error) {
            this.logService.error(error, 'Failed to load cached custom agents');
        }
    }
    deserializeCachedModes(cachedCustomModes) {
        if (!Array.isArray(cachedCustomModes)) {
            this.logService.error('Invalid cached custom modes data: expected array');
            return;
        }
        for (const cachedMode of cachedCustomModes) {
            if (isCachedChatModeData(cachedMode) && cachedMode.uri) {
                try {
                    const visibility = cachedMode.visibility ?? { userInvocable: true, agentInvocable: cachedMode.infer !== false };
                    if (!visibility.userInvocable) {
                        continue;
                    }
                    const uri = URI.revive(cachedMode.uri);
                    const customChatMode = {
                        uri,
                        name: cachedMode.name,
                        description: cachedMode.description,
                        tools: cachedMode.customTools,
                        model: isString(cachedMode.model) ? [cachedMode.model] : cachedMode.model,
                        argumentHint: cachedMode.argumentHint,
                        agentInstructions: cachedMode.modeInstructions ?? { content: cachedMode.body ?? '', toolReferences: [] },
                        handOffs: cachedMode.handOffs,
                        target: cachedMode.target ?? Target.Undefined,
                        visibility,
                        agents: cachedMode.agents,
                        source: reviveChatModeSource(cachedMode.source) ?? { storage: PromptsStorage.local }
                    };
                    const instance = new CustomChatMode(customChatMode);
                    this._customModeInstances.set(uri.toString(), instance);
                }
                catch (error) {
                    this.logService.error(error, 'Failed to revive cached custom agent');
                }
            }
        }
        this.hasCustomModes.set(this._customModeInstances.size > 0);
    }
    saveCachedModes() {
        try {
            const modesToCache = Array.from(this._customModeInstances.values());
            this.storageService.store(ChatModeService_1.CUSTOM_MODES_STORAGE_KEY, modesToCache, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        catch (error) {
            this.logService.warn('Failed to save cached custom agents', error);
        }
    }
    async refreshCustomPromptModes(fireChangeEvent) {
        try {
            const customModes = await this.promptsService.getCustomAgents(CancellationToken.None);
            // Create a new set of mode instances, reusing existing ones where possible
            const seenUris = new Set();
            for (const customMode of customModes) {
                if (!customMode.visibility.userInvocable) {
                    continue;
                }
                const uriString = customMode.uri.toString();
                seenUris.add(uriString);
                let modeInstance = this._customModeInstances.get(uriString);
                if (modeInstance) {
                    // Update existing instance with new data
                    modeInstance.updateData(customMode);
                }
                else {
                    // Create new instance
                    modeInstance = new CustomChatMode(customMode);
                    this._customModeInstances.set(uriString, modeInstance);
                }
            }
            // Clean up instances for modes that no longer exist
            for (const [uriString] of this._customModeInstances.entries()) {
                if (!seenUris.has(uriString)) {
                    this._customModeInstances.delete(uriString);
                }
            }
            this.hasCustomModes.set(this._customModeInstances.size > 0);
        }
        catch (error) {
            this.logService.error(error, 'Failed to load custom agents');
            this._customModeInstances.clear();
            this.hasCustomModes.set(false);
        }
        if (fireChangeEvent) {
            this._onDidChangeChatModes.fire();
        }
    }
    getModes() {
        return {
            builtin: this.getBuiltinModes(),
            custom: this.getCustomModes(),
        };
    }
    findModeById(id) {
        return this.getBuiltinModes().find(mode => mode.id === id) ?? this._customModeInstances.get(id);
    }
    findModeByName(name) {
        return this.getBuiltinModes().find(mode => mode.name.get() === name) ?? this.getCustomModes().find(mode => mode.name.get() === name);
    }
    getBuiltinModes() {
        const builtinModes = [
            ChatMode.Ask,
        ];
        // Include Agent mode if:
        // - It's enabled (hasToolsAgent is true), OR
        // - It's disabled by policy (so we can show it with a lock icon)
        // But hide it if the user manually disabled it via settings
        if (this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy()) {
            builtinModes.unshift(ChatMode.Agent);
        }
        builtinModes.push(ChatMode.Edit);
        return builtinModes;
    }
    getCustomModes() {
        // Show custom modes when agent mode is enabled OR when disabled by policy (to show them in the policy-managed group)
        return this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy() ? Array.from(this._customModeInstances.values()) : [];
    }
    updateAgentModePolicyContextKey() {
        this.agentModeDisabledByPolicy.set(this.isAgentModeDisabledByPolicy());
    }
    isAgentModeDisabledByPolicy() {
        return this.configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
    }
};
ChatModeService = ChatModeService_1 = __decorate([
    __param(0, IPromptsService),
    __param(1, IChatAgentService),
    __param(2, IContextKeyService),
    __param(3, ILogService),
    __param(4, IStorageService),
    __param(5, IConfigurationService)
], ChatModeService);
export { ChatModeService };
function isCachedChatModeData(data) {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const mode = data;
    return typeof mode.id === 'string' &&
        typeof mode.name === 'string' &&
        typeof mode.kind === 'string' &&
        (mode.description === undefined || typeof mode.description === 'string') &&
        (mode.customTools === undefined || Array.isArray(mode.customTools)) &&
        (mode.modeInstructions === undefined || (typeof mode.modeInstructions === 'object' && mode.modeInstructions !== null)) &&
        (mode.model === undefined || typeof mode.model === 'string' || Array.isArray(mode.model)) &&
        (mode.argumentHint === undefined || typeof mode.argumentHint === 'string') &&
        (mode.handOffs === undefined || Array.isArray(mode.handOffs)) &&
        (mode.uri === undefined || (typeof mode.uri === 'object' && mode.uri !== null)) &&
        (mode.source === undefined || isChatModeSourceData(mode.source)) &&
        (mode.target === undefined || isTarget(mode.target)) &&
        (mode.visibility === undefined || isCustomAgentVisibility(mode.visibility)) &&
        (mode.agents === undefined || Array.isArray(mode.agents));
}
export class CustomChatMode {
    get name() {
        return this._nameObservable;
    }
    get description() {
        return this._descriptionObservable;
    }
    get icon() {
        return constObservable(undefined);
    }
    get isBuiltin() {
        return isBuiltinChatMode(this);
    }
    get customTools() {
        return this._customToolsObservable;
    }
    get model() {
        return this._modelObservable;
    }
    get argumentHint() {
        return this._argumentHintObservable;
    }
    get modeInstructions() {
        return this._modeInstructions;
    }
    get uri() {
        return this._uriObservable;
    }
    get label() {
        return this.name;
    }
    get handOffs() {
        return this._handoffsObservable;
    }
    get source() {
        return this._source;
    }
    get target() {
        return this._targetObservable;
    }
    get visibility() {
        return this._visibilityObservable;
    }
    get agents() {
        return this._agentsObservable;
    }
    constructor(customChatMode) {
        this.kind = ChatModeKind.Agent;
        this.id = customChatMode.uri.toString();
        this._nameObservable = observableValue('name', customChatMode.name);
        this._descriptionObservable = observableValue('description', customChatMode.description);
        this._customToolsObservable = observableValue('customTools', customChatMode.tools);
        this._modelObservable = observableValue('model', customChatMode.model);
        this._argumentHintObservable = observableValue('argumentHint', customChatMode.argumentHint);
        this._handoffsObservable = observableValue('handOffs', customChatMode.handOffs);
        this._targetObservable = observableValue('target', customChatMode.target);
        this._visibilityObservable = observableValue('visibility', customChatMode.visibility);
        this._agentsObservable = observableValue('agents', customChatMode.agents);
        this._modeInstructions = observableValue('_modeInstructions', customChatMode.agentInstructions);
        this._uriObservable = observableValue('uri', customChatMode.uri);
        this._source = customChatMode.source;
    }
    /**
     * Updates the underlying data and triggers observable changes
     */
    updateData(newData) {
        transaction(tx => {
            this._nameObservable.set(newData.name, tx);
            this._descriptionObservable.set(newData.description, tx);
            this._customToolsObservable.set(newData.tools, tx);
            this._modelObservable.set(newData.model, tx);
            this._argumentHintObservable.set(newData.argumentHint, tx);
            this._handoffsObservable.set(newData.handOffs, tx);
            this._targetObservable.set(newData.target, tx);
            this._visibilityObservable.set(newData.visibility, tx);
            this._agentsObservable.set(newData.agents, tx);
            this._modeInstructions.set(newData.agentInstructions, tx);
            this._uriObservable.set(newData.uri, tx);
            this._source = newData.source;
        });
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name.get(),
            description: this.description.get(),
            kind: this.kind,
            customTools: this.customTools.get(),
            model: this.model.get(),
            argumentHint: this.argumentHint.get(),
            modeInstructions: this.modeInstructions.get(),
            uri: this.uri.get(),
            handOffs: this.handOffs.get(),
            source: serializeChatModeSource(this._source),
            target: this.target.get(),
            visibility: this.visibility.get(),
            agents: this.agents.get()
        };
    }
}
function isChatModeSourceData(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const data = value;
    if (data.storage === PromptsStorage.extension) {
        return typeof data.extensionId === 'string';
    }
    if (data.storage === PromptsStorage.plugin) {
        return isUriComponents(data.pluginUri);
    }
    return data.storage === PromptsStorage.local || data.storage === PromptsStorage.user;
}
function serializeChatModeSource(source) {
    if (!source) {
        return undefined;
    }
    if (source.storage === PromptsStorage.extension) {
        return { storage: PromptsStorage.extension, extensionId: source.extensionId.value, type: source.type };
    }
    if (source.storage === PromptsStorage.plugin) {
        return { storage: PromptsStorage.plugin, pluginUri: source.pluginUri };
    }
    return { storage: source.storage };
}
function reviveChatModeSource(data) {
    if (!data) {
        return undefined;
    }
    if (data.storage === PromptsStorage.extension) {
        // Migrate old ExtensionAgentSourceType values ('contribution'/'provider') to PromptFileSource values
        let type;
        if (data.type === 'provider' /* old type value */ || data.type === PromptFileSource.ExtensionAPI) {
            type = PromptFileSource.ExtensionAPI;
        }
        else {
            type = PromptFileSource.ExtensionContribution;
        }
        return { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(data.extensionId), type };
    }
    if (data.storage === PromptsStorage.plugin) {
        return { storage: PromptsStorage.plugin, pluginUri: URI.revive(data.pluginUri) };
    }
    return { storage: data.storage };
}
export class BuiltinChatMode {
    constructor(kind, label, description, icon) {
        this.kind = kind;
        this.name = constObservable(kind);
        this.label = constObservable(label);
        this.description = observableValue('description', description);
        this.icon = constObservable(icon);
        this.target = constObservable(Target.Undefined);
    }
    get isBuiltin() {
        return isBuiltinChatMode(this);
    }
    get id() {
        // Need a differentiator?
        return this.kind;
    }
    /**
     * Getters are not json-stringified
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name.get(),
            description: this.description.get(),
            kind: this.kind
        };
    }
}
export var ChatMode;
(function (ChatMode) {
    ChatMode.Ask = new BuiltinChatMode(ChatModeKind.Ask, 'Ask', localize('chatDescription', "Explore and understand your code"), Codicon.question);
    ChatMode.Edit = new BuiltinChatMode(ChatModeKind.Edit, 'Edit', localize('editsDescription', "Edit or refactor selected code"), Codicon.edit);
    ChatMode.Agent = new BuiltinChatMode(ChatModeKind.Agent, 'Agent', localize('agentDescription', "Describe what to build"), Codicon.agent);
})(ChatMode || (ChatMode = {}));
export function isBuiltinChatMode(mode) {
    return mode.id === ChatMode.Ask.id ||
        mode.id === ChatMode.Edit.id ||
        mode.id === ChatMode.Agent.id;
}
/**
 * Returns a telemetry-safe mode name. User/local mode names are hashed
 * to avoid leaking PII; builtin and extension mode names are returned as-is.
 */
export function getModeNameForTelemetry(mode) {
    const modeStorage = mode.source?.storage;
    if (modeStorage === PromptsStorage.local || modeStorage === PromptsStorage.user) {
        return String(hash(mode.name.get()));
    }
    return mode.name.get();
}
/**
 * Generates a stable identifier for a handoff by combining the target agent
 * name with a slugified version of the display label.
 *
 * Within a single source agent, the combination of `agent` + `label` must be
 * unique for IDs to be unambiguous.
 *
 * @example
 * ```
 * getHandoffId({ agent: 'agent', label: 'Continue', prompt: '...' })
 * // => 'agent:continue'
 * ```
 */
export function getHandoffId(handoff) {
    const slug = handoff.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${handoff.agent}:${slug}`;
}
/**
 * Builds an array of {@link ICustomAgentInfo} with handoff metadata for the given agents/modes.
 *
 * @param modes - The set of agents/modes to include. Pass all modes to get a
 *   complete picture, or a filtered subset to scope the result.
 * @returns One entry per agent/mode, each containing the agent's metadata and
 *   its declared handoffs.
 */
export function buildCustomAgentHandoffsInfo(modes) {
    return modes.map(mode => {
        const handoffs = mode.handOffs?.get() ?? [];
        const visibility = mode.visibility?.get();
        return {
            id: mode.id,
            name: mode.name.get(),
            isBuiltin: mode.isBuiltin,
            visibility: {
                userInvocable: visibility?.userInvocable ?? true,
                agentInvocable: visibility?.agentInvocable ?? true,
            },
            handoffs: handoffs.map(h => ({
                id: getHandoffId(h),
                label: h.label,
                agent: h.agent,
                prompt: h.prompt,
                ...(h.send !== undefined ? { send: h.send } : {}),
                ...(h.showContinueOn !== undefined ? { showContinueOn: h.showContinueOn } : {}),
                ...(h.model !== undefined ? { model: h.model } : {}),
            })),
        };
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdE1vZGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQW9DLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4SSxPQUFPLEVBQUUsZUFBZSxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUVq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