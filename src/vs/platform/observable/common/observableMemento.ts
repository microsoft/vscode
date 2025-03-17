/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEquals } from '../../../base/common/equals.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ObservableValue } from '../../../base/common/observableInternal/base.js';
import { DebugNameData } from '../../../base/common/observableInternal/debugName.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

interface IObservableMementoOpts<T> {
	defaultValue: T;
	key: string;
	/** Storage options, defaults to JSON storage if the defaultValue is an object */
	toStorage?: (value: T) => string;
	fromStorage?: (value: string) => T;
}

/**
 * Defines an observable memento. Returns a function that can be called with
 * the specific storage scope, target, and service to use in a class.
 *
 * Note that the returned Observable is a disposable, because it interacts
 * with storage service events, and must be tracked appropriately.
 */
export function observableMemento<T>(opts: IObservableMementoOpts<T>) {
	return (scope: StorageScope, target: StorageTarget, storageService: IStorageService): ObservableMemento<T> => {
		return new ObservableMemento<T>(opts, scope, target, storageService);
	};
}

/**
 * A value that is stored, and is also observable. Note: T should be readonly.
 */
export class ObservableMemento<T> extends ObservableValue<T> implements IDisposable {
	private readonly _store = new DisposableStore();
	private _didChange = false;

	constructor(
		opts: IObservableMementoOpts<T>,
		storageScope: StorageScope,
		storageTarget: StorageTarget,
		@IStorageService storageService: IStorageService,
	) {
		if (opts.defaultValue && typeof opts.defaultValue === 'object') {
			opts.toStorage ??= (value: T) => JSON.stringify(value);
			opts.fromStorage ??= (value: string) => JSON.parse(value);
		}

		let initialValue = opts.defaultValue;

		const fromStorage = storageService.get(opts.key, storageScope);
		if (fromStorage !== undefined) {
			if (opts.fromStorage) {
				try {
					initialValue = opts.fromStorage(fromStorage);
				} catch {
					initialValue = opts.defaultValue;
				}
			}
		}

		super(new DebugNameData(undefined, `storage/${opts.key}`, undefined), initialValue, strictEquals);

		const didChange = storageService.onDidChangeValue(storageScope, opts.key, this._store);
		// only take external changes if there aren't local changes we've made
		this._store.add(didChange((e) => {
			if (e.external && e.key === opts.key && !this._didChange) {
				this.set(opts.defaultValue, undefined);
			}
		}));

		this._store.add(storageService.onWillSaveState(() => {
			if (this._didChange) {
				this._didChange = false;
				const value = this.get();
				if (opts.toStorage) {
					storageService.store(opts.key, opts.toStorage(value), storageScope, storageTarget);
				} else {
					storageService.store(opts.key, String(value), storageScope, storageTarget);
				}
			}
		}));
	}

	protected override _setValue(newValue: T): void {
		super._setValue(newValue);
		this._didChange = true;
	}

	dispose(): void {
		this._store.dispose();
	}
}
