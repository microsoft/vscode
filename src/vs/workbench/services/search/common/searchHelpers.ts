/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { FindMatch, ITextModel } from 'vs/editor/common/model';
import { ITextSearchPreviewOptions, TextSearchResult } from 'vs/platform/search/common/search';

function editorMatchToTextSearchResult(matches: FindMatch[], model: ITextModel, previewOptions?: ITextSearchPreviewOptions): TextSearchResult {
	const firstLine = matches[0].range.startLineNumber;
	const lastLine = matches[matches.length - 1].range.endLineNumber;

	const lineTexts: string[] = [];
	const numLines = previewOptions ? previewOptions.matchLines : Number.MAX_VALUE;
	for (let i = firstLine; i <= lastLine && (i - firstLine) < numLines; i++) {
		lineTexts.push(model.getLineContent(i));
	}

	return new TextSearchResult(
		lineTexts.join('\n'),
		matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
		previewOptions);
}

/**
 * Combine a set of FindMatches into a set of TextSearchResults. They should be grouped by matches that start on the same line that the previous match ends on.
 */
export function editorMatchesToTextSearchResults(matches: FindMatch[], model: ITextModel, previewOptions?: ITextSearchPreviewOptions): TextSearchResult[] {
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