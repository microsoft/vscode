/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getTestingUnattendedRestartBlocker } from '../../browser/testingUnattendedRestart.js';

suite('getTestingUnattendedRestartBlocker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks while tests run', () => {
		const completed = { completedAt: 1 };
		const running = { completedAt: undefined };

		assert.deepStrictEqual({
			noResults: getTestingUnattendedRestartBlocker([]),
			completed: getTestingUnattendedRestartBlocker([completed]),
			running: getTestingUnattendedRestartBlocker([running, completed]),
		}, {
			noResults: undefined,
			completed: undefined,
			running: 'testing.runInProgress',
		});
	});
});
