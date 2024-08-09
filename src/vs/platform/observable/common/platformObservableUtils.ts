/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { autorunOpts, IObservable, IReader, ISettableObservable, ITransaction, observableValue, transaction } from 'vs/base/common/observable';
import { observableFromEventOpts } from 'vs/base/common/observableInternal/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyValue, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

/** Creates an observable update when a configuration key updates. */
export function observableConfigValue<T>(key: string, defaultValue: T, configurationService: IConfigurationService): IObservable<T> {
	return observableFromEventOpts({ debugName: () => `Configuration Key "${key}"`, },
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key) ?? defaultValue
	);
}

/** Update the configuration key with a value derived from observables. */
export function bindContextKey<T extends ContextKeyValue>(key: RawContextKey<T>, service: IContextKeyService, computeValue: (reader: IReader) => T): IDisposable {
	const boundKey = key.bindTo(service);
	return autorunOpts({ debugName: () => `Set Context Key "${key.key}"` }, reader => {
		boundKey.set(computeValue(reader));
	});
}

export interface IStoredValueSerialization<T> {
	fromString(data: string): T;
	toString(data: T): string;
}

export interface IStoredObservableOptions<T> {
	key: string;
	scope: StorageScope;
	target: StorageTarget;
	defaultValue: T;
	/** If true, the state will not be transferred in 'continue on.' */
	localOnly?: boolean;
	/** If set, the data will always be considered 'dirty' and stored when requested. */
	isMutableData?: boolean;
	/**
	 * Serialization options for the stored value if you desire something other
	 * than the default JSON-stringify.
	 */
	serialization?: IStoredValueSerialization<T>;
}

const defaultSerialization: IStoredValueSerialization<any> = {
	fromString: d => JSON.parse(d),
	toString: d => JSON.stringify(d),
};

export const serializeMapAsObject: IStoredValueSerialization<Map<string, any>> = {
	fromString: d => new Map(Object.entries(JSON.parse(d))),
	toString: d => {
		const obj = Object.create(null);
		for (const [key, value] of d) {
			obj[key] = value;
		}
		return JSON.stringify(obj);
	},
};


/** Creates an observable that stores and retrieves its value using the storage service. */
export function storedObservable<T>(
	storageService: IStorageService,
	{ key, scope, target, defaultValue, localOnly = false, isMutableData = false, serialization = defaultSerialization }: IStoredObservableOptions<T>,
): IReference<ISettableObservable<T>> {
	const store = new DisposableStore();
	const defaultSerialized = serialization.toString(defaultValue);

	const readFromStorage = (): T => {
		const stored = storageService.get(key, scope, undefined);
		return stored === undefined ? defaultValue : serialization.fromString(stored);
	};

	// "Continue Working On" transfers applicable state by default
	// Ref: https://github.com/microsoft/vscode/issues/183449
	if ((target === StorageTarget.USER || scope === StorageScope.WORKSPACE) && !localOnly) {
		store.add(listenToStorageServiceChange(storageService, scope, (e, tx) => {
			if (e.external) {
				observable.set(readFromStorage(), tx);
			}
		}));
	}

	const observable = observableValue(key, readFromStorage());
	let dirty = isMutableData;

	store.add(storageService.onWillSaveState(() => {
		if (dirty) {
			const serialized = serialization.toString(observable.get());
			if (serialized === defaultSerialized) {
				storageService.remove(key, scope);
			} else {
				storageService.store(key, serialized, scope, target);
			}
			dirty = isMutableData;
		}
	}));

	if (!isMutableData) {
		observable.addObserver({
			beginUpdate() { },
			endUpdate() { },
			handlePossibleChange() { },
			handleChange() { dirty = true; }
		});
	}

	return { object: observable, dispose: () => store.dispose() };
}

const globalStorageListeners = new WeakMap<IStorageService, Map<StorageScope, {
	listeners: Set<(e: IStorageValueChangeEvent, tx: ITransaction) => void>;
	dispose: IDisposable;
}>>();

function listenToStorageServiceChange(s: IStorageService, scope: StorageScope, callback: (e: IStorageValueChangeEvent, tx: ITransaction) => void): IDisposable {
	let listenerMap = globalStorageListeners.get(s);
	if (!listenerMap) {
		listenerMap = new Map();
		globalStorageListeners.set(s, listenerMap);
	}

	let record = listenerMap.get(scope);
	if (!record) {
		const store = new DisposableStore();
		record = { listeners: new Set(), dispose: store };
		store.add(s.onDidChangeValue(scope, undefined, store)((e) => {
			transaction(tx => {
				for (const listener of record!.listeners) {
					listener(e, tx);
				}
			}, () => `storage update to ${e.key}`);
		}));

		listenerMap.set(scope, record);
	}

	record.listeners.add(callback);
	return toDisposable(() => {
		if (record.listeners.delete(callback) && record.listeners.size === 0) {
			record.dispose.dispose();
			listenerMap.delete(scope);
		}
	});
}
