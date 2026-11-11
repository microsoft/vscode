/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { readFolderGitRepository, WorkspaceFolderRepositories } from '../../../browser/agentsView/workspaceFolderRepositories.js';

suite('WorkspaceFolderRepositories', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A file service over `.git` entries: a string is the content of a `.git` file, `true` a `.git` directory. */
	function createFileService(entries: Record<string, string | true>) {
		const reads: string[] = [];
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => {
				reads.push(resource.path);
				const entry = entries[resource.path];
				if (entry === undefined) {
					throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileStatWithMetadata>({ isDirectory: entry === true });
			},
			readFile: async (resource: URI) => upcastPartial<IFileContent>({ value: VSBuffer.fromString(String(entries[resource.path])) }),
		});
		return { fileService, reads };
	}

	test('reads the repository of a checkout, of a worktree and of no checkout', async () => {
		const { fileService } = createFileService({
			'/work/vscode/.git': true,
			'/work/owners/scope/.git': 'gitdir: /work/vscode/.git/worktrees/scope\n',
			'/work/relative/.git': 'gitdir: ../vscode/.git/worktrees/relative',
			'/work/submodule/.git': 'gitdir: ../vscode/.git/modules/submodule',
		});
		const read = async (folder: string) => (await readFolderGitRepository(fileService, URI.file(folder)))?.path;

		assert.deepStrictEqual({
			checkout: await read('/work/vscode'),
			worktree: await read('/work/owners/scope'),
			relativeWorktree: await read('/work/relative'),
			submodule: await read('/work/submodule'),
			plain: await read('/work/plain'),
		}, {
			checkout: '/work/vscode',
			worktree: '/work/vscode',
			relativeWorktree: '/work/vscode',
			submodule: undefined,
			plain: undefined,
		});
	});

	test('reads each folder once as it joins the workspace', async () => {
		const { fileService, reads } = createFileService({
			'/work/vscode/.git': true,
			'/work/owners/scope/.git': 'gitdir: /work/vscode/.git/worktrees/scope',
		});
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let folders = [URI.file('/work/owners/scope'), URI.file('/work/plain'), URI.parse('vscode-remote://host/work/remote')];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		}));
		const repositories = store.add(instantiationService.createInstance(WorkspaceFolderRepositories));
		const settled = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
		const snapshot = () => ({ repositories: repositories.repositories.get().map(uri => uri.path), reads: [...reads] });

		await settled();
		const initial = snapshot();
		folders = [...folders, URI.file('/work/vscode')];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		await settled();
		const added = snapshot();

		assert.deepStrictEqual({ initial, added }, {
			initial: { repositories: ['/work/vscode'], reads: ['/work/owners/scope/.git', '/work/plain/.git'] },
			added: { repositories: ['/work/vscode', '/work/vscode'], reads: ['/work/owners/scope/.git', '/work/plain/.git', '/work/vscode/.git'] },
		});
	});
});
