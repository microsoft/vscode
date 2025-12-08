/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

export interface IStoredValueSerialization<T> {
	deserialize(data: string): T;
	serialize(data: T): string;
}

const defaultSerialization: IStoredValueSerialization<any> = {
	deserialize: d => JSON.parse(d),
	serialize: d => JSON.stringify(d),
};

interface IStoredValueOptions<T> {
	key: string;
	scope: StorageScope;
	target: StorageTarget;
	serialization?: IStoredValueSerialization<T>;
}

/**
 * todo@connor4312: is this worthy to be in common?
 */
export class StoredValue<T> extends Disposable {
	private readonly serialization: IStoredValueSerialization<T>;
	private readonly key: string;
	private readonly scope: StorageScope;
	private readonly target: StorageTarget;
	private value?: T;

	/**
	 * Emitted whenever the value is updated or deleted.
	 */
	public readonly onDidChange: Event<IStorageValueChangeEvent>;

	constructor(
		options: IStoredValueOptions<T>,
		@IStorageService private readonly storage: IStorageService,
	) {
		super();

		this.key = options.key;
		this.scope = options.scope;
		this.target = options.target;
		this.serialization = options.serialization ?? defaultSerialization;
		this.onDidChange = this.storage.onDidChangeValue(this.scope, this.key, this._register(new DisposableStore()));
	}

	/**
	 * Reads the value, returning the undefined if it's not set.
	 */
	public get(): T | undefined;

	/**
	 * Reads the value, returning the default value if it's not set.
	 */
	public get(defaultValue: T): T;

	public get(defaultValue?: T): T | undefined {
		if (this.value === undefined) {
			const value = this.storage.get(this.key, this.scope);
			this.value = value === undefined ? defaultValue : this.serialization.deserialize(value);
		}

		return this.value;
	}

	/**
	 * Persists changes to the value.
	 * @param value
	 */
	public store(value: T) {
		this.value = value;
		this.storage.store(this.key, this.serialization.serialize(value), this.scope, this.target);
	}

	/**
	 * Delete an element stored under the provided key from storage.
	 */
	public delete() {
		this.storage.remove(this.key, this.scope);
	}
}
