/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata } from '../../../../files/common/files.js';
import { workspaceDirectoryHasHooks } from '../../../node/copilot/sessionCustomizationDiscovery.js';
import { createInMemoryFileService, seedFile } from './claudeCustomizationTestUtils.js';

suite('workspaceDirectoryHasHooks', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const workspace = URI.from({ scheme: Schemas.inMemory, path: '/ws' });

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects hooks by presence and location, ignoring non-JSON and respecting the depth cap', async () => {
		// The scan root is `<workspace>/.github/hooks` (depth 0). Directory `8` sits
		// at depth 8 — the deepest whose files are scanned — while directory `9`
		// (depth 9) is never reached.
		await seedFile(fileService, '/ws/topLevel/.github/hooks/hook.json', '{}');
		await seedFile(fileService, '/ws/upper/.github/hooks/HOOK.JSON', '{}');
		await seedFile(fileService, '/ws/nonJson/.github/hooks/hook.txt', 'not a hook');
		await seedFile(fileService, '/ws/deep/.github/hooks/1/2/3/4/5/6/7/8/hook.json', '{}');            // depth 8 → found
		await seedFile(fileService, '/ws/tooDeep/.github/hooks/1/2/3/4/5/6/7/8/9/hook.json', '{}');       // depth 9 → not found

		const has = (path: string) => workspaceDirectoryHasHooks(fileService, URI.from({ scheme: Schemas.inMemory, path }));
		assert.deepStrictEqual({
			missing: await workspaceDirectoryHasHooks(fileService, workspace),
			topLevel: await has('/ws/topLevel'),
			caseInsensitive: await has('/ws/upper'),
			nonJsonIgnored: await has('/ws/nonJson'),
			atDepthCap: await has('/ws/deep'),
			beyondDepthCap: await has('/ws/tooDeep'),
		}, {
			missing: false,
			topLevel: true,
			caseInsensitive: true,
			nonJsonIgnored: false,
			atDepthCap: true,
			beyondDepthCap: false,
		});
	});

	test('rethrows non-not-found errors so the caller can fail open', async () => {
		const throwingFileService = new class extends mock<IFileService>() {
			override async resolve(): Promise<IFileStatWithMetadata> {
				throw new FileOperationError('permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
			}
		};

		await assert.rejects(workspaceDirectoryHasHooks(throwingFileService, workspace));
	});

	test('throws a CancellationError when the caller cancels the scan', async () => {
		await assert.rejects(
			workspaceDirectoryHasHooks(fileService, workspace, CancellationToken.Cancelled),
			err => err instanceof CancellationError,
		);
	});

	test('cancels still-pending sibling scans when one branch fails (no leaked recursive IO)', async () => {
		// Directory layout under the scan root: `a` fails to stat while `b` is
		// still resolving; once `a`'s error tears the scan down, `b`'s deeper
		// child must never be read.
		const root = URI.from({ scheme: Schemas.inMemory, path: '/ws/.github/hooks' });
		const dirA = URI.from({ scheme: Schemas.inMemory, path: '/ws/.github/hooks/a' });
		const dirB = URI.from({ scheme: Schemas.inMemory, path: '/ws/.github/hooks/b' });
		const dirBChild = URI.from({ scheme: Schemas.inMemory, path: '/ws/.github/hooks/b/child' });
		const dirBResolved = new DeferredPromise<IFileStatWithMetadata>();
		const resolvedPaths: string[] = [];
		const dir = (resource: URI, children: URI[] = []): IFileStatWithMetadata => ({
			resource, name: basename(resource), isFile: false, isDirectory: true, isSymbolicLink: false,
			mtime: 0, ctime: 0, etag: '', size: 0, readonly: false, locked: false, executable: false,
			children: children.map(child => dir(child)),
		});

		const throwingFileService = new class extends mock<IFileService>() {
			override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
				resolvedPaths.push(resource.toString());
				if (resource.toString() === root.toString()) {
					return dir(root, [dirA, dirB]);
				}
				if (resource.toString() === dirA.toString()) {
					throw new FileOperationError('permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
				}
				if (resource.toString() === dirB.toString()) {
					return dirBResolved.p;
				}
				return dir(resource);
			}
		};

		const scan = workspaceDirectoryHasHooks(throwingFileService, URI.from({ scheme: Schemas.inMemory, path: '/ws' }));
		await assert.rejects(scan);
		// The scan has already failed and disposed(cancelled) its token; let the
		// slow `b` branch resume — it must observe cancellation and stop.
		dirBResolved.complete(dir(dirB, [dirBChild]));
		await timeout(0);
		await timeout(0);

		assert.ok(!resolvedPaths.includes(dirBChild.toString()), 'sibling scan should be cancelled and not read deeper directories');
	});
});
