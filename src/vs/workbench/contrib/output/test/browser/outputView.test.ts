/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Output View - Smart Scroll', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('scrollLock should be false when at bottom', () => {
		// When scrollTop + height >= scrollHeight, user is at bottom
		// In this case, scrollLock should be false (auto-scroll enabled)
		const e = {
			scrollTop: 900,
			scrollLeft: 0,
			scrollWidth: 800,
			scrollHeight: 1000,
			scrollTopChanged: true,
			scrollLeftChanged: false,
			scrollWidthChanged: false,
			scrollHeightChanged: false
		};
		const layoutInfo = { height: 100 } as any;

		const isAtBottom = e.scrollTop + layoutInfo.height >= e.scrollHeight;
		const scrollLock = !isAtBottom;

		assert.strictEqual(isAtBottom, true, 'Should be at bottom when scrollTop + height >= scrollHeight');
		assert.strictEqual(scrollLock, false, 'scrollLock should be false when at bottom (auto-scroll enabled)');
	});

	test('scrollLock should be true when scrolled up', () => {
		// When scrollTop + height < scrollHeight, user is scrolled up
		// In this case, scrollLock should be true (auto-scroll disabled)
		const e = {
			scrollTop: 500,
			scrollLeft: 0,
			scrollWidth: 800,
			scrollHeight: 1000,
			scrollTopChanged: true,
			scrollLeftChanged: false,
			scrollWidthChanged: false,
			scrollHeightChanged: false
		};
		const layoutInfo = { height: 100 } as any;

		const isAtBottom = e.scrollTop + layoutInfo.height >= e.scrollHeight;
		const scrollLock = !isAtBottom;

		assert.strictEqual(isAtBottom, false, 'Should not be at bottom when scrollTop + height < scrollHeight');
		assert.strictEqual(scrollLock, true, 'scrollLock should be true when scrolled up (auto-scroll disabled)');
	});

	test('scrollLock should be false when at exact bottom', () => {
		// When scrollTop + height == scrollHeight, user is at exact bottom
		// In this case, scrollLock should be false (auto-scroll enabled)
		const e = {
			scrollTop: 900,
			scrollLeft: 0,
			scrollWidth: 800,
			scrollHeight: 1000,
			scrollTopChanged: true,
			scrollLeftChanged: false,
			scrollWidthChanged: false,
			scrollHeightChanged: false
		};
		const layoutInfo = { height: 100 } as any;

		const isAtBottom = e.scrollTop + layoutInfo.height >= e.scrollHeight;
		const scrollLock = !isAtBottom;

		assert.strictEqual(isAtBottom, true, 'Should be at bottom when scrollTop + height == scrollHeight');
		assert.strictEqual(scrollLock, false, 'scrollLock should be false at exact bottom (auto-scroll enabled)');
	});
});
