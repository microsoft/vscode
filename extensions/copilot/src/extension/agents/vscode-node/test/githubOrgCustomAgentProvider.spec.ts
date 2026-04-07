/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { ExtensionContext } from 'vscode';
import { Scalar } from 'yaml';
import { PromptsType } from '../../../../platform/customInstructions/common/promptTypes';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { CustomAgentDetails, CustomAgentListItem, CustomAgentListOptions } from '../../../../platform/github/common/githubService';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { MockWorkspaceService } from '../../../../platform/ignore/node/test/mockWorkspaceService';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { parse } from '../../../../util/vs/base/common/yaml';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GitHubOrgChatResourcesService } from '../githubOrgChatResourcesService';
import { GitHubOrgCustomAgentProvider, looksLikeNumber, yamlString } from '../githubOrgCustomAgentProvider';
import { MockOctoKitService } from './mockOctoKitService';

suite('GitHubOrgCustomAgentProvider', () => {
	let disposables: DisposableStore;
	let mockOctoKitService: MockOctoKitService;
	let mockFileSystem: MockFileSystemService;
	let mockGitService: MockGitService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockExtensionContext: Partial<ExtensionContext>;
	let mockAuthService: MockAuthenticationService;
	let accessor: any;
	let provider: GitHubOrgCustomAgentProvider;
	let resourcesService: GitHubOrgChatResourcesService;

	const storagePath = '/tmp/test-storage';
	const storageUri = URI.file(storagePath);

	beforeEach(() => {
		vi.useFakeTimers();
		disposables = new DisposableStore();

		// Create mocks for real GitHubOrgChatResourcesService
		mockOctoKitService = new MockOctoKitService();
		mockFileSystem = new MockFileSystemService();
		mockGitService = new MockGitService();
		mockWorkspaceService = new MockWorkspaceService();
		mockExtensionContext = {
			globalStorageUri: storageUri,
		};
		mockAuthService = new MockAuthenticationService();

		// Default: user is in 'testorg' and workspace belongs to 'testorg'
		mockOctoKitService.setUserOrganizations(['testorg']);
		mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
		mockGitService.setRepositoryFetchUrls({
			rootUri: URI.file('/workspace'),
			remoteFetchUrls: ['https://github.com/testorg/repo.git']
		});

		// Set up testing services
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
	});

	afterEach(() => {
		vi.useRealTimers();
		disposables.dispose();
		mockOctoKitService.clearAgents();
	});

	function createProvider() {
		// Create the real GitHubOrgChatResourcesService with mocked dependencies
		resourcesService = new GitHubOrgChatResourcesService(
			mockAuthService as any,
			mockExtensionContext as any,
			mockFileSystem,
			mockGitService,
			accessor.get(ILogService),
			mockOctoKitService,
			mockWorkspaceService,
		);
		disposables.add(resourcesService);

		// Create provider with real resources service
		provider = new GitHubOrgCustomAgentProvider(
			mockOctoKitService,
			accessor.get(ILogService),
			resourcesService,
		);
		disposables.add(provider);
		return provider;
	}

	/**
	 * Advance timers and wait for polling callback to complete.
	 * Uses a small time advance to trigger the initial poll without infinite loops.
	 */
	async function waitForPolling(): Promise<void> {
		// Advance just enough to let initial poll complete, but not trigger interval polls
		await vi.advanceTimersByTimeAsync(10);
	}

	/**
	 * Helper to pre-populate cache files in mock filesystem.
	 */
	function prepopulateCache(orgName: string, files: Map<string, string>): void {
		const cacheDir = URI.file(`${storagePath}/github/${orgName}/agents`);
		const dirEntries: [string, import('../../../../platform/filesystem/common/fileTypes').FileType][] = [];
		for (const [filename, content] of files) {
			mockFileSystem.mockFile(URI.joinPath(cacheDir, filename), content);
			dirEntries.push([filename, 1 /* FileType.File */]);
		}
		mockFileSystem.mockDirectory(cacheDir, dirEntries);
	}

	test('returns empty array when user has no organizations', async () => {
		mockOctoKitService.setUserOrganizations([]);
		mockWorkspaceService.setWorkspaceFolders([]);
		const provider = createProvider();

		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.deepEqual(agents, []);
	});

	test('returns empty array when no organizations and no cached files', async () => {
		// With no organizations and no cached files, should return empty
		mockOctoKitService.setUserOrganizations([]);
		mockWorkspaceService.setWorkspaceFolders([]);
		const provider = createProvider();

		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.deepEqual(agents, []);
	});

	// todo: MockFileSystemService previously had a bug where deleted files would
	// still show up when listing directories. This was fixed and caused this test
	// to fail: test_agent.md is cleared from the cache in the first poll
	test.skip('returns cached agents on first call', async () => {
		// Set up file system mocks BEFORE creating provider to avoid race with background fetch
		// Also prevent background fetch from interfering by having no organizations
		mockOctoKitService.setUserOrganizations([]);
		mockWorkspaceService.setWorkspaceFolders([]);

		// Pre-populate cache with org folder (but keep testorg folder structure)
		const agentContent = `---
name: Test Agent
description: A test agent
---
Test prompt content`;
		prepopulateCache('testorg', new Map([['test_agent.agent.md', agentContent]]));

		// Re-enable testorg for cache reading (user is in org, but no workspace repo)
		mockOctoKitService.setUserOrganizations(['testorg']);

		const provider = createProvider();

		// Wait for initial poll attempt (won't fetch since no agents in API)
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		assert.equal(agents.length, 1);
		const agentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName, 'test_agent');
	});

	test('fetches and caches agents from API', async () => {
		// Mock API response BEFORE creating provider
		const mockAgent: CustomAgentListItem = {
			name: 'api_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'API Agent',
			description: 'An agent from API',
			tools: ['tool1'],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'API prompt content',
		};
		mockOctoKitService.setAgentDetails('api_agent', mockDetails);

		const provider = createProvider();

		// Wait for background fetch to complete
		await waitForPolling();

		// Second call should return newly cached agents from memory
		const agents2 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents2.length, 1);
		const agentName2 = agents2[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName2, 'api_agent');

		// Third call should also return from memory cache without file I/O
		const agents3 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents3.length, 1);
		const agentName3 = agents3[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName3, 'api_agent');
	});

	test('generates correct markdown format for agents', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'full_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Full Agent',
			description: 'A fully configured agent',
			tools: ['tool1', 'tool2'],
			version: 'v1',
			argument_hint: 'Provide context',
			target: 'vscode',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Detailed prompt content',
			model: 'gpt-4',
			disable_model_invocation: true,
		};
		mockOctoKitService.setAgentDetails('full_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// Check cached file content using the real service
		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'full_agent.agent.md');

		const expectedContent = `---
name: Full Agent
description: A fully configured agent
tools:
  - tool1
  - tool2
argument-hint: Provide context
target: vscode
model: gpt-4
disable-model-invocation: true
---
Detailed prompt content
`;

		assert.equal(content, expectedContent);
	});

	test('generates markdown with user-invocable property', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'invocable_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Invocable Agent',
			description: 'An agent with user-invocable set',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Invocable prompt content',
			user_invocable: true,
		};
		mockOctoKitService.setAgentDetails('invocable_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'invocable_agent.agent.md');

		const expectedContent = `---
name: Invocable Agent
description: An agent with user-invocable set
user-invocable: true
---
Invocable prompt content
`;

		assert.equal(content, expectedContent);
	});

	test('generates markdown with false values for disable-model-invocation and user-invocable', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'false_flags_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'False Flags Agent',
			description: 'Agent with false boolean flags',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'False flags prompt',
			disable_model_invocation: false,
			user_invocable: false,
		};
		mockOctoKitService.setAgentDetails('false_flags_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'false_flags_agent.agent.md');

		const expectedContent = `---
name: False Flags Agent
description: Agent with false boolean flags
disable-model-invocation: false
user-invocable: false
---
False flags prompt
`;

		assert.equal(content, expectedContent);
	});

	test('preserves agent name in filename', async () => {
		// Note: The provider does NOT sanitize filenames - it uses the agent name directly.
		// This test documents the actual behavior.
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'my-agent_name',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'My Agent',
			description: 'Test filename',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Prompt content',
		};
		mockOctoKitService.setAgentDetails('my-agent_name', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// File is created with the exact agent name (no sanitization)
		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'my-agent_name.agent.md');
		assert.ok(content, 'File should exist with agent name as filename');
	});

	test.skip('fires change event when cache is updated on first fetch', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'changing_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Changing Agent',
			description: 'Will change',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Initial prompt',
		};
		mockOctoKitService.setAgentDetails('changing_agent', mockDetails);

		let eventFired = false;
		provider.onDidChangeCustomAgents(() => {
			eventFired = true;
		});

		// First call triggers background fetch
		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// Event should fire after initial successful fetch
		assert.equal(eventFired, true);
	});

	test('handles API errors gracefully', async () => {
		const provider = createProvider();

		// Make the API throw an error
		mockOctoKitService.getCustomAgents = async () => {
			throw new Error('API Error');
		};

		// Should not throw, should return empty array
		const agents = await provider.provideCustomAgents({}, {} as any);
		assert.deepEqual(agents, []);
	});

	test('passes query options to API correctly', async () => {
		const provider = createProvider();

		let capturedOptions: CustomAgentListOptions | undefined;
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string, options?: CustomAgentListOptions) => {
			capturedOptions = options;
			return [];
		};

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		assert.ok(capturedOptions);
		assert.deepEqual(capturedOptions.includeSources, ['org', 'enterprise']);
	});

	test('prevents concurrent fetches when called multiple times rapidly', async () => {
		const provider = createProvider();

		let apiCallCount = 0;
		mockOctoKitService.getCustomAgents = async () => {
			apiCallCount++;
			// Simulate slow API call - use real timer for this
			await new Promise(resolve => {
				const realSetTimeout = globalThis.setTimeout;
				realSetTimeout(resolve, 50);
			});
			return [];
		};

		// Make multiple concurrent calls
		const promise1 = provider.provideCustomAgents({}, {} as any);
		const promise2 = provider.provideCustomAgents({}, {} as any);
		const promise3 = provider.provideCustomAgents({}, {} as any);

		await Promise.all([promise1, promise2, promise3]);
		await waitForPolling();

		// API should only be called once due to isFetching guard
		assert.equal(apiCallCount, 1);
	});

	test('handles partial agent detail fetch failures gracefully', async () => {
		const agents: CustomAgentListItem[] = [
			{
				name: 'agent1',
				repo_owner_id: 1,
				repo_owner: 'testorg',
				repo_id: 1,
				repo_name: 'testrepo',
				display_name: 'Agent 1',
				description: 'First agent',
				tools: [],
				version: 'v1',
			},
			{
				name: 'agent2',
				repo_owner_id: 1,
				repo_owner: 'testorg',
				repo_id: 1,
				repo_name: 'testrepo',
				display_name: 'Agent 2',
				description: 'Second agent',
				tools: [],
				version: 'v1',
			},
		];
		mockOctoKitService.setCustomAgents(agents);

		// Set details for only the first agent (second will fail)
		mockOctoKitService.setAgentDetails('agent1', {
			...agents[0],
			prompt: 'Agent 1 prompt',
		});

		// Pre-populate file cache with the first agent to simulate previous successful state
		const agentContent = `---
name: Agent 1
description: First agent
---
Agent 1 prompt`;
		prepopulateCache('testorg', new Map([['agent1.agent.md', agentContent]]));

		const provider = createProvider();
		await waitForPolling();

		// With error handling, partial failures skip cache update for that org
		// So the existing file cache is returned with the one successful agent
		const cachedAgents = await provider.provideCustomAgents({}, {} as any);
		assert.equal(cachedAgents.length, 1);
		const cachedAgentName = cachedAgents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(cachedAgentName, 'agent1');
	});

	test('caches agents in memory after first successful fetch', async () => {
		// Initial setup with one agent BEFORE creating provider
		const initialAgent: CustomAgentListItem = {
			name: 'initial_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Initial Agent',
			description: 'First agent',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([initialAgent]);
		mockOctoKitService.setAgentDetails('initial_agent', {
			...initialAgent,
			prompt: 'Initial prompt',
		});

		const provider = createProvider();
		await waitForPolling();

		// After successful fetch, subsequent calls return from memory
		const agents1 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents1.length, 1);
		const agentName1 = agents1[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName1, 'initial_agent');

		// Even if API is updated, memory cache is used
		const newAgent: CustomAgentListItem = {
			name: 'new_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'New Agent',
			description: 'Newly added agent',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([initialAgent, newAgent]);
		mockOctoKitService.setAgentDetails('new_agent', {
			...newAgent,
			prompt: 'New prompt',
		});

		// Memory cache returns old results without refetching
		const agents2 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents2.length, 1);
		const agentName2ForMemory = agents2[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName2ForMemory, 'initial_agent');
	});

	test('memory cache persists after first successful fetch', async () => {
		// Initial setup with two agents BEFORE creating provider
		const agents: CustomAgentListItem[] = [
			{
				name: 'agent1',
				repo_owner_id: 1,
				repo_owner: 'testorg',
				repo_id: 1,
				repo_name: 'testrepo',
				display_name: 'Agent 1',
				description: 'First agent',
				tools: [],
				version: 'v1',
			},
			{
				name: 'agent2',
				repo_owner_id: 1,
				repo_owner: 'testorg',
				repo_id: 1,
				repo_name: 'testrepo',
				display_name: 'Agent 2',
				description: 'Second agent',
				tools: [],
				version: 'v1',
			},
		];
		mockOctoKitService.setCustomAgents(agents);
		mockOctoKitService.setAgentDetails('agent1', { ...agents[0], prompt: 'Prompt 1' });
		mockOctoKitService.setAgentDetails('agent2', { ...agents[1], prompt: 'Prompt 2' });

		const provider = createProvider();
		await waitForPolling();

		// Verify both agents are cached
		const cachedAgents1 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(cachedAgents1.length, 2);

		// Remove one agent from API
		mockOctoKitService.setCustomAgents([agents[0]]);

		// Memory cache still returns both agents (no refetch)
		const cachedAgents2 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(cachedAgents2.length, 2);
		const cachedAgent2Name1 = cachedAgents2[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		const cachedAgent2Name2 = cachedAgents2[1].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(cachedAgent2Name1, 'agent1');
		assert.equal(cachedAgent2Name2, 'agent2');
	});

	test.skip('does not fire change event when content is identical', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'stable_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Stable Agent',
			description: 'Unchanging agent',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);
		mockOctoKitService.setAgentDetails('stable_agent', {
			...mockAgent,
			prompt: 'Stable prompt',
		});

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		let changeEventCount = 0;
		provider.onDidChangeCustomAgents(() => {
			changeEventCount++;
		});

		// Fetch again with identical content
		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// No change event should fire
		assert.equal(changeEventCount, 0);
	});

	test('memory cache persists even when API returns empty list', async () => {
		// Setup with initial agents BEFORE creating provider
		const mockAgent: CustomAgentListItem = {
			name: 'temporary_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Temporary Agent',
			description: 'Will be removed',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);
		mockOctoKitService.setAgentDetails('temporary_agent', {
			...mockAgent,
			prompt: 'Temporary prompt',
		});

		const provider = createProvider();
		await waitForPolling();

		// Verify agent is cached
		const agents1 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents1.length, 1);

		// API now returns empty array
		mockOctoKitService.setCustomAgents([]);

		// Memory cache still returns the agent (no refetch)
		const agents2 = await provider.provideCustomAgents({}, {} as any);
		assert.equal(agents2.length, 1);
		const temporaryAgentName = agents2[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(temporaryAgentName, 'temporary_agent');
	});

	test('generates markdown with only required fields', async () => {
		const provider = createProvider();

		// Agent with minimal fields (no optional fields)
		const mockAgent: CustomAgentListItem = {
			name: 'minimal_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Minimal Agent',
			description: 'Minimal description',
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Minimal prompt',
		};
		mockOctoKitService.setAgentDetails('minimal_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'minimal_agent.agent.md');
		assert.ok(content, 'Agent file should exist');

		// Should have name and description, but no tools (empty array)
		assert.ok(content.includes('name: Minimal Agent'));
		assert.ok(content.includes('description: Minimal description'));
		assert.ok(!content.includes('tools:'));
		assert.ok(!content.includes('argument-hint:'));
		assert.ok(!content.includes('target:'));
		assert.ok(!content.includes('model:'));
		assert.ok(!content.includes('disable-model-invocation:'));
	});

	test('excludes tools field when array contains only wildcard', async () => {
		const provider = createProvider();

		const mockAgent: CustomAgentListItem = {
			name: 'wildcard_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Wildcard Agent',
			description: 'Agent with wildcard tools',
			tools: ['*'],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Wildcard prompt',
		};
		mockOctoKitService.setAgentDetails('wildcard_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'wildcard_agent.agent.md');
		assert.ok(content, 'Agent file should exist');

		// Tools field should be excluded when it's just ['*']
		assert.ok(!content.includes('tools:'));
	});

	// todo: MockFileSystemService previously had a bug where deleted files would
	// still show up when listing directories. This was fixed and caused this test
	// to fail: agent files are cleared from the cache in the first poll
	test.skip('handles malformed frontmatter in cached files', async () => {
		// Prevent background fetch from interfering
		mockOctoKitService.setUserOrganizations([]);
		mockWorkspaceService.setWorkspaceFolders([]);

		// Pre-populate cache with mixed valid and malformed content BEFORE creating provider
		const validContent = `---
name: Valid Agent
description: A valid agent
---
Valid prompt`;
		// File without frontmatter - parser extracts name from filename, description is empty
		const noFrontmatterContent = `Just some content without any frontmatter`;
		prepopulateCache('testorg', new Map([
			['valid_agent.agent.md', validContent],
			['no_frontmatter.agent.md', noFrontmatterContent],
		]));

		// Re-enable testorg for cache reading
		mockOctoKitService.setUserOrganizations(['testorg']);

		const provider = createProvider();

		// Wait for initial poll (which uses testorg)
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Parser is lenient - both agents are returned, one with empty description
		assert.equal(agents.length, 2);
		const validAgentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(validAgentName, 'valid_agent');
		const noFrontmatterAgentName = agents[1].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(noFrontmatterAgentName, 'no_frontmatter');
	});

	test('fetches agents from preferred organization only', async () => {
		// The service only fetches from the preferred organization, not all user organizations.
		// Preferred org is determined by workspace repository or first user organization.
		const provider = createProvider();

		// Set up multiple organizations - testorg is the default preferred org
		mockOctoKitService.setUserOrganizations(['testorg', 'otherorg1', 'otherorg2']);

		const capturedOrgs: string[] = [];
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string) => {
			capturedOrgs.push(owner);
			return [];
		};

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// Should have fetched from only the preferred organization
		assert.equal(capturedOrgs.length, 1);
		assert.ok(capturedOrgs.includes('testorg'));
	});

	test('generates markdown with long description on single line', async () => {
		const provider = createProvider();

		// Agent with a very long description that would normally be wrapped at 80 characters
		const longDescription = 'Just for fun agent that teaches computer science concepts (while pretending to plot world domination).';
		const mockAgent: CustomAgentListItem = {
			name: 'world_domination',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'World Domination',
			description: longDescription,
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: '# World Domination Agent\n\nYou are a world-class computer scientist.',
		};
		mockOctoKitService.setAgentDetails('world_domination', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'world_domination.agent.md');

		const expectedContent = `---
name: World Domination
description: Just for fun agent that teaches computer science concepts (while pretending to plot world domination).
---
# World Domination Agent

You are a world-class computer scientist.
`;

		assert.equal(content, expectedContent);
	});

	test('generates markdown with special characters properly escaped in description', async () => {
		const provider = createProvider();

		// Agent with description containing YAML special characters that need proper handling
		const descriptionWithSpecialChars = `Agent with "double quotes", 'single quotes', colons:, and #comments in the description`;
		const mockAgent: CustomAgentListItem = {
			name: 'special_chars_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Special Chars Agent',
			description: descriptionWithSpecialChars,
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Test prompt with special characters',
		};
		mockOctoKitService.setAgentDetails('special_chars_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'special_chars_agent.agent.md');

		const expectedContent = `---
name: Special Chars Agent
description: "Agent with \\"double quotes\\", 'single quotes', colons:, and #comments in the description"
---
Test prompt with special characters
`;

		assert.equal(content, expectedContent);
	});

	test('generates markdown with multiline description containing newlines', async () => {
		const provider = createProvider();

		// Agent with description containing actual newline characters
		const descriptionWithNewlines = 'First line of description.\nSecond line of description.\nThird line.';
		const mockAgent: CustomAgentListItem = {
			name: 'multiline_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 1,
			repo_name: 'testrepo',
			display_name: 'Multiline Agent',
			description: descriptionWithNewlines,
			tools: [],
			version: 'v1',
		};
		mockOctoKitService.setCustomAgents([mockAgent]);

		const mockDetails: CustomAgentDetails = {
			...mockAgent,
			prompt: 'Test prompt',
		};
		mockOctoKitService.setAgentDetails('multiline_agent', mockDetails);

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		const content = await resourcesService.readCacheFile(PromptsType.agent, 'testorg', 'multiline_agent.agent.md');

		// Newlines should be escaped using double quotes to keep description on a single line
		// (the custom YAML parser doesn't support multi-line strings)
		const expectedContent = `---
name: Multiline Agent
description: "First line of description.\\nSecond line of description.\\nThird line."
---
Test prompt
`;

		assert.equal(content, expectedContent);
	});

	test('aborts fetch if user signs out during process', async () => {
		const provider = createProvider();

		// Setup multiple organizations to ensure we have multiple steps
		mockOctoKitService.setUserOrganizations(['org1', 'org2']);
		mockOctoKitService.getOrganizationRepositories = async (org) => ['repo'];

		// Mock getCustomAgents to simulate sign out after first org
		let callCount = 0;
		const originalGetCustomAgents = mockOctoKitService.getCustomAgents;
		mockOctoKitService.getCustomAgents = async (owner, repo, options) => {
			callCount++;
			if (callCount === 1) {
				// Sign out user after first call
				mockOctoKitService.getCurrentAuthedUser = async () => undefined as any;
			}
			return originalGetCustomAgents.call(mockOctoKitService, owner, repo, options, {});
		};

		await provider.provideCustomAgents({}, {} as any);
		await waitForPolling();

		// Should have aborted after first org, so second org shouldn't be processed
		assert.equal(callCount, 1);
	});

	test('deduplicates enterprise agents that appear in multiple organizations', async () => {
		// Setup multiple organizations BEFORE creating provider
		mockOctoKitService.setUserOrganizations(['orgA', 'orgB']);
		// Clear default workspace so getPreferredOrganizationName falls back to user organizations
		mockWorkspaceService.setWorkspaceFolders([]);

		// Create an enterprise agent that will appear in both organizations
		const enterpriseAgent: CustomAgentListItem = {
			name: 'enterprise_agent',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Enterprise Agent',
			description: 'Shared enterprise agent',
			tools: [],
			version: 'v1.0',
		};

		// Mock getCustomAgents to return the same enterprise agent for both orgs
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string) => {
			// Both orgs return the same enterprise agent (same repo_owner, repo_name, name, version)
			return [enterpriseAgent];
		};

		mockOctoKitService.setAgentDetails('enterprise_agent', {
			...enterpriseAgent,
			prompt: 'Enterprise prompt',
		});

		const provider = createProvider();
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Should only have one agent, not two (deduped)
		assert.equal(agents.length, 1);
		const enterpriseAgentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(enterpriseAgentName, 'enterprise_agent');

		// Verify it was only written to one org directory
		// Check which org has the agent file
		const orgAContent = await resourcesService.readCacheFile(PromptsType.agent, 'orga', 'enterprise_agent.agent.md');
		const orgBContent = await resourcesService.readCacheFile(PromptsType.agent, 'orgb', 'enterprise_agent.agent.md');
		const orgAHasAgent = orgAContent !== undefined;
		const orgBHasAgent = orgBContent !== undefined;

		// Agent should be in exactly one org directory (the first one processed)
		assert.ok(orgAHasAgent && !orgBHasAgent, 'Enterprise agent should only be cached in first org');
	});

	test('deduplicates agents with same repo regardless of version', async () => {
		// Set up mocks BEFORE creating provider
		mockOctoKitService.setUserOrganizations(['orgA', 'orgB']);

		// Create agents with same name but different versions
		const agentV1: CustomAgentListItem = {
			name: 'versioned_agent',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Versioned Agent',
			description: 'Agent version 1',
			tools: [],
			version: 'v1.0',
		};

		const agentV2: CustomAgentListItem = {
			name: 'versioned_agent',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Versioned Agent',
			description: 'Agent version 2',
			tools: [],
			version: 'v2.0',
		};

		let callCount = 0;
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string) => {
			callCount++;
			if (callCount === 1) {
				// First org returns v1 and v2
				return [agentV1, agentV2];
			} else {
				// Second org also returns both versions
				return [agentV1, agentV2];
			}
		};

		mockOctoKitService.getCustomAgentDetails = async (owner: string, repo: string, agentName: string, version?: string) => {
			if (version === 'v1.0') {
				return { ...agentV1, prompt: 'Version 1 prompt' };
			} else if (version === 'v2.0') {
				return { ...agentV2, prompt: 'Version 2 prompt' };
			}
			return undefined;
		};

		const provider = createProvider();
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Different versions are deduplicated, only the first one is kept
		assert.equal(agents.length, 1);
		const versionedAgentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(versionedAgentName, 'versioned_agent');
	});

	test('handles agents with same name but different repo owners from single org', async () => {
		// Set up mocks BEFORE creating provider
		// This tests the case where a single org returns agents from different repo owners
		// (e.g., an org-specific agent and an enterprise agent with the same name)
		mockOctoKitService.setUserOrganizations(['testorg']);

		// Agents with same name but different repo owners as returned by API for single org
		const orgAAgent: CustomAgentListItem = {
			name: 'shared_agent',
			repo_owner_id: 1,
			repo_owner: 'testorg',
			repo_id: 10,
			repo_name: 'org_repo',
			display_name: 'Org Agent',
			description: 'Agent from org repo',
			tools: [],
			version: 'v1.0',
		};

		const enterpriseAgent: CustomAgentListItem = {
			name: 'shared_agent',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 100,
			repo_name: 'enterprise_repo',
			display_name: 'Enterprise Agent',
			description: 'Agent from enterprise',
			tools: [],
			version: 'v1.0',
		};

		// API returns both agents for single org (enterprise agents are included via includeSources)
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string) => {
			return [orgAAgent, enterpriseAgent];
		};

		mockOctoKitService.getCustomAgentDetails = async (owner: string, repo: string, agentName: string, version?: string) => {
			// The API is called with the repo_owner, not the org name
			if (owner === 'testorg') {
				return { ...orgAAgent, prompt: 'Org prompt' };
			} else if (owner === 'enterprise_org') {
				return { ...enterpriseAgent, prompt: 'Enterprise prompt' };
			}
			return undefined;
		};

		const provider = createProvider();
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Since both agents have the same name, only one file is written (last one wins)
		// The filename is just `${agent.name}.agent.md`, so both would write to same file
		assert.equal(agents.length, 1);
		const agentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(agentName, 'shared_agent');
	});

	test('deduplicates enterprise agents even when API returns them in different order', async () => {
		// Set up mocks BEFORE creating provider
		mockOctoKitService.setUserOrganizations(['orgA', 'orgB', 'orgC']);

		const enterpriseAgent1: CustomAgentListItem = {
			name: 'enterprise_agent1',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Enterprise Agent 1',
			description: 'First enterprise agent',
			tools: [],
			version: 'v1.0',
		};

		const enterpriseAgent2: CustomAgentListItem = {
			name: 'enterprise_agent2',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Enterprise Agent 2',
			description: 'Second enterprise agent',
			tools: [],
			version: 'v1.0',
		};

		let callCount = 0;
		mockOctoKitService.getCustomAgents = async (owner: string, repo: string) => {
			callCount++;
			// Return agents in different orders for different orgs
			if (callCount === 1) {
				return [enterpriseAgent1, enterpriseAgent2];
			} else if (callCount === 2) {
				return [enterpriseAgent2, enterpriseAgent1]; // Reversed order
			} else {
				return [enterpriseAgent1, enterpriseAgent2];
			}
		};

		mockOctoKitService.getCustomAgentDetails = async (owner: string, repo: string, agentName: string, version?: string) => {
			if (agentName === 'enterprise_agent1') {
				return { ...enterpriseAgent1, prompt: 'Prompt 1' };
			} else if (agentName === 'enterprise_agent2') {
				return { ...enterpriseAgent2, prompt: 'Prompt 2' };
			}
			return undefined;
		};

		const provider = createProvider();
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Should have exactly 2 agents, not 6 (2 agents x 3 orgs)
		assert.equal(agents.length, 2);

		// Verify both agent names are present
		const agentNames = agents.map(a => a.uri.path.split('/').pop()?.replace('.agent.md', '')).sort();
		assert.deepEqual(agentNames, ['enterprise_agent1', 'enterprise_agent2']);
	});

	test('deduplication key does not include version so different versions are deduplicated', async () => {
		// Set up mocks BEFORE creating provider
		mockOctoKitService.setUserOrganizations(['orgA']);

		// Same agent with two different versions
		const agentV1: CustomAgentListItem = {
			name: 'multi_version_agent',
			repo_owner_id: 999,
			repo_owner: 'enterprise_org',
			repo_id: 123,
			repo_name: 'enterprise_repo',
			display_name: 'Multi Version Agent',
			description: 'Agent with multiple versions',
			tools: [],
			version: 'v1.0',
		};

		const agentV2: CustomAgentListItem = {
			...agentV1,
			version: 'v2.0',
		};

		mockOctoKitService.getCustomAgents = async () => {
			return [agentV1, agentV2];
		};

		mockOctoKitService.getCustomAgentDetails = async (owner: string, repo: string, agentName: string, version?: string) => {
			if (version === 'v1.0') {
				return { ...agentV1, prompt: 'Prompt for v1' };
			} else if (version === 'v2.0') {
				return { ...agentV2, prompt: 'Prompt for v2' };
			}
			return undefined;
		};

		const provider = createProvider();
		await waitForPolling();

		const agents = await provider.provideCustomAgents({}, {} as any);

		// Different versions are deduplicated, only the first one is kept
		assert.equal(agents.length, 1);
		const multiVersionAgentName = agents[0].uri.path.split('/').pop()?.replace('.agent.md', '');
		assert.equal(multiVersionAgentName, 'multi_version_agent');
	});
});

suite('looksLikeNumber', () => {

	test('returns false for empty string', () => {
		assert.strictEqual(looksLikeNumber(''), false);
	});

	test('returns true for integers', () => {
		assert.strictEqual(looksLikeNumber('0'), true);
		assert.strictEqual(looksLikeNumber('123'), true);
		assert.strictEqual(looksLikeNumber('-456'), true);
	});

	test('returns true for decimals', () => {
		assert.strictEqual(looksLikeNumber('3.14'), true);
		assert.strictEqual(looksLikeNumber('-0.5'), true);
		assert.strictEqual(looksLikeNumber('.5'), true);
	});

	test('returns false for non-numeric strings', () => {
		assert.strictEqual(looksLikeNumber('abc'), false);
		assert.strictEqual(looksLikeNumber('12abc'), false);
		assert.strictEqual(looksLikeNumber('hello'), false);
	});

	test('returns false for special number representations', () => {
		// These don't match the regex /^-?\d*\.?\d+$/
		assert.strictEqual(looksLikeNumber('1e10'), false);
		assert.strictEqual(looksLikeNumber('1.5e-3'), false);
		assert.strictEqual(looksLikeNumber('Infinity'), false);
		assert.strictEqual(looksLikeNumber('-Infinity'), false);
		assert.strictEqual(looksLikeNumber('NaN'), false);
	});

	test('returns false for hex/octal representations', () => {
		assert.strictEqual(looksLikeNumber('0x1F'), false);
		assert.strictEqual(looksLikeNumber('0o17'), false);
		assert.strictEqual(looksLikeNumber('0b101'), false);
	});

	test('returns false for strings with spaces', () => {
		assert.strictEqual(looksLikeNumber(' 123'), false);
		assert.strictEqual(looksLikeNumber('123 '), false);
	});
});

suite('yamlString', () => {

	test('returns plain string for simple text', () => {
		const result = yamlString('hello');
		assert.strictEqual(result, 'hello');
	});

	test('returns plain string for text with spaces', () => {
		const result = yamlString('hello world');
		assert.strictEqual(result, 'hello world');
	});

	suite('quoting for special characters', () => {

		test('quotes strings containing hash (comment)', () => {
			const result = yamlString('value with # hash');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'value with # hash');
			assert.strictEqual(result.type, Scalar.QUOTE_SINGLE);
		});

		test('quotes strings containing colon', () => {
			const result = yamlString('key: value');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'key: value');
		});

		test('quotes strings containing brackets', () => {
			const result = yamlString('array [1, 2]');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'array [1, 2]');
		});

		test('quotes strings containing braces', () => {
			const result = yamlString('object {a: 1}');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'object {a: 1}');
		});

		test('quotes strings containing comma', () => {
			const result = yamlString('a, b, c');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'a, b, c');
		});

		test('quotes strings containing newline', () => {
			const result = yamlString('line1\nline2');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'line1\nline2');
			// Newlines require double quotes for escape sequence support
			assert.strictEqual(result.type, Scalar.QUOTE_DOUBLE);
		});

		test('quotes strings containing carriage return', () => {
			const result = yamlString('line1\rline2');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'line1\rline2');
			// Carriage returns require double quotes for escape sequence support
			assert.strictEqual(result.type, Scalar.QUOTE_DOUBLE);
		});
	});

	suite('quoting for values starting with quotes', () => {

		test('quotes strings starting with single quote', () => {
			const result = yamlString(`'quoted value`);
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, `'quoted value`);
		});

		test('quotes strings starting with double quote', () => {
			const result = yamlString(`"quoted value`);
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, `"quoted value`);
		});
	});

	suite('quoting for whitespace', () => {

		test('quotes strings with leading space', () => {
			const result = yamlString(' leading space');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, ' leading space');
		});

		test('quotes strings with trailing space', () => {
			const result = yamlString('trailing space ');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'trailing space ');
		});
	});

	suite('quoting for YAML keywords', () => {

		test('quotes "true" to preserve as string', () => {
			const result = yamlString('true');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'true');
		});

		test('quotes "false" to preserve as string', () => {
			const result = yamlString('false');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'false');
		});

		test('quotes "null" to preserve as string', () => {
			const result = yamlString('null');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, 'null');
		});

		test('quotes "~" to preserve as string', () => {
			const result = yamlString('~');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, '~');
		});

		test('does not quote "True" (case sensitive)', () => {
			const result = yamlString('True');
			assert.strictEqual(result, 'True');
		});

		test('does not quote "FALSE" (case sensitive)', () => {
			const result = yamlString('FALSE');
			assert.strictEqual(result, 'FALSE');
		});
	});

	suite('quoting for numeric strings', () => {

		test('quotes integer strings', () => {
			const result = yamlString('123');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, '123');
		});

		test('quotes negative integers', () => {
			const result = yamlString('-456');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, '-456');
		});

		test('quotes decimal strings', () => {
			const result = yamlString('3.14');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.value, '3.14');
		});

		test('does not quote non-numeric strings that look similar', () => {
			const result = yamlString('v1.0');
			assert.strictEqual(result, 'v1.0');
		});
	});

	suite('quote type selection', () => {

		test('uses single quotes by default when quoting', () => {
			const result = yamlString('value with # hash');
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.type, Scalar.QUOTE_SINGLE);
		});

		test('does not quote string with only single quote (no special chars)', () => {
			// `it's a value` has no special YAML characters, so no quoting is needed
			const result = yamlString(`it's a value`);
			assert.strictEqual(result, `it's a value`);
		});

		test('uses double quotes when value has single quote and special chars', () => {
			const result = yamlString(`it's a value: with colon`);
			assert.ok(result instanceof Scalar);
			assert.strictEqual(result.type, Scalar.QUOTE_DOUBLE);
		});
	});
});

suite('yamlString round-trip with custom YAML parser', () => {
	/**
	 * These tests verify that values processed by yamlString() can be
	 * correctly parsed back by the custom YAML parser in yaml.ts
	 */

	function roundTrip(value: string): string | undefined {
		const yamlValue = yamlString(value);
		let yamlStr: string;

		if (yamlValue instanceof Scalar) {
			// Simulate how YAML library would stringify this
			if (yamlValue.type === Scalar.QUOTE_SINGLE) {
				yamlStr = `'${value}'`;
			} else {
				// Double quotes - need to escape internal double quotes
				yamlStr = `"${value.replace(/"/g, '\\"')}"`;
			}
		} else {
			yamlStr = value;
		}

		// Parse as a simple key-value YAML
		const yaml = `key: ${yamlStr}`;
		const parsed = parse(yaml);

		if (parsed?.type === 'object' && parsed.properties.length > 0) {
			const prop = parsed.properties[0];
			if (prop.value.type === 'string') {
				return prop.value.value;
			}
		}
		return undefined;
	}

	test('round-trips plain string', () => {
		assert.strictEqual(roundTrip('hello world'), 'hello world');
	});

	test('round-trips string with hash', () => {
		assert.strictEqual(roundTrip('value # comment'), 'value # comment');
	});

	test('round-trips string with colon', () => {
		assert.strictEqual(roundTrip('key: value'), 'key: value');
	});

	test('round-trips boolean keyword as string', () => {
		assert.strictEqual(roundTrip('true'), 'true');
		assert.strictEqual(roundTrip('false'), 'false');
	});

	test('round-trips null keyword as string', () => {
		assert.strictEqual(roundTrip('null'), 'null');
	});

	test('round-trips numeric string', () => {
		assert.strictEqual(roundTrip('123'), '123');
		assert.strictEqual(roundTrip('3.14'), '3.14');
	});

	test('round-trips string with leading/trailing whitespace', () => {
		assert.strictEqual(roundTrip('  padded  '), '  padded  ');
	});

	test('round-trips string with single quotes (no special chars)', () => {
		// Apostrophes without other special chars don't need quoting
		assert.strictEqual(roundTrip(`it's working`), `it's working`);
	});

	test('round-trips string with single quotes and special chars', () => {
		// When both single quote and special char are present, double quotes are used
		assert.strictEqual(roundTrip(`it's a value: with colon`), `it's a value: with colon`);
	});
});
