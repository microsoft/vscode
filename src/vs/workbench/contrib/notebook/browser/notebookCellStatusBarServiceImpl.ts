/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarEntry } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookCellStatusBarService extends Disposable implements INotebookCellStatusBarService {

	private _onDidChangeEntriesForCell = new Emitter<URI>();
	readonly onDidChangeEntriesForCell: Event<URI> = this._onDidChangeEntriesForCell.event;

	private _entries = new ResourceMap<Set<INotebookCellStatusBarEntry>>();

	private removeEntry(entry: INotebookCellStatusBarEntry) {
		const existingEntries = this._entries.get(entry.cellResource);
		if (existingEntries) {
			existingEntries.delete(entry);
			if (!existingEntries.size) {
				this._entries.delete(entry.cellResource);
			}
		}

		this._onDidChangeEntriesForCell.fire(entry.cellResource);
	}

	addEntry(entry: INotebookCellStatusBarEntry): IDisposable {
		const existingEntries = this._entries.get(entry.cellResource) ?? new Set();
		existingEntries.add(entry);
		this._entries.set(entry.cellResource, existingEntries);

		this._onDidChangeEntriesForCell.fire(entry.cellResource);

		return {
			dispose: () => {
				this.removeEntry(entry);
			}
		};
	}

	getEntries(cell: URI): INotebookCellStatusBarEntry[] {
		const existingEntries = this._entries.get(cell);
		return existingEntries ?
			Array.from(existingEntries.values()) :
			[];
	}

	readonly _serviceBrand: undefined;
}
