/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { isToolInvocationContext } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { computeCombinationKey } from '../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ExtensionEditToolId, InternalEditToolId } from '../../contrib/chat/common/tools/builtinTools/editFileTool.js';
import { InternalFetchWebPageToolId } from '../../contrib/chat/common/tools/builtinTools/tools.js';
import { SearchExtensionsToolId } from '../../contrib/extensions/common/searchExtensionsTool.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { MainContext } from './extHost.protocol.js';
import * as typeConvert from './extHostTypeConverters.js';
import { URI } from '../../../base/common/uri.js';
class Tool {
    constructor(data) {
        this._data = data;
    }
    update(newData) {
        this._data = newData;
        this._apiObject = undefined;
        this._apiObjectWithChatParticipantAdditions = undefined;
    }
    get data() {
        return this._data;
    }
    get apiObject() {
        if (!this._apiObject) {
            this._apiObject = Object.freeze({
                name: this._data.id,
                description: this._data.modelDescription,
                inputSchema: this._data.inputSchema,
                tags: this._data.tags ?? [],
                source: undefined
            });
        }
        return this._apiObject;
    }
    get apiObjectWithChatParticipantAdditions() {
        if (!this._apiObjectWithChatParticipantAdditions) {
            this._apiObjectWithChatParticipantAdditions = Object.freeze({
                name: this._data.id,
                description: this._data.modelDescription,
                inputSchema: this._data.inputSchema,
                tags: this._data.tags ?? [],
                source: typeConvert.LanguageModelToolSource.to(this._data.source),
                fullReferenceName: this._data.fullReferenceName
            });
        }
        return this._apiObjectWithChatParticipantAdditions;
    }
}
export class ExtHostLanguageModelTools {
    constructor(mainContext, _languageModels) {
        this._languageModels = _languageModels;
        /** A map of tools that were registered in this EH */
        this._registeredTools = new Map();
        this._tokenCountFuncs = new Map();
        /** A map of all known tools, from other EHs or registered in vscode core */
        this._allTools = new Map();
        this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);
        this._proxy.$getTools().then(tools => {
            for (const tool of tools) {
                this._allTools.set(tool.id, new Tool(revive(tool)));
            }
        });
    }
    async $countTokensForInvocation(callId, input, token) {
        const fn = this._tokenCountFuncs.get(callId);
        if (!fn) {
            throw new Error(`Tool invocation call ${callId} not found`);
        }
        return await fn(input, token);
    }
    async invokeTool(extension, toolIdOrInfo, options, token) {
        const toolId = typeof toolIdOrInfo === 'string' ? toolIdOrInfo : toolIdOrInfo.name;
        const callId = generateUuid();
        if (options.tokenizationOptions) {
            this._tokenCountFuncs.set(callId, options.tokenizationOptions.countTokens);
        }
        try {
            if (options.toolInvocationToken && !isToolInvocationContext(options.toolInvocationToken)) {
                throw new Error(`Invalid tool invocation token`);
            }
            if ((toolId === InternalEditToolId || toolId === ExtensionEditToolId) && !isProposedApiEnabled(extension, 'chatParticipantPrivate')) {
                throw new Error(`Invalid tool: ${toolId}`);
            }
            // Making the round trip here because not all tools were necessarily registered in this EH
            const result = await this._proxy.$invokeTool({
                toolId,
                callId,
                parameters: options.input,
                tokenBudget: options.tokenizationOptions?.tokenBudget,
                context: options.toolInvocationToken,
                chatRequestId: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.chatRequestId : undefined,
                chatInteractionId: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.chatInteractionId : undefined,
                subAgentInvocationId: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.subAgentInvocationId : undefined,
                chatStreamToolCallId: isProposedApiEnabled(extension, 'chatParticipantAdditions') ? options.chatStreamToolCallId : undefined,
                preToolUseResult: isProposedApiEnabled(extension, 'chatParticipantPrivate') ? options.preToolUseResult : undefined,
            }, token);
            const dto = result instanceof SerializableObjectWithBuffers ? result.value : result;
            return typeConvert.LanguageModelToolResult.to(revive(dto));
        }
        finally {
            this._tokenCountFuncs.delete(callId);
        }
    }
    $onDidChangeTools(tools) {
        const oldTools = new Set(this._allTools.keys());
        for (const tool of tools) {
            oldTools.delete(tool.id);
            const existing = this._allTools.get(tool.id);
            if (existing) {
                existing.update(tool);
            }
            else {
                this._allTools.set(tool.id, new Tool(revive(tool)));
            }
        }
        for (const id of oldTools) {
            this._allTools.delete(id);
        }
    }
    getTools(extension) {
        const hasParticipantAdditions = isProposedApiEnabled(extension, 'chatParticipantPrivate');
        return Array.from(this._allTools.values())
            .map(tool => hasParticipantAdditions ? tool.apiObjectWithChatParticipantAdditions : tool.apiObject)
            .filter(tool => {
            switch (tool.name) {
                case InternalEditToolId:
                case ExtensionEditToolId:
                case InternalFetchWebPageToolId:
                case SearchExtensionsToolId:
                    return isProposedApiEnabled(extension, 'chatParticipantPrivate');
                default:
                    return true;
            }
        });
    }
    async $invokeTool(dto, token) {
        const item = this._registeredTools.get(dto.toolId);
        if (!item) {
            throw new Error(`Unknown tool ${dto.toolId}`);
        }
        const options = {
            input: dto.parameters,
            toolInvocationToken: revive(dto.context),
        };
        if (isProposedApiEnabled(item.extension, 'chatParticipantPrivate')) {
            options.chatRequestId = dto.chatRequestId;
            options.chatInteractionId = dto.chatInteractionId;
            options.chatSessionResource = URI.revive(dto.context?.sessionResource);
            options.subAgentInvocationId = dto.subAgentInvocationId;
        }
        if (isProposedApiEnabled(item.extension, 'chatParticipantAdditions') && dto.modelId) {
            options.model = await this.getModel(dto.modelId, item.extension);
        }
        if (isProposedApiEnabled(item.extension, 'chatParticipantAdditions') && dto.chatStreamToolCallId) {
            options.chatStreamToolCallId = dto.chatStreamToolCallId;
        }
        if (dto.tokenBudget !== undefined) {
            options.tokenizationOptions = {
                tokenBudget: dto.tokenBudget,
                countTokens: this._tokenCountFuncs.get(dto.callId) || ((value, token = CancellationToken.None) => this._proxy.$countTokensForInvocation(dto.callId, value, token))
            };
        }
        let progress;
        if (isProposedApiEnabled(item.extension, 'toolProgress')) {
            let lastProgress;
            progress = {
                report: value => {
                    if (value.increment !== undefined) {
                        lastProgress = (lastProgress ?? 0) + value.increment;
                    }
                    this._proxy.$acceptToolProgress(dto.callId, {
                        message: typeConvert.MarkdownString.fromStrict(value.message),
                        progress: lastProgress === undefined ? undefined : lastProgress / 100,
                    });
                }
            };
        }
        // todo: 'any' cast because TS can't handle the overloads
        // eslint-disable-next-line local/code-no-any-casts
        const extensionResult = await raceCancellation(Promise.resolve(item.tool.invoke(options, token, progress)), token);
        if (!extensionResult) {
            throw new CancellationError();
        }
        return typeConvert.LanguageModelToolResult.from(extensionResult, item.extension);
    }
    async getModel(modelId, extension) {
        let model;
        if (modelId) {
            model = await this._languageModels.getLanguageModelByIdentifier(extension, modelId);
        }
        if (!model) {
            model = await this._languageModels.getDefaultLanguageModel(extension);
            if (!model) {
                throw new Error('Language model unavailable');
            }
        }
        return model;
    }
    async $handleToolStream(toolId, context, token) {
        const item = this._registeredTools.get(toolId);
        if (!item) {
            throw new Error(`Unknown tool ${toolId}`);
        }
        // Only call handleToolStream if it's defined on the tool
        if (!item.tool.handleToolStream) {
            return undefined;
        }
        // Ensure the chatParticipantAdditions API is enabled
        checkProposedApiEnabled(item.extension, 'chatParticipantAdditions');
        const options = {
            rawInput: context.rawInput,
            chatRequestId: context.chatRequestId,
            chatSessionResource: context.chatSessionResource,
            chatInteractionId: context.chatInteractionId
        };
        const result = await item.tool.handleToolStream(options, token);
        if (!result) {
            return undefined;
        }
        return {
            invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage)
        };
    }
    async $prepareToolInvocation(toolId, context, token) {
        const item = this._registeredTools.get(toolId);
        if (!item) {
            throw new Error(`Unknown tool ${toolId}`);
        }
        const options = {
            input: context.parameters,
            chatRequestId: context.chatRequestId,
            chatSessionResource: context.chatSessionResource,
            chatInteractionId: context.chatInteractionId,
            forceConfirmationReason: context.forceConfirmationReason
        };
        if (context.forceConfirmationReason) {
            checkProposedApiEnabled(item.extension, 'chatParticipantPrivate');
        }
        if (item.tool.prepareInvocation) {
            const result = await item.tool.prepareInvocation(options, token);
            if (!result) {
                return undefined;
            }
            if (result.pastTenseMessage || result.presentation) {
                checkProposedApiEnabled(item.extension, 'chatParticipantPrivate');
            }
            if (result.confirmationMessages?.approveCombination !== undefined) {
                checkProposedApiEnabled(item.extension, 'toolInvocationApproveCombination');
            }
            const approveCombinationLabel = result.confirmationMessages?.approveCombination
                ? typeConvert.MarkdownString.fromStrict(result.confirmationMessages.approveCombination)
                : undefined;
            const approveCombinationKey = approveCombinationLabel
                ? await computeCombinationKey(toolId, context.parameters)
                : undefined;
            return {
                confirmationMessages: result.confirmationMessages ? {
                    title: typeof result.confirmationMessages.title === 'string' ? result.confirmationMessages.title : typeConvert.MarkdownString.from(result.confirmationMessages.title),
                    message: typeof result.confirmationMessages.message === 'string' ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
                    approveCombination: approveCombinationLabel && approveCombinationKey ? { label: approveCombinationLabel, key: approveCombinationKey } : undefined,
                } : undefined,
                invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage),
                pastTenseMessage: typeConvert.MarkdownString.fromStrict(result.pastTenseMessage),
                presentation: result.presentation,
            };
        }
        return undefined;
    }
    registerTool(extension, id, tool) {
        this._registeredTools.set(id, { extension, tool });
        this._proxy.$registerTool(id, typeof tool.handleToolStream === 'function');
        return toDisposable(() => {
            this._registeredTools.delete(id);
            this._proxy.$unregisterTool(id);
        });
    }
    registerToolDefinition(extension, definition, tool) {
        checkProposedApiEnabled(extension, 'languageModelToolSupportsModel');
        const id = definition.name;
        // Convert the definition to a DTO
        const dto = {
            id,
            displayName: definition.displayName,
            toolReferenceName: definition.toolReferenceName,
            userDescription: definition.userDescription,
            modelDescription: definition.description,
            inputSchema: definition.inputSchema,
            source: {
                type: 'extension',
                label: extension.displayName ?? extension.name,
                extensionId: extension.identifier,
            },
            icon: typeConvert.IconPath.from(definition.icon),
            models: definition.models,
            toolSet: definition.toolSet,
        };
        this._registeredTools.set(id, { extension, tool });
        this._proxy.$registerToolWithDefinition(extension.identifier, dto, typeof tool.handleToolStream === 'function');
        return toDisposable(() => {
            this._registeredTools.delete(id);
            this._proxy.$unregisterTool(id);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdExhbmd1YWdlTW9kZWxUb29scy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFNUQsT0FBTyxFQUFvRCx1QkFBdUIsRUFBcUosTUFBTSw4REFBOEQsQ0FBQztBQUM1UyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUNqSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN2SCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRyxPQUFPLEVBQU8sNkJBQTZCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN6RyxPQUFPLEVBQWtGLFdBQVcsRUFBcUMsTUFBTSx1QkFBdUIsQ0FBQztBQUV2SyxPQUFPLEtBQUssV0FBVyxNQUFNLDRCQUE0QixDQUFDO0FB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