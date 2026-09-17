/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { GitRepositoryState, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { MAX_WORKSPACE_CANDIDATES, WorkspaceCandidateResolver } from '../../browser/workspaceCandidates.js';

suite('WorkspaceCandidateResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function workspace(folder: URI): ISessionWorkspace {
		return {
			uri: folder, label: 'project', icon: Codicon.folder, requiresWorkspaceTrust: true, isVirtualWorkspace: false,
			folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
		};
	}

	function repository(folder: URI, remote: string, commit: string | undefined = 'abc'): IGitRepository {
		return new class extends mock<IGitRepository>() {
			override readonly rootUri = folder;
			override readonly state = constObservable<GitRepositoryState>({
				HEAD: { type: 0, commit }, remotes: [{ name: 'origin', fetchUrl: remote, isReadOnly: false }],
				mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [],
			});
		};
	}

	function setup(folders: URI[], repositories: IGitRepository[] = [], files?: IFileService) {
		const fileService = store.add(new FileService(new NullLogService()));
		const fs = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fs));
		let opens = 0;
		const git = new class extends mock<IGitService>() {
			override readonly repositories = repositories;
			override async openRepository() { opens++; return undefined; }
		};
		const recents = new class extends mock<ISessionsRecentWorkspacesService>() {
			override getRecentWorkspaces() { return folders.map(folder => ({ workspace: workspace(folder), providerId: 'local', checked: false })); }
		};
		const management = new class extends mock<ISessionsManagementService>() {
			override getSessions() { return []; }
		};
		const identity = new class extends mock<IUriIdentityService>() { override readonly extUri = extUri; };
		return { fileService, resolver: new WorkspaceCandidateResolver(recents, management, git, files ?? fileService, identity), opens: () => opens };
	}

	test('keeps two checkouts distinct, deduplicates paths, and strips remote credentials from summaries', async () => {
		const a = URI.file('/one/payments');
		const b = URI.file('/two/payments');
		const { resolver, fileService, opens } = setup([a, a, b], [
			repository(a, 'https://secret@github.com/example/payments.git'),
			repository(b, 'git@github.com:example/payments.git'),
		]);
		await fileService.createFolder(a);
		await fileService.createFolder(b);
		const result = await resolver.resolve({ repository: { owner: 'example', repo: 'payments' } }, 7, CancellationToken.None);
		assert.deepStrictEqual({
			rows: result.map(candidate => ({ path: candidate.folder.fsPath, repository: candidate.repository, validation: candidate.validation, revision: candidate.revision, worktree: candidate.worktree })),
			secret: JSON.stringify(result).includes('secret'), opens: opens(),
		}, {
			rows: [a, b].map(folder => ({ path: folder.fsPath, repository: { owner: 'example', repo: 'payments' }, validation: 'verified', revision: 7, worktree: 'available' })),
			secret: false, opens: 0,
		});
	});

	test('bounds discovery and does not open Git metadata without explicit evidence', async () => {
		const folders = Array.from({ length: 40 }, (_, i) => URI.file(`/known/${i}`));
		const { resolver, fileService, opens } = setup(folders);
		for (const folder of folders) {
			await fileService.createFolder(folder);
		}
		const candidates = await resolver.resolve({}, 1, CancellationToken.None);
		assert.deepStrictEqual({ count: candidates.length, opens: opens(), worktree: candidates[0].worktree }, { count: MAX_WORKSPACE_CANDIDATES, opens: 0, worktree: 'unknown' });
	});

	test('never converts an access failure to a missing checkout or a cloud recommendation', async () => {
		const files = new class extends mock<IFileService>() {
			override hasProvider() { return true; }
			override async stat(): Promise<never> { throw new FileOperationError('Access denied', FileOperationResult.FILE_PERMISSION_DENIED); }
		};
		const { resolver } = setup([], [], files);
		const candidate = await resolver.validate(URI.file('/private'), 1, true);
		assert.deepStrictEqual({ validation: candidate.validation, reason: candidate.reason, worktree: candidate.worktree }, { validation: 'error', reason: 'Access denied', worktree: 'unknown' });
	});

	test('reports missing, non-directory, empty Git repository, and remote paths truthfully', async () => {
		const empty = URI.file('/empty');
		const { resolver, fileService } = setup([], [repository(empty, 'https://github.com/example/empty', '')]);
		await fileService.createFolder(empty);
		const file = URI.file('/file.txt');
		await fileService.writeFile(file, VSBuffer.fromString('not a folder'));
		const missing = await resolver.validate(URI.file('/missing'), 1, false);
		const remote = await resolver.validate(URI.parse('vscode-remote://host/project'), 1, false);
		const checkout = await resolver.validate(empty, 1, false);
		const notDirectory = await resolver.validate(file, 1, false);
		assert.deepStrictEqual([missing.validation, remote.validation, checkout.validation, checkout.worktree, notDirectory.validation], ['missing', 'unavailable', 'verified', 'unavailable', 'unavailable']);
	});

	test('honors cancellation before filesystem or Git work', async () => {
		const { resolver, opens } = setup([URI.file('/known')]);
		await assert.rejects(resolver.resolve({}, 1, CancellationToken.Cancelled), error => error instanceof Error && error.name === 'Canceled');
		assert.strictEqual(opens(), 0);
	});
});
