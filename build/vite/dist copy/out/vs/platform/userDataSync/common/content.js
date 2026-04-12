/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setProperty } from '../../../base/common/jsonEdit.js';
export function edit(content, originalPath, value, formattingOptions) {
    const edit = setProperty(content, originalPath, value, formattingOptions)[0];
    if (edit) {
        content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
    }
    return content;
}
export function getLineStartOffset(content, eol, atOffset) {
    let lineStartingOffset = atOffset;
    while (lineStartingOffset >= 0) {
        if (content.charAt(lineStartingOffset) === eol.charAt(eol.length - 1)) {
            if (eol.length === 1) {
                return lineStartingOffset + 1;
            }
        }
        lineStartingOffset--;
        if (eol.length === 2) {
            if (lineStartingOffset >= 0 && content.charAt(lineStartingOffset) === eol.charAt(0)) {
                return lineStartingOffset + 2;
            }
        }
    }
    return 0;
}
export function getLineEndOffset(content, eol, atOffset) {
    let lineEndOffset = atOffset;
    while (lineEndOffset >= 0) {
        if (content.charAt(lineEndOffset) === eol.charAt(eol.length - 1)) {
            if (eol.length === 1) {
                return lineEndOffset;
            }
        }
        lineEndOffset++;
        if (eol.length === 2) {
            if (lineEndOffset >= 0 && content.charAt(lineEndOffset) === eol.charAt(1)) {
                return lineEndOffset;
            }
        }
    }
    return content.length - 1;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vY29udGVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFJL0QsTUFBTSxVQUFVLElBQUksQ0FBQyxPQUFlLEVBQUUsWUFBc0IsRUFBRSxLQUFjLEVBQUUsaUJBQW9DO0lBQ2pILE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdFLElBQUksSUFBSSxFQUFFLENBQUM7UUFDVixPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxPQUFlLEVBQUUsR0FBVyxFQUFFLFFBQWdCO0lBQ2hGLElBQUksa0JBQWtCLEdBQUcsUUFBUSxDQUFDO0lBQ2xDLE9BQU8sa0JBQWtCLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDaEMsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkUsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLGtCQUFrQixHQUFHLENBQUMsQ0FBQztZQUMvQixDQUFDO1FBQ0YsQ0FBQztRQUNELGtCQUFrQixFQUFFLENBQUM7UUFDckIsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3RCLElBQUksa0JBQWtCLElBQUksQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsS0FBSyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JGLE9BQU8sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sQ0FBQyxDQUFDO0FBQ1YsQ0FBQztBQUVELE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxPQUFlLEVBQUUsR0FBVyxFQUFFLFFBQWdCO0lBQzlFLElBQUksYUFBYSxHQUFHLFFBQVEsQ0FBQztJQUM3QixPQUFPLGFBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUMzQixJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbEUsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLGFBQWEsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQztRQUNELGFBQWEsRUFBRSxDQUFDO1FBQ2hCLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixJQUFJLGFBQWEsSUFBSSxDQUFDLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzNFLE9BQU8sYUFBYSxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDM0IsQ0FBQyJ9