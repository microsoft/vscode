/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';

@Remotable.MainContext('MainThreadStorage')
export class MainThreadStorage {

	private _storageService: IStorageService;

	constructor( @IStorageService storageService: IStorageService) {
		this._storageService = storageService;
	}

	getValue<T>(shared: boolean, key: string): TPromise<T> {
		let jsonValue = this._storageService.get(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (!jsonValue) {
			return TPromise.as(undefined);
		}
		let value: T;
		try {
			value = JSON.parse(jsonValue);
			return TPromise.as(value);
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	setValue(shared: boolean, key: string, value: any): TPromise<any> {
		let jsonValue: any;
		try {
			jsonValue = JSON.stringify(value);
			this._storageService.store(key, jsonValue, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}
}

export class ExtHostStorage {

	private _proxy: MainThreadStorage;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadStorage);
	}

	getValue<T>(shared: boolean, key: string, defaultValue?: T): TPromise<T> {
		return this._proxy.getValue(shared, key).then(value => value || defaultValue);
	}

	setValue(shared: boolean, key: string, value: any): TPromise<void> {
		return this._proxy.setValue(shared, key, value);
	}
}