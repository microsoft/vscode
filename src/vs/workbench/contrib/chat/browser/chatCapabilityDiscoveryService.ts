/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatSuggestedPrompts } from './viewsWelcome/chatViewWelcomeController.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';

export const IChatCapabilityDiscoveryService = createDecorator<IChatCapabilityDiscoveryService>('chatCapabilityDiscoveryService');

export interface IChatCapability {
	category: string;
	icon: string;
	title: string;
	description: string;
	examples: string[];
}

export interface IChatCapabilityDiscoveryService {
	readonly _serviceBrand: undefined;
	getCapabilities(): IChatCapability[];
	getCapabilityExamples(workspaceState: WorkbenchState): IChatSuggestedPrompts[];
	getEngagementPrompts(hasWorkspace: boolean): IChatSuggestedPrompts[];
}

export class ChatCapabilityDiscoveryService implements IChatCapabilityDiscoveryService {
	readonly _serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) { }

	getCapabilities(): IChatCapability[] {
		return [
			{
				category: 'Code Generation',
				icon: 'code',
				title: 'Write and Generate Code',
				description: 'I can help you write functions, classes, and complete programs in various languages.',
				examples: [
					'Write a function to sort an array',
					'Create a React component for a login form',
					'Generate a REST API endpoint in Node.js'
				]
			},
			{
				category: 'Code Explanation',
				icon: 'book',
				title: 'Explain and Document Code',
				description: 'I can explain how code works, add comments, and help you understand complex logic.',
				examples: [
					'Explain this regular expression',
					'Add JSDoc comments to this function',
					'What does this algorithm do?'
				]
			},
			{
				category: 'Debugging',
				icon: 'bug',
				title: 'Debug and Fix Issues',
				description: 'I can help identify bugs, suggest fixes, and explain debugging strategies.',
				examples: [
					'Why is this function returning undefined?',
					'Help me fix this error message',
					'Suggest debugging steps for this issue'
				]
			},
			{
				category: 'Learning',
				icon: 'mortarboard',
				title: 'Learn Programming Concepts',
				description: 'I can teach programming concepts, design patterns, and best practices.',
				examples: [
					'Explain async/await in JavaScript',
					'What are design patterns?',
					'How does dependency injection work?'
				]
			},
			{
				category: 'Code Review',
				icon: 'checklist',
				title: 'Review and Improve Code',
				description: 'I can review your code for improvements, performance, and best practices.',
				examples: [
					'Review this code for potential issues',
					'How can I make this more efficient?',
					'Suggest improvements for readability'
				]
			},
			{
				category: 'Testing',
				icon: 'beaker',
				title: 'Write Tests',
				description: 'I can help you write unit tests, integration tests, and testing strategies.',
				examples: [
					'Write unit tests for this function',
					'Create a test suite for this class',
					'How should I test this API endpoint?'
				]
			}
		];
	}

	getCapabilityExamples(workspaceState: WorkbenchState): IChatSuggestedPrompts[] {
		const hasWorkspace = workspaceState !== WorkbenchState.EMPTY;
		
		if (!hasWorkspace) {
			return [
				{
					icon: Codicon.lightbulb,
					label: localize('chatCapability.codeGeneration', "Generate code"),
					prompt: localize('chatCapability.codeGenerationPrompt', "Write a TypeScript function that validates email addresses using regex"),
				},
				{
					icon: Codicon.book,
					label: localize('chatCapability.explainConcept', "Explain concepts"),
					prompt: localize('chatCapability.explainConceptPrompt', "Explain the difference between async/await and Promises in JavaScript with examples"),
				},
				{
					icon: Codicon.mortarboard,
					label: localize('chatCapability.learning', "Learn programming"),
					prompt: localize('chatCapability.learningPrompt', "Teach me about design patterns. Start with the Singleton pattern."),
				}
			];
		} else {
			return [
				{
					icon: Codicon.search,
					label: localize('chatCapability.analyzeCode', "Analyze this code"),
					prompt: localize('chatCapability.analyzeCodePrompt', "Review the code in this workspace and suggest improvements"),
				},
				{
					icon: Codicon.bug,
					label: localize('chatCapability.debugging', "Help with debugging"),
					prompt: localize('chatCapability.debuggingPrompt', "Help me understand and fix any issues in this codebase"),
				},
				{
					icon: Codicon.beaker,
					label: localize('chatCapability.testing', "Write tests"),
					prompt: localize('chatCapability.testingPrompt', "Help me write comprehensive tests for the main functions in this project"),
				}
			];
		}
	}

	getEngagementPrompts(hasWorkspace: boolean): IChatSuggestedPrompts[] {
		if (!hasWorkspace) {
			return [
				{
					icon: Codicon.sparkle,
					label: localize('chatEngagement.showCapabilities', "Show all capabilities"),
					prompt: localize('chatEngagement.showCapabilitiesPrompt', "What are all the different ways you can help me with programming? Give me a comprehensive overview with examples."),
				},
				{
					icon: Codicon.question,
					label: localize('chatEngagement.howToUse', "How to use you effectively"),
					prompt: localize('chatEngagement.howToUsePrompt', "How can I interact with you most effectively? What are the best practices for asking programming questions?"),
				},
				{
					icon: Codicon.newFolder,
					label: localize('chatEngagement.startProject', "Start a new project"),
					prompt: localize('chatEngagement.startProjectPrompt', "Help me start a new web development project. What technologies should I consider and how do I set it up?"),
				}
			];
		} else {
			return [
				{
					icon: Codicon.gear,
					label: localize('chatEngagement.projectSpecific', "Project-specific help"),
					prompt: localize('chatEngagement.projectSpecificPrompt', "Based on this project structure, what are the most useful ways you can help me?"),
				},
				{
					icon: Codicon.rocket,
					label: localize('chatEngagement.optimize', "Optimize this project"),
					prompt: localize('chatEngagement.optimizePrompt', "Analyze this project and suggest ways to improve performance, structure, and maintainability"),
				},
				{
					icon: Codicon.shield,
					label: localize('chatEngagement.bestPractices', "Best practices review"),
					prompt: localize('chatEngagement.bestPracticesPrompt', "Review this codebase for adherence to best practices and suggest improvements"),
				}
			];
		}
	}
}