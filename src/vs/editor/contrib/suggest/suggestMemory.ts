/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICompletionItem } from 'vs/editor/contrib/suggest/completionModel';
import { LRUCache } from 'vs/base/common/map';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export class SuggestMemories {

	private readonly _storagePrefix = 'suggest/memories';
	private readonly _data = new Map<string, SuggestMemory>();

	constructor(
		@IStorageService private _storageService: IStorageService
	) {
		//
	}

	remember({ language }: LanguageIdentifier, item: ICompletionItem): void {
		let memory = this._data.get(language);
		if (!memory) {
			memory = new SuggestMemory();
			this._data.set(language, memory);
		}
		memory.remember(item);
		this._storageService.store(`${this._storagePrefix}/${language}`, JSON.stringify(memory), StorageScope.WORKSPACE);
	}

	select({ language }: LanguageIdentifier, items: ICompletionItem[]): number {
		let memory = this._data.get(language);
		if (!memory) {
			const key: string = `${this._storagePrefix}/${language}`;
			const raw = this._storageService.get(key, StorageScope.WORKSPACE);
			if (raw) {
				try {
					const tuples = <[string, MemoryItem][]>JSON.parse(raw);
					memory = new SuggestMemory(tuples);
				} catch (e) {
					this._storageService.remove(key, StorageScope.WORKSPACE);
				}
			}
		}
		if (memory) {
			return memory.select(items);
		} else {
			return 0;
		}
	}
}


export interface MemoryItem {
	type: string;
	insertText: string;
}

export class SuggestMemory {

	private readonly _memory = new LRUCache<string, MemoryItem>(400, 0.75);

	constructor(tuples?: [string, MemoryItem][]) {
		if (tuples) {
			for (const [word, item] of tuples) {
				this._memory.set(word, item);
			}
		}
	}

	remember(item: ICompletionItem): void {
		if (item.word) {
			this._memory.set(item.word, { insertText: item.suggestion.insertText, type: item.suggestion.type });
		}
	}

	select(items: ICompletionItem[]): number {
		for (let i = 0; i < items.length; i++) {
			if (items[i].word) {
				const item = this._memory.get(items[i].word);
				if (this._matches(item, items[i])) {
					return i;
				}
			}
		}
		return 0;
	}

	private _matches(item: MemoryItem, candidate: ICompletionItem): boolean {
		return item && item.insertText === candidate.suggestion.insertText && item.type === candidate.suggestion.type;
	}

	toJSON(): [string, MemoryItem][] {
		const tuples: [string, MemoryItem][] = [];
		this._memory.forEach((value, key) => tuples.push([key, value]));
		return tuples;
	}
}
