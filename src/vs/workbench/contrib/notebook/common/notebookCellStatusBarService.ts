/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebookCellStatusBarItem, INotebookCellStatusBarItemProvider } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export const INotebookCellStatusBarService = createDecorator<INotebookCellStatusBarService>('notebookCellStatusBarService');

export interface INotebookCellStatusBarService {
	readonly _serviceBrand: undefined;

	onDidChangeEntriesForCell: Event<URI>;

	registerCellStatusBarItemProvider(provider: INotebookCellStatusBarItemProvider): IDisposable;

	// setEntries(cell: URI, entries: INotebookCellStatusBarItem[]): void;

	/**
	 * Calls all providers, caches the result, disposes the previous result
	 */
	// private _updateEntriesForCell(cell: URI, token: CancelToken): Promise<IDisposable>;

	// acquireCellStatusBarItemUpdater(cell: URI): { obj: { update: () => void }; dispose(): void };


	subscribeToStatusBarUpdatesForCell(docUri: URI, cellIndex: number): Event<INotebookCellStatusBarItem[]>;
}
