/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { buildAgentMarkdown } from '../agentTypes';
import { PlanAgentProvider } from '../planAgentProvider';

suite('PlanAgentProvider', () => {
	let disposables: DisposableStore;
	let mockConfigurationService: InMemoryConfigurationService;
	let fileSystemService: IFileSystemService;
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();

		// Set up testing services with a mock extension context that has globalStorageUri
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		const globalStoragePath = path.join(os.tmpdir(), 'plan-agent-test-' + Date.now());
		testingServiceCollection.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, [globalStoragePath]));
		accessor = testingServiceCollection.createTestingAccessor();
		disposables.add(accessor);
		instantiationService = accessor.get(IInstantiationService);

		mockConfigurationService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		fileSystemService = accessor.get(IFileSystemService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createProvider() {
		const provider = instantiationService.createInstance(PlanAgentProvider);
		disposables.add(provider);
		return provider;
	}

	async function getAgentContent(agent: vscode.ChatResource): Promise<string> {
		const content = await fileSystemService.readFile(agent.uri);
		return new TextDecoder().decode(content);
	}

	test('provideCustomAgents() returns a Plan agent with correct structure', async () => {
		const provider = createProvider();

		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		assert.ok(agents[0].uri, 'Agent should have a URI');
		assert.ok(agents[0].uri.path.endsWith('.agent.md'), 'Agent URI should end with .agent.md');
	});

	test('returns agent content with base frontmatter when no settings configured', async () => {
		const provider = createProvider();

		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain base tools
		assert.ok(content.includes('github/issue_read'));
		assert.ok(content.includes('agent'));
		assert.ok(content.includes('search'));
		assert.ok(content.includes('read'));
		assert.ok(content.includes('memory'));

		// Should not have model override (not in base content)
		assert.ok(content.includes('name: Plan'));
		assert.ok(content.includes('description: Researches and outlines multi-step plans'));
	});

	test('merges additionalTools setting with base tools', async () => {
		await mockConfigurationService.setConfig(ConfigKey.PlanAgentAdditionalTools, ['customTool1', 'customTool2']);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain base tools
		assert.ok(content.includes('github/issue_read'));
		assert.ok(content.includes('agent'));

		// Should contain additional tools
		assert.ok(content.includes('customTool1'));
		assert.ok(content.includes('customTool2'));
	});

	test('deduplicates tools when additionalTools overlaps with base tools', async () => {
		// Add a tool that already exists in base
		await mockConfigurationService.setConfig(ConfigKey.PlanAgentAdditionalTools, ['agent', 'newTool']);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Count occurrences of 'agent' in tools list (flow-style array)
		// Should appear only once due to deduplication
		const toolsMatch = content.match(/tools: \[([^\]]+)\]/);
		assert.ok(toolsMatch, 'Tools list not found in agent content');
		const toolsSection = toolsMatch[1];
		const agentCount = (toolsSection.match(/'agent'/g) || []).length;
		assert.equal(agentCount, 1, 'agent tool should appear only once after deduplication');

		// Should contain new tool
		assert.ok(content.includes('newTool'));
	});

	test('applies model override from settings', async () => {
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'Claude Haiku 4.5 (copilot)');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain model override
		assert.ok(content.includes('model: Claude Haiku 4.5 (copilot)'));
	});

	test('applies core default model when configured', async () => {
		await mockConfigurationService.setNonExtensionConfig('chat.planAgent.defaultModel', 'Claude Haiku 4.5 (copilot)');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain model override from core setting
		assert.ok(content.includes('model: Claude Haiku 4.5 (copilot)'));
	});

	test('prefers core default model over extension setting', async () => {
		await mockConfigurationService.setNonExtensionConfig('chat.planAgent.defaultModel', 'core-model');
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'extension-model');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain core model override
		assert.ok(content.includes('model: core-model'));
		assert.ok(!content.includes('model: extension-model'));
	});

	test('applies both additionalTools and model settings together', async () => {
		await mockConfigurationService.setConfig(ConfigKey.PlanAgentAdditionalTools, ['extraTool']);
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'claude-3-sonnet');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain additional tool
		assert.ok(content.includes('extraTool'));

		// Should contain model override
		assert.ok(content.includes('model: claude-3-sonnet'));
	});

	test('fires onDidChangeCustomAgents when additionalTools setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setConfig(ConfigKey.PlanAgentAdditionalTools, ['newTool']);

		assert.equal(eventFired, true);
	});

	test('fires onDidChangeCustomAgents when model setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'new-model');

		assert.equal(eventFired, true);
	});

	test('fires onDidChangeCustomAgents when core default model changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setNonExtensionConfig('chat.planAgent.defaultModel', 'core-model');

		assert.equal(eventFired, true);
	});

	test('does not fire onDidChangeCustomAgents for unrelated setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		// Set an unrelated config (using a different config key)
		await mockConfigurationService.setConfig(ConfigKey.Advanced.FeedbackOnChange, true);

		assert.equal(eventFired, false);
	});

	test('always includes askQuestions tool in generated content', async () => {
		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		assert.ok(content.includes('vscode/askQuestions'));
	});

	test('has correct label property', () => {
		const provider = createProvider();
		assert.ok(provider.label.includes('Plan'));
	});

	test('preserves body content after frontmatter when applying settings', async () => {
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'test-model');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		// Should preserve body content
		assert.ok(content.includes('You are a PLANNING AGENT, pairing with the user'));
		assert.ok(content.includes('Your SOLE responsibility is planning. NEVER start implementation.'));
	});

	test('handles empty additionalTools array gracefully', async () => {
		await mockConfigurationService.setConfig(ConfigKey.PlanAgentAdditionalTools, []);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should have base tools only
		assert.ok(content.includes('github/issue_read'));
		assert.ok(content.includes('agent'));
	});

	test('handles empty model string gracefully', async () => {
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, '');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should not have model field added
		assert.ok(!content.includes('model:'));
	});

	test('falls back to extension setting when core default model is empty string', async () => {
		await mockConfigurationService.setNonExtensionConfig('chat.planAgent.defaultModel', '');
		await mockConfigurationService.setConfig(ConfigKey.Deprecated.PlanAgentModel, 'fallback-model');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Empty core setting should fall through to extension setting
		assert.ok(content.includes('model: fallback-model'));
	});

	test('includes handoffs in generated content', async () => {
		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		// Should contain handoffs
		assert.ok(content.includes('handoffs:'));
		assert.ok(content.includes('label: Start Implementation'));
		assert.ok(content.includes('label: Open in Editor'));
		assert.ok(content.includes('agent: agent'));
		assert.ok(content.includes('send: true'));
	});

	test('applies ImplementAgentModel to Start Implementation handoff', async () => {
		await mockConfigurationService.setConfig(ConfigKey.ImplementAgentModel, 'Claude Haiku 4.5 (copilot)');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain Start Implementation handoff with model override
		assert.ok(content.includes('label: Start Implementation'));
		assert.ok(content.includes('model: Claude Haiku 4.5 (copilot)'));
	});

	test('does not include model in handoff when ImplementAgentModel is not set', async () => {
		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		// Find the Start Implementation handoff section
		const handoffsStart = content.indexOf('handoffs:');
		const handoffsSection = content.slice(handoffsStart, content.indexOf('---', handoffsStart));

		// Should not contain model field in handoffs when not configured
		assert.ok(!handoffsSection.includes('model:'), 'Should not have model field in handoffs when ImplementAgentModel is not set');
	});

	test('fires onDidChangeCustomAgents when ImplementAgentModel setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setConfig(ConfigKey.ImplementAgentModel, 'new-model');

		assert.equal(eventFired, true);
	});
});

suite('buildAgentMarkdown', () => {
	test('generates expected full content for Plan agent (snapshot test)', () => {
		// This test outputs the full generated content for easy visual review of format changes
		const config = {
			name: 'Plan',
			description: 'Researches and outlines multi-step plans',
			argumentHint: 'Outline the goal or problem to research',
			tools: ['github/issue_read', 'agent', 'search', 'memory'],
			model: 'Claude Haiku 4.5 (copilot)',
			handoffs: [
				{
					label: 'Start Implementation',
					agent: 'agent',
					prompt: 'Start implementation',
					send: true
				}
			],
			body: 'You are a PLANNING AGENT.'
		};

		const result = buildAgentMarkdown(config);

		assert.deepStrictEqual(result,
			`---
name: Plan
description: Researches and outlines multi-step plans
argument-hint: Outline the goal or problem to research
model: Claude Haiku 4.5 (copilot)
tools: ['github/issue_read', 'agent', 'search', 'memory']
handoffs:
  - label: Start Implementation
    agent: agent
    prompt: 'Start implementation'
    send: true
---
You are a PLANNING AGENT.`);
	});

	test('generates valid YAML frontmatter with basic config', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test description',
			argumentHint: 'Test hint',
			tools: ['tool1', 'tool2'],
			handoffs: [],
			body: 'Test body content'
		};

		const result = buildAgentMarkdown(config);

		assert.ok(result.startsWith('---\n'));
		assert.ok(result.includes('name: TestAgent'));
		assert.ok(result.includes('description: Test description'));
		assert.ok(result.includes('argument-hint: Test hint'));
		assert.ok(result.includes('tools: [\'tool1\', \'tool2\']'));
		assert.ok(result.includes('---\nTest body content'));
	});

	test('includes model when provided', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: [],
			model: 'Claude Haiku 4.5 (copilot)',
			handoffs: [],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		assert.ok(result.includes('model: Claude Haiku 4.5 (copilot)'));
	});

	test('omits model when not provided', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: [],
			handoffs: [],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		assert.ok(!result.includes('model:'));
	});

	test('generates handoffs in block style', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: [],
			handoffs: [
				{
					label: 'Continue',
					agent: 'agent',
					prompt: 'Do the thing',
					send: true
				},
				{
					label: 'Save',
					agent: 'editor',
					prompt: 'Save it',
					showContinueOn: false
				}
			],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		assert.ok(result.includes('handoffs:'));
		assert.ok(result.includes('  - label: Continue'));
		assert.ok(result.includes('    agent: agent'));
		assert.ok(result.includes('    prompt: \'Do the thing\''));
		assert.ok(result.includes('    send: true'));
		assert.ok(result.includes('  - label: Save'));
		assert.ok(result.includes('    prompt: \'Save it\''));
		assert.ok(result.includes('    showContinueOn: false'));
	});

	test('handles empty tools array', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: [],
			handoffs: [],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		// Should not have tools line when empty
		assert.ok(!result.includes('tools:'));
	});

	test('quotes tool names in flow-style array', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: ['github/issue_read', 'mcp_server/custom_tool'],
			handoffs: [],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		assert.ok(result.includes('tools: [\'github/issue_read\', \'mcp_server/custom_tool\']'));
	});

	test('escapes single quotes in tool names', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: ['tool\'s_name', 'another'],
			handoffs: [],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		// Single quotes should be doubled for YAML escaping
		assert.ok(result.includes('\'tool\'\'s_name\''), 'Single quote should be escaped by doubling');
	});

	test('escapes single quotes in handoff prompts', () => {
		const config = {
			name: 'TestAgent',
			description: 'Test',
			argumentHint: 'Test',
			tools: [],
			handoffs: [
				{
					label: 'Test',
					agent: 'agent',
					prompt: 'It\'s a test prompt with \'quotes\''
				}
			],
			body: 'Body'
		};

		const result = buildAgentMarkdown(config);

		// Single quotes in prompt should be doubled for YAML escaping
		assert.ok(result.includes('prompt: \'It\'\'s a test prompt with \'\'quotes\'\'\''), 'Single quotes should be escaped by doubling');
	});
});
