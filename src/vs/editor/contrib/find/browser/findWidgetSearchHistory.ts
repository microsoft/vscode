/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export interface IPersistentSearchHistory {
	load(): string[];
	save(history: string): void;
	reduceToLimit(limit: number): void;
}

export interface ISearchValue {
	timeStamp: number;
	searchString: string;
}

export class FindWidgetSearchHistory implements IPersistentSearchHistory {
	public static readonly FIND_HISTORY_KEY = 'workbench.find.history';
	private inMemoryValues: ISearchValue[] = [];

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) { }

	load() {
		let result: ISearchValue[] | undefined;
		const raw = this.storageService.get(
			FindWidgetSearchHistory.FIND_HISTORY_KEY,
			StorageScope.WORKSPACE
		);

		if (raw) {
			try {
				result = JSON.parse(raw);
			} catch (e) {
				// Invalid data
			}
		}

		this.inMemoryValues = result || [];
		return this.inMemoryValues.sort((a, b) => a.timeStamp - b.timeStamp).map(a => a.searchString);
	}

	save(value: string): void {
		const raw = this.storageService.get(
			FindWidgetSearchHistory.FIND_HISTORY_KEY,
			StorageScope.WORKSPACE
		);
		const newValue = {
			searchString: value,
			timeStamp: Date.now(),
		};

		if (!raw) {
			this.storageService.store(
				FindWidgetSearchHistory.FIND_HISTORY_KEY,
				JSON.stringify([newValue]),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
		} else {
			try {
				const array: ISearchValue[] = JSON.parse(raw);
				array.push({
					searchString: value,
					timeStamp: Date.now(),
				});
				this.storageService.store(
					FindWidgetSearchHistory.FIND_HISTORY_KEY,
					JSON.stringify(array),
					StorageScope.WORKSPACE,
					StorageTarget.USER
				);
			} catch (e) {
				// Invalid data
			}
		}
	}

	reduceToLimit(limit: number) {
		const raw = this.storageService.get(
			FindWidgetSearchHistory.FIND_HISTORY_KEY,
			StorageScope.WORKSPACE
		);

		if (!raw) {
			return;
		}

		try {
			let array: ISearchValue[] = JSON.parse(raw);
			array = array.slice(array.length - limit);
			this.storageService.store(
				FindWidgetSearchHistory.FIND_HISTORY_KEY,
				JSON.stringify(array),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
		} catch (e) {
			// Invalid data
		}
	}
}
