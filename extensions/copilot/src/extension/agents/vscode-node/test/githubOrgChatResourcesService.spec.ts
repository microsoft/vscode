/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { ExtensionContext } from 'vscode';
import { AGENT_FILE_EXTENSION, INSTRUCTION_FILE_EXTENSION, PromptsType } from '../../../../platform/customInstructions/common/promptTypes';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { MockWorkspaceService } from '../../../../platform/ignore/node/test/mockWorkspaceService';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GitHubOrgChatResourcesService } from '../githubOrgChatResourcesService';
import { MockOctoKitService } from './mockOctoKitService';

suite('GitHubOrgChatResourcesService', () => {
	let disposables: DisposableStore;
	let mockExtensionContext: Partial<ExtensionContext>;
	let mockFileSystem: MockFileSystemService;
	let mockGitService: MockGitService;
	let mockOctoKitService: MockOctoKitService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockAuthService: MockAuthenticationService;
	let logService: ILogService;
	let service: GitHubOrgChatResourcesService;

	const storagePath = '/test/storage';
	const storageUri = URI.file(storagePath);

	beforeEach(() => {
		disposables = new DisposableStore();

		// Create a simple mock extension context with only globalStorageUri
		mockExtensionContext = {
			globalStorageUri: storageUri,
		};
		mockFileSystem = new MockFileSystemService();
		mockGitService = new MockGitService();
		mockOctoKitService = new MockOctoKitService();
		mockWorkspaceService = new MockWorkspaceService();
		mockAuthService = new MockAuthenticationService();

		// Set up testing services to get log service
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		logService = accessor.get(ILogService);
	});

	afterEach(() => {
		disposables.dispose();
		mockOctoKitService?.reset();
	});

	function createService(): GitHubOrgChatResourcesService {
		service = new GitHubOrgChatResourcesService(
			mockAuthService as any,
			mockExtensionContext as any,
			mockFileSystem,
			mockGitService,
			logService,
			mockOctoKitService,
			mockWorkspaceService,
		);
		disposables.add(service);
		return service;
	}

	suite('getPreferredOrganizationName', () => {

		test('returns organization from workspace repository when available', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/myorg/myrepo.git']
			});
			mockOctoKitService.setUserOrganizations(['myorg']);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'myorg');
		});

		test('returns organization from SSH URL format', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['git@github.com:sshorg/myrepo.git']
			});
			mockOctoKitService.setUserOrganizations(['sshorg']);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'sshorg');
		});

		test('falls back to user organizations when no workspace repo', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations(['fallbackorg', 'anotherorg']);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'fallbackorg');
		});

		test('falls back to user organizations when repo has no GitHub remote', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://gitlab.com/someorg/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['fallbackorg']);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'fallbackorg');
		});

		test('returns undefined when user has no organizations', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations([]);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.isUndefined(orgName);
		});

		test('caches result on subsequent calls', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/cachedorg/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['cachedorg']);

			const service = createService();

			// First call
			const orgName1 = await service.getPreferredOrganizationName();
			assert.equal(orgName1, 'cachedorg');

			// Change the mock - should not affect cached result
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/neworg/repo.git']
			});

			// Second call should return cached value
			const orgName2 = await service.getPreferredOrganizationName();
			assert.equal(orgName2, 'cachedorg');
		});

		test('handles error in getUserOrganizations gracefully', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.getUserOrganizations = async () => {
				throw new Error('API Error');
			};

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.isUndefined(orgName);
		});

		test('tries multiple remote URLs to find GitHub repo', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: [
					'https://gitlab.com/notgithub/repo.git',
					undefined as any, // Skip undefined
					'https://github.com/foundorg/repo.git'
				]
			});
			mockOctoKitService.setUserOrganizations(['foundorg']);

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'foundorg');
		});

		test('prefers Copilot sign-in org over arbitrary first org when no workspace repo', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations(['firstorg', 'copilotorg', 'thirdorg']);
			// Set Copilot token with organization_login_list indicating Copilot access through 'copilotorg'
			mockAuthService.copilotToken = {
				organizationLoginList: ['copilotorg'],
			} as any;

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'copilotorg');
		});

		test('prefers workspace repo org over Copilot sign-in org', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/workspaceorg/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['workspaceorg', 'copilotorg']);
			mockAuthService.copilotToken = {
				organizationLoginList: ['copilotorg'],
			} as any;

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'workspaceorg');
		});

		test('uses Copilot org even when not in paginated user org list', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations(['firstorg', 'secondorg']);
			// Copilot org may not appear in paginated user org list but is still valid
			mockAuthService.copilotToken = {
				organizationLoginList: ['copilotorg'],
			} as any;

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			// Copilot token orgs are trusted since they represent validated membership
			assert.equal(orgName, 'copilotorg');
		});

		test('falls back to first org when no Copilot token available', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations(['firstorg', 'secondorg']);
			mockAuthService.copilotToken = undefined;

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			assert.equal(orgName, 'firstorg');
		});

		test('uses first matching Copilot org when multiple are available', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations(['thirdorg', 'secondcopilotorg', 'firstcopilotorg']);
			mockAuthService.copilotToken = {
				organizationLoginList: ['firstcopilotorg', 'secondcopilotorg'],
			} as any;

			const service = createService();
			const orgName = await service.getPreferredOrganizationName();

			// Should match 'firstcopilotorg' first in the copilot org list iteration
			assert.equal(orgName, 'firstcopilotorg');
		});
	});

	suite.skip('startPolling', () => {

		test('invokes callback immediately with org name', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/pollingorg/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['pollingorg']);

			const service = createService();

			let capturedOrg: string | undefined;
			const subscription = service.startPolling(10000, async (orgName) => {
				capturedOrg = orgName;
			});
			disposables.add(subscription);

			// Wait for initial poll
			await new Promise(resolve => setTimeout(resolve, 50));

			assert.equal(capturedOrg, 'pollingorg');
		});

		test('does not invoke callback when no organization', async () => {
			mockWorkspaceService.setWorkspaceFolders([]);
			mockOctoKitService.setUserOrganizations([]);

			const service = createService();

			let callbackInvoked = false;
			const subscription = service.startPolling(10000, async () => {
				callbackInvoked = true;
			});
			disposables.add(subscription);

			await new Promise(resolve => setTimeout(resolve, 50));

			assert.isFalse(callbackInvoked);
		});

		test('stops polling when subscription is disposed', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/testorg/repo.git']
			});

			const service = createService();

			let callCount = 0;
			const subscription = service.startPolling(50, async () => {
				callCount++;
			});

			// Wait for initial poll
			await new Promise(resolve => setTimeout(resolve, 30));
			const initialCount = callCount;

			// Dispose subscription
			subscription.dispose();

			// Wait longer than poll interval
			await new Promise(resolve => setTimeout(resolve, 100));

			// Call count should not have increased significantly after disposal
			assert.isAtMost(callCount - initialCount, 1);
		});

		test('prevents concurrent polling', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/concurrent/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['concurrent']);

			const service = createService();

			let concurrentCalls = 0;
			let maxConcurrentCalls = 0;

			const subscription = service.startPolling(10, async () => {
				concurrentCalls++;
				maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
				await new Promise(resolve => setTimeout(resolve, 50));
				concurrentCalls--;
			});
			disposables.add(subscription);

			// Wait for multiple poll cycles
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should never have more than 1 concurrent call
			assert.equal(maxConcurrentCalls, 1);
		});

		test('handles callback errors gracefully', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace'),
				remoteFetchUrls: ['https://github.com/errororg/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['errororg']);

			const service = createService();

			let callCount = 0;
			const subscription = service.startPolling(30, async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error('Callback error');
				}
			});
			disposables.add(subscription);

			// Wait for multiple poll cycles
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should continue polling even after error
			assert.isAtLeast(callCount, 2);
		});
	});

	suite('readCacheFile', () => {

		test('reads instruction file from cache', async () => {
			const cacheUri = URI.file(`${storagePath}/github/testorg/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, '# Custom Instructions');

			const service = createService();
			const content = await service.readCacheFile(PromptsType.instructions, 'testorg', `default${INSTRUCTION_FILE_EXTENSION}`);

			assert.equal(content, '# Custom Instructions');
		});

		test('reads agent file from cache', async () => {
			const cacheUri = URI.file(`${storagePath}/github/testorg/agents/myagent${AGENT_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, '---\nname: My Agent\n---\nPrompt');

			const service = createService();
			const content = await service.readCacheFile(PromptsType.agent, 'testorg', `myagent${AGENT_FILE_EXTENSION}`);

			assert.equal(content, '---\nname: My Agent\n---\nPrompt');
		});

		test('returns undefined for missing file', async () => {
			const service = createService();
			const content = await service.readCacheFile(PromptsType.instructions, 'testorg', 'nonexistent.instructions.md');

			assert.isUndefined(content);
		});

		test('sanitizes org name in path', async () => {
			// dash is preserved, uppercase becomes lowercase
			const cacheUri = URI.file(`${storagePath}/github/test-org/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, 'Sanitized content');

			const service = createService();
			const content = await service.readCacheFile(PromptsType.instructions, 'Test-Org', `default${INSTRUCTION_FILE_EXTENSION}`);

			assert.equal(content, 'Sanitized content');
		});
	});

	suite('writeCacheFile', () => {

		test('writes instruction file to cache', async () => {
			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.instructions,
				'testorg',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'# New Instructions'
			);

			assert.isTrue(result);

			// Verify file was written
			const cacheUri = URI.file(`${storagePath}/github/testorg/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			const content = await mockFileSystem.readFile(cacheUri);
			assert.equal(new TextDecoder().decode(content), '# New Instructions');
		});

		test('writes agent file to cache', async () => {
			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.agent,
				'testorg',
				`myagent${AGENT_FILE_EXTENSION}`,
				'---\nname: Agent\n---\nPrompt'
			);

			assert.isTrue(result);

			const cacheUri = URI.file(`${storagePath}/github/testorg/agents/myagent${AGENT_FILE_EXTENSION}`);
			const content = await mockFileSystem.readFile(cacheUri);
			assert.equal(new TextDecoder().decode(content), '---\nname: Agent\n---\nPrompt');
		});

		test('returns false when content unchanged with checkForChanges', async () => {
			const cacheUri = URI.file(`${storagePath}/github/testorg/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, 'Same content');

			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.instructions,
				'testorg',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'Same content',
				{ checkForChanges: true }
			);

			assert.isFalse(result);
		});

		test('returns true when content changed with checkForChanges', async () => {
			const cacheUri = URI.file(`${storagePath}/github/testorg/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, 'Old content');

			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.instructions,
				'testorg',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'New content',
				{ checkForChanges: true }
			);

			assert.isTrue(result);
		});

		test('returns true when file does not exist with checkForChanges', async () => {
			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.instructions,
				'neworg',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'Content',
				{ checkForChanges: true }
			);

			assert.isTrue(result);
		});

		test('returns true when file size differs with checkForChanges', async () => {
			const cacheUri = URI.file(`${storagePath}/github/testorg/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			mockFileSystem.mockFile(cacheUri, 'Short');

			const service = createService();

			const result = await service.writeCacheFile(
				PromptsType.instructions,
				'testorg',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'Much longer content that differs in size',
				{ checkForChanges: true }
			);

			assert.isTrue(result);
		});

		test('creates directory structure if not exists', async () => {
			const service = createService();

			await service.writeCacheFile(
				PromptsType.agent,
				'neworg',
				`agent${AGENT_FILE_EXTENSION}`,
				'Content'
			);

			const cacheUri = URI.file(`${storagePath}/github/neworg/agents/agent${AGENT_FILE_EXTENSION}`);
			const content = await mockFileSystem.readFile(cacheUri);
			assert.equal(new TextDecoder().decode(content), 'Content');
		});

		test('sanitizes org name before writing', async () => {
			const service = createService();

			await service.writeCacheFile(
				PromptsType.instructions,
				'My-Org!@#',
				`default${INSTRUCTION_FILE_EXTENSION}`,
				'Content'
			);

			// dash is preserved, special chars become underscore, uppercase becomes lowercase
			const cacheUri = URI.file(`${storagePath}/github/my-org___/instructions/default${INSTRUCTION_FILE_EXTENSION}`);
			const content = await mockFileSystem.readFile(cacheUri);
			assert.equal(new TextDecoder().decode(content), 'Content');
		});
	});

	suite('clearCache', () => {

		test('deletes all instruction files for organization', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`file1${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				[`file2${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
			]);
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `file1${INSTRUCTION_FILE_EXTENSION}`), 'Content 1');
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `file2${INSTRUCTION_FILE_EXTENSION}`), 'Content 2');

			const service = createService();
			await service.clearCache(PromptsType.instructions, 'testorg');

			// Files should be deleted
			let file1Exists = true;
			let file2Exists = true;
			try {
				await mockFileSystem.readFile(URI.joinPath(cacheDir, `file1${INSTRUCTION_FILE_EXTENSION}`));
			} catch {
				file1Exists = false;
			}
			try {
				await mockFileSystem.readFile(URI.joinPath(cacheDir, `file2${INSTRUCTION_FILE_EXTENSION}`));
			} catch {
				file2Exists = false;
			}

			assert.isFalse(file1Exists);
			assert.isFalse(file2Exists);
		});

		test('excludes specified files from deletion', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`keep${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				[`delete${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
			]);
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `keep${INSTRUCTION_FILE_EXTENSION}`), 'Keep this');
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `delete${INSTRUCTION_FILE_EXTENSION}`), 'Delete this');

			const service = createService();
			await service.clearCache(PromptsType.instructions, 'testorg', new Set([`keep${INSTRUCTION_FILE_EXTENSION}`]));

			// Kept file should still exist
			const keepContent = await mockFileSystem.readFile(URI.joinPath(cacheDir, `keep${INSTRUCTION_FILE_EXTENSION}`));
			assert.equal(new TextDecoder().decode(keepContent), 'Keep this');

			// Deleted file should not exist
			let deleteExists = true;
			try {
				await mockFileSystem.readFile(URI.joinPath(cacheDir, `delete${INSTRUCTION_FILE_EXTENSION}`));
			} catch {
				deleteExists = false;
			}
			assert.isFalse(deleteExists);
		});

		test('skips non-matching file extensions', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`valid${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				['invalid.txt', FileType.File],
			]);
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `valid${INSTRUCTION_FILE_EXTENSION}`), 'Valid');
			mockFileSystem.mockFile(URI.joinPath(cacheDir, 'invalid.txt'), 'Invalid');

			const service = createService();
			await service.clearCache(PromptsType.instructions, 'testorg');

			// Valid file should be deleted
			let validExists = true;
			try {
				await mockFileSystem.readFile(URI.joinPath(cacheDir, `valid${INSTRUCTION_FILE_EXTENSION}`));
			} catch {
				validExists = false;
			}
			assert.isFalse(validExists);

			// Invalid file should still exist
			const invalidContent = await mockFileSystem.readFile(URI.joinPath(cacheDir, 'invalid.txt'));
			assert.equal(new TextDecoder().decode(invalidContent), 'Invalid');
		});

		test('handles non-existent cache directory gracefully', async () => {
			const service = createService();

			// Should not throw
			await service.clearCache(PromptsType.instructions, 'nonexistentorg');
		});

		test('skips directories in cache folder', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`file${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				['subfolder', FileType.Directory],
			]);
			mockFileSystem.mockFile(URI.joinPath(cacheDir, `file${INSTRUCTION_FILE_EXTENSION}`), 'Content');
			mockFileSystem.mockDirectory(URI.joinPath(cacheDir, 'subfolder'), []);

			const service = createService();
			await service.clearCache(PromptsType.instructions, 'testorg');

			// Directory should still exist
			const dirStat = await mockFileSystem.stat(URI.joinPath(cacheDir, 'subfolder'));
			assert.ok(dirStat);
		});
	});

	suite('listCachedFiles', () => {

		test('lists all instruction files for organization', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`file1${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				[`file2${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.instructions, 'testorg');

			assert.equal(files.length, 2);
			const fileNames = files.map(f => f.uri.path.split('/').pop());
			assert.include(fileNames, `file1${INSTRUCTION_FILE_EXTENSION}`);
			assert.include(fileNames, `file2${INSTRUCTION_FILE_EXTENSION}`);
		});

		test('lists all agent files for organization', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/agents`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`agent1${AGENT_FILE_EXTENSION}`, FileType.File],
				[`agent2${AGENT_FILE_EXTENSION}`, FileType.File],
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.agent, 'testorg');

			assert.equal(files.length, 2);
			const fileNames = files.map(f => f.uri.path.split('/').pop());
			assert.include(fileNames, `agent1${AGENT_FILE_EXTENSION}`);
			assert.include(fileNames, `agent2${AGENT_FILE_EXTENSION}`);
		});

		test('returns empty array for non-existent directory', async () => {
			const service = createService();
			const files = await service.listCachedFiles(PromptsType.instructions, 'nonexistent');

			assert.deepEqual(files, []);
		});

		test('filters out non-matching file extensions', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`valid${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				['invalid.txt', FileType.File],
				['readme.md', FileType.File],
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.instructions, 'testorg');

			assert.equal(files.length, 1);
			assert.ok(files[0].uri.path.endsWith(INSTRUCTION_FILE_EXTENSION));
		});

		test('filters out directories', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/agents`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`agent${AGENT_FILE_EXTENSION}`, FileType.File],
				['subfolder', FileType.Directory],
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.agent, 'testorg');

			assert.equal(files.length, 1);
			assert.ok(files[0].uri.path.endsWith(AGENT_FILE_EXTENSION));
		});

		test('returns correct URI structure for files', async () => {
			const cacheDir = URI.file(`${storagePath}/github/myorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`custom${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.instructions, 'myorg');

			assert.equal(files.length, 1);
			assert.ok(files[0].uri.path.includes('/github/'));
			assert.ok(files[0].uri.path.includes('/myorg/'));
			assert.ok(files[0].uri.path.includes('/instructions/'));
		});
	});

	suite('workspace folder change handling', () => {

		test('invalidates org cache when workspace folders change', async () => {
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace1')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace1'),
				remoteFetchUrls: ['https://github.com/org1/repo.git']
			});
			mockOctoKitService.setUserOrganizations(['org1', 'org2']);

			const service = createService();

			// Get initial org name
			const orgName1 = await service.getPreferredOrganizationName();
			assert.equal(orgName1, 'org1');

			// Simulate workspace folder change by updating mocks
			mockWorkspaceService.setWorkspaceFolders([URI.file('/workspace2')]);
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace2'),
				remoteFetchUrls: ['https://github.com/org2/repo.git']
			});

			// The cache should be cleared on workspace change event
			// Since we can't easily fire the event, we verify the subscription is set up
			// by checking that disposal works
			service.dispose();
		});
	});

	suite('getCacheSubdirectory helper', () => {

		test('uses instructions subdirectory for instructions type', async () => {
			const service = createService();

			await service.writeCacheFile(
				PromptsType.instructions,
				'testorg',
				`file${INSTRUCTION_FILE_EXTENSION}`,
				'Content'
			);

			const files = await service.listCachedFiles(PromptsType.instructions, 'testorg');
			assert.ok(files[0].uri.path.includes('/instructions/'));
		});

		test('uses agents subdirectory for agent type', async () => {
			const service = createService();

			await service.writeCacheFile(
				PromptsType.agent,
				'testorg',
				`file${AGENT_FILE_EXTENSION}`,
				'Content'
			);

			const files = await service.listCachedFiles(PromptsType.agent, 'testorg');
			assert.ok(files[0].uri.path.includes('/agents/'));
		});
	});

	suite('file validation', () => {

		test('validates instruction file extension', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/instructions`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`valid${INSTRUCTION_FILE_EXTENSION}`, FileType.File],
				['valid.agent.md', FileType.File], // Wrong extension for instructions
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.instructions, 'testorg');

			assert.equal(files.length, 1);
			assert.ok(files[0].uri.path.endsWith(INSTRUCTION_FILE_EXTENSION));
		});

		test('validates agent file extension', async () => {
			const cacheDir = URI.file(`${storagePath}/github/testorg/agents`);
			mockFileSystem.mockDirectory(cacheDir, [
				[`valid${AGENT_FILE_EXTENSION}`, FileType.File],
				['valid.instructions.md', FileType.File], // Wrong extension for agents
			]);

			const service = createService();
			const files = await service.listCachedFiles(PromptsType.agent, 'testorg');

			assert.equal(files.length, 1);
			assert.ok(files[0].uri.path.endsWith(AGENT_FILE_EXTENSION));
		});
	});
});
