/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
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

	subscribeToStatusBarUpdatesForCell(notebookViewModel: NotebookViewModel, cell: ICellViewModel): Event<INotebookCellStatusBarItem[]> {
		const disposables = new DisposableStore();
		const providerCancelToken = new CancellationTokenSource();
		const emitter = new Emitter<INotebookCellStatusBarItem[]>({
			onLastListenerRemove: () => disposables.dispose(),
			onFirstListenerAdd: () => {
				update();
			}
		});
		disposables.add(emitter);
		disposables.add(providerCancelToken);
		disposables.add(cell.model.onDidChangeContent(() => update()));
		disposables.add(cell.model.onDidChangeOutputs(() => update()));
		disposables.add(cell.model.onDidChangeLanguage(() => update()));
		disposables.add(cell.model.onDidChangeMetadata(() => update()));

		const update = async () => {
			const docUri = notebookViewModel.uri;
			const viewType = notebookViewModel.viewType;
			const providers = this.getProviders(docUri, viewType);
			const cellIdx = notebookViewModel.getCellIndex(cell);
			const results = flatten(await Promise.all(providers.map(p => p.provideCellStatusBarItems(docUri, cellIdx, providerCancelToken.token))));
			emitter.fire(results);
		};

		return emitter.event;
	}

	private getProviders(docUri: URI, viewType: string): INotebookCellStatusBarItemProvider[] {
		return this._providers.filter(p => notebookDocumentFilterMatch(p.selector, viewType, docUri));
	}

	readonly _serviceBrand: undefined;
}
