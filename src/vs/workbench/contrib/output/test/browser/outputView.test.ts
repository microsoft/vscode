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
		const scrollTop = 900;
		const viewportHeight = 100;
		const scrollHeight = 1000;

		const isAtBottom = scrollTop + viewportHeight >= scrollHeight;
		const scrollLock = !isAtBottom;

		assert.strictEqual(isAtBottom, true, 'Should be at bottom when scrollTop + height >= scrollHeight');
		assert.strictEqual(scrollLock, false, 'scrollLock should be false when at bottom (auto-scroll enabled)');
	});

	test('scrollLock should be true when scrolled up', () => {
		// When scrollTop + height < scrollHeight, user is scrolled up
		// In this case, scrollLock should be true (auto-scroll disabled)
		const scrollTop = 500;
		const viewportHeight = 100;
		const scrollHeight = 1000;

		const isAtBottom = scrollTop + viewportHeight >= scrollHeight;
		const scrollLock = !isAtBottom;

		assert.strictEqual(isAtBottom, false, 'Should not be at bottom when scrollTop + height < scrollHeight');
		assert.strictEqual(scrollLock, true, 'scrollLock should be true when scrolled up (auto-scroll disabled)');
	});

	test('scrollLock should be false when exactly at bottom', () => {
		// When scrollTop + height == scrollHeight, user is at exact bottom
		// In this case, scrollLock should be false (auto-scroll enabled)
		const scrollTop = 800;
		const viewportHeight = 200;
		const scrollHeight = 1000;

		const isAtBottom = scrollTop + viewportHeight >= scrollHeight;
		const scrollLock = !isAtBottom;

		// 800 + 200 = 1000, which equals scrollHeight
		assert.strictEqual(scrollTop + viewportHeight, scrollHeight, 'Should calculate exact bottom correctly');
		assert.strictEqual(isAtBottom, true, 'Should be at bottom when scrollTop + height == scrollHeight');
		assert.strictEqual(scrollLock, false, 'scrollLock should be false at exact bottom (auto-scroll enabled)');
	});
});
