/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ResourceType } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
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
			resourceResolve: async () => { throw new Error('not found'); },
		}, URI.file('/missing'));

		assert.strictEqual(result, undefined);
	});
});
