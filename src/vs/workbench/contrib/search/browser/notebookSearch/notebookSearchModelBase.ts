/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextSearchMatch } from '../../../../services/search/common/search';
import { ICellViewModel } from '../../../notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget';
import { INotebookCellMatchNoModel } from '../../common/searchNotebookHelpers';
import { IFileInstanceMatch, ISearchMatch, isFileInstanceMatch } from '../searchTreeModel/searchTreeCommon';
import { INotebookCellMatchWithModel } from './searchNotebookHelpers';

export interface INotebookFileInstanceMatch extends IFileInstanceMatch {
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
		&& isFileInstanceMatch(obj);
}

export interface IMatchInNotebook extends ISearchMatch {
	parent(): INotebookFileInstanceMatch;
	cellParent: ICellMatch;
	isWebviewMatch(): boolean;
	isReadonly(): boolean;
	cellIndex: number;
	webviewIndex: number | undefined;
	cell: ICellViewModel | undefined;
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
