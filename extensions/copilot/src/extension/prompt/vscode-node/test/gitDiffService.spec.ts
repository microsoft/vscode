/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { API, Change, Repository } from '../../../../platform/git/vscode/git';
import { IIgnoreService, NullIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GitDiffService } from '../gitDiffService';

class TestIgnoreService extends NullIgnoreService {
	private readonly _ignoredUris = new Set<string>();

	setIgnoredUris(uris: Uri[]): void {
		this._ignoredUris.clear();
		for (const uri of uris) {
			this._ignoredUris.add(uri.toString());
		}
	}

	override async isCopilotIgnored(file: Uri): Promise<boolean> {
		return this._ignoredUris.has(file.toString());
	}
}

describe('GitDiffService', () => {
	let readFileSpy: MockInstance<typeof vscode.workspace.fs.readFile>;
	let statSpy: MockInstance<typeof vscode.workspace.fs.stat>;
	let accessor: ITestingServicesAccessor;
	let gitDiffService: GitDiffService;
	let mockRepository: Partial<Repository>;
	let testIgnoreService: TestIgnoreService;

	beforeEach(() => {
		// Create mock workspace.fs.readFile if it doesn't exist
		if (!vscode.workspace?.fs?.readFile) {
			const workspaceWithFs = vscode as unknown as { workspace: typeof vscode.workspace };
			workspaceWithFs.workspace = {
				...vscode.workspace,
				fs: {
					...vscode.workspace?.fs,
					readFile: vi.fn(),
					stat: vi.fn()
				}
			};
		}

		// Spy on workspace.fs.readFile
		readFileSpy = vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(() => Promise.resolve(new Uint8Array()));
		// Spy on workspace.fs.stat - default to a small file
		statSpy = vi.spyOn(vscode.workspace.fs, 'stat').mockImplementation(() => Promise.resolve({ size: 100, type: 1 /* File */, ctime: 0, mtime: 0 } as vscode.FileStat));

		mockRepository = {
			rootUri: Uri.file('/repo'),
			diffWith: vi.fn().mockResolvedValue(''),
			diffIndexWithHEAD: vi.fn().mockResolvedValue(''),
			diffWithHEAD: vi.fn().mockResolvedValue('')
		};

		const services = createExtensionUnitTestingServices();

		const mockGitExtensionService = {
			getExtensionApi: vi.fn().mockReturnValue({
				getRepository: vi.fn().mockReturnValue(mockRepository),
				openRepository: vi.fn(),
				repositories: [mockRepository as Repository]
			} as unknown as API)
		} as unknown as IGitExtensionService;
		services.set(IGitExtensionService, mockGitExtensionService);

		testIgnoreService = new TestIgnoreService();
		services.set(IIgnoreService, testIgnoreService);

		accessor = services.createTestingAccessor();
		gitDiffService = accessor.get(IInstantiationService).createInstance(GitDiffService);
	});

	afterEach(() => {
		readFileSpy.mockRestore();
		statSpy.mockRestore();
	});

	describe('getChangeDiffs', () => {
		it('should use diffIndexWithHEAD for index changes', async () => {
			const fileUri = Uri.file('/repo/staged.txt');
			(mockRepository.diffIndexWithHEAD as ReturnType<typeof vi.fn>).mockResolvedValue('index diff');

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 0 /* INDEX_MODIFIED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toBe('index diff');
			expect(mockRepository.diffIndexWithHEAD).toHaveBeenCalledWith(fileUri.fsPath);
			expect(mockRepository.diffWithHEAD).not.toHaveBeenCalled();
		});

		it('should use diffWithHEAD for working tree changes', async () => {
			const fileUri = Uri.file('/repo/modified.txt');
			(mockRepository.diffWithHEAD as ReturnType<typeof vi.fn>).mockResolvedValue('working tree diff');

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toBe('working tree diff');
			expect(mockRepository.diffWithHEAD).toHaveBeenCalledWith(fileUri.fsPath);
			expect(mockRepository.diffIndexWithHEAD).not.toHaveBeenCalled();
		});

		it('should skip copilot-ignored files', async () => {
			const ignoredUri = Uri.file('/repo/secret.txt');
			const normalUri = Uri.file('/repo/normal.txt');

			testIgnoreService.setIgnoredUris([ignoredUri]);
			(mockRepository.diffWithHEAD as ReturnType<typeof vi.fn>).mockResolvedValue('normal diff');

			const changes: Change[] = [
				{ uri: ignoredUri, originalUri: ignoredUri, renameUri: undefined, status: 5 /* MODIFIED */ },
				{ uri: normalUri, originalUri: normalUri, renameUri: undefined, status: 5 /* MODIFIED */ }
			];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].uri.toString()).toBe(normalUri.toString());
		});

		it('should throw CancellationError when token is cancelled', async () => {
			const cts = new CancellationTokenSource();
			cts.cancel();

			const changes: Change[] = [{
				uri: Uri.file('/repo/file.txt'),
				originalUri: Uri.file('/repo/file.txt'),
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			await expect(gitDiffService.getChangeDiffs(mockRepository as Repository, changes, cts.token))
				.rejects.toThrow(CancellationError);
		});

		it('should return empty array when repository is not found', async () => {
			const services = createExtensionUnitTestingServices();

			const mockGitExtensionService = {
				getExtensionApi: vi.fn().mockReturnValue({
					getRepository: vi.fn().mockReturnValue(null),
					openRepository: vi.fn().mockResolvedValue(null),
					repositories: []
				} as unknown as API)
			} as unknown as IGitExtensionService;
			services.set(IGitExtensionService, mockGitExtensionService);
			services.set(IIgnoreService, testIgnoreService);

			const service = services.createTestingAccessor().get(IInstantiationService).createInstance(GitDiffService);
			const changes: Change[] = [{
				uri: Uri.file('/nonexistent/file.txt'),
				originalUri: Uri.file('/nonexistent/file.txt'),
				renameUri: undefined,
				status: 5
			}];

			const diffs = await service.getChangeDiffs(Uri.file('/nonexistent'), changes);
			expect(diffs).toEqual([]);
		});
	});

	describe('getWorkingTreeDiffsFromRef', () => {
		it('should use diffWith for tracked changes', async () => {
			const fileUri = Uri.file('/repo/file.txt');
			(mockRepository.diffWith as ReturnType<typeof vi.fn>).mockResolvedValue('ref diff');

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			const diffs = await gitDiffService.getWorkingTreeDiffsFromRef(mockRepository as Repository, changes, 'main');

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toBe('ref diff');
			expect(mockRepository.diffWith).toHaveBeenCalledWith('main', fileUri.fsPath);
		});

		it('should generate patch for untracked files instead of diffWith', async () => {
			const fileUri = Uri.file('/repo/new.txt');
			readFileSpy.mockResolvedValue(Buffer.from('new content\n'));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getWorkingTreeDiffsFromRef(mockRepository as Repository, changes, 'main');

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toContain('--- /dev/null');
			expect(diffs[0].diff).toContain('+new content');
			expect(mockRepository.diffWith).not.toHaveBeenCalled();
		});

		it('should skip copilot-ignored files', async () => {
			const ignoredUri = Uri.file('/repo/secret.txt');
			testIgnoreService.setIgnoredUris([ignoredUri]);

			const changes: Change[] = [{
				uri: ignoredUri,
				originalUri: ignoredUri,
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			const diffs = await gitDiffService.getWorkingTreeDiffsFromRef(mockRepository as Repository, changes, 'main');
			expect(diffs).toHaveLength(0);
		});
	});

	describe('diff truncation', () => {
		it('should truncate diffs exceeding MAX_DIFF_SIZE', async () => {
			const fileUri = Uri.file('/repo/large.txt');
			const largeDiff = 'x'.repeat(200_000);
			(mockRepository.diffWithHEAD as ReturnType<typeof vi.fn>).mockResolvedValue(largeDiff);

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff.length).toBeLessThan(largeDiff.length);
			expect(diffs[0].diff).toContain('[diff truncated]');
		});

		it('should not truncate diffs within MAX_DIFF_SIZE', async () => {
			const fileUri = Uri.file('/repo/small.txt');
			const smallDiff = 'x'.repeat(1000);
			(mockRepository.diffWithHEAD as ReturnType<typeof vi.fn>).mockResolvedValue(smallDiff);

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 5 /* MODIFIED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toBe(smallDiff);
		});
	});

	describe('large untracked files', () => {
		it('should return a minimal patch for files exceeding MAX_UNTRACKED_FILE_SIZE', async () => {
			const fileUri = Uri.file('/repo/huge.bin');
			const largeSize = 2 * 1024 * 1024; // 2 MB
			statSpy.mockResolvedValue({ size: largeSize, type: 1, ctime: 0, mtime: 0 } as vscode.FileStat);

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toContain('File too large to diff');
			expect(diffs[0].diff).toContain('--- /dev/null');
			// readFile should not have been called
			expect(readFileSpy).not.toHaveBeenCalled();
		});

		it('should proceed to read file if stat fails', async () => {
			const fileUri = Uri.file('/repo/nostat.txt');
			statSpy.mockRejectedValue(new Error('stat failed'));
			readFileSpy.mockResolvedValue(Buffer.from('content\n'));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].diff).toContain('+content');
			expect(diffs[0].diff).not.toContain('File too large');
		});
	});

	describe('_getUntrackedChangePatch', () => {
		it('should generate correct patch for untracked file', async () => {
			const fileUri = Uri.file('/repo/newfile.txt');
			const fileContent = 'line1\nline2\n';

			readFileSpy.mockResolvedValue(Buffer.from(fileContent));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			expect(diffs).toHaveLength(1);
			const patch = diffs[0].diff;

			// Verify standard git patch headers
			expect(patch).toContain('diff --git a/newfile.txt b/newfile.txt');
			expect(patch).toContain('new file mode 100644');
			expect(patch).toContain('--- /dev/null');
			expect(patch).toContain('+++ b/newfile.txt');

			// Verify range header uses line count (2 lines), not byte length
			expect(patch).toContain('@@ -0,0 +1,2 @@');

			// Verify content
			expect(patch).toContain('+line1');
			expect(patch).toContain('+line2');

			// Verify final newline
			expect(patch.endsWith('\n')).toBe(true);

			// Verify no "No newline at end of file" warning since file ends with \n
			expect(patch).not.toContain('\\ No newline at end of file');
		});

		it('should handle file without trailing newline', async () => {
			const fileUri = Uri.file('/repo/no-newline.txt');
			const fileContent = 'line1'; // No trailing \n

			readFileSpy.mockResolvedValue(Buffer.from(fileContent));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);
			const patch = diffs[0].diff;

			expect(patch).toContain('@@ -0,0 +1,1 @@');
			expect(patch).toContain('+line1');
			expect(patch).toContain('\\ No newline at end of file');
			expect(patch.endsWith('\n')).toBe(true);
		});

		it('should handle empty file', async () => {
			const fileUri = Uri.file('/repo/empty.txt');
			const fileContent = '';

			// Mock readFile to return an empty buffer
			readFileSpy.mockResolvedValue(Buffer.from(fileContent));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			// Empty file case: git omits range header and content for totally empty files
			const patch = diffs[0].diff;
			expect(patch).toContain('diff --git a/empty.txt b/empty.txt');
			expect(patch).toContain('new file mode 100644');
			expect(patch).toContain('--- /dev/null');
			expect(patch).toContain('+++ b/empty.txt');
			// No range header for empty files
			expect(patch).not.toContain('@@');
			// No content lines
			expect(patch).not.toMatch(/^\+[^+]/m);
		});

		it('should handle file with single blank line', async () => {
			const fileUri = Uri.file('/repo/blank-line.txt');
			const fileContent = '\n'; // Single newline

			readFileSpy.mockResolvedValue(Buffer.from(fileContent));

			const changes: Change[] = [{
				uri: fileUri,
				originalUri: fileUri,
				renameUri: undefined,
				status: 7 /* UNTRACKED */
			}];

			const diffs = await gitDiffService.getChangeDiffs(mockRepository as Repository, changes);

			// Single blank line: should have range header and one empty line addition
			const patch = diffs[0].diff;
			expect(patch).toContain('diff --git a/blank-line.txt b/blank-line.txt');
			expect(patch).toContain('new file mode 100644');
			expect(patch).toContain('--- /dev/null');
			expect(patch).toContain('+++ b/blank-line.txt');
			expect(patch).toContain('@@ -0,0 +1,1 @@');
			expect(patch).toContain('+'); // One empty line
			expect(patch.endsWith('\n')).toBe(true);
		});
	});
});
