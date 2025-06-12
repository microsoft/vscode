/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextSearchMatch } from '../../../../services/search/common/search.js';
import { ICellViewModel } from '../../../notebook/browser/notebookBrowser.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { INotebookCellMatchNoModel } from '../../common/searchNotebookHelpers.js';
import { ISearchTreeFileMatch, ISearchTreeMatch, isSearchTreeFileMatch } from '../searchTreeModel/searchTreeCommon.js';
import { INotebookCellMatchWithModel } from './searchNotebookHelpers.js';

export interface INotebookFileInstanceMatch extends ISearchTreeFileMatch {
	bindNotebookEditorWidget(editor: NotebookEditorWidget): void;
	updateMatchesForEditorWidget(): Promise<void>;
	unbindNotebookEditorWidget(editor: NotebookEditorWidget): void;
	updateNotebookHighlights(): void;
	getCellMatch(cellID: string): ICellMatch | undefined;
	addCellMatch(rawCell: INotebookCellMatchNoModel | INotebookCellMatchWithModel): void;
	showMatch(match: IMatchInNotebook): Promise<void>;
	cellMatches(): ICellMatch[];
}

export function isNotebookFileMatch(obj: any): obj is INotebookFileInstanceMatch {
	return obj &&
		typeof obj.bindNotebookEditorWidget === 'function' &&
		typeof obj.updateMatchesForEditorWidget === 'function' &&
		typeof obj.unbindNotebookEditorWidget === 'function' &&
		typeof obj.updateNotebookHighlights === 'function'
		&& isSearchTreeFileMatch(obj);
}

export interface IMatchInNotebook extends ISearchTreeMatch {
	parent(): INotebookFileInstanceMatch;
	cellParent: ICellMatch;
	isWebviewMatch(): boolean;
	cellIndex: number;
	webviewIndex: number | undefined;
	cell: ICellViewModel | undefined;
}
export function isIMatchInNotebook(obj: any): obj is IMatchInNotebook {
	return typeof obj === 'object' &&
		obj !== null &&
		typeof obj.parent === 'function' &&
		typeof obj.cellParent === 'object' &&
		typeof obj.isWebviewMatch === 'function' &&
		typeof obj.cellIndex === 'number' &&
		(typeof obj.webviewIndex === 'number' || obj.webviewIndex === undefined) &&
		(typeof obj.cell === 'object' || obj.cell === undefined);
}

export interface ICellMatch {
	hasCellViewModel(): boolean;
	context: Map<number, string>;
	matches(): IMatchInNotebook[];
	contentMatches: IMatchInNotebook[];
	webviewMatches: IMatchInNotebook[];
	remove(matches: IMatchInNotebook | IMatchInNotebook[]): void;
	clearAllMatches(): void;
	addContentMatches(textSearchMatches: ITextSearchMatch[]): void;
	addContext(textSearchMatches: ITextSearchMatch[]): void;
	addWebviewMatches(textSearchMatches: ITextSearchMatch[]): void;
	setCellModel(cell: ICellViewModel): void;
	parent: INotebookFileInstanceMatch;
	id: string;
	cellIndex: number;
	cell: ICellViewModel | undefined;
}
