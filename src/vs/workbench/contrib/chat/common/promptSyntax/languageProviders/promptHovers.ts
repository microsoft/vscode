/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Hover, HoverContext, HoverProvider } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, isToolSet, IToolSet } from '../../tools/languageModelToolsService.js';
import { IChatModeService, isBuiltinChatMode } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType, Target } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { IHeaderAttribute, IMapValue, ISequenceValue, parseCommaSeparatedList, PromptBody, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { ClaudeHeaderAttributes, getAttributeDefinition, getTarget, GithubPromptHeaderAttributes, githubCopilotGithubProperties, githubCopilotMcpLocalServerProperties, githubCopilotMcpRemoteServerProperties, IAttributeDefinition, isVSCodeOrDefaultTarget, knownClaudeModels, knownClaudeTools } from './promptFileAttributes.js';
import { getAgentHookMetadata } from '../hookTypes.js';
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from '../hookSchema.js';
import { ICustomizationHarnessService } from '../../customizationHarnessService.js';

export class PromptHoverProvider implements HoverProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHoverProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
	) {
	}

	private createHover(contents: string, range: Range): Hover {
		return {
			contents: [new MarkdownString(contents)],
			range
		};
	}

	public async provideHover(model: ITextModel, position: Position, token: CancellationToken, _context?: HoverContext): Promise<Hover | undefined> {

		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any hovers
			return undefined;
		}

		const promptAST = this.promptsService.getParsedPromptFile(model);
		const target = getTarget(promptType, promptAST.header ?? model.uri, this.customizationHarnessService.getActiveDescriptor().customAgentTarget);

		if (promptAST.header?.range.containsPosition(position)) {
			return this.provideHeaderHover(position, promptType, promptAST.header, target);
		}
		if (promptAST.body?.range.containsPosition(position)) {
			return this.provideBodyHover(position, promptAST.body, target);
		}
		return undefined;
	}

	private async provideBodyHover(position: Position, body: PromptBody, target: Target): Promise<Hover | undefined> {
		for (const ref of body.variableReferences) {
			if (ref.range.containsPosition(position)) {
				const toolName = ref.name;

				return this.getToolHoverByName(toolName, ref.range, target);
			}
		}
		return undefined;
	}

	private async provideHeaderHover(position: Position, promptType: PromptsType, header: PromptHeader, target: Target): Promise<Hover | undefined> {
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
							return this.getHooksHover(attribute, position, description, target);
						case GithubPromptHeaderAttributes.github:
							return target === Target.GitHubCopilot
								? this.getSchemaMapHover(attribute, position, description, githubCopilotGithubProperties)
								: this.createHover(description, attribute.range);
						case GithubPromptHeaderAttributes.mcpServers:
							return target === Target.GitHubCopilot
								? this.getMcpServersHover(attribute, position, description)
								: this.createHover(description, attribute.range);
						case PromptHeaderAttributes.infer:
							return this.createHover(description + '\n\n' + (target === Target.GitHubCopilot
								? localize('promptHeader.attribute.infer.githubCopilot.hover', 'Legacy: Use `disable-model-invocation` instead.')
								: localize('promptHeader.attribute.infer.hover', 'Deprecated: Use `user-invocable` and `disable-model-invocation` instead.')), attribute.range);
						default:
							return this.createHover(description, attribute.range);
					}
				}
				if (promptType === PromptsType.agent && target === Target.GitHubCopilot) {
					const localDescription = getAttributeDefinition(attribute.key, promptType, Target.Undefined)?.description;
					if (localDescription) {
						return this.createHover(localDescription + '\n\n' + localize('promptHeader.attribute.notUsedByCopilot', 'Note: This attribute is not used by the GitHub Copilot harness.'), attribute.range);
					}
				}
			}
		}
		return undefined;
	}

	private getToolHover(node: IHeaderAttribute, position: Position, baseMessage: string, target: Target): Hover | undefined {
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

	private getToolHoverByName(toolName: string, range: Range, target: Target): Hover | undefined {
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
			} else {
				return this.createHover(tool.userDescription ?? tool.modelDescription, range);
			}
		}
		return undefined;
	}

	private getToolsetHover(toolSet: IToolSet, range: Range): Hover | undefined {
		const lines: string[] = [];
		lines.push(localize('toolSetName', 'ToolSet: {0}\n\n', toolSet.referenceName));
		if (toolSet.description) {
			lines.push(toolSet.description);
		}
		for (const tool of toolSet.getTools()) {
			lines.push(`- ${tool.toolReferenceName ?? tool.displayName}`);
		}
		return this.createHover(lines.join('\n'), range);
	}

	private getModelHover(node: IHeaderAttribute, position: Position, baseMessage: string, target: Target): Hover | undefined {
		const modelHoverContent = (modelName: string): Hover | undefined => {
			const lines: string[] = [];
			lines.push(baseMessage + '\n');

			if (target === Target.Claude) {
				const claudeModel = knownClaudeModels.find(model => model.name === modelName);
				if (!claudeModel) {
					return this.createHover(lines.join('\n'), node.range);
				}
				if (claudeModel.modelEquivalent) {
					lines.push(localize('claudeModelEquivalent', 'Claude model `{0}` maps to the following model:\n', modelName));
					modelName = claudeModel.modelEquivalent;
				} else {
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
		} else if (node.value.type === 'sequence') {
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

	private async getAgentHover(agentAttribute: IHeaderAttribute, position: Position, baseMessage: string): Promise<Hover | undefined> {
		const lines: string[] = [];
		const value = agentAttribute.value;
		if (value.type === 'scalar' && value.range.containsPosition(position)) {
			const agent = (await this.chatModeService.getLocalModes()).findModeByName(value.value);
			if (agent) {
				const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize('promptHeader.prompt.agent.builtInDesc', 'Built-in agent') : localize('promptHeader.prompt.agent.customDesc', 'Custom agent'));
				lines.push(`\`${agent.name.get()}\`: ${description}`);
			}
		} else {
			const agents = await this.chatModeService.getLocalModes();
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

	private getHooksHover(attribute: IHeaderAttribute, position: Position, baseMessage: string, target: Target): Hover | undefined {
		const value = attribute.value;
		if (value.type === 'map') {
			for (const prop of value.properties) {
				// Hover on a hook event name key (e.g., SessionStart, PreToolUse)
				if (prop.key.range.containsPosition(position)) {
					const meta = getAgentHookMetadata(target, prop.key.value);
					if (meta) {
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

	private getSchemaMapHover(
		attribute: IHeaderAttribute,
		position: Position,
		baseMessage: string,
		definitions: Record<string, IAttributeDefinition>,
	): Hover | undefined {
		if (attribute.value.type === 'map') {
			const hover = this.getMapPropertyHover(attribute.value, position, definitions);
			if (hover) {
				return hover;
			}
		}
		return this.createHover(baseMessage, attribute.range);
	}

	private getMcpServersHover(attribute: IHeaderAttribute, position: Position, baseMessage: string): Hover | undefined {
		if (attribute.value.type !== 'map') {
			return this.createHover(baseMessage, attribute.range);
		}
		for (const server of attribute.value.properties) {
			if (server.value.type !== 'map' || !server.value.range.containsPosition(position)) {
				continue;
			}
			const typeProperty = server.value.properties.find(property => property.key.value === 'type');
			const type = typeProperty?.value.type === 'scalar' ? typeProperty.value.value : undefined;
			const isRemote = server.value.properties.some(property => property.key.value === 'url') || type === 'http' || type === 'sse';
			const definitions = isRemote ? githubCopilotMcpRemoteServerProperties : githubCopilotMcpLocalServerProperties;
			const hover = this.getMapPropertyHover(server.value, position, definitions);
			if (hover) {
				return hover;
			}
		}
		return this.createHover(baseMessage, attribute.range);
	}

	private getMapPropertyHover(
		map: IMapValue,
		position: Position,
		definitions: Record<string, IAttributeDefinition>,
	): Hover | undefined {
		for (const property of map.properties) {
			if (!property.key.range.containsPosition(position) && !property.value.range.containsPosition(position)) {
				continue;
			}
			if (!Object.hasOwn(definitions, property.key.value)) {
				return undefined;
			}
			const definition = definitions[property.key.value];
			const contents = definition.enums
				? localize('promptHeader.attribute.allowedValues.hover', '{0}\n\nAllowed values: {1}.', definition.description, definition.enums.map(entry => `\`${entry.name}\``).join(', '))
				: definition.description;
			return this.createHover(contents, property.key.range);
		}
		return undefined;
	}

	/**
	 * Recursively searches hook command items for hover information.
	 * Handles both direct command objects and nested matcher format
	 * (e.g., `{ matcher: "...", hooks: [{ type: command, ... }] }`).
	 */
	private getHookCommandItemHover(sequence: ISequenceValue, position: Position): Hover | undefined {
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

	private getHandsOffHover(attribute: IHeaderAttribute, position: Position, target: Target): Hover | undefined {
		const handoffsBaseMessage = getAttributeDefinition(PromptHeaderAttributes.handOffs, PromptsType.agent, target)?.description!;
		if (!isVSCodeOrDefaultTarget(target)) {
			return this.createHover(handoffsBaseMessage + '\n\n' + localize('promptHeader.agent.handoffs.githubCopilot', 'Note: This attribute is not used in GitHub Copilot or Claude targets.'), attribute.range);
		}
		return this.createHover(handoffsBaseMessage, attribute.range);

	}
}
