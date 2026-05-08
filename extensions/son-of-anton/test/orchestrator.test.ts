/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { AgentManager } from 'son-of-anton-core/agents/AgentManager';
import { LlmClient } from 'son-of-anton-core/llm/LlmClient';
import { MetricsTracker } from 'son-of-anton-core/agents/MetricsTracker';
import { ProjectMemory } from 'son-of-anton-core/agents/ProjectMemory';
import { OrchestratorAgent } from 'son-of-anton-core/agents/OrchestratorAgent';
import { CodeGeneratorAgent } from 'son-of-anton-core/agents/CodeGeneratorAgent';
import { TestWriterAgent } from 'son-of-anton-core/agents/TestWriterAgent';
import { SecurityScannerAgent } from 'son-of-anton-core/agents/SecurityScannerAgent';
import { DocumentationAgent } from 'son-of-anton-core/agents/DocumentationAgent';
import { ReviewAgent } from 'son-of-anton-core/agents/ReviewAgent';
import { McpClient } from 'son-of-anton-core/mcp/McpClient';
import { AgentConfig } from 'son-of-anton-core/agents/types';

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
