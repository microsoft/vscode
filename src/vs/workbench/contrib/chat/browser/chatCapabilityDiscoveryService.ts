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
	getCapabilityOverviewPrompt(): string;
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
					prompt: localize('chatEngagement.showCapabilitiesPrompt', "What are all the different ways you can help me with programming? Give me a comprehensive overview with examples for each capability."),
				},
				{
					icon: Codicon.question,
					label: localize('chatEngagement.howToUse', "How to interact effectively"),
					prompt: localize('chatEngagement.howToUsePrompt', "I'm new to AI programming assistants. How can I interact with you most effectively? What are the best practices for asking programming questions and getting useful help?"),
				},
				{
					icon: Codicon.mortarBoard,
					label: localize('chatEngagement.exploreLearning', "Explore learning paths"),
					prompt: localize('chatEngagement.exploreLearningPrompt', "I want to learn programming but I'm not sure where to start. Can you help me explore different learning paths and suggest what to focus on first?"),
				}
			];
		} else {
			return [
				{
					icon: Codicon.gear,
					label: localize('chatEngagement.projectSpecific', "Project-specific help"),
					prompt: localize('chatEngagement.projectSpecificPrompt', "Based on this project structure, what are the most useful ways you can help me? Analyze my codebase and suggest specific areas where I could use assistance."),
				},
				{
					icon: Codicon.rocket,
					label: localize('chatEngagement.optimize', "Optimize this project"),
					prompt: localize('chatEngagement.optimizePrompt', "Analyze this project and suggest ways to improve performance, structure, and maintainability. Help me understand what could be enhanced."),
				},
				{
					icon: Codicon.shield,
					label: localize('chatEngagement.bestPractices', "Best practices review"),
					prompt: localize('chatEngagement.bestPracticesPrompt', "Review this codebase for adherence to best practices and suggest improvements. Help me understand what's working well and what could be better."),
				}
			];
		}
	}

	/**
	 * Provides a comprehensive capability overview prompt for users who want to discover 
	 * what the AI assistant can help with. This addresses the scenario where users are 
	 * in an exploratory phase and haven't specified a particular task yet.
	 */
	getCapabilityOverviewPrompt(): string {
		return localize('chatCapability.overviewPrompt', 
			`I'd like to understand what you can help me with as a programming assistant. Please provide:

1. **Core Capabilities** - What are your main areas of expertise in programming?
2. **Practical Examples** - Show me specific examples of tasks you can help with
3. **Best Practices** - How should I ask questions to get the most helpful responses?
4. **Getting Started** - If I'm new to working with AI assistants, what should I try first?

Please make this interactive - I want to understand not just what you can do, but how we can work together effectively on programming tasks.`);
	}
}