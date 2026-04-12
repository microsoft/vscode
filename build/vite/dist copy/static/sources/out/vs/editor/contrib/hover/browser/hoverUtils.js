/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
var PADDING;
(function (PADDING) {
    PADDING[PADDING["VALUE"] = 3] = "VALUE";
})(PADDING || (PADDING = {}));
export function isMousePositionWithinElement(element, posx, posy) {
    const elementRect = dom.getDomNodePagePosition(element);
    if (posx < elementRect.left + 3 /* PADDING.VALUE */
        || posx > elementRect.left + elementRect.width - 3 /* PADDING.VALUE */
        || posy < elementRect.top + 3 /* PADDING.VALUE */
        || posy > elementRect.top + elementRect.height - 3 /* PADDING.VALUE */) {
        return false;
    }
    return true;
}
/**
 * Determines whether hover should be shown based on the hover setting and current keyboard modifiers.
 * When `hoverEnabled` is 'onKeyboardModifier', hover is shown when the user presses the opposite
 * modifier key from the multi-cursor modifier (e.g., if multi-cursor uses Alt, hover shows on Ctrl/Cmd).
 *
 * @param hoverEnabled - The hover enabled setting
 * @param multiCursorModifier - The modifier key used for multi-cursor operations
 * @param mouseEvent - The current mouse event containing modifier key states
 * @returns true if hover should be shown, false otherwise
 */
export function shouldShowHover(hoverEnabled, multiCursorModifier, mouseEvent) {
    if (hoverEnabled === 'on') {
        return true;
    }
    if (hoverEnabled === 'off') {
        return false;
    }
    return isTriggerModifierPressed(multiCursorModifier, mouseEvent.event);
}
/**
 * Returns true if the trigger modifier (inverse of multi-cursor modifier) is pressed.
 * This works with both mouse and keyboard events by relying only on the modifier flags.
 */
export function isTriggerModifierPressed(multiCursorModifier, event) {
    if (multiCursorModifier === 'altKey') {
        return event.ctrlKey || event.metaKey;
    }
    return event.altKey; // multiCursorModifier is ctrlKey or metaKey
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJVdGlscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvaG92ZXJVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBR3ZELElBQVcsT0FFVjtBQUZELFdBQVcsT0FBTztJQUNqQix1Q0FBUyxDQUFBO0FBQ1YsQ0FBQyxFQUZVLE9BQU8sS0FBUCxPQUFPLFFBRWpCO0FBRUQsTUFBTSxVQUFVLDRCQUE0QixDQUFDLE9BQW9CLEVBQUUsSUFBWSxFQUFFLElBQVk7SUFDNUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hELElBQUksSUFBSSxHQUFHLFdBQVcsQ0FBQyxJQUFJLHdCQUFnQjtXQUN2QyxJQUFJLEdBQUcsV0FBVyxDQUFDLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyx3QkFBZ0I7V0FDM0QsSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLHdCQUFnQjtXQUN0QyxJQUFJLEdBQUcsV0FBVyxDQUFDLEdBQUcsR0FBRyxXQUFXLENBQUMsTUFBTSx3QkFBZ0IsRUFBRSxDQUFDO1FBQ2pFLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUNEOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQzlCLFlBQWlELEVBQ2pELG1CQUFxRCxFQUNyRCxVQUE2QjtJQUU3QixJQUFJLFlBQVksS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUMzQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCxJQUFJLFlBQVksS0FBSyxLQUFLLEVBQUUsQ0FBQztRQUM1QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxPQUFPLHdCQUF3QixDQUFDLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN4RSxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHdCQUF3QixDQUN2QyxtQkFBcUQsRUFDckQsS0FBOEQ7SUFFOUQsSUFBSSxtQkFBbUIsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUN0QyxPQUFPLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQztJQUN2QyxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsNENBQTRDO0FBQ2xFLENBQUMifQ==