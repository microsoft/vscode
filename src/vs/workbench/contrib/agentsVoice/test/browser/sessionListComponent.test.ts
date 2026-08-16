/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSessionListNavigationIndex } from '../../browser/components/sessionListComponent.js';

suite('Session list component', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('navigates and wraps through session rows', () => {
		assert.deepStrictEqual([
			getSessionListNavigationIndex(0, 'up', 3),
			getSessionListNavigationIndex(2, 'down', 3),
			getSessionListNavigationIndex(0, 'down', 0),
		], [2, 0, undefined]);
	});
});
