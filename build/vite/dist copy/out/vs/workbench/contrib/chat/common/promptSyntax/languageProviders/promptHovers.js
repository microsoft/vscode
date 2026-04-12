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
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, isToolSet } from '../../tools/languageModelToolsService.js';
import { IChatModeService, isBuiltinChatMode } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType, Target } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../promptFileParser.js';
import { ClaudeHeaderAttributes, getAttributeDefinition, getTarget, isVSCodeOrDefaultTarget, knownClaudeModels, knownClaudeTools } from './promptFileAttributes.js';
import { HOOKS_BY_TARGET, HOOK_METADATA } from '../hookTypes.js';
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from '../hookSchema.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { PromptsConfig } from '../config/config.js';
let PromptHoverProvider = class PromptHoverProvider {
    constructor(promptsService, languageModelToolsService, languageModelsService, chatModeService, configurationService) {
        this.promptsService = promptsService;
        this.languageModelToolsService = languageModelToolsService;
        this.languageModelsService = languageModelsService;
        this.chatModeService = chatModeService;
        this.configurationService = configurationService;
        /**
         * Debug display name for this provider.
         */
        this._debugDisplayName = 'PromptHoverProvider';
    }
    createHover(contents, range) {
        return {
            contents: [new MarkdownString(contents)],
            range
        };
    }
    async provideHover(model, position, token, _context) {
        const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptType) {
            // if the model is not a prompt, we don't provide any hovers
            return undefined;
        }
        const promptAST = this.promptsService.getParsedPromptFile(model);
        const target = getTarget(promptType, promptAST.header ?? model.uri);
        if (promptAST.header?.range.containsPosition(position)) {
            return this.provideHeaderHover(position, promptType, promptAST.header, target);
        }
        if (promptAST.body?.range.containsPosition(position)) {
            return this.provideBodyHover(position, promptAST.body, target);
        }
        return undefined;
    }
    async provideBodyHover(position, body, target) {
        for (const ref of body.variableReferences) {
            if (ref.range.containsPosition(position)) {
                const toolName = ref.name;
                return this.getToolHoverByName(toolName, ref.range, target);
            }
        }
        return undefined;
    }
    async provideHeaderHover(position, promptType, header, target) {
        for (const attribute of header.attributes) {
            if (attribute.range.containsPosition(position)) {
                const description = getAttributeDefinition(attribute.key, promptType, target)?.description;
                if (description) {
                    switch (attribute.key) {
                        case PromptHeaderAttributes.model:
                            return this.getModelHover(attribute, position, description, target);
                        case PromptHeaderAttributes.tools:
                        case ClaudeHeaderAttributes.disallowedTools:
                            return this.getToolHover(attribute, position, description, target);
                        case PromptHeaderAttributes.agent:
                        case PromptHeaderAttributes.mode:
                            return this.getAgentHover(attribute, position, description);
                        case PromptHeaderAttributes.handOffs:
                            return this.getHandsOffHover(attribute, position, target);
                        case PromptHeaderAttributes.hooks:
                            if (!this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS)) {
                                return undefined;
                            }
                            return this.getHooksHover(attribute, position, description, target);
                        case PromptHeaderAttributes.infer:
                            return this.createHover(description + '\n\n' + localize('promptHeader.attribute.infer.hover', 'Deprecated: Use `user-invocable` and `disable-model-invocation` instead.'), attribute.range);
                        default:
                            return this.createHover(description, attribute.range);
                    }
                }
            }
        }
        return undefined;
    }
    getToolHover(node, position, baseMessage, target) {
        let value = node.value;
        if (value.type === 'scalar') {
            value = parseCommaSeparatedList(value);
        }
        if (value.type === 'sequence') {
            for (const toolName of value.items) {
                if (toolName.type === 'scalar' && toolName.range.containsPosition(position)) {
                    const description = this.getToolHoverByName(toolName.value, toolName.range, target);
                    if (description) {
                        return description;
                    }
                }
            }
        }
        return this.createHover(baseMessage, node.range);
    }
    getToolHoverByName(toolName, range, target) {
        if (target === Target.Claude) {
            const description = knownClaudeTools.find(tool => tool.name === toolName)?.description;
            if (description) {
                return this.createHover(description, range);
            }
            return undefined;
        }
        const tool = this.languageModelToolsService.getToolByFullReferenceName(toolName);
        if (tool !== undefined) {
            if (isToolSet(tool)) {
                return this.getToolsetHover(tool, range);
            }
            else {
                return this.createHover(tool.userDescription ?? tool.modelDescription, range);
            }
        }
        return undefined;
    }
    getToolsetHover(toolSet, range) {
        const lines = [];
        lines.push(localize('toolSetName', 'ToolSet: {0}\n\n', toolSet.referenceName));
        if (toolSet.description) {
            lines.push(toolSet.description);
        }
        for (const tool of toolSet.getTools()) {
            lines.push(`- ${tool.toolReferenceName ?? tool.displayName}`);
        }
        return this.createHover(lines.join('\n'), range);
    }
    getModelHover(node, position, baseMessage, target) {
        if (target === Target.GitHubCopilot) {
            return this.createHover(baseMessage + '\n\n' + localize('promptHeader.agent.model.githubCopilot', 'Note: This attribute is not used when target is github-copilot.'), node.range);
        }
        const modelHoverContent = (modelName) => {
            const lines = [];
            lines.push(baseMessage + '\n');
            if (target === Target.Claude) {
                const claudeModel = knownClaudeModels.find(model => model.name === modelName);
                if (!claudeModel) {
                    return this.createHover(lines.join('\n'), node.range);
                }
                if (claudeModel.modelEquivalent) {
                    lines.push(localize('claudeModelEquivalent', 'Claude model `{0}` maps to the following model:\n', modelName));
                    modelName = claudeModel.modelEquivalent;
                }
                else {
                    lines.push(claudeModel.description);
                    return this.createHover(lines.join('\n'), node.range);
                }
            }
            const result = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
            if (result) {
                const meta = result.metadata;
                lines.push(localize('modelName', '- Name: {0}', meta.name));
                lines.push(localize('modelFamily', '- Family: {0}', meta.family));
                lines.push(localize('modelVendor', '- Vendor: {0}', meta.vendor));
                if (meta.tooltip) {
                    lines.push('', '', meta.tooltip);
                }
                return this.createHover(lines.join('\n'), node.range);
            }
            return undefined;
        };
        if (node.value.type === 'scalar') {
            const hover = modelHoverContent(node.value.value);
            if (hover) {
                return hover;
            }
        }
        else if (node.value.type === 'sequence') {
            for (const item of node.value.items) {
                if (item.type === 'scalar' && item.range.containsPosition(position)) {
                    const hover = modelHoverContent(item.value);
                    if (hover) {
                        return hover;
                    }
                }
            }
        }
        return this.createHover(baseMessage, node.range);
    }
    getAgentHover(agentAttribute, position, baseMessage) {
        const lines = [];
        const value = agentAttribute.value;
        if (value.type === 'scalar' && value.range.containsPosition(position)) {
            const agent = this.chatModeService.findModeByName(value.value);
            if (agent) {
                const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize('promptHeader.prompt.agent.builtInDesc', 'Built-in agent') : localize('promptHeader.prompt.agent.customDesc', 'Custom agent'));
                lines.push(`\`${agent.name.get()}\`: ${description}`);
            }
        }
        else {
            const agents = this.chatModeService.getModes();
            lines.push(baseMessage);
            lines.push('');
            // Built-in agents
            lines.push(localize('promptHeader.prompt.agent.builtin', '**Built-in agents:**'));
            for (const agent of agents.builtin) {
                lines.push(`- \`${agent.name.get()}\`: ${agent.description.get() || agent.label.get()}`);
            }
            // Custom agents
            if (agents.custom.length > 0) {
                lines.push('');
                lines.push(localize('promptHeader.prompt.agent.custom', '**Custom agents:**'));
                for (const agent of agents.custom) {
                    const description = agent.description.get();
                    lines.push(`- \`${agent.name.get()}\`: ${description || localize('promptHeader.prompt.agent.customDesc', 'Custom agent')}`);
                }
            }
        }
        return this.createHover(lines.join('\n'), agentAttribute.range);
    }
    getHooksHover(attribute, position, baseMessage, target) {
        const value = attribute.value;
        if (value.type === 'map') {
            const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
            for (const prop of value.properties) {
                // Hover on a hook event name key (e.g., SessionStart, PreToolUse)
                if (prop.key.range.containsPosition(position)) {
                    const hookType = hooksByTarget[prop.key.value];
                    if (hookType) {
                        const meta = HOOK_METADATA[hookType];
                        return this.createHover(`**${meta.label}**\n\n${meta.description}`, prop.key.range);
                    }
                }
                // Hover inside hook command entries
                if (prop.value.type === 'sequence') {
                    const hover = this.getHookCommandItemHover(prop.value, position);
                    if (hover) {
                        return hover;
                    }
                }
            }
        }
        return this.createHover(baseMessage, attribute.range);
    }
    /**
     * Recursively searches hook command items for hover information.
     * Handles both direct command objects and nested matcher format
     * (e.g., `{ matcher: "...", hooks: [{ type: command, ... }] }`).
     */
    getHookCommandItemHover(sequence, position) {
        for (const item of sequence.items) {
            if (item.type !== 'map' || !item.range.containsPosition(position)) {
                continue;
            }
            // Check for nested matcher format: { hooks: [...] }
            const nestedHooks = item.properties.find(p => p.key.value === 'hooks');
            if (nestedHooks && nestedHooks.value.type === 'sequence') {
                const hover = this.getHookCommandItemHover(nestedHooks.value, position);
                if (hover) {
                    return hover;
                }
            }
            // Check fields of the command object itself
            for (const field of item.properties) {
                if (field.key.range.containsPosition(position) || field.value.range.containsPosition(position)) {
                    const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[field.key.value];
                    if (desc) {
                        return this.createHover(desc, field.key.range);
                    }
                }
            }
        }
        return undefined;
    }
    getHandsOffHover(attribute, position, target) {
        const handoffsBaseMessage = getAttributeDefinition(PromptHeaderAttributes.handOffs, PromptsType.agent, target)?.description;
        if (!isVSCodeOrDefaultTarget(target)) {
            return this.createHover(handoffsBaseMessage + '\n\n' + localize('promptHeader.agent.handoffs.githubCopilot', 'Note: This attribute is not used in GitHub Copilot or Claude targets.'), attribute.range);
        }
        return this.createHover(handoffsBaseMessage, attribute.range);
    }
};
PromptHoverProvider = __decorate([
    __param(0, IPromptsService),
    __param(1, ILanguageModelToolsService),
    __param(2, ILanguageModelsService),
    __param(3, IChatModeService),
    __param(4, IConfigurationService)
], PromptHoverProvider);
export { PromptHoverProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SG92ZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdEhvdmVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFLOUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQVksTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQW9DLHVCQUF1QixFQUE0QixzQkFBc0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3JKLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxTQUFTLEVBQUUsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNwSyxPQUFPLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ25FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8s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