/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItem, INotebookCellStatusBarItemProvider, notebookDocumentFilterMatch } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class NotebookCellStatusBarService extends Disposable implements INotebookCellStatusBarService {

	private _onDidChangeEntriesForCell = new Emitter<URI>();
	readonly onDidChangeEntriesForCell: Event<URI> = this._onDidChangeEntriesForCell.event;

	private _providers: INotebookCellStatusBarItemProvider[] = [];

	private _currentSubscriptions = new Set<CellStatusBarSubscription>();

	constructor(
		@INotebookService private readonly _notebookService: INotebookService
	) {
		super();
	}

	registerCellStatusBarItemProvider(provider: INotebookCellStatusBarItemProvider): IDisposable {
		this._providers.push(provider);
		if (provider.onDidChangeStatusBarItems) {
			// TODO, add a listener that will be disposed when the provider is disposed
			// then update all active subscriptions
		}

		this.updateSubscriptions();
		return toDisposable(() => {
			const idx = this._providers.findIndex(p => p === provider);
			this._providers.splice(idx, 1);
			this.updateSubscriptions();
		});
	}

	private updateSubscriptions(providersChanged?: boolean): void {
		this._currentSubscriptions.forEach(subscription => {
			if (providersChanged) {
				subscription.setProviders(this._providers);
			}

			subscription.update();
		});
	}

	subscribeToStatusBarUpdatesForCell(docUri: URI, cellIndex: number): Event<INotebookCellStatusBarItem[]> {
		const emitter = new Emitter<INotebookCellStatusBarItem[]>({
			onLastListenerRemove: () => {
				this.dispose();
				emitter.dispose();
				this._currentSubscriptions.delete(subscription);
			},
			onFirstListenerAdd: () => {
				subscription.update();
			}
		});
		const subscription = new CellStatusBarSubscription(docUri, cellIndex, this._providers, emitter, this._notebookService);
		this._currentSubscriptions.add(subscription);
		return subscription.onDidChange;
	}


	readonly _serviceBrand: undefined;
}

class CellStatusBarSubscription extends Disposable {
	readonly onDidChange: Event<INotebookCellStatusBarItem[]> = this._emitter.event;

	private readonly _providerCancelToken = new CancellationTokenSource();
	private readonly _viewType: string;
	private readonly _previousItems = new DisposableStore();

	constructor(
		private readonly _docUri: URI,
		private readonly _cellIndex: number, // TODO cell index will change. Are we subscribing to the cell currently at this index?
		private _providers: INotebookCellStatusBarItemProvider[],
		private readonly _emitter: Emitter<INotebookCellStatusBarItem[]>,
		notebookService: INotebookService
	) {
		super();

		const doc = notebookService.getNotebookTextModel(this._docUri);
		if (!doc) {
			throw new Error(`Unknown doc ${this._docUri}`);
		}

		this._viewType = doc.viewType;
		const cell = doc.cells[this._cellIndex];

		this._register(this._emitter);
		this._register(this._providerCancelToken);
		this._register(this._previousItems);
		this._register(cell.onDidChangeContent(() => this.update()));
		this._register(cell.onDidChangeOutputs(() => this.update()));
		this._register(cell.onDidChangeLanguage(() => this.update()));
		this._register(cell.onDidChangeMetadata(() => this.update()));
	}

	private getProviders(): INotebookCellStatusBarItemProvider[] {
		return this._providers.filter(p => notebookDocumentFilterMatch(p.selector, this._viewType, this._docUri));
	}

	async update(): Promise<void> {
		// TODO should use scheduler to prevent running multiple times at once
		const providers = this.getProviders();
		const lists = await Promise.all(providers.map(p => p.provideCellStatusBarItems(this._docUri, this._cellIndex, this._providerCancelToken.token)));
		const results = flatten(lists.map(l => l.items));
		this._emitter.fire(results);

		this._previousItems.clear();
		lists.forEach(l => !!l.dispose && this._previousItems.add(l as IDisposable));
	}

	setProviders(providers: INotebookCellStatusBarItemProvider[]): void {
		this._providers = providers;
	}
}
