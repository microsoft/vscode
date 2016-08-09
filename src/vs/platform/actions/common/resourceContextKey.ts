/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {KbCtxKey, IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybinding';
import {IModeService} from 'vs/editor/common/services/modeService';

export class ResourceContextKey implements IKeybindingContextKey<URI> {


	static Scheme = new KbCtxKey<string>('resourceScheme', undefined);
	static LangId = new KbCtxKey<string>('resourceLangId', undefined);
	static Resource = new KbCtxKey<URI>('resource', undefined);

	private _resourceKey: IKeybindingContextKey<URI>;
	private _schemeKey: IKeybindingContextKey<string>;
	private _langIdKey: IKeybindingContextKey<string>;

	constructor(
		@IKeybindingService keybindingService: IKeybindingService,
		@IModeService private _modeService: IModeService
	) {
		this._schemeKey = ResourceContextKey.Scheme.bindTo(keybindingService);
		this._langIdKey = ResourceContextKey.LangId.bindTo(keybindingService);
		this._resourceKey = ResourceContextKey.Resource.bindTo(keybindingService);
	}

	set(value: URI) {
		this._resourceKey.set(value);
		this._schemeKey.set(value && value.scheme);
		this._langIdKey.set(value && this._modeService.getModeIdByFilenameOrFirstLine(value.fsPath));
	}

	reset(): void {
		this._schemeKey.reset();
		this._langIdKey.reset();
		this._resourceKey.reset();
	}

	public get(): URI {
		return this._resourceKey.get();
	}
}