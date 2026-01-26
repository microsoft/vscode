/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';

/**
 * Unit tests for the sash resize logic used in ChatInputPart.
 * These tests verify the mathematical constraints for editor height resizing.
 *
 * The actual sash creation and DOM integration is tested through manual testing
 * since ChatInputPart has many dependencies that make integration testing complex.
 */
suite('ChatInputPart Sash Resize Logic', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const INPUT_EDITOR_MAX_HEIGHT = 250;
	const INPUT_EDITOR_MIN_HEIGHT = 50;

	/**
	 * Simulates the height calculation logic used in the sash's onDidChange handler.
	 */
	function calculateNewHeight(startHeight: number, startY: number, currentY: number, maxAllowed: number): number {
		const delta = startY - currentY;
		return Math.max(
			INPUT_EDITOR_MIN_HEIGHT,
			Math.min(startHeight + delta, maxAllowed)
		);
	}

	test('dragging up increases editor height', () => {
		const startHeight = INPUT_EDITOR_MAX_HEIGHT;
		const startY = 200;
		const currentY = 150; // Drag up by 50px
		const maxAllowed = 750;

		const newHeight = calculateNewHeight(startHeight, startY, currentY, maxAllowed);
		assert.strictEqual(newHeight, 300, 'Dragging up by 50px should increase height by 50');
	});

	test('dragging down decreases editor height', () => {
		const startHeight = INPUT_EDITOR_MAX_HEIGHT;
		const startY = 200;
		const currentY = 230; // Drag down by 30px
		const maxAllowed = 750;

		const newHeight = calculateNewHeight(startHeight, startY, currentY, maxAllowed);
		assert.strictEqual(newHeight, 220, 'Dragging down by 30px should decrease height by 30');
	});

	test('height respects minimum constraint', () => {
		const startHeight = INPUT_EDITOR_MAX_HEIGHT;
		const startY = 200;
		const currentY = 500; // Drag down a lot
		const maxAllowed = 750;

		const newHeight = calculateNewHeight(startHeight, startY, currentY, maxAllowed);
		assert.strictEqual(newHeight, INPUT_EDITOR_MIN_HEIGHT, 'Height should not go below minimum');
	});

	test('height respects maximum constraint', () => {
		const startHeight = INPUT_EDITOR_MAX_HEIGHT;
		const startY = 200;
		const currentY = -400; // Drag up a lot
		const maxAllowed = 500;

		const newHeight = calculateNewHeight(startHeight, startY, currentY, maxAllowed);
		assert.strictEqual(newHeight, maxAllowed, 'Height should not exceed maximum allowed');
	});

	test('no change when currentY equals startY', () => {
		const startHeight = INPUT_EDITOR_MAX_HEIGHT;
		const startY = 200;
		const currentY = 200; // No movement
		const maxAllowed = 750;

		const newHeight = calculateNewHeight(startHeight, startY, currentY, maxAllowed);
		assert.strictEqual(newHeight, startHeight, 'Height should remain unchanged when no drag occurs');
	});

	/**
	 * Simulates the editor height calculation used in _layout.
	 * The editor height should be the content height (capped at max allowed),
	 * but at least the user-set minimum height from sash dragging.
	 */
	function calculateEditorHeight(contentHeight: number, maxAllowed: number, userSetMinHeight: number | undefined): number {
		const cappedContent = Math.min(contentHeight, maxAllowed);
		const effectiveMin = userSetMinHeight ?? 0;
		return Math.max(cappedContent, effectiveMin);
	}

	test('editor height respects user-set minimum from sash', () => {
		const contentHeight = 100; // Small content
		const maxAllowed = 750;
		const userSetMinHeight = 300; // User dragged sash to make it taller

		const editorHeight = calculateEditorHeight(contentHeight, maxAllowed, userSetMinHeight);
		assert.strictEqual(editorHeight, userSetMinHeight, 'Editor should be at least as tall as user-set minimum');
	});

	test('editor height grows with content beyond user-set minimum', () => {
		const contentHeight = 400; // Large content
		const maxAllowed = 750;
		const userSetMinHeight = 200; // User set a smaller minimum

		const editorHeight = calculateEditorHeight(contentHeight, maxAllowed, userSetMinHeight);
		assert.strictEqual(editorHeight, contentHeight, 'Editor should grow with content when larger than minimum');
	});

	test('editor height respects max allowed even with large content', () => {
		const contentHeight = 1000; // Very large content
		const maxAllowed = 750;
		const userSetMinHeight = 200;

		const editorHeight = calculateEditorHeight(contentHeight, maxAllowed, userSetMinHeight);
		assert.strictEqual(editorHeight, maxAllowed, 'Editor should not exceed max allowed');
	});
});
