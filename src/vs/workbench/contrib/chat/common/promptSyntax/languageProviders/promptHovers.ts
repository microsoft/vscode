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
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService, Target } from '../service/promptsService.js';
import { ClaudeHeaderAttributes, IHeaderAttribute, parseCommaSeparatedList, PromptBody, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { getAttributeDescription, getTarget, isVSCodeOrDefaultTarget, knownClaudeModels, knownClaudeTools } from './promptValidator.js';

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
		const target = getTarget(promptType, promptAST.header ?? model.uri);

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
				const description = getAttributeDescription(attribute.key, promptType, target);
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
		if (target === Target.GitHubCopilot) {
			return this.createHover(baseMessage + '\n\n' + localize('promptHeader.agent.model.githubCopilot', 'Note: This attribute is not used when target is github-copilot.'), node.range);
		}
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

	private getAgentHover(agentAttribute: IHeaderAttribute, position: Position, baseMessage: string): Hover | undefined {
		const lines: string[] = [];
		const value = agentAttribute.value;
		if (value.type === 'scalar' && value.range.containsPosition(position)) {
			const agent = this.chatModeService.findModeByName(value.value);
			if (agent) {
				const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize('promptHeader.prompt.agent.builtInDesc', 'Built-in agent') : localize('promptHeader.prompt.agent.customDesc', 'Custom agent'));
				lines.push(`\`${agent.name.get()}\`: ${description}`);
			}
		} else {
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

	private getHandsOffHover(attribute: IHeaderAttribute, position: Position, target: Target): Hover | undefined {
		const handoffsBaseMessage = getAttributeDescription(PromptHeaderAttributes.handOffs, PromptsType.agent, target)!;
		if (!isVSCodeOrDefaultTarget(target)) {
			return this.createHover(handoffsBaseMessage + '\n\n' + localize('promptHeader.agent.handoffs.githubCopilot', 'Note: This attribute is not used in GitHub Copilot or Claude targets.'), attribute.range);
		}
		return this.createHover(handoffsBaseMessage, attribute.range);

	}
}
