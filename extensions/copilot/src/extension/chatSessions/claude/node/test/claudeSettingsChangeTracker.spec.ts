/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../../platform/filesystem/common/fileTypes';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { TestingServiceCollection } from '../../../../../platform/test/node/services';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../util/common/test/testUtils';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ClaudeSettingsChangeTracker } from '../claudeSettingsChangeTracker';

describe('ClaudeSettingsChangeTracker', () => {
	let mockFs: MockFileSystemService;
	let testingServiceCollection: TestingServiceCollection;
	let tracker: ClaudeSettingsChangeTracker;

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const testFile1 = URI.file('/project/.claude/CLAUDE.md');
	const testFile2 = URI.file('/project/.claude/settings.json');

	beforeEach(() => {
		mockFs = new MockFileSystemService();
		testingServiceCollection = store.add(createExtensionUnitTestingServices(store));
		testingServiceCollection.set(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instaService = accessor.get(IInstantiationService);
		tracker = instaService.createInstance(ClaudeSettingsChangeTracker);
	});

	describe('takeSnapshot', () => {
		it('should capture mtime of existing files', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);

			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			// No changes immediately after snapshot
			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});

		it('should record non-existent files as 0 mtime', async () => {
			// testFile1 is not mocked, so stat will throw
			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			// No changes immediately after snapshot
			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});
	});

	describe('hasChanges', () => {
		it('should return false when files have not changed', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);

			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});

		it('should return true when file mtime increases', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);

			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			// Simulate file modification by updating mtime
			mockFs.mockFile(testFile1, '# Updated Instructions', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should return true when a new file is created', async () => {
			// File doesn't exist at snapshot time
			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			// File is created
			mockFs.mockFile(testFile1, '# New Instructions', 1000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should return true when a file is deleted', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);

			tracker.registerPathResolver(() => [testFile1]);
			await tracker.takeSnapshot();

			// Simulate file deletion by mocking an error
			mockFs.mockError(testFile1, new Error('ENOENT'));

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should track multiple files from single resolver', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);
			mockFs.mockFile(testFile2, '{}', 1000);

			tracker.registerPathResolver(() => [testFile1, testFile2]);
			await tracker.takeSnapshot();

			// Modify only second file
			mockFs.mockFile(testFile2, '{"hooks": []}', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});
	});

	describe('multiple path resolvers', () => {
		it('should track files from all registered resolvers', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);
			mockFs.mockFile(testFile2, '{}', 1000);

			tracker.registerPathResolver(() => [testFile1]);
			tracker.registerPathResolver(() => [testFile2]);
			await tracker.takeSnapshot();

			// Modify second file (from second resolver)
			mockFs.mockFile(testFile2, '{"updated": true}', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should detect new files added by resolver after snapshot', async () => {
			const testFile3 = URI.file('/project/.claude/new-file.md');
			const dynamicPaths: URI[] = [testFile1];

			tracker.registerPathResolver(() => dynamicPaths);
			await tracker.takeSnapshot();

			// Add a new file to the resolver's list and create it
			dynamicPaths.push(testFile3);
			mockFs.mockFile(testFile3, '# New file', 1000);

			const hasChanges = await tracker.hasChanges();
			// testFile3 wasn't in the original snapshot, so it's a "new" file
			expect(hasChanges).toBe(true);
		});
	});

	describe('registerDirectoryResolver', () => {
		const agentsDir = URI.file('/project/.claude/agents');
		const agent1 = URI.file('/project/.claude/agents/test-runner.md');
		const agent2 = URI.file('/project/.claude/agents/code-reviewer.md');

		it('should track files in registered directories', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
				['code-reviewer.md', FileType.File],
			]);
			mockFs.mockFile(agent1, '# Test Runner', 1000);
			mockFs.mockFile(agent2, '# Code Reviewer', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir]);
			await tracker.takeSnapshot();

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});

		it('should detect modified files in directory', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
			]);
			mockFs.mockFile(agent1, '# Test Runner', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir]);
			await tracker.takeSnapshot();

			// Modify the file
			mockFs.mockFile(agent1, '# Updated Test Runner', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should detect new files added to directory', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
			]);
			mockFs.mockFile(agent1, '# Test Runner', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir]);
			await tracker.takeSnapshot();

			// Add a new file to the directory
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
				['code-reviewer.md', FileType.File],
			]);
			mockFs.mockFile(agent2, '# Code Reviewer', 1000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should detect deleted files from directory', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
				['code-reviewer.md', FileType.File],
			]);
			mockFs.mockFile(agent1, '# Test Runner', 1000);
			mockFs.mockFile(agent2, '# Code Reviewer', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir]);
			await tracker.takeSnapshot();

			// Remove agent2 from directory listing
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
			]);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});

		it('should handle non-existent directories gracefully', async () => {
			// Don't mock the directory - it doesn't exist
			tracker.registerDirectoryResolver(() => [agentsDir]);
			await tracker.takeSnapshot();

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});
	});

	describe('extension filtering', () => {
		const agentsDir = URI.file('/project/.claude/agents');

		it('should only track files with matching extension', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
				['readme.txt', FileType.File],
				['config.json', FileType.File],
			]);
			mockFs.mockFile(URI.file('/project/.claude/agents/test-runner.md'), '# Test', 1000);
			mockFs.mockFile(URI.file('/project/.claude/agents/readme.txt'), 'readme', 1000);
			mockFs.mockFile(URI.file('/project/.claude/agents/config.json'), '{}', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir], '.md');
			await tracker.takeSnapshot();

			// Modify the txt file - should NOT trigger change since we only track .md
			mockFs.mockFile(URI.file('/project/.claude/agents/readme.txt'), 'updated readme', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(false);
		});

		it('should detect changes to files with matching extension', async () => {
			mockFs.mockDirectory(agentsDir, [
				['test-runner.md', FileType.File],
				['readme.txt', FileType.File],
			]);
			mockFs.mockFile(URI.file('/project/.claude/agents/test-runner.md'), '# Test', 1000);
			mockFs.mockFile(URI.file('/project/.claude/agents/readme.txt'), 'readme', 1000);

			tracker.registerDirectoryResolver(() => [agentsDir], '.md');
			await tracker.takeSnapshot();

			// Modify the .md file - should trigger change
			mockFs.mockFile(URI.file('/project/.claude/agents/test-runner.md'), '# Updated', 2000);

			const hasChanges = await tracker.hasChanges();
			expect(hasChanges).toBe(true);
		});
	});

	describe('lazy evaluation', () => {
		it('should stop checking after first change is found', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);
			mockFs.mockFile(testFile2, '{}', 1000);

			// Register two resolvers
			tracker.registerPathResolver(() => [testFile1]);
			tracker.registerPathResolver(() => [testFile2]);
			await tracker.takeSnapshot();

			// Modify first file
			mockFs.mockFile(testFile1, '# Updated', 2000);

			mockFs.resetStatCallCount();
			const hasChanges = await tracker.hasChanges();

			expect(hasChanges).toBe(true);
			// Should only have called stat once (for testFile1) before returning
			expect(mockFs.getStatCallCount()).toBe(1);
		});

		it('should not invoke later resolvers if early change found', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);
			mockFs.mockFile(testFile2, '{}', 1000);

			let resolver2Called = false;
			tracker.registerPathResolver(() => [testFile1]);
			tracker.registerPathResolver(() => {
				resolver2Called = true;
				return [testFile2];
			});
			await tracker.takeSnapshot();

			// Modify first file
			mockFs.mockFile(testFile1, '# Updated', 2000);

			resolver2Called = false;
			await tracker.hasChanges();

			// Second resolver should not have been called
			expect(resolver2Called).toBe(false);
		});

		it('should check all resolvers when no changes found', async () => {
			mockFs.mockFile(testFile1, '# Instructions', 1000);
			mockFs.mockFile(testFile2, '{}', 1000);

			let resolver2Called = false;
			tracker.registerPathResolver(() => [testFile1]);
			tracker.registerPathResolver(() => {
				resolver2Called = true;
				return [testFile2];
			});
			await tracker.takeSnapshot();

			// No modifications
			resolver2Called = false;
			await tracker.hasChanges();

			// Both resolvers should have been called
			expect(resolver2Called).toBe(true);
		});
	});
});
