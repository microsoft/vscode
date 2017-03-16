/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { guessMimeTypes, MIME_TEXT } from 'vs/base/common/mime';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { DEBUG_SCHEME, IDebugService } from 'vs/workbench/parts/debug/common/debug';

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
			return TPromise.wrapError(localize('unable', "Unable to resolve the resource without a debug session"));
		}
		const source = process.sources.get(resource.toString());
		const rawSource = source ? source.raw : { path: paths.normalize(resource.fsPath, true) };

		return process.session.source({ sourceReference: source ? source.reference : undefined, source: rawSource }).then(response => {
			const mime = response.body.mimeType || guessMimeTypes(resource.toString())[0];
			const modePromise = this.modeService.getOrCreateMode(mime);
			const model = this.modelService.createModel(response.body.content, modePromise, resource);

			return model;
		}, (err: DebugProtocol.ErrorResponse) => {
			this.debugService.deemphasizeSource(resource);
			const modePromise = this.modeService.getOrCreateMode(MIME_TEXT);
			const model = this.modelService.createModel(err.message, modePromise, resource);

			return model;
		});
	}
}
