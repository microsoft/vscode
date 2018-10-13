/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { ISearchHistoryValues, ISearchHistoryService } from 'vs/platform/search/common/search';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export class SearchHistoryService implements ISearchHistoryService {
	public _serviceBrand: any;

	private static readonly SEARCH_HISTORY_KEY = 'workbench.search.history';

	private readonly _onDidClearHistory: Emitter<void> = new Emitter<void>();
	public readonly onDidClearHistory: Event<void> = this._onDidClearHistory.event;

	constructor(
		@IStorageService private storageService: IStorageService
	) { }

	public clearHistory(): void {
		this.storageService.delete(SearchHistoryService.SEARCH_HISTORY_KEY, StorageScope.WORKSPACE);
		this._onDidClearHistory.fire();
	}

	public load(): ISearchHistoryValues {
		let result: ISearchHistoryValues;
		const raw = this.storageService.get(SearchHistoryService.SEARCH_HISTORY_KEY, StorageScope.WORKSPACE);

		if (raw) {
			try {
				result = JSON.parse(raw);
			} catch (e) {
				// Invalid data
			}
		}

		return result || {};
	}

	public save(history: ISearchHistoryValues): void {
		this.storageService.set(SearchHistoryService.SEARCH_HISTORY_KEY, JSON.stringify(history), StorageScope.WORKSPACE);
	}
}