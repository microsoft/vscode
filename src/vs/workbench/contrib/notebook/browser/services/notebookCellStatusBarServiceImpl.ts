/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { INotebookCellStatusBarService } from '../../common/notebookCellStatusBarService.js';
import { INotebookCellStatusBarItemList, INotebookCellStatusBarItemProvider } from '../../common/notebookCommon.js';

export class NotebookCellStatusBarService extends Disposable implements INotebookCellStatusBarService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _onDidChangeItems = this._register(new Emitter<void>());
	readonly onDidChangeItems: Event<void> = this._onDidChangeItems.event;

	private readonly _providers: INotebookCellStatusBarItemProvider[] = [];

	registerCellStatusBarItemProvider(provider: INotebookCellStatusBarItemProvider): IDisposable {
		this._providers.push(provider);
		let changeListener: IDisposable | undefined;
		if (provider.onDidChangeStatusBarItems) {
			changeListener = provider.onDidChangeStatusBarItems(() => this._onDidChangeItems.fire());
		}

		this._onDidChangeProviders.fire();

		return toDisposable(() => {
			changeListener?.dispose();
			const idx = this._providers.findIndex(p => p === provider);
			this._providers.splice(idx, 1);
		});
	}

	async getStatusBarItemsForCell(docUri: URI, cellIndex: number, viewType: string, token: CancellationToken): Promise<INotebookCellStatusBarItemList[]> {
		const providers = this._providers.filter(p => p.viewType === viewType || p.viewType === '*');
		return await Promise.all(providers.map(async p => {
			try {
				return await p.provideCellStatusBarItems(docUri, cellIndex, token) ?? { items: [] };
			} catch (e) {
				onUnexpectedExternalError(e);
				return { items: [] };
			}
		}));
	}
}
