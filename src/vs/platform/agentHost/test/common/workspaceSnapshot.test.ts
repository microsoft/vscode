/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { filterWorkspaceSnapshot, getWorkspaceSnapshotPaths, renderWorkspaceSnapshotStructure, type IWorkspaceSnapshot } from '../../common/workspaceSnapshot.js';

suite('workspaceSnapshot', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const snapshot: IWorkspaceSnapshot = {
		roots: [{
			path: '/a',
			heading: '/a',
			entries: [
				{ path: '/a/README.md', depth: 0, line: 'README.md' },
				{ path: '/a/secrets', depth: 0, line: 'secrets/' },
				{ path: '/a/secrets/keys', depth: 1, line: '\tkeys/' },
				{ path: '/a/secrets/keys/id', depth: 2, line: '\t\tid' },
				{ path: '/a/src', depth: 0, line: 'src/' },
				{ path: '/a/src/main.ts', depth: 1, line: '\tmain.ts' },
			],
			truncated: true,
		}, {
			path: '/b',
			heading: '/b',
			entries: [{ path: '/b/private', depth: 0, line: 'private/' }],
			truncated: false,
		}, {
			path: '/secret-project',
			heading: '/secret-project',
			entries: [{ path: '/secret-project/README.md', depth: 0, line: 'README.md' }],
			truncated: false,
		}],
	};

	test('drops excluded roots and entries with everything below them, and roots left empty', () => {
		const excluded = new Set(['/a/secrets', '/a/src/main.ts', '/b/private', '/secret-project']);
		assert.deepStrictEqual({
			paths: getWorkspaceSnapshotPaths(snapshot),
			all: renderWorkspaceSnapshotStructure(snapshot),
			filtered: renderWorkspaceSnapshotStructure(filterWorkspaceSnapshot(snapshot, path => excluded.has(path))),
		}, {
			paths: ['/a', '/a/README.md', '/a/secrets', '/a/secrets/keys', '/a/secrets/keys/id', '/a/src', '/a/src/main.ts', '/b', '/b/private', '/secret-project', '/secret-project/README.md'],
			all: '/a\nREADME.md\nsecrets/\n\tkeys/\n\t\tid\nsrc/\n\tmain.ts\n...\n\n/b\nprivate/\n\n/secret-project\nREADME.md',
			filtered: '/a\nREADME.md\nsrc/\n...',
		});
	});
});
