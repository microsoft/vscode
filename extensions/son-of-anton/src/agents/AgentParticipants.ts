/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmClient } from '../llm/LlmClient';
import { McpClient } from '../mcp/McpClient';
import { AgentManager } from './AgentManager';
import { BaseAgent } from './BaseAgent';
import { CodeGeneratorAgent } from './CodeGeneratorAgent';
import { DocumentationAgent } from './DocumentationAgent';
import { MetricsTracker } from './MetricsTracker';
import { OrchestratorAgent } from './OrchestratorAgent';
import { ProjectMemory } from './ProjectMemory';
import { ReviewAgent } from './ReviewAgent';
import { SecurityScannerAgent } from './SecurityScannerAgent';
import { TestWriterAgent } from './TestWriterAgent';
import { AgentConfig } from './types';

/**
 * Agent configuration definitions for all participants.
 */
const AGENT_CONFIGS: AgentConfig[] = [
	{
		handle: 'anton',
		displayName: 'Anton',
		description: 'AI orchestrator — routes requests to specialist agents',
		defaultModel: 'opus',
		maxRetries: 3,
		slashCommands: [
			{ name: 'plan', description: 'Create an execution plan for a request' },
			{ name: 'approve', description: 'Approve and execute the current plan' },
			{ name: 'status', description: 'Show status of active agents' },
			{ name: 'metrics', description: 'Show agent performance metrics' },
		],
	},
	{
		handle: 'anton-code',
		displayName: 'Anton Code',
		description: 'Code generation specialist — writes and modifies code',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'generate', description: 'Generate code for a specific task' },
			{ name: 'refactor', description: 'Refactor existing code' },
		],
	},
	{
		handle: 'anton-test',
		displayName: 'Anton Test',
		description: 'Test writing specialist — generates comprehensive tests',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'test', description: 'Generate tests for specified code' },
			{ name: 'coverage', description: 'Analyse test coverage gaps' },
		],
	},
	{
		handle: 'anton-security',
		displayName: 'Anton Security',
		description: 'Security analysis specialist — scans for vulnerabilities',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [
			{ name: 'scan', description: 'Scan code for security vulnerabilities' },
			{ name: 'audit', description: 'Full security audit of changed files' },
		],
	},
	{
		handle: 'anton-docs',
		displayName: 'Anton Docs',
		description: 'Documentation specialist — generates and updates docs',
		defaultModel: 'haiku',
		maxRetries: 3,
		slashCommands: [
			{ name: 'document', description: 'Generate documentation for code' },
			{ name: 'changelog', description: 'Generate a changelog entry' },
		],
	},
];

/**
 * Registers all agent chat participants with VS Code.
 * Returns disposables for cleanup.
 */
export function registerAgentParticipants(
	context: vscode.ExtensionContext,
	llmClient: LlmClient,
	mcpClient: McpClient,
	agentManager: AgentManager,
): vscode.Disposable[] {
	const metricsTracker = new MetricsTracker();
	const projectMemory = new ProjectMemory();
	const disposables: vscode.Disposable[] = [];

	// Load project memory on startup
	projectMemory.loadMemory().catch(err => {
		console.warn('Failed to load project memory:', err);
	});

	// Create specialist agents
	const configs = new Map(AGENT_CONFIGS.map(c => [c.handle, c]));

	const codeAgent = new CodeGeneratorAgent(
		configs.get('anton-code')!,
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

	const testAgent = new TestWriterAgent(
		configs.get('anton-test')!,
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

	const securityAgent = new SecurityScannerAgent(
		configs.get('anton-security')!,
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

	const docsAgent = new DocumentationAgent(
		configs.get('anton-docs')!,
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

const reviewAgent = new ReviewAgent(
		// The review agent should have its own identity for metrics and clarity.
		{
			handle: 'anton-review',
			displayName: 'Anton Review',
			description: 'Code quality and review specialist',
			defaultModel: 'sonnet',
			maxRetries: 3,
			slashCommands: [],
		},
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

	// Create orchestrator and register specialists
	const orchestrator = new OrchestratorAgent(
		configs.get('anton')!,
		llmClient, mcpClient, agentManager, metricsTracker, projectMemory,
	);

	orchestrator.registerSpecialist(codeAgent);
	orchestrator.registerSpecialist(testAgent);
	orchestrator.registerSpecialist(securityAgent);
	orchestrator.registerSpecialist(docsAgent);
	orchestrator.setReviewAgent(reviewAgent);

	// Register chat participants
	const agents: [AgentConfig, BaseAgent][] = [
		[configs.get('anton')!, orchestrator],
		[configs.get('anton-code')!, codeAgent],
		[configs.get('anton-test')!, testAgent],
		[configs.get('anton-security')!, securityAgent],
		[configs.get('anton-docs')!, docsAgent],
	];

	for (const [config, agent] of agents) {
		const participant = vscode.chat.createChatParticipant(
			`sota.${config.handle}`,
			(request, chatContext, stream, token) =>
				agent.handleChatRequest(request, chatContext, stream, token),
		);

		participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');

		disposables.push(participant);
	}

	// Persist metrics on deactivation
	disposables.push(new vscode.Disposable(() => {
		metricsTracker.persistMetrics().catch(err => {
			console.warn('Failed to persist metrics:', err);
		});
	}));

	// Command to record project memory
	disposables.push(
		vscode.commands.registerCommand('sota.recordMemory', async () => {
			const category = await vscode.window.showQuickPick(
				['decision', 'convention', 'warning', 'context'],
				{ placeHolder: 'Memory category' },
			);
			if (!category) {
				return;
			}

			const content = await vscode.window.showInputBox({
				prompt: 'What should be remembered?',
				placeHolder: 'Enter the memory content...',
			});
			if (!content) {
				return;
			}

			await projectMemory.recordMemory({
				category: category as 'decision' | 'convention' | 'warning' | 'context',
				content,
				source: 'user',
			});

			vscode.window.showInformationMessage('Memory recorded.');
		}),
	);

	return disposables;
}
