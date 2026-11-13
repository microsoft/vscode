/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { WorkspaceFolderRepositories } from '../../browser/workspaceFolderRepositories.js';
import { parseGitHubRepositoryFromGitConfig } from '../../browser/gitHubRepositoryResolver.js';

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

	/** The scope of a window with `folders` over the `.git` entries of {@link createFileService}, once its reads settle. */
	async function readScope(entries: Record<string, string | boolean>, folders: readonly string[]) {
		const { fileService } = createFileService(entries);
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: (message: string) => { warnings.push(message); } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: store.add(new Emitter<IWorkspaceFoldersChangeEvent>()).event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(folder => upcastPartial<IWorkspaceFolder>({ uri: URI.file(folder) })) }),
		}));
		const scope = store.add(instantiationService.createInstance(WorkspaceFolderRepositories));
		await timeout(0);
		return { repositories: scope.repositories.get().map(uri => uri.path), gitHubRepositories: scope.gitHubRepositories.get(), warnings: warnings.length };
	}

	test('reads the repository of a checkout, of a worktree and of no checkout', async () => {
		const entries = {
			'/work/vscode/.git': true,
			'/work/owners/scope/.git': 'gitdir: /work/vscode/.git/worktrees/scope\n',
			'/work/relative/.git': 'gitdir: ../vscode/.git/worktrees/relative',
			'/work/submodule/.git': 'gitdir: ../vscode/.git/modules/submodule',
			'/work/denied/.git': false,
		};
		const read = async (folder: string) => {
			const { repositories, warnings } = await readScope(entries, [folder]);
			return warnings ? 'failed' : repositories[0];
		};

		assert.deepStrictEqual({
			checkout: await read('/work/vscode'),
			worktree: await read('/work/owners/scope'),
			relativeWorktree: await read('/work/relative'),
			submodule: await read('/work/submodule'),
			plain: await read('/work/plain'),
			denied: await read('/work/denied'),
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
		const settled = () => timeout(0);
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

	test('parses the GitHub repository of the origin remote', async () => {
		const gitHubOf = async (config: string) => (await readScope({ '/work/repo/.git': true, '/work/repo/.git/config': config }, ['/work/repo'])).gitHubRepositories[0];
		const origin = (url: string, remote = 'origin', headerComment = '') => gitHubOf(`[core]\n\tbare = false\n[remote "${remote}"]${headerComment}\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/${remote}/*\n`);
		assert.deepStrictEqual({
			https: await origin('https://github.com/Microsoft/VSCode.git'),
			httpsWithoutSuffix: await origin('https://github.com/microsoft/vscode'),
			httpsWithUser: await origin('https://user@github.com/microsoft/vscode.git'),
			scp: await origin('git@github.com:microsoft/vscode.git'),
			ssh: await origin('ssh://git@github.com/microsoft/vscode'),
			quoted: await origin('"https://github.com/microsoft/vscode.git"'),
			comment: await origin('https://github.com/microsoft/vscode.git # the main repository'),
			quotedWithComment: await origin('"git@github.com:microsoft/vscode.git" ; a comment'),
			headerHashComment: await origin('https://github.com/microsoft/vscode.git', 'origin', ' # the main repository'),
			headerSemicolonComment: await origin('https://github.com/microsoft/vscode.git', 'origin', '; the main repository'),
			// Only origin's URL counts, also with comments on both headers
			originAfterCommentedUpstream: await gitHubOf('[remote "upstream"] # x\n\turl = https://github.com/other/upstream.git\n[remote "origin"] ; y\n\turl = git@github.com:microsoft/vscode.git\n'),
			commentedUpstreamOnly: await gitHubOf('[remote "upstream"] # x\n\turl = https://github.com/other/upstream.git\n'),
			// The other callers of the shared parser read headers exactly as before
			otherCallersHeaderComment: parseGitHubRepositoryFromGitConfig('[remote "origin"] # comment\n\turl = https://github.com/microsoft/vscode.git\n'),
			otherHost: await origin('https://gitlab.com/microsoft/vscode.git'),
			otherRemote: await origin('https://github.com/microsoft/vscode.git', 'upstream'),
		}, {
			https: 'microsoft/vscode',
			httpsWithoutSuffix: 'microsoft/vscode',
			httpsWithUser: 'microsoft/vscode',
			scp: 'microsoft/vscode',
			ssh: 'microsoft/vscode',
			quoted: 'microsoft/vscode',
			comment: 'microsoft/vscode',
			quotedWithComment: 'microsoft/vscode',
			headerHashComment: 'microsoft/vscode',
			headerSemicolonComment: 'microsoft/vscode',
			originAfterCommentedUpstream: 'microsoft/vscode',
			commentedUpstreamOnly: undefined,
			otherCallersHeaderComment: undefined,
			otherHost: undefined,
			otherRemote: undefined,
		});
	});

	test('reads the GitHub origin of each folder\'s repository, of a worktree\'s from its main checkout, once, and again after a failure', async () => {
		const config = (url: string) => `[remote "origin"]\n\turl = ${url}\n`;
		const files: Record<string, string | boolean> = {
			'/work/vscode/.git': true,
			'/work/vscode/.git/config': config('git@github.com:microsoft/vscode.git'),
			'/work/owners/scope/.git': 'gitdir: /work/vscode/.git/worktrees/scope',
			'/work/tools/.git': true,
			'/work/tools/.git/config': false,
			'/work/local/.git': true,
		};
		const reads: string[] = [];
		const read = (resource: URI) => {
			reads.push(resource.path);
			const entry = files[resource.path];
			if (entry === false) {
				throw new FileOperationError('permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
			}
			if (entry === undefined) {
				throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
			}
			return entry;
		};
		const fileService = upcastPartial<IFileService>({
			stat: async (resource: URI) => upcastPartial<IFileStatWithMetadata>({ isDirectory: read(resource) === true }),
			readFile: async (resource: URI) => upcastPartial<IFileContent>({ value: VSBuffer.fromString(String(read(resource))) }),
		});
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const folders = [URI.file('/work/owners/scope'), URI.file('/work/tools'), URI.file('/work/local')];
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, upcastPartial<ILogService>({ warn: (message: string) => { warnings.push(message); } }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		}));
		const scope = store.add(instantiationService.createInstance(WorkspaceFolderRepositories));
		const settled = () => timeout(0);
		const snapshot = () => ({ repositories: scope.repositories.get().map(uri => uri.path), gitHub: scope.gitHubRepositories.get(), configReads: reads.filter(path => path.endsWith('/config')).sort(), warnings: warnings.length });

		await settled();
		const initial = snapshot();
		files['/work/tools/.git/config'] = config('https://github.com/microsoft/vscode-tools');
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		await settled();

		assert.deepStrictEqual({ initial, afterChange: snapshot() }, {
			// The worktree reads its main checkout's config; a missing config is no GitHub repository; a failed read is logged
			initial: { repositories: ['/work/vscode', '/work/tools', '/work/local'], gitHub: ['microsoft/vscode'], configReads: ['/work/local/.git/config', '/work/tools/.git/config', '/work/vscode/.git/config'], warnings: 1 },
			// Only the config that failed is read again
			afterChange: { repositories: ['/work/vscode', '/work/tools', '/work/local'], gitHub: ['microsoft/vscode', 'microsoft/vscode-tools'], configReads: ['/work/local/.git/config', '/work/tools/.git/config', '/work/tools/.git/config', '/work/vscode/.git/config'], warnings: 1 },
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
		const settled = () => timeout(0);
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
