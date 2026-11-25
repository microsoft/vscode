/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI, type UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitRefType, type IGitService } from '../../../contrib/git/common/gitService.js';
import { MainThreadGitExtensionService } from '../../browser/mainThreadGitExtensionService.js';
import { GitRefTypeDto, type ExtHostGitExtensionShape, type GitCommitOptionsDto, type GitRepositoryStateDto } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadGitExtensionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses and refreshes the repository wrapper when reopening', async () => {
		const rootUri = URI.file('/workspace');
		const createState = (name: string, commit: string): GitRepositoryStateDto => ({
			HEAD: { type: GitRefTypeDto.Head, name, commit },
			remotes: [],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
		let openRepositoryCalls = 0;
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> {
				return false;
			}

			override async $openRepository() {
				openRepositoryCalls++;
				const state = openRepositoryCalls === 1
					? createState('main', 'abc123')
					: createState('feature', 'def456');
				return { handle: 1, rootUri, state };
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IGitService>() { },
		));

		const firstRepository = await service.openRepository(rootUri);
		const secondRepository = await service.openRepository(rootUri);

		assert.deepStrictEqual({
			openRepositoryCalls,
			reusedWrapper: firstRepository === secondRepository,
			trackedRepositories: Array.from(service.repositories).length,
			head: firstRepository?.state.get().HEAD,
		}, {
			openRepositoryCalls: 2,
			reusedWrapper: true,
			trackedRepositories: 1,
			head: {
				type: GitRefType.Head,
				name: 'feature',
				commit: 'def456',
				remote: undefined,
				upstream: undefined,
				ahead: undefined,
				behind: undefined,
			},
		});
	});

	test('skips a queued open whose token is cancelled before it runs', async () => {
		const state: GitRepositoryStateDto = { HEAD: { type: GitRefTypeDto.Head, name: 'main', commit: 'abc123' }, remotes: [], mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [] };
		const firstOpen = new DeferredPromise<void>();
		const openedPaths: string[] = [];
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> {
				return false;
			}

			override async $openRepository(uri: UriComponents) {
				const rootUri = URI.revive(uri);
				openedPaths.push(rootUri.path);
				if (openedPaths.length === 1) {
					await firstOpen.p;
				}
				return { handle: openedPaths.length, rootUri, state };
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IGitService>() { },
		));
		const cts = disposables.add(new CancellationTokenSource());

		const first = service.openRepository(URI.file('/first'));
		const second = service.openRepository(URI.file('/second'), cts.token);
		cts.cancel();
		firstOpen.complete();
		const results = await Promise.all([first, second, service.openRepository(URI.file('/third'))]);

		assert.deepStrictEqual({
			openedPaths,
			results: results.map(repository => repository?.rootUri.path),
		}, {
			openedPaths: ['/first', '/third'],
			results: ['/first', undefined, '/third'],
		});
	});

	test('forwards commitFiles to the extension host for the repository handle', async () => {
		const rootUri = URI.file('/workspace');
		const commits: { handle: number; files: string[]; message: string; options: GitCommitOptionsDto | undefined }[] = [];
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> {
				return false;
			}

			override async $openRepository() {
				return {
					handle: 7,
					rootUri,
					state: { HEAD: { type: GitRefTypeDto.Head, name: 'main', commit: 'abc123' }, remotes: [], mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [] },
				};
			}

			override async $commitFiles(handle: number, files: UriComponents[], message: string, options?: GitCommitOptionsDto): Promise<void> {
				commits.push({ handle, files: files.map(file => URI.revive(file).path), message, options });
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IGitService>() { },
		));

		const repository = await service.openRepository(rootUri);
		await repository!.commitFiles([URI.file('/workspace/a.md')], 'message', { noVerify: true, signCommit: false });

		assert.deepStrictEqual(commits, [{ handle: 7, files: ['/workspace/a.md'], message: 'message', options: { noVerify: true, signCommit: false } }]);
	});
});
