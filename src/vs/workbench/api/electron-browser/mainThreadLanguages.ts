/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MainThreadLanguagesShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadLanguages)
export class MainThreadLanguages implements MainThreadLanguagesShape {

	private _modeService: IModeService;

	constructor(
		extHostContext: IExtHostContext,
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
	}

	public dispose(): void {
	}

	$getLanguages(): TPromise<string[]> {
		return TPromise.as(this._modeService.getRegisteredModes());
	}
}
