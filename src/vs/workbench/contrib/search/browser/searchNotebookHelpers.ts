/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { FindMatch } from 'vs/editor/common/model';
// import { CellFindMatchWithIndex, ICellViewModel, OutputFindMatch } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
// import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
// import { ITextSearchPreviewOptions, ITextSearchResult, TextSearchMatch } from 'vs/workbench/services/search/common/search';

// interface CellFindMatchInfoForTextModel {
// 	cell: ICellViewModel;
// 	matches: FindMatch[] | OutputFindMatch;
// }

// function notebookEditorMatchToTextSearchResult(cellInfo: CellFindMatchInfoForTextModel, editorWidget: NotebookEditorWidget, previewOptions?: ITextSearchPreviewOptions): TextSearchMatch {
// 	// what do I want here?
// 	// I want to take all of my matches and group them
// 	const matches: FindMatch[] | OutputFindMatch = cellInfo.matches;
// 	if (matches instanceof OutputFindMatch) {

// 		return new TextSearchMatch(
// 			lineTexts.join('\n') + '\n',
// 			matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
// 			previewOptions);
// 	} else {
// 		const firstLine = matches[0].range.startLineNumber;
// 		const lastLine = matches[matches.length - 1].range.endLineNumber;
// 		const lineTexts: string[] = [];
// 		for (let i = firstLine; i <= lastLine; i++) {
// 			lineTexts.push(editorWidget.textModel?.getLineContent(i));
// 		}

// 		return new TextSearchMatch(
// 			lineTexts.join('\n') + '\n',
// 			matches.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
// 			previewOptions);
// 	}

// }

// export function notebookEditorMatchesToTextSearchResults(cellFindMatches: CellFindMatchWithIndex[], editorWidget: NotebookEditorWidget, previewOptions?: ITextSearchPreviewOptions): TextSearchMatch[] {
// 	let previousEndLine = -1;
// 	const groupedMatches: CellFindMatchInfoForTextModel[] = [];
// 	let currentMatches: FindMatch[] = [];


// 	cellFindMatches.forEach((cellFindMatch) => {
// 		cellFindMatch.matches.forEach((match) => {
// 			if (match instanceof FindMatch) {

// 				if (match.range.startLineNumber !== previousEndLine) {
// 					currentMatches = [];
// 					groupedMatches.push({ cell: cellFindMatch.cell, matches: currentMatches });
// 				}

// 				currentMatches.push(match);
// 				previousEndLine = match.range.endLineNumber;
// 			} else {
// 				groupedMatches.push({ cell: cellFindMatch.cell, matches: match });
// 			}
// 		});

// 		currentMatches = [];
// 		groupedMatches.push({ cell: cellFindMatch.cell, matches: currentMatches });
// 	});

// 	return groupedMatches.map(sameLineMatches => {

// 		return notebookEditorMatchToTextSearchResult(sameLineMatches, editorWidget, previewOptions);
// 	});
// }

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
