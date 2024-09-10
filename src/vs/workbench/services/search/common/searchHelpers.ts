/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../editor/common/core/range.js';
import { FindMatch, ITextModel } from '../../../../editor/common/model.js';
import { ITextSearchPreviewOptions, TextSearchMatch, ITextSearchResult, ITextSearchMatch, ITextQuery } from './search.js';

function editorMatchToTextSearchResult(matches: FindMatch[], model: ITextModel, previewOptions?: ITextSearchPreviewOptions): TextSearchMatch {
	const firstLine = matches[0].range.startLineNumber;
	const lastLine = matches[matches.length - 1].range.endLineNumber;

	const lineTexts: string[] = [];
	for (let i = firstLine; i <= lastLine; i++) {
		lineTexts.push(model.getLineContent(i));
	}

	return new TextSearchMatch(
		lineTexts.join('\n') + '\n',
		matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
		previewOptions);
}

/**
 * Combine a set of FindMatches into a set of TextSearchResults. They should be grouped by matches that start on the same line that the previous match ends on.
 */
export function editorMatchesToTextSearchResults(matches: FindMatch[], model: ITextModel, previewOptions?: ITextSearchPreviewOptions): TextSearchMatch[] {
	let previousEndLine = -1;
	const groupedMatches: FindMatch[][] = [];
	let currentMatches: FindMatch[] = [];
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

export function getTextSearchMatchWithModelContext(matches: ITextSearchMatch[], model: ITextModel, query: ITextQuery): ITextSearchResult[] {
	const results: ITextSearchResult[] = [];

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

function getMatchStartEnd(match: ITextSearchMatch): { start: number; end: number } {
	const matchRanges = match.rangeLocations.map(e => e.source);
	const matchStartLine = matchRanges[0].startLineNumber;
	const matchEndLine = matchRanges[matchRanges.length - 1].endLineNumber;

	return {
		start: matchStartLine,
		end: matchEndLine
	};
}
