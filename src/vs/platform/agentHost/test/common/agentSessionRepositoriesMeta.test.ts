/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readSessionRepositories, VSCODE_SESSION_REPOSITORIES_META_KEY, withSessionRepositories } from '../../common/meta/agentSessionRepositoriesMeta.js';

suite('Agent session repositories metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the repositories of each folder, bounded, dropping malformed entries, and round-trips them', () => {
		const many = Array.from({ length: 70 }, (_, index) => ({ root: `file:///work/repo${index}`, kind: 'nested' }));
		const meta = {
			'vscode.other': 1,
			[VSCODE_SESSION_REPOSITORIES_META_KEY]: {
				work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested', extra: true }, { root: '', kind: 'nested' }, { root: 'file:///work/x', kind: 'unknown' }, { root: 'file:///work/sub', kind: 'submodule' }, 'not an entry'],
				many,
				malformed: 'not a list',
			},
		};
		const read = readSessionRepositories(meta);

		assert.deepStrictEqual({
			work: read?.work,
			many: read?.many.length,
			malformed: read?.malformed,
			absent: readSessionRepositories({}),
			notAnObject: readSessionRepositories({ [VSCODE_SESSION_REPOSITORIES_META_KEY]: ['file:///work'] }),
			roundTrip: readSessionRepositories(withSessionRepositories({ 'vscode.other': 1 }, { work: read!.work })),
			keepsOtherMeta: withSessionRepositories({ 'vscode.other': 1 }, {})?.['vscode.other'],
		}, {
			work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested' }],
			many: 64,
			malformed: undefined,
			absent: undefined,
			notAnObject: undefined,
			roundTrip: { work: [{ root: 'file:///work', kind: 'folder' }, { root: 'file:///work/docs', kind: 'nested' }] },
			keepsOtherMeta: 1,
		});
	});
});
