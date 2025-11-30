/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldShowHover } from '../../browser/hoverUtils.js';
import { IEditorMouseEvent } from '../../../../browser/editorBrowser.js';

suite('Hover Utils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldShowHover', () => {

		function createMockMouseEvent(ctrlKey: boolean, altKey: boolean, metaKey: boolean): IEditorMouseEvent {
			return {
				event: {
					ctrlKey,
					altKey,
					metaKey,
					shiftKey: false,
				}
			} as IEditorMouseEvent;
		}

		test('returns true when enabled is "on"', () => {
			const mouseEvent = createMockMouseEvent(false, false, false);
			const result = shouldShowHover('on', 'altKey', mouseEvent);
			assert.strictEqual(result, true);
		});

		test('returns false when enabled is "off"', () => {
			const mouseEvent = createMockMouseEvent(false, false, false);
			const result = shouldShowHover('off', 'altKey', mouseEvent);
			assert.strictEqual(result, false);
		});

		test('returns true with ctrl pressed when multiCursorModifier is altKey', () => {
			const mouseEvent = createMockMouseEvent(true, false, false);
			const result = shouldShowHover('onKeyboardModifier', 'altKey', mouseEvent);
			assert.strictEqual(result, true);
		});

		test('returns false without ctrl pressed when multiCursorModifier is altKey', () => {
			const mouseEvent = createMockMouseEvent(false, false, false);
			const result = shouldShowHover('onKeyboardModifier', 'altKey', mouseEvent);
			assert.strictEqual(result, false);
		});

		test('returns true with metaKey pressed when multiCursorModifier is altKey', () => {
			const mouseEvent = createMockMouseEvent(false, false, true);
			const result = shouldShowHover('onKeyboardModifier', 'altKey', mouseEvent);
			assert.strictEqual(result, true);
		});

		test('returns true with alt pressed when multiCursorModifier is ctrlKey', () => {
			const mouseEvent = createMockMouseEvent(false, true, false);
			const result = shouldShowHover('onKeyboardModifier', 'ctrlKey', mouseEvent);
			assert.strictEqual(result, true);
		});

		test('returns false without alt pressed when multiCursorModifier is ctrlKey', () => {
			const mouseEvent = createMockMouseEvent(false, false, false);
			const result = shouldShowHover('onKeyboardModifier', 'ctrlKey', mouseEvent);
			assert.strictEqual(result, false);
		});

		test('returns true with alt pressed when multiCursorModifier is metaKey', () => {
			const mouseEvent = createMockMouseEvent(false, true, false);
			const result = shouldShowHover('onKeyboardModifier', 'metaKey', mouseEvent);
			assert.strictEqual(result, true);
		});

		test('ignores alt when multiCursorModifier is altKey', () => {
			const mouseEvent = createMockMouseEvent(false, true, false);
			const result = shouldShowHover('onKeyboardModifier', 'altKey', mouseEvent);
			assert.strictEqual(result, false);
		});

		test('ignores ctrl when multiCursorModifier is ctrlKey', () => {
			const mouseEvent = createMockMouseEvent(true, false, false);
			const result = shouldShowHover('onKeyboardModifier', 'ctrlKey', mouseEvent);
			assert.strictEqual(result, false);
		});
	});
});
