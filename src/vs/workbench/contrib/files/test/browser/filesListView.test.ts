/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FilesListView } from '../../browser/views/filesListView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Files - FilesListView', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('FilesListView constants are defined', () => {
		assert.strictEqual(FilesListView.ID, 'workbench.files.filesListView');
		assert.ok(FilesListView.TITLE);
	});
});
