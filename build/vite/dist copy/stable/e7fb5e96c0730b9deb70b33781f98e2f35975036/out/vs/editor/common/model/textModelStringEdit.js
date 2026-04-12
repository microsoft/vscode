/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditOperation } from '../core/editOperation.js';
import { Range } from '../core/range.js';
import { StringEdit, StringReplacement } from '../core/edits/stringEdit.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { LengthEdit } from '../core/edits/lengthEdit.js';
import { countEOL } from '../core/misc/eolCounter.js';
export function offsetEditToEditOperations(offsetEdit, doc) {
    const edits = [];
    for (const singleEdit of offsetEdit.replacements) {
        const range = Range.fromPositions(doc.getPositionAt(singleEdit.replaceRange.start), doc.getPositionAt(singleEdit.replaceRange.start + singleEdit.replaceRange.length));
        edits.push(EditOperation.replace(range, singleEdit.newText));
    }
    return edits;
}
export function offsetEditFromContentChanges(contentChanges) {
    const editsArr = contentChanges.map(c => new StringReplacement(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
    editsArr.reverse();
    const edits = new StringEdit(editsArr);
    return edits;
}
export function offsetEditFromLineRangeMapping(original, modified, changes) {
    const edits = [];
    for (const c of changes) {
        for (const i of c.innerChanges ?? []) {
            const newText = modified.getValueInRange(i.modifiedRange);
            const startOrig = original.getOffsetAt(i.originalRange.getStartPosition());
            const endExOrig = original.getOffsetAt(i.originalRange.getEndPosition());
            const origRange = new OffsetRange(startOrig, endExOrig);
            edits.push(new StringReplacement(origRange, newText));
        }
    }
    return new StringEdit(edits);
}
export function linesLengthEditFromModelContentChange(c) {
    const contentChanges = c.slice().reverse();
    const lengthEdits = contentChanges.map(c => LengthEdit.replace(
    // Expand the edit range to include the entire line
    new OffsetRange(c.range.startLineNumber - 1, c.range.endLineNumber), countEOL(c.text)[0] + 1));
    const lengthEdit = LengthEdit.compose(lengthEdits);
    return lengthEdit;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsU3RyaW5nRWRpdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU3RyaW5nRWRpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDekQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3pDLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFJNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV0RCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsVUFBc0IsRUFBRSxHQUFlO0lBQ2pGLE1BQU0sS0FBSyxHQUFxQyxFQUFFLENBQUM7SUFDbkQsS0FBSyxNQUFNLFVBQVUsSUFBSSxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FDaEMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxFQUNoRCxHQUFHLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQ2pGLENBQUM7UUFDRixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsY0FBOEM7SUFDMUYsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksaUJBQWlCLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixNQUFNLEtBQUssR0FBRyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN2QyxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsOEJBQThCLENBQUMsUUFBb0IsRUFBRSxRQUFvQixFQUFFLE9BQTRDO0lBQ3RJLE1BQU0sS0FBSyxHQUF3QixFQUFFLENBQUM7SUFDdEMsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN6QixLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLElBQUksRUFBRSxFQUFFLENBQUM7WUFDdEMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUM7WUFFMUQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUMzRSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztZQUN6RSxNQUFNLFNBQVMsR0FBRyxJQUFJLFdBQVcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFeEQsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM5QixDQUFDO0FBRUQsTUFBTSxVQUFVLHFDQUFxQyxDQUFDLENBQXdCO0lBQzdFLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMzQyxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU87SUFDN0QsbURBQW1EO0lBQ25ELElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUNuRSxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUN4QixDQUFDO0lBQ0YsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNuRCxPQUFPLFVBQVUsQ0FBQztBQUNuQixDQUFDIn0=