/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { scrollToReveal } from '../../browser/view/inlineEdits/inlineEditsViews/longDistanceHint/inlineEditsLongDistanceHint.js';

suite('scrollToReveal', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should not scroll when content is already visible', () => {
		// Content range [20, 30) is fully contained in window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(20, 30));
		assert.strictEqual(result.newScrollPosition, 10);
	});

	test('should not scroll when content exactly fits the visible window', () => {
		// Content range [10, 50) exactly matches visible window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(10, 50));
		assert.strictEqual(result.newScrollPosition, 10);
	});

	test('should scroll left when content starts before visible window', () => {
		// Content range [5, 15) starts before visible window [20, 60)
		const result = scrollToReveal(20, 40, new OffsetRange(5, 15));
		assert.strictEqual(result.newScrollPosition, 5);
	});

	test('should scroll right when content ends after visible window', () => {
		// Content range [50, 80) ends after visible window [10, 50)
		// New scroll position should be 80 - 40 = 40 so window becomes [40, 80)
		const result = scrollToReveal(10, 40, new OffsetRange(50, 80));
		assert.strictEqual(result.newScrollPosition, 40);
	});

	test('should show start of content when content is larger than window', () => {
		// Content range [20, 100) is larger than window width 40
		// Should position at start of content
		const result = scrollToReveal(10, 40, new OffsetRange(20, 100));
		assert.strictEqual(result.newScrollPosition, 20);
	});

	test('should handle edge case with zero-width content', () => {
		// Empty content range [25, 25) in window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(25, 25));
		assert.strictEqual(result.newScrollPosition, 10);
	});

	test('should handle edge case with zero window width', () => {
		// Any non-empty content with zero window width should position at content start
		const result = scrollToReveal(10, 0, new OffsetRange(20, 30));
		assert.strictEqual(result.newScrollPosition, 20);
	});

	test('should handle content at exact window boundaries - left edge', () => {
		// Content range [10, 20) starts exactly at visible window start [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(10, 20));
		assert.strictEqual(result.newScrollPosition, 10);
	});

	test('should handle content at exact window boundaries - right edge', () => {
		// Content range [40, 50) ends exactly at visible window end [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(40, 50));
		assert.strictEqual(result.newScrollPosition, 10);
	});

	test('should scroll right when content extends beyond right boundary', () => {
		// Content range [40, 60) extends beyond visible window [10, 50)
		// New scroll position should be 60 - 40 = 20 so window becomes [20, 60)
		const result = scrollToReveal(10, 40, new OffsetRange(40, 60));
		assert.strictEqual(result.newScrollPosition, 20);
	});

	test('should scroll left when content extends beyond left boundary', () => {
		// Content range [5, 25) starts before visible window [20, 60)
		// Should position at start of content
		const result = scrollToReveal(20, 40, new OffsetRange(5, 25));
		assert.strictEqual(result.newScrollPosition, 5);
	});

	test('should handle content overlapping both boundaries', () => {
		// Content range [5, 70) overlaps both sides of visible window [20, 60)
		// Since content is larger than window, should position at start of content
		const result = scrollToReveal(20, 40, new OffsetRange(5, 70));
		assert.strictEqual(result.newScrollPosition, 5);
	});

	test('should handle negative scroll positions', () => {
		// Current scroll at -10, window width 40, so visible range [-10, 30)
		// Content [35, 45) is beyond the visible window
		const result = scrollToReveal(-10, 40, new OffsetRange(35, 45));
		assert.strictEqual(result.newScrollPosition, 5); // 45 - 40 = 5
	});

	test('should handle large numbers', () => {
		// Test with large numbers to ensure no overflow issues
		const result = scrollToReveal(1000000, 500, new OffsetRange(1000600, 1000700));
		assert.strictEqual(result.newScrollPosition, 1000200); // 1000700 - 500 = 1000200
	});

	test('should prioritize left scroll when content spans window but starts before', () => {
		// Content [5, 55) spans wider than window width 40, starting before visible [20, 60)
		// Should position at start of content
		const result = scrollToReveal(20, 40, new OffsetRange(5, 55));
		assert.strictEqual(result.newScrollPosition, 5);
	});

	test('should handle single character content requiring scroll', () => {
		// Single character at position [100, 101) with visible window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(100, 101));
		assert.strictEqual(result.newScrollPosition, 61); // 101 - 40 = 61
	});

	test('should handle content just barely outside visible area - left', () => {
		// Content [9, 19) with one unit outside visible window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(9, 19));
		assert.strictEqual(result.newScrollPosition, 9);
	});

	test('should handle content just barely outside visible area - right', () => {
		// Content [45, 51) with one unit outside visible window [10, 50)
		const result = scrollToReveal(10, 40, new OffsetRange(45, 51));
		assert.strictEqual(result.newScrollPosition, 11); // 51 - 40 = 11
	});

	test('should handle fractional-like scenarios with minimum window', () => {
		// Minimum window width 1, content needs to be revealed
		const result = scrollToReveal(50, 1, new OffsetRange(100, 105));
		assert.strictEqual(result.newScrollPosition, 100); // Content larger than window, show start
	});

	test('should preserve scroll when content partially visible on left', () => {
		// Content [5, 25) partially visible in window [20, 60), overlaps [20, 25)
		// Since content starts before window, scroll to show start
		const result = scrollToReveal(20, 40, new OffsetRange(5, 25));
		assert.strictEqual(result.newScrollPosition, 5);
	});

	test('should preserve scroll when content partially visible on right', () => {
		// Content [45, 65) partially visible in window [20, 60), overlaps [45, 60)
		// Since content extends beyond window, scroll to show end
		const result = scrollToReveal(20, 40, new OffsetRange(45, 65));
		assert.strictEqual(result.newScrollPosition, 25); // 65 - 40 = 25
	});
});
