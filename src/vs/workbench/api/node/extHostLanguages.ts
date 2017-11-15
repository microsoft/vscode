/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { MainContext, MainThreadLanguagesShape, IMainContext } from './extHost.protocol';

export class ExtHostLanguages {

	private _proxy: MainThreadLanguagesShape;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.get(MainContext.MainThreadLanguages);
	}

	getLanguages(): TPromise<string[]> {
		return this._proxy.$getLanguages();
	}
}

