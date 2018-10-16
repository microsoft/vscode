/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { MainThreadStorageShape, MainContext, IExtHostContext, ExtHostStorageShape, ExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IDisposable } from 'vs/base/common/lifecycle';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private _storageService: IStorageService;
	private _proxy: ExtHostStorageShape;
	private _storageListener: IDisposable;
	private _sharedStorageKeysToWatch: Map<string, boolean> = new Map<string, boolean>();

	constructor(
		extHostContext: IExtHostContext,
		@IStorageService storageService: IStorageService
	) {
		this._storageService = storageService;
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStorage);

		this._storageListener = this._storageService.onDidChangeStorage(e => {
			let shared = e.scope === StorageScope.GLOBAL;
			if (shared && this._sharedStorageKeysToWatch.has(e.key)) {
				let value = this._getValue(shared, e.key);
				if (value instanceof Error) {
					return; // ignore parsing errors that can happen
				}
				this._proxy.$acceptValue(shared, e.key, value);
			}
		});
	}

	dispose(): void {
		this._storageListener.dispose();
	}

	$getValue<T>(shared: boolean, key: string): Thenable<T> {
		if (shared) {
			this._sharedStorageKeysToWatch.set(key, true);
		}
		let value = this._getValue<T>(shared, key);
		if (value instanceof Error) {
			return Promise.reject(value);
		}
		return Promise.resolve(value);
	}

	private _getValue<T>(shared: boolean, key: string): T | Error {
		let jsonValue = this._storageService.get(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (!jsonValue) {
			return undefined;
		}
		let value: T;
		try {
			value = JSON.parse(jsonValue);
			return value;
		} catch (err) {
			return err;
		}
	}

	$setValue(shared: boolean, key: string, value: object): Thenable<void> {
		let jsonValue: string;
		try {
			jsonValue = JSON.stringify(value);
			this._storageService.store(key, jsonValue, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		} catch (err) {
			return Promise.reject(err);
		}
		return undefined;
	}
}
