/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MainContext, MainThreadStorageShape, IMainContext } from './extHost.protocol';

export class ExtHostStorage {

	private _proxy: MainThreadStorageShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadStorage);
	}

	getValue<T>(shared: boolean, key: string, defaultValue?: T): Thenable<T> {
		return this._proxy.$getValue<T>(shared, key).then(value => value || defaultValue);
	}

	setValue(shared: boolean, key: string, value: any): Thenable<void> {
		return this._proxy.$setValue(shared, key, value);
	}
}
