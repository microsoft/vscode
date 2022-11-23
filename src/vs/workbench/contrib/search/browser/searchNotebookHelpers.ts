/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindMatch } from 'vs/editor/common/model';
import { CellFindMatchWithIndex, ICellViewModel, CellWebviewFindMatch } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

import { ITextSearchPreviewOptions, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range } from 'vs/editor/common/core/range';

interface CellFindMatchInfoForTextModel {
	cell: ICellViewModel;
	matches: FindMatch[] | CellWebviewFindMatch;
}

function notebookEditorMatchToTextSearchResult(cellInfo: CellFindMatchInfoForTextModel, previewOptions?: ITextSearchPreviewOptions): TextSearchMatch | undefined {
	const matches = cellInfo.matches;


	if (Array.isArray(matches)) {
		if (matches.length > 0) {
			const lineTexts: string[] = [];
			const firstLine = matches[0].range.startLineNumber;
			const lastLine = matches[matches.length - 1].range.endLineNumber;
			for (let i = firstLine; i <= lastLine; i++) {
				if (cellInfo.cell.textModel) {
					lineTexts.push(cellInfo.cell.textModel?.getLineContent(i));
				}
			}

			return new TextSearchMatch(
				lineTexts.join('\n') + '\n',
				matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
				previewOptions);
		}
	}
	else {
		return new TextSearchMatch(
			matches.searchPreviewInfo.line,
			new Range(0, matches.searchPreviewInfo.range.start, 0, matches.searchPreviewInfo.range.end),
			previewOptions);
	}
	return undefined;
}
export function notebookEditorMatchesToTextSearchResults(cellFindMatches: CellFindMatchWithIndex[], previewOptions?: ITextSearchPreviewOptions): TextSearchMatch[] {
	let previousEndLine = -1;
	const groupedMatches: CellFindMatchInfoForTextModel[] = [];
	let currentMatches: FindMatch[] = [];


	cellFindMatches.forEach((cellFindMatch) => {
		cellFindMatch.contentMatches.forEach((match) => {
			if (match.range.startLineNumber !== previousEndLine) {
				currentMatches = [];
				groupedMatches.push({ cell: cellFindMatch.cell, matches: currentMatches });
			}

			currentMatches.push(match);
			previousEndLine = match.range.endLineNumber;
		});

		currentMatches = [];
		groupedMatches.push({ cell: cellFindMatch.cell, matches: currentMatches });

		cellFindMatch.webviewMatches.forEach((match) => {
			groupedMatches.push({ cell: cellFindMatch.cell, matches: match });
		});
	});

	return groupedMatches.map(sameLineMatches => {
		return notebookEditorMatchToTextSearchResult(sameLineMatches, previewOptions);
	}).filter((elem): elem is TextSearchMatch => !!elem);
}

// export function addContextToNotebookEditorMatches(matches: ITextSearchMatch[], editorWidget: NotebookEditorWidget, query: ITextQuery): ITextSearchResult[] {
// 	const results: ITextSearchResult[] = [];

// 	let prevLine = -1;
// 	for (let i = 0; i < matches.length; i++) {
// 		const { start: matchStartLine, end: matchEndLine } = getMatchStartEnd(matches[i]);
// 		if (typeof query.beforeContext === 'number' && query.beforeContext > 0) {
// 			const beforeContextStartLine = Math.max(prevLine + 1, matchStartLine - query.beforeContext);
// 			for (let b = beforeContextStartLine; b < matchStartLine; b++) {
// 				results.push(<ITextSearchContext>{
// 					text: model.getLineContent(b + 1),
// 					lineNumber: b
// 				});
// 			}
// 		}

// 		results.push(matches[i]);

// 		const nextMatch = matches[i + 1];
// 		const nextMatchStartLine = nextMatch ? getMatchStartEnd(nextMatch).start : Number.MAX_VALUE;
// 		if (typeof query.afterContext === 'number' && query.afterContext > 0) {
// 			const afterContextToLine = Math.min(nextMatchStartLine - 1, matchEndLine + query.afterContext, model.getLineCount() - 1);
// 			for (let a = matchEndLine + 1; a <= afterContextToLine; a++) {
// 				results.push(<ITextSearchContext>{
// 					text: model.getLineContent(a + 1),
// 					lineNumber: a
// 				});
// 			}
// 		}

// 		prevLine = matchEndLine;
// 	}

// 	return results;
// }
