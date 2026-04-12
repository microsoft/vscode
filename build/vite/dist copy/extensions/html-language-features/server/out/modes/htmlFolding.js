"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoldingRanges = getFoldingRanges;
const languageModes_1 = require("./languageModes");
async function getFoldingRanges(languageModes, document, maxRanges, _cancellationToken) {
    const htmlMode = languageModes.getMode('html');
    const range = languageModes_1.Range.create(languageModes_1.Position.create(0, 0), languageModes_1.Position.create(document.lineCount, 0));
    let result = [];
    if (htmlMode && htmlMode.getFoldingRanges) {
        result.push(...await htmlMode.getFoldingRanges(document));
    }
    // cache folding ranges per mode
    const rangesPerMode = Object.create(null);
    const getRangesForMode = async (mode) => {
        if (mode.getFoldingRanges) {
            let ranges = rangesPerMode[mode.getId()];
            if (!Array.isArray(ranges)) {
                ranges = await mode.getFoldingRanges(document) || [];
                rangesPerMode[mode.getId()] = ranges;
            }
            return ranges;
        }
        return [];
    };
    const modeRanges = languageModes.getModesInRange(document, range);
    for (const modeRange of modeRanges) {
        const mode = modeRange.mode;
        if (mode && mode !== htmlMode && !modeRange.attributeValue) {
            const ranges = await getRangesForMode(mode);
            result.push(...ranges.filter(r => r.startLine >= modeRange.start.line && r.endLine < modeRange.end.line));
        }
    }
    if (maxRanges && result.length > maxRanges) {
        result = limitRanges(result, maxRanges);
    }
    return result;
}
function limitRanges(ranges, maxRanges) {
    ranges = ranges.sort((r1, r2) => {
        let diff = r1.startLine - r2.startLine;
        if (diff === 0) {
            diff = r1.endLine - r2.endLine;
        }
        return diff;
    });
    // compute each range's nesting level in 'nestingLevels'.
    // count the number of ranges for each level in 'nestingLevelCounts'
    let top = undefined;
    const previous = [];
    const nestingLevels = [];
    const nestingLevelCounts = [];
    const setNestingLevel = (index, level) => {
        nestingLevels[index] = level;
        if (level < 30) {
            nestingLevelCounts[level] = (nestingLevelCounts[level] || 0) + 1;
        }
    };
    // compute nesting levels and sanitize
    for (let i = 0; i < ranges.length; i++) {
        const entry = ranges[i];
        if (!top) {
            top = entry;
            setNestingLevel(i, 0);
        }
        else {
            if (entry.startLine > top.startLine) {
                if (entry.endLine <= top.endLine) {
                    previous.push(top);
                    top = entry;
                    setNestingLevel(i, previous.length);
                }
                else if (entry.startLine > top.endLine) {
                    do {
                        top = previous.pop();
                    } while (top && entry.startLine > top.endLine);
                    if (top) {
                        previous.push(top);
                    }
                    top = entry;
                    setNestingLevel(i, previous.length);
                }
            }
        }
    }
    let entries = 0;
    let maxLevel = 0;
    for (let i = 0; i < nestingLevelCounts.length; i++) {
        const n = nestingLevelCounts[i];
        if (n) {
            if (n + entries > maxRanges) {
                maxLevel = i;
                break;
            }
            entries += n;
        }
    }
    const result = [];
    for (let i = 0; i < ranges.length; i++) {
        const level = nestingLevels[i];
        if (typeof level === 'number') {
            if (level < maxLevel || (level === maxLevel && entries++ < maxRanges)) {
                result.push(ranges[i]);
            }
        }
    }
    return result;
}
//# sourceMappingURL=htmlFolding.js.map