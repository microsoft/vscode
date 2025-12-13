/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { IHistory } from '../../../../base/common/history.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export class FindWidgetMRUHistory implements IHistory<string> {
	public static readonly FIND_HISTORY_KEY = 'workbench.find.history';
	private inMemoryValues: string[] = [];
	public onDidChange?: Event<string[]>;
	private _onDidChangeEmitter: Emitter<string[]>;

	private static _instance: FindWidgetMRUHistory | null = null;

	static getOrCreate(
		storageService: IStorageService,
	): FindWidgetMRUHistory {
		if (!FindWidgetMRUHistory._instance) {
			FindWidgetMRUHistory._instance = new FindWidgetMRUHistory(storageService);
		}
		return FindWidgetMRUHistory._instance;
	}

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		this._onDidChangeEmitter = new Emitter<string[]>();
		this.onDidChange = this._onDidChangeEmitter.event;
		this.load();
	}

	delete(t: string): boolean {
		const index = this.inMemoryValues.indexOf(t);
		if (index >= 0) {
			this.inMemoryValues.splice(index, 1);
			this.save();
			return true;
		}
		return false;
	}

	add(t: string): this {
		// Remove existing instance if present
		this.delete(t);
		// Add to front (most recent)
		this.inMemoryValues.unshift(t);
		this.save();
		return this;
	}

	has(t: string): boolean {
		return this.inMemoryValues.includes(t);
	}

	clear(): void {
		this.inMemoryValues = [];
		this.save();
	}

	forEach(callbackfn: (value: string, value2: string, set: Set<string>) => void, thisArg?: any): void {
		// fetch latest from storage
		this.load();
		// Convert to Set for compatibility with existing interface
		const asSet = new Set(this.inMemoryValues);
		return asSet.forEach(callbackfn, thisArg);
	}

	replace?(t: string[]): void {
		this.inMemoryValues = [...t];
		this.save();
	}

	/**
	 * Promotes an existing item to the most recent position
	 */
	promoteToMostRecent(t: string): boolean {
		const index = this.inMemoryValues.indexOf(t);
		if (index > 0) {
			// Remove from current position and add to front
			this.inMemoryValues.splice(index, 1);
			this.inMemoryValues.unshift(t);
			this.save();
			return true;
		}
		return false;
	}

	load() {
		let result: string[] | undefined;
		const raw = this.storageService.get(
			FindWidgetMRUHistory.FIND_HISTORY_KEY,
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
	}

	// Run saves async
	save(): Promise<void> {
		return new Promise<void>(resolve => {
			this.storageService.store(
				FindWidgetMRUHistory.FIND_HISTORY_KEY,
				JSON.stringify(this.inMemoryValues),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
			this._onDidChangeEmitter.fire(this.inMemoryValues);
			resolve();
		});
	}
}