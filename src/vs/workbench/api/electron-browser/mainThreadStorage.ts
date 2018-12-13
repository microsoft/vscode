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
				try {
					this._proxy.$acceptValue(shared, e.key, this._getValue(shared, e.key));
				} catch (error) {
					// ignore parsing errors that can happen
				}
			}
		});
	}

	dispose(): void {
		this._storageListener.dispose();
	}

	$getValue<T>(shared: boolean, key: string): Promise<T> {
		if (shared) {
			this._sharedStorageKeysToWatch.set(key, true);
		}
		try {
			return Promise.resolve(this._getValue<T>(shared, key));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private _getValue<T>(shared: boolean, key: string): T {
		let jsonValue = this._storageService.get(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (!jsonValue) {
			return undefined;
		}
		return JSON.parse(jsonValue);
	}

	$setValue(shared: boolean, key: string, value: object): Promise<void> {
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
