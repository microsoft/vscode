/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { SpecedToolAliases } from '../../tools/languageModelToolsService.js';
import { CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder } from '../config/promptFileLocations.js';
import { PromptHeaderAttributes } from '../promptFileParser.js';
import { PromptsType, Target } from '../promptTypes.js';
export var GithubPromptHeaderAttributes;
(function (GithubPromptHeaderAttributes) {
    GithubPromptHeaderAttributes.mcpServers = 'mcp-servers';
    GithubPromptHeaderAttributes.github = 'github';
})(GithubPromptHeaderAttributes || (GithubPromptHeaderAttributes = {}));
export var ClaudeHeaderAttributes;
(function (ClaudeHeaderAttributes) {
    ClaudeHeaderAttributes.disallowedTools = 'disallowedTools';
})(ClaudeHeaderAttributes || (ClaudeHeaderAttributes = {}));
export function isTarget(value) {
    return value === Target.VSCode || value === Target.GitHubCopilot || value === Target.Claude || value === Target.Undefined;
}
const booleanAttributeEnumValues = [
    { name: 'true' },
    { name: 'false' }
];
const targetAttributeEnumValues = [
    { name: 'vscode' },
    { name: 'github-copilot' },
];
// Attribute metadata for prompt files (`*.prompt.md`).
export const promptFileAttributes = {
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
export const instructionAttributes = {
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
export const customAgentAttributes = {
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
export const skillAttributes = {
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
const allAttributeNames = {
    [PromptsType.prompt]: Object.keys(promptFileAttributes),
    [PromptsType.instructions]: Object.keys(instructionAttributes),
    [PromptsType.agent]: Object.keys(customAgentAttributes),
    [PromptsType.skill]: Object.keys(skillAttributes),
    [PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, GithubPromptHeaderAttributes.github, PromptHeaderAttributes.infer];
const recommendedAttributeNames = {
    [PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.agent]: allAttributeNames[PromptsType.agent].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.skill]: allAttributeNames[PromptsType.skill].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
export function getValidAttributeNames(promptType, includeNonRecommended, target) {
    if (target === Target.Claude) {
        if (promptType === PromptsType.instructions) {
            return Object.keys(claudeRulesAttributes);
        }
        return Object.keys(claudeAgentAttributes);
    }
    else if (target === Target.GitHubCopilot) {
        if (promptType === PromptsType.agent) {
            return githubCopilotAgentAttributeNames;
        }
    }
    return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}
export function isNonRecommendedAttribute(attributeName) {
    return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}
export function getAttributeDefinition(attributeName, promptType, target) {
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
export function mapClaudeModels(claudeModelNames) {
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
export function mapClaudeTools(claudeToolNames) {
    const result = [];
    for (const name of claudeToolNames) {
        const claudeTool = knownClaudeTools.find(tool => tool.name === name);
        if (claudeTool) {
            result.push(...claudeTool.toolEquivalent);
        }
    }
    return result;
}
export const claudeAgentAttributes = {
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
export const claudeRulesAttributes = {
    'description': {
        type: 'scalar',
        description: localize('attribute.rules.description', "A description of what this rule covers, used to provide context about when it applies."),
    },
    'paths': {
        type: 'sequence',
        description: localize('attribute.rules.paths', "Array of glob patterns that describe for which files the rule applies. Based on these patterns, the file is automatically included in the prompt when the context contains a file that matches.\nExample: `['src/**/*.ts', 'test/**']`"),
    },
};
export function isVSCodeOrDefaultTarget(target) {
    return target === Target.VSCode || target === Target.Undefined;
}
export function getTarget(promptType, header) {
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
    }
    else if (promptType === PromptsType.instructions) {
        if (isInClaudeRulesFolder(uri)) {
            return Target.Claude;
        }
    }
    return Target.Undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0RmlsZUF0dHJpYnV0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDN0UsT0FBTyxFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEcsT0FBTyxFQUFnQixzQkFBc0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFeEQsTUFBTSxLQUFXLDRCQUE0QixDQUc1QztBQUhELFdBQWlCLDRCQUE0QjtJQUMvQix1Q0FBVSxHQUFHLGFBQWEsQ0FBQztJQUMzQixtQ0FBTSxHQUFHLFFBQVEsQ0FBQztBQUNoQyxDQUFDLEVBSGdCLDRCQUE0QixLQUE1Qiw0QkFBNEIsUUFHNUM7QUFFRCxNQUFNLEtBQVcsc0JBQXNCLENBRXRDO0FBRkQsV0FBaUIsc0JBQXNCO0lBQ3pCLHNDQUFlLEdBQUcsaUJBQWlCLENBQUM7QUFDbEQsQ0FBQyxFQUZnQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBRXRDO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxLQUFjO0lBQ3RDLE9BQU8sS0FBSyxLQUFLLE1BQU0sQ0FBQyxNQUFNLElB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