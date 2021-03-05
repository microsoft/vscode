/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebookCellStatusBarEntry } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export const INotebookCellStatusBarService = createDecorator<INotebookCellStatusBarService>('notebookCellStatusBarService');

export interface INotebookCellStatusBarService {
	readonly _serviceBrand: undefined;

	onDidChangeEntriesForCell: Event<URI>;

	addEntry(entry: INotebookCellStatusBarEntry): IDisposable;
	getEntries(cell: URI): INotebookCellStatusBarEntry[];
}
