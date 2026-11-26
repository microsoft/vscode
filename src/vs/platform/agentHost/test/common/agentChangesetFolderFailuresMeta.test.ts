/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readChangesetFolderFailures, VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY, withChangesetFolderFailures } from '../../common/meta/agentChangesetFolderFailuresMeta.js';

suite('Agent changeset folder failures metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('bounds the reasons it writes and reads, replaces the entries a predicate matches, and removes the key when none remain', () => {
		const long = 'x'.repeat(2000);
		const written = withChangesetFolderFailures({ 'vscode.other': 1 }, 'turn/a', [{ folder: 'file:///repoB', message: long, detail: long }]);
		const replaced = withChangesetFolderFailures(written, 'turn/b', [{ folder: 'file:///repoB', message: 'Failed' }], key => key.startsWith('turn/'));
		const readUnbounded = readChangesetFolderFailures({ [VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY]: { 'turn/c': [{ folder: 'file:///repoB', message: long }] } });

		assert.deepStrictEqual({
			lengths: readChangesetFolderFailures(written)['turn/a'].map(failure => [failure.message.length, failure.detail?.length]),
			readLength: readUnbounded['turn/c'][0].message.length,
			replaced: Object.keys(readChangesetFolderFailures(replaced)),
			cleared: withChangesetFolderFailures(replaced, 'turn/b', []),
		}, {
			lengths: [[1024, 1024]],
			readLength: 1024,
			replaced: ['turn/b'],
			cleared: { 'vscode.other': 1 },
		});
	});
});
