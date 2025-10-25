/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FindMatch } from '../../../../../editor/common/model.js';
import { IFileMatch, ITextSearchMatch, TextSearchMatch } from '../../../../services/search/common/search.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { INotebookCellMatchNoModel, INotebookFileMatchNoModel, genericCellMatchesToTextSearchMatches, rawCellPrefix } from '../../common/searchNotebookHelpers.js';
import { CellWebviewFindMatch, ICellViewModel } from '../../../notebook/browser/notebookBrowser.js';
import { URI } from '../../../../../base/common/uri.js';

export type INotebookCellMatch = INotebookCellMatchWithModel | INotebookCellMatchNoModel;
export type INotebookFileMatch = INotebookFileMatchWithModel | INotebookFileMatchNoModel;

export function getIDFromINotebookCellMatch(match: INotebookCellMatch): string {
	if (isINotebookCellMatchWithModel(match)) {
		return match.cell.id;
	} else {
		return `${rawCellPrefix}${match.index}`;
	}
}
export interface INotebookFileMatchWithModel extends IFileMatch {
	cellResults: INotebookCellMatchWithModel[];
}

export interface INotebookCellMatchWithModel extends INotebookCellMatchNoModel<URI> {
	cell: ICellViewModel;
}

export function isINotebookFileMatchWithModel(object: any): object is INotebookFileMatchWithModel {
	return 'cellResults' in object && object.cellResults instanceof Array && object.cellResults.every(isINotebookCellMatchWithModel);
}

export function isINotebookCellMatchWithModel(object: any): object is INotebookCellMatchWithModel {
	return 'cell' in object;
}

export function contentMatchesToTextSearchMatches(contentMatches: FindMatch[], cell: ICellViewModel): ITextSearchMatch[] {
	return genericCellMatchesToTextSearchMatches(
		contentMatches,
		cell.textBuffer
	);
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
		).filter((e): e is TextSearchMatch => !!e);
}
