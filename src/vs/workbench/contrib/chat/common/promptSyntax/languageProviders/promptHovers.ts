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
import { IHeaderAttribute, PromptBody, PromptHeader, PromptHeaderAttributes, Target } from '../promptFileParser.js';
import { isGithubTarget, knownGithubCopilotTools } from './promptValidator.js';

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
		if (promptAST.header?.range.containsPosition(position)) {
			return this.provideHeaderHover(position, promptType, promptAST.header);
		}
		if (promptAST.body?.range.containsPosition(position)) {
			return this.provideBodyHover(position, promptAST.body);
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
			for (const attribute of header.attributes) {
				if (attribute.range.containsPosition(position)) {
					switch (attribute.key) {
						case PromptHeaderAttributes.name:
							return this.createHover(localize('promptHeader.instructions.name', 'The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.'), attribute.range);
						case PromptHeaderAttributes.description:
							return this.createHover(localize('promptHeader.instructions.description', 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.'), attribute.range);
						case PromptHeaderAttributes.applyTo:
							return this.createHover(localize('promptHeader.instructions.applyToRange', 'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`'), attribute.range);
					}
				}
			}
		} else if (promptType === PromptsType.agent) {
			const isGitHubTarget = isGithubTarget(promptType, header.target);
			for (const attribute of header.attributes) {
				if (attribute.range.containsPosition(position)) {
					switch (attribute.key) {
						case PromptHeaderAttributes.name:
							return this.createHover(localize('promptHeader.agent.name', 'The name of the agent as shown in the UI.'), attribute.range);
						case PromptHeaderAttributes.description:
							return this.createHover(localize('promptHeader.agent.description', 'The description of the custom agent, what it does and when to use it.'), attribute.range);
						case PromptHeaderAttributes.argumentHint:
							return this.createHover(localize('promptHeader.agent.argumentHint', 'The argument-hint describes what inputs the custom agent expects or supports.'), attribute.range);
						case PromptHeaderAttributes.model:
							return this.getModelHover(attribute, attribute.range, localize('promptHeader.agent.model', 'Specify the model that runs this custom agent.'), isGitHubTarget);
						case PromptHeaderAttributes.tools:
							return this.getToolHover(attribute, position, localize('promptHeader.agent.tools', 'The set of tools that the custom agent has access to.'), header.target);
						case PromptHeaderAttributes.handOffs:
							return this.getHandsOffHover(attribute, position, isGitHubTarget);
						case PromptHeaderAttributes.target:
							return this.createHover(localize('promptHeader.agent.target', 'The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.'), attribute.range);
					}
				}
			}
		} else {
			for (const attribute of header.attributes) {
				if (attribute.range.containsPosition(position)) {
					switch (attribute.key) {
						case PromptHeaderAttributes.name:
							return this.createHover(localize('promptHeader.prompt.name', 'The name of the prompt. This is also the name of the slash command that will run this prompt.'), attribute.range);
						case PromptHeaderAttributes.description:
							return this.createHover(localize('promptHeader.prompt.description', 'The description of the reusable prompt, what it does and when to use it.'), attribute.range);
						case PromptHeaderAttributes.argumentHint:
							return this.createHover(localize('promptHeader.prompt.argumentHint', 'The argument-hint describes what inputs the prompt expects or supports.'), attribute.range);
						case PromptHeaderAttributes.model:
							return this.getModelHover(attribute, attribute.range, localize('promptHeader.prompt.model', 'The model to use in this prompt.'), false);
						case PromptHeaderAttributes.tools:
							return this.getToolHover(attribute, position, localize('promptHeader.prompt.tools', 'The tools to use in this prompt.'), Target.VSCode);
						case PromptHeaderAttributes.agent:
						case PromptHeaderAttributes.mode:
							return this.getAgentHover(attribute, position);
					}
				}
			}
		}
		return undefined;
	}

	private getToolHover(node: IHeaderAttribute, position: Position, baseMessage: string, target: string | undefined): Hover | undefined {
		if (node.value.type === 'array') {
			for (const toolName of node.value.items) {
				if (toolName.type === 'string' && toolName.range.containsPosition(position)) {
					let toolNameValue = toolName.value;
					if (target === undefined) {
						toolNameValue = this.languageModelToolsService.mapGithubToolName(toolNameValue);
					}
					if (target === Target.VSCode || target === undefined) {
						const description = this.getToolHoverByName(toolNameValue, toolName.range);
						if (description) {
							return description;
						}
					}
					if (target === Target.GitHubCopilot || target === undefined) {
						const description = knownGithubCopilotTools[toolNameValue];
						if (description) {
							return this.createHover(description, toolName.range);
						}
					}
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
				return this.createHover(tool.userDescription ?? tool.modelDescription, range);
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

	private getModelHover(node: IHeaderAttribute, range: Range, baseMessage: string, isGitHubTarget: boolean): Hover | undefined {
		if (isGitHubTarget) {
			return this.createHover(baseMessage + '\n\n' + localize('promptHeader.agent.model.githubCopilot', 'Note: This attribute is not used when target is github-copilot.'), range);
		}
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

	private getAgentHover(agentAttribute: IHeaderAttribute, position: Position): Hover | undefined {
		const lines: string[] = [];
		const value = agentAttribute.value;
		if (value.type === 'string' && value.range.containsPosition(position)) {
			const agent = this.chatModeService.findModeByName(value.value);
			if (agent) {
				const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize('promptHeader.prompt.agent.builtInDesc', 'Built-in agent') : localize('promptHeader.prompt.agent.customDesc', 'Custom agent'));
				lines.push(`\`${agent.name.get()}\`: ${description}`);
			}
		} else {
			const agents = this.chatModeService.getModes();
			lines.push(localize('promptHeader.prompt.agent.description', 'The agent to use when running this prompt.'));
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

	private getHandsOffHover(attribute: IHeaderAttribute, position: Position, isGitHubTarget: boolean): Hover | undefined {
		const handoffsBaseMessage = localize('promptHeader.agent.handoffs', 'Possible handoff actions when the agent has completed its task.');
		if (isGitHubTarget) {
			return this.createHover(handoffsBaseMessage + '\n\n' + localize('promptHeader.agent.handoffs.githubCopilot', 'Note: This attribute is not used when target is github-copilot.'), attribute.range);
		}
		return this.createHover(handoffsBaseMessage, attribute.range);

	}
}
