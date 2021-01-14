/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';


export const enum OutlineSortOrder {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineViewState {

	private _followCursor = false;
	private _filterOnType = true;
	private _sortBy = OutlineSortOrder.ByPosition;

	private readonly _onDidChange = new Emitter<{ followCursor?: boolean, sortBy?: boolean, filterOnType?: boolean }>();
	readonly onDidChange = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

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

	set sortBy(value: OutlineSortOrder) {
		if (value !== this._sortBy) {
			this._sortBy = value;
			this._onDidChange.fire({ sortBy: true });
		}
	}

	get sortBy(): OutlineSortOrder {
		return this._sortBy;
	}

	persist(storageService: IStorageService): void {
		storageService.store('outline/state', JSON.stringify({
			followCursor: this.followCursor,
			sortBy: this.sortBy,
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
		this.sortBy = data.sortBy ?? OutlineSortOrder.ByPosition;
		if (typeof data.filterOnType === 'boolean') {
			this.filterOnType = data.filterOnType;
		}
	}
}
