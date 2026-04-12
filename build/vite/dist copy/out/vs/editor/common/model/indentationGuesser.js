/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class SpacesDiffResult {
    constructor() {
        this.spacesDiff = 0;
        this.looksLikeAlignment = false;
    }
}
/**
 * Compute the diff in spaces between two line's indentation.
 */
function spacesDiff(a, aLength, b, bLength, result) {
    result.spacesDiff = 0;
    result.looksLikeAlignment = false;
    // This can go both ways (e.g.):
    //  - a: "\t"
    //  - b: "\t    "
    //  => This should count 1 tab and 4 spaces
    let i;
    for (i = 0; i < aLength && i < bLength; i++) {
        const aCharCode = a.charCodeAt(i);
        const bCharCode = b.charCodeAt(i);
        if (aCharCode !== bCharCode) {
            break;
        }
    }
    let aSpacesCnt = 0, aTabsCount = 0;
    for (let j = i; j < aLength; j++) {
        const aCharCode = a.charCodeAt(j);
        if (aCharCode === 32 /* CharCode.Space */) {
            aSpacesCnt++;
        }
        else {
            aTabsCount++;
        }
    }
    let bSpacesCnt = 0, bTabsCount = 0;
    for (let j = i; j < bLength; j++) {
        const bCharCode = b.charCodeAt(j);
        if (bCharCode === 32 /* CharCode.Space */) {
            bSpacesCnt++;
        }
        else {
            bTabsCount++;
        }
    }
    if (aSpacesCnt > 0 && aTabsCount > 0) {
        return;
    }
    if (bSpacesCnt > 0 && bTabsCount > 0) {
        return;
    }
    const tabsDiff = Math.abs(aTabsCount - bTabsCount);
    const spacesDiff = Math.abs(aSpacesCnt - bSpacesCnt);
    if (tabsDiff === 0) {
        // check if the indentation difference might be caused by alignment reasons
        // sometime folks like to align their code, but this should not be used as a hint
        result.spacesDiff = spacesDiff;
        if (spacesDiff > 0 && 0 <= bSpacesCnt - 1 && bSpacesCnt - 1 < a.length && bSpacesCnt < b.length) {
            if (b.charCodeAt(bSpacesCnt) !== 32 /* CharCode.Space */ && a.charCodeAt(bSpacesCnt - 1) === 32 /* CharCode.Space */) {
                if (a.charCodeAt(a.length - 1) === 44 /* CharCode.Comma */) {
                    // This looks like an alignment desire: e.g.
                    // const a = b + c,
                    //       d = b - c;
                    result.looksLikeAlignment = true;
                }
            }
        }
        return;
    }
    if (spacesDiff % tabsDiff === 0) {
        result.spacesDiff = spacesDiff / tabsDiff;
        return;
    }
}
export function guessIndentation(source, defaultTabSize, defaultInsertSpaces) {
    // Look at most at the first 10k lines
    const linesCount = Math.min(source.getLineCount(), 10000);
    let linesIndentedWithTabsCount = 0; // number of lines that contain at least one tab in indentation
    let linesIndentedWithSpacesCount = 0; // number of lines that contain only spaces in indentation
    let previousLineText = ''; // content of latest line that contained non-whitespace chars
    let previousLineIndentation = 0; // index at which latest line contained the first non-whitespace char
    const ALLOWED_TAB_SIZE_GUESSES = [2, 4, 6, 8, 3, 5, 7]; // prefer even guesses for `tabSize`, limit to [2, 8].
    const MAX_ALLOWED_TAB_SIZE_GUESS = 8; // max(ALLOWED_TAB_SIZE_GUESSES) = 8
    const spacesDiffCount = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // `tabSize` scores
    const tmp = new SpacesDiffResult();
    for (let lineNumber = 1; lineNumber <= linesCount; lineNumber++) {
        const currentLineLength = source.getLineLength(lineNumber);
        const currentLineText = source.getLineContent(lineNumber);
        // if the text buffer is chunk based, so long lines are cons-string, v8 will flattern the string when we check charCode.
        // checking charCode on chunks directly is cheaper.
        const useCurrentLineText = (currentLineLength <= 65536);
        let currentLineHasContent = false; // does `currentLineText` contain non-whitespace chars
        let currentLineIndentation = 0; // index at which `currentLineText` contains the first non-whitespace char
        let currentLineSpacesCount = 0; // count of spaces found in `currentLineText` indentation
        let currentLineTabsCount = 0; // count of tabs found in `currentLineText` indentation
        for (let j = 0, lenJ = currentLineLength; j < lenJ; j++) {
            const charCode = (useCurrentLineText ? currentLineText.charCodeAt(j) : source.getLineCharCode(lineNumber, j));
            if (charCode === 9 /* CharCode.Tab */) {
                currentLineTabsCount++;
            }
            else if (charCode === 32 /* CharCode.Space */) {
                currentLineSpacesCount++;
            }
            else {
                // Hit non whitespace character on this line
                currentLineHasContent = true;
                currentLineIndentation = j;
                break;
            }
        }
        // Ignore empty or only whitespace lines
        if (!currentLineHasContent) {
            continue;
        }
        if (currentLineTabsCount > 0) {
            linesIndentedWithTabsCount++;
        }
        else if (currentLineSpacesCount > 1) {
            linesIndentedWithSpacesCount++;
        }
        spacesDiff(previousLineText, previousLineIndentation, currentLineText, currentLineIndentation, tmp);
        if (tmp.looksLikeAlignment) {
            // if defaultInsertSpaces === true && the spaces count == tabSize, we may want to count it as valid indentation
            //
            // - item1
            //   - item2
            //
            // otherwise skip this line entirely
            //
            // const a = 1,
            //       b = 2;
            if (!(defaultInsertSpaces && defaultTabSize === tmp.spacesDiff)) {
                continue;
            }
        }
        const currentSpacesDiff = tmp.spacesDiff;
        if (currentSpacesDiff <= MAX_ALLOWED_TAB_SIZE_GUESS) {
            spacesDiffCount[currentSpacesDiff]++;
        }
        previousLineText = currentLineText;
        previousLineIndentation = currentLineIndentation;
    }
    let insertSpaces = defaultInsertSpaces;
    if (linesIndentedWithTabsCount !== linesIndentedWithSpacesCount) {
        insertSpaces = (linesIndentedWithTabsCount < linesIndentedWithSpacesCount);
    }
    let tabSize = defaultTabSize;
    // Guess tabSize only if inserting spaces...
    if (insertSpaces) {
        let tabSizeScore = 0;
        ALLOWED_TAB_SIZE_GUESSES.forEach((possibleTabSize) => {
            const possibleTabSizeScore = spacesDiffCount[possibleTabSize];
            if (possibleTabSizeScore > tabSizeScore) {
                tabSizeScore = possibleTabSizeScore;
                tabSize = possibleTabSize;
            }
        });
        // Let a tabSize of 2 win over 4 only if it has at least 2/3 of the occurrences of 4
        // This helps detect 2-space indentation in cases like YAML files where there might be
        // some 4-space diffs from deeper nesting, while still preferring 4 when it's clearly predominant
        if (tabSize === 4 && spacesDiffCount[4] > 0 && spacesDiffCount[2] > 0 && spacesDiffCount[2] >= spacesDiffCount[4] * 2 / 3) {
            tabSize = 2;
        }
    }
    // console.log('--------------------------');
    // console.log('linesIndentedWithTabsCount: ' + linesIndentedWithTabsCount + ', linesIndentedWithSpacesCount: ' + linesIndentedWithSpacesCount);
    // console.log('spacesDiffCount: ' + spacesDiffCount);
    // console.log('tabSize: ' + tabSize + ', tabSizeScore: ' + tabSizeScore);
    return {
        insertSpaces: insertSpaces,
        tabSize: tabSize
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50YXRpb25HdWVzc2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9tb2RlbC9pbmRlbnRhdGlvbkd1ZXNzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsTUFBTSxnQkFBZ0I7SUFBdEI7UUFDUSxlQUFVLEdBQVcsQ0FBQyxDQUFDO1FBQ3ZCLHVCQUFrQixHQUFZLEtBQUssQ0FBQztJQUM1QyxDQUFDO0NBQUE7QUFFRDs7R0FFRztBQUNILFNBQVMsVUFBVSxDQUFDLENBQVMsRUFBRSxPQUFlLEVBQUUsQ0FBUyxFQUFFLE9BQWUsRUFBRSxNQUF3QjtJQUVuRyxNQUFNLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztJQUN0QixNQUFNLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0lBRWxDLGdDQUFnQztJQUNoQyxhQUFhO0lBQ2IsaUJBQWlCO0lBQ2pCLDJDQUEyQztJQUUzQyxJQUFJLENBQVMsQ0FBQztJQUVkLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxJQUFJLENBQUMsR0FBRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUM3QyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFbEMsSUFBSSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDN0IsTUFBTTtRQUNQLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxVQUFVLEdBQUcsQ0FBQyxFQUFFLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDbkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRSxD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