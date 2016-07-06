/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybinding';
import {IModeService} from 'vs/editor/common/services/modeService';

export class ResourceContextKey implements IKeybindingContextKey<URI> {

	static Scheme = 'resourceScheme';
	static LangId = 'resourceLangId';
	static Resource = 'resource';

	private _resourceKey: IKeybindingContextKey<URI>;
	private _schemeKey: IKeybindingContextKey<string>;
	private _langIdKey: IKeybindingContextKey<string>;

	constructor(
		@IKeybindingService keybindingService: IKeybindingService,
		@IModeService private _modeService: IModeService
	) {
		this._schemeKey = keybindingService.createKey(ResourceContextKey.Scheme, undefined);
		this._langIdKey = keybindingService.createKey(ResourceContextKey.LangId, undefined);
		this._resourceKey = keybindingService.createKey(ResourceContextKey.Resource, undefined);
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
}