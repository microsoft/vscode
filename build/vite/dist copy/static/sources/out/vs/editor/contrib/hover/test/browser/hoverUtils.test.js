/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isMousePositionWithinElement, isTriggerModifierPressed, shouldShowHover } from '../../browser/hoverUtils.js';
suite('Hover Utils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('shouldShowHover', () => {
        function createMockMouseEvent(ctrlKey, altKey, metaKey) {
            return {
                event: {
                    ctrlKey,
                    altKey,
                    metaKey,
                    shiftKey: false,
                }
            };
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
        function createMockElement(left, top, width, height) {
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
            assert.strictEqual(isMousePositionWithinElement(element, 100, 100), false); // top-left corner
            assert.strictEqual(isMousePositionWithinElement(element, 300, 100), false); // top-right corner
            assert.strictEqual(isMousePositionWithinElement(element, 100, 200), false); // bottom-left corner
            assert.strictEqual(isMousePositionWithinElement(element, 300, 200), false); // bottom-right corner
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
            assert.strictEqual(isMousePositionWithinElement(element, 0, 0), false);
            assert.strictEqual(isMousePositionWithinElement(element, 50, 50), true);
            assert.strictEqual(isMousePositionWithinElement(element, 100, 100), false);
            assert.strictEqual(isMousePositionWithinElement(element, 101, 101), false);
        });
        test('handles small elements (1x1)', () => {
            const element = createMockElement(100, 100, 1, 1);
            assert.strictEqual(isMousePositionWithinElement(element, 100, 100), false);
            assert.strictEqual(isMousePositionWithinElement(element, 101, 101), false);
            assert.strictEqual(isMousePositionWithinElement(element, 102, 102), false);
        });
    });
    suite('isTriggerModifierPressed', () => {
        function createModifierEvent(ctrlKey, altKey, metaKey) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJVdGlscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaG92ZXIvdGVzdC9icm93c2VyL2hvdmVyVXRpbHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLHdCQUF3QixFQUFFLGVBQWUsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR3RILEtBQUssQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO0lBRXpCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUU3QixTQUFTLG9CQUFvQixDQUFDLE9BQWdCLEVBQUUsTUFBZSxFQUFFLE9BQWdCO1lBQ2hGLE9BQU87Z0JBQ04sS0FBSyxFQUFFO29CQUNOLE9BQU87b0JBQ1AsTUFBTTtvQkFDTixPQUFPO29CQUNQLFFBQVEsRUFBRSxLQUFLO2lCQUNmO2FBQ29CLENBQUM7UUFDeEIsQ0FBQztRQUVELElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7WUFDOUMsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RCxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7WUFDaEQsTUFBTSxVQUFVLEdB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WUFDL0YsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywwRUFBMEUsRUFBRSxHQUFHLEVBQUU7WUFDckYsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRSxHQUFHLEVBQUU7WUFDOUUsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRSxHQUFHLEVBQUU7WUFDOUUsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLEVBQUU7WUFDbEYsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxRUFBcUUsRUFBRSxHQUFHLEVBQUU7WUFDaEYsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtRUFBbUUsRUFBRSxHQUFHLEVBQUU7WUFDOUUsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLEVBQUU7WUFDbEYsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3RUFBd0UsRUFBRSxHQUFHLEVBQUU7WUFDbkYsTUFBTSxLQUFLLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==