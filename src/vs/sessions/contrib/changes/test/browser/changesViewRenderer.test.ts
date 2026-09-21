/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { isChangesFileResource } from '../../browser/changesViewRenderer.js';

suite('ChangesViewRenderer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches original, modified, display, and deleted file resources', () => {
		const displayUri = URI.file('/workspace/file.ts');
		const originalUri = URI.parse('git:/workspace/file.ts?ref=base');
		const modifiedUri = URI.parse('git:/workspace/file.ts?ref=head');
		const change: ISessionFileChange = {
			uri: displayUri,
			originalUri,
			modifiedUri,
			insertions: 1,
			deletions: 1,
		};
		const deletedDisplayUri = URI.file('/workspace/deleted.ts');
		const deletedOriginalUri = URI.parse('git:/workspace/deleted.ts?ref=base');
		const deletedChange: ISessionFileChange = {
			uri: deletedDisplayUri,
			originalUri: deletedOriginalUri,
			insertions: 0,
			deletions: 1,
		};

		assert.deepStrictEqual({
			original: isChangesFileResource(change, originalUri),
			modified: isChangesFileResource(change, modifiedUri),
			display: isChangesFileResource(change, displayUri),
			unrelated: isChangesFileResource(change, URI.file('/workspace/other.ts')),
			deletedDisplay: isChangesFileResource(deletedChange, deletedDisplayUri),
			deletedOriginal: isChangesFileResource(deletedChange, deletedOriginalUri),
		}, {
			original: true,
			modified: true,
			display: true,
			unrelated: false,
			deletedDisplay: true,
			deletedOriginal: true,
		});
	});
});
