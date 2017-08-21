/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { MainThreadDiaglogsShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from "vs/workbench/api/electron-browser/extHostCustomers";
import { IWindowService } from "vs/platform/windows/common/windows";

@extHostNamedCustomer(MainContext.MainThreadDialogs)
export class MainThreadDialogs implements MainThreadDiaglogsShape {

	constructor(
		context: IExtHostContext,
		@IWindowService private readonly _windowService: IWindowService
	) {
		//
	}

	dispose(): void {
		//
	}

	$showOpenDialog(): TPromise<string[]> {
		return new TPromise<string[]>(resolve => {
			this._windowService.showOpenDialog({

			}, filenames => {
				// TODO@joh what about remote dev setup?
				resolve(isFalsyOrEmpty(filenames) ? undefined : filenames);
			});
		});
	}
}
