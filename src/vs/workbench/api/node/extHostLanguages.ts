/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import {Registry} from 'vs/platform/platform';
import {INullService} from 'vs/platform/instantiation/common/instantiation';

export class ExtHostLanguages {

	private _proxy: MainThreadLanguages;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadLanguages);
	}

	getLanguages(): TPromise<string[]> {
		return this._proxy._getLanguages();
	}
}

@Remotable.MainContext('MainThreadLanguages')
export class MainThreadLanguages {

	private _registry: IEditorModesRegistry;

	constructor(@INullService ns) {
		this._registry = Registry.as(Extensions.EditorModes);
	}

	_getLanguages(): TPromise<string[]> {
		return TPromise.as(this._registry.getRegisteredModes());
	}
}
