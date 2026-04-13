/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const IInlineChatHistoryService = createDecorator<IInlineChatHistoryService>('IInlineChatHistoryService');

export interface IInlineChatHistoryService {
	readonly _serviceBrand: undefined;

	addToHistory(value: string): void;
	previousValue(): string | undefined;
	nextValue(): string | undefined;
	isAtEnd(): boolean;
	replaceLast(value: string): void;
	resetCursor(): void;
}

const _storageKey = 'inlineChat.history';
const _capacity = 50;

export class InlineChatHistoryService extends Disposable implements IInlineChatHistoryService {
	declare readonly _serviceBrand: undefined;

	readonly #history: HistoryNavigator2<string>;
	readonly #storageService: IStorageService;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();

		this.#storageService = storageService;

		const raw = this.#storageService.get(_storageKey, StorageScope.PROFILE);
		let entries: string[] = [''];
		if (raw) {
			try {
				const parsed: string[] = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length > 0) {
					entries = parsed;
					// Ensure there's always an empty uncommitted entry at the end
					if (entries[entries.length - 1] !== '') {
						entries.push('');
					}
				}
			} catch {
				// ignore invalid data
			}
		}

		this.#history = new HistoryNavigator2<string>(entries, _capacity);

		this._store.add(this.#storageService.onWillSaveState(() => {
			this.#saveToStorage();
		}));
	}

	#saveToStorage(): void {
		const values = [...this.#history].filter(v => v.length > 0);
		if (values.length === 0) {
			this.#storageService.remove(_storageKey, StorageScope.PROFILE);
		} else {
			this.#storageService.store(_storageKey, JSON.stringify(values), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	addToHistory(value: string): void {
		this.#history.replaceLast(value);
		this.#history.add('');
	}

	previousValue(): string | undefined {
		return this.#history.previous();
	}

	nextValue(): string | undefined {
		return this.#history.next();
	}

	isAtEnd(): boolean {
		return this.#history.isAtEnd();
	}

	replaceLast(value: string): void {
		this.#history.replaceLast(value);
	}

	resetCursor(): void {
		this.#history.resetCursor();
	}
}
