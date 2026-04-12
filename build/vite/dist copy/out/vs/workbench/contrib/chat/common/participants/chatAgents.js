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
import { findLast } from '../../../../../base/common/arraysFind.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../constants.js';
import { ILanguageModelsService } from '../languageModels.js';
import { ChatPerfMark, markChat } from '../chatPerf.js';
export const IChatAgentService = createDecorator('chatAgentService');
let ChatAgentService = class ChatAgentService extends Disposable {
    static { this.AGENT_LEADER = '@'; }
    constructor(contextKeyService, configurationService) {
        super();
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this._agents = new Map();
        this._onDidChangeAgents = this._register(new Emitter());
        this.onDidChangeAgents = this._onDidChangeAgents.event;
        this._onWillInvokeAgent = this._register(new Emitter());
        this.onWillInvokeAgent = this._onWillInvokeAgent.event;
        this._agentsContextKeys = new Set();
        this._hasToolsAgent = false;
        this._chatParticipantDetectionProviders = new Map();
        this._agentCompletionProviders = new Map();
        this._hasDefaultAgent = ChatContextKeys.enabled.bindTo(this.contextKeyService);
        this._extensionAgentRegistered = ChatContextKeys.extensionParticipantRegistered.bindTo(this.contextKeyService);
        this._defaultAgentRegistered = ChatContextKeys.panelParticipantRegistered.bindTo(this.contextKeyService);
        this._register(contextKeyService.onDidChangeContext((e) => {
            if (e.affectsSome(this._agentsContextKeys)) {
                this._updateContextKeys();
            }
        }));
    }
    registerAgent(id, data) {
        const existingAgent = this.getAgent(id);
        if (existingAgent) {
            throw new Error(`Agent already registered: ${JSON.stringify(id)}`);
        }
        const that = this;
        const commands = data.slashCommands;
        data = {
            ...data,
            get slashCommands() {
                return commands.filter(c => !c.when || that.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(c.when)));
            }
        };
        const entry = { data };
        this._agents.set(id, entry);
        this._updateAgentsContextKeys();
        this._updateContextKeys();
        this._onDidChangeAgents.fire(undefined);
        return toDisposable(() => {
            this._agents.delete(id);
            this._updateAgentsContextKeys();
            this._updateContextKeys();
            this._onDidChangeAgents.fire(undefined);
        });
    }
    _updateAgentsContextKeys() {
        // Update the set of context keys used by all agents
        this._agentsContextKeys.clear();
        for (const agent of this._agents.values()) {
            if (agent.data.when) {
                const expr = ContextKeyExpr.deserialize(agent.data.when);
                for (const key of expr?.keys() || []) {
                    this._agentsContextKeys.add(key);
                }
            }
        }
    }
    _updateContextKeys() {
        let extensionAgentRegistered = false;
        let defaultAgentRegistered = false;
        let toolsAgentRegistered = false;
        for (const agent of this.getAgents()) {
            if (agent.isDefault) {
                if (!agent.isCore) {
                    extensionAgentRegistered = true;
                }
                if (agent.id === 'chat.setup' || agent.id === 'github.copilot.editsAgent') {
                    // TODO@roblourens firing the event below probably isn't necessary but leave it alone for now
                    toolsAgentRegistered = true;
                }
                else {
                    defaultAgentRegistered = true;
                }
            }
        }
        this._defaultAgentRegistered.set(defaultAgentRegistered);
        this._extensionAgentRegistered.set(extensionAgentRegistered);
        if (toolsAgentRegistered !== this._hasToolsAgent) {
            this._hasToolsAgent = toolsAgentRegistered;
            this._onDidChangeAgents.fire(this.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent));
        }
    }
    registerAgentImplementation(id, agentImpl) {
        const entry = this._agents.get(id);
        if (!entry) {
            throw new Error(`Unknown agent: ${JSON.stringify(id)}`);
        }
        if (entry.impl) {
            throw new Error(`Agent already has implementation: ${JSON.stringify(id)}`);
        }
        if (entry.data.isDefault) {
            this._hasDefaultAgent.set(true);
        }
        entry.impl = agentImpl;
        this._onDidChangeAgents.fire(new MergedChatAgent(entry.data, agentImpl));
        return toDisposable(() => {
            entry.impl = undefined;
            this._onDidChangeAgents.fire(undefined);
            if (entry.data.isDefault) {
                this._hasDefaultAgent.set(Iterable.some(this._agents.values(), agent => agent.data.isDefault && !!agent.impl));
            }
        });
    }
    registerDynamicAgent(data, agentImpl) {
        data.isDynamic = true;
        const agent = { data, impl: agentImpl };
        this._agents.set(data.id, agent);
        this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));
        return toDisposable(() => {
            this._agents.delete(data.id);
            this._onDidChangeAgents.fire(undefined);
        });
    }
    registerAgentCompletionProvider(id, provider) {
        this._agentCompletionProviders.set(id, provider);
        return {
            dispose: () => { this._agentCompletionProviders.delete(id); }
        };
    }
    async getAgentCompletionItems(id, query, token) {
        return await this._agentCompletionProviders.get(id)?.(query, token) ?? [];
    }
    updateAgent(id, updateMetadata) {
        const agent = this._agents.get(id);
        if (!agent?.impl) {
            throw new Error(`No activated agent with id ${JSON.stringify(id)} registered`);
        }
        agent.data.metadata = { ...agent.data.metadata, ...updateMetadata };
        this._onDidChangeAgents.fire(new MergedChatAgent(agent.data, agent.impl));
    }
    getDefaultAgent(location, mode = ChatModeKind.Ask) {
        return this._preferExtensionAgent(this.getActivatedAgents().filter(a => {
            if (mode && !a.modes.includes(mode)) {
                return false;
            }
            return !!a.isDefault && a.locations.includes(location);
        }));
    }
    get hasToolsAgent() {
        // The chat participant enablement is just based on this setting. Don't wait for the extension to be loaded.
        return !!this.configurationService.getValue(ChatConfiguration.AgentEnabled);
    }
    getContributedDefaultAgent(location) {
        return this._preferExtensionAgent(this.getAgents().filter(a => !!a.isDefault && a.locations.includes(location)));
    }
    _preferExtensionAgent(agents) {
        // We potentially have multiple agents on the same location,
        // contributed from core and from extensions.
        // This method will prefer the last extensions provided agent
        // falling back to the last core agent if no extension agent is found.
        return findLast(agents, agent => !agent.isCore) ?? agents.at(-1);
    }
    getAgent(id, includeDisabled = false) {
        if (!this._agentIsEnabled(id) && !includeDisabled) {
            return;
        }
        return this._agents.get(id)?.data;
    }
    _agentIsEnabled(idOrAgent) {
        const entry = typeof idOrAgent === 'string' ? this._agents.get(idOrAgent) : idOrAgent;
        return !entry?.data.when || this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(entry.data.when));
    }
    getAgentByFullyQualifiedId(id) {
        const agent = Iterable.find(this._agents.values(), a => getFullyQualifiedId(a.data) === id)?.data;
        if (agent && !this._agentIsEnabled(agent.id)) {
            return;
        }
        return agent;
    }
    /**
     * Returns all agent datas that exist- static registered and dynamic ones.
     */
    getAgents() {
        return Array.from(this._agents.values())
            .map(entry => entry.data)
            .filter(a => this._agentIsEnabled(a.id));
    }
    getActivatedAgents() {
        return Array.from(this._agents.values())
            .filter(a => !!a.impl)
            .filter(a => this._agentIsEnabled(a.data.id))
            .map(a => new MergedChatAgent(a.data, a.impl));
    }
    getAgentsByName(name) {
        return this._preferExtensionAgents(this.getAgents().filter(a => a.name === name));
    }
    _preferExtensionAgents(agents) {
        // We potentially have multiple agents on the same location,
        // contributed from core and from extensions.
        // This method will prefer the extensions provided agents
        // falling back to the original agents array extension agent is found.
        const extensionAgents = agents.filter(a => !a.isCore);
        return extensionAgents.length > 0 ? extensionAgents : agents;
    }
    agentHasDupeName(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            return false;
        }
        return this.getAgentsByName(agent.name)
            .filter(a => a.extensionId.value !== agent.extensionId.value).length > 0;
    }
    async invokeAgent(id, request, progress, history, token) {
        markChat(request.sessionResource, ChatPerfMark.AgentWillInvoke);
        const data = this._agents.get(id);
        if (!data?.impl) {
            throw new Error(`No activated agent with id "${id}"`);
        }
        this._onWillInvokeAgent.fire({ agentId: id, request });
        const result = await data.impl.invoke(request, progress, history, token);
        markChat(request.sessionResource, ChatPerfMark.AgentDidInvoke);
        return result;
    }
    setRequestTools(id, requestId, tools) {
        const data = this._agents.get(id);
        if (!data?.impl) {
            throw new Error(`No activated agent with id "${id}"`);
        }
        data.impl.setRequestTools?.(requestId, tools);
    }
    setYieldRequested(id, requestId, value) {
        const data = this._agents.get(id);
        if (!data?.impl) {
            return;
        }
        data.impl.setYieldRequested?.(requestId, value);
    }
    async getFollowups(id, request, result, history, token) {
        const data = this._agents.get(id);
        if (!data?.impl?.provideFollowups) {
            return [];
        }
        return data.impl.provideFollowups(request, result, history, token);
    }
    async getChatTitle(id, history, token) {
        const data = this._agents.get(id);
        if (!data?.impl?.provideChatTitle) {
            return undefined;
        }
        return data.impl.provideChatTitle(history, token);
    }
    async getChatSummary(id, history, token) {
        const data = this._agents.get(id);
        if (!data?.impl?.provideChatSummary) {
            return undefined;
        }
        return data.impl.provideChatSummary(history, token);
    }
    registerChatParticipantDetectionProvider(handle, provider) {
        this._chatParticipantDetectionProviders.set(handle, provider);
        return toDisposable(() => {
            this._chatParticipantDetectionProviders.delete(handle);
        });
    }
    hasChatParticipantDetectionProviders() {
        return this._chatParticipantDetectionProviders.size > 0;
    }
    async detectAgentOrCommand(request, history, options, token) {
        // TODO@joyceerhl should we have a selector to be able to narrow down which provider to use
        const provider = Iterable.first(this._chatParticipantDetectionProviders.values());
        if (!provider) {
            return;
        }
        const participants = this.getAgents().reduce((acc, a) => {
            if (a.locations.includes(options.location)) {
                acc.push({ participant: a.id, disambiguation: a.disambiguation ?? [] });
                for (const command of a.slashCommands) {
                    acc.push({ participant: a.id, command: command.name, disambiguation: command.disambiguation ?? [] });
                }
            }
            return acc;
        }, []);
        const result = await provider.provideParticipantDetection(request, history, { ...options, participants }, token);
        if (!result) {
            return;
        }
        const agent = this.getAgent(result.participant);
        if (!agent) {
            // Couldn't find a participant matching the participant detection result
            return;
        }
        if (!result.command) {
            return { agent };
        }
        const command = agent?.slashCommands.find(c => c.name === result.command);
        if (!command) {
            // Couldn't find a slash command matching the participant detection result
            return;
        }
        return { agent, command };
    }
};
ChatAgentService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IConfigurationService)
], ChatAgentService);
export { ChatAgentService };
export class MergedChatAgent {
    constructor(data, impl) {
        this.data = data;
        this.impl = impl;
    }
    get id() { return this.data.id; }
    get name() { return this.data.name ?? ''; }
    get fullName() { return this.data.fullName ?? ''; }
    get description() { return this.data.description ?? ''; }
    get extensionId() { return this.data.extensionId; }
    get extensionVersion() { return this.data.extensionVersion; }
    get extensionPublisherId() { return this.data.extensionPublisherId; }
    get extensionPublisherDisplayName() { return this.data.publisherDisplayName; }
    get extensionDisplayName() { return this.data.extensionDisplayName; }
    get isDefault() { return this.data.isDefault; }
    get isCore() { return this.data.isCore; }
    get metadata() { return this.data.metadata; }
    get slashCommands() { return this.data.slashCommands; }
    get locations() { return this.data.locations; }
    get modes() { return this.data.modes; }
    get disambiguation() { return this.data.disambiguation; }
    async invoke(request, progress, history, token) {
        return this.impl.invoke(request, progress, history, token);
    }
    setRequestTools(requestId, tools) {
        this.impl.setRequestTools?.(requestId, tools);
    }
    setYieldRequested(requestId, value) {
        this.impl.setYieldRequested?.(requestId, value);
    }
    async provideFollowups(request, result, history, token) {
        if (this.impl.provideFollowups) {
            return this.impl.provideFollowups(request, result, history, token);
        }
        return [];
    }
    toJSON() {
        return this.data;
    }
}
export const IChatAgentNameService = createDecorator('chatAgentNameService');
let ChatAgentNameService = class ChatAgentNameService {
    constructor(languageModelsService) {
        this.languageModelsService = languageModelsService;
    }
    /**
     * Returns true if the agent is allowed to use this name
     */
    getAgentNameRestriction(chatAgentData) {
        if (chatAgentData.isCore) {
            return true; // core agents are always allowed to use any name
        }
        // TODO would like to use observables here but nothing uses it downstream and I'm not sure how to combine these two
        const nameAllowed = this.checkAgentNameRestriction(chatAgentData.name, chatAgentData).get();
        const fullNameAllowed = !chatAgentData.fullName || this.checkAgentNameRestriction(chatAgentData.fullName.replace(/\s/g, ''), chatAgentData).get();
        return nameAllowed && fullNameAllowed;
    }
    checkAgentNameRestriction(name, chatAgentData) {
        // Registry is a map of name to an array of extension publisher IDs or extension IDs that are allowed to use it.
        // Look up the list of extensions that are allowed to use this name
        const allowList = this.languageModelsService.restrictedChatParticipants.map(registry => registry[name.toLowerCase()]);
        return allowList.map(allowList => {
            if (!allowList) {
                return true;
            }
            return allowList.some(id => equalsIgnoreCase(id, id.includes('.') ? chatAgentData.extensionId.value : chatAgentData.extensionPublisherId));
        });
    }
};
ChatAgentNameService = __decorate([
    __param(0, ILanguageModelsService)
], ChatAgentNameService);
export { ChatAgentNameService };
export function getFullyQualifiedId(chatAgentData) {
    return `${chatAgentData.extensionId.value}.${chatAgentData.id}`;
}
function isSerializableChatAgentData(obj) {
    return obj.name !== undefined;
}
export function reviveSerializedAgent(raw) {
    const normalized = isSerializableChatAgentData(raw) ?
        raw :
        {
            ...raw,
            name: raw.id,
        };
    // Fill in required fields that may be missing from old data
    if (!normalized.extensionPublisherId) {
        normalized.extensionPublisherId = raw.extensionPublisher ?? '';
    }
    if (!normalized.extensionDisplayName) {
        normalized.extensionDisplayName = '';
    }
    if (!normalized.extensionId) {
        normalized.extensionId = new ExtensionIdentifier('');
    }
    return revive(normalized);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFnZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUdwRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEcsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLDJDQUEyQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSXpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBS2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQXVCLE1BQU0saUJBQWlCLENBQUM7QUFDMUcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUQsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQW9MeEQsTUFBTSxDQUFDLE1BQU0s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