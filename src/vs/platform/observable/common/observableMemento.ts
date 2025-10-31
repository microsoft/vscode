/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEquals } from '../../../base/common/equals.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { DebugLocation } from '../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { DebugNameData } from '../../../base/common/observableInternal/debugName.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { ObservableValue } from '../../../base/common/observableInternal/observables/observableValue.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

interface IObservableMementoOpts<T> {
	defaultValue: T;
	key: string;
	toStorage: (value: T) => string;
	fromStorage: (value: string) => T;
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
	private _noStorageUpdateNeeded = false;

	constructor(
		private readonly opts: IObservableMementoOpts<T>,
		private readonly storageScope: StorageScope,
		private readonly storageTarget: StorageTarget,
		@IStorageService private readonly storageService: IStorageService,
	) {
		const getStorageValue = (): T => {
			const fromStorage = storageService.get(opts.key, storageScope);
			if (fromStorage !== undefined) {
				try {
					return opts.fromStorage(fromStorage);
				} catch {
					return opts.defaultValue;
				}
			}
			return opts.defaultValue;
		};

		const initialValue = getStorageValue();
		super(new DebugNameData(undefined, `storage/${opts.key}`, undefined), initialValue, strictEquals, DebugLocation.ofCaller());

		const didChange = storageService.onDidChangeValue(storageScope, opts.key, this._store);
		this._store.add(didChange((e) => {
			if (e.external && e.key === opts.key) {
				this._noStorageUpdateNeeded = true;
				try {
					this.set(getStorageValue(), undefined);
				} finally {
					this._noStorageUpdateNeeded = false;
				}
			}
		}));
	}

	protected override _setValue(newValue: T): void {
		super._setValue(newValue);
		if (this._noStorageUpdateNeeded) {
			return;
		}
		const valueToStore = this.opts.toStorage(this.get());
		this.storageService.store(this.opts.key, valueToStore, this.storageScope, this.storageTarget);
	}

	dispose(): void {
		this._store.dispose();
	}
}
