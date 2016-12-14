/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { guessMimeTypes } from 'vs/base/common/mime';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { DEBUG_SCHEME, IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { Model } from 'vs/workbench/parts/debug/common/debugModel';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class DebugContentProvider implements IWorkbenchContribution, ITextModelContentProvider {

	constructor(
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IDebugService private debugService: IDebugService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		textModelResolverService.registerTextModelContentProvider(DEBUG_SCHEME, this);
	}

	public getId(): string {
		return 'debug.contentprovider';
	}

	public provideTextContent(resource: uri): TPromise<IModel> {
		const process = this.debugService.getViewModel().focusedProcess;
		if (!process) {
			return TPromise.as(null);
		}

		return process.session.source({ sourceReference: Source.getSourceReference(resource) }).then(response => {
			const mime = response.body.mimeType || guessMimeTypes(resource.toString())[0];
			const modePromise = this.modeService.getOrCreateMode(mime);

			return this.modelService.createModel(response.body.content, modePromise, resource);
		}, err => {
			(<Model>this.debugService.getModel()).sourceIsUnavailable(resource);
			return err;
		});
	}
}
