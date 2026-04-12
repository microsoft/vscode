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
import { asArray } from '../../../../base/common/arrays.js';
import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { Sequencer } from '../../../../base/common/async.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getConfigValueInTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { mcpServerSamplingSection } from './mcpConfiguration.js';
import { McpSamplingLog } from './mcpSamplingLog.js';
import { McpError } from './mcpTypes.js';
var ModelMatch;
(function (ModelMatch) {
    ModelMatch[ModelMatch["UnsureAllowedDuringChat"] = 0] = "UnsureAllowedDuringChat";
    ModelMatch[ModelMatch["UnsureAllowedOutsideChat"] = 1] = "UnsureAllowedOutsideChat";
    ModelMatch[ModelMatch["NotAllowed"] = 2] = "NotAllowed";
    ModelMatch[ModelMatch["NoMatchingModel"] = 3] = "NoMatchingModel";
})(ModelMatch || (ModelMatch = {}));
let McpSamplingService = class McpSamplingService extends Disposable {
    constructor(_languageModelsService, _configurationService, _dialogService, _notificationService, _commandService, instaService) {
        super();
        this._languageModelsService = _languageModelsService;
        this._configurationService = _configurationService;
        this._dialogService = _dialogService;
        this._notificationService = _notificationService;
        this._commandService = _commandService;
        this._sessionSets = {
            allowedDuringChat: new Map(),
            allowedOutsideChat: new Map(),
        };
        this._modelSequencer = new Sequencer();
        this._logs = this._register(instaService.createInstance(McpSamplingLog));
    }
    async sample(opts, token = CancellationToken.None) {
        const messages = opts.params.messages.map((message) => {
            const content = asArray(message.content).map((part) => part.type === 'text'
                ? { type: 'text', value: part.text }
                : part.type === 'image' || part.type === 'audio'
                    ? { type: 'image_url', value: { mimeType: part.mimeType, data: decodeBase64(part.data) } }
                    : undefined).filter(isDefined);
            if (!content.length) {
                return undefined;
            }
            return {
                role: message.role === 'assistant' ? 2 /* ChatMessageRole.Assistant */ : 1 /* ChatMessageRole.User */,
                content,
            };
        }).filter(isDefined);
        if (opts.params.systemPrompt) {
            messages.unshift({ role: 0 /* ChatMessageRole.System */, content: [{ type: 'text', value: opts.params.systemPrompt }] });
        }
        const model = await this._modelSequencer.queue(() => this._getMatchingModel(opts));
        const response = await this._languageModelsService.sendChatRequest(model, undefined, messages, {}, token);
        let responseText = '';
        // MCP doesn't have a notion of a multi-part sampling response, so we only preserve text
        // Ref https://github.com/modelcontextprotocol/modelcontextprotocol/issues/91
        const streaming = (async () => {
            for await (const part of response.stream) {
                if (Array.isArray(part)) {
                    for (const p of part) {
                        if (p.type === 'text') {
                            responseText += p.value;
                        }
                    }
                }
                else if (part.type === 'text') {
                    responseText += part.value;
                }
            }
        })();
        try {
            await Promise.all([response.result, streaming]);
            this._logs.add(opts.server, opts.params.messages, responseText, model);
            return {
                sample: {
                    model,
                    content: { type: 'text', text: responseText },
                    role: 'assistant', // it came from the model!
                },
            };
        }
        catch (err) {
            throw McpError.unknown(err);
        }
    }
    hasLogs(server) {
        return this._logs.has(server);
    }
    getLogText(server) {
        return this._logs.getAsText(server);
    }
    async _getMatchingModel(opts) {
        const model = await this._getMatchingModelInner(opts.server, opts.isDuringToolCall, opts.params.modelPreferences);
        const globalAutoApprove = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
        if (model === 0 /* ModelMatch.UnsureAllowedDuringChat */) {
            // In YOLO mode, auto-approve MCP sampling requests without prompting
            if (globalAutoApprove) {
                this._sessionSets.allowedDuringChat.set(opts.server.definition.id, true);
                return this._getMatchingModel(opts);
            }
            const retry = await this._showContextual(opts.isDuringToolCall, localize('mcp.sampling.allowDuringChat.title', 'Allow MCP tools from "{0}" to make LLM requests?', opts.server.definition.label), localize('mcp.sampling.allowDuringChat.desc', 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests during chat?', opts.server.definition.label), this.allowButtons(opts.server, 'allowedDuringChat'));
            if (retry) {
                return this._getMatchingModel(opts);
            }
            throw McpError.notAllowed();
        }
        else if (model === 1 /* ModelMatch.UnsureAllowedOutsideChat */) {
            // In YOLO mode, auto-approve MCP sampling requests without prompting
            if (globalAutoApprove) {
                this._sessionSets.allowedOutsideChat.set(opts.server.definition.id, true);
                return this._getMatchingModel(opts);
            }
            const retry = await this._showContextual(opts.isDuringToolCall, localize('mcp.sampling.allowOutsideChat.title', 'Allow MCP server "{0}" to make LLM requests?', opts.server.definition.label), localize('mcp.sampling.allowOutsideChat.desc', 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests, outside of tool calls during chat?', opts.server.definition.label), this.allowButtons(opts.server, 'allowedOutsideChat'));
            if (retry) {
                return this._getMatchingModel(opts);
            }
            throw McpError.notAllowed();
        }
        else if (model === 2 /* ModelMatch.NotAllowed */) {
            throw McpError.notAllowed();
        }
        else if (model === 3 /* ModelMatch.NoMatchingModel */) {
            const newlyPickedModels = opts.isDuringToolCall
                ? await this._commandService.executeCommand("workbench.mcp.configureSamplingModels" /* McpCommandIds.ConfigureSamplingModels */, opts.server)
                : await this._notify(localize('mcp.sampling.needsModels', 'MCP server "{0}" triggered a language model request, but it has no allowlisted models.', opts.server.definition.label), {
                    [localize('configure', 'Configure')]: () => this._commandService.executeCommand("workbench.mcp.configureSamplingModels" /* McpCommandIds.ConfigureSamplingModels */, opts.server),
                    [localize('cancel', 'Cancel')]: () => Promise.resolve(undefined),
                });
            if (newlyPickedModels) {
                return this._getMatchingModel(opts);
            }
            throw McpError.notAllowed();
        }
        return model;
    }
    allowButtons(server, key) {
        return {
            [localize('mcp.sampling.allow.inSession', 'Allow in this Session')]: async () => {
                this._sessionSets[key].set(server.definition.id, true);
                return true;
            },
            [localize('mcp.sampling.allow.always', 'Always')]: async () => {
                await this.updateConfig(server, c => c[key] = true);
                return true;
            },
            [localize('mcp.sampling.allow.notNow', 'Not Now')]: async () => {
                this._sessionSets[key].set(server.definition.id, false);
                return false;
            },
            [localize('mcp.sampling.allow.never', 'Never')]: async () => {
                await this.updateConfig(server, c => c[key] = false);
                return false;
            },
        };
    }
    async _showContextual(isDuringToolCall, title, message, buttons) {
        if (isDuringToolCall) {
            const result = await this._dialogService.prompt({
                type: 'question',
                title: title,
                message,
                buttons: Object.entries(buttons).map(([label, run]) => ({ label, run })),
            });
            return await result.result;
        }
        else {
            return await this._notify(message, buttons);
        }
    }
    async _notify(message, buttons) {
        return await new Promise(resolve => {
            const handle = this._notificationService.prompt(Severity.Info, message, Object.entries(buttons).map(([label, action]) => ({
                label,
                run: () => resolve(action()),
            })));
            Event.once(handle.onDidClose)(() => resolve(undefined));
        });
    }
    /**
     * Gets the matching model for the MCP server in this context, or
     * a reason why no model could be selected.
     */
    async _getMatchingModelInner(server, isDuringToolCall, preferences) {
        const config = this.getConfig(server);
        // 1. Ensure the server is allowed to sample in this context
        if (isDuringToolCall && !config.allowedDuringChat && !this._sessionSets.allowedDuringChat.has(server.definition.id)) {
            return config.allowedDuringChat === undefined ? 0 /* ModelMatch.UnsureAllowedDuringChat */ : 2 /* ModelMatch.NotAllowed */;
        }
        else if (!isDuringToolCall && !config.allowedOutsideChat && !this._sessionSets.allowedOutsideChat.has(server.definition.id)) {
            return config.allowedOutsideChat === undefined ? 1 /* ModelMatch.UnsureAllowedOutsideChat */ : 2 /* ModelMatch.NotAllowed */;
        }
        // 2. Get the configured models, or the default free model(s)
        const foundModelIds = config.allowedModels?.filter(m => !!this._languageModelsService.lookupLanguageModel(m)) || this._getDefaultModels();
        if (!foundModelIds.length) {
            return 3 /* ModelMatch.NoMatchingModel */;
        }
        // 3. If preferences are provided, try to match them from the allowed models
        if (preferences?.hints) {
            const found = mapFindFirst(preferences.hints, hint => foundModelIds.find(model => model.toLowerCase().includes(hint.name.toLowerCase())));
            if (found) {
                return found;
            }
        }
        return foundModelIds[0]; // Return the first matching model
    }
    _getDefaultModels() {
        const candidates = this._languageModelsService.getLanguageModelIds().map(m => {
            const model = this._languageModelsService.lookupLanguageModel(m);
            return model && !model.multiplierNumeric && !model.targetChatSessionType ? { model, id: m } : undefined;
        }).filter(isDefined);
        const someDefault = candidates.findIndex(c => Object.values(c.model.isDefaultForLocation).some(Boolean));
        if (someDefault !== -1) {
            [candidates[0], candidates[someDefault]] = [candidates[someDefault], candidates[0]];
        }
        return candidates.map(c => c.id);
    }
    _configKey(server) {
        return `${server.collection.label}: ${server.definition.label}`;
    }
    getConfig(server) {
        return this._getConfig(server).value || {};
    }
    /**
     * _getConfig reads the sampling config reads the `{ server: data }` mapping
     * from the appropriate config. We read from the most specific possible
     * config up to the default configuration location that the MCP server itself
     * is defined in. We don't go further because then workspace-specific servers
     * would get in the user settings which is not meaningful and could lead
     * to confusion.
     *
     * todo@connor4312: generalize this for other esttings when we have them
     */
    _getConfig(server) {
        const def = server.readDefinitions().get();
        const mostSpecificConfig = 8 /* ConfigurationTarget.MEMORY */;
        const leastSpecificConfig = def.collection?.configTarget || 2 /* ConfigurationTarget.USER */;
        const key = this._configKey(server);
        const resource = def.collection?.presentation?.origin;
        const configValue = this._configurationService.inspect(mcpServerSamplingSection, { resource });
        for (let target = mostSpecificConfig; target >= leastSpecificConfig; target--) {
            const mapping = getConfigValueInTarget(configValue, target);
            const config = mapping?.[key];
            if (config) {
                return { value: config, key, mapping, target, resource };
            }
        }
        return { value: undefined, mapping: getConfigValueInTarget(configValue, leastSpecificConfig), key, target: leastSpecificConfig, resource };
    }
    async updateConfig(server, mutate) {
        const { value, mapping, key, target, resource } = this._getConfig(server);
        const newConfig = { ...value };
        mutate(newConfig);
        await this._configurationService.updateValue(mcpServerSamplingSection, { ...mapping, [key]: newConfig }, { resource }, target);
        return newConfig;
    }
};
McpSamplingService = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, IConfigurationService),
    __param(2, IDialogService),
    __param(3, INotificationService),
    __param(4, ICommandService),
    __param(5, IInstantiationService)
], McpSamplingService);
export { McpSamplingService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2FtcGxpbmdTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BTYW1wbGluZ1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUF1QixzQkFBc0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FB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