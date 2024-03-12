/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

export class InlineChatHistory {
	private _promptHistory: string[] = [];
	private _historyOffset: number = -1;
	private _historyCandidate: string = '';

	constructor(
		private readonly _storageKey: string,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._promptHistory = JSON.parse(_storageService.get(this._storageKey, StorageScope.PROFILE, '[]'));
	}

	update(prompt: string): void {
		const idx = this._promptHistory.indexOf(prompt);
		if (idx >= 0) {
			this._promptHistory.splice(idx, 1);
		}
		this._promptHistory.unshift(prompt);
		this._historyOffset = -1;
		this._historyCandidate = '';
		this._storageService.store(this._storageKey, JSON.stringify(this._promptHistory), StorageScope.PROFILE, StorageTarget.USER);
	}

	clearCandidate() {
		this._historyOffset = -1;
		this._historyCandidate = '';
	}

	populateHistory(currentValue: string, up: boolean): undefined | string {
		const len = this._promptHistory.length;
		if (len === 0) {
			return undefined;
		}

		if (this._historyOffset === -1) {
			// remember the current value
			this._historyCandidate = currentValue;
		}

		const newIdx = this._historyOffset + (up ? 1 : -1);
		if (newIdx >= len) {
			// reached the end
			return undefined;
		}

		let entry: string;
		if (newIdx < 0) {
			entry = this._historyCandidate;
			this._historyOffset = -1;
		} else {
			entry = this._promptHistory[newIdx];
			this._historyOffset = newIdx;
		}

		return entry;
	}
}
