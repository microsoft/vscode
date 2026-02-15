/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { IHistory } from '../../../../base/common/history.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export class ReplaceWidgetHistory implements IHistory<string> {
	public static readonly FIND_HISTORY_KEY = 'workbench.replace.history';
	private inMemoryValues: Set<string> = new Set();
	public onDidChange?: Event<string[]>;
	private _onDidChangeEmitter: Emitter<string[]>;

	private static _instance: ReplaceWidgetHistory | null = null;

	static getOrCreate(
		storageService: IStorageService,
	): ReplaceWidgetHistory {
		if (!ReplaceWidgetHistory._instance) {
			ReplaceWidgetHistory._instance = new ReplaceWidgetHistory(storageService);
		}
		return ReplaceWidgetHistory._instance;
	}

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		this._onDidChangeEmitter = new Emitter<string[]>();
		this.onDidChange = this._onDidChangeEmitter.event;
		this.load();
	}

	delete(t: string): boolean {
		const result = this.inMemoryValues.delete(t);
		this.save();
		return result;
	}

	add(t: string): this {
		this.inMemoryValues.add(t);
		this.save();
		return this;
	}

	has(t: string): boolean {
		return this.inMemoryValues.has(t);
	}

	clear(): void {
		this.inMemoryValues.clear();
		this.save();
	}

	forEach(callbackfn: (value: string, value2: string, set: Set<string>) => void, thisArg?: unknown): void {
		// fetch latest from storage
		this.load();
		return this.inMemoryValues.forEach(callbackfn);
	}
	replace?(t: string[]): void {
		this.inMemoryValues = new Set(t);
		this.save();
	}

	load() {
		let result: [] | undefined;
		const raw = this.storageService.get(
			ReplaceWidgetHistory.FIND_HISTORY_KEY,
			StorageScope.WORKSPACE
		);

		if (raw) {
			try {
				result = JSON.parse(raw);
			} catch (e) {
				// Invalid data
			}
		}

		this.inMemoryValues = new Set(result || []);
	}

	// Run saves async
	save(): Promise<void> {
		const elements: string[] = [];
		this.inMemoryValues.forEach(e => elements.push(e));
		return new Promise<void>(resolve => {
			this.storageService.store(
				ReplaceWidgetHistory.FIND_HISTORY_KEY,
				JSON.stringify(elements),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
			this._onDidChangeEmitter.fire(elements);
			resolve();
		});
	}
}
