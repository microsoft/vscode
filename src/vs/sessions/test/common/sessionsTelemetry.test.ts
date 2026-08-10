/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { classifySessionWorkspaceTopology } from '../../common/sessionsTelemetry.js';

suite('sessionsTelemetry helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifySessionWorkspaceTopology reconciles folder counts', () => {
		assert.deepStrictEqual(classifySessionWorkspaceTopology(3, 2), {
			folderCount: 3,
			gitFolderCount: 2,
			nonGitFolderCount: 1,
			isMultiRoot: true,
		});
	});

	test('classifySessionWorkspaceTopology treats a single folder as single-root', () => {
		assert.deepStrictEqual(classifySessionWorkspaceTopology(1, 1), {
			folderCount: 1,
			gitFolderCount: 1,
			nonGitFolderCount: 0,
			isMultiRoot: false,
		});
	});
});
