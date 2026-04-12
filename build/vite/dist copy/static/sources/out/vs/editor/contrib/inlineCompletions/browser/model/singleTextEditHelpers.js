/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commonPrefixLength } from '../../../../../base/common/strings.js';
import { Range } from '../../../../common/core/range.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
export function singleTextRemoveCommonPrefix(edit, model, validModelRange) {
    const modelRange = validModelRange ? edit.range.intersectRanges(validModelRange) : edit.range;
    if (!modelRange) {
        return edit;
    }
    const normalizedText = edit.text.replaceAll('\r\n', '\n');
    const valueToReplace = model.getValueInRange(modelRange, 1 /* EndOfLinePreference.LF */);
    const commonPrefixLen = commonPrefixLength(valueToReplace, normalizedText);
    const start = TextLength.ofText(valueToReplace.substring(0, commonPrefixLen)).addToPosition(edit.range.getStartPosition());
    const text = normalizedText.substring(commonPrefixLen);
    const range = Range.fromPositions(start, edit.range.getEndPosition());
    return new TextReplacement(range, text);
}
export function singleTextEditAugments(edit, base) {
    // The augmented completion must replace the base range, but can replace even more
    return edit.text.startsWith(base.text) && rangeExtends(edit.range, base.range);
}
function rangeExtends(extendingRange, rangeToExtend) {
    return rangeToExtend.getStartPosition().equals(extendingRange.getStartPosition())
        && rangeToExtend.getEndPosition().isBeforeOrEqual(extendingRange.getEndPosition());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2luZ2xlVGV4dEVkaXRIZWxwZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9zaW5nbGVUZXh0RWRpdEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFHNUUsTUFBTSxVQUFVLDRCQUE0QixDQUFDLElBQXFCLEVBQUUsS0FBaUIsRUFBRSxlQUF1QjtJQUM3RyxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQzlGLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUQsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxVQUFVLGlDQUF5QixDQUFDO0lBQ2pGLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUMzRSxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0lBQzNILE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDdkQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLE9BQU8sSUFBSSxlQUFlLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsSUFBcUIsRUFBRSxJQUFxQjtJQUNsRixrRkFBa0Y7SUFDbEYsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2hGLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxjQUFxQixFQUFFLGFBQW9CO0lBQ2hFLE9BQU8sYUFBYSxDQUFDLGdCQUFnQixFQUFFLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1dBQzdFLGFBQWEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFDckYsQ0FBQyJ9