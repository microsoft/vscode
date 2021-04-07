/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItem, INotebookCellStatusBarItemProvider, notebookDocumentFilterMatch } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookCellStatusBarService extends Disposable implements INotebookCellStatusBarService {

	private _onDidChangeEntriesForCell = new Emitter<URI>();
	readonly onDidChangeEntriesForCell: Event<URI> = this._onDidChangeEntriesForCell.event;

	private _providers: INotebookCellStatusBarItemProvider[] = [];

	registerCellStatusBarItemProvider(provider: INotebookCellStatusBarItemProvider): IDisposable {
		this._providers.push(provider);
		return toDisposable(() => {
			const idx = this._providers.findIndex(p => p === provider);
			this._providers.splice(idx, 1);
		});
	}

	async getEntries(docUri: URI, index: number, viewType: string, token: CancellationToken): Promise<INotebookCellStatusBarItem[]> {
		const providers = this._providers.filter(p => notebookDocumentFilterMatch(p.selector, viewType, docUri));
		return flatten(await Promise.all(providers.map(provider => provider.provideCellStatusBarItems(docUri, index, token))));
	}

	readonly _serviceBrand: undefined;
}
