/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { excludeOwnWindowSources } from '../../common/appWindows.js';

suite('excludeOwnWindowSources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves out the windows of VS Code by their handle, and keeps the order of the others', () => {
		const sources = [{ id: 'window:11:0' }, { id: 'window:22:0' }, { id: 'window:33:1' }, { id: 'window:44:0' }];

		assert.deepStrictEqual(excludeOwnWindowSources(sources, ['window:22:0', 'window:33:0', 'invalid']).map(source => source.id), ['window:11:0', 'window:44:0']);
	});
});
