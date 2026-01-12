/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isMousePositionWithinElement, isTriggerModifierPressed, shouldShowHover } from '../../browser/hoverUtils.js';
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

	suite('isMousePositionWithinElement', () => {

		function createMockElement(left: number, top: number, width: number, height: number): HTMLElement {
			const element = document.createElement('div');
			// Mock getDomNodePagePosition by setting up the element's bounding rect
			element.getBoundingClientRect = () => ({
				left,
				top,
				width,
				height,
				right: left + width,
				bottom: top + height,
				x: left,
				y: top,
				toJSON: () => { }
			});
			return element;
		}

		test('returns true when mouse is inside element bounds', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 150, 150), true);
			assert.strictEqual(isMousePositionWithinElement(element, 200, 150), true);
			assert.strictEqual(isMousePositionWithinElement(element, 250, 180), true);
		});

		test('returns true when mouse is on element edges', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 100, 100), true); // top-left corner
			assert.strictEqual(isMousePositionWithinElement(element, 300, 100), true); // top-right corner
			assert.strictEqual(isMousePositionWithinElement(element, 100, 200), true); // bottom-left corner
			assert.strictEqual(isMousePositionWithinElement(element, 300, 200), true); // bottom-right corner
		});

		test('returns false when mouse is left of element', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 99, 150), false);
			assert.strictEqual(isMousePositionWithinElement(element, 50, 150), false);
		});

		test('returns false when mouse is right of element', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 301, 150), false);
			assert.strictEqual(isMousePositionWithinElement(element, 400, 150), false);
		});

		test('returns false when mouse is above element', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 200, 99), false);
			assert.strictEqual(isMousePositionWithinElement(element, 200, 50), false);
		});

		test('returns false when mouse is below element', () => {
			const element = createMockElement(100, 100, 200, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 200, 201), false);
			assert.strictEqual(isMousePositionWithinElement(element, 200, 300), false);
		});

		test('handles element at origin (0,0)', () => {
			const element = createMockElement(0, 0, 100, 100);
			assert.strictEqual(isMousePositionWithinElement(element, 0, 0), true);
			assert.strictEqual(isMousePositionWithinElement(element, 50, 50), true);
			assert.strictEqual(isMousePositionWithinElement(element, 100, 100), true);
			assert.strictEqual(isMousePositionWithinElement(element, 101, 101), false);
		});

		test('handles small elements (1x1)', () => {
			const element = createMockElement(100, 100, 1, 1);
			assert.strictEqual(isMousePositionWithinElement(element, 100, 100), true);
			assert.strictEqual(isMousePositionWithinElement(element, 101, 101), true);
			assert.strictEqual(isMousePositionWithinElement(element, 102, 102), false);
		});
	});

	suite('isTriggerModifierPressed', () => {

		function createModifierEvent(ctrlKey: boolean, altKey: boolean, metaKey: boolean) {
			return { ctrlKey, altKey, metaKey };
		}

		test('returns true with ctrl pressed when multiCursorModifier is altKey', () => {
			const event = createModifierEvent(true, false, false);
			assert.strictEqual(isTriggerModifierPressed('altKey', event), true);
		});

		test('returns true with metaKey pressed when multiCursorModifier is altKey', () => {
			const event = createModifierEvent(false, false, true);
			assert.strictEqual(isTriggerModifierPressed('altKey', event), true);
		});

		test('returns true with both ctrl and metaKey pressed when multiCursorModifier is altKey', () => {
			const event = createModifierEvent(true, false, true);
			assert.strictEqual(isTriggerModifierPressed('altKey', event), true);
		});

		test('returns false without ctrl or metaKey when multiCursorModifier is altKey', () => {
			const event = createModifierEvent(false, false, false);
			assert.strictEqual(isTriggerModifierPressed('altKey', event), false);
		});

		test('returns false with alt pressed when multiCursorModifier is altKey', () => {
			const event = createModifierEvent(false, true, false);
			assert.strictEqual(isTriggerModifierPressed('altKey', event), false);
		});

		test('returns true with alt pressed when multiCursorModifier is ctrlKey', () => {
			const event = createModifierEvent(false, true, false);
			assert.strictEqual(isTriggerModifierPressed('ctrlKey', event), true);
		});

		test('returns false without alt pressed when multiCursorModifier is ctrlKey', () => {
			const event = createModifierEvent(false, false, false);
			assert.strictEqual(isTriggerModifierPressed('ctrlKey', event), false);
		});

		test('returns false with ctrl pressed when multiCursorModifier is ctrlKey', () => {
			const event = createModifierEvent(true, false, false);
			assert.strictEqual(isTriggerModifierPressed('ctrlKey', event), false);
		});

		test('returns true with alt pressed when multiCursorModifier is metaKey', () => {
			const event = createModifierEvent(false, true, false);
			assert.strictEqual(isTriggerModifierPressed('metaKey', event), true);
		});

		test('returns false without alt pressed when multiCursorModifier is metaKey', () => {
			const event = createModifierEvent(false, false, false);
			assert.strictEqual(isTriggerModifierPressed('metaKey', event), false);
		});

		test('returns false with metaKey pressed when multiCursorModifier is metaKey', () => {
			const event = createModifierEvent(false, false, true);
			assert.strictEqual(isTriggerModifierPressed('metaKey', event), false);
		});
	});
});
