/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { readFolderGitRepository, WorkspaceFolderRepositories } from '../../../browser/agentsView/workspaceFolderRepositories.js';

suite('WorkspaceFolderRepositories', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A file service over `.git` entries: a string is the content of a `.git` file, `true` a `.git` directory, `false` one that cannot be read. */
	function createFileService(entries: Record<string, string | boolean>) {
		const reads: string[] = [];
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => {
				reads.push(resource.path);
				const entry = entries[resource.path];
				if (entry === false) {
					throw new FileOperationError('permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
				}
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
			'/work/denied/.git': false,
		});
		const read = async (folder: string) => (await readFolderGitRepository(fileService, URI.file(folder)))?.path;

		assert.deepStrictEqual({
			checkout: await read('/work/vscode'),
			worktree: await read('/work/owners/scope'),
			relativeWorktree: await read('/work/relative'),
			submodule: await read('/work/submodule'),
			plain: await read('/work/plain'),
			denied: await readFolderGitRepository(fileService, URI.file('/work/denied')).then(() => 'read', () => 'failed'),
		}, {
			checkout: '/work/vscode',
			worktree: '/work/vscode',
			relativeWorktree: '/work/vscode',
			submodule: undefined,
			plain: undefined,
			denied: 'failed',
		});
	});

	test('reads each folder once as it joins, drops a folder as it leaves, and reads again after a failure', async () => {
		const entries: Record<string, string | boolean> = {
			'/work/vscode/.git': true,
			'/work/owners/scope/.git': 'gitdir: /work/vscode/.git/worktrees/scope',
			'/work/other/.git': true,
			'/work/denied/.git': false,
		};
		const { fileService, reads } = createFileService(entries);
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let folders = [URI.file('/work/owners/scope'), URI.file('/work/plain'), URI.file('/work/denied'), URI.parse('vscode-remote://host/work/remote')];
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: (message: string) => { warnings.push(message); } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		}));
		const repositories = store.add(instantiationService.createInstance(WorkspaceFolderRepositories));
		const settled = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
		const changeFolders = (next: URI[]) => {
			folders = next;
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		};
		const snapshot = () => ({ repositories: repositories.repositories.get().map(uri => uri.path), reads: reads.length, warnings: warnings.length });

		await settled();
		const initial = snapshot();
		entries['/work/denied/.git'] = true;
		changeFolders([...folders, URI.file('/work/other')]);
		await settled();
		const added = snapshot();
		changeFolders(folders.filter(folder => folder.path !== '/work/owners/scope'));
		const removedAtOnce = snapshot();

		assert.deepStrictEqual({ initial, added, removedAtOnce }, {
			// The scope worktree names its main checkout; the plain folder has no `.git`; the denied one is logged.
			initial: { repositories: ['/work/vscode'], reads: 3, warnings: 1 },
			// Only the folder that joined and the one that failed are read again.
			added: { repositories: ['/work/vscode', '/work/denied', '/work/other'], reads: 5, warnings: 1 },
			removedAtOnce: { repositories: ['/work/denied', '/work/other'], reads: 5, warnings: 1 },
		});
	});

	test('drops a replaced folder\'s repository before the read of the folder replacing it settles', async () => {
		const readOfB = new DeferredPromise<void>();
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => {
				if (resource.path === '/work/b/.git') {
					await readOfB.p;
				}
				return upcastPartial<IFileStatWithMetadata>({ isDirectory: true });
			},
		});
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let folders = [URI.file('/work/a')];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: () => { } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		}));
		const repositories = store.add(instantiationService.createInstance(WorkspaceFolderRepositories));
		const settled = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); } };
		const published = () => repositories.repositories.get().map(uri => uri.path);

		await settled();
		const beforeReplace = published();
		folders = [URI.file('/work/b')];
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		await settled();
		const whileBIsRead = published();
		readOfB.complete();
		await settled();

		assert.deepStrictEqual({ beforeReplace, whileBIsRead, afterBIsRead: published() }, {
			beforeReplace: ['/work/a'],
			whileBIsRead: [],
			afterBIsRead: ['/work/b'],
		});
	});
});
