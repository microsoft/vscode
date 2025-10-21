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
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, ToolSet } from '../../languageModelToolsService.js';
import { IChatModeService, isBuiltinChatMode } from '../../chatModes.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { IHeaderAttribute, PromptBody, PromptHeader, PromptHeaderAttributes } from '../service/newPromptsParser.js';

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

		const parser = this.promptsService.getParsedPromptFile(model);
		if (parser.header?.range.containsPosition(position)) {
			return this.provideHeaderHover(position, promptType, parser.header);
		}
		if (parser.body?.range.containsPosition(position)) {
			return this.provideBodyHover(position, parser.body);
		}
		return undefined;
	}

	private async provideBodyHover(position: Position, body: PromptBody): Promise<Hover | undefined> {
		for (const ref of body.variableReferences) {
			if (ref.range.containsPosition(position)) {
				const toolName = ref.name;
				return this.getToolHoverByName(toolName, ref.range);
			}
		}
		return undefined;
	}

	private async provideHeaderHover(position: Position, promptType: PromptsType, header: PromptHeader): Promise<Hover | undefined> {
		if (promptType === PromptsType.instructions) {
			const descriptionRange = header.getAttribute(PromptHeaderAttributes.description)?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.instructions.description', 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.'), descriptionRange);
			}
			const applyToRange = header.getAttribute(PromptHeaderAttributes.applyTo)?.range;
			if (applyToRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.instructions.applyToRange', 'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`'), applyToRange);
			}

		} else if (promptType === PromptsType.agent) {
			const descriptionRange = header.getAttribute(PromptHeaderAttributes.description)?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.agent.description', 'The description of the agent file. It is a short description of what the agent does.'), descriptionRange);
			}
			const model = header.getAttribute(PromptHeaderAttributes.model);
			if (model?.range.containsPosition(position)) {
				return this.getModelHover(model, model.range, localize('promptHeader.agent.model', 'The model to use in this agent.'));
			}
			const tools = header.getAttribute(PromptHeaderAttributes.tools);
			if (tools?.range.containsPosition(position)) {
				return this.getToolHover(tools, position, localize('promptHeader.agent.tools', 'The tools to use in this agent.'));
			}
		} else {
			const descriptionRange = header.getAttribute(PromptHeaderAttributes.description)?.range;
			if (descriptionRange?.containsPosition(position)) {
				return this.createHover(localize('promptHeader.prompt.description', 'The description of the prompt file. It is a short description of what the prompt does.'), descriptionRange);
			}
			const model = header.getAttribute(PromptHeaderAttributes.model);
			if (model?.range.containsPosition(position)) {
				return this.getModelHover(model, model.range, localize('promptHeader.prompt.model', 'The model to use in this prompt.'));
			}
			const tools = header.getAttribute(PromptHeaderAttributes.tools);
			if (tools?.range.containsPosition(position)) {
				return this.getToolHover(tools, position, localize('promptHeader.prompt.tools', 'The tools to use in this prompt.'));
			}
			const agent = header.getAttribute(PromptHeaderAttributes.agent) ?? header.getAttribute(PromptHeaderAttributes.mode);
			if (agent?.range.containsPosition(position)) {
				return this.getAgentHover(agent, position, localize('promptHeader.prompt.agent', 'The agent to use in this prompt.'));
			}
		}
		return undefined;
	}

	private getToolHover(node: IHeaderAttribute, position: Position, baseMessage: string): Hover | undefined {
		if (node.value.type === 'array') {
			for (const toolName of node.value.items) {
				if (toolName.type === 'string' && toolName.range.containsPosition(position)) {
					return this.getToolHoverByName(toolName.value, toolName.range);
				}
			}
		}
		return this.createHover(baseMessage, node.range);
	}

	private getToolHoverByName(toolName: string, range: Range): Hover | undefined {
		const tool = this.languageModelToolsService.getToolByQualifiedName(toolName);
		if (tool !== undefined) {
			if (tool instanceof ToolSet) {
				return this.getToolsetHover(tool, range);
			} else {
				return this.createHover(tool.modelDescription, range);
			}
		}
		return undefined;
	}

	private getToolsetHover(toolSet: ToolSet, range: Range): Hover | undefined {
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

	private getModelHover(node: IHeaderAttribute, range: Range, baseMessage: string): Hover | undefined {
		if (node.value.type === 'string') {
			for (const id of this.languageModelsService.getLanguageModelIds()) {
				const meta = this.languageModelsService.lookupLanguageModel(id);
				if (meta && ILanguageModelChatMetadata.matchesQualifiedName(node.value.value, meta)) {
					const lines: string[] = [];
					lines.push(baseMessage + '\n');
					lines.push(localize('modelName', '- Name: {0}', meta.name));
					lines.push(localize('modelFamily', '- Family: {0}', meta.family));
					lines.push(localize('modelVendor', '- Vendor: {0}', meta.vendor));
					if (meta.tooltip) {
						lines.push('', '', meta.tooltip);
					}
					return this.createHover(lines.join('\n'), range);
				}
			}
		}
		return this.createHover(baseMessage, range);
	}

	private getAgentHover(agentAttribute: IHeaderAttribute, position: Position, baseMessage: string): Hover | undefined {
		const lines: string[] = [];
		const value = agentAttribute.value;
		if (value.type === 'string' && value.range.containsPosition(position)) {
			const agent = this.chatModeService.findModeByName(value.value);
			if (agent) {
				const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize('promptHeader.prompt.agent.builtInDesc', 'Built-in agent') : localize('promptHeader.prompt.agent.customDesc', 'Custom agent'));
				lines.push(`\`${agent.name}\`: ${description}`);
			}
		} else {
			const agents = this.chatModeService.getModes();
			lines.push(localize('promptHeader.prompt.agent.description', 'The agent to use when running this prompt.'));
			lines.push('');

			// Built-in agents
			lines.push(localize('promptHeader.prompt.agent.builtin', '**Built-in agents:**'));
			for (const agent of agents.builtin) {
				lines.push(`- \`${agent.name}\`: ${agent.description.get() || agent.label}`);
			}

			// Custom agents
			if (agents.custom.length > 0) {
				lines.push('');
				lines.push(localize('promptHeader.prompt.agent.custom', '**Custom agents:**'));
				for (const agent of agents.custom) {
					const description = agent.description.get();
					lines.push(`- \`${agent.name}\`: ${description || localize('promptHeader.prompt.agent.customDesc', 'Custom agent')}`);
				}
			}
		}
		return this.createHover(lines.join('\n'), agentAttribute.range);
	}

}
