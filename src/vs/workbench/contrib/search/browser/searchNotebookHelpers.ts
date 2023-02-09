/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindMatch } from 'vs/editor/common/model';
import { CellFindMatchWithIndex, ICellViewModel, CellWebviewFindMatch } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

import { ISearchRange, ITextSearchPreviewOptions, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range } from 'vs/editor/common/core/range';

export interface NotebookMatchInfo {
	cellIndex: number;
	matchStartIndex: number;
	matchEndIndex: number;
	cell: ICellViewModel;
	webviewMatchInfo?: {
		index: number;
	};
}

interface CellFindMatchInfoForTextModel {
	notebookMatchInfo: NotebookMatchInfo;
	matches: FindMatch[] | CellWebviewFindMatch;
}

export class NotebookTextSearchMatch extends TextSearchMatch {
	constructor(text: string, range: ISearchRange | ISearchRange[], public notebookMatchInfo: NotebookMatchInfo, previewOptions?: ITextSearchPreviewOptions) {
		super(text, range, previewOptions);
	}
}

function notebookEditorMatchToTextSearchResult(cellInfo: CellFindMatchInfoForTextModel, previewOptions?: ITextSearchPreviewOptions): NotebookTextSearchMatch | undefined {
	const matches = cellInfo.matches;

	if (Array.isArray(matches)) {
		if (matches.length > 0) {
			const lineTexts: string[] = [];
			const firstLine = matches[0].range.startLineNumber;
			const lastLine = matches[matches.length - 1].range.endLineNumber;
			for (let i = firstLine; i <= lastLine; i++) {
				lineTexts.push(cellInfo.notebookMatchInfo.cell.textBuffer.getLineContent(i));
			}

			return new NotebookTextSearchMatch(
				lineTexts.join('\n') + '\n',
				matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
				cellInfo.notebookMatchInfo,
				previewOptions);
		}
	}
	else {
		// TODO: this is a placeholder for webview matches
		const searchPreviewInfo = matches.searchPreviewInfo ?? {
			line: '', range: { start: 0, end: 0 }
		};

		return new NotebookTextSearchMatch(
			searchPreviewInfo.line,
			new Range(0, searchPreviewInfo.range.start, 0, searchPreviewInfo.range.end),
			cellInfo.notebookMatchInfo,
			previewOptions);
	}
	return undefined;
}
export function notebookEditorMatchesToTextSearchResults(cellFindMatches: CellFindMatchWithIndex[], previewOptions?: ITextSearchPreviewOptions): NotebookTextSearchMatch[] {
	let previousEndLine = -1;
	const groupedMatches: CellFindMatchInfoForTextModel[] = [];
	let currentMatches: FindMatch[] = [];
	let startIndexOfCurrentMatches = 0;


	cellFindMatches.forEach((cellFindMatch) => {
		const cellIndex = cellFindMatch.index;
		cellFindMatch.contentMatches.forEach((match, index) => {
			if (match.range.startLineNumber !== previousEndLine) {
				if (currentMatches.length > 0) {
					groupedMatches.push({ matches: [...currentMatches], notebookMatchInfo: { cellIndex, matchStartIndex: startIndexOfCurrentMatches, matchEndIndex: index, cell: cellFindMatch.cell } });
					currentMatches = [];
				}
				startIndexOfCurrentMatches = cellIndex + 1;
			}

			currentMatches.push(match);
			previousEndLine = match.range.endLineNumber;
		});

		if (currentMatches.length > 0) {
			groupedMatches.push({ matches: [...currentMatches], notebookMatchInfo: { cellIndex, matchStartIndex: startIndexOfCurrentMatches, matchEndIndex: cellFindMatch.contentMatches.length - 1, cell: cellFindMatch.cell } });
			currentMatches = [];
		}

		cellFindMatch.webviewMatches.forEach((match, index) => {
			groupedMatches.push({ matches: match, notebookMatchInfo: { cellIndex, matchStartIndex: index, matchEndIndex: index, cell: cellFindMatch.cell, webviewMatchInfo: { index: match.index } } });
		});
	});

	return groupedMatches.map(sameLineMatches => {
		return notebookEditorMatchToTextSearchResult(sameLineMatches, previewOptions);
	}).filter((elem): elem is NotebookTextSearchMatch => !!elem);
}
