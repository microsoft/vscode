/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../editor/common/core/range.js';
import { TextSearchMatch } from './search.js';
function editorMatchToTextSearchResult(matches, model, previewOptions) {
    const firstLine = matches[0].range.startLineNumber;
    const lastLine = matches[matches.length - 1].range.endLineNumber;
    const lineTexts = [];
    for (let i = firstLine; i <= lastLine; i++) {
        lineTexts.push(model.getLineContent(i));
    }
    return new TextSearchMatch(lineTexts.join('\n') + '\n', matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)), previewOptions);
}
/**
 * Combine a set of FindMatches into a set of TextSearchResults. They should be grouped by matches that start on the same line that the previous match ends on.
 */
export function editorMatchesToTextSearchResults(matches, model, previewOptions) {
    let previousEndLine = -1;
    const groupedMatches = [];
    let currentMatches = [];
    matches.forEach((match) => {
        if (match.range.startLineNumber !== previousEndLine) {
            currentMatches = [];
            groupedMatches.push(currentMatches);
        }
        currentMatches.push(match);
        previousEndLine = match.range.endLineNumber;
    });
    return groupedMatches.map(sameLineMatches => {
        return editorMatchToTextSearchResult(sameLineMatches, model, previewOptions);
    });
}
export function getTextSearchMatchWithModelContext(matches, model, query) {
    const results = [];
    let prevLine = -1;
    for (let i = 0; i < matches.length; i++) {
        const { start: matchStartLine, end: matchEndLine } = getMatchStartEnd(matches[i]);
        if (typeof query.surroundingContext === 'number' && query.surroundingContext > 0) {
            const beforeContextStartLine = Math.max(prevLine + 1, matchStartLine - query.surroundingContext);
            for (let b = beforeContextStartLine; b < matchStartLine; b++) {
                results.push({
                    text: model.getLineContent(b + 1),
                    lineNumber: b + 1
                });
            }
        }
        results.push(matches[i]);
        const nextMatch = matches[i + 1];
        const nextMatchStartLine = nextMatch ? getMatchStartEnd(nextMatch).start : Number.MAX_VALUE;
        if (typeof query.surroundingContext === 'number' && query.surroundingContext > 0) {
            const afterContextToLine = Math.min(nextMatchStartLine - 1, matchEndLine + query.surroundingContext, model.getLineCount() - 1);
            for (let a = matchEndLine + 1; a <= afterContextToLine; a++) {
                results.push({
                    text: model.getLineContent(a + 1),
                    lineNumber: a + 1
                });
            }
        }
        prevLine = matchEndLine;
    }
    return results;
}
function getMatchStartEnd(match) {
    const matchRanges = match.rangeLocations.map(e => e.source);
    const matchStartLine = matchRanges[0].startLineNumber;
    const matchEndLine = matchRanges[matchRanges.length - 1].endLineNumber;
    return {
        start: matchStartLine,
        end: matchEndLine
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWhFLE9BQU8sRUFBNkIsZUFBZSxFQUF5RCxNQUFNLGFBQWEsQ0FBQztBQUVoSSxTQUFTLDZCQUE2QixDQUFDLE9BQW9CLEVBQUUsS0FBaUIsRUFBRSxjQUEwQztJQUN6SCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQztJQUNuRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDO0lBRWpFLE1BQU0sU0FBUyxHQUFhLEVBQUUsQ0FBQztJQUMvQixLQUFLLElBQUksQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDLElBQUksUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDNUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE9BQU8sSUFBSSxlQUFlLENBQ3pCLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUMzQixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFB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