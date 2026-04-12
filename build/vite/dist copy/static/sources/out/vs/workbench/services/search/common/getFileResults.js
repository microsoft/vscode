/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../editor/common/core/range.js';
export const getFileResults = (bytes, pattern, options) => {
    let text;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder('utf-16le').decode(bytes);
    }
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder('utf-16be').decode(bytes);
    }
    else {
        text = new TextDecoder('utf8').decode(bytes);
        if (text.slice(0, 1000).includes('\uFFFD') && bytes.includes(0)) {
            return [];
        }
    }
    const results = [];
    const patternIndices = [];
    let patternMatch = null;
    let remainingResultQuota = options.remainingResultQuota;
    while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(text))) {
        patternIndices.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
        remainingResultQuota--;
    }
    if (patternIndices.length) {
        const contextLinesNeeded = new Set();
        const resultLines = new Set();
        const lineRanges = [];
        const readLine = (lineNumber) => text.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);
        let prevLineEnd = 0;
        let lineEndingMatch = null;
        const lineEndRegex = /\r?\n/g;
        while ((lineEndingMatch = lineEndRegex.exec(text))) {
            lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
            prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
        }
        if (prevLineEnd < text.length) {
            lineRanges.push({ start: prevLineEnd, end: text.length });
        }
        let startLine = 0;
        for (const { matchStartIndex, matchedText } of patternIndices) {
            if (remainingResultQuota < 0) {
                break;
            }
            while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
                startLine++;
            }
            let endLine = startLine;
            while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
                endLine++;
            }
            if (options.surroundingContext) {
                for (let contextLine = Math.max(0, startLine - options.surroundingContext); contextLine < startLine; contextLine++) {
                    contextLinesNeeded.add(contextLine);
                }
            }
            let previewText = '';
            let offset = 0;
            for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
                let previewLine = readLine(matchLine);
                if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
                    offset = Math.max(matchStartIndex - lineRanges[startLine].start - 20, 0);
                    previewLine = previewLine.substr(offset, options.previewOptions.charsPerLine);
                }
                previewText += `${previewLine}\n`;
                resultLines.add(matchLine);
            }
            const fileRange = new Range(startLine, matchStartIndex - lineRanges[startLine].start, endLine, matchStartIndex + matchedText.length - lineRanges[endLine].start);
            const previewRange = new Range(0, matchStartIndex - lineRanges[startLine].start - offset, endLine - startLine, matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0));
            const match = {
                rangeLocations: [{
                        source: fileRange,
                        preview: previewRange,
                    }],
                previewText: previewText
            };
            results.push(match);
            if (options.surroundingContext) {
                for (let contextLine = endLine + 1; contextLine <= Math.min(endLine + options.surroundingContext, lineRanges.length - 1); contextLine++) {
                    contextLinesNeeded.add(contextLine);
                }
            }
        }
        for (const contextLine of contextLinesNeeded) {
            if (!resultLines.has(contextLine)) {
                results.push({
                    text: readLine(contextLine),
                    lineNumber: contextLine + 1,
                });
            }
        }
    }
    return results;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0RmlsZVJlc3VsdHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL2NvbW1vbi9nZXRGaWxlUmVzdWx0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFaEUsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLENBQzdCLEtBQWlCLEVBQ2pCLE9BQWUsRUFDZixPQUlDLEVBQ3FCLEVBQUU7SUFFeEIsSUFBSSxJQUFZLENBQUM7SUFDakIsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM1QyxJQUFJLEdBQUcsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2xELENBQUM7U0FBTSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ25ELElBQUksR0FBRyxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEQsQ0FBQztTQUFNLENBQUM7UUFDUCxJQUFJLEdBQUcsSUFBSSxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNqRSxPQUFPLEVBQUUsQ0FBQztRQUNY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