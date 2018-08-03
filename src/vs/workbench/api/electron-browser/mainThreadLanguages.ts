/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI, { UriComponents } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MainThreadLanguagesShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadLanguages)
export class MainThreadLanguages implements MainThreadLanguagesShape {

	private _modeService: IModeService;
	private _modelService: IModelService;

	constructor(
		extHostContext: IExtHostContext,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService
	) {
		this._modeService = modeService;
		this._modelService = modelService;
	}

	public dispose(): void {
	}

	$getLanguages(): TPromise<string[]> {
		return TPromise.as(this._modeService.getRegisteredModes());
	}

	$setLanguageById(resource: UriComponents, languageId: string): TPromise<void> {
		const uri = URI.revive(resource);
		let model = this._modelService.getModel(uri);
		if (!model) {
			return TPromise.wrapError(new Error('Invalid uri'));
		}
		let mode = this._modeService.getOrCreateModeByLanguageId(languageId);
		this._modelService.setMode(model, mode);
		return TPromise.as(null);
	}
}
