/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MainThreadLanguagesShape } from '../node/extHost.protocol';

export class MainThreadLanguages extends MainThreadLanguagesShape {

	private _modeService: IModeService;

	constructor(
		@IModeService modeService: IModeService
	) {
		super();
		this._modeService = modeService;
	}

	$getLanguages(): TPromise<string[]> {
		return TPromise.as(this._modeService.getRegisteredModes());
	}
}
