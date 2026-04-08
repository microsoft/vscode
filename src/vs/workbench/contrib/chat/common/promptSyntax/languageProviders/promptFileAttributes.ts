/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { SpecedToolAliases } from '../../tools/languageModelToolsService.js';
import { CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder } from '../config/promptFileLocations.js';
import { PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { PromptsType, Target } from '../promptTypes.js';

export namespace GithubPromptHeaderAttributes {
	export const mcpServers = 'mcp-servers';
	export const github = 'github';
}

export namespace ClaudeHeaderAttributes {
	export const disallowedTools = 'disallowedTools';
}

export function isTarget(value: unknown): value is Target {
	return value === Target.VSCode || value === Target.GitHubCopilot || value === Target.Claude || value === Target.Undefined;
}


interface IAttributeDefinition {
	readonly type: string;
	readonly description: string;
	readonly defaults?: readonly string[];
	readonly items?: readonly { name: string; description?: string }[];
	readonly enums?: readonly { name: string; description?: string }[];
}

const booleanAttributeEnumValues: readonly IValueEntry[] = [
	{ name: 'true' },
	{ name: 'false' }
];

const targetAttributeEnumValues: readonly IValueEntry[] = [
	{ name: 'vscode' },
	{ name: 'github-copilot' },
];

// Attribute metadata for prompt files (`*.prompt.md`).
export const promptFileAttributes: Record<string, IAttributeDefinition> = {
	[PromptHeaderAttributes.name]: {
		type: 'scalar',
		description: localize('promptHeader.prompt.name', 'The name of the prompt. This is also the name of the slash command that will run this prompt.'),
	},
	[PromptHeaderAttributes.description]: {
		type: 'scalar',
		description: localize('promptHeader.prompt.description', 'The description of the reusable prompt, what it does and when to use it.'),
	},
	[PromptHeaderAttributes.argumentHint]: {
		type: 'scalar',
		description: localize('promptHeader.prompt.argumentHint', 'The argument-hint describes what inputs the prompt expects or supports.'),
	},
	[PromptHeaderAttributes.model]: {
		type: 'scalar | sequence',
		description: localize('promptHeader.prompt.model', 'The model to use in this prompt. Can also be a list of models. The first available model will be used.'),
	},
	[PromptHeaderAttributes.tools]: {
		type: 'scalar | sequence',
		description: localize('promptHeader.prompt.tools', 'The tools to use in this prompt.'),
		defaults: ['[]', '[\'search\', \'edit\', \'web\']'],
	},
	[PromptHeaderAttributes.agent]: {
		type: 'scalar',
		description: localize('promptHeader.prompt.agent.description', 'The agent to use when running this prompt.'),
	},
	[PromptHeaderAttributes.mode]: {
		type: 'scalar',
		description: localize('promptHeader.prompt.agent.description', 'The agent to use when running this prompt.'),
	},
};

// Attribute metadata for instructions files (`*.instructions.md`).
export const instructionAttributes: Record<string, IAttributeDefinition> = {
	[PromptHeaderAttributes.name]: {
		type: 'scalar',
		description: localize('promptHeader.instructions.name', 'The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.'),
	},
	[PromptHeaderAttributes.description]: {
		type: 'scalar',
		description: localize('promptHeader.instructions.description', 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.'),
	},
	[PromptHeaderAttributes.applyTo]: {
		type: 'scalar',
		description: localize('promptHeader.instructions.applyToRange', 'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`'),
		defaults: [
			'\'**\'',
			'\'**/*.ts, **/*.js\'',
			'\'**/*.php\'',
			'\'**/*.py\''
		],
	},
	[PromptHeaderAttributes.excludeAgent]: {
		type: 'scalar | sequence',
		description: localize('promptHeader.instructions.excludeAgent', 'One or more agents to exclude from using this instruction file.'),
	},
};

// Attribute metadata for custom agent files (`*.agent.md`).
export const customAgentAttributes: Record<string, IAttributeDefinition> = {
	[PromptHeaderAttributes.name]: {
		type: 'scalar',
		description: localize('promptHeader.agent.name', 'The name of the agent as shown in the UI.'),
	},
	[PromptHeaderAttributes.description]: {
		type: 'scalar',
		description: localize('promptHeader.agent.description', 'The description of the custom agent, what it does and when to use it.'),
	},
	[PromptHeaderAttributes.argumentHint]: {
		type: 'scalar',
		description: localize('promptHeader.agent.argumentHint', 'The argument-hint describes what inputs the custom agent expects or supports.'),
	},
	[PromptHeaderAttributes.model]: {
		type: 'scalar | sequence',
		description: localize('promptHeader.agent.model', 'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.'),
	},
	[PromptHeaderAttributes.tools]: {
		type: 'scalar | sequence',
		description: localize('promptHeader.agent.tools', 'The set of tools that the custom agent has access to.'),
		defaults: ['[]', '[search, edit, web]'],
	},
	[PromptHeaderAttributes.handOffs]: {
		type: 'sequence',
		description: localize('promptHeader.agent.handoffs', 'Possible handoff actions when the agent has completed its task.'),
	},
	[PromptHeaderAttributes.target]: {
		type: 'scalar',
		description: localize('promptHeader.agent.target', 'The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.'),
		enums: targetAttributeEnumValues,
	},
	[PromptHeaderAttributes.infer]: {
		type: 'scalar',
		description: localize('promptHeader.agent.infer', 'Controls visibility of the agent.'),
		enums: booleanAttributeEnumValues,
	},
	[PromptHeaderAttributes.agents]: {
		type: 'sequence',
		description: localize('promptHeader.agent.agents', 'One or more agents that this agent can use as subagents. Use \'*\' to specify all available agents.'),
		defaults: ['["*"]'],
	},
	[PromptHeaderAttributes.userInvocable]: {
		type: 'scalar',
		description: localize('promptHeader.agent.userInvocable', 'Whether the agent can be selected and invoked by users in the UI.'),
		enums: booleanAttributeEnumValues,
	},
	[PromptHeaderAttributes.disableModelInvocation]: {
		type: 'scalar',
		description: localize('promptHeader.agent.disableModelInvocation', 'If true, prevents the agent from being invoked as a subagent.'),
		enums: booleanAttributeEnumValues,
	},
	[PromptHeaderAttributes.advancedOptions]: {
		type: 'map',
		description: localize('promptHeader.agent.advancedOptions', 'Advanced options for custom agent behavior.'),
	},
	[GithubPromptHeaderAttributes.github]: {
		type: 'map',
		description: localize('promptHeader.agent.github', 'GitHub-specific configuration for the agent, such as token permissions.'),
	},
	[PromptHeaderAttributes.hooks]: {
		type: 'map',
		description: localize('promptHeader.agent.hooks', 'Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.'),
	},
};

// Attribute metadata for skill files (`SKILL.md`).
export const skillAttributes: Record<string, IAttributeDefinition> = {
	[PromptHeaderAttributes.name]: {
		type: 'scalar',
		description: localize('promptHeader.skill.name', 'The name of the skill.'),
	},
	[PromptHeaderAttributes.description]: {
		type: 'scalar',
		description: localize('promptHeader.skill.description', 'The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.'),
	},
	[PromptHeaderAttributes.argumentHint]: {
		type: 'scalar',
		description: localize('promptHeader.skill.argumentHint', 'Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]'),
	},
	[PromptHeaderAttributes.userInvocable]: {
		type: 'scalar',
		description: localize('promptHeader.skill.userInvocable', 'Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true.'),
		enums: booleanAttributeEnumValues,
	},
	[PromptHeaderAttributes.disableModelInvocation]: {
		type: 'scalar',
		description: localize('promptHeader.skill.disableModelInvocation', 'Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false.'),
		enums: booleanAttributeEnumValues,
	},
	[PromptHeaderAttributes.license]: {
		type: 'scalar | map',
		description: localize('promptHeader.skill.license', 'License information for the skill.'),
	},
	[PromptHeaderAttributes.compatibility]: {
		type: 'scalar | map',
		description: localize('promptHeader.skill.compatibility', 'Compatibility metadata for environments or runtimes.'),
	},
	[PromptHeaderAttributes.metadata]: {
		type: 'map',
		description: localize('promptHeader.skill.metadata', 'Additional metadata for the skill.'),
	},
};

const allAttributeNames: Record<PromptsType, string[]> = {
	[PromptsType.prompt]: Object.keys(promptFileAttributes),
	[PromptsType.instructions]: Object.keys(instructionAttributes),
	[PromptsType.agent]: Object.keys(customAgentAttributes),
	[PromptsType.skill]: Object.keys(skillAttributes),
	[PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, GithubPromptHeaderAttributes.github, PromptHeaderAttributes.infer];
const recommendedAttributeNames: Record<PromptsType, string[]> = {
	[PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.agent]: allAttributeNames[PromptsType.agent].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.skill]: allAttributeNames[PromptsType.skill].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};

export function getValidAttributeNames(promptType: PromptsType, includeNonRecommended: boolean, target: Target): string[] {
	if (target === Target.Claude) {
		if (promptType === PromptsType.instructions) {
			return Object.keys(claudeRulesAttributes);
		}
		return Object.keys(claudeAgentAttributes);
	} else if (target === Target.GitHubCopilot) {
		if (promptType === PromptsType.agent) {
			return githubCopilotAgentAttributeNames;
		}
	}
	return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}

export function isNonRecommendedAttribute(attributeName: string): boolean {
	return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}

export function getAttributeDefinition(attributeName: string, promptType: PromptsType, target: Target): IAttributeDefinition | undefined {
	switch (promptType) {
		case PromptsType.instructions:
			if (target === Target.Claude) {
				return claudeRulesAttributes[attributeName];
			}
			return instructionAttributes[attributeName];
		case PromptsType.skill:
			return skillAttributes[attributeName];
		case PromptsType.agent:
			if (target === Target.Claude) {
				return claudeAgentAttributes[attributeName];
			}
			return customAgentAttributes[attributeName];
		case PromptsType.prompt:
			return promptFileAttributes[attributeName];
		default:
			return undefined;
	}
}

// The list of tools known to be used by GitHub Copilot custom agents
export const knownGithubCopilotTools = [
	{ name: SpecedToolAliases.execute, description: localize('githubCopilot.execute', 'Execute commands') },
	{ name: SpecedToolAliases.read, description: localize('githubCopilot.read', 'Read files') },
	{ name: SpecedToolAliases.edit, description: localize('githubCopilot.edit', 'Edit files') },
	{ name: SpecedToolAliases.search, description: localize('githubCopilot.search', 'Search files') },
	{ name: SpecedToolAliases.agent, description: localize('githubCopilot.agent', 'Use subagents') },
];

export interface IValueEntry {
	readonly name: string;
	readonly description?: string;
}

export const knownClaudeTools = [
	{ name: 'Bash', description: localize('claude.bash', 'Execute shell commands'), toolEquivalent: [SpecedToolAliases.execute] },
	{ name: 'Edit', description: localize('claude.edit', 'Make targeted file edits'), toolEquivalent: ['edit/editNotebook', 'edit/editFiles'] },
	{ name: 'Glob', description: localize('claude.glob', 'Find files by pattern'), toolEquivalent: ['search/fileSearch'] },
	{ name: 'Grep', description: localize('claude.grep', 'Search file contents with regex'), toolEquivalent: ['search/textSearch'] },
	{ name: 'Read', description: localize('claude.read', 'Read file contents'), toolEquivalent: ['read/readFile', 'read/getNotebookSummary'] },
	{ name: 'Write', description: localize('claude.write', 'Create/overwrite files'), toolEquivalent: ['edit/createDirectory', 'edit/createFile', 'edit/createJupyterNotebook'] },
	{ name: 'WebFetch', description: localize('claude.webFetch', 'Fetch URL content'), toolEquivalent: [SpecedToolAliases.web] },
	{ name: 'WebSearch', description: localize('claude.webSearch', 'Perform web searches'), toolEquivalent: [SpecedToolAliases.web] },
	{ name: 'Task', description: localize('claude.task', 'Run subagents for complex tasks'), toolEquivalent: [SpecedToolAliases.agent] },
	{ name: 'Skill', description: localize('claude.skill', 'Execute skills'), toolEquivalent: [] },
	{ name: 'LSP', description: localize('claude.lsp', 'Code intelligence (requires plugin)'), toolEquivalent: [] },
	{ name: 'NotebookEdit', description: localize('claude.notebookEdit', 'Modify Jupyter notebooks'), toolEquivalent: ['edit/editNotebook'] },
	{ name: 'AskUserQuestion', description: localize('claude.askUserQuestion', 'Ask multiple-choice questions'), toolEquivalent: ['vscode/askQuestions'] },
	{ name: 'MCPSearch', description: localize('claude.mcpSearch', 'Searches for MCP tools when tool search is enabled'), toolEquivalent: [] }
];

export const knownClaudeModels = [
	{ name: 'sonnet', description: localize('claude.sonnet', 'Latest Claude Sonnet'), modelEquivalent: 'Claude Sonnet 4.5 (copilot)' },
	{ name: 'opus', description: localize('claude.opus', 'Latest Claude Opus'), modelEquivalent: 'Claude Opus 4.6 (copilot)' },
	{ name: 'haiku', description: localize('claude.haiku', 'Latest Claude Haiku, fast for simple tasks'), modelEquivalent: 'Claude Haiku 4.5 (copilot)' },
	{ name: 'inherit', description: localize('claude.inherit', 'Inherit model from parent agent or prompt'), modelEquivalent: undefined },
];

export function mapClaudeModels(claudeModelNames: readonly string[]): readonly string[] {
	const result = [];
	for (const name of claudeModelNames) {
		const claudeModel = knownClaudeModels.find(model => model.name === name);
		if (claudeModel && claudeModel.modelEquivalent) {
			result.push(claudeModel.modelEquivalent);
		}
	}
	return result;
}

/**
 * Maps Claude tool names to their VS Code tool equivalents.
 */
export function mapClaudeTools(claudeToolNames: readonly string[]): string[] {
	const result: string[] = [];
	for (const name of claudeToolNames) {
		const claudeTool = knownClaudeTools.find(tool => tool.name === name);
		if (claudeTool) {
			result.push(...claudeTool.toolEquivalent);
		}
	}
	return result;
}

export const claudeAgentAttributes: Record<string, IAttributeDefinition> = {
	'name': {
		type: 'scalar',
		description: localize('attribute.name', "Unique identifier using lowercase letters and hyphens (required)"),
	},
	'description': {
		type: 'scalar',
		description: localize('attribute.description', "When to delegate to this subagent (required)"),
	},
	'tools': {
		type: 'sequence',
		description: localize('attribute.tools', "Array of tools the subagent can use. Inherits all tools if omitted"),
		defaults: ['Read, Edit, Bash'],
		items: knownClaudeTools
	},
	'disallowedTools': {
		type: 'sequence',
		description: localize('attribute.disallowedTools', "Tools to deny, removed from inherited or specified list"),
		defaults: ['Write, Edit, Bash'],
		items: knownClaudeTools
	},
	'model': {
		type: 'scalar',
		description: localize('attribute.model', "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit."),
		defaults: ['sonnet', 'opus', 'haiku', 'inherit'],
		enums: knownClaudeModels
	},
	'permissionMode': {
		type: 'scalar',
		description: localize('attribute.permissionMode', "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan."),
		defaults: ['default', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan'],
		enums: [
			{ name: 'default', description: localize('claude.permissionMode.default', 'Standard behavior: prompts for permission on first use of each tool.') },
			{ name: 'acceptEdits', description: localize('claude.permissionMode.acceptEdits', 'Automatically accepts file edit permissions for the session.') },
			{ name: 'plan', description: localize('claude.permissionMode.plan', 'Plan Mode: Claude can analyze but not modify files or execute commands.') },
			{ name: 'delegate', description: localize('claude.permissionMode.delegate', 'Coordination-only mode for agent team leads. Only available when an agent team is active.') },
			{ name: 'dontAsk', description: localize('claude.permissionMode.dontAsk', 'Auto-denies tools unless pre-approved via /permissions or permissions.allow rules.') },
			{ name: 'bypassPermissions', description: localize('claude.permissionMode.bypassPermissions', 'Skips all permission prompts (requires safe environment like containers).') }
		]
	},
	'skills': {
		type: 'sequence',
		description: localize('attribute.skills', "Skills to load into the subagent's context at startup."),
	},
	'mcpServers': {
		type: 'sequence',
		description: localize('attribute.mcpServers', "MCP servers available to this subagent."),
	},
	'hooks': {
		type: 'object',
		description: localize('attribute.hooks', "Lifecycle hooks scoped to this subagent."),
	},
	'memory': {
		type: 'scalar',
		description: localize('attribute.memory', "Persistent memory scope: user, project, or local. Enables cross-session learning."),
		defaults: ['user', 'project', 'local'],
		enums: [
			{ name: 'user', description: localize('claude.memory.user', "Remember learnings across all projects.") },
			{ name: 'project', description: localize('claude.memory.project', "The subagent's knowledge is project-specific and shareable via version control.") },
			{ name: 'local', description: localize('claude.memory.local', "The subagent's knowledge is project-specific but should not be checked into version control.") }
		]
	}
};

/**
 * Attributes supported in Claude rules files (`.claude/rules/*.md`).
 * Claude rules use `paths` instead of `applyTo` for glob patterns.
 */
export const claudeRulesAttributes: Record<string, IAttributeDefinition> = {
	'description': {
		type: 'scalar',
		description: localize('attribute.rules.description', "A description of what this rule covers, used to provide context about when it applies."),
	},
	'paths': {
		type: 'sequence',
		description: localize('attribute.rules.paths', "Array of glob patterns that describe for which files the rule applies. Based on these patterns, the file is automatically included in the prompt when the context contains a file that matches.\nExample: `['src/**/*.ts', 'test/**']`"),
	},
};

export function isVSCodeOrDefaultTarget(target: Target): boolean {
	return target === Target.VSCode || target === Target.Undefined;
}

export function getTarget(promptType: PromptsType, header: PromptHeader | URI): Target {
	const uri = header instanceof URI ? header : header.uri;
	if (promptType === PromptsType.agent) {
		const parentDir = dirname(uri);
		if (parentDir.path.endsWith(`/${CLAUDE_AGENTS_SOURCE_FOLDER}`)) {
			return Target.Claude;
		}
		if (!(header instanceof URI)) {
			const target = header.target;
			if (target === Target.GitHubCopilot || target === Target.VSCode) {
				return target;
			}
		}
		return Target.Undefined;
	} else if (promptType === PromptsType.instructions) {
		if (isInClaudeRulesFolder(uri)) {
			return Target.Claude;
		}
	}
	return Target.Undefined;
}
