/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileStatWithPartialMetadata } from '../../../../../platform/files/common/files.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { TestContextService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { pruneRecentRemoteFolderIfMissing } from '../../browser/recentRemoteFolderPruner.js';

class StubFileService extends TestFileService {
	statError: Error | undefined;
	statCalls: URI[] = [];

	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		this.statCalls.push(resource);
		if (this.statError) {
			throw this.statError;
		}
		return super.stat(resource);
	}
}

suite('pruneRecentRemoteFolderIfMissing', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const remoteFolder = URI.parse('vscode-remote://wsl%2BUbuntu/home/user/ghost-test');
	const virtualFolder = URI.parse('vscode-vfs://github/microsoft/vscode');
	const localFolder = URI.file('/tmp/local-folder');

	async function run(options: { folder: URI; statError?: Error }) {
		const removed: URI[][] = [];

		const contextService = new TestContextService(testWorkspace(options.folder));
		const fileService = ds.add(new StubFileService());
		fileService.statError = options.statError;

		const workspacesService: Pick<IWorkspacesService, 'removeRecentlyOpened'> = {
			async removeRecentlyOpened(paths: URI[]): Promise<void> { removed.push(paths); },
		};

		await pruneRecentRemoteFolderIfMissing(contextService, fileService, workspacesService as IWorkspacesService);

		return { fileService, removed };
	}

	test('prunes vscode-remote on FILE_NOT_FOUND; preserves entry on transient errors, generic errors, for local URIs, and for non-remote authorities (e.g. vscode-vfs)', async () => {
		const notFound = await run({
			folder: remoteFolder,
			statError: new FileOperationError('gone', FileOperationResult.FILE_NOT_FOUND),
		});
		const transient = await run({
			folder: remoteFolder,
			statError: new FileOperationError('host unreachable', FileOperationResult.FILE_OTHER_ERROR),
		});
		const genericError = await run({
			folder: remoteFolder,
			statError: new Error('No file system provider found for resource'),
		});
		const localUri = await run({
			folder: localFolder,
			statError: new FileOperationError('should never run', FileOperationResult.FILE_NOT_FOUND),
		});
		const virtualUri = await run({
			folder: virtualFolder,
			statError: new FileOperationError('should never run', FileOperationResult.FILE_NOT_FOUND),
		});

		assert.deepStrictEqual({
			notFound: { stats: notFound.fileService.statCalls.map(u => u.toString()), removed: notFound.removed.map(r => r.map(u => u.toString())) },
			transient: { stats: transient.fileService.statCalls.length, removed: transient.removed.length },
			genericError: { stats: genericError.fileService.statCalls.length, removed: genericError.removed.length },
			local: { stats: localUri.fileService.statCalls.length, removed: localUri.removed.length },
			virtual: { stats: virtualUri.fileService.statCalls.length, removed: virtualUri.removed.length },
		}, {
			notFound: { stats: [remoteFolder.toString()], removed: [[remoteFolder.toString()]] },
			transient: { stats: 1, removed: 0 },
			genericError: { stats: 1, removed: 0 },
			local: { stats: 0, removed: 0 },
			virtual: { stats: 0, removed: 0 },
		});
	});
});
