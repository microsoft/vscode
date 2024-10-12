/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget';
import { INotebookCellMatchNoModel } from '../../common/searchNotebookHelpers';
import { IFileInstanceMatch, isFileInstanceMatch } from '../searchTreeModel/searchTreeCommon';
import { CellMatch, MatchInNotebook } from './notebookSearchModel';
import { INotebookCellMatchWithModel } from './searchNotebookHelpers';

export interface INotebookFileInstanceMatch extends IFileInstanceMatch {
	bindNotebookEditorWidget(editor: NotebookEditorWidget): void;
	updateMatchesForEditorWidget(): Promise<void>;
	unbindNotebookEditorWidget(editor: NotebookEditorWidget): void;
	updateNotebookHighlights(): void;
	getCellMatch(cellID: string): CellMatch | undefined;
	addCellMatch(rawCell: INotebookCellMatchNoModel | INotebookCellMatchWithModel): void;
	showMatch(match: MatchInNotebook): Promise<void>;
	cellMatches(): CellMatch[];
}

export function isNotebookFileMatch(obj: any): obj is INotebookFileInstanceMatch {
	return obj &&
		typeof obj.bindNotebookEditorWidget === 'function' &&
		typeof obj.updateMatchesForEditorWidget === 'function' &&
		typeof obj.unbindNotebookEditorWidget === 'function' &&
		typeof obj.updateNotebookHighlights === 'function'
		&& isFileInstanceMatch(obj);
}
