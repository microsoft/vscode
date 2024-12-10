/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { MutableObservableValue } from './observableValue.js';
import { StoredValue } from './storedValue.js';
import { InternalTestItem } from './testTypes.js';

export class TestExclusions extends Disposable {
	private readonly excluded = this._register(
		MutableObservableValue.stored(new StoredValue<ReadonlySet<string>>({
			key: 'excludedTestItems',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE,
			serialization: {
				deserialize: v => new Set(JSON.parse(v)),
				serialize: v => JSON.stringify([...v])
			},
		}, this.storageService), new Set())
	);

	constructor(@IStorageService private readonly storageService: IStorageService) {
		super();
	}

	/**
	 * Event that fires when the excluded tests change.
	 */
	public readonly onTestExclusionsChanged: Event<unknown> = this.excluded.onDidChange;

	/**
	 * Gets whether there's any excluded tests.
	 */
	public get hasAny() {
		return this.excluded.value.size > 0;
	}

	/**
	 * Gets all excluded tests.
	 */
	public get all(): Iterable<string> {
		return this.excluded.value;
	}

	/**
	 * Sets whether a test is excluded.
	 */
	public toggle(test: InternalTestItem, exclude?: boolean): void {
		if (exclude !== true && this.excluded.value.has(test.item.extId)) {
			this.excluded.value = new Set(Iterable.filter(this.excluded.value, e => e !== test.item.extId));
		} else if (exclude !== false && !this.excluded.value.has(test.item.extId)) {
			this.excluded.value = new Set([...this.excluded.value, test.item.extId]);
		}
	}

	/**
	 * Gets whether a test is excluded.
	 */
	public contains(test: InternalTestItem): boolean {
		return this.excluded.value.has(test.item.extId);
	}

	/**
	 * Removes all test exclusions.
	 */
	public clear(): void {
		this.excluded.value = new Set();
	}
}
