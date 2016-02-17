/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IModeService} from 'vs/editor/common/services/modeService';

export class ExtHostLanguages {

	private _proxy: MainThreadLanguages;

	constructor(
		@IThreadService threadService: IThreadService
	) {
		this._proxy = threadService.getRemotable(MainThreadLanguages);
	}

	getLanguages(): TPromise<string[]> {
		return this._proxy._getLanguages();
	}
}

@Remotable.MainContext('MainThreadLanguages')
export class MainThreadLanguages {

	private _modeService: IModeService;

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
	}

	_getLanguages(): TPromise<string[]> {
		return TPromise.as(this._modeService.getRegisteredModes());
	}
}
