/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindMatch } from 'vs/editor/common/model';
import { IFileMatch, ITextSearchMatch, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range } from 'vs/editor/common/core/range';
import { IIncompleteNotebookCellMatch, IIncompleteNotebookFileMatch, genericCellMatchesToTextSearchMatches, rawCellPrefix } from 'vs/workbench/contrib/search/common/searchNotebookHelpersCommon';
import { CellWebviewFindMatch, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { URI } from 'vs/base/common/uri';

// to text search results
export function contentMatchesToTextSearchMatches(contentMatches: FindMatch[], cell: ICellViewModel): ITextSearchMatch[] {
	return genericCellMatchesToTextSearchMatches(
		contentMatches,
		cell.textBuffer
	);
}

export type INotebookCellMatch = ICompleteNotebookCellMatch | IIncompleteNotebookCellMatch;
export type INotebookFileMatch = ICompleteNotebookFileMatch | IIncompleteNotebookFileMatch;

export function getIDFromINotebookCellMatch(match: INotebookCellMatch): string {
	if (isICompleteNotebookCellMatch(match)) {
		return match.cell.id;
	} else {
		return `${rawCellPrefix}${match.index}`;
	}
}
export interface ICompleteNotebookFileMatch extends IFileMatch {
	cellResults: ICompleteNotebookCellMatch[];
}

export interface ICompleteNotebookCellMatch extends IIncompleteNotebookCellMatch<URI> {
	cell: ICellViewModel;
}

export function isICompleteNotebookFileMatch(object: any): object is ICompleteNotebookFileMatch {
	return 'cellResults' in object && object.cellResults instanceof Array && object.cellResults.every(isICompleteNotebookCellMatch);
}

export function isICompleteNotebookCellMatch(object: any): object is ICompleteNotebookCellMatch {
	return 'cell' in object;
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
