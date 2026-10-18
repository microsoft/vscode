/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ResourceType } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getWorktreeDiskUsage } from '../../browser/worktreeDiskUsage.js';

suite('WorktreeDiskUsage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sums files recursively without following symlinks', async () => {
		const root = URI.file('/worktree');
		const entries = new Map<string, readonly { name: string; type: 'file' | 'directory' }[]>([
			[root.toString(), [
				{ name: 'src', type: 'directory' },
				{ name: 'README.md', type: 'file' },
				{ name: 'external', type: 'file' },
			]],
			[URI.joinPath(root, 'src').toString(), [
				{ name: 'index.ts', type: 'file' },
			]],
		]);
		const sizes = new Map<string, { type: ResourceType; size?: number }>([
			[root.toString(), { type: ResourceType.Directory }],
			[URI.joinPath(root, 'src').toString(), { type: ResourceType.Directory }],
			[URI.joinPath(root, 'README.md').toString(), { type: ResourceType.File, size: 10 }],
			[URI.joinPath(root, 'external').toString(), { type: ResourceType.Symlink, size: 1000 }],
			[URI.joinPath(root, 'src', 'index.ts').toString(), { type: ResourceType.File, size: 25 }],
		]);

		const result = await getWorktreeDiskUsage({
			resourceList: async uri => ({ entries: [...(entries.get(uri.toString()) ?? [])] }),
			resourceResolve: async params => ({
				uri: params.uri,
				...(sizes.get(params.uri) ?? { type: ResourceType.File, size: 0 }),
			}),
		}, root);

		assert.strictEqual(result, 35);
	});

	test('returns undefined when the worktree no longer exists', async () => {
		const result = await getWorktreeDiskUsage({
			resourceList: async () => ({ entries: [] }),
			resourceResolve: async () => { throw new ProtocolError(AhpErrorCodes.NotFound, 'not found'); },
		}, URI.file('/missing'));

		assert.strictEqual(result, undefined);
	});

	test('rethrows failures that are not the worktree missing', async () => {
		await assert.rejects(() => getWorktreeDiskUsage({
			resourceList: async () => ({ entries: [] }),
			resourceResolve: async () => { throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'denied'); },
		}, URI.file('/protected')), /denied/);
	});

	test('bounds concurrent resource resolution', async () => {
		const root = URI.file('/worktree');
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		let activeRequests = 0;
		let maxActiveRequests = 0;

		const measurement = getWorktreeDiskUsage({
			resourceList: async () => ({
				entries: Array.from({ length: 20 }, (_, index) => ({ name: `file-${index}`, type: 'file' })),
			}),
			resourceResolve: async params => {
				if (params.uri === root.toString()) {
					return { uri: params.uri, type: ResourceType.Directory };
				}
				activeRequests++;
				maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
				if (activeRequests === 8) {
					saturated.complete();
				}
				await gate.p;
				activeRequests--;
				return { uri: params.uri, type: ResourceType.File, size: 1 };
			},
		}, root);

		await saturated.p;
		gate.complete();

		assert.deepStrictEqual({ size: await measurement, maxActiveRequests }, { size: 20, maxActiveRequests: 8 });
	});

	test('stops scheduling resource resolution after cancellation', async () => {
		const root = URI.file('/worktree');
		const gate = new DeferredPromise<void>();
		const saturated = new DeferredPromise<void>();
		const cancellation = new CancellationTokenSource();
		let resolvedResources = 0;

		const measurement = getWorktreeDiskUsage({
			resourceList: async () => ({
				entries: Array.from({ length: 20 }, (_, index) => ({ name: `file-${index}`, type: 'file' })),
			}),
			resourceResolve: async params => {
				if (params.uri === root.toString()) {
					return { uri: params.uri, type: ResourceType.Directory };
				}
				resolvedResources++;
				if (resolvedResources === 8) {
					saturated.complete();
				}
				await gate.p;
				return { uri: params.uri, type: ResourceType.File, size: 1 };
			},
		}, root, cancellation.token);

		await saturated.p;
		cancellation.cancel();

		await assert.rejects(measurement, error => isCancellationError(error));
		assert.strictEqual(resolvedResources, 8);
		gate.complete();
		cancellation.dispose();
	});
});
