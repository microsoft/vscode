/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IStorageService, StorageScope } from 'vs/platform/storage2/common/storage2';
import { MainThreadStorageShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private storageService: IStorageService;

	constructor(
		extHostContext: IExtHostContext,
		@IStorageService storageService: IStorageService
	) {
		this.storageService = storageService;
	}

	dispose(): void {
	}

	$getValue<T>(shared: boolean, key: string): Thenable<T> {
		let jsonValue = this.storageService.get(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (!jsonValue) {
			return TPromise.as(undefined);
		}
		let value: T;
		try {
			value = JSON.parse(jsonValue);
			return TPromise.as(value);
		} catch (err) {
			return TPromise.wrapError<T>(err);
		}
	}

	$setValue(shared: boolean, key: string, value: any): Thenable<void> {
		let jsonValue: any;
		try {
			jsonValue = JSON.stringify(value);
			this.storageService.set(key, jsonValue, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		} catch (err) {
			return TPromise.wrapError(err);
		}
		return undefined;
	}
}
