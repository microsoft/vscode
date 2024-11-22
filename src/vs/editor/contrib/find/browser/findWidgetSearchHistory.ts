/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHistory } from '../../../../base/common/history.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';

export class FindWidgetSearchHistory implements IHistory<string> {
	private static readonly FIND_HISTORY_KEY = 'workbench.find.history';
	private readonly id: string;
	private inMemoryValues: Set<string> = new Set();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		codeEditor?: ICodeEditor,
	) {
		this.load();
		if (codeEditor) {
			this.id = `${FindWidgetSearchHistory.FIND_HISTORY_KEY}.${codeEditor.getId()}`;
			// The editor id could be re-used, so we need to clean the storage when it gets disposed
			codeEditor.onDidDispose(() => {
				this.clear();
			});
		} else {
			this.id = FindWidgetSearchHistory.FIND_HISTORY_KEY;
		}
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

	forEach(callbackfn: (value: string, value2: string, set: Set<string>) => void, thisArg?: any): void {
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
			this.id,
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
				this.id,
				JSON.stringify(elements),
				StorageScope.WORKSPACE,
				StorageTarget.USER,
			);
			resolve();
		});
	}
}
