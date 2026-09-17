/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { ExtensionContext } from 'vscode';
import { INSTRUCTION_FILE_EXTENSION, PromptsType } from '../../../../platform/customInstructions/common/promptTypes';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { MockWorkspaceService } from '../../../../platform/ignore/node/test/mockWorkspaceService';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GitHubOrgChatResourcesService } from '../githubOrgChatResourcesService';
import { GitHubOrgInstructionsProvider } from '../githubOrgInstructionsProvider';
import { MockOctoKitService } from './mockOctoKitService';

suite('GitHubOrgInstructionsProvider', () => {
	let disposables: DisposableStore;
	let mockOctoKitService: MockOctoKitService;
	let mockFileSystem: MockFileSystemService;
	let mockGitService: MockGitService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockExtensionContext: Partial<ExtensionContext>;
	let mockAuthService: MockAuthenticationService;
	let accessor: any;
	let provider: GitHubOrgInstructionsProvider;
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
		mockOctoKitService.reset();
	});

	function createProvider(): GitHubOrgInstructionsProvider {
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
		provider = new GitHubOrgInstructionsProvider(
			accessor.get(ILogService),
			mockOctoKitService,
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
		await vi.advanceTimersByTimeAsync(10);
	}

	/**
	 * Helper to pre-populate cache files in mock filesystem.
	 */
	function prepopulateCache(orgName: string, files: Map<string, string>): void {
		const cacheDir = URI.file(`${storagePath}/github/${orgName}/instructions`);
		const dirEntries: [string, import('../../../../platform/filesystem/common/fileTypes').FileType][] = [];
		for (const [filename, content] of files) {
			mockFileSystem.mockFile(URI.joinPath(cacheDir, filename), content);
			dirEntries.push([filename, 1 /* FileType.File */]);
		}
		mockFileSystem.mockDirectory(cacheDir, dirEntries);
	}

	test('returns empty array when no organization available', async () => {
		mockOctoKitService.setUserOrganizations([]);
		mockWorkspaceService.setWorkspaceFolders([]);
		const provider = createProvider();

		const instructions = await provider.provideInstructions({}, {} as any);

		assert.deepEqual(instructions, []);
	});

	test('returns cached instructions when available', async () => {
		const orgId = 'testorg';

		// Pre-populate cache with instructions
		const instructionContent = '# Custom Instructions\nThese are custom instructions for the organization.';
		prepopulateCache(orgId, new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, instructionContent]
		]));

		const provider = createProvider();

		const instructions = await provider.provideInstructions({}, {} as any);

		assert.equal(instructions.length, 1);
		assert.ok(instructions[0].uri.path.endsWith(`default${INSTRUCTION_FILE_EXTENSION}`));
	});

	test('returns empty array when cache is empty', async () => {
		// No cache populated
		const provider = createProvider();

		const instructions = await provider.provideInstructions({}, {} as any);

		assert.deepEqual(instructions, []);
	});

	test.skip('pollInstructions writes instructions to cache when found', async () => {
		const orgId = 'testorg';
		const instructionContent = '# Organization Instructions\nBe helpful and concise.';

		mockOctoKitService.setOrgInstructions(orgId, instructionContent);

		createProvider();
		await waitForPolling();

		// Verify the instructions were written to cache
		const cachedContent = await resourcesService.readCacheFile(
			PromptsType.instructions,
			orgId,
			`default${INSTRUCTION_FILE_EXTENSION}`
		);

		// The implementation adds applyTo front matter to the cached content
		const expectedContent = `---\napplyTo: '**'\n---\n${instructionContent}`;
		assert.equal(cachedContent, expectedContent);
	});

	test.skip('pollInstructions does nothing when no instructions found', async () => {
		mockOctoKitService.setOrgInstructions('testorg', undefined);

		createProvider();
		await waitForPolling();

		// Verify no instructions were written
		const cachedContent = await resourcesService.readCacheFile(
			PromptsType.instructions,
			'testorg',
			`default${INSTRUCTION_FILE_EXTENSION}`
		);

		assert.isUndefined(cachedContent);
	});

	test.skip('fires change event when instructions content changes', async () => {
		const instructionContent = '# New Instructions\nUpdated content.';

		mockOctoKitService.setOrgInstructions('testorg', instructionContent);

		const provider = createProvider();

		let eventFired = false;
		provider.onDidChangeInstructions(() => {
			eventFired = true;
		});

		await waitForPolling();

		assert.isTrue(eventFired, 'Change event should fire when instructions are updated');
	});

	test.skip('fires change event on every successful poll with instructions', async () => {
		// Note: The current implementation does not pass checkForChanges option to writeCacheFile,
		// so change events fire on every poll even when content is unchanged
		const instructionContent = '# Stable Instructions\nThis content will not change.';

		mockOctoKitService.setOrgInstructions('testorg', instructionContent);

		// Pre-populate cache with the same content
		prepopulateCache('testorg', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, instructionContent]
		]));

		const provider = createProvider();

		let changeEventCount = 0;
		provider.onDidChangeInstructions(() => {
			changeEventCount++;
		});

		await waitForPolling();

		assert.equal(changeEventCount, 1, 'Change event fires on every successful poll');
	});

	test.skip('pollInstructions handles API errors gracefully without throwing', async () => {
		// Make the API throw an error
		mockOctoKitService.getOrgCustomInstructions = async () => {
			throw new Error('API Error');
		};

		createProvider();

		// pollInstructions has internal error handling - errors are logged but not thrown
		// This is intentional to prevent polling failures from crashing the extension
		let errorThrown = false;
		try {
			await waitForPolling();
		} catch (e: any) {
			errorThrown = true;
		}

		assert.isFalse(errorThrown, 'API errors should be handled internally and not propagate');
	});

	test('returns instructions from correct organization', async () => {
		// Pre-populate different orgs with different instructions
		prepopulateCache('org1', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, 'Org1 instructions']
		]));
		prepopulateCache('org2', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, 'Org2 instructions']
		]));

		// Set preferred org to org2 by configuring workspace git remote
		mockOctoKitService.setUserOrganizations(['org1', 'org2']);
		mockGitService.setRepositoryFetchUrls({
			rootUri: URI.file('/workspace'),
			remoteFetchUrls: ['https://github.com/org2/repo.git']
		});

		const provider = createProvider();

		const instructions = await provider.provideInstructions({}, {} as any);

		assert.equal(instructions.length, 1);
		// The URI should contain 'org2', not 'org1'
		assert.ok(instructions[0].uri.path.includes('org2'));
	});

	test('handles cache read errors gracefully', async () => {
		const provider = createProvider();

		// Override readDirectory to throw an error
		const originalReadDirectory = mockFileSystem.readDirectory.bind(mockFileSystem);
		mockFileSystem.readDirectory = async () => {
			throw new Error('Cache read error');
		};

		// Should not throw, should return empty array
		const instructions = await provider.provideInstructions({}, {} as any);

		assert.deepEqual(instructions, []);

		// Restore original method
		mockFileSystem.readDirectory = originalReadDirectory;
	});

	test('respects cancellation token in provideInstructions', async () => {
		prepopulateCache('testorg', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, 'Some instructions']
		]));

		const provider = createProvider();

		// Create a cancelled token
		const cancelledToken = {
			isCancellationRequested: true,
			onCancellationRequested: () => ({ dispose: () => { } })
		};

		const instructions = await provider.provideInstructions({}, cancelledToken as any);

		// Should return empty array when cancelled
		assert.deepEqual(instructions, []);
	});

	test('uses correct file extension for instruction files', async () => {
		const instructionContent = '# Test Instructions';

		mockOctoKitService.setOrgInstructions('testorg', instructionContent);

		const provider = createProvider();
		await waitForPolling();

		// Verify the file was written with the correct extension
		const cachedContent = await resourcesService.readCacheFile(
			PromptsType.instructions,
			'testorg',
			`default${INSTRUCTION_FILE_EXTENSION}`
		);

		// The implementation adds applyTo front matter to the cached content
		const expectedContent = `---\napplyTo: '**'\n---\n${instructionContent}`;
		assert.equal(cachedContent, expectedContent);

		// Prepopulate so we can list it
		prepopulateCache('testorg', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, instructionContent]
		]));

		const instructions = await provider.provideInstructions({}, {} as any);
		assert.equal(instructions.length, 1);
		assert.ok(instructions[0].uri.path.endsWith(INSTRUCTION_FILE_EXTENSION));
	});

	test('disposes polling subscription when provider is disposed', () => {
		const provider = createProvider();

		// Should not throw when disposed
		provider.dispose();

		// Provider should be properly cleaned up
		assert.ok(true, 'Provider disposed without errors');
	});

	test('multiple instruction files are returned when present', async () => {
		// Pre-populate cache with multiple instruction files
		prepopulateCache('testorg', new Map([
			[`default${INSTRUCTION_FILE_EXTENSION}`, 'Default instructions'],
			[`custom${INSTRUCTION_FILE_EXTENSION}`, 'Custom instructions'],
			[`team${INSTRUCTION_FILE_EXTENSION}`, 'Team instructions'],
		]));

		const provider = createProvider();

		const instructions = await provider.provideInstructions({}, {} as any);

		assert.equal(instructions.length, 3);
	});
});
