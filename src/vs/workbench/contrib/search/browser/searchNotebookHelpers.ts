/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindMatch } from 'vs/editor/common/model';
import { CellWebviewFindMatch, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IFileMatch, ITextSearchMatch, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range } from 'vs/editor/common/core/range';

export interface IFileMatchWithCells extends IFileMatch {
	cellResults: ICellMatch[];
}

export interface ICellMatch {
	cell: ICellViewModel;
	index: number;
	contentResults: ITextSearchMatch[];
	webviewResults: ITextSearchMatch[];
}
export function isIFileMatchWithCells(object: IFileMatch): object is IFileMatchWithCells {
	return 'cellResults' in object;
}

// to text search results

export function contentMatchesToTextSearchMatches(contentMatches: FindMatch[], cell: ICellViewModel): ITextSearchMatch[] {
	let previousEndLine = -1;
	const contextGroupings: FindMatch[][] = [];
	let currentContextGrouping: FindMatch[] = [];

	contentMatches.forEach((match) => {
		if (match.range.startLineNumber !== previousEndLine) {
			if (currentContextGrouping.length > 0) {
				contextGroupings.push([...currentContextGrouping]);
				currentContextGrouping = [];
			}
		}

		currentContextGrouping.push(match);
		previousEndLine = match.range.endLineNumber;
	});

	if (currentContextGrouping.length > 0) {
		contextGroupings.push([...currentContextGrouping]);
	}

	const textSearchResults = contextGroupings.map((grouping) => {
		const lineTexts: string[] = [];
		const firstLine = grouping[0].range.startLineNumber;
		const lastLine = grouping[grouping.length - 1].range.endLineNumber;
		for (let i = firstLine; i <= lastLine; i++) {
			lineTexts.push(cell.textBuffer.getLineContent(i));
		}
		return new TextSearchMatch(
			lineTexts.join('\n') + '\n',
			grouping.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
		);
	});

	return textSearchResults;
}

export function webviewMatchesToTextSearchMatches(webviewMatches: CellWebviewFindMatch[]): ITextSearchMatch[] {
	return webviewMatches
		.map(rawMatch =>
			(rawMatch.searchPreviewInfo) ?
				new TextSearchMatch(
					rawMatch.searchPreviewInfo.line,
					new Range(0, rawMatch.searchPreviewInfo.range.start, 0, rawMatch.searchPreviewInfo.range.end),
					undefined,
					rawMatch.index) : undefined
		).filter((e): e is ITextSearchMatch => !!e);
}


