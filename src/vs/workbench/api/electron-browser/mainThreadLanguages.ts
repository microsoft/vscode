/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IPosition } from 'vs/editor/common/core/position';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MainThreadLanguagesShape } from '../node/extHost.protocol';
import URI from 'vs/base/common/uri';

export class MainThreadLanguages extends MainThreadLanguagesShape {

	private _modeService: IModeService;

	constructor(
		@IModeService modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		super();
		this._modeService = modeService;
	}

	$getLanguages(): TPromise<string[]> {
		return TPromise.as(this._modeService.getRegisteredModes());
	}

	$getLanguage(resource: URI, position?: IPosition): TPromise<string> {
		const model = this.modelService.getModel(resource);
		if (model) {
			return TPromise.as(position ? this._modeService.getLanguageIdentifier(model.getLanguageIdAtPosition(position.lineNumber, position.column)).language : model.getLanguageIdentifier().language);
		}
		return TPromise.as(this._modeService.getModeIdByFilenameOrFirstLine(resource.fsPath));
	}
}
