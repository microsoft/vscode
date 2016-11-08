/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, MainThreadLanguagesShape } from './extHost.protocol';

export class ExtHostLanguages {

	private _proxy: MainThreadLanguagesShape;

	constructor(
		threadService: IThreadService
	) {
		this._proxy = threadService.get(MainContext.MainThreadLanguages);
	}

	getLanguages(): TPromise<string[]> {
		return this._proxy.$getLanguages();
	}
}

