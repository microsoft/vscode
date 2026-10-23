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
import { AskAgentProvider } from '../askAgentProvider';

suite('AskAgentProvider', () => {
	let disposables: DisposableStore;
	let mockConfigurationService: InMemoryConfigurationService;
	let fileSystemService: IFileSystemService;
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();

		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		const globalStoragePath = path.join(os.tmpdir(), 'ask-agent-test-' + Date.now());
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
		const provider = instantiationService.createInstance(AskAgentProvider);
		disposables.add(provider);
		return provider;
	}

	async function getAgentContent(agent: vscode.ChatResource): Promise<string> {
		const content = await fileSystemService.readFile(agent.uri);
		return new TextDecoder().decode(content);
	}

	test('provideCustomAgents() returns an Ask agent with correct structure', async () => {
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

		// Should contain base read-only tools
		assert.ok(content.includes('search'));
		assert.ok(content.includes('read'));
		assert.ok(content.includes('web'));
		assert.ok(content.includes('github/issue_read'));

		// Should NOT contain editing tools

		assert.ok(!content.includes('\'edit'), 'Should not have edit or edit/... tools');
		assert.ok(!content.includes('\'execute/run'), 'Should not have any execute/run... tool');

		// Should have correct metadata
		assert.ok(content.includes('name: Ask'));
		assert.ok(content.includes('description: Answers questions without making changes'));
	});

	test('merges additionalTools setting with base tools', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentAdditionalTools, ['customTool1', 'customTool2']);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should contain base tools
		assert.ok(content.includes('search'));
		assert.ok(content.includes('read'));

		// Should contain additional tools
		assert.ok(content.includes('customTool1'));
		assert.ok(content.includes('customTool2'));
	});

	test('deduplicates tools when additionalTools overlaps with base tools', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentAdditionalTools, ['search', 'newTool']);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Count occurrences of 'search' in tools list
		const toolsMatch = content.match(/tools: \[([^\]]+)\]/);
		assert.ok(toolsMatch, 'Tools list not found in agent content');
		const toolsSection = toolsMatch[1];
		const searchCount = (toolsSection.match(/'search'/g) || []).length;
		assert.equal(searchCount, 1, 'search tool should appear only once after deduplication');

		// Should contain new tool
		assert.ok(content.includes('newTool'));
	});

	test('applies model override from settings', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentModel, 'Claude Haiku 4.5 (copilot)');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		assert.ok(content.includes('model: Claude Haiku 4.5 (copilot)'));
	});

	test('applies both additionalTools and model settings together', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentAdditionalTools, ['extraTool']);
		await mockConfigurationService.setConfig(ConfigKey.AskAgentModel, 'claude-3-sonnet');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		assert.ok(content.includes('extraTool'));
		assert.ok(content.includes('model: claude-3-sonnet'));
	});

	test('fires onDidChangeCustomAgents when additionalTools setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setConfig(ConfigKey.AskAgentAdditionalTools, ['newTool']);

		assert.equal(eventFired, true);
	});

	test('fires onDidChangeCustomAgents when model setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		await mockConfigurationService.setConfig(ConfigKey.AskAgentModel, 'new-model');

		assert.equal(eventFired, true);
	});

	test('does not fire onDidChangeCustomAgents for unrelated setting changes', async () => {
		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

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
		assert.ok(provider.label.includes('Ask'));
	});

	test('preserves body content after frontmatter when applying settings', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentModel, 'test-model');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		assert.ok(content.includes('You are an ASK AGENT'));
		assert.ok(content.includes('NEVER modify files or run commands that change state'));
	});

	test('handles empty additionalTools array gracefully', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentAdditionalTools, []);

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		// Should have base tools only
		assert.ok(content.includes('search'));
		assert.ok(content.includes('read'));
	});

	test('handles empty model string gracefully', async () => {
		await mockConfigurationService.setConfig(ConfigKey.AskAgentModel, '');

		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const content = await getAgentContent(agents[0]);

		assert.ok(!content.includes('model:'));
	});

	test('does not include handoffs section', async () => {
		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		assert.ok(!content.includes('handoffs:'), 'Ask agent should not have handoffs');
	});

	test('body content instructs not to edit files', async () => {
		const provider = createProvider();
		const agents = await provider.provideCustomAgents({}, {} as any);

		const content = await getAgentContent(agents[0]);

		assert.ok(content.includes('NEVER modify files'));
		assert.ok(content.includes('NEVER use file editing tools'));
	});
});
