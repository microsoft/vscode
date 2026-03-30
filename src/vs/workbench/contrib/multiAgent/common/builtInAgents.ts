/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentDefinition } from './agentLaneService.js';

/**
 * Built-in agent templates shipped with VS Code.
 * Users can create custom agents via the Agent Lanes UI.
 */
export const BUILT_IN_AGENT_DEFINITIONS: IAgentDefinition[] = [
	{
		id: 'builtin-planner',
		name: 'Planner',
		role: 'planner',
		description: 'Technical planning and architecture design',
		systemInstructions: 'You are a technical architect specializing in system design, task decomposition, and implementation planning. Analyze requirements, identify risks, and create actionable implementation plans.',
		modelId: 'claude-opus-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'layout',
		isBuiltIn: true,
		capabilities: ['file-read', 'web-search'],
		maxConcurrentTasks: 1,
	},
	{
		id: 'builtin-coder',
		name: 'Coder',
		role: 'coder',
		description: 'Full-stack code implementation',
		systemInstructions: 'You are an expert software engineer. Write clean, maintainable, and well-tested code. Follow existing codebase conventions and patterns. Handle edge cases and error scenarios.',
		modelId: 'claude-sonnet-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'code',
		isBuiltIn: true,
		capabilities: ['code-edit', 'file-read', 'file-write', 'terminal'],
		maxConcurrentTasks: 1,
	},
	{
		id: 'builtin-designer',
		name: 'Designer',
		role: 'designer',
		description: 'UI/UX design and frontend implementation',
		systemInstructions: 'You are a UI/UX designer and frontend developer. Create accessible, responsive, and visually polished interfaces. Follow design system guidelines and modern UX patterns.',
		modelId: 'claude-sonnet-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'paintcan',
		isBuiltIn: true,
		capabilities: ['code-edit', 'file-read', 'file-write', 'image-gen'],
		maxConcurrentTasks: 1,
	},
	{
		id: 'builtin-tester',
		name: 'Tester',
		role: 'tester',
		description: 'Testing, validation, and quality assurance',
		systemInstructions: 'You are a QA engineer specializing in writing comprehensive tests. Create unit, integration, and end-to-end tests. Validate error handling and edge cases. Ensure high code coverage.',
		modelId: 'claude-sonnet-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'beaker',
		isBuiltIn: true,
		capabilities: ['file-read', 'file-write', 'terminal'],
		maxConcurrentTasks: 1,
	},
	{
		id: 'builtin-reviewer',
		name: 'Reviewer',
		role: 'reviewer',
		description: 'Code review and quality assessment',
		systemInstructions: 'You are a senior code reviewer. Identify bugs, security vulnerabilities, performance issues, and code quality problems. Provide actionable suggestions with clear reasoning.',
		modelId: 'claude-sonnet-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'checklist',
		isBuiltIn: true,
		capabilities: ['file-read'],
		maxConcurrentTasks: 1,
	},
	{
		id: 'builtin-debugger',
		name: 'Debugger',
		role: 'debugger',
		description: 'Bug investigation and root cause analysis',
		systemInstructions: 'You are a debugging specialist. Systematically investigate issues, trace through code paths, analyze logs, and identify root causes. Propose targeted fixes with minimal side effects.',
		modelId: 'claude-sonnet-4',
		providerIds: ['anthropic', 'openrouter'],
		icon: 'bug',
		isBuiltIn: true,
		capabilities: ['file-read', 'terminal'],
		maxConcurrentTasks: 1,
	},
];
