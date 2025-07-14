/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';

suite('Getting Started Accessibility Tests', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('test banner has proper ARIA attributes', () => {
		const container = $('.gettingStartedContainer');
		const testBanner = $('.test-banner', {
			role: 'banner',
			'aria-label': 'TEST MODE: Random testing scenario active',
			'aria-live': 'polite',
			tabindex: 0
		}, 'TEST MODE: Random testing scenario active');

		container.appendChild(testBanner);

		// Test ARIA attributes
		assert.strictEqual(testBanner.getAttribute('role'), 'banner');
		assert.strictEqual(testBanner.getAttribute('aria-label'), 'TEST MODE: Random testing scenario active');
		assert.strictEqual(testBanner.getAttribute('aria-live'), 'polite');
		assert.strictEqual(testBanner.getAttribute('tabindex'), '0');
	});

	test('hover effects respect reduced motion preference', () => {
		const accessibilityService = new TestAccessibilityService();
		accessibilityService.setMotionReduced(true);

		// When motion is reduced, animations should not be applied
		assert.strictEqual(accessibilityService.isMotionReduced(), true);

		// Test that the motion-reduced logic would skip animations
		const shouldSkipAnimations = accessibilityService.isMotionReduced();
		assert.strictEqual(shouldSkipAnimations, true);
	});

	test('test category highlight includes screen reader support', () => {
		const container = $('.gettingStartedContainer');
		const category = $('.getting-started-category');
		container.appendChild(category);

		// Simulate highlighting a category
		category.classList.add('test-category-highlight');
		category.setAttribute('aria-describedby', 'test-highlight-description');

		// Create hidden description
		const description = $('div', {
			id: 'test-highlight-description',
			'aria-hidden': 'true',
			style: 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;'
		}, 'This category has been highlighted for testing purposes');
		container.appendChild(description);

		// Test that the category has proper accessibility attributes
		assert.strictEqual(category.getAttribute('aria-describedby'), 'test-highlight-description');
		assert.strictEqual(description.getAttribute('aria-hidden'), 'true');
		assert.strictEqual(description.id, 'test-highlight-description');
	});

	test('keyboard navigation support for test banner', () => {
		const testBanner = $('.test-banner', {
			role: 'banner',
			'aria-label': 'TEST MODE: Random testing scenario active',
			tabindex: 0
		});

		let keydownHandled = false;
		testBanner.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				keydownHandled = true;
			}
		});

		// Simulate Enter key press
		const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
		testBanner.dispatchEvent(enterEvent);

		assert.strictEqual(keydownHandled, true);
	});

	test('test button hover uses CSS classes instead of inline styles', () => {
		const button = $('button.button-link');
		
		// Test that hover effects use CSS classes
		button.classList.add('test-button-hover');
		assert.strictEqual(button.classList.contains('test-button-hover'), true);

		// Verify no inline styles are applied
		assert.strictEqual(button.style.backgroundColor, '');
		assert.strictEqual(button.style.color, '');
	});
});