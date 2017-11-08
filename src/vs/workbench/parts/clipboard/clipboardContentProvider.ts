/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';


export class ClipboardContentProvider implements ITextModelContentProvider {
	constructor(
		@IClipboardService private clipboardService: IClipboardService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService
	) { }

	provideTextContent(resource: URI): TPromise<IModel> {
		const model = this.modelService.createModel(this.clipboardService.readText(), this.modeService.getOrCreateMode('text/plain'), resource);
		return TPromise.as(model);
	}

}