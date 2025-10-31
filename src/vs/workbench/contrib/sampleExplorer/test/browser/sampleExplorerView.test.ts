/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SampleExplorerView } from '../../browser/views/sampleExplorerView.js';

suite('Sample Explorer - View', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('SampleExplorerView has correct ID and NAME', function () {
		assert.strictEqual(SampleExplorerView.ID, 'workbench.sampleExplorer.view');
		assert.strictEqual(SampleExplorerView.NAME, 'Sample Explorer');
	});
});

