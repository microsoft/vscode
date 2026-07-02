/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import type { FileEdit } from '../../common/state/protocol/state.js';
import { FileEditKind } from '../../common/state/sessionState.js';
import { normalizeFileEdit } from '../../common/fileEditDiff.js';

suite('fileEditDiff', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fileA = URI.file('/repo/a.ts').toString();
	const fileB = URI.file('/repo/b.ts').toString();
	const beforeContent = 'git-blob://before';
	const afterContent = 'git-blob://after';

	test('normalizes added, modified, deleted, and renamed edits', () => {
		const created: FileEdit = { after: { uri: fileA, content: { uri: afterContent } } };
		const modified: FileEdit = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileA, content: { uri: afterContent } } };
		const deleted: FileEdit = { before: { uri: fileA, content: { uri: beforeContent } } };
		const renamed: FileEdit = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileB, content: { uri: afterContent } } };

		const summarize = (edit: FileEdit) => {
			const n = normalizeFileEdit(edit);
			return n && {
				kind: n.kind,
				resource: n.resource.toString(),
				beforeUri: n.beforeUri?.toString(),
				afterUri: n.afterUri?.toString(),
				beforeContentUri: n.beforeContentUri?.toString(),
				afterContentUri: n.afterContentUri?.toString(),
			};
		};

		assert.deepStrictEqual(
			[created, modified, deleted, renamed].map(summarize),
			[
				{ kind: FileEditKind.Create, resource: fileA, beforeUri: undefined, afterUri: fileA, beforeContentUri: undefined, afterContentUri: afterContent },
				{ kind: FileEditKind.Edit, resource: fileA, beforeUri: fileA, afterUri: fileA, beforeContentUri: beforeContent, afterContentUri: afterContent },
				{ kind: FileEditKind.Delete, resource: fileA, beforeUri: fileA, afterUri: undefined, beforeContentUri: beforeContent, afterContentUri: undefined },
				{ kind: FileEditKind.Rename, resource: fileB, beforeUri: fileA, afterUri: fileB, beforeContentUri: beforeContent, afterContentUri: afterContent },
			]
		);
	});

	test('returns undefined when no usable URI is present', () => {
		assert.strictEqual(normalizeFileEdit({}), undefined);
	});
});
