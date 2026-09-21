/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IGitService } from '../../../contrib/git/common/gitService.js';
import { MainThreadGitExtensionService } from '../../browser/mainThreadGitExtensionService.js';
import { GitRefTypeDto, type ExtHostGitExtensionShape, type GitRepositoryStateDto } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadGitExtensionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('owns repository wrappers across reopen and disposal', async () => {
		const rootUri = URI.file('/workspace');
		let state: GitRepositoryStateDto = {
			HEAD: { type: GitRefTypeDto.Head, name: 'main', commit: 'abc123' },
			remotes: [],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		};
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> {
				return false;
			}

			override async $openRepository() {
				return { handle: 1, rootUri, state };
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IGitService>() { },
		));

		const firstRepository = await service.openRepository(rootUri);
		state = { ...state, HEAD: { type: GitRefTypeDto.Head, name: 'updated-branch', commit: 'def456' } };
		const secondRepository = await service.openRepository(rootUri);

		assert.deepStrictEqual({
			createdNewWrapper: firstRepository !== secondRepository,
			updatedExistingState: firstRepository?.state.get().HEAD?.name,
			trackedRepositories: Array.from(service.repositories).length,
		}, {
			createdNewWrapper: false,
			updatedExistingState: 'updated-branch',
			trackedRepositories: 1,
		});

		service.dispose();
	});

	test('warm repository reopen work counts remain bounded', async () => {
		const rootUri = URI.file('/workspace');
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> { return false; }
			override async $openRepository() {
				return { handle: 1, rootUri, state: { HEAD: { type: GitRefTypeDto.Head, name: 'main', commit: 'a'.repeat(40) }, remotes: [], mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [] } };
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(SingleProxyRPCProtocol(proxy), new class extends mock<IGitService>() { }));
		const wrappers = new Set();
		for (let index = 0; index < 20; index++) {
			wrappers.add(await service.openRepository(rootUri));
		}
		assert.strictEqual(wrappers.size, 1);
	});

	test('strict diff requests report unavailable repositories and forward error handling to the extension host', async () => {
		const rootUri = URI.file('/workspace');
		const forwarded: (boolean | undefined)[] = [];
		const proxy = new class extends mock<ExtHostGitExtensionShape>() {
			override async $isGitExtensionAvailable(): Promise<boolean> { return false; }
			override async $openRepository() {
				return {
					handle: 1, rootUri,
					state: { HEAD: { type: GitRefTypeDto.Head, name: 'main', commit: 'a'.repeat(40) }, remotes: [], mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [] },
				};
			}
			override async $diffBetweenWithStats2(_handle: number, _ref: string, _path?: string, options?: { readonly throwOnError?: boolean }) {
				forwarded.push(options?.throwOnError);
				if (options?.throwOnError) {
					throw new Error('Git command failed');
				}
				return [];
			}
		};
		const service = disposables.add(new MainThreadGitExtensionService(SingleProxyRPCProtocol(proxy), new class extends mock<IGitService>() { }));
		await assert.rejects(service.diffBetweenWithStats2(rootUri, 'HEAD', undefined, { throwOnError: true }), /not open/);
		const legacy = await service.diffBetweenWithStats2(rootUri, 'HEAD');
		await service.openRepository(rootUri);
		await service.diffBetweenWithStats2(rootUri, 'HEAD');
		await assert.rejects(service.diffBetweenWithStats2(rootUri, 'HEAD', undefined, { throwOnError: true }), /Git command failed/);
		assert.deepStrictEqual({ legacy, forwarded }, { legacy: [], forwarded: [undefined, true] });
	});
});
