/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { restoreMostRecentActiveParts, saveMostRecentActiveParts } from '../../../../browser/parts/editor/editorParts.js';

suite('Editor Parts', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const excluded = new Set(['excluded']);
	const isExcluded = (part: string) => excluded.has(part);

	test('most recently active parts without excluded parts are saved and restored by index', () => {
		const parts = ['main', 'a', 'b'];
		const mostRecentActiveParts = ['b', 'main', 'a'];

		const saved = saveMostRecentActiveParts(mostRecentActiveParts, parts, isExcluded);

		assert.deepStrictEqual({
			saved,
			restored: restoreMostRecentActiveParts(saved, ['main', 'a2', 'b2'], ['main'], isExcluded),
			mismatched: restoreMostRecentActiveParts([0], ['main', 'a2', 'b2'], ['main'], isExcluded),
		}, {
			saved: mostRecentActiveParts.map(part => parts.indexOf(part)),
			restored: ['b2', 'main', 'a2'],
			mismatched: ['main', 'a2', 'b2'],
		});
	});

	test('a part excluded from working sets does not shift the saved indices of the parts after it', () => {
		const saved = saveMostRecentActiveParts(['a', 'excluded', 'main'], ['main', 'excluded', 'a'], isExcluded);

		assert.deepStrictEqual({
			saved,
			afterRestart: restoreMostRecentActiveParts(saved, ['main', 'a2'], ['main'], isExcluded),
			afterApplyingWorkingSet: restoreMostRecentActiveParts(saved, ['main', 'excluded', 'a2'], ['excluded', 'main'], isExcluded),
		}, {
			saved: [1, 0],
			afterRestart: ['a2', 'main'],
			afterApplyingWorkingSet: ['a2', 'main', 'excluded'],
		});
	});

	test('a most recently active part excluded from working sets does not become the most recently active part when applying a working set', () => {
		const saved = saveMostRecentActiveParts(['excluded', 'main', 'a'], ['main', 'excluded', 'a'], isExcluded);

		assert.deepStrictEqual({
			saved,
			afterApplyingWorkingSet: restoreMostRecentActiveParts(saved, ['main', 'excluded', 'a2'], ['excluded', 'main'], isExcluded),
		}, {
			saved: [0, 1],
			afterApplyingWorkingSet: ['main', 'a2', 'excluded'],
		});
	});
});
