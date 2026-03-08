/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { AgentManager } from '../src/agents/AgentManager';
import { LlmClient } from '../src/llm/LlmClient';
import { MetricsTracker } from '../src/agents/MetricsTracker';
import { ProjectMemory } from '../src/agents/ProjectMemory';
import { OrchestratorAgent } from '../src/agents/OrchestratorAgent';
import { CodeGeneratorAgent } from '../src/agents/CodeGeneratorAgent';
import { TestWriterAgent } from '../src/agents/TestWriterAgent';
import { SecurityScannerAgent } from '../src/agents/SecurityScannerAgent';
import { DocumentationAgent } from '../src/agents/DocumentationAgent';
import { ReviewAgent } from '../src/agents/ReviewAgent';
import { McpClient } from '../src/mcp/McpClient';
import { AgentConfig } from '../src/agents/types';

suite('OrchestratorAgent', () => {
	const orchestratorConfig: AgentConfig = {
		handle: 'anton',
		displayName: 'Anton',
		description: 'AI orchestrator',
		defaultModel: 'opus',
		maxRetries: 3,
		slashCommands: [],
	};

	const codeConfig: AgentConfig = {
		handle: 'anton-code',
		displayName: 'Anton Code',
		description: 'Code generation',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [],
	};

	const testConfig: AgentConfig = {
		handle: 'anton-test',
		displayName: 'Anton Test',
		description: 'Test writing',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [],
	};

	const securityConfig: AgentConfig = {
		handle: 'anton-security',
		displayName: 'Anton Security',
		description: 'Security scanning',
		defaultModel: 'sonnet',
		maxRetries: 3,
		slashCommands: [],
	};

	const docsConfig: AgentConfig = {
		handle: 'anton-docs',
		displayName: 'Anton Docs',
		description: 'Documentation',
		defaultModel: 'haiku',
		maxRetries: 3,
		slashCommands: [],
	};

	let orchestrator: OrchestratorAgent;
	let manager: AgentManager;
	let metricsTracker: MetricsTracker;

	setup(() => {
		const llmClient = null as unknown as LlmClient;
		const mcpClient = null as unknown as McpClient;
		manager = new AgentManager(llmClient);
		metricsTracker = new MetricsTracker();
		const memory = new ProjectMemory();

		orchestrator = new OrchestratorAgent(
			orchestratorConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);

		const codeAgent = new CodeGeneratorAgent(
			codeConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);
		const testAgent = new TestWriterAgent(
			testConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);
		const securityAgent = new SecurityScannerAgent(
			securityConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);
		const docsAgent = new DocumentationAgent(
			docsConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);
		const reviewAgent = new ReviewAgent(
			codeConfig, llmClient, mcpClient, manager, metricsTracker, memory,
		);

		orchestrator.registerSpecialist(codeAgent);
		orchestrator.registerSpecialist(testAgent);
		orchestrator.registerSpecialist(securityAgent);
		orchestrator.registerSpecialist(docsAgent);
		orchestrator.setReviewAgent(reviewAgent);
	});

	test('orchestrator has correct handle and model', () => {
		assert.deepStrictEqual(
			{ handle: orchestrator.handle, defaultModel: orchestrator.defaultModel },
			{ handle: 'anton', defaultModel: 'opus' },
		);
	});

	test('orchestrator displayName is set', () => {
		assert.strictEqual(orchestrator.displayName, 'Anton');
	});

	test('execute returns non-executing result for orchestrator', async () => {
		const result = await orchestrator.execute({
			instruction: 'test',
			scopeFiles: [],
			graphContext: '',
			parentTaskId: 'task-1',
		});

		assert.deepStrictEqual(
			{ success: result.success, changes: result.changes },
			{ success: true, changes: [] },
		);
	});
});
