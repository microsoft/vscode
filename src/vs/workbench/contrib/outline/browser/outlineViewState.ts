/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

export class OutlineViewState {

	private _followCursor = false;
	private _filterOnType = true;

	private readonly _onDidChange = new Emitter<{ followCursor?: boolean; sortBy?: boolean; filterOnType?: boolean; }>();
	readonly onDidChange = this._onDidChange.event;

	set followCursor(value: boolean) {
		if (value !== this._followCursor) {
			this._followCursor = value;
			this._onDidChange.fire({ followCursor: true });
		}
	}

	get followCursor(): boolean {
		return this._followCursor;
	}

	get filterOnType() {
		return this._filterOnType;
	}

	set filterOnType(value) {
		if (value !== this._filterOnType) {
			this._filterOnType = value;
			this._onDidChange.fire({ filterOnType: true });
		}
	}

	persist(storageService: IStorageService): void {
		storageService.store('outline/state', JSON.stringify({
			followCursor: this.followCursor,
			filterOnType: this.filterOnType,
		}), StorageScope.WORKSPACE, StorageTarget.USER);
	}

	restore(storageService: IStorageService): void {
		let raw = storageService.get('outline/state', StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		let data: any;
		try {
			data = JSON.parse(raw);
		} catch (e) {
			return;
		}
		this.followCursor = data.followCursor;
		if (typeof data.filterOnType === 'boolean') {
			this.filterOnType = data.filterOnType;
		}
	}
}
