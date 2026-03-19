/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getDefaultTimelinePageSize } from '../../common/timelinePaging.js';

suite('timelinePaging', () => {
	test('defaults to minimum for undefined render height', () => {
		assert.strictEqual(getDefaultTimelinePageSize(undefined, 22, false), 20);
		assert.strictEqual(getDefaultTimelinePageSize(undefined, 22, true), 20);
	});

	test('computes page size from visible items', () => {
		assert.strictEqual(getDefaultTimelinePageSize(440, 22, false), 20);
		assert.strictEqual(getDefaultTimelinePageSize(440, 22, true), 21);
		assert.strictEqual(getDefaultTimelinePageSize(1000, 22, false), 44);
	});
});
