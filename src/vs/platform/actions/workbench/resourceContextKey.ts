/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {IModeService} from 'vs/editor/common/services/modeService';

export default class ResourceContextKey implements IKeybindingContextKey<URI> {

	private _resourceKey: IKeybindingContextKey<URI>;
	private _schemeKey: IKeybindingContextKey<string>;
	private _langIdKey: IKeybindingContextKey<string>;

	constructor(
		@IKeybindingService keybindingService: IKeybindingService,
		@IModeService private _modeService: IModeService
	) {
		this._schemeKey = keybindingService.createKey('resourceScheme', undefined);
		this._langIdKey = keybindingService.createKey('resourceLangId', undefined);
		this._resourceKey = keybindingService.createKey('resource', undefined);
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